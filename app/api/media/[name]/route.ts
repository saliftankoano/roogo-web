import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

// Streams the site videos from the private `site-videos` bucket. The browser
// only ever sees this route; the Supabase object URL (and its signature) never
// leave the server. Range requests are passed through so seeking works.
const BUCKET = "site-videos";
const OBJECTS: Record<string, string> = {
  "vsl-proprietaires": "vsl-proprietaires.mp4",
  "vsl-locataires": "vsl-locataires.mp4",
};
const PASS_THROUGH_HEADERS = [
  "content-length",
  "content-range",
  "accept-ranges",
  "etag",
  "last-modified",
];

export const dynamic = "force-dynamic";

async function stream(
  req: NextRequest,
  params: Promise<{ name: string }>,
  method: "GET" | "HEAD",
) {
  const { name } = await params;
  const objectPath = OBJECTS[name];
  if (!objectPath) return new NextResponse("Not found", { status: 404 });

  const { data, error } = await supabaseAdmin.storage
    .from(BUCKET)
    .createSignedUrl(objectPath, 60);
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
  for (const header of PASS_THROUGH_HEADERS) {
    const value = upstream.headers.get(header);
    if (value) headers.set(header, value);
  }
  if (!headers.has("accept-ranges")) headers.set("accept-ranges", "bytes");

  return new NextResponse(method === "HEAD" ? null : upstream.body, {
    status: upstream.status,
    headers,
  });
}

export function GET(
  req: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  return stream(req, params, "GET");
}

export function HEAD(
  req: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  return stream(req, params, "HEAD");
}
