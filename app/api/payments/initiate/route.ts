import { NextResponse } from "next/server";
import { verifyToken, createClerkClient } from "@clerk/backend";
import {
  ClerkUserData,
  getSupabaseClient,
  getUserByClerkId,
  createUserInSupabase,
} from "@/lib/user-sync";
import { cors, corsOptions, safeError, errorResponse } from "@/lib/api-helpers";
import { paymentInitiateSchema } from "@/lib/validations";
import { checkRateLimit, paymentLimiter } from "@/lib/rate-limit";
import { BOOST_DURATION_DAYS } from "@/lib/constants";
import { captureServerEvent } from "@/lib/posthog-server";
import { getMoveInPaymentBreakdown } from "@/lib/move-in-payment";
import { resolvePawaPayConfig } from "@/lib/pawapay-config";
import {
  creditOwnerEarningForSchedule,
  normalizePawaPayProvider,
} from "@/lib/owner-wallet";
import {
  computeJournalierPricing,
  nightsBetween,
  type CautionType,
} from "@/lib/journalier-pricing";
import {
  applyReferralToQuote,
  buildReferralMetadata,
  computeListingSubmissionQuote,
  createPendingReferralRedemption,
  normalizeReferralCode,
  ReferralValidationError,
  validateReferralForUser,
  voidPendingReferralForTransaction,
} from "@/lib/referrals";

interface PawaPayDepositPayload {
  depositId: string;
  payer: {
    type: "MMO";
    accountDetails: {
      phoneNumber: string;
      provider: string;
    };
  };
  amount: string;
  currency: string;
  customerMessage: string;
  preAuthorisationCode?: string;
}

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

