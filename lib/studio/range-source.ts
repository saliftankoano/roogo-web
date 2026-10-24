// Reads a video by byte ranges from a signed URL (our Drive stream route or a
// Supabase signed URL, both answer Range requests), so the TikTok upload holds
// one chunk at a time and never the whole file. No runtime imports: tested
// with a fake fetch in publish-everywhere.test.mjs.

export type RangeFetch = (
  url: string,
  init: { method: string; headers: Record<string, string> },
) => Promise<{
  ok: boolean;
  status: number;
  headers: { get: (name: string) => string | null };
  arrayBuffer: () => Promise<ArrayBuffer>;
  body?: { cancel?: () => Promise<void> } | null;
}>;

/** "bytes 0-0/52428800" -> 52428800. */
export function totalFromContentRange(value: string | null | undefined): number | null {
  const match = /\/(\d+)\s*$/.exec(value ?? "");
  return match ? Number(match[1]) : null;
}

export function rangeSource(fetchImpl: RangeFetch, url: string, knownSize?: number | null) {
  let size: number | null = knownSize && knownSize > 0 ? knownSize : null;

  async function readRange(start: number, end: number): Promise<Uint8Array> {
    const res = await fetchImpl(url, { method: "GET", headers: { Range: `bytes=${start}-${end}` } });
    const expected = end - start + 1;
    const length = Number(res.headers.get("content-length"));
    // A server that ignores Range answers 200 with the whole file: refuse it
    // instead of loading hundreds of MB into the function's memory.
    if (res.status === 200 && !(start === 0 && Number.isFinite(length) && length === expected)) {
      await res.body?.cancel?.().catch(() => undefined);
      throw new Error("ROOGO:Le stockage ne permet pas de lire la vidéo par morceaux.");
    }
    if (res.status !== 206 && res.status !== 200) {
      await res.body?.cancel?.().catch(() => undefined);
      throw new Error(`ROOGO:La vidéo n'a pas pu être lue depuis le stockage (${res.status}).`);
    }
    return new Uint8Array(await res.arrayBuffer());
  }

  return {
    url,
    readRange,
    async size(): Promise<number> {
      if (size) return size;
      const res = await fetchImpl(url, { method: "GET", headers: { Range: "bytes=0-0" } });
      await res.body?.cancel?.().catch(() => undefined);
      const total = totalFromContentRange(res.headers.get("content-range"));
      if (res.status !== 206 || !total) throw new Error("ROOGO:La taille de la vidéo n'a pas pu être lue.");
      size = total;
      return total;
    },
  };
}
