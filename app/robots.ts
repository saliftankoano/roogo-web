import { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin/", "/api/", "/staff/", "/sign-in", "/sign-up"],
      },
    ],
    sitemap: "https://roogo.bf/sitemap.xml",
  };
}
