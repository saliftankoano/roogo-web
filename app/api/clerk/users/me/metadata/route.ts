import { createClerkClient, verifyToken } from "@clerk/backend";
import { NextResponse } from "next/server";

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! });
/**
 * @description Handle OPTIONS request for CORS
 * @returns
 */
export async function OPTIONS() {
  return cors(NextResponse.json({ ok: true }));
}

/**
 * @description Handle POST request to update user metadata
 * @param req - Request object
 * @returns Response object
 */
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

    const { userType, sex, dateOfBirth } = privateMetadata as unknown as {
      userType?: string;
      sex?: string;
      dateOfBirth?: string;
    };

    // Validate userType if provided
    if (
      userType &&
      (typeof userType !== "string" || !["agent", "regular"].includes(userType))
    ) {
      return cors(
        json(
          { error: "privateMetadata.userType must be 'agent' or 'regular'" },
          400
        )
      );
    }

    // Validate sex if provided
    if (
      sex &&
      (typeof sex !== "string" || !["Masculin", "Féminin"].includes(sex))
    ) {
      return cors(
        json(
          { error: "privateMetadata.sex must be 'Masculin' or 'Féminin'" },
          400
        )
      );
    }

    // Validate dateOfBirth if provided (basic format check)
    if (dateOfBirth && typeof dateOfBirth !== "string") {
      return cors(
        json({ error: "privateMetadata.dateOfBirth must be a string" }, 400)
      );
    }

    // Build sanitized metadata object with only provided fields
    const sanitizedPrivateMetadata: Record<string, string> = {};
    if (userType) sanitizedPrivateMetadata.userType = userType;
    if (sex) sanitizedPrivateMetadata.sex = sex;
    if (dateOfBirth) sanitizedPrivateMetadata.dateOfBirth = dateOfBirth;

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
