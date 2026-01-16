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
        hostname: "img.clerk.com",
        port: "",
        pathname: "/**",
      },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb", // Increase body size limit for image uploads
    },
  },
  async redirects() {
    return [
      {
        source: '/rent/residential',
        destination: '/location?category=Residential',
        permanent: true,
      },
      {
        source: '/rent/commercial',
        destination: '/location?category=Business',
        permanent: true,
      },
      {
        source: '/list-property',
        destination: '/', // Or a dedicated page if it existed, for now back to home
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
