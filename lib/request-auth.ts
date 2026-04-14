import { verifyToken } from "@clerk/backend";
import { auth } from "@clerk/nextjs/server";

export async function resolveClerkId(req: Request): Promise<string | null> {
  const { userId } = await auth();
  if (userId) {
    return userId;
  }

  const token = (req.headers.get("authorization") ?? "")
    .replace(/^Bearer\s+/i, "")
    .trim();

  if (!token) {
    return null;
  }

  try {
    const { sub } = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY!,
    });

    return sub ?? null;
  } catch {
    return null;
  }
}