export async function POST(req: Request) {
  const requestId = crypto.randomUUID().slice(0, 8);
  const log = (step: string, data: Record<string, unknown> = {}) => {
    console.log(
      JSON.stringify({
        route: "POST /api/payments/initiate",
        requestId,
        step,
        ...data,
        timestamp: new Date().toISOString(),
      }),
    );
  };

  try {
    log("request-received");

    // 1. Verify Clerk Token
    const auth = req.headers.get("authorization") ?? "";
    const token = auth.replace("Bearer ", "");
    if (!token) {
      log("error", { error: "Missing token" });
      return errorResponse("Missing token", 401, req);
    }

    let clerkUserId: string | undefined;
    try {
      const { sub } = await verifyToken(token, {
        secretKey: process.env.CLERK_SECRET_KEY!,
      });
      clerkUserId = sub;
      log("auth-verified", { clerkUserId });
    } catch (error) {
      log("auth-failed", { error: String(error) });
      return errorResponse("Invalid token", 401, req);
    }

    if (!clerkUserId) {
      log("error", { error: "No clerkUserId after verification" });
      return errorResponse("Unauthorized", 401, req);
    }

    // 2. Rate limiting
    const { success: rateLimitOk, headers: rateLimitHeaders } =
      await checkRateLimit(paymentLimiter, clerkUserId);

    if (!rateLimitOk) {
      log("rate-limited", { clerkUserId });
      const response = errorResponse(
        "Too many payment requests. Please try again later.",
        429,
        req,
      );
      rateLimitHeaders.forEach((value, key) => {
        response.headers.set(key, value);
      });
      return response;
    }

    // 3. Get User from Supabase
    let user = await getUserByClerkId(clerkUserId);

    // Auto-sync if user missing
    if (!user) {
      log("user-not-found-syncing", { clerkUserId });
      try {
        const clerkClient = createClerkClient({
          secretKey: process.env.CLERK_SECRET_KEY,
        });
        const clerkUser = await clerkClient.users.getUser(clerkUserId);

        const userData: ClerkUserData = {
          id: clerkUser.id,
          email_addresses: clerkUser.emailAddresses.map((e) => ({
            email_address: e.emailAddress,
          })),
          first_name: clerkUser.firstName || undefined,
          last_name: clerkUser.lastName || undefined,
          image_url: clerkUser.imageUrl,
          phone_numbers: clerkUser.phoneNumbers.map((p) => ({
            phone_number: p.phoneNumber,
          })),
          public_metadata:
            clerkUser.publicMetadata as ClerkUserData["public_metadata"],
          private_metadata:
            clerkUser.privateMetadata as ClerkUserData["private_metadata"],
        };

        user = await createUserInSupabase(userData);
        log("user-synced", { userId: user?.id });
      } catch (syncError: unknown) {
        log("user-sync-failed", { error: String(syncError) });
        return errorResponse(
          "User not found. Please try signing in again.",
          404,
          req,
        );
      }
    }

    if (!user) {
      log("error", { error: "User still null after sync" });
      return errorResponse("User not found in database", 404, req);
    }

    log("user-resolved", { userId: user.id });

    // 4. Parse and validate body
    const body = await req.json();

    let validatedData;
    try {
      validatedData = paymentInitiateSchema.parse(body);
    } catch (validationError) {
      log("validation-failed", { error: String(validationError), body });
      return errorResponse("Invalid request data", 400, req);
    }

    const {
      amount,
      phoneNumber,
      provider,
      description,
      transactionType,
      propertyId,
      preAuthorisationCode,
      metadata,
    } = validatedData;

    log("request-validated", {
      amount,
      phoneNumber: phoneNumber.slice(0, 4) + "****",
      provider,
      transactionType,
      propertyId,
      hasOTP: !!preAuthorisationCode,
    });

    // Validation for Orange Burkina Faso which requires a pre-authorisation code
    if (provider === "ORANGE_MONEY" && !preAuthorisationCode) {
      log("error", { error: "Missing OTP for Orange Money" });
      return errorResponse(
        "Un code d'autorisation est requis pour Orange Money",
        400,
        req,
      );
    }

    // 5. Create Transaction Record in Supabase (Pending)
    const depositId = crypto.randomUUID();
    const currency = "XOF";
    const supabase = getSupabaseClient();
    let resolvedAmount = amount;
    let resolvedMetadata: Record<string, unknown> = metadata || {};
    let appliedReferral = null as ReturnType<typeof applyReferralToQuote> | null;

    if (transactionType === "property_lock" && propertyId) {
      const { data: propertyRecord, error: propertyError } = await supabase
        .from("properties")
        .select(
          "price, caution_mois, loyer_avance_mois, period, caution_type, caution_valeur",
        )
        .eq("id", propertyId)
        .maybeSingle();

      if (propertyError || !propertyRecord) {
        return errorResponse("Property not found", 404, req);
      }

      if (propertyRecord.period !== "day") {
        const breakdown = getMoveInPaymentBreakdown({
          monthlyRent: propertyRecord.price,
          cautionMois: propertyRecord.caution_mois,
          loyerAvanceMois: propertyRecord.loyer_avance_mois,
        });
        resolvedAmount = breakdown.totalAmount;
        resolvedMetadata = {
          ...resolvedMetadata,
          monthlyRent: breakdown.monthlyRent,
          cautionMois: breakdown.cautionMois,
          loyerAvanceMois: breakdown.loyerAvanceMois,
          cautionAmount: breakdown.cautionAmount,
          advanceRentAmount: breakdown.advanceRentAmount,
          totalMoveInAmount: breakdown.totalAmount,
        };
      } else {
        // Daily stay. New flow opts in by sending startDate/endDate — server
        // then recomputes stay cost + caution so the client can't forge the
        // caution amount. Legacy callers without dates keep the client-sent
        // amount and skip escrow (no deposit_holds row will be created).
        const meta = (metadata || {}) as Record<string, unknown>;
        const startDate =
          typeof meta.startDate === "string" ? meta.startDate : null;
        const endDate = typeof meta.endDate === "string" ? meta.endDate : null;

        if (startDate && endDate) {
          const nights = nightsBetween(startDate, endDate);
          if (nights <= 0) {
            return errorResponse(
              "Booking must span at least one night",
              400,
              req,
            );
          }

          const { data: listingConfig, error: listingConfigError } =
            await supabase
              .from("listing_config")
              .select("daily_owner_commission_percentage")
              .eq("id", "default")
              .single();

          const dailyOwnerCommissionPercentage = Number(
            listingConfig?.daily_owner_commission_percentage,
          );

          if (
            listingConfigError ||
            !Number.isFinite(dailyOwnerCommissionPercentage)
          ) {
            console.error(
              "Daily owner commission config missing:",
              listingConfigError,
            );
            return errorResponse(
              "Daily owner commission is not configured",
              500,
              req,
            );
          }

          const breakdown = computeJournalierPricing({
            nightlyRate: propertyRecord.price,
            nights,
            cautionType: propertyRecord.caution_type as CautionType,
            cautionValeur: propertyRecord.caution_valeur,
            ownerCommissionPercentage: dailyOwnerCommissionPercentage,
          });

          const payoutPhoneRaw =
            typeof meta.payoutPhone === "string" ? meta.payoutPhone : null;
          const payoutProviderRaw =
            typeof meta.payoutProvider === "string"
              ? meta.payoutProvider
              : null;
          const payoutProvider = payoutProviderRaw
            ? normalizePawaPayProvider(payoutProviderRaw)
            : null;

          if (breakdown.cautionAmount > 0) {
            if (!payoutPhoneRaw || !payoutProvider) {
              return errorResponse(
                "payoutPhone and payoutProvider are required for bookings with a caution",
                400,
                req,
              );
            }
          }

          resolvedAmount = breakdown.totalAmount;
          resolvedMetadata = {
            ...resolvedMetadata,
            startDate,
            endDate,
            nights: breakdown.nights,
            nightlyRate: breakdown.nightlyRate,
            stayAmount: breakdown.stayAmount,
            originalCautionAmount: breakdown.originalCautionAmount,
            cautionAmount: breakdown.cautionAmount,
            cautionCapAmount: breakdown.cautionCapAmount,
            cautionType: breakdown.cautionType,
            cautionValeur: breakdown.cautionValeur,
            renterServiceFeeBps: breakdown.renterServiceFeeBps,
            renterServiceFeeAmount: breakdown.renterServiceFeeAmount,
            ownerCommissionBps: breakdown.ownerCommissionBps,
            ownerCommissionAmount: breakdown.ownerCommissionAmount,
            ownerNetAmount: breakdown.ownerNetAmount,
            totalCollectedAmount: breakdown.totalAmount,
            payoutPhone: payoutPhoneRaw || null,
            payoutProvider: payoutProvider || null,
          };
        }
      }
    }

    if (transactionType === "listing_submission") {
      const meta = (metadata || {}) as Record<string, unknown>;
      const listingQuote = await computeListingSubmissionQuote(supabase, {
        tierId:
          typeof meta.tier_id === "string"
            ? meta.tier_id
            : typeof meta.tierId === "string"
              ? meta.tierId
              : null,
        addOns: Array.isArray(meta.add_ons)
          ? meta.add_ons.filter((item): item is string => typeof item === "string")
          : undefined,
        frequence: typeof meta.frequence === "string" ? meta.frequence : "mensuel",
        monthlyRent:
          typeof meta.monthlyRent === "number"
            ? meta.monthlyRent
            : typeof meta.rentAmount === "number"
              ? meta.rentAmount
              : null,
      });
      resolvedAmount = listingQuote.originalAmount;
      const referralCode = normalizeReferralCode(meta.referralCode);

      if (referralCode && listingQuote.originalAmount > 0) {
        const profile = await validateReferralForUser(supabase, {
          code: referralCode,
          referredUserId: user.id,
          referredUserType: user.user_type,
        });
        appliedReferral = applyReferralToQuote(listingQuote, profile);
        resolvedAmount = appliedReferral.paidAmount;
      }

      resolvedMetadata = {
        ...resolvedMetadata,
        ...buildReferralMetadata(appliedReferral),
        originalClientAmount: amount,
        serverOriginalAmount: listingQuote.originalAmount,
        serverPaidAmount: resolvedAmount,
        addOnsTotal: listingQuote.addOnsTotal,
        listingCommissionAmount: listingQuote.commissionAmount,
        publicationFeeAmount: listingQuote.baseFee,
      };
    }

    // Map provider to PawaPay v2 format
    let payerClientCode: string = provider;
    if (provider === "ORANGE_MONEY") payerClientCode = "ORANGE_BFA";
    if (provider === "MOOV_MONEY") payerClientCode = "MOOV_BFA";

    const { data: transactionRecord, error: dbError } = await supabase
      .from("transactions")
      .insert({
        deposit_id: depositId,
        amount: resolvedAmount,
        currency: currency,
        status: "pending",
        type: transactionType,
        provider: payerClientCode,
        user_id: user.id,
        property_id: propertyId || null,
        payer_phone: phoneNumber,
        otp_code: preAuthorisationCode || null,
        metadata: resolvedMetadata,
      })
      .select("id")
      .single();

    if (dbError) {
      log("db-insert-failed", {
        error: String(dbError),
        depositId,
        errorCode: dbError.code,
        errorDetails: dbError.details,
        errorHint: dbError.hint,
        errorMessage: dbError.message,
        userId: user.id,
        amount: resolvedAmount,
        provider: payerClientCode,
      });
      return errorResponse("Failed to initialize transaction", 500, req);
    }

    if (transactionRecord?.id) {
      await createPendingReferralRedemption(supabase, {
        referral: appliedReferral,
        referredUserId: user.id,
        transactionId: transactionRecord.id,
      });
    }

    log("transaction-created", {
      depositId,
      provider: payerClientCode,
      amount: resolvedAmount,
    });

    await captureServerEvent(user.id, "payment_initiated", {
      deposit_id: depositId,
      amount: resolvedAmount,
      currency,
      transaction_type: transactionType,
      provider: payerClientCode,
      property_id: propertyId || null,
      has_otp: !!preAuthorisationCode,
    });

    // 6. Call PawaPay API
    const pawaPayConfig = resolvePawaPayConfig();
    const pawaUrl = pawaPayConfig.url;
    const pawaToken = pawaPayConfig.token;

    log("pawapay-config", {
      environment: pawaPayConfig.environment,
      url: pawaUrl,
    });

    // Format phone number
    let formattedPhone = phoneNumber.replace(/\s/g, "");
    if (formattedPhone.length === 9 && formattedPhone.startsWith("0")) {
      formattedPhone = formattedPhone.substring(1);
    }
    formattedPhone = "226" + formattedPhone.slice(0, 8);

    const pawaProvider =
      provider === "ORANGE_MONEY" ? "ORANGE_BFA" : "MOOV_BFA";
    const customerMessage = preAuthorisationCode
      ? `${preAuthorisationCode} ${(description || "Roogo Payment").replace(/[^a-zA-Z0-9\s]/g, "")}`.slice(
          0,
          22,
        )
      : (description || "Roogo Payment")
          .replace(/[^a-zA-Z0-9\s]/g, "")
          .slice(0, 22);

    const payload: PawaPayDepositPayload = {
      depositId,
      payer: {
        type: "MMO",
        accountDetails: {
          phoneNumber: formattedPhone,
          provider: pawaProvider,
        },
      },
      amount: resolvedAmount.toString(),
      currency,
      customerMessage,
    };

    if (preAuthorisationCode) {
      payload.preAuthorisationCode = preAuthorisationCode;
    }

    log("pawapay-request", {
      url: `${pawaUrl}/v2/deposits`,
      depositId,
      formattedPhone: formattedPhone.slice(0, 6) + "****",
      pawaProvider,
      amount: resolvedAmount.toString(),
      hasOTP: !!preAuthorisationCode,
    });

    const response = await fetch(`${pawaUrl}/v2/deposits`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${pawaToken}`,
      },
      body: JSON.stringify(payload),
    });

    const responseText = await response.text();
    let result;
    try {
      result = JSON.parse(responseText);
    } catch {
      result = { message: responseText };
    }

    log("pawapay-response", {
      httpStatus: response.status,
      ok: response.ok,
      depositId,
      pawaPayStatus: result.status,
      resultKeys: Object.keys(result),
      result: JSON.stringify(result).slice(0, 500),
    });

    if (!response.ok) {
      log("pawapay-error", {
        depositId,
        httpStatus: response.status,
        result,
      });

      // Extract detailed failure information from PawaPay response
      let detailedFailure = result.message || "API call failed";
      if (result.details?.failureReason) {
        const fr = result.details.failureReason;
        detailedFailure = `${fr.failureCode || "ERROR"}: ${fr.failureMessage || result.message || "Unknown error"}`;
      } else if (result.details?.errorMessage) {
        detailedFailure = result.details.errorMessage;
      }

      await getSupabaseClient()
        .from("transactions")
        .update({
          status: "failed",
          failure_reason: detailedFailure,
          metadata: { ...resolvedMetadata, ...result },
        })
        .eq("deposit_id", depositId);

      if (transactionRecord?.id) {
        await voidPendingReferralForTransaction(supabase, transactionRecord.id);
      }

      const failureReason = result.details?.failureReason;
      const errorMessage =
        failureReason?.failureMessage ||
        result.details?.errorMessage ||
        result.error ||
        "Payment initiation failed";

      await captureServerEvent(user.id, "payment_failed", {
        deposit_id: depositId,
        amount: resolvedAmount,
        currency,
        transaction_type: transactionType,
        provider: payerClientCode,
        property_id: propertyId || null,
        failure_reason: errorMessage,
      });

      return cors(
        NextResponse.json(
          {
            error: errorMessage,
            details: result,
            failureCode: failureReason?.failureCode,
          },
          { status: response.status },
        ),
        req,
      );
    }

    // 7. Update status only if PawaPay COMPLETED immediately
    // Note: ACCEPTED just means queued, not confirmed - must poll for final status
    if (result.status === "COMPLETED") {
      log("immediate-completion", { depositId });
      await supabase
        .from("transactions")
        .update({
          status: "completed",
          metadata: { ...resolvedMetadata, ...result },
          updated_at: new Date().toISOString(),
        })
        .eq("deposit_id", depositId);

      await captureServerEvent(user.id, "payment_completed", {
        deposit_id: depositId,
        amount: resolvedAmount,
        currency,
        transaction_type: transactionType,
        provider: payerClientCode,
        property_id: propertyId || null,
        source: "initiate_immediate",
      });

      // Post-payment logic for immediate completion
      if (transactionType === "boost" && propertyId) {
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + BOOST_DURATION_DAYS);

        await supabase
          .from("properties")
          .update({
            is_boosted: true,
            boost_expires_at: expiresAt.toISOString(),
          })
          .eq("id", propertyId);
      } else if (transactionType === "rent_payment" && metadata) {
        const scheduleId = (metadata as Record<string, unknown>)?.scheduleId as
          | string
          | undefined;
        if (scheduleId) {
          const { data: completedTransaction } = await supabase
            .from("transactions")
            .select("id")
            .eq("deposit_id", depositId)
            .maybeSingle();

          await supabase
            .from("rent_schedules")
            .update({
              status: "paid",
              transaction_id: completedTransaction?.id ?? depositId,
              paid_at: new Date().toISOString(),
            })
            .eq("id", scheduleId);

          await creditOwnerEarningForSchedule(scheduleId);
        }
      }
    }

    log("success", {
      depositId: result.depositId || depositId,
      finalStatus: result.status || "PENDING",
    });

    return cors(
      NextResponse.json({
        success: true,
        depositId: result.depositId || depositId,
        status: result.status || "PENDING",
        raw: result,
      }),
      req,
    );
  } catch (error: unknown) {
    log("unhandled-error", {
      error: String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    if (error instanceof ReferralValidationError) {
      return errorResponse(error.message, error.status, req);
    }
    return errorResponse(
      safeError(error, "Payment initiation failed"),
      500,
      req,
    );
  }
}
