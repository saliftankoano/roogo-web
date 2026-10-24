import { errorResponse } from "@/lib/api-helpers";
import { getStaffOrFounder } from "@/lib/api-auth";
import { loadFinalVideo, verifyFinalVideoToken } from "@/lib/studio/final-videos-server";
import { fetchDriveMedia } from "@/lib/studio/google-drive";

// A 500 MB video streamed to Instagram, Facebook or TikTok; 5 minutes covers
// it at the speeds they download, and players use Range requests anyway.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * Streams one final video from Google Drive, Range requests included.
 * Two ways in:
 *   - a staff browser session (the Studio preview, Salif's approval screen), or
 *   - ?exp=<unix seconds>&token=<hmac> from signedFinalVideoUrl(), for Meta and
 *     TikTok, which download without a session. The token opens this video
 *     only, until exp. This path is public in middleware.ts for that reason.
 */
async function handle(req: Request, params: Promise<{ id: string }>, method: "GET" | "HEAD") {
  const { id } = await params;
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  let allowed = token ? verifyFinalVideoToken(id, url.searchParams.get("exp"), token) : false;
  if (!allowed) allowed = !!(await getStaffOrFounder(req));
  if (!allowed) return errorResponse("Lien expiré ou invalide.", 403);

  const row = await loadFinalVideo(id);
  if (!row || row.status !== "ready" || !row.drive_file_id) return errorResponse("Vidéo introuvable.", 404);

  const range = req.headers.get("range");
  let upstream: Response;
  try {
    upstream = await fetchDriveMedia(row.drive_file_id, range, method);
  } catch (error) {
    console.error("Studio: final video stream failed", id, error instanceof Error ? error.message : error);
    return errorResponse("Google Drive est injoignable.", 502);
  }
  if (![200, 206, 416].includes(upstream.status)) {
    console.error("Studio: final video stream upstream", id, upstream.status);
    await upstream.body?.cancel().catch(() => undefined);
    return errorResponse(`Google Drive a répondu ${upstream.status}.`, 502);
  }

  const headers = new Headers({ "Cache-Control": "private, max-age=3600", "X-Robots-Tag": "noindex" });
  headers.set("Content-Type", row.mime_type);
  headers.set("Accept-Ranges", "bytes");
  headers.set("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(row.drive_name)}`);
  if (method === "HEAD" && !range) {
    await upstream.body?.cancel().catch(() => undefined);
    headers.set("Content-Length", String(row.size_bytes));
    return new Response(null, { status: 200, headers });
  }
  for (const name of ["content-length", "content-range"]) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  if (method === "HEAD") {
    await upstream.body?.cancel().catch(() => undefined);
    return new Response(null, { status: upstream.status, headers });
  }
  return new Response(upstream.body, { status: upstream.status, headers });
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(req, params, "GET");
}

export async function HEAD(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(req, params, "HEAD");
}
