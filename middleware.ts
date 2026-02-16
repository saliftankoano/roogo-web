import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

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
