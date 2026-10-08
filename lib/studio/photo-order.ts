// Photo order for the video template: pure helpers, tested in node.

/** Moves one item of a list to another index. Out-of-range moves are ignored. */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** Keeps a saved order, drops photos that left the listing, appends new ones. */
export function mergeOrder(saved: string[], photos: string[]): string[] {
  const kept = saved.filter((url) => photos.includes(url));
  return [...kept, ...photos.filter((url) => !kept.includes(url))];
}
