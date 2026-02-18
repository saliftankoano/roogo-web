import { createClerkClient, verifyToken } from "@clerk/backend";
import { NextResponse } from "next/server";
import { createUserInSupabase, type ClerkUserData } from "../../../../../../lib/user-sync";
import { captureServerEvent, identifyServerUser } from "@/lib/posthog-server";

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! });

// Simple CORS for mobile apps - no origin restriction needed for JWT-authenticated endpoints
function addCorsHeaders(res: NextResponse) {
  res.headers.set("Access-Control-Allow-Origin", "*");
  res.headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization",
  );
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
      return addCorsHeaders(
        NextResponse.json({ error: "Missing token" }, { status: 401 }),
      );
    }

    let userId: string | undefined;
    try {
      const { sub } = await verifyToken(token, {
        secretKey: process.env.CLERK_SECRET_KEY!,
      });
      userId = sub as string | undefined;
    } catch (e) {
      console.error("Token verification failed:", e);
      return addCorsHeaders(
        NextResponse.json({ error: "Invalid token" }, { status: 401 }),
      );
    }

    if (!userId) {
      return addCorsHeaders(
        NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      );
    }

    const body = await req.json().catch(() => ({}) as unknown);

    const currentUser = await clerk.users.getUser(userId);
    const currentPublicMetadata =
      typeof currentUser.publicMetadata === "object" && currentUser.publicMetadata !== null
        ? (currentUser.publicMetadata as Record<string, unknown>)
        : {};
    const previousUserType =
      typeof currentPublicMetadata.userType === "string"
        ? currentPublicMetadata.userType
        : "renter";

    // Support both direct payload and wrapped in publicMetadata/privateMetadata
    const input = (body.publicMetadata ||
      body.privateMetadata ||
      body) as Record<string, unknown>;

    const {
      userType,
      sex,
      dateOfBirth,
      companyName,
      facebookUrl,
      professionalLink,
      location,
      hasCompletedOnboarding,
      hasCompletedWebOnboarding,
      onboardingData,
    } = input;

    // Validations
    if (
      userType &&
      !["agent", "regular", "owner", "renter", "staff", "founder"].includes(
        userType as string,
      )
    ) {
      return addCorsHeaders(
        NextResponse.json({ error: "Invalid userType" }, { status: 400 }),
      );
    }

    if (sex && !["Masculin", "Féminin"].includes(sex as string)) {
      return addCorsHeaders(
        NextResponse.json({ error: "Invalid sex" }, { status: 400 }),
      );
    }

    // Build update payload - spread existing metadata so we never wipe fields like userType
    const publicMetadata: Record<string, unknown> = { ...currentPublicMetadata };
    const privateMetadata: Record<string, unknown> = {};

    // PUBLIC: userType (access control) + hasCompletedOnboarding (client routing needs this)
    if (userType) publicMetadata.userType = userType;
    if (hasCompletedOnboarding !== undefined)
      publicMetadata.hasCompletedOnboarding = hasCompletedOnboarding;
    if (hasCompletedWebOnboarding !== undefined)
      publicMetadata.hasCompletedWebOnboarding = hasCompletedWebOnboarding;

    // PRIVATE: Sensitive personal data only
    if (companyName) privateMetadata.companyName = companyName;
    if (professionalLink) privateMetadata.professionalLink = professionalLink;
    if (facebookUrl) privateMetadata.facebookUrl = facebookUrl;
    if (location) privateMetadata.location = location;
    if (onboardingData) privateMetadata.onboardingData = onboardingData;
    if (sex) privateMetadata.sex = sex;
    if (dateOfBirth) privateMetadata.dateOfBirth = dateOfBirth;

    await clerk.users.updateUser(userId, {
      publicMetadata,
      privateMetadata,
    });

    const selectedUserType =
      typeof userType === "string" ? userType : previousUserType;
    const primaryEmail = currentUser.emailAddresses[0]?.emailAddress ?? null;

    await identifyServerUser(userId, {
      email: primaryEmail,
      userType: selectedUserType,
      location: typeof location === "string" ? location : null,
      hasCompletedOnboarding:
        typeof hasCompletedOnboarding === "boolean"
          ? hasCompletedOnboarding
          : null,
      hasCompletedWebOnboarding:
        typeof hasCompletedWebOnboarding === "boolean"
          ? hasCompletedWebOnboarding
          : null,
    });

    if (typeof userType === "string" && userType !== previousUserType) {
      await captureServerEvent(userId, "user_type_selected", {
        userType,
        previous_type: previousUserType,
      });
    }

    const onboardingPayload =
      typeof onboardingData === "object" && onboardingData !== null
        ? (onboardingData as Record<string, unknown>)
        : {};

    if (hasCompletedWebOnboarding === true || hasCompletedOnboarding === true) {
      await captureServerEvent(userId, "onboarding_completed", {
        userType: selectedUserType,
        location:
          (typeof onboardingPayload.location === "string"
            ? onboardingPayload.location
            : typeof location === "string"
              ? location
              : null),
        budget:
          typeof onboardingPayload.budget === "number"
            ? onboardingPayload.budget
            : null,
        service_areas: Array.isArray(onboardingPayload.serviceAreas)
          ? onboardingPayload.serviceAreas
              .filter((item): item is string => typeof item === "string")
              .join(",")
          : null,
        portfolio_size:
          typeof onboardingPayload.portfolioSize === "number"
            ? onboardingPayload.portfolioSize
            : null,
      });
    }

    // Sync updated user to Supabase directly (don't rely solely on webhook)
    try {
      const updatedUser = await clerk.users.getUser(userId);
      const userData: ClerkUserData = {
        id: updatedUser.id,
        email_addresses: updatedUser.emailAddresses.map((e) => ({
          email_address: e.emailAddress,
        })),
        first_name: updatedUser.firstName ?? undefined,
        last_name: updatedUser.lastName ?? undefined,
        image_url: updatedUser.imageUrl ?? undefined,
        phone_numbers: updatedUser.phoneNumbers?.map((p) => ({
          phone_number: p.phoneNumber,
        })),
        public_metadata: updatedUser.publicMetadata as ClerkUserData["public_metadata"],
        private_metadata: updatedUser.privateMetadata as ClerkUserData["private_metadata"],
        unsafe_metadata: updatedUser.unsafeMetadata as ClerkUserData["unsafe_metadata"],
      };
      await createUserInSupabase(userData);
    } catch (syncError) {
      console.error("Supabase sync after metadata update failed:", syncError);
    }

    return addCorsHeaders(NextResponse.json({ ok: true }));
  } catch (error) {
    console.error("Metadata update error:", error);
    return addCorsHeaders(
      NextResponse.json(
        { error: "Failed to update metadata" },
        { status: 500 },
      ),
    );
  }
}
