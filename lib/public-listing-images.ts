import { randomUUID } from "node:crypto";

// Only public listing photos use this lifetime. Replacements must get a new URL;
// signed documents and mutable avatars keep their own cache policies.
export const PUBLIC_LISTING_IMAGE_CACHE_CONTROL = "2592000"; // 30 days

export function createPublicListingImagePath(
  directory: string,
  extension: string,
): string {
  const format = extension === "png" ? "png" : extension === "heic" ? "heic" : "jpg";
  return `${directory}/${randomUUID()}.${format}`;
}
