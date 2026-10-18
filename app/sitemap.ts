import { MetadataRoute } from "next";

// Rebuild hourly so new listings (and any slug changes) reach Google without
// waiting for the next deploy.
export const revalidate = 3600;
import { fetchAllOnlineProperties } from "../lib/data";
import { getPropertyPath } from "../lib/property-url";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = "https://www.roogobf.com";

  let properties: Awaited<ReturnType<typeof fetchAllOnlineProperties>> = [];
  try {
    properties = await fetchAllOnlineProperties();
  } catch (error) {
    console.error("Error generating dynamic sitemap parts:", error);
  }

  // The home page and /proprietes change when a listing does. Other static
  // pages carry no lastmod: stamping them "now" on every build taught Google
  // to ignore our lastmod values, listings included.
  const latestListingEdit = properties.reduce<Date | undefined>((latest, p) => {
    const edited = new Date(p.updated_at || p.created_at || 0);
    return !latest || edited > latest ? edited : latest;
  }, undefined);

  // Static pages
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: latestListingEdit,
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${baseUrl}/proprietes`,
      lastModified: latestListingEdit,
      changeFrequency: "hourly",
      priority: 0.9,
    },
    {
      url: `${baseUrl}/proprietaires`,
      changeFrequency: "monthly",
      priority: 0.8,
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

  const propertyPages: MetadataRoute.Sitemap = properties.map((p) => ({
    url: `${baseUrl}${getPropertyPath(p)}`,
    // Real last edit, so a price or photo change tells Google to recrawl.
    lastModified: new Date(p.updated_at || p.created_at || Date.now()),
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  return [...staticPages, ...propertyPages];
}
