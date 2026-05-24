import { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin/", "/api/", "/personnel/", "/connexion", "/inscription"],
      },
    ],
    sitemap: "https://www.roogobf.com/sitemap.xml",
  };
}
