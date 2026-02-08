import { cors, corsOptions } from "@/lib/api-helpers";
import { NextResponse } from "next/server";
import { verifyToken } from "@clerk/backend";
import { getSupabaseClient } from "@/lib/user-sync";

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

export async function POST(req: Request) {
  const requestId = crypto.randomUUID().slice(0, 8);
  const log = (step: string, data: Record<string, unknown> = {}) => {
    console.log(JSON.stringify({ 
      route: "POST /api/payments/status", 
      requestId, 
      step, 
      ...data, 
      timestamp: new Date().toISOString() 
    }));
  };

  try {
    // 1. Verify Clerk Token
    const auth = req.headers.get("authorization") ?? "";
    const token = auth.replace("Bearer ", "");
    if (!token) {
      log("error", { error: "Missing token" });
      return cors(
        NextResponse.json({ error: "Missing token" }, { status: 401 })
      );
    }

    try {
      await verifyToken(token, {
        secretKey: process.env.CLERK_SECRET_KEY!,
      });
    } catch (error) {
      log("auth-failed", { error: String(error) });
      return cors(
        NextResponse.json({ error: "Invalid token" }, { status: 401 })
      );
    }

    // 2. Parse Body
    const body = await req.json();
    const { depositId } = body;

    if (!depositId) {
      log("error", { error: "Missing depositId" });
      return cors(
        NextResponse.json({ error: "Missing depositId" }, { status: 400 })
      );
    }

    log("checking-status", { depositId });

    const supabase = getSupabaseClient();

    // 3. Check DB first (callback may have already updated it)
    const { data: transaction, error: fetchError } = await supabase
      .from("transactions")
      .select("*")
      .eq("deposit_id", depositId)
      .single();

    if (fetchError || !transaction) {
      log("transaction-not-found-in-db", { depositId, fetchError: String(fetchError) });
    } else {
      log("db-status", { 
        depositId, 
        dbStatus: transaction.status, 
        type: transaction.type 
      });

      // If the DB already has a terminal status (updated by callback), return immediately
      // No need to call PawaPay API again
      if (transaction.status === "completed" || transaction.status === "failed" || transaction.status === "refunded") {
        const pawaPayStatus = transaction.status === "completed" ? "COMPLETED" 
          : transaction.status === "failed" ? "FAILED" 
          : "REFUNDED";

        log("returning-db-status", { depositId, status: pawaPayStatus, source: "database" });

        return cors(
          NextResponse.json({
            success: true,
            status: pawaPayStatus,
            raw: { status: pawaPayStatus, ...(transaction.metadata || {}) },
          })
        );
      }
    }

    // 4. DB status is still pending/submitted - check PawaPay API for latest
    const pawaUrlBase = process.env.PAWAPAY_URL;
    if (!pawaUrlBase) {
      log("error", { error: "PAWAPAY_URL not configured" });
      return cors(
        NextResponse.json(
          { error: "Server configuration error" },
          { status: 500 }
        )
      );
    }
    const pawaUrl = pawaUrlBase.replace(/\/+$/, "");
    const pawaToken = process.env.PAWAPAY_API_TOKEN;

    if (!pawaToken) {
      log("error", { error: "PAWAPAY_API_TOKEN not configured" });
      return cors(
        NextResponse.json(
          { error: "Server configuration error" },
          { status: 500 }
        )
      );
    }

    const pawaPayUrl = `${pawaUrl}/v2/deposits/${depositId}`;
    log("pawapay-request", { url: pawaPayUrl, depositId });

    const response = await fetch(pawaPayUrl, {
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

    log("pawapay-response", { 
      depositId,
      httpStatus: response.status, 
      ok: response.ok,
      resultType: Array.isArray(result) ? "array" : typeof result,
      result: JSON.stringify(result).slice(0, 500)
    });

    if (!response.ok) {
      if (response.status === 404) {
        log("deposit-not-found", { depositId });
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

      log("pawapay-error", { depositId, httpStatus: response.status, result });
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

    log("status-extracted", { 
      depositId, 
      extractedStatus: status,
    });

    // 5. Update Supabase with PawaPay status
    if (status && transaction) {
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

      log("db-update", { 
        depositId, 
        pawaPayStatus: status, 
        mappedDbStatus: dbStatus, 
        previousDbStatus: transaction.status,
      });

      const { error: updateError } = await supabase
        .from("transactions")
        .update({
          status: dbStatus,
          metadata: statusData,
          updated_at: new Date().toISOString(),
        })
        .eq("deposit_id", depositId);

      if (updateError) {
        log("db-update-failed", { depositId, error: String(updateError) });
      }

      // Handle post-payment logic if it just became completed
      if (dbStatus === "completed" && transaction.status !== "completed") {
        log("post-payment-logic", { 
          depositId, 
          type: transaction.type, 
          propertyId: transaction.property_id 
        });

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
        }
      }
    }

    log("response-sent", { 
      depositId, 
      status,
      success: true 
    });

    return cors(
      NextResponse.json({
        success: true,
        status: status,
        raw: statusData,
      })
    );
  } catch (error: unknown) {
    log("unhandled-error", { error: String(error), stack: error instanceof Error ? error.stack : undefined });
    return cors(
      NextResponse.json(
        { error: error instanceof Error ? error.message : String(error) },
        { status: 500 }
      )
    );
  }
}
// trigger deploy
