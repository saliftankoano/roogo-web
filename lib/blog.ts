import {
  getTutorialPath,
  getYouTubeThumbnail,
  tutorials,
  type Tutorial,
} from "./tutorials";

export type BlogCategorySlug = "tutoriels";

export type BlogCategory = {
  slug: BlogCategorySlug;
  name: string;
  description: string;
  href: string;
};

export type BlogPost = {
  slug: string;
  title: string;
  excerpt: string;
  href: string;
  category: BlogCategory;
  publishedAt: string;
  readingTimeMinutes: number;
  thumbnailUrl: string;
  tutorial: Tutorial;
};

export const tutorialCategory: BlogCategory = {
  slug: "tutoriels",
  name: "Tutoriels",
  description:
    "Des démonstrations vidéo et des guides pas à pas pour utiliser Roogo sereinement.",
  href: "/blog/tutoriels",
};

export const blogCategories: BlogCategory[] = [tutorialCategory];

const readingTimes: Record<string, number> = {
  "comment-s-inscrire-roogo-proprietaire": 6,
  "comment-mettre-bien-en-vente-roogo": 8,
};

export const blogPosts: BlogPost[] = tutorials.map((tutorial) => ({
  slug: tutorial.slug,
  title: tutorial.title,
  excerpt: tutorial.summary,
  href: getTutorialPath(tutorial),
  category: tutorialCategory,
  publishedAt:
    tutorial.videos.horizontal.alimata.uploadDate ?? "2026-08-28T00:00:00Z",
  readingTimeMinutes: readingTimes[tutorial.slug] ?? 6,
  thumbnailUrl: getYouTubeThumbnail(
    tutorial.videos.horizontal.alimata.id,
  ),
  tutorial,
}));

export function formatBlogDate(date: string) {
  return new Intl.DateTimeFormat("fr-BF", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Africa/Ouagadougou",
  }).format(new Date(date));
}
