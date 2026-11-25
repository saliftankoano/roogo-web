import { supabaseAdmin } from "@/lib/supabase-admin";
import { STUDIO_BUCKET } from "./server";
import {
  blockingProblems,
  carouselPaths,
  carouselPhotoRefs,
  parseCarouselSpec,
  readCarouselMeta,
  type CarouselMeta,
  type CarouselProblem,
  type CarouselSpec,
} from "./carousel";

export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const MAX_PHOTO_BYTES = 15 * 1024 * 1024;

/** Postgres CHECK violation: migration 112 (kind 'carousel') has not run yet. */
export function isMissingMigration(error: { code?: string; message?: string } | null | undefined): boolean {
  return error?.code === "23514" && /studio_artifacts_kind_check/.test(error.message ?? "");
}
export const MIGRATION_MESSAGE = "Les carrousels arrivent bientôt : la migration 112 n'a pas encore été lancée.";

export type CarouselArtifactRow = {
  id: string;
  conversation_id: string;
  kind: string;
  title: string;
  meta: Record<string, unknown> | null;
  output_path: string | null;
};

export async function loadCarousel(id: string): Promise<{ row: CarouselArtifactRow; meta: CarouselMeta } | null> {
  const { data } = await supabaseAdmin
    .from("studio_artifacts")
    .select("id, conversation_id, kind, title, meta, output_path")
    .eq("id", id)
    .maybeSingle();
  if (!data || data.kind !== "carousel") return null;
  const meta = readCarouselMeta(data.meta);
  return meta ? { row: data as CarouselArtifactRow, meta } : null;
}

/** Signed upload URL for one file, written later by the browser straight to the bucket. */
export async function uploadUrl(path: string): Promise<{ path: string; signedUrl: string; token: string } | null> {
  const { data, error } = await supabaseAdmin.storage.from(STUDIO_BUCKET).createSignedUploadUrl(path, { upsert: true });
  if (error || !data) {
    console.error("Studio carousel: signed upload URL failed", error?.message);
    return null;
  }
  return { path, signedUrl: data.signedUrl, token: data.token };
}

/** Every photo this carousel holds in its folder (used and unused), for the photo picker. */
export async function carouselPhotoLibrary(artifactId: string): Promise<string[]> {
  const folder = `carousels/${artifactId}/photos`;
  const { data } = await supabaseAdmin.storage.from(STUDIO_BUCKET).list(folder, { limit: 200, sortBy: { column: "name", order: "asc" } });
  return (data ?? []).filter((f) => f.id && f.name).map((f) => `${folder}/${f.name}`);
}

/** Signed read URLs for photos and slides, keyed by storage path. */
export async function signPaths(paths: string[], seconds = 3600): Promise<Record<string, string>> {
  const unique = [...new Set(paths.filter(Boolean))];
  if (!unique.length) return {};
  const { data } = await supabaseAdmin.storage.from(STUDIO_BUCKET).createSignedUrls(unique, seconds);
  const out: Record<string, string> = {};
  for (const s of data ?? []) if (s.path && s.signedUrl) out[s.path] = s.signedUrl;
  return out;
}

/** What the Studio page needs to draw and edit a carousel. */
export async function carouselView(artifactId: string, meta: CarouselMeta) {
  const library = await carouselPhotoLibrary(artifactId);
  const signed = await signPaths([...library, ...carouselPhotoRefs(meta.spec), ...meta.slides]);
  return {
    spec: meta.spec,
    photoUrls: signed,
    library,
    slides: meta.slides.map((p) => signed[p] ?? null).filter((u): u is string => Boolean(u)),
    renderedAt: meta.rendered_at,
    version: meta.version,
  };
}

/**
 * A spec saved from the Studio may only point at this carousel's own photos
 * (or a public https URL already in it), never at another project's files.
 */
export function photoProblems(artifactId: string, spec: CarouselSpec, previous: CarouselSpec | null): CarouselProblem[] {
  const allowedUrls = new Set(previous ? carouselPhotoRefs(previous).filter((r) => r.startsWith("https://")) : []);
  return carouselPhotoRefs(spec)
    .filter((ref) => !carouselPaths.isOwnPhoto(artifactId, ref) && !allowedUrls.has(ref))
    .map((ref) => ({ slide: null, message: `Photo non autorisée : ${ref.split("/").pop()}`, blocking: true }));
}

export function checkSpec(input: unknown): { spec: CarouselSpec | null; problems: CarouselProblem[]; blocking: CarouselProblem[] } {
  const { spec, problems } = parseCarouselSpec(input);
  return { spec, problems, blocking: blockingProblems(problems) };
}

/**
 * New slides were rendered: a post already approved with this carousel goes
 * back to "à valider" so a founder sees the new version before it goes out.
 */
export async function sendApprovedPostsBack(artifactId: string): Promise<number> {
  const { data } = await supabaseAdmin
    .from("studio_publications")
    .update({ status: "a_valider", approved_by: null, approved_at: null, updated_at: new Date().toISOString() })
    .eq("artifact_id", artifactId)
    .in("status", ["valide", "echec"])
    .select("id");
  return data?.length ?? 0;
}

/** Removes slide versions other than the current one (published posts use signed URLs made at publish time). */
export async function removeOldSlides(artifactId: string, keepVersion: string): Promise<void> {
  const root = `carousels/${artifactId}/slides`;
  const storage = supabaseAdmin.storage.from(STUDIO_BUCKET);
  const { data: versions } = await storage.list(root, { limit: 100 });
  for (const v of versions ?? []) {
    if (!v.name || v.name === keepVersion) continue;
    const { data: files } = await storage.list(`${root}/${v.name}`, { limit: 100 });
    const paths = (files ?? []).map((f) => `${root}/${v.name}/${f.name}`);
    if (paths.length) await storage.remove(paths);
  }
}

/** Slide paths of a version that really exist in the bucket, in order. */
export async function existingSlides(artifactId: string, version: string, count: number): Promise<string[] | null> {
  const folder = `carousels/${artifactId}/slides/${version}`;
  const { data } = await supabaseAdmin.storage.from(STUDIO_BUCKET).list(folder, { limit: 100 });
  const names = new Set((data ?? []).map((f) => f.name));
  const expected = Array.from({ length: count }, (_, i) => carouselPaths.slide(artifactId, version, i + 1));
  return expected.every((p) => names.has(p.split("/").pop() ?? "")) ? expected : null;
}
