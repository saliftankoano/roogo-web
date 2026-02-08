import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/connexion(.*)",
  "/inscription(.*)",
  "/a-propos",
  "/contact",
  "/carrieres",
  "/confidentialite",
  "/conditions",
  "/robots.txt",
  "/sitemap.xml",
  "/supprimer-compte",
  "/personnel/rejoindre",
  "/proprietes",
  "/louer/residentiel",
  "/louer/commercial",
  "/publier-bien",
  // API routes that need to be public (webhooks, health)
  "/api/health",
  "/api/pawapay/callback",
  "/api/clerk/webhook",
  "/api/clerk/users/me/metadata",  // Mobile app uses JWT auth, not session
  "/api/cron/(.*)",
  "/api/account/delete-request",
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: ["/((?!.+\\.[\\w]+$|_next).*)", "/", "/(api|trpc)(.*)"],
};
