import { supabaseAdmin } from "@/lib/supabase-admin";
import type { ApiUser } from "@/lib/api-auth";
import { PROPERTY_COLUMNS, loadPropertyRow, propertyLabels } from "./conversations-server";
import { toPropertySummary, type PropertyRow } from "./property-context";
import { STUDIO_BUCKET } from "./server";
import {
  STALE_CLAIM_MINUTES,
  captionProblems,
  finalStatus,
  isJpegUrl,
  mediaProblems,
  networksToPublish,
  parseSlots,
  summarizeErrors,
  type CadenceStep,
  type CaptionProblem,
  type MediaType,
  type Network,
  type NetworkResult,
  type PublicationResults,
  type PublicationStatus,
  type Role,
} from "./publishing";
import {
  metaConfigFromEnv,
  publishFacebook,
  publishInstagram,
  type PublishDeps,
  type PublishMedia,
} from "./meta-graph";

export const PUBLICATION_COLUMNS =
  "id, property_id, artifact_id, title, cadence_step, visit_date, media_type, photo_urls, caption, notes, networks, scheduled_at, assignee_id, status, approved_by, approved_at, claimed_at, published_at, results, last_error, created_by, created_at, updated_at";

export type PublicationRow = {
  id: string;
  property_id: string | null;
  artifact_id: string | null;
  title: string;
  cadence_step: CadenceStep | null;
  visit_date: string | null;
  media_type: MediaType;
  photo_urls: string[];
  caption: string;
  notes: string;
  networks: Network[];
  scheduled_at: string;
  assignee_id: string | null;
  status: PublicationStatus;
  approved_by: string | null;
  approved_at: string | null;
  claimed_at: string | null;
  published_at: string | null;
  results: PublicationResults;
  last_error: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

/** Signed links Meta downloads from. Three hours covers a slow Instagram video. */
export const PUBLISH_SIGNED_URL_SECONDS = 3 * 3600;

export function roleOf(user: Pick<ApiUser, "user_type">): Role {
  return user.user_type === "founder" ? "founder" : "staff";
}

export function publishSlots(): string[] {
  return parseSlots(process.env.STUDIO_PUBLISH_SLOTS);
}

export function metaStatus() {
  const { facebook, instagram, missing } = metaConfigFromEnv(process.env);
  return { facebook, instagram, missing };
}

export type ArtifactInfo = { id: string; kind: string; title: string; output_path: string | null; property_id: string | null };

export async function loadArtifactInfo(id: string): Promise<ArtifactInfo | null> {
  const { data } = await supabaseAdmin
    .from("studio_artifacts")
    .select("id, kind, title, output_path, studio_conversations(property_id)")
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  const conv = Array.isArray(data.studio_conversations) ? data.studio_conversations[0] : data.studio_conversations;
  return {
    id: data.id,
    kind: data.kind,
    title: data.title,
    output_path: data.output_path,
    property_id: (conv as { property_id?: string | null } | null)?.property_id ?? null,
  };
}

/** Everything that blocks "Valider" for this row. */
export async function approvalProblems(row: PublicationRow): Promise<CaptionProblem[]> {
  const artifact = row.artifact_id ? await loadArtifactInfo(row.artifact_id) : null;
  const problems = [
    ...captionProblems(row.caption, { mediaType: row.media_type, step: row.cadence_step }),
    ...mediaProblems({
      mediaType: row.media_type,
      networks: row.networks,
      hasArtifact: Boolean(artifact?.output_path),
      artifactKind: artifact?.kind ?? null,
      photoCount: row.photo_urls.length,
      step: row.cadence_step,
    }),
  ];
  if (row.networks.includes("instagram") && (row.media_type === "image" || row.media_type === "carousel")) {
    const urls = [...row.photo_urls, ...(artifact?.kind === "image" && artifact.output_path ? [artifact.output_path] : [])];
    if (urls.some((u) => !isJpegUrl(u))) {
      problems.push({ code: "ig-jpeg", message: "Instagram n'accepte que des images JPEG." });
    }
  }
  return problems;
}

/** The listing's own photos (gallery order), the only photo URLs a post may use. */
export async function propertyPhotos(propertyId: string): Promise<string[]> {
  const row = await loadPropertyRow(propertyId);
  return row?.images ?? [];
}

export async function propertySummaries(ids: string[]) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map<string, ReturnType<typeof toPropertySummary>>();
  const { data } = await supabaseAdmin.from("property_details").select(PROPERTY_COLUMNS).in("id", unique);
  const map = new Map<string, ReturnType<typeof toPropertySummary>>();
  for (const row of (data ?? []) as unknown as PropertyRow[]) map.set(row.id, toPropertySummary(row, propertyLabels));
  return map;
}

