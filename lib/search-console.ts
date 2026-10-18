import { createSign } from "node:crypto";
import type { IndexStatusResult } from "./listing-index";

// Google Search Console URL Inspection API, read-only, with a service
// account (no googleapis dependency: one signed JWT, one token call).
//
// Setup (once, by the property owner):
// 1. Google Cloud: create a service account, add a JSON key, and enable the
//    "Google Search Console API".
// 2. Search Console > roogobf.com > Settings > Users and permissions: add
//    the service account email with "Restricted" access.
// 3. Vercel env: GSC_SERVICE_ACCOUNT_JSON = the key file (raw JSON or
//    base64). GSC_SITE_URL defaults to sc-domain:roogobf.com.
//
// Quota: 2,000 inspections per day and 600 per minute per property.

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const INSPECT_URL =
  "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect";
const SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";

export const GSC_SITE_URL =
  process.env.GSC_SITE_URL?.trim() || "sc-domain:roogobf.com";

type ServiceAccount = { client_email: string; private_key: string };

function readServiceAccount(): ServiceAccount | null {
  const raw = process.env.GSC_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) return null;
  const text = raw.startsWith("{")
    ? raw
    : Buffer.from(raw, "base64").toString("utf8");
  const parsed = JSON.parse(text) as Partial<ServiceAccount>;
  if (!parsed.client_email || !parsed.private_key) return null;
  return { client_email: parsed.client_email, private_key: parsed.private_key };
}

export function isSearchConsoleConfigured(): boolean {
  return Boolean(process.env.GSC_SERVICE_ACCOUNT_JSON?.trim());
}

function base64url(input: string | Buffer) {
  return Buffer.from(input).toString("base64url");
}

export async function getSearchConsoleToken(): Promise<string> {
  const account = readServiceAccount();
  if (!account) throw new Error("GSC_SERVICE_ACCOUNT_JSON missing or invalid");

  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(
    JSON.stringify({
      iss: account.client_email,
      scope: SCOPE,
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
    }),
  );
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  const signature = signer.sign(account.private_key).toString("base64url");

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${header}.${claims}.${signature}`,
    }),
  });
  const body = (await response.json().catch(() => null)) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  } | null;
  if (!response.ok || !body?.access_token) {
    throw new Error(
      `Token Google refusé (HTTP ${response.status}): ${body?.error || ""} ${body?.error_description || ""}`.trim(),
    );
  }
  return body.access_token;
}

export type InspectResult =
  | { ok: true; result: IndexStatusResult }
  | { ok: false; status: number; error: string };

export async function inspectUrl(
  token: string,
  url: string,
): Promise<InspectResult> {
  const response = await fetch(INSPECT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      inspectionUrl: url,
      siteUrl: GSC_SITE_URL,
      languageCode: "fr-FR",
    }),
  });
  const body = (await response.json().catch(() => null)) as {
    inspectionResult?: { indexStatusResult?: IndexStatusResult };
    error?: { message?: string; status?: string };
  } | null;
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: `HTTP ${response.status} ${body?.error?.status || ""}: ${body?.error?.message || "erreur inconnue"}`,
    };
  }
  const result = body?.inspectionResult?.indexStatusResult;
  if (!result) {
    return { ok: false, status: response.status, error: "Réponse sans indexStatusResult" };
  }
  return { ok: true, result };
}
