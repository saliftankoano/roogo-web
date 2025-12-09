import { NextResponse } from "next/server";
import { verifyToken } from "@clerk/backend";

export async function OPTIONS() {
  return cors(NextResponse.json({ ok: true }));
}

export async function POST(req: Request) {
  try {
    // 1. Verify Clerk Token
    const auth = req.headers.get("authorization") ?? "";
    const token = auth.replace("Bearer ", "");
    if (!token) {
      return cors(NextResponse.json({ error: "Missing token" }, { status: 401 }));
    }

    try {
      await verifyToken(token, {
        secretKey: process.env.CLERK_SECRET_KEY!,
      });
    } catch (error) {
      console.error("Token verification failed:", error);
      return cors(NextResponse.json({ error: "Invalid token" }, { status: 401 }));
    }

    // 2. Parse Body
    const body = await req.json();
    const { amount, phoneNumber, provider, description } = body;

    if (!amount || !phoneNumber || !provider) {
      return cors(NextResponse.json({ error: "Missing required fields" }, { status: 400 }));
    }

    // 3. Call PawaPay API
    const pawaUrl = process.env.PAWAPAY_URL || "https://api.sandbox.pawapay.cloud";
    const pawaToken = process.env.PAWAPAY_API_TOKEN;

    if (!pawaToken) {
      console.error("PAWAPAY_API_TOKEN is not set");
      return cors(NextResponse.json({ error: "Server configuration error" }, { status: 500 }));
    }

    const depositId = crypto.randomUUID();
    const country = "BFA"; // Burkina Faso
    const currency = "XOF";

    // Map generic provider to PawaPay specific codes if needed
    // Assuming frontend sends "ORANGE_MONEY" or "MOOV_MONEY"
    let payerClientCode = provider;
    if (provider === "ORANGE_MONEY") payerClientCode = "ORANGE_MONEY_BFA";
    if (provider === "MOOV_MONEY") payerClientCode = "MOOV_MONEY_BFA";

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

    console.log("Initiating PawaPay deposit:", JSON.stringify(payload, null, 2));

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

    // PawaPay returns the depositId and status
    // result might contain duplicate depositId or other info
    // In sandbox, it usually returns the submitted details + status
    
    return cors(
      NextResponse.json({
        success: true,
        depositId: result.depositId || depositId,
        status: result.status || "PENDING",
        raw: result
      })
    );

  } catch (error: any) {
    console.error("Payment initiation error:", error);
    return cors(NextResponse.json({ error: error.message }, { status: 500 }));
  }
}

function cors(res: NextResponse) {
  res.headers.set("Access-Control-Allow-Origin", process.env.CORS_ORIGIN || "*");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  return res;
}

