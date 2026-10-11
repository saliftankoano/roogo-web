import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "txbxvpyftgpebgnuazaf.supabase.co",
        port: "",
        pathname: "/storage/v1/object/public/**",
      },
      {
        protocol: "https",
        hostname: "txbxvpyftgpebgnuazaf.supabase.co",
        port: "",
        pathname: "/storage/v1/object/sign/**",
      },
      {
        protocol: "https",
        hostname: "img.clerk.com",
        port: "",
        pathname: "/**",
      },
    ],
  },
  // The ffmpeg binary is spawned at runtime (Studio video compression), so it
  // must not be bundled and must ship with the route that uses it.
  serverExternalPackages: ["ffmpeg-static"],
  outputFileTracingIncludes: {
    "/api/admin/studio/videos/[id]": ["./node_modules/ffmpeg-static/ffmpeg"],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "25mb", // Increase body size limit for image uploads
    },
    // Default is 10 MB; base64-encoded image JSON bodies can exceed that
    // on mobile photo batches. Raise to avoid silent truncation of the
    // request body (which surfaces as SyntaxError in req.json()).
    middlewareClientMaxBodySize: "25mb",
  },
  async redirects() {
    return [
      // French addresses (Salif, 2026-10-11). Old links, bookmarks and payments
      // already in progress keep working; query strings are carried over.
      { source: "/onboarding", destination: "/bienvenue", permanent: true },
      { source: "/payments/callback", destination: "/paiements/retour", permanent: true },
      { source: "/admin/property-requests/:id/responses/:responseId/agreement", destination: "/admin/demandes-de-biens/:id/reponses/:responseId/accord", permanent: true },
      { source: "/admin/property-requests/:path*", destination: "/admin/demandes-de-biens/:path*", permanent: true },
      { source: "/admin/visit-requests/:path*", destination: "/admin/demandes-de-visite/:path*", permanent: true },
      { source: "/admin/ownership-verifications/:path*", destination: "/admin/verifications-propriete/:path*", permanent: true },
      { source: "/admin/hotel-verifications/:path*", destination: "/admin/verifications-hotels/:path*", permanent: true },
      { source: "/admin/hotel-events/:path*", destination: "/admin/evenements-hotels/:path*", permanent: true },
      { source: "/admin/sale-chat/:path*", destination: "/admin/discussions-vente/:path*", permanent: true },
      { source: "/admin/support/:path*", destination: "/admin/assistance/:path*", permanent: true },

      {
        source: "/tutoriels",
        destination: "/blog/tutoriels",
        permanent: true,
      },
      {
        source: "/tutoriels/:slug",
        destination: "/blog/:slug",
        permanent: true,
      },
      {
        source: "/louer/residentiel",
        destination: "/proprietes",
        permanent: true,
      },
      {
        source: "/louer/commercial",
        destination: "/proprietes?category=Business",
        permanent: true,
      },
      {
        source: "/publier-bien",
        destination: "/", // Or a dedicated page if it existed, for now back to home
        permanent: false,
      },
      // Old routes redirects for backwards compatibility
      {
        source: "/location",
        destination: "/proprietes",
        permanent: true,
      },
      {
        source: "/about",
        destination: "/a-propos",
        permanent: true,
      },
      {
        source: "/privacy",
        destination: "/confidentialite",
        permanent: true,
      },
      {
        source: "/terms",
        destination: "/conditions",
        permanent: true,
      },
      {
        source: "/deleteme",
        destination: "/supprimer-compte",
        permanent: true,
      },
      {
        source: "/sign-in",
        destination: "/connexion",
        permanent: true,
      },
      {
        source: "/sign-up",
        destination: "/inscription",
        permanent: true,
      },
      {
        source: "/staff/join",
        destination: "/personnel/rejoindre",
        permanent: true,
      },
      {
        source: "/listings/create",
        destination: "/annonces/creer",
        permanent: true,
      },
      {
        source: "/contact",
        destination: "/nous-contacter",
        permanent: true,
      },
      {
        source: "/conditions",
        destination: "/conditions-utilisation",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
