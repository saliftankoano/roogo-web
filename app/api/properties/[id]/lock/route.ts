// import { createClient } from "@supabase/supabase-js";
import { cors, corsOptions } from "@/lib/api-helpers";
import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@clerk/backend";
import { getSupabaseClient, getUserByClerkId } from "@/lib/user-sync";
import { resolvePawaPayConfig } from "@/lib/pawapay-config";

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
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: propertyId } = await params;

    // 1. Verify Clerk Token
    const auth = req.headers.get("authorization") ?? "";
    const token = auth.replace("Bearer ", "");
    if (!token) {
      return cors(
        NextResponse.json({ error: "Missing token" }, { status: 401 })
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
        NextResponse.json({ error: "Invalid token" }, { status: 401 })
      );
    }

    if (!clerkUserId) {
      return cors(
        NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      );
    }

    // 2. Get User from Supabase
    const user = await getUserByClerkId(clerkUserId);
    if (!user) {
      return cors(
        NextResponse.json({ error: "User not found" }, { status: 404 })
      );
    }

    // 3. Parse Body
    const body = await req.json();
    const { phoneNumber, provider, preAuthorisationCode } = body;

    if (!phoneNumber || !provider) {
      return cors(
        NextResponse.json({ error: "Missing required fields" }, { status: 400 })
      );
    }

    const supabase = getSupabaseClient();

    // 4. Validate Property Eligibility (Status must be 'en_ligne')
    const { data: property, error: propError } = await supabase
      .from("properties")
      .select("price, deposit, status")
      .eq("id", propertyId)
      .single();

    if (propError || !property) {
      return cors(
        NextResponse.json({ error: "Property not found" }, { status: 404 })
      );
    }

    if (property.status !== "en_ligne") {
      return cors(
        NextResponse.json(
          {
            error: "This property is not available for direct payment",
          },
          { status: 400 }
        )
      );
    }

    if (!property.deposit) {
      return cors(
        NextResponse.json(
          { error: "Property deposit information is missing" },
          { status: 400 }
        )
      );
    }

    // 5. Calculate Payment Amount: (deposit_months * rent) + rent
    const rentAmount = Number(property.price);
    const depositMonths = Number(property.deposit);
    const paymentAmount = depositMonths * rentAmount + rentAmount;

    // 6. Create Transaction Record
    const depositId = crypto.randomUUID();
    const currency = "XOF";

    let payerClientCode = provider;
    if (provider === "ORANGE_MONEY") payerClientCode = "ORANGE_BFA";
    if (provider === "MOOV_MONEY") payerClientCode = "MOOV_BFA";

    const { error: dbError } = await supabase.from("transactions").insert({
      deposit_id: depositId,
      amount: paymentAmount,
      currency: currency,
      status: "pending",
      type: "property_lock",
      provider: payerClientCode,
      user_id: user.id,
      property_id: propertyId,
      payer_phone: phoneNumber,
    });

    if (dbError) {
      console.error("Database insertion error:", dbError);
      return cors(
        NextResponse.json(
          { error: "Failed to initialize transaction" },
          { status: 500 }
        )
      );
    }

    // 7. Call PawaPay API
    const pawaPayConfig = resolvePawaPayConfig();
    if (!pawaPayConfig.url) {
      console.error("PAWAPAY_URL not configured");
      return cors(
        NextResponse.json(
          { error: "Server configuration error" },
          { status: 500 }
        )
      );
    }
    const pawaUrl = pawaPayConfig.url;
    const pawaToken = pawaPayConfig.token;

    if (!pawaToken) {
      return cors(
        NextResponse.json(
          { error: "Server configuration error" },
          { status: 500 }
        )
      );
    }

    // Format phone number
    let formattedPhone = phoneNumber.replace(/\s/g, "");
    if (formattedPhone.length === 9 && formattedPhone.startsWith("0")) {
      formattedPhone = formattedPhone.substring(1);
    }
    formattedPhone = "226" + formattedPhone.slice(0, 8);

    const pawaProvider =
      provider === "ORANGE_MONEY" ? "ORANGE_BFA" : "MOOV_BFA";
    const customerMessage = "Roogo Payment".slice(0, 22);

    const payload: PawaPayDepositPayload = {
      depositId,
      payer: {
        type: "MMO",
        accountDetails: {
          phoneNumber: formattedPhone,
          provider: pawaProvider,
        },
      },
      amount: paymentAmount.toString(),
      currency,
      customerMessage,
    };

    if (preAuthorisationCode) {
      payload.preAuthorisationCode = preAuthorisationCode;
    }

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

    if (!response.ok) {
      await supabase
        .from("transactions")
        .update({
          status: "failed",
          failure_reason: result.message || "API call failed",
          metadata: result,
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
          {
            error: errorMessage,
            details: result,
            failureCode: failureReason?.failureCode,
          },
          { status: response.status }
        )
      );
    }

    return cors(
      NextResponse.json({
        success: true,
        depositId: result.depositId || depositId,
        status: result.status || "PENDING",
        raw: result,
      })
    );
  } catch (error: unknown) {
    console.error("Lock initiation error:", error);
    return cors(
      NextResponse.json(
        { error: error instanceof Error ? error.message : String(error) },
        { status: 500 }
      )
    );
  }
}
