// import { createClient } from "@supabase/supabase-js";
import { cors, corsOptions } from "@/lib/api-helpers";
import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@clerk/backend";
import { getSupabaseClient, getUserByClerkId } from "@/lib/user-sync";
import { resolvePawaPayConfig } from "@/lib/pawapay-config";
import { getMoveInPaymentBreakdown } from "@/lib/move-in-payment";
import {
  ALLOWED_CORRESPONDENT_CODES,
  getCorrespondent,
} from "@/lib/payment-providers";
import { normalizePhone } from "@/lib/phone";
import {
  extractPaymentFailure,
  isUncertainPaymentInitiationFailure,
  paymentFailureMessage,
} from "@/lib/payment-failures";
import { queuePaymentFailureNotification } from "@/lib/payment-failure-notifications";

// Use service role for reading config
//const supabaseAdmin = createClient(
//  process.env.NEXT_PUBLIC_SUPABASE_URL!,
//  process.env.SUPABASE_SERVICE_ROLE_KEY!
//);

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

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: propertyId } = await params;

    // 1. Verify Clerk Token
    const auth = req.headers.get("authorization") ?? "";
    const token = auth.replace("Bearer ", "");
    if (!token) {
      return cors(
        NextResponse.json({ error: "Missing token" }, { status: 401 }),
      );
    }

    let clerkUserId: string | undefined;
    try {
      const { sub } = await verifyToken(token, {
        secretKey: process.env.CLERK_SECRET_KEY!,
      });
      clerkUserId = sub;
    } catch (error) {
      console.error("Token verification failed:", error);
      return cors(
        NextResponse.json({ error: "Invalid token" }, { status: 401 }),
      );
    }

    if (!clerkUserId) {
      return cors(
        NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      );
    }

    // 2. Get User from Supabase
    const user = await getUserByClerkId(clerkUserId);
    if (!user) {
      return cors(
        NextResponse.json({ error: "User not found" }, { status: 404 }),
      );
    }

    // 3. Parse Body
    const body = await req.json();
    const {
      phoneNumber,
      correspondent: correspondentCode,
      provider: legacyProvider,
      preAuthorisationCode,
    } = body;

    if (!phoneNumber || (!correspondentCode && !legacyProvider)) {
      return cors(
        NextResponse.json(
          { error: "Missing required fields" },
          { status: 400 },
        ),
      );
    }

    // Resolve correspondent — new clients send `correspondent`, legacy send `provider`
    const resolvedCorrespondentCode: string =
      correspondentCode ??
      (legacyProvider === "ORANGE_MONEY" ? "ORANGE_BFA" : "MOOV_BFA");

    if (!ALLOWED_CORRESPONDENT_CODES.has(resolvedCorrespondentCode)) {
      return cors(
        NextResponse.json(
          { error: "Opérateur de paiement non reconnu" },
          { status: 400 },
        ),
      );
    }

    const correspondentConfig = getCorrespondent(resolvedCorrespondentCode);

    if (correspondentConfig?.requiresPreAuth && !preAuthorisationCode) {
      return cors(
        NextResponse.json(
          { error: "Un code d'autorisation est requis pour ce réseau" },
          { status: 400 },
        ),
      );
    }

    const supabase = getSupabaseClient();

    // 4. Validate Property Eligibility (Status must be 'en_ligne')
    const { data: property, error: propError } = await supabase
      .from("properties")
      .select("price, caution_mois, loyer_avance_mois, status")
      .eq("id", propertyId)
      .single();

    if (propError || !property) {
      return cors(
        NextResponse.json({ error: "Property not found" }, { status: 404 }),
      );
    }

    if (property.status !== "en_ligne") {
      return cors(
        NextResponse.json(
          {
            error: "This property is not available for direct payment",
          },
          { status: 400 },
        ),
      );
    }

    // 5. Calculate Payment Amount: caution + configured advance rent months
    const breakdown = getMoveInPaymentBreakdown({
      monthlyRent: property.price,
      cautionMois: property.caution_mois,
      loyerAvanceMois: property.loyer_avance_mois,
    });
    const paymentAmount = breakdown.totalAmount;

    // 6. Create Transaction Record
    const depositId = crypto.randomUUID();
    const currency = "XOF";

    const payerClientCode = resolvedCorrespondentCode;
    const transactionMetadata = {
      monthlyRent: breakdown.monthlyRent,
      cautionMois: breakdown.cautionMois,
      loyerAvanceMois: breakdown.loyerAvanceMois,
      cautionAmount: breakdown.cautionAmount,
      advanceRentAmount: breakdown.advanceRentAmount,
      totalMoveInAmount: breakdown.totalAmount,
    };

    // Persist the same normalized MSISDN sent to PawaPay.
    let formattedPhone = (phoneNumber as string).replace(/\s/g, "");
    const countryIso = correspondentConfig?.countryIso ?? "BF";
    if (formattedPhone.length <= 8) {
      const e164 = normalizePhone(formattedPhone, countryIso);
      formattedPhone = (e164 ?? formattedPhone).replace(/^\+/, "");
    }

    const { data: transactionRecord, error: dbError } = await supabase
      .from("transactions")
      .insert({
        deposit_id: depositId,
        amount: paymentAmount,
        currency: currency,
        status: "pending",
        type: "property_lock",
        provider: payerClientCode,
        user_id: user.id,
        property_id: propertyId,
        payer_phone: formattedPhone,
        metadata: transactionMetadata,
      })
      .select("id")
      .single();

    if (dbError || !transactionRecord) {
      console.error("Database insertion error:", dbError);
      return cors(
        NextResponse.json(
          { error: "Failed to initialize transaction" },
          { status: 500 },
        ),
      );
    }

    // 7. Call PawaPay API
    const pawaPayConfig = resolvePawaPayConfig();
    if (!pawaPayConfig.url) {
      console.error("PAWAPAY_URL not configured");
      return cors(
        NextResponse.json(
          { error: "Server configuration error" },
          { status: 500 },
        ),
      );
    }
    const pawaUrl = pawaPayConfig.url;
    const pawaToken = pawaPayConfig.token;

    if (!pawaToken) {
      return cors(
        NextResponse.json(
          { error: "Server configuration error" },
          { status: 500 },
        ),
      );
    }

    const customerMessage = "Roogo Payment".slice(0, 22);

    const payload: PawaPayDepositPayload = {
      depositId,
      payer: {
        type: "MMO",
        accountDetails: {
          phoneNumber: formattedPhone,
          provider: payerClientCode,
        },
      },
      amount: paymentAmount.toString(),
      currency,
      customerMessage,
    };

    if (preAuthorisationCode) {
      payload.preAuthorisationCode = preAuthorisationCode;
    }

    let response: Response;
    let responseText: string;
    try {
      response = await fetch(`${pawaUrl}/v2/deposits`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${pawaToken}`,
        },
        body: JSON.stringify(payload),
      });
      responseText = await response.text();
    } catch (error) {
      console.error("Lock initiation response uncertain:", error);
      return cors(
        NextResponse.json(
          {
            success: true,
            depositId,
            status: "PENDING",
            raw: { status: "PENDING", depositId },
          },
          { status: 202 },
        ),
      );
    }

    let result;
    try {
      result = JSON.parse(responseText);
    } catch {
      result = { message: responseText };
    }

    if (!response.ok) {
      const failure = extractPaymentFailure(result);
      if (isUncertainPaymentInitiationFailure(response.status, result)) {
        return cors(
          NextResponse.json(
            { success: true, depositId, status: "PENDING" },
            { status: 202 },
          ),
        );
      }
      const { data: failureUpdated, error: failureUpdateError } = await supabase
        .from("transactions")
        .update({
          status: "failed",
          failure_code: failure.code,
          failure_reason: failure.providerMessage,
          metadata: { ...transactionMetadata, pawapay: result },
        })
        .eq("deposit_id", depositId)
        .eq("status", "pending")
        .select("id");

      if (failureUpdateError || !failureUpdated?.length) {
        console.error(
          "Failed to persist lock payment failure:",
          failureUpdateError,
        );
        return cors(
          NextResponse.json(
            {
              success: true,
              depositId,
              status: "PENDING",
              raw: { status: "PENDING", depositId },
            },
            { status: 202 },
          ),
        );
      }

      const errorMessage = paymentFailureMessage(failure.code, "fr");

      queuePaymentFailureNotification({
        depositId,
        failureCode: failure.code,
        payerPhone: formattedPhone,
        userId: user.id,
        transactionId: transactionRecord.id,
        transactionType: "property_lock",
        propertyId,
      });

      return cors(
        NextResponse.json(
          {
            error: errorMessage,
            failureCode: failure.code,
          },
          { status: response.status },
        ),
      );
    }

    const immediateStatus = String(result.status || "").toUpperCase();
    if (
      immediateStatus === "FAILED" ||
      immediateStatus === "CANCELLED" ||
      immediateStatus === "REJECTED"
    ) {
      const failure = extractPaymentFailure(result);
      const { data: failureUpdated, error: failureUpdateError } = await supabase
        .from("transactions")
        .update({
          status: "failed",
          failure_code: failure.code,
          failure_reason: failure.providerMessage,
          metadata: { ...transactionMetadata, pawapay: result },
        })
        .eq("deposit_id", depositId)
        .eq("status", "pending")
        .select("id");

      if (failureUpdateError || !failureUpdated?.length) {
        console.error(
          "Failed to persist lock payment failure:",
          failureUpdateError,
        );
        return cors(
          NextResponse.json(
            {
              success: true,
              depositId,
              status: "PENDING",
              raw: { status: "PENDING", depositId },
            },
            { status: 202 },
          ),
        );
      }

      queuePaymentFailureNotification({
        depositId,
        failureCode: failure.code,
        payerPhone: formattedPhone,
        userId: user.id,
        transactionId: transactionRecord.id,
        transactionType: "property_lock",
        propertyId,
      });

      return cors(
        NextResponse.json(
          {
            success: false,
            depositId,
            status: immediateStatus,
            error: paymentFailureMessage(failure.code, "fr"),
            failureCode: failure.code,
          },
          { status: 422 },
        ),
      );
    }

    if (immediateStatus === "COMPLETED") {
      const { data: completionUpdated, error: completionUpdateError } =
        await supabase
          .from("transactions")
          .update({
            status: "completed",
            metadata: { ...transactionMetadata, pawapay: result },
            updated_at: new Date().toISOString(),
          })
          .eq("deposit_id", depositId)
          .eq("status", "pending")
          .select("id");

      if (completionUpdateError) {
        console.error(
          "Failed to persist completed lock payment:",
          completionUpdateError,
        );
        return cors(
          NextResponse.json(
            {
              success: true,
              depositId,
              status: "PENDING",
              raw: { status: "PENDING", depositId },
            },
            { status: 202 },
          ),
        );
      }

      if (!completionUpdated?.length) {
        const { data: current, error: currentError } = await supabase
          .from("transactions")
          .select("status, failure_code")
          .eq("deposit_id", depositId)
          .single();

        if (currentError || current?.status !== "completed") {
          if (current?.status === "failed") {
            const failureCode = current.failure_code || "UNSPECIFIED_FAILURE";
            return cors(
              NextResponse.json(
                {
                  success: false,
                  depositId,
                  status: "FAILED",
                  error: paymentFailureMessage(failureCode, "fr"),
                  failureCode,
                },
                { status: 422 },
              ),
            );
          }
          return cors(
            NextResponse.json(
              {
                success: true,
                depositId,
                status: "PENDING",
                raw: { status: "PENDING", depositId },
              },
              { status: 202 },
            ),
          );
        }
      }

      const { error: lockError } = await supabase
        .from("properties")
        .update({ status: "locked" })
        .eq("id", propertyId);

      if (lockError) {
        console.error("Failed to finalize property lock:", lockError);
        return cors(
          NextResponse.json(
            {
              success: true,
              depositId,
              status: "PENDING",
              raw: { status: "PENDING", depositId },
            },
            { status: 202 },
          ),
        );
      }
    }

    return cors(
      NextResponse.json({
        success: true,
        depositId: result.depositId || depositId,
        status: result.status || "PENDING",
        raw: {
          status: result.status || "PENDING",
          depositId: result.depositId || depositId,
        },
      }),
    );
  } catch (error: unknown) {
    console.error("Lock initiation error:", error);
    return cors(
      NextResponse.json(
        { error: error instanceof Error ? error.message : String(error) },
        { status: 500 },
      ),
    );
  }
}
