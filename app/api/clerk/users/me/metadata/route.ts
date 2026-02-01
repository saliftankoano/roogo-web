import { createClerkClient, verifyToken } from "@clerk/backend";
import { NextResponse } from "next/server";

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! });

// Simple CORS for mobile apps - no origin restriction needed for JWT-authenticated endpoints
function addCorsHeaders(res: NextResponse) {
  res.headers.set("Access-Control-Allow-Origin", "*");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  return res;
}

export async function OPTIONS() {
  return addCorsHeaders(new NextResponse(null, { status: 204 }));
}

export async function POST(req: Request) {
  try {
    const auth = req.headers.get("authorization") ?? "";
    const token = auth.replace("Bearer ", "");
    if (!token) {
      return addCorsHeaders(NextResponse.json({ error: "Missing token" }, { status: 401 }));
    }

    let userId: string | undefined;
    try {
      const { sub } = await verifyToken(token, {
        secretKey: process.env.CLERK_SECRET_KEY!,
      });
      userId = sub as string | undefined;
    } catch (e) {
      console.error("Token verification failed:", e);
      return addCorsHeaders(NextResponse.json({ error: "Invalid token" }, { status: 401 }));
    }

    if (!userId) {
      return addCorsHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
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
      return addCorsHeaders(NextResponse.json({ error: "Invalid userType" }, { status: 400 }));
    }

    if (sex && !["Masculin", "Féminin"].includes(sex)) {
      return addCorsHeaders(NextResponse.json({ error: "Invalid sex" }, { status: 400 }));
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

    return addCorsHeaders(NextResponse.json({ ok: true }));
  } catch (error) {
    console.error("Metadata update error:", error);
    return addCorsHeaders(NextResponse.json({ error: "Failed to update metadata" }, { status: 500 }));
  }
}
