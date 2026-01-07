import { NextResponse } from "next/server";
import { verifyToken } from "@clerk/backend";
import { getSupabaseClient, getUserByClerkId } from "@/lib/user-sync";

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

export async function OPTIONS() {
  return cors(NextResponse.json({ ok: true }));
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const propertyId = params.id;

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

    // 4. Validate Property Eligibility (Status must be 'en_ligne' and within 48h)
    const { data: property, error: propError } = await supabase
      .from("properties")
      .select("price, published_at, status")
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
            error: "This property is not available for Early Bird reservation",
          },
          { status: 400 }
        )
      );
    }

    if (!property.published_at) {
      return cors(
        NextResponse.json(
          { error: "Early Bird window has not started for this property" },
          { status: 400 }
        )
      );
    }

    const publishedAt = new Date(property.published_at);
    const now = new Date();
    const diffHours =
      (now.getTime() - publishedAt.getTime()) / (1000 * 60 * 60);

    if (diffHours > 48) {
      return cors(
        NextResponse.json(
          { error: "Early Bird window has expired (48h passed)" },
          { status: 400 }
        )
      );
    }

    // 5. Calculate Fee (10% of rent, min 10,000 XOF)
    const rentAmount = Number(property.price);
    const lockFee = Math.max(rentAmount * 0.1, 10000);

    // 6. Create Transaction Record
    const depositId = crypto.randomUUID();
    const currency = "XOF";

    let payerClientCode = provider;
    if (provider === "ORANGE_MONEY") payerClientCode = "ORANGE_BFA";
    if (provider === "MOOV_MONEY") payerClientCode = "MOOV_BFA";

    const { error: dbError } = await supabase.from("transactions").insert({
      deposit_id: depositId,
      amount: lockFee,
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
    const pawaUrlBase =
      process.env.PAWAPAY_URL || "https://api.sandbox.pawapay.io";
    const pawaUrl = pawaUrlBase.replace(/\/+$/, "");
    const pawaToken = process.env.PAWAPAY_API_TOKEN?.trim();

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
    const customerMessage = "Roogo Lock Reservation".slice(0, 22);

    const payload: PawaPayDepositPayload = {
      depositId,
      payer: {
        type: "MMO",
        accountDetails: {
          phoneNumber: formattedPhone,
          provider: pawaProvider,
        },
      },
      amount: lockFee.toString(),
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

function cors(res: NextResponse) {
  res.headers.set(
    "Access-Control-Allow-Origin",
    process.env.CORS_ORIGIN || "*"
  );
  res.headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );
  res.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  return res;
}
