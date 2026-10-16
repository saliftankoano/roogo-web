// Google Drive access for the Studio's field media, as the Roogo service
// account. Server only. No SDK: the service-account token is a signed JWT
// exchanged at Google's token endpoint (node:crypto, RS256), and Drive is
// called with fetch. Only the shared drive is used (supportsAllDrives).
//
// Env:
//   GOOGLE_SERVICE_ACCOUNT_EMAIL        the service account address
//   GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY  its PEM private key (\n escapes accepted)
//   or GOOGLE_SERVICE_ACCOUNT_JSON      the whole key file instead of the two above
//   ROOGO_SHARED_DRIVE_ID               the shared drive "Roogo"

import { createSign } from "node:crypto";
import { driveQueryValue, findFolderMatch, type DriveFolderRef, type DriveFileFacts } from "./field-media-rules";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const DRIVE_API = "https://www.googleapis.com/drive/v3";
const UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";
const SCOPE = "https://www.googleapis.com/auth/drive";
const FOLDER_MIME = "application/vnd.google-apps.folder";

export class DriveError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "DriveError";
  }
}

type DriveConfig = { email: string; privateKey: string; driveId: string };

function serviceAccountJson(): { client_email?: string; private_key?: string } | null {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function driveConfig(): DriveConfig | null {
  const json = serviceAccountJson();
  const email = (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ?? json?.client_email)?.trim();
  const privateKey = (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY ?? json?.private_key)?.replace(/\\n/g, "\n").trim();
  const driveId = process.env.ROOGO_SHARED_DRIVE_ID?.trim();
  if (!email || !privateKey || !driveId) return null;
  return { email, privateKey, driveId };
}

export function isDriveConfigured(): boolean {
  return driveConfig() !== null;
}

function requireConfig(): DriveConfig {
  const config = driveConfig();
  if (!config) throw new DriveError("Google Drive n'est pas configuré sur le serveur.", 503);
  return config;
}

let cachedToken: { value: string; expiresAt: number } | null = null;

async function accessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt - 60_000 > Date.now()) return cachedToken.value;
  const { email, privateKey } = requireConfig();
  const now = Math.floor(Date.now() / 1000);
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsigned = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({ iss: email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 })}`;
  let signature: string;
  try {
    signature = createSign("RSA-SHA256").update(unsigned).sign(privateKey, "base64url");
  } catch {
    throw new DriveError("La clé du compte de service Google est illisible.", 503);
  }
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${signature}`,
    }),
  });
  const body = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string };
  if (!res.ok || !body.access_token) {
    console.error("Drive: token exchange failed", res.status, body.error ?? "");
    throw new DriveError("Connexion à Google Drive refusée.", 502);
  }
  cachedToken = { value: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 };
  return body.access_token;
}

async function driveJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const token = await accessToken();
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("Drive: request failed", res.status, url.replace(/\?.*$/, ""), text.slice(0, 300));
    throw new DriveError(`Google Drive a répondu ${res.status}.`, res.status === 404 ? 404 : 502);
  }
  return (await res.json()) as T;
}

/** Every folder directly inside a parent (paged; a parent holds a few hundred at most). */
async function listChildFolders(parentId: string): Promise<DriveFolderRef[]> {
  const { driveId } = requireConfig();
  const folders: DriveFolderRef[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      q: `'${driveQueryValue(parentId)}' in parents and mimeType = '${FOLDER_MIME}' and trashed = false`,
      corpora: "drive",
      driveId,
      includeItemsFromAllDrives: "true",
      supportsAllDrives: "true",
      fields: "nextPageToken, files(id, name, createdTime)",
      pageSize: "1000",
    });
    if (pageToken) params.set("pageToken", pageToken);
    const page = await driveJson<{ nextPageToken?: string; files?: DriveFolderRef[] }>(`${DRIVE_API}/files?${params}`);
    folders.push(...(page.files ?? []));
    pageToken = page.nextPageToken;
  } while (pageToken);
  return folders;
}

async function createFolder(parentId: string, name: string): Promise<string> {
  const created = await driveJson<{ id: string }>(`${DRIVE_API}/files?supportsAllDrives=true&fields=id`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=UTF-8" },
    body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parentId] }),
  });
  return created.id;
}

/** Finds a folder by name (accents, case and dash style ignored) or creates it. */
export async function findOrCreateFolder(parentId: string, name: string): Promise<string> {
  const existing = findFolderMatch(await listChildFolders(parentId), name);
  if (existing) return existing.id;
  await createFolder(parentId, name);
  // Re-read so two uploads racing to create the same folder settle on the oldest one.
  const settled = findFolderMatch(await listChildFolders(parentId), name);
  if (!settled) throw new DriveError("Dossier Drive introuvable après sa création.", 502);
  return settled.id;
}

