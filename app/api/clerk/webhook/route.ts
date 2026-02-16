import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { Webhook } from "svix";
import {
  createUserInSupabase,
  updateUserInSupabase,
  deleteUserFromSupabase,
} from "../../../../lib/user-sync";
import { captureServerEvent, identifyServerUser } from "@/lib/posthog-server";

interface WebhookEvent {
  type: string;
  data: {
    id: string;
    email_addresses?: Array<{ email_address: string }>;
    [key: string]: unknown;
  };
}

export async function POST(req: Request) {
  try {
    const headersList = await headers();
    const svixId = headersList.get("svix-id");
    const svixTimestamp = headersList.get("svix-timestamp");
    const svixSignature = headersList.get("svix-signature");

    if (!svixId || !svixTimestamp || !svixSignature) {
      return NextResponse.json(
        { error: "Missing svix headers" },
        { status: 400 }
      );
    }

    const body = await req.text();
    const webhookSecret = process.env.CLERK_WEBHOOK_SECRET;
    if (!webhookSecret) {
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
    } catch {
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }
    const { type, data } = evt;


    const publicMetadata =
      typeof data.public_metadata === "object" && data.public_metadata !== null
        ? (data.public_metadata as Record<string, unknown>)
        : {};
    const inferredUserType =
      typeof publicMetadata.userType === "string"
        ? publicMetadata.userType
        : "renter";
    const primaryEmail = data.email_addresses?.[0]?.email_address ?? null;

    switch (type) {
      case "user.created":
        await createUserInSupabase(data);
        await identifyServerUser(data.id, {
          email: primaryEmail,
          userType: inferredUserType,
          signup_method: "clerk",
        });
        await captureServerEvent(data.id, "user_signed_up", {
          userType: inferredUserType,
          email: primaryEmail,
          signup_method: "clerk",
        });
        break;
      case "user.updated":
        await updateUserInSupabase(data);
        await identifyServerUser(data.id, {
          email: primaryEmail,
          userType: inferredUserType,
        });
        await captureServerEvent(data.id, "user_profile_updated", {
          userType: inferredUserType,
          email: primaryEmail,
        });
        break;
      case "user.deleted":
        await captureServerEvent(data.id, "user_deleted", {
          userType: inferredUserType,
          email: primaryEmail,
        });
        await deleteUserFromSupabase(data.id);
        break;
    }

    return NextResponse.json({ received: true, processed: true });
  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}
