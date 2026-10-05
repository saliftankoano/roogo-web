/** Keep persisted order, while honoring a cover selected by older clients. */
export function principalPhotoFirst(urls: string[], primaryUrl?: string): string[] {
  const photos = [...new Set(urls.filter((url) => typeof url === "string" && url.trim()))];
  if (!primaryUrl || !photos.includes(primaryUrl)) return photos;
  return [primaryUrl, ...photos.filter((url) => url !== primaryUrl)];
}

/** Move one photo into the target slot; all intervening photos retain order. */
export function movePhoto(urls: string[], from: number, to: number): string[] {
  if (from < 0 || to < 0 || from >= urls.length || to >= urls.length || from === to) return urls;
  const next = [...urls];
  const [photo] = next.splice(from, 1);
  next.splice(to, 0, photo);
  return next;
}
