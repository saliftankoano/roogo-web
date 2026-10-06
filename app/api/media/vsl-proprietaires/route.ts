import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

// Streams the owner VSL from the private `site-videos` bucket. The browser only
// ever sees this route; the Supabase object URL (and its signature) never leave
// the server. Range requests are passed through so seeking works.
const BUCKET = "site-videos";
const OBJECT_PATH = "vsl-proprietaires.mp4";
const PASS_THROUGH_HEADERS = [
  "content-length",
  "content-range",
  "accept-ranges",
  "etag",
  "last-modified",
];

export const dynamic = "force-dynamic";

async function stream(req: NextRequest, method: "GET" | "HEAD") {
  const { data, error } = await supabaseAdmin.storage
    .from(BUCKET)
    .createSignedUrl(OBJECT_PATH, 60);
  if (error || !data?.signedUrl) {
    return new NextResponse("Video unavailable", { status: 502 });
  }

  const upstreamHeaders: Record<string, string> = {};
  const range = req.headers.get("range");
  if (range) upstreamHeaders.range = range;

  const upstream = await fetch(data.signedUrl, {
    method,
    headers: upstreamHeaders,
  });
  if (!upstream.ok && upstream.status !== 206) {
    return new NextResponse("Video unavailable", { status: 502 });
  }

  const headers = new Headers({
    "content-type": "video/mp4",
    "cache-control": "public, max-age=3600",
    "x-content-type-options": "nosniff",
  });
  for (const name of PASS_THROUGH_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  if (!headers.has("accept-ranges")) headers.set("accept-ranges", "bytes");

  return new NextResponse(method === "HEAD" ? null : upstream.body, {
    status: upstream.status,
    headers,
  });
}

export function GET(req: NextRequest) {
  return stream(req, "GET");
}

export function HEAD(req: NextRequest) {
  return stream(req, "HEAD");
}
