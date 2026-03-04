import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

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
  "/personnel/rejoindre",
  "/louer/residentiel",
  "/louer/commercial",
  "/publier-bien",
  "/api/careers/apply",
  // API routes that need to be public (webhooks, health)
  "/api/health",
  "/api/pawapay/callback",
  "/api/clerk/webhook",
  "/api/clerk/users/me/metadata",  // Mobile app uses JWT auth, not session
  "/api/cron/(.*)",
  "/api/account/delete-request",
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
  if (!isPublicRoute(req)) {
    await auth.protect();

    if (!isOnboardingGateExempt(req)) {
      const { sessionClaims } = await auth();
      const meta = (sessionClaims?.metadata as Record<string, unknown> | undefined) ?? {};

      const hasCompletedWeb = meta.hasCompletedWebOnboarding === true;
      const hasCompletedMobile =
        meta.hasCompletedMobileOnboarding === true ||
        // legacy alias
        (meta as Record<string, unknown>).hasCompletedOnboarding === true;
      const userType = typeof meta.userType === "string" ? meta.userType : "";

      // Staff and founders are never blocked by the onboarding gate
      const isBypassRole = ["staff", "founder"].includes(userType);

      if (!hasCompletedWeb && !hasCompletedMobile && !isBypassRole) {
        return NextResponse.redirect(new URL("/onboarding", req.url));
      }
    }
  }
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
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\..*).*)","/(api|trpc)(.*)",
  ],
};
