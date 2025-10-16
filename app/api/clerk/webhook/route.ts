import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { createHmac } from "crypto";
import {
  createUserInSupabase,
  updateUserInSupabase,
  deleteUserFromSupabase,
} from "@/lib/user-sync";

/**
 * @description Handle Clerk webhook events for user synchronization
 * @param req - Request object
 * @returns Response object
 */
export async function POST(req: Request) {
  try {
    const headersList = await headers();
    const svixSignature = headersList.get("svix-signature");

    if (!svixSignature) {
      return NextResponse.json(
        { error: "Missing svix signature" },
        { status: 400 }
      );
    }

    const body = await req.text();

    // Verify webhook signature using HMAC
    const webhookSecret = process.env.CLERK_WEBHOOK_SECRET!;
    const expectedSignature = createHmac("sha256", webhookSecret)
      .update(body)
      .digest("hex");

    const providedSignature = svixSignature.replace("v1,", "");

    if (expectedSignature !== providedSignature) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }

    const evt = JSON.parse(body);
    const { type, data } = evt;

    console.log(`Received webhook event: ${type}`);

    switch (type) {
      case "user.created":
        await createUserInSupabase(data);
        break;
      case "user.updated":
        await updateUserInSupabase(data);
        break;
      case "user.deleted":
        await deleteUserFromSupabase(data.id);
        break;
      default:
        console.log(`Unhandled webhook event type: ${type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 400 }
    );
  }
}