/** `Vente|Location / Quartier - Propriétaire` under the shared drive. */
export async function ensureVisitFolder(top: "Vente" | "Location", visitFolder: string): Promise<string> {
  const { driveId } = requireConfig();
  const topId = await findOrCreateFolder(driveId, top);
  return findOrCreateFolder(topId, visitFolder);
}

/**
 * Opens a resumable upload session in the folder. The browser then PUTs the
 * bytes straight to the returned session address. Sending the browser's
 * Origin here is what lets Google answer the browser's PUTs with CORS headers.
 */
export async function createResumableSession(input: {
  name: string;
  mimeType: string;
  sizeBytes: number;
  folderId: string;
  origin: string | null;
}): Promise<string> {
  const token = await accessToken();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json; charset=UTF-8",
    "X-Upload-Content-Type": input.mimeType,
    "X-Upload-Content-Length": String(input.sizeBytes),
  };
  if (input.origin) headers.Origin = input.origin;
  const res = await fetch(`${UPLOAD_API}/files?uploadType=resumable&supportsAllDrives=true&fields=id,size,parents,mimeType`, {
    method: "POST",
    headers,
    body: JSON.stringify({ name: input.name, mimeType: input.mimeType, parents: [input.folderId] }),
  });
  const location = res.headers.get("location");
  if (!res.ok || !location) {
    const text = await res.text().catch(() => "");
    console.error("Drive: resumable session failed", res.status, text.slice(0, 300));
    throw new DriveError(`Google Drive a refusé l'envoi (${res.status}).`, 502);
  }
  return location;
}

export type SessionState =
  | { state: "complete"; file: DriveFileFacts }
  | { state: "incomplete"; offset: number }
  | { state: "expired" };

function sessionAnswer(res: Response, body: string): SessionState {
  if (res.status === 200 || res.status === 201) {
    try {
      return { state: "complete", file: JSON.parse(body) as DriveFileFacts };
    } catch {
      return { state: "complete", file: { id: "" } };
    }
  }
  if (res.status === 308) {
    const match = /bytes=0-(\d+)/.exec(res.headers.get("range") ?? "");
    return { state: "incomplete", offset: match ? Number(match[1]) + 1 : 0 };
  }
  if (res.status === 404 || res.status === 410) return { state: "expired" };
  throw new DriveError(`Google Drive a répondu ${res.status} pendant l'envoi.`, 502);
}

/** Asks the session how many bytes Google has kept (the session address is its own credential). */
export async function querySession(sessionUrl: string, sizeBytes: number): Promise<SessionState> {
  const res = await fetch(sessionUrl, {
    method: "PUT",
    headers: { "Content-Range": `bytes */${sizeBytes}`, "Content-Length": "0" },
  });
  return sessionAnswer(res, await res.text().catch(() => ""));
}

/** Fallback when the browser cannot reach Google directly: one chunk relayed by our server. */
export async function relayChunk(sessionUrl: string, contentRange: string, bytes: ArrayBuffer): Promise<SessionState> {
  const res = await fetch(sessionUrl, {
    method: "PUT",
    headers: { "Content-Range": contentRange, "Content-Length": String(bytes.byteLength) },
    body: bytes,
  });
  return sessionAnswer(res, await res.text().catch(() => ""));
}

export type DriveFile = DriveFileFacts & {
  name?: string;
  thumbnailLink?: string | null;
  videoMediaMetadata?: { durationMillis?: string | null } | null;
};

export async function getDriveFile(fileId: string): Promise<DriveFile | null> {
  try {
    return await driveJson<DriveFile>(
      `${DRIVE_API}/files/${encodeURIComponent(fileId)}?supportsAllDrives=true&fields=id,name,size,mimeType,parents,trashed,thumbnailLink,videoMediaMetadata(durationMillis)`,
    );
  } catch (error) {
    if (error instanceof DriveError && error.status === 404) return null;
    throw error;
  }
}

/** The file's bytes, passing the caller's Range through so players and renderers can seek. */
export async function fetchDriveMedia(fileId: string, range: string | null, method: "GET" | "HEAD" = "GET"): Promise<Response> {
  const token = await accessToken();
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (range) headers.Range = range;
  // Drive's media endpoint does not answer HEAD; a 1-byte GET gives the same headers.
  if (method === "HEAD" && !range) headers.Range = "bytes=0-0";
  return fetch(`${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`, { headers });
}

/** A small preview image (Drive makes them for photos, HEIC included, and processed videos). */
export async function fetchDriveThumbnail(fileId: string): Promise<Response | null> {
  const file = await getDriveFile(fileId);
  if (!file?.thumbnailLink) return null;
  const token = await accessToken();
  const res = await fetch(file.thumbnailLink.replace(/=s\d+$/, "=s480"), { headers: { Authorization: `Bearer ${token}` } });
  return res.ok ? res : null;
}
