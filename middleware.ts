import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/about",
  "/contact",
  "/carrieres",
  "/privacy",
  "/terms",
  "/location",
  "/staff/join",
  // API routes that need to be public (webhooks, health)
  "/api/health",
  "/api/pawapay/callback",
  "/api/clerk/webhook",
  "/api/cron/(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: ["/((?!.+\\.[\\w]+$|_next).*)", "/", "/(api|trpc)(.*)"],
};
