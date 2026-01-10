import { createClerkClient, verifyToken } from "@clerk/backend";
import { NextResponse } from "next/server";

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

    if (!userId) {
      return cors(json({ error: "Unauthorized" }, 401));
    }

    const body = await req.json().catch(() => ({} as unknown));
    
    // We expect fields to be passed at the root of the body now for simplicity,
    // but we can still accept the nested structure for backward compatibility.
    const input = body.publicMetadata || body.privateMetadata || body;

    const { 
      userType, 
      sex, 
      dateOfBirth, 
      companyName, 
      facebookUrl, 
      location 
    } = input as {
      userType?: string;
      sex?: string;
      dateOfBirth?: string;
      companyName?: string;
      facebookUrl?: string;
      location?: string;
    };

    // Validations
    if (userType && !["agent", "regular", "owner", "renter", "staff"].includes(userType)) {
      return cors(json({ error: "Invalid userType" }, 400));
    }

    if (sex && !["Masculin", "Féminin"].includes(sex)) {
      return cors(json({ error: "Invalid sex" }, 400));
    }

    // Build update payload
    const publicMetadata: Record<string, any> = {};
    const privateMetadata: Record<string, any> = {};

    // Public fields (readable by frontend)
    if (userType) publicMetadata.userType = userType;
    if (companyName) publicMetadata.companyName = companyName;
    if (facebookUrl) publicMetadata.facebookUrl = facebookUrl;
    if (location) publicMetadata.location = location;

    // Private fields (backend only)
    if (sex) privateMetadata.sex = sex;
    if (dateOfBirth) privateMetadata.dateOfBirth = dateOfBirth;

    await clerk.users.updateUser(userId, {
      publicMetadata,
      privateMetadata,
      // Clear unsafeMetadata for this user as we migrate them
      unsafeMetadata: {}
    });

    return cors(json({ ok: true }));
  } catch (error) {
    console.error("Metadata update error:", error);
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
