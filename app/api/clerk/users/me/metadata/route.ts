import { createClerkClient, verifyToken } from "@clerk/backend";
import { NextResponse } from "next/server";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! });

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

export async function POST(req: Request) {
  try {
    const auth = req.headers.get("authorization") ?? "";
    const token = auth.replace("Bearer ", "");
    if (!token) return errorResponse("Missing token", 401, req);

    let userId: string | undefined;
    try {
      const { sub } = await verifyToken(token, {
        secretKey: process.env.CLERK_SECRET_KEY!,
      });
      userId = sub as string | undefined;
    } catch {
      return errorResponse("Invalid token", 401, req);
    }

    if (!userId) {
      return errorResponse("Unauthorized", 401, req);
    }

    const body = await req.json().catch(() => ({} as unknown));
    
    const input = (body.publicMetadata || body.privateMetadata || body) as Record<string, unknown>;

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
      return errorResponse("Invalid userType", 400, req);
    }

    if (sex && !["Masculin", "Féminin"].includes(sex)) {
      return errorResponse("Invalid sex", 400, req);
    }

    // Build update payload
    const publicMetadata: Record<string, string | undefined> = {};
    const privateMetadata: Record<string, string | undefined> = {};

    // Public fields
    if (userType) publicMetadata.userType = userType;
    if (companyName) publicMetadata.companyName = companyName;
    if (facebookUrl) publicMetadata.facebookUrl = facebookUrl;
    if (location) publicMetadata.location = location;

    // Private fields
    if (sex) privateMetadata.sex = sex;
    if (dateOfBirth) privateMetadata.dateOfBirth = dateOfBirth;

    await clerk.users.updateUser(userId, {
      publicMetadata,
      privateMetadata,
      unsafeMetadata: {}
    });

    return cors(NextResponse.json({ ok: true }), req);
  } catch (error) {
    console.error("Metadata update error:", error);
    return errorResponse("Failed to update metadata", 400, req);
  }
}
