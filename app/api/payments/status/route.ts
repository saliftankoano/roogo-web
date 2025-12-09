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
      return cors(
        NextResponse.json({ error: "Missing token" }, { status: 401 })
      );
    }

    try {
      await verifyToken(token, {
        secretKey: process.env.CLERK_SECRET_KEY!,
      });
    } catch (error) {
      console.error("Token verification failed:", error);
      return cors(
        NextResponse.json({ error: "Invalid token" }, { status: 401 })
      );
    }

    // 2. Parse Body
    const body = await req.json();
    const { depositId } = body;

    if (!depositId) {
      return cors(
        NextResponse.json({ error: "Missing depositId" }, { status: 400 })
      );
    }

    // 3. Call PawaPay API
    const pawaUrl =
      process.env.PAWAPAY_URL || "https://api.sandbox.pawapay.cloud";
    const pawaToken = process.env.PAWAPAY_API_TOKEN;

    if (!pawaToken) {
      return cors(
        NextResponse.json(
          { error: "Server configuration error" },
          { status: 500 }
        )
      );
    }

    const response = await fetch(`${pawaUrl}/deposits/${depositId}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${pawaToken}`,
      },
    });

    const responseText = await response.text();
    // console.log("PawaPay status response:", response.status, responseText);

    let result;
    try {
      result = JSON.parse(responseText);
    } catch {
      result = { message: responseText };
    }

    if (!response.ok) {
      // If 404, maybe it's not propagated yet?
      return cors(
        NextResponse.json(
          {
            error: "Failed to check status",
            details: result,
          },
          { status: response.status }
        )
      );
    }

    // PawaPay response usually has result[0] if array or just object
    const statusData = Array.isArray(result) ? result[0] : result;

    return cors(
      NextResponse.json({
        success: true,
        status: statusData.status,
        raw: statusData,
      })
    );
  } catch (error: unknown) {
    console.error("Payment status check error:", error);
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
