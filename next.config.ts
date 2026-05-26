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
      {
        source: "/louer/residentiel",
        destination: "/proprietes?category=Residential",
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
