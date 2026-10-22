import { MetadataRoute } from "next";

// Rebuild hourly so new listings (and any slug changes) reach Google without
// waiting for the next deploy.
export const revalidate = 3600;
import { fetchAllOnlineProperties } from "../lib/data";
import { getPropertyPath } from "../lib/property-url";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = "https://www.roogobf.com";

  // Omit lastModified unless a real content update date is known.
  // Rebuilding the sitemap does not mean these pages changed.
  // Static pages
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${baseUrl}/proprietes`,
      changeFrequency: "hourly",
      priority: 0.9,
    },
    {
      url: `${baseUrl}/visites-3d`,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/nous-contacter`,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${baseUrl}/carrieres`,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${baseUrl}/a-propos`,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${baseUrl}/blog`,
      lastModified: new Date("2026-08-28"),
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/blog/tutoriels`,
      lastModified: new Date("2026-08-28"),
      changeFrequency: "monthly",
      priority: 0.75,
    },
    {
      url: `${baseUrl}/blog/comment-s-inscrire-roogo-proprietaire`,
      lastModified: new Date("2026-08-28"),
      changeFrequency: "monthly",
      priority: 0.75,
    },
    {
      url: `${baseUrl}/blog/comment-mettre-bien-en-vente-roogo`,
      lastModified: new Date("2026-08-28"),
      changeFrequency: "monthly",
      priority: 0.75,
    },
    {
      url: `${baseUrl}/plan-du-site`,
      changeFrequency: "monthly",
      priority: 0.3,
    },
    {
      url: `${baseUrl}/conditions-utilisation`,
      changeFrequency: "monthly",
      priority: 0.4,
    },
    {
      url: `${baseUrl}/confidentialite`,
      changeFrequency: "monthly",
      priority: 0.4,
    },
  ];

  try {
    const properties = await fetchAllOnlineProperties();
    const propertyPages: MetadataRoute.Sitemap = properties.map((p) => ({
      url: `${baseUrl}${getPropertyPath(p)}`,
      lastModified: p.created_at ? new Date(p.created_at) : new Date(),
      changeFrequency: "weekly",
      priority: 0.7,
    }));

    return [...staticPages, ...propertyPages];
  } catch (error) {
    console.error("Error generating dynamic sitemap parts:", error);
    return staticPages;
  }
}