export async function staffDirectory(): Promise<Array<{ id: string; name: string; role: Role }>> {
  const { data } = await supabaseAdmin
    .from("users")
    .select("id, full_name, user_type")
    .in("user_type", ["staff", "founder"])
    .order("full_name", { ascending: true });
  return (data ?? []).map((u) => ({ id: u.id, name: u.full_name ?? "Sans nom", role: u.user_type === "founder" ? "founder" : "staff" }));
}

// ---------------------------------------------------------------------------
// The worker (Vercel cron)
// ---------------------------------------------------------------------------

async function mediaFor(row: PublicationRow): Promise<{ media: PublishMedia | null; error: string | null }> {
  if (row.media_type === "text") return { media: { kind: "text" }, error: null };
  const storage = supabaseAdmin.storage.from(STUDIO_BUCKET);
  if (row.media_type === "video") {
    const artifact = row.artifact_id ? await loadArtifactInfo(row.artifact_id) : null;
    if (!artifact?.output_path || artifact.kind !== "video") return { media: null, error: "La vidéo choisie n'existe plus dans le Studio." };
    const { data } = await storage.createSignedUrl(artifact.output_path, PUBLISH_SIGNED_URL_SECONDS);
    if (!data?.signedUrl) return { media: null, error: "Le lien de la vidéo n'a pas pu être créé." };
    return { media: { kind: "video", url: data.signedUrl }, error: null };
  }
  const urls = [...row.photo_urls];
  if (row.artifact_id) {
    const artifact = await loadArtifactInfo(row.artifact_id);
    if (!artifact?.output_path || artifact.kind !== "image") return { media: null, error: "Le visuel choisi n'existe plus dans le Studio." };
    const { data } = await storage.createSignedUrl(artifact.output_path, PUBLISH_SIGNED_URL_SECONDS);
    if (!data?.signedUrl) return { media: null, error: "Le lien du visuel n'a pas pu être créé." };
    urls.unshift(data.signedUrl);
  }
  if (!urls.length) return { media: null, error: "Aucune image à publier." };
  return { media: { kind: "images", urls }, error: null };
}

/** The Facebook post id of this visit's carousel, for the 3D tour link comment. */
async function carouselPostId(row: PublicationRow): Promise<string | null> {
  if (!row.property_id || !row.visit_date) return null;
  const { data } = await supabaseAdmin
    .from("studio_publications")
    .select("results")
    .eq("property_id", row.property_id)
    .eq("visit_date", row.visit_date)
    .eq("cadence_step", "carousel")
    .maybeSingle();
  const fbResult = (data?.results as PublicationResults | undefined)?.facebook;
  return fbResult?.status === "published" ? fbResult.remote_id ?? null : null;
}

/** Marks posts whose run died mid-publish. Never re-claims them: a human checks the network first. */
async function failStaleClaims(now: Date) {
  const cutoff = new Date(now.getTime() - STALE_CLAIM_MINUTES * 60_000).toISOString();
  const { data } = await supabaseAdmin
    .from("studio_publications")
    .update({
      status: "echec",
      claimed_at: null,
      last_error: "Publication interrompue. Vérifiez sur Facebook et Instagram avant de réessayer.",
      updated_at: now.toISOString(),
    })
    .eq("status", "valide")
    .lt("claimed_at", cutoff)
    .select("id");
  return data?.length ?? 0;
}

export type WorkerSummary = { claimed: number; published: number; failed: number; stale: number };

