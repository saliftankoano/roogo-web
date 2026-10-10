import { zipSync, strToU8 } from "fflate";

// HeyGen cloud rendering for HyperFrames pages. Server only: the key never
// reaches the browser. The page travels inline as a one-file zip.

const API = "https://api.heygen.com";

export function heygenConfigured(): boolean {
  return Boolean(process.env.HEYGEN_API_KEY);
}

function headers() {
  return { "x-api-key": process.env.HEYGEN_API_KEY ?? "", "content-type": "application/json" };
}

export type SubmitResult = { ok: true; renderId: string } | { ok: false; status: number; message: string };

export async function submitRender(html: string, title: string, idempotencyKey: string): Promise<SubmitResult> {
  const zip = zipSync({ "index.html": strToU8(html) });
  const body = {
    project: { type: "base64", media_type: "application/zip", data: Buffer.from(zip).toString("base64") },
    fps: 30,
    quality: "standard",
    format: "mp4",
    resolution: "1080p",
    aspect_ratio: "9:16",
    title: title.slice(0, 120),
  };
  try {
    const res = await fetch(`${API}/v3/hyperframes/renders`, {
      method: "POST",
      headers: { ...headers(), "Idempotency-Key": idempotencyKey },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as {
      data?: { render_id?: string };
      error?: { message?: string; code?: string };
    };
    if (!res.ok || !data.data?.render_id) {
      return { ok: false, status: res.status, message: data.error?.message ?? `HTTP ${res.status}` };
    }
    return { ok: true, renderId: data.data.render_id };
  } catch (error) {
    return { ok: false, status: 0, message: error instanceof Error ? error.name : "network" };
  }
}

export type RenderState =
  | { state: "running" }
  | { state: "failed"; message: string }
  | { state: "completed"; videoUrl: string; durationSeconds: number | null };

export async function renderStatus(renderId: string): Promise<RenderState> {
  try {
    const res = await fetch(`${API}/v3/hyperframes/renders/${encodeURIComponent(renderId)}`, { headers: headers() });
    if (!res.ok) return res.status === 404 ? { state: "failed", message: "Rendu introuvable" } : { state: "running" };
    const { data } = (await res.json()) as {
      data?: { status?: string; video_url?: string; duration?: number; error?: { message?: string } | string };
    };
    if (data?.status === "completed" && data.video_url) {
      return { state: "completed", videoUrl: data.video_url, durationSeconds: data.duration ?? null };
    }
    if (data?.status === "failed") {
      const err = typeof data.error === "string" ? data.error : data.error?.message;
      return { state: "failed", message: err ?? "Le rendu a échoué." };
    }
    return { state: "running" };
  } catch {
    // A transient network error: the page polls again.
    return { state: "running" };
  }
}
