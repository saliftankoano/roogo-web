import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { Webhook } from "svix";
import {
  createUserInSupabase,
  updateUserInSupabase,
  deleteUserFromSupabase,
} from "../../../../lib/user-sync";

interface WebhookEvent {
  type: string;
  data: {
    id: string;
    email_addresses?: Array<{ email_address: string }>;
    [key: string]: unknown;
  };
}

/**
 * @description Handle Clerk webhook events for user synchronization
 * @param req - Request object
 * @returns Response object
 */
export async function POST(req: Request) {
  try {
    console.log("Webhook received - starting processing");

    const headersList = await headers();
    const svixId = headersList.get("svix-id");
    const svixTimestamp = headersList.get("svix-timestamp");
    const svixSignature = headersList.get("svix-signature");

    console.log("Headers:", {
      svixSignature: svixSignature ? "present" : "missing",
      svixId: svixId ? "present" : "missing",
      svixTimestamp: svixTimestamp ? "present" : "missing",
    });

    if (!svixId || !svixTimestamp || !svixSignature) {
      console.error("Missing svix headers");
      return NextResponse.json(
        { error: "Missing svix headers" },
        { status: 400 }
      );
    }

    const body = await req.text();
    console.log("Webhook body length:", body.length);

    // Verify webhook signature using svix
    const webhookSecret = process.env.CLERK_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error("CLERK_WEBHOOK_SECRET not set");
      return NextResponse.json(
        { error: "Webhook secret not configured" },
        { status: 500 }
      );
    }

    const wh = new Webhook(webhookSecret);
    let evt: WebhookEvent;

    try {
      evt = wh.verify(body, {
        "svix-id": svixId,
        "svix-timestamp": svixTimestamp,
        "svix-signature": svixSignature,
      }) as WebhookEvent;
    } catch (err) {
      console.error("Error verifying webhook:", err);
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }
    const { type, data } = evt;

    console.log(`Received webhook event: ${type}`, {
      userId: data?.id,
      email: data?.email_addresses?.[0]?.email_address,
    });

    let result;
    switch (type) {
      case "user.created":
        console.log("Processing user.created");
        result = await createUserInSupabase(data);
        console.log("User created result:", result);
        break;
      case "user.updated":
        console.log("Processing user.updated");
        result = await updateUserInSupabase(data);
        console.log("User updated result:", result);
        break;
      case "user.deleted":
        console.log("Processing user.deleted");
        result = await deleteUserFromSupabase(data.id);
        console.log("User deleted result:", result);
        break;
      default:
        console.log(`Unhandled webhook event type: ${type}`);
    }

    console.log("Webhook processing completed successfully");
    return NextResponse.json({ received: true, processed: true });
  } catch (error) {
    console.error("Webhook error:", error);
    console.error(
      "Error stack:",
      error instanceof Error ? error.stack : "No stack trace"
    );
    return NextResponse.json(
      {
        error: "Webhook processing failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
