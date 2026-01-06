import { NextResponse } from "next/server";
import { verifyToken } from "@clerk/backend";
import { getSupabaseClient } from "@/lib/user-sync";

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
    const pawaUrlBase =
      process.env.PAWAPAY_URL || "https://api.sandbox.pawapay.io";
    const pawaUrl = pawaUrlBase.replace(/\/+$/, "");
    const pawaToken = process.env.PAWAPAY_API_TOKEN;

    if (!pawaToken) {
      return cors(
        NextResponse.json(
          { error: "Server configuration error" },
          { status: 500 }
        )
      );
    }

    console.log(
      `Checking PawaPay status for ${depositId} at ${pawaUrl}/v2/deposits/${depositId}`
    );

    const response = await fetch(`${pawaUrl}/v2/deposits/${depositId}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${pawaToken}`,
      },
    });

    const responseText = await response.text();
    console.log(
      `PawaPay status response for ${depositId}:`,
      response.status,
      responseText
    );

    let result;
    try {
      result = JSON.parse(responseText);
    } catch {
      result = { message: responseText };
    }

    if (!response.ok) {
      console.error(
        `PawaPay status check failed (HTTP ${response.status}):`,
        result
      );

      // If deposit not found (404), it means it was never created in PawaPay
      if (response.status === 404) {
        console.error(
          `Deposit ${depositId} not found in PawaPay - it may have failed to create`
        );
        return cors(
          NextResponse.json(
            {
              success: true,
              status: "NOT_FOUND",
              error: "Deposit not found in PawaPay system",
              raw: result,
            },
            { status: 200 }
          )
        );
      }

      return cors(
        NextResponse.json(
          {
            success: false,
            error: "Failed to check status",
            details: result,
          },
          { status: response.status }
        )
      );
    }

    // PawaPay response usually has result[0] if array or just object
    const statusData = Array.isArray(result) ? result[0] : result;
    const status = statusData?.status || statusData?.depositStatus;
    console.log(`Deposit ${depositId} status from PawaPay: ${status}`);

    // 4. Update Supabase with properly mapped status
    if (status) {
      const supabase = getSupabaseClient();

      // Map PawaPay status to our database enum
      let dbStatus = "pending";
      if (status === "COMPLETED" || status === "ACCEPTED")
        dbStatus = "completed";
      if (
        status === "FAILED" ||
        status === "CANCELLED" ||
        status === "REJECTED"
      )
        dbStatus = "failed";
      if (status === "REFUNDED") dbStatus = "refunded";

      const { error: updateError } = await supabase
        .from("transactions")
        .update({
          status: dbStatus,
          metadata: statusData,
        })
        .eq("deposit_id", depositId);

      if (updateError) {
        console.error(
          `Failed to update transaction ${depositId}:`,
          updateError
        );
      } else {
        console.log(
          `Updated transaction ${depositId} status to: ${status.toLowerCase()}`
        );
      }
    }

    return cors(
      NextResponse.json({
        success: true,
        status: status,
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
