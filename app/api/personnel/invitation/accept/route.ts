import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { authLimiter, checkRateLimit } from "@/lib/rate-limit";
import { acceptInvitation, teamErrorResponse } from "@/lib/staff-team-server";

// A signed-in person turns an invitation link into staff access.
export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { success, headers } = await checkRateLimit(authLimiter, userId);
    if (!success) {
      const response = NextResponse.json(
        { error: "Trop d'essais. Réessayez plus tard." },
        { status: 429 },
      );
      headers.forEach((value, key) => response.headers.set(key, value));
      return response;
    }
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const result = await acceptInvitation(userId, body.token);
    return NextResponse.json({ success: true, level: result.level });
  } catch (error) {
    return teamErrorResponse(error);
  }
}
