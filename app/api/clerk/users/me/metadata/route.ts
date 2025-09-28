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

    let userId: string | undefined;
    try {
      const { sub } = await verifyToken(token, {
        secretKey: process.env.CLERK_SECRET_KEY!,
      });
      userId = sub as string | undefined;
    } catch {
      return cors(json({ error: "Invalid token" }, 401));
    }

    const body = await req.json().catch(() => ({} as unknown));
    const privateMetadata = (body as unknown as { privateMetadata: unknown })
      ?.privateMetadata;

    if (!userId) {
      return cors(json({ error: "Unauthorized" }, 401));
    }

    if (
      !privateMetadata ||
      typeof privateMetadata !== "object" ||
      Array.isArray(privateMetadata)
    ) {
      return cors(json({ error: "privateMetadata object required" }, 400));
    }

    const userType = (privateMetadata as unknown as { userType: string })
      .userType;
    if (
      typeof userType !== "string" ||
      !["agent", "regular"].includes(userType)
    ) {
      return cors(
        json(
          { error: "privateMetadata.userType must be 'agent' or 'regular'" },
          400
        )
      );
    }

    const sanitizedPrivateMetadata = { userType };

    await clerk.users.updateUser(userId, {
      privateMetadata: sanitizedPrivateMetadata,
    });
    return cors(json({ ok: true }));
  } catch (error) {
    console.error(error);
    return cors(json({ error: "Failed to update metadata" }, 400));
  }
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status });
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