/**
 * Publishes approved posts that are due. Each post is claimed with one
 * conditional UPDATE (status still 'valide', not claimed), so two overlapping
 * runs cannot both take it. Results are saved after every network, and a
 * network that already succeeded is skipped on a retry.
 */
export async function runPublishingWorker(opts: { now?: Date; limit?: number; budgetMs?: number; deps?: Partial<PublishDeps> } = {}): Promise<WorkerSummary> {
  const started = Date.now();
  const now = opts.now ?? new Date();
  const summary: WorkerSummary = { claimed: 0, published: 0, failed: 0, stale: await failStaleClaims(now) };

  const { data: due } = await supabaseAdmin
    .from("studio_publications")
    .select("id")
    .eq("status", "valide")
    .is("claimed_at", null)
    .lte("scheduled_at", now.toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(opts.limit ?? 3);
  if (!due?.length) return summary;

  const meta = metaConfigFromEnv(process.env);
  const deps: PublishDeps = {
    fetch: (url, init) => fetch(url, init),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    pollIntervalMs: 5000,
    maxPolls: 18,
    ...opts.deps,
  };

  for (const { id } of due) {
    // Leave time for the posts already claimed; the rest waits for the next run.
    if (Date.now() - started > (opts.budgetMs ?? 90_000)) break;
    const claimedAt = new Date().toISOString();
    const { data: claimed } = await supabaseAdmin
      .from("studio_publications")
      .update({ claimed_at: claimedAt })
      .eq("id", id)
      .eq("status", "valide")
      .is("claimed_at", null)
      .not("approved_by", "is", null)
      .select(PUBLICATION_COLUMNS);
    const row = (claimed?.[0] as PublicationRow | undefined) ?? null;
    if (!row) continue;
    summary.claimed += 1;

    const results: PublicationResults = { ...(row.results ?? {}) };
    const save = async () => {
      await supabaseAdmin
        .from("studio_publications")
        .update({ results, updated_at: new Date().toISOString() })
        .eq("id", row.id)
        .eq("claimed_at", claimedAt);
    };

    const { media, error: mediaError } = await mediaFor(row);
    for (const network of networksToPublish(row.networks, results)) {
      let result: NetworkResult;
      if (!media) {
        result = { status: "failed", error: mediaError ?? "Média introuvable." };
      } else if (network === "facebook") {
        if (!meta.facebook || !meta.config) {
          result = { status: "failed", error: "Facebook n'est pas configuré (META_PAGE_ID, META_PAGE_ACCESS_TOKEN)." };
        } else if (row.cadence_step === "tour_3d_link") {
          const parent = await carouselPostId(row);
          result = parent
            ? await publishFacebook(deps, meta.config, media, row.caption, { commentOn: parent })
            : { status: "failed", error: "Le carrousel photos de cette visite n'est pas encore publié sur Facebook." };
        } else {
          result = await publishFacebook(deps, meta.config, media, row.caption);
        }
      } else {
        if (!meta.instagram || !meta.config) {
          result = { status: "failed", error: "Instagram n'est pas configuré (META_IG_USER_ID, META_PAGE_ACCESS_TOKEN)." };
        } else if (media.kind === "images" && media.urls.some((u) => !isJpegUrl(u))) {
          result = { status: "failed", error: "Instagram n'accepte que des images JPEG." };
        } else {
          result = await publishInstagram(
            {
              ...deps,
              onProgress: async (partial) => {
                results.instagram = partial;
                await save();
              },
            },
            meta.config,
            media,
            row.caption,
            { existingContainerId: results.instagram?.container_id ?? null },
          );
        }
      }
      results[network] = result;
      await save();
    }

    const status = finalStatus(row.networks, results);
    const finishedAt = new Date().toISOString();
    await supabaseAdmin
      .from("studio_publications")
      .update({
        status,
        results,
        claimed_at: null,
        published_at: status === "publie" ? finishedAt : null,
        last_error: status === "publie" ? null : summarizeErrors(results) ?? "La publication a échoué.",
        updated_at: finishedAt,
      })
      .eq("id", row.id)
      .eq("claimed_at", claimedAt);
    if (status === "publie") summary.published += 1;
    else summary.failed += 1;
    console.log("studio-publish:", row.id, status, Object.fromEntries(Object.entries(results).map(([k, v]) => [k, v?.status])));
  }
  return summary;
}

// ---------------------------------------------------------------------------
// What the calendar page receives
// ---------------------------------------------------------------------------

export type PublicationDto = {
  id: string;
  propertyId: string | null;
  property: { title: string; place: string; image: string | null } | null;
  artifactId: string | null;
  artifact: { kind: string; title: string; url: string | null } | null;
  title: string;
  cadenceStep: CadenceStep | null;
  visitDate: string | null;
  mediaType: MediaType;
  photoUrls: string[];
  caption: string;
  notes: string;
  networks: Network[];
  scheduledAt: string;
  assigneeId: string | null;
  assigneeName: string | null;
  status: PublicationStatus;
  approvedByName: string | null;
  approvedAt: string | null;
  publishing: boolean;
  publishedAt: string | null;
  results: PublicationResults;
  lastError: string | null;
  createdById: string | null;
};

export async function toDtos(rows: PublicationRow[]): Promise<PublicationDto[]> {
  const properties = await propertySummaries(rows.map((r) => r.property_id ?? ""));
  const artifactIds = [...new Set(rows.map((r) => r.artifact_id).filter((id): id is string => Boolean(id)))];
  const artifacts = new Map<string, { kind: string; title: string; url: string | null }>();
  if (artifactIds.length) {
    const { data } = await supabaseAdmin.from("studio_artifacts").select("id, kind, title, output_path").in("id", artifactIds);
    const paths = (data ?? []).map((a) => a.output_path).filter((p): p is string => Boolean(p));
    const { data: signed } = paths.length
      ? await supabaseAdmin.storage.from(STUDIO_BUCKET).createSignedUrls(paths, 3600)
      : { data: [] as Array<{ path: string | null; signedUrl: string }> };
    const byPath = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
    for (const a of data ?? []) {
      artifacts.set(a.id, { kind: a.kind, title: a.title, url: a.output_path ? byPath.get(a.output_path) ?? null : null });
    }
  }
  const userIds = [...new Set(rows.flatMap((r) => [r.assignee_id, r.approved_by]).filter((id): id is string => Boolean(id)))];
  const names = new Map<string, string>();
  if (userIds.length) {
    const { data } = await supabaseAdmin.from("users").select("id, full_name").in("id", userIds);
    for (const u of data ?? []) names.set(u.id, u.full_name ?? "Sans nom");
  }
  return rows.map((r) => {
    const p = r.property_id ? properties.get(r.property_id) : undefined;
    return {
      id: r.id,
      propertyId: r.property_id,
      property: p ? { title: p.title, place: p.place, image: p.image } : null,
      artifactId: r.artifact_id,
      artifact: r.artifact_id ? artifacts.get(r.artifact_id) ?? null : null,
      title: r.title,
      cadenceStep: r.cadence_step,
      visitDate: r.visit_date,
      mediaType: r.media_type,
      photoUrls: r.photo_urls ?? [],
      caption: r.caption,
      notes: r.notes,
      networks: r.networks ?? [],
      scheduledAt: r.scheduled_at,
      assigneeId: r.assignee_id,
      assigneeName: r.assignee_id ? names.get(r.assignee_id) ?? null : null,
      status: r.status,
      approvedByName: r.approved_by ? names.get(r.approved_by) ?? null : null,
      approvedAt: r.approved_at,
      publishing: Boolean(r.claimed_at),
      publishedAt: r.published_at,
      results: r.results ?? {},
      lastError: r.last_error,
      createdById: r.created_by,
    };
  });
}

// ---------------------------------------------------------------------------
// Input from the editor
// ---------------------------------------------------------------------------

export type PostInput = Partial<
  Pick<PublicationRow, "property_id" | "artifact_id" | "title" | "media_type" | "photo_urls" | "caption" | "notes" | "networks" | "scheduled_at" | "assignee_id">
>;

const MAX_CAPTION = 2200;

/**
 * Reads and checks the editable fields. `current` is the stored row on an
 * edit, so the checks see the post as it will be after the change.
 */
export async function parsePostInput(
  body: Record<string, unknown>,
  current: PublicationRow | null,
): Promise<{ values: PostInput; error: string | null }> {
  const values: PostInput = {};
  const has = (key: string) => Object.prototype.hasOwnProperty.call(body, key);

  if (has("propertyId")) {
    const v = body.propertyId;
    if (v !== null && typeof v !== "string") return { values, error: "Bien invalide" };
    values.property_id = (v as string | null) || null;
  }
  if (has("artifactId")) {
    const v = body.artifactId;
    if (v !== null && typeof v !== "string") return { values, error: "Média invalide" };
    values.artifact_id = (v as string | null) || null;
  }
  if (has("title")) values.title = String(body.title ?? "").trim().slice(0, 120);
  if (has("mediaType")) {
    if (!["video", "image", "carousel", "text"].includes(String(body.mediaType))) return { values, error: "Type de publication invalide" };
    values.media_type = body.mediaType as MediaType;
  }
  if (has("photoUrls")) {
    if (!Array.isArray(body.photoUrls) || body.photoUrls.some((u) => typeof u !== "string")) return { values, error: "Photos invalides" };
    values.photo_urls = [...new Set(body.photoUrls as string[])].slice(0, 10);
  }
  if (has("caption")) {
    const caption = String(body.caption ?? "");
    if (caption.length > MAX_CAPTION) return { values, error: "La légende dépasse 2 200 caractères." };
    values.caption = caption;
  }
  if (has("notes")) values.notes = String(body.notes ?? "").slice(0, 1000);
  if (has("networks")) {
    if (!Array.isArray(body.networks)) return { values, error: "Réseaux invalides" };
    const nets = [...new Set(body.networks.map(String))];
    if (nets.includes("tiktok")) return { values, error: "TikTok n'est pas encore disponible." };
    if (nets.some((n) => n !== "facebook" && n !== "instagram")) return { values, error: "Réseau inconnu" };
    values.networks = nets as Network[];
  }
  if (has("scheduledAt")) {
    const d = new Date(String(body.scheduledAt));
    if (Number.isNaN(d.getTime())) return { values, error: "Date de publication invalide" };
    values.scheduled_at = d.toISOString();
  }
  if (has("assigneeId")) {
    const v = body.assigneeId;
    if (v !== null && typeof v !== "string") return { values, error: "Personne invalide" };
    if (v) {
      const { data } = await supabaseAdmin.from("users").select("id, user_type").eq("id", v).maybeSingle();
      if (!data || !["staff", "founder"].includes(data.user_type ?? "")) return { values, error: "Cette personne ne fait pas partie de l'équipe." };
    }
    values.assignee_id = (v as string | null) || null;
  }

  // Cross-checks on the post as it will be stored.
  const propertyId = values.property_id !== undefined ? values.property_id : current?.property_id ?? null;
  const artifactId = values.artifact_id !== undefined ? values.artifact_id : current?.artifact_id ?? null;
  const photos = values.photo_urls ?? current?.photo_urls ?? [];

  if (propertyId && values.property_id !== undefined) {
    const { data } = await supabaseAdmin.from("properties").select("id").eq("id", propertyId).maybeSingle();
    if (!data) return { values, error: "Bien introuvable" };
  }
  if (artifactId && (values.artifact_id !== undefined || values.property_id !== undefined)) {
    const artifact = await loadArtifactInfo(artifactId);
    if (!artifact || !["video", "image"].includes(artifact.kind)) return { values, error: "Choisissez une vidéo ou un visuel du Studio." };
    if (propertyId && artifact.property_id && artifact.property_id !== propertyId) {
      return { values, error: "Ce média appartient à un autre bien." };
    }
  }
  if (photos.length && (values.photo_urls !== undefined || values.property_id !== undefined)) {
    if (!propertyId) return { values, error: "Choisissez d'abord le bien de ces photos." };
    const allowed = new Set(await propertyPhotos(propertyId));
    if (photos.some((u) => !allowed.has(u))) return { values, error: "Seules les photos de l'annonce peuvent être publiées." };
  }
  return { values, error: null };
}
