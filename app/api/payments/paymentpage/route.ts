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

// Schema for Payment Page request
const paymentPageSchema = z.object({
  amount: z.number().positive(),
  description: z.string().min(1),
  transactionType: z.enum(["listing_submission", "property_lock", "boost", "photography"]),
  propertyId: z.string().optional(),
  tier_id: z.string().optional(),
  add_ons: z.array(z.string()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

export async function POST(req: Request) {
  const requestId = crypto.randomUUID().slice(0, 8);
  const log = (step: string, data: Record<string, unknown> = {}) => {
    console.log(JSON.stringify({ 
      route: "POST /api/payments/paymentpage", 
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
      metadata,
    } = validatedData;

    log("request-validated", { 
      amount, 
      transactionType, 
      propertyId,
      tier_id 
    });

    // 5. Create Transaction Record in Supabase (Pending)
    const depositId = crypto.randomUUID();
    const currency = "XOF";
    const supabase = getSupabaseClient();

    // Payment Page provider is selected on pawaPay UI; store web source now, then enrich to web_orange/web_moov later
    const provider = "web_pending"; 

    const { error: dbError } = await supabase.from("transactions").insert({
      deposit_id: depositId,
      amount: amount,
      currency: currency,
      status: "pending",
      type: transactionType,
      provider: provider,
      user_id: user.id,
      property_id: propertyId || null,
      metadata: {
        ...(metadata || {}),
        tier_id,
        add_ons,
        description,
        source: "payment_page"
      },
    });

    if (dbError) {
      log("db-insert-failed", { 
        error: String(dbError), 
        depositId,
        userId: user.id
      });
      return errorResponse("Failed to initialize transaction", 500, req);
    }

    log("transaction-created", { depositId, amount });

    await captureServerEvent(user.id, "payment_initiated", {
      deposit_id: depositId,
      amount,
      currency,
      transaction_type: transactionType,
      provider,
      property_id: propertyId || null,
      tier_id: tier_id || null,
      source: "payment_page",
    });

    // 6. Call PawaPay Payment Page API
    const pawaUrlBase = process.env.PAWAPAY_URL;
    if (!pawaUrlBase) {
      log("error", { error: "PAWAPAY_URL not configured" });
      return errorResponse("Server configuration error", 500, req);
    }
    const pawaUrl = pawaUrlBase.replace(/\/+$/, "");
    const pawaToken = process.env.PAWAPAY_API_TOKEN?.trim();

    if (!pawaToken) {
      log("error", { error: "PAWAPAY_API_TOKEN not configured" });
      return errorResponse("Server configuration error", 500, req);
    }

    const explicitReturnUrl = process.env.PAWAPAY_PAYMENTPAGE_RETURN_URL?.trim();
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.roogobf.com";
    const fallbackReturnUrl = `${baseUrl.replace(/\/+$/, "")}/payments/callback`;

    let validatedExplicitReturnUrl: string | null = null;
    if (explicitReturnUrl) {
      try {
        const parsed = new URL(explicitReturnUrl);
        const isHttps = parsed.protocol === "https:";
        const host = parsed.hostname.toLowerCase();
        const isLocalHost = host === "localhost" || host === "127.0.0.1";
        validatedExplicitReturnUrl = isHttps && !isLocalHost ? explicitReturnUrl : null;
      } catch {
        validatedExplicitReturnUrl = null;
      }
    }

    const returnUrl = validatedExplicitReturnUrl || fallbackReturnUrl;

    const payload = {
      depositId,
      returnUrl,
      amountDetails: {
        amount: amount.toString(),
        currency,
      },
      country: "BFA",
      language: "FR",
      reason: (description || "Roogo Payment").slice(0, 50).replace(/[^a-zA-Z0-9\s]/g, ""),
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
      result: JSON.stringify(result).slice(0, 500)
    });

    if (!response.ok) {
      log("pawapay-error", { 
        depositId, 
        httpStatus: response.status, 
        result 
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
          metadata: { ...(metadata || {}), ...result },
        })
        .eq("deposit_id", depositId);

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
          { status: response.status }
        ),
        req
      );
    }

    // Success
    return cors(
      NextResponse.json({
        success: true,
        redirectUrl: result.redirectUrl,
        depositId: depositId,
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
