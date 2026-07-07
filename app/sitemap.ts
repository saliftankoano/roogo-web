import { MetadataRoute } from "next";
import { fetchProperties } from "../lib/data";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = "https://www.roogobf.com";

  // Static pages
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${baseUrl}/proprietes`,
      lastModified: new Date(),
      changeFrequency: "hourly",
      priority: 0.9,
    },
    {
      url: `${baseUrl}/visites-3d`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/nous-contacter`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${baseUrl}/carrieres`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${baseUrl}/a-propos`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${baseUrl}/conditions-utilisation`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.4,
    },
    {
      url: `${baseUrl}/confidentialite`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.4,
    },
  ];

  // Try to fetch properties for future-proofing
  try {
    const { properties } = await fetchProperties();
    const propertyPages: MetadataRoute.Sitemap = properties
      .filter((p) => p.status === "en_ligne")
      .map((p) => ({
        url: `${baseUrl}/proprietes/${p.id}`,
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
