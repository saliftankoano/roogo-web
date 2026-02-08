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
    console.log(JSON.stringify({ 
      route: "POST /api/payments/initiate", 
      requestId, 
      step, 
      ...data, 
      timestamp: new Date().toISOString() 
    }));
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
    const { success: rateLimitOk, headers: rateLimitHeaders } = await checkRateLimit(
      paymentLimiter,
      clerkUserId
    );

    if (!rateLimitOk) {
      log("rate-limited", { clerkUserId });
      const response = errorResponse("Too many payment requests. Please try again later.", 429, req);
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
          public_metadata: clerkUser.publicMetadata as ClerkUserData["public_metadata"],
          private_metadata: clerkUser.privateMetadata as ClerkUserData["private_metadata"],
        };

        user = await createUserInSupabase(userData);
        log("user-synced", { userId: user?.id });
      } catch (syncError: unknown) {
        log("user-sync-failed", { error: String(syncError) });
        return errorResponse(
          "User not found. Please try signing in again.",
          404,
          req
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
      hasOTP: !!preAuthorisationCode 
    });

    // Validation for Orange Burkina Faso which requires a pre-authorisation code
    if (provider === "ORANGE_MONEY" && !preAuthorisationCode) {
      log("error", { error: "Missing OTP for Orange Money" });
      return errorResponse(
        "Un code d'autorisation est requis pour Orange Money",
        400,
        req
      );
    }

    // 5. Create Transaction Record in Supabase (Pending)
    const depositId = crypto.randomUUID();
    const currency = "XOF";
    const supabase = getSupabaseClient();

    // Map provider to PawaPay v2 format
    let payerClientCode: string = provider;
    if (provider === "ORANGE_MONEY") payerClientCode = "ORANGE_BFA";
    if (provider === "MOOV_MONEY") payerClientCode = "MOOV_BFA";

    const { error: dbError } = await supabase.from("transactions").insert({
      deposit_id: depositId,
      amount: amount,
      currency: currency,
      status: "pending",
      type: transactionType,
      provider: payerClientCode,
      user_id: user.id,
      property_id: propertyId || null,
      payer_phone: phoneNumber,
      metadata: metadata || {},
    });

    if (dbError) {
      log("db-insert-failed", { error: String(dbError), depositId });
      return errorResponse("Failed to initialize transaction", 500, req);
    }

    log("transaction-created", { depositId, provider: payerClientCode, amount });

    // 6. Call PawaPay API
    const pawaUrlBase = process.env.PAWAPAY_URL || "https://api.sandbox.pawapay.io";
    const pawaUrl = pawaUrlBase.replace(/\/+$/, "");
    const pawaToken = process.env.PAWAPAY_API_TOKEN?.trim();

    if (!pawaToken) {
      log("error", { error: "PAWAPAY_API_TOKEN not configured" });
      return errorResponse("Server configuration error", 500, req);
    }

    // Format phone number
    let formattedPhone = phoneNumber.replace(/\s/g, "");
    if (formattedPhone.length === 9 && formattedPhone.startsWith("0")) {
      formattedPhone = formattedPhone.substring(1);
    }
    formattedPhone = "226" + formattedPhone.slice(0, 8);

    const pawaProvider = provider === "ORANGE_MONEY" ? "ORANGE_BFA" : "MOOV_BFA";
    const customerMessage = (description || "Roogo Payment")
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
      amount: amount.toString(),
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
      amount: amount.toString(),
      hasOTP: !!preAuthorisationCode
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
      result: JSON.stringify(result).slice(0, 500)
    });

    if (!response.ok) {
      log("pawapay-error", { 
        depositId, 
        httpStatus: response.status, 
        result 
      });

      await getSupabaseClient()
        .from("transactions")
        .update({
          status: "failed",
          failure_reason: result.message || "API call failed",
          metadata: { ...(metadata || {}), ...result },
        })
        .eq("deposit_id", depositId);

      const failureReason = result.details?.failureReason;
      const errorMessage =
        failureReason?.failureMessage ||
        result.details?.errorMessage ||
        result.error ||
        "Payment initiation failed";

      return cors(
        NextResponse.json(
          { error: errorMessage, details: result, failureCode: failureReason?.failureCode },
          { status: response.status }
        ),
        req
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
          metadata: { ...(metadata || {}), ...result },
          updated_at: new Date().toISOString(),
        })
        .eq("deposit_id", depositId);

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
      }
    }

    log("success", { 
      depositId: result.depositId || depositId, 
      finalStatus: result.status || "PENDING" 
    });

    return cors(
      NextResponse.json({
        success: true,
        depositId: result.depositId || depositId,
        status: result.status || "PENDING",
        raw: result,
      }),
      req
    );
  } catch (error: unknown) {
    log("unhandled-error", { error: String(error), stack: error instanceof Error ? error.stack : undefined });
    return errorResponse(
      safeError(error, "Payment initiation failed"),
      500,
      req
    );
  }
}
