import { errorResponse } from "@/lib/api-helpers";
import { getStaffOrFounder } from "@/lib/api-auth";
import { loadFieldMedia, mediaTokenSecret } from "@/lib/studio/field-media";
import { verifyMediaToken } from "@/lib/studio/field-media-token";
import { fetchDriveMedia, fetchDriveThumbnail } from "@/lib/studio/google-drive";

// Long videos are streamed through this function; 5 minutes covers a 1 GB
// file at the speeds HeyGen downloads, and players use Range requests anyway.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * Streams one field media file from Google Drive, Range requests included.
 * Two ways in:
 *   - a staff browser session (the Studio panel), or
 *   - ?exp=<unix seconds>&token=<hmac> from signedFieldMediaUrl(), for HeyGen
 *     and other renderers without a session. The token opens this file only,
 *     until exp. This path is public in middleware.ts for that reason.
 * ?thumb=1 returns Drive's small preview image instead of the file.
 */
async function handle(req: Request, params: Promise<{ id: string }>, method: "GET" | "HEAD") {
  const { id } = await params;
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const exp = url.searchParams.get("exp");

  let allowed = false;
  if (token) {
    try {
      allowed = verifyMediaToken(mediaTokenSecret(), id, exp, token);
    } catch {
      allowed = false;
    }
  }
  if (!allowed) allowed = !!(await getStaffOrFounder(req));
  if (!allowed) return errorResponse("Lien expiré ou invalide.", 403);

  const row = await loadFieldMedia(id);
  if (!row || row.status !== "ready" || !row.drive_file_id) return errorResponse("Fichier introuvable.", 404);

  const common: Record<string, string> = {
    "Cache-Control": "private, max-age=3600",
    "X-Robots-Tag": "noindex",
  };

  if (url.searchParams.get("thumb") === "1") {
    const thumb = await fetchDriveThumbnail(row.drive_file_id).catch(() => null);
    if (!thumb?.body) return errorResponse("Aperçu indisponible.", 404);
    return new Response(thumb.body, {
      headers: { ...common, "Content-Type": thumb.headers.get("content-type") ?? "image/jpeg" },
    });
  }

  const range = req.headers.get("range");
  let upstream: Response;
  try {
    upstream = await fetchDriveMedia(row.drive_file_id, range, method);
  } catch (error) {
    console.error("Studio: field media stream failed", id, error instanceof Error ? error.message : error);
    return errorResponse("Google Drive est injoignable.", 502);
  }
  if (![200, 206, 416].includes(upstream.status)) {
    console.error("Studio: field media stream upstream", id, upstream.status);
    await upstream.body?.cancel().catch(() => undefined);
    return errorResponse(`Google Drive a répondu ${upstream.status}.`, 502);
  }

  const headers = new Headers(common);
  headers.set("Content-Type", row.mime_type);
  headers.set("Accept-Ranges", "bytes");
  headers.set("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(row.file_name)}`);

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
