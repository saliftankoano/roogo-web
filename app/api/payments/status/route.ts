import { cors, corsOptions } from "@/lib/api-helpers";
import { NextResponse } from "next/server";
import { verifyToken } from "@clerk/backend";
import { getSupabaseClient } from "@/lib/user-sync";

export async function OPTIONS(req: Request) {
  return corsOptions(req);
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

    const response = await fetch(`${pawaUrl}/v2/deposits/${depositId}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${pawaToken}`,
      },
    });

    const responseText = await response.text();
    let result;
    try {
      result = JSON.parse(responseText);
    } catch {
      result = { message: responseText };
    }

    if (!response.ok) {
      if (response.status === 404) {
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

    const statusData = Array.isArray(result) ? result[0] : result;
    const status = statusData?.status || statusData?.depositStatus;

    // 4. Update Supabase with properly mapped status
    if (status) {
      const supabase = getSupabaseClient();

      // Fetch the transaction first to see its type and previous status
      const { data: transaction, error: fetchError } = await supabase
        .from("transactions")
        .select("*")
        .eq("deposit_id", depositId)
        .single();

      if (fetchError || !transaction) {
        console.error(`Transaction ${depositId} not found in DB`);
      } else {
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

        // Update transaction status
        const { error: updateError } = await supabase
          .from("transactions")
          .update({
            status: dbStatus,
            metadata: statusData,
            updated_at: new Date().toISOString(),
          })
          .eq("deposit_id", depositId);

        if (updateError) {
          console.error(
            `Failed to update transaction ${depositId}:`,
            updateError
          );
        }

        // Handle post-payment logic if it just became completed
        if (dbStatus === "completed" && transaction.status !== "completed") {
          if (transaction.type === "boost" && transaction.property_id) {
             const expiresAt = new Date();
             expiresAt.setDate(expiresAt.getDate() + 7);

             await supabase
               .from("properties")
               .update({
                 is_boosted: true,
                 boost_expires_at: expiresAt.toISOString(),
               })
               .eq("id", transaction.property_id);
          } else if (transaction.type === "property_lock" && transaction.property_id) {
             await supabase
               .from("properties")
               .update({ status: "locked" })
               .eq("id", transaction.property_id);
               
             const lockExpiresAt = new Date();
             lockExpiresAt.setDate(lockExpiresAt.getDate() + 7);

             await supabase.from("property_locks").insert({
               property_id: transaction.property_id,
               renter_id: transaction.user_id,
               transaction_id: transaction.id,
               lock_fee: transaction.amount,
               status: "active",
               expires_at: lockExpiresAt.toISOString(),
             });
          }
        }
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

