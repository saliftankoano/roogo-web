import { NextResponse } from "next/server";
import { cors, errorResponse } from "@/lib/api-helpers";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function OPTIONS(req: Request) {
  return new Response(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, email, reason, additionalInfo, userId } = body;

    // Validate required fields
    if (!name || !email || !reason) {
      return errorResponse("Missing required fields", 400, req);
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return errorResponse("Invalid email format", 400, req);
    }

    // Store deletion request in database
    const { error: insertError } = await supabaseAdmin
      .from("account_deletion_requests")
      .insert({
        user_id: userId || null,
        name,
        email,
        reason,
        additional_info: additionalInfo || null,
        status: "pending",
        requested_at: new Date().toISOString(),
      });

    if (insertError) {
      console.error("Error storing deletion request:", insertError);
      // Don't fail if table doesn't exist - log for manual processing
      console.log("Deletion request (manual processing):", {
        name,
        email,
        reason,
        userId,
      });
    }

    // TODO: Send email notification to admin
    // TODO: Send confirmation email to user

    return cors(
      NextResponse.json({
        success: true,
        message: "Deletion request received",
      }),
      req
    );
  } catch (error) {
    console.error("Error processing deletion request:", error);
    return errorResponse("Failed to process deletion request", 500, req);
  }
}
