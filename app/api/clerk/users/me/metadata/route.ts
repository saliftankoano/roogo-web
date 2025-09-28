import { NextResponse } from "next/server";
import { createClerkClient, verifyToken } from "@clerk/backend";

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! });

export async function OPTIONS() {
  return cors(NextResponse.json({ ok: true }));
}

export async function POST(req: Request) {
  try {
    const auth = req.headers.get("authorization") ?? "";
    const token = auth.replace("Bearer ", "");
    if (!token) return cors(json({ error: "Missing token" }, 401));

    const { sub: userId } = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY!,
    });

    const { privateMetadata } = await req.json();
    if (!userId || !privateMetadata) {
      return cors(json({ error: "privateMetadata required" }, 400));
    }

    await clerk.users.updateUser(userId, { privateMetadata });
    return cors(json({ ok: true }));
  } catch (e) {
    return cors(json({ error: "Failed to update metadata" }, 400));
  }
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status });
}

function cors(res: NextResponse) {
  res.headers.set("Access-Control-Allow-Origin", process.env.CORS_ORIGIN || "*");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  return res;
}
