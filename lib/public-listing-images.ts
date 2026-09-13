import { createHash, randomUUID } from "node:crypto";

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

// The mobile submission flow can replay a completed upload. Identical bytes
// retain their URL; an edited/replacement photo gets a different immutable URL.
export function createContentAddressedListingImagePath(
  directory: string,
  extension: string,
  bytes: Uint8Array,
): string {
  const format = extension === "png" ? "png" : extension === "heic" ? "heic" : "jpg";
  const digest = createHash("sha256").update(bytes).digest("hex");
  return `${directory}/sha256-${digest}.${format}`;
}
