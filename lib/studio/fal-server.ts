import { isAllowedEndpoint } from "./ai-tools";

// Thin REST client for the fal.ai queue. Verified against the live API on
// 2026-10-06 (submit, status, result). The key is a website-only key with the
// API scope; never an admin key.

const QUEUE_HOST = "https://queue.fal.run/";

export function falConfigured(): boolean {
  return Boolean(process.env.FAL_STUDIO_KEY);
}

function headers(): HeadersInit {
  return {
    Authorization: `Key ${process.env.FAL_STUDIO_KEY ?? ""}`,
    "Content-Type": "application/json",
  };
}

function isQueueUrl(url: string): boolean {
  return url.startsWith(QUEUE_HOST);
}

export type FalSubmit =
  | { ok: true; requestId: string; statusUrl: string; responseUrl: string }
  | { ok: false; status: number };

export async function submitFal(
  endpoint: string,
  input: Record<string, unknown>,
): Promise<FalSubmit> {
  // Defense in depth: the allowlist is also checked by the routes.
  if (!isAllowedEndpoint(endpoint)) return { ok: false, status: 400 };
  try {
    const response = await fetch(`${QUEUE_HOST}${endpoint}`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(input),
    });
    if (!response.ok) {
      // Status only: the body can echo the prompt or an image URL.
      console.error("Studio: fal submit returned", response.status);
      return { ok: false, status: response.status };
    }
    const data = (await response.json()) as {
      request_id?: string;
      status_url?: string;
      response_url?: string;
    };
    if (!data.request_id || !data.status_url || !data.response_url) {
      return { ok: false, status: 502 };
    }
    return {
      ok: true,
      requestId: data.request_id,
      statusUrl: data.status_url,
      responseUrl: data.response_url,
    };
  } catch (error) {
    console.error("Studio: fal submit failed", error);
    return { ok: false, status: 502 };
  }
}

export type FalState = "IN_QUEUE" | "IN_PROGRESS" | "COMPLETED" | "FAILED" | "CANCELED" | "UNKNOWN";

export async function falStatus(
  statusUrl: string,
): Promise<{ state: FalState; queuePosition: number | null }> {
  if (!isQueueUrl(statusUrl)) return { state: "UNKNOWN", queuePosition: null };
  try {
    const response = await fetch(statusUrl, { headers: headers() });
    if (!response.ok) return { state: "UNKNOWN", queuePosition: null };
    const data = (await response.json()) as {
      status?: string;
      queue_position?: number;
    };
    const state: FalState =
      data.status === "IN_QUEUE" ||
      data.status === "IN_PROGRESS" ||
      data.status === "COMPLETED" ||
      data.status === "FAILED" ||
      data.status === "CANCELED"
        ? data.status
        : "UNKNOWN";
    return { state, queuePosition: data.queue_position ?? null };
  } catch {
    return { state: "UNKNOWN", queuePosition: null };
  }
}

export type FalResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; status: number };

export async function falResult(responseUrl: string): Promise<FalResult> {
  if (!isQueueUrl(responseUrl)) return { ok: false, status: 400 };
  try {
    const response = await fetch(responseUrl, { headers: headers() });
    if (!response.ok) return { ok: false, status: response.status };
    return { ok: true, data: (await response.json()) as Record<string, unknown> };
  } catch {
    return { ok: false, status: 502 };
  }
}
