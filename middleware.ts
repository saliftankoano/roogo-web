import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
  ROOGO_MEBO_HOST,
  ROOGO_PRIMARY_ORIGIN,
  getForwardedRequestHost,
  getMeboRewritePath,
  isMeboHost,
  isMeboPublicPath,
  isProductionMeboHost,
} from "./lib/site-context";

type OnboardingGateState = {
  hasCompletedOnboarding: boolean;
  userType: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getOnboardingGateState(
  metadata: Record<string, unknown>,
): OnboardingGateState {
  const hasCompletedWeb = metadata.hasCompletedWebOnboarding === true;
  const hasCompletedMobile =
    metadata.hasCompletedMobileOnboarding === true ||
    metadata.hasCompletedOnboarding === true;
  const userType =
    typeof metadata.userType === "string" ? metadata.userType : "";

  return {
    hasCompletedOnboarding: hasCompletedWeb || hasCompletedMobile,
    userType,
  };
}

function getSessionMetadata(
  sessionClaims: Record<string, unknown> | null | undefined,
) {
  const metadata = isRecord(sessionClaims?.metadata)
    ? sessionClaims.metadata
    : {};
  const publicMetadata = isRecord(sessionClaims?.publicMetadata)
    ? sessionClaims.publicMetadata
    : {};

  // Support both configured custom claims (`metadata`) and direct/root claims.
  return {
    ...(sessionClaims ?? {}),
    ...publicMetadata,
    ...metadata,
  };
}

async function getUserMetadataGateState(
  userId: string,
): Promise<OnboardingGateState | null> {
  const secretKey = process.env.CLERK_SECRET_KEY;

  if (!secretKey) {
    return null;
  }

  try {
    const response = await fetch(
      `https://api.clerk.com/v1/users/${encodeURIComponent(userId)}`,
      {
        headers: {
          Authorization: `Bearer ${secretKey}`,
          "Content-Type": "application/json",
        },
        cache: "no-store",
      },
    );

    if (!response.ok) {
      console.error(
        "Onboarding gate: failed to fetch Clerk user metadata",
        response.status,
      );
      return null;
    }

    const data = (await response.json()) as Record<string, unknown>;
    const publicMetadata = isRecord(data.public_metadata)
      ? data.public_metadata
      : isRecord(data.publicMetadata)
        ? data.publicMetadata
        : {};

    return getOnboardingGateState(publicMetadata);
  } catch (error) {
    console.error("Onboarding gate: Clerk metadata fallback failed", error);
    return null;
  }
}

const isPublicRoute = createRouteMatcher([
  "/",
  "/connexion(.*)",
  "/inscription(.*)",
  "/a-propos",
  "/nous-contacter",
  "/carrieres",
  "/confidentialite",
  "/conditions-utilisation",
  "/robots.txt",
  "/sitemap.xml",
  "/supprimer-compte",
  "/app",
  "/personnel/rejoindre",
  "/talent(.*)",
  "/parrainage(.*)",
  "/blog(.*)",
  "/tutoriels(.*)",
  "/proprietes",
  "/visites-3d",
  "/mebo",
  "/mebo/plans(.*)",
  "/mebo/vendeurs(.*)",
  "/louer/residentiel",
  "/louer/commercial",
  "/publier-bien",
  "/api/careers/apply",
  // API routes that need to be public (webhooks, health)
  "/api/health",
  "/api/app-version", // Public: mobile update-available check, no auth
  "/api/pawapay/callback",
  // Visites 3D self-serve booking — anonymous public flow
  "/api/visites-3d/(.*)",
  "/api/clerk/webhook",
  "/api/clerk/users/me/metadata", // Mobile app uses JWT auth, not session
  "/api/favorites", // Mobile app authenticates this route with Bearer JWT
  "/api/applications/me", // Mobile app authenticates this route with Bearer JWT
  "/api/users/me/pending-edits", // Mobile app authenticates this route with Bearer JWT
  "/api/identity-verifications/(.*)", // Mobile app authenticates these routes with Bearer JWT
  "/api/advertising/(.*)", // Mobile app authenticates these routes with Bearer JWT
  "/api/support/conversation", // Mobile app authenticates this route with Bearer JWT
  "/api/support/upload-url", // Mobile app authenticates this route with Bearer JWT
  "/api/support/messages", // Mobile app authenticates this route with Bearer JWT
  // Support staff console — mobile authenticates with Bearer JWT; routes gate on
  // isStaffLikeUserType internally, so exposing them here doesn't relax authorization.
  "/api/support/admin/(.*)",
  "/api/cron/(.*)",
  "/api/account/delete-request",
  // Availability data is public — any user can see blocked dates
  "/api/properties/(.*)/availability",
  // Hotel room types + count-based availability — guests browse anonymously;
  // write methods authenticate with Bearer JWT inside the route handlers.
  "/api/properties/(.*)/room-types",
  "/api/room-types/(.*)",
  // Pending-edits — mobile authenticates with Bearer JWT
  "/api/properties/(.*)/pending-edits",
  // Ownership documents (Roogo Sell) — mobile authenticates with Bearer JWT
  "/api/properties/(.*)/ownership-documents",
  "/api/properties/(.*)/ownership-documents/upload-url",
  // Sale chat — mobile authenticates with Bearer JWT
  "/api/sale-chat/(.*)",
  // Shared property links — must be accessible without sign-in
  "/p/(.*)",
  "/proprietes/(.*)",
  // Payment callback — accessed from PawaPay redirect; Safari has no Clerk session
  "/payments/callback",
]);

// Routes that bypass the onboarding gate:
// - onboarding itself (prevents redirect loop)
// - admin/personnel routes (staff and founders are exempt)
// - all API routes (server-side, no session-based gate needed)
const isOnboardingGateExempt = createRouteMatcher([
  "/onboarding(.*)",
  "/admin(.*)",
  "/personnel(.*)",
  "/api(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  const requestHost = getForwardedRequestHost(req.headers);
  const isMarketplaceRequest = isMeboHost(requestHost);
  const isInternalMarketplacePublicRequest =
    req.nextUrl.pathname === "/mebo" ||
    req.nextUrl.pathname.startsWith("/mebo/plans") ||
    req.nextUrl.pathname.startsWith("/mebo/vendeurs");
  const isPublicRequest =
    isPublicRoute(req) ||
    isInternalMarketplacePublicRequest ||
    (isMarketplaceRequest && isMeboPublicPath(req.nextUrl.pathname));

  if (!isPublicRequest) {
    await auth.protect();

    // Roogo Immobilier onboarding is intentionally product-specific. A user
    // can browse or use Roogo Mêbo without being pushed into a renter/owner/
    // agent choice that belongs to the real-estate product.
    if (!isMarketplaceRequest && !isOnboardingGateExempt(req)) {
      const { sessionClaims, userId } = await auth();
      const sessionGateState = getOnboardingGateState(
        getSessionMetadata(sessionClaims as Record<string, unknown> | null),
      );
      const serverGateState =
        !sessionGateState.hasCompletedOnboarding &&
        !["staff", "founder"].includes(sessionGateState.userType) &&
        userId
          ? await getUserMetadataGateState(userId)
          : null;
      const gateState = serverGateState ?? sessionGateState;

      // Staff and founders are never blocked by the onboarding gate
      const isBypassRole = ["staff", "founder"].includes(gateState.userType);

      if (!gateState.hasCompletedOnboarding && !isBypassRole) {
        return NextResponse.redirect(new URL("/onboarding", req.url));
      }
    }
  }

  if (isMarketplaceRequest) {
    const internalPath = getMeboRewritePath(req.nextUrl.pathname);

    if (internalPath) {
      const rewriteUrl = req.nextUrl.clone();
      rewriteUrl.pathname = internalPath;
      return NextResponse.rewrite(rewriteUrl);
    }
  }
}, (req) => {
  const requestHost = getForwardedRequestHost(req.headers);

  if (!isProductionMeboHost(requestHost)) {
    return {};
  }

  return {
    isSatellite: true,
    domain: ROOGO_MEBO_HOST,
    signInUrl: `${ROOGO_PRIMARY_ORIGIN}/connexion`,
    signUpUrl: `${ROOGO_PRIMARY_ORIGIN}/inscription`,
  };
});

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt (metadata files)
     * - .* files with extension (static files like .png, .jpg, .svg, .ico, .css, .js)
     */
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\..*).*)",
    "/(api|trpc)(.*)",
  ],
};
