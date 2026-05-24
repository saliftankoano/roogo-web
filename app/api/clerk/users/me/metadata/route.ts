import { createClerkClient, verifyToken } from "@clerk/backend";
import { NextResponse } from "next/server";
import {
  createUserInSupabase,
  fetchClerkSignupGeo,
  type ClerkUserData,
} from "../../../../../../lib/user-sync";
import { captureServerEvent, identifyServerUser } from "@/lib/posthog-server";

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! });

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
    const currentPrivateMetadata =
      typeof currentUser.privateMetadata === "object" && currentUser.privateMetadata !== null
        ? (currentUser.privateMetadata as Record<string, unknown>)
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
      firstName,
      lastName,
      userType,
      sex,
      dateOfBirth,
      companyName,
      facebookUrl,
      professionalLink,
      location,
      hasCompletedMobileOnboarding,
      hasCompletedOnboarding, // legacy alias for hasCompletedMobileOnboarding
      hasCompletedWebOnboarding,
      hasCompletedWebTour,
      webOnboardingStep,
      mobileOnboardingData,
      webOnboardingData,
      onboardingData, // legacy alias for mobileOnboardingData
      signupPlatform,
    } = input;

    const trimmedFirstName =
      typeof firstName === "string" ? firstName.trim() : undefined;
    const trimmedLastName =
      typeof lastName === "string" ? lastName.trim() : undefined;
    const hasNameUpdate = firstName !== undefined || lastName !== undefined;

    if (hasNameUpdate && !trimmedFirstName) {
      return addCorsHeaders(
        NextResponse.json({ error: "Invalid firstName" }, { status: 400 }),
      );
    }

    if (hasNameUpdate && !trimmedLastName) {
      return addCorsHeaders(
        NextResponse.json({ error: "Invalid lastName" }, { status: 400 }),
      );
    }

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

    if (signupPlatform && !["web", "mobile"].includes(signupPlatform as string)) {
      return addCorsHeaders(
        NextResponse.json({ error: "Invalid signupPlatform" }, { status: 400 }),
      );
    }

    if (
      webOnboardingStep !== undefined &&
      webOnboardingStep !== null &&
      (!Number.isInteger(webOnboardingStep) ||
        (webOnboardingStep as number) < 1 ||
        (webOnboardingStep as number) > 5)
    ) {
      return addCorsHeaders(
        NextResponse.json({ error: "Invalid webOnboardingStep" }, { status: 400 }),
      );
    }

    // Build update payload — spread existing metadata so we never wipe fields like userType
    const publicMetadata: Record<string, unknown> = { ...currentPublicMetadata };
    const privateMetadata: Record<string, unknown> = { ...currentPrivateMetadata };

    // PUBLIC
    if (userType) publicMetadata.userType = userType;

    const resolvedMobileCompleted = hasCompletedMobileOnboarding ?? hasCompletedOnboarding;
    if (resolvedMobileCompleted !== undefined)
      publicMetadata.hasCompletedMobileOnboarding = resolvedMobileCompleted;
    if (hasCompletedWebOnboarding !== undefined)
      publicMetadata.hasCompletedWebOnboarding = hasCompletedWebOnboarding;
    if (hasCompletedWebTour !== undefined)
      publicMetadata.hasCompletedWebTour = hasCompletedWebTour;
    if (webOnboardingStep === null) {
      delete publicMetadata.webOnboardingStep;
    } else if (webOnboardingStep !== undefined) {
      publicMetadata.webOnboardingStep = webOnboardingStep;
    }

    // signupPlatform is write-once — preserve original if already set
    if (signupPlatform && !currentPublicMetadata.signupPlatform) {
      publicMetadata.signupPlatform = signupPlatform;
    }

    // PRIVATE
    if (companyName) privateMetadata.companyName = companyName;
    if (professionalLink) privateMetadata.professionalLink = professionalLink;
    if (facebookUrl) privateMetadata.facebookUrl = facebookUrl;
    if (location) privateMetadata.location = location;
    if (sex) privateMetadata.sex = sex;
    if (dateOfBirth) privateMetadata.dateOfBirth = dateOfBirth;

    // mobileOnboardingData (onboardingData is the legacy alias)
    const resolvedMobileData = mobileOnboardingData ?? onboardingData;
    if (resolvedMobileData) privateMetadata.mobileOnboardingData = resolvedMobileData;

    // webOnboardingData — deep-merged so incremental step saves accumulate
    if (webOnboardingData) {
      const existing = (currentPrivateMetadata.webOnboardingData ?? {}) as Record<string, unknown>;
      privateMetadata.webOnboardingData = {
        ...existing,
        ...(webOnboardingData as Record<string, unknown>),
      };
    }

    await clerk.users.updateUser(userId, {
      ...(trimmedFirstName ? { firstName: trimmedFirstName } : {}),
      ...(trimmedLastName ? { lastName: trimmedLastName } : {}),
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
      hasCompletedMobileOnboarding:
        typeof resolvedMobileCompleted === "boolean" ? resolvedMobileCompleted : null,
      hasCompletedWebOnboarding:
        typeof hasCompletedWebOnboarding === "boolean" ? hasCompletedWebOnboarding : null,
      signupPlatform:
        typeof signupPlatform === "string"
          ? signupPlatform
          : typeof currentPublicMetadata.signupPlatform === "string"
            ? currentPublicMetadata.signupPlatform
            : null,
    });

    if (typeof userType === "string" && userType !== previousUserType) {
      await captureServerEvent(userId, "user_type_selected", {
        userType,
        previous_type: previousUserType,
      });
    }

    const resolvedOnboardingPayload = (
      typeof webOnboardingData === "object" && webOnboardingData !== null
        ? webOnboardingData
        : typeof resolvedMobileData === "object" && resolvedMobileData !== null
          ? resolvedMobileData
          : {}
    ) as Record<string, unknown>;

    const isCompleted = hasCompletedWebOnboarding === true || resolvedMobileCompleted === true;
    if (isCompleted) {
      await captureServerEvent(userId, "onboarding_completed", {
        userType: selectedUserType,
        platform:
          typeof signupPlatform === "string"
            ? signupPlatform
            : hasCompletedWebOnboarding === true
              ? "web"
              : "mobile",
        location:
          typeof resolvedOnboardingPayload.location === "string"
            ? resolvedOnboardingPayload.location
            : typeof location === "string"
              ? location
              : null,
        budget:
          typeof resolvedOnboardingPayload.budget === "number"
            ? resolvedOnboardingPayload.budget
            : null,
        service_areas: Array.isArray(resolvedOnboardingPayload.serviceAreas)
          ? resolvedOnboardingPayload.serviceAreas
              .filter((item): item is string => typeof item === "string")
              .join(",")
          : null,
        portfolio_size:
          typeof resolvedOnboardingPayload.portfolioSize === "number"
            ? resolvedOnboardingPayload.portfolioSize
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
      // Snapshot signup geo from Clerk's session geoIP. Best-effort —
      // a Clerk API hiccup must not block the onboarding flow.
      const signupGeo = await fetchClerkSignupGeo(userId).catch(() => null);
      await createUserInSupabase(
        userData,
        signupGeo ? { signupGeo } : undefined,
      );
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
