import { NextResponse } from "next/server";
import { verifyToken, createClerkClient } from "@clerk/backend";
import {
  ClerkUserData,
  getSupabaseClient,
  getUserByClerkId,
  createUserInSupabase,
} from "@/lib/user-sync";
import { cors, corsOptions, safeError, errorResponse } from "@/lib/api-helpers";
import { checkRateLimit, paymentLimiter } from "@/lib/rate-limit";
import { z } from "zod";
import { captureServerEvent } from "@/lib/posthog-server";
import { resolvePawaPayConfig } from "@/lib/pawapay-config";
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

// Valid PawaPay 3-letter country codes for payment page
const VALID_PAYMENT_PAGE_COUNTRIES = ["BFA", "CIV", "SEN"] as const;
type PaymentPageCountry = (typeof VALID_PAYMENT_PAGE_COUNTRIES)[number];

// Schema for Payment Page request
const paymentPageSchema = z.object({
  amount: z.number().positive(),
  description: z.string().min(1),
  transactionType: z.enum([
    "listing_submission",
    "property_lock",
    "boost",
    "photography",
  ]),
  propertyId: z.string().optional(),
  tier_id: z.string().optional(),
  add_ons: z.array(z.string()).optional(),
  referralCode: z.string().optional(),
  /** ISO 3-letter country code for PawaPay payment page; defaults to "BFA" */
  country: z.enum(VALID_PAYMENT_PAGE_COUNTRIES).optional(),
  /** App locale; used for the PawaPay payment page language ("fr" → "FR", "en" → "EN") */
  locale: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

export async function POST(req: Request) {
  const requestId = crypto.randomUUID().slice(0, 8);
  const log = (step: string, data: Record<string, unknown> = {}) => {
    console.log(
      JSON.stringify({
        route: "POST /api/payments/paymentpage",
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

    // Verify user type (owner, agent, staff, founder)
    const allowedTypes = ["owner", "agent", "staff", "founder"];
    if (!allowedTypes.includes(user.user_type)) {
      log("unauthorized-user-type", { userType: user.user_type });
      return errorResponse("Unauthorized user type", 403, req);
    }

    log("user-resolved", { userId: user.id, userType: user.user_type });

    // 4. Parse and validate body
    const body = await req.json();

    let validatedData;
    try {
      validatedData = paymentPageSchema.parse(body);
    } catch (validationError) {
      log("validation-failed", { error: String(validationError), body });
      return errorResponse("Invalid request data", 400, req);
    }

    const {
      amount,
      description,
      transactionType,
      propertyId,
      tier_id,
      add_ons,
      referralCode,
      country: requestedCountry,
      locale: requestedLocale,
      metadata,
    } = validatedData;

    const pawaPayCountry: PaymentPageCountry = requestedCountry ?? "BFA";
    const resolvedMetadata: Record<string, unknown> = metadata || {};
    const supabase = getSupabaseClient();
    const normalizedReferralCode = normalizeReferralCode(
      referralCode || resolvedMetadata.referralCode,
    );

    let resolvedAmount = amount;
    let appliedReferral = null as ReturnType<
      typeof applyReferralToQuote
    > | null;
    let listingQuote = null as Awaited<
      ReturnType<typeof computeListingSubmissionQuote>
    > | null;

    if (transactionType === "listing_submission") {
      listingQuote = await computeListingSubmissionQuote(supabase, {
        tierId: tier_id || (resolvedMetadata.tier_id as string | undefined),
        addOns: add_ons || (resolvedMetadata.add_ons as string[] | undefined),
        frequence:
          typeof resolvedMetadata.frequence === "string"
            ? resolvedMetadata.frequence
            : "mensuel",
        monthlyRent:
          typeof resolvedMetadata.monthlyRent === "number"
            ? resolvedMetadata.monthlyRent
            : typeof resolvedMetadata.rentAmount === "number"
              ? resolvedMetadata.rentAmount
              : null,
      });
      resolvedAmount = listingQuote.originalAmount;

      if (normalizedReferralCode && listingQuote.originalAmount > 0) {
        const profile = await validateReferralForUser(supabase, {
          code: normalizedReferralCode,
          referredUserId: user.id,
          referredUserType: user.user_type,
        });
        appliedReferral = applyReferralToQuote(listingQuote, profile);
        resolvedAmount = appliedReferral.paidAmount;
      }
    }

    if (transactionType === "property_lock" && propertyId) {
      const { data: propertyRecord, error: propertyError } = await supabase
        .from("properties")
        .select("period")
        .eq("id", propertyId)
        .maybeSingle();

      if (propertyError || !propertyRecord) {
        return errorResponse("Property not found", 404, req);
      }

      if (propertyRecord.period === "day") {
        return errorResponse(
          "Daily rentals require an approved booking request before payment",
          400,
          req,
        );
      }
    }

    log("request-validated", {
      amount: resolvedAmount,
      transactionType,
      propertyId,
      tier_id,
    });

    // 5. Create Transaction Record in Supabase (Pending)
    const depositId = crypto.randomUUID();
    const currency = "XOF";

    // Payment Page provider is selected on pawaPay UI; store web source now, then enrich to web_orange/web_moov later
    const provider = "web_pending";
    const transactionMetadata = {
      ...resolvedMetadata,
      ...buildReferralMetadata(appliedReferral),
      originalClientAmount: amount,
      serverOriginalAmount: listingQuote?.originalAmount ?? resolvedAmount,
      serverPaidAmount: resolvedAmount,
      tier_id,
      add_ons,
      description,
      source: "payment_page",
    };

    const { data: transactionRecord, error: dbError } = await supabase
      .from("transactions")
      .insert({
        deposit_id: depositId,
        amount: resolvedAmount,
        currency: currency,
        status: "pending",
        type: transactionType,
        provider: provider,
        user_id: user.id,
        property_id: propertyId || null,
        metadata: transactionMetadata,
      })
      .select("id")
      .single();

    if (dbError) {
      log("db-insert-failed", {
        error: String(dbError),
        depositId,
        userId: user.id,
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

    log("transaction-created", { depositId, amount: resolvedAmount });

    await captureServerEvent(user.id, "payment_initiated", {
      deposit_id: depositId,
      amount: resolvedAmount,
      currency,
      transaction_type: transactionType,
      provider,
      property_id: propertyId || null,
      tier_id: tier_id || null,
      source: "payment_page",
    });

    // 6. Call PawaPay Payment Page API
    const pawaPayConfig = resolvePawaPayConfig();
    const pawaUrl = pawaPayConfig.url;
    const pawaToken = pawaPayConfig.token;

    log("pawapay-config", {
      environment: pawaPayConfig.environment,
      url: pawaUrl,
    });

    const explicitReturnUrl =
      process.env.PAWAPAY_PAYMENTPAGE_RETURN_URL?.trim();
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL || "https://www.roogobf.com";
    const fallbackReturnUrl = `${baseUrl.replace(/\/+$/, "")}/payments/callback`;

    let validatedExplicitReturnUrl: string | null = null;
    if (explicitReturnUrl) {
      try {
        const parsed = new URL(explicitReturnUrl);
        const isHttps = parsed.protocol === "https:";
        const host = parsed.hostname.toLowerCase();
        const isLocalHost = host === "localhost" || host === "127.0.0.1";
        validatedExplicitReturnUrl =
          isHttps && !isLocalHost ? explicitReturnUrl : null;
      } catch {
        validatedExplicitReturnUrl = null;
      }
    }

    const returnUrl = validatedExplicitReturnUrl || fallbackReturnUrl;

    const payload = {
      depositId,
      returnUrl,
      amountDetails: {
        amount: resolvedAmount.toString(),
        currency,
      },
      country: pawaPayCountry,
      language: requestedLocale?.toUpperCase() === "EN" ? "EN" : "FR",
      reason: (description || "Roogo Payment")
        .slice(0, 50)
        .replace(/[^a-zA-Z0-9\s]/g, ""),
    };

    log("pawapay-request", {
      url: `${pawaUrl}/v2/paymentpage`,
      depositId,
      payloadKeys: Object.keys(payload),
      hasAmountDetails: true,
      amount: payload.amountDetails.amount,
      currency: payload.amountDetails.currency,
    });

    const response = await fetch(`${pawaUrl}/v2/paymentpage`, {
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
      result: JSON.stringify(result).slice(0, 500),
    });

    if (!response.ok) {
      log("pawapay-error", {
        depositId,
        httpStatus: response.status,
        result,
      });

      const failureMessage =
        typeof result?.failureReason?.failureMessage === "string"
          ? result.failureReason.failureMessage
          : typeof result?.message === "string"
            ? result.message
            : "Payment page creation failed";

      await getSupabaseClient()
        .from("transactions")
        .update({
          status: "failed",
          failure_reason: failureMessage,
          metadata: { ...transactionMetadata, pawapay: result },
        })
        .eq("deposit_id", depositId);

      if (transactionRecord?.id) {
        await voidPendingReferralForTransaction(supabase, transactionRecord.id);
      }

      await captureServerEvent(user.id, "payment_failed", {
        deposit_id: depositId,
        amount,
        currency,
        transaction_type: transactionType,
        provider,
        property_id: propertyId || null,
        failure_reason: failureMessage,
        source: "payment_page",
      });

      return cors(
        NextResponse.json(
          { error: failureMessage, details: result },
          { status: response.status },
        ),
        req,
      );
    }

    // Success
    return cors(
      NextResponse.json({
        success: true,
        redirectUrl: result.redirectUrl,
        depositId: depositId,
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
