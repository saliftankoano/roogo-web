import { NextResponse } from "next/server";
import { verifyToken } from "@clerk/backend";
import { getSupabaseClient, getUserByClerkId } from "@/lib/user-sync";

export async function OPTIONS() {
  return cors(NextResponse.json({ ok: true }));
}

export async function POST(req: Request) {
  try {
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
    const {
      amount,
      phoneNumber,
      provider,
      description,
      transactionType,
      propertyId,
    } = body;

    if (!amount || !phoneNumber || !provider || !transactionType) {
      return cors(
        NextResponse.json({ error: "Missing required fields" }, { status: 400 })
      );
    }

    // 4. Create Transaction Record in Supabase (Pending)
    const depositId = crypto.randomUUID();
    const country = "BFA"; // Burkina Faso
    const currency = "XOF";
    const supabase = getSupabaseClient();

    let payerClientCode = provider;
    if (provider === "ORANGE_MONEY") payerClientCode = "ORANGE_MONEY_BFA";
    if (provider === "MOOV_MONEY") payerClientCode = "MOOV_MONEY_BFA";

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

    // 5. Call PawaPay API
    const pawaUrlBase = process.env.PAWAPAY_URL || "https://api.sandbox.pawapay.cloud";
    const pawaUrl = pawaUrlBase.replace(/\/+$/, ""); // Remove trailing slashes
    const pawaToken = process.env.PAWAPAY_API_TOKEN;

    if (!pawaToken) {
      console.error("PAWAPAY_API_TOKEN is not set");
      return cors(
        NextResponse.json(
          { error: "Server configuration error" },
          { status: 500 }
        )
      );
    }

    const payload = {
      depositId,
      amount: amount.toString(),
      currency,
      country,
      payer: {
        type: "MSISDN",
        address: {
          value: phoneNumber,
        },
      },
      payerClientCode,
      description: description || "Roogo Payment",
      statementDescription: "Roogo",
    };

    console.log(
      "Initiating PawaPay deposit:",
      JSON.stringify(payload, null, 2)
    );

    const response = await fetch(`${pawaUrl}/deposits`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${pawaToken}`,
      },
      body: JSON.stringify(payload),
    });

    const responseText = await response.text();
    console.log("PawaPay response:", response.status, responseText);

    let result;
    try {
      result = JSON.parse(responseText);
    } catch {
      result = { message: responseText };
    }

    if (!response.ok) {
      // Update transaction to failed
      await supabase
        .from("transactions")
        .update({
          status: "failed",
          failure_reason: result.message || "API call failed",
          metadata: result,
        })
        .eq("deposit_id", depositId);

      return cors(
        NextResponse.json(
          {
            error: "Payment initiation failed",
            details: result,
          },
          { status: response.status }
        )
      );
    }

    // Success
    return cors(
      NextResponse.json({
        success: true,
        depositId: result.depositId || depositId,
        status: result.status || "PENDING",
        raw: result,
      })
    );
  } catch (error: unknown) {
    console.error("Payment initiation error:", error);
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
