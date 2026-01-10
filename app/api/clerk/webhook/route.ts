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
    } catch (err) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }
    const { type, data } = evt;

    let result;
    switch (type) {
      case "user.created":
        result = await createUserInSupabase(data);
        break;
      case "user.updated":
        result = await updateUserInSupabase(data);
        break;
      case "user.deleted":
        result = await deleteUserFromSupabase(data.id);
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
