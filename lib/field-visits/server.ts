// Server side of the field visit sheet ("Fiche de visite"). Every read and
// write uses the service role, like the other admin tables (RLS on, no
// policies, migration 090). Callers are checked in the routes: staff for the
// sheet itself, Directeur or Fondateur for the follow-up list.

import { supabaseAdmin } from "@/lib/supabase-admin";
import { propertyOwnerName } from "@/lib/studio/field-media";
import { driveFolderUrl } from "@/lib/studio/field-media-rules";
import { ensureVisitFolder, findOrCreateFolder } from "@/lib/studio/google-drive";
import type { Person } from "@/lib/team-tasks/core";
import type { Viewer } from "@/lib/team-tasks/server";
import {
  DELETE_CHECK_ID,
  DELIVERABLES,
  DELIVERABLE_KEYS,
  TASK_KEYS,
  allUploaded,
  canFinish,
  deliverableDates,
  emptyCount,
  ficheStatus,
  hhmm,
  plannedPublications,
  plannedTasks,
  prefillFacts,
  taskSourceKey,
  toDayKey,
  topFolderFor,
  visitFolderName,
  visitTitle,
  type DeliverableKey,
  type FicheData,
  type FicheStatus,
  type StepIndex,
  type TaskKey,
  type TimeKey,
  type UploadSummary,
} from "./core";
import { createCalendarPublications } from "./publications";

export type ServiceResult<T> = { ok: true; value: T } | { ok: false; status: number; error: string; extra?: Record<string, unknown> };
const fail = (status: number, error: string, extra?: Record<string, unknown>) => ({ ok: false as const, status, error, extra });

export function isMissingTable(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    error.code === "42703" ||
    /does not exist|Could not find the table|column .* does not exist/i.test(error.message ?? "")
  );
}

const NOT_INSTALLED = "La fiche de visite n’est pas encore installée (migration 090 à lancer).";

function dbError(error: { code?: string; message?: string }, context: string) {
  if (isMissingTable(error)) return fail(503, NOT_INSTALLED);
  console.error(`[field-visits] ${context} failed`, { code: error.code, message: error.message });
  return fail(500, "L’enregistrement a échoué. Réessayez.");
}

// ---------------------------------------------------------------------------
// Rows

const TIME_COLUMNS: Record<TimeKey, "departed_office_at" | "arrived_at" | "left_site_at" | "returned_at"> = {
  depart: "departed_office_at",
  arrivee: "arrived_at",
  departSite: "left_site_at",
  retour: "returned_at",
};

export type FieldVisitRow = {
  id: string;
  property_id: string;
  kind: "location" | "vente";
  person1_id: string;
  person2_id: string | null;
  status: "en_cours" | "termine" | "abandonne";
  step: number;
  visit_date: string;
  check_times: Record<string, string>;
  shot_times: Record<string, string>;
  batch_warnings: string[];
  departed_office_at: string | null;
  arrived_at: string | null;
  left_site_at: string | null;
  returned_at: string | null;
  latitude: number | null;
  longitude: number | null;
  location_accuracy_m: number | null;
  located_at: string | null;
  location_skipped_reason: string | null;
  facts: Record<string, string>;
  uploads: UploadSummary;
  drive_folder_id: string | null;
  drive_folder_path: string | null;
  drive_subfolders: Partial<Record<DeliverableKey, string>>;
  task_owners: Partial<Record<TaskKey, string>>;
  task_ids: Partial<Record<TaskKey, string>>;
  deliverable_dates: Record<string, string>;
  publications_created_at: string | null;
  client_updated_at: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

const iso = (value: string | null) => (value ? new Date(value).toISOString() : undefined);

export function rowToFiche(row: FieldVisitRow): FicheData {
  const times: FicheData["times"] = {};
  for (const [key, column] of Object.entries(TIME_COLUMNS) as [TimeKey, (typeof TIME_COLUMNS)[TimeKey]][]) {
    const value = iso(row[column]);
    if (value) times[key] = value;
  }
  return {
    id: row.id,
    propertyId: row.property_id,
    kind: row.kind,
    person1Id: row.person1_id,
    person2Id: row.person2_id,
    step: Math.min(6, Math.max(0, row.step)) as StepIndex,
    visitDate: row.visit_date,
    checks: row.check_times ?? {},
    times,
    shots: row.shot_times ?? {},
    location:
      row.latitude != null && row.longitude != null
        ? { lat: row.latitude, lng: row.longitude, accuracy: row.location_accuracy_m, at: iso(row.located_at) ?? row.updated_at }
        : null,
    locationSkipped: row.location_skipped_reason,
    facts: row.facts ?? {},
    batchWarnings: row.batch_warnings ?? [],
    taskOwners: row.task_owners ?? {},
    updatedAt: iso(row.client_updated_at) ?? row.updated_at,
  };
}

function ficheToColumns(data: FicheData) {
  return {
    property_id: data.propertyId,
    kind: data.kind,
    person1_id: data.person1Id,
    person2_id: data.person2Id,
    // Step 6 (Tournage terminé) is only reached through completeFiche.
    step: Math.min(5, data.step),
    visit_date: data.visitDate,
    check_times: data.checks,
    shot_times: data.shots,
    batch_warnings: data.batchWarnings,
    departed_office_at: data.times.depart ?? null,
    arrived_at: data.times.arrivee ?? null,
    left_site_at: data.times.departSite ?? null,
    returned_at: data.times.retour ?? null,
    latitude: data.location?.lat ?? null,
    longitude: data.location?.lng ?? null,
    location_accuracy_m: data.location?.accuracy ?? null,
    located_at: data.location?.at ?? null,
    location_skipped_reason: data.location ? null : data.locationSkipped,
    facts: data.facts,
    task_owners: data.taskOwners,
    client_updated_at: data.updatedAt,
  };
}

async function loadRow(id: string): Promise<{ row: FieldVisitRow | null; error: { code?: string; message?: string } | null }> {
  const { data, error } = await supabaseAdmin.from("field_visits").select("*").eq("id", id).maybeSingle();
  return { row: (data as FieldVisitRow | null) ?? null, error };
}

// ---------------------------------------------------------------------------
// The property, as the sheet shows it (no retyping)

export type FicheProperty = {
  id: string;
  reference: string | null;
  title: string;
  quartier: string;
  city: string;
  typeLabel: string;
  ownerName: string | null;
  listingKind: "location" | "vente";
  image: string | null;
  factsPrefill: FicheData["facts"];
};

const TYPE_LABELS: Record<string, string> = {
  villa: "Villa",
  appartement: "Appartement",
  maison: "Maison",
  terrain: "Terrain",
  commercial: "Local commercial",
  "célibatorium": "Célibatorium",
  hotel: "Hôtel",
};

export async function loadFicheProperty(propertyId: string): Promise<FicheProperty | null> {
  const { data, error } = await supabaseAdmin
    .from("properties")
    .select("id, reference, property_type, quartier, city, bedrooms, bathrooms, area, price, period, listing_type, amenities, primary_image, images, agent_id")
    .eq("id", propertyId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const ownerName = await propertyOwnerName(propertyId, data.agent_id as string | null).catch(() => null);
  const type = (data.property_type as string | null) ?? "";
  const images = Array.isArray(data.images) ? (data.images as string[]) : [];
  return {
    id: data.id as string,
    reference: (data.reference as string | null) ?? null,
    title: visitTitle(data),
    quartier: (data.quartier as string | null) ?? "",
    city: (data.city as string | null) ?? "",
    typeLabel: `${TYPE_LABELS[type] ?? (type || "Bien")}${data.bedrooms && type !== "terrain" ? ` ${data.bedrooms} ch` : ""}`,
    ownerName,
    listingKind: data.listing_type === "vendre" ? "vente" : "location",
    image: (data.primary_image as string | null) || images[0] || null,
    factsPrefill: prefillFacts(data as Parameters<typeof prefillFacts>[0]),
  };
}

// ---------------------------------------------------------------------------
// Uploads per deliverable (from studio_field_media, migration 086 + 090)

export type FicheFile = {
  id: string;
  deliverable: DeliverableKey;
  fileName: string;
  sizeBytes: number;
  durationSeconds: number | null;
  status: "uploading" | "ready" | "failed";
  createdAt: string;
};

export async function loadFicheFiles(visitId: string): Promise<FicheFile[]> {
  const { data, error } = await supabaseAdmin
    .from("studio_field_media")
    .select("id, deliverable, file_name, size_bytes, duration_seconds, status, created_at")
    .eq("field_visit_id", visitId)
    .order("created_at", { ascending: true })
    .limit(1000);
  if (error) {
    if (isMissingTable(error)) return [];
    throw error;
  }
  return (data ?? [])
    .filter((row) => DELIVERABLE_KEYS.includes(row.deliverable as DeliverableKey))
    .map((row) => ({
      id: row.id as string,
      deliverable: row.deliverable as DeliverableKey,
      fileName: row.file_name as string,
      sizeBytes: Number(row.size_bytes),
      durationSeconds: row.duration_seconds == null ? null : Number(row.duration_seconds),
      status: row.status as FicheFile["status"],
      createdAt: row.created_at as string,
    }));
}

export function summarize(files: FicheFile[]): UploadSummary {
  const summary: UploadSummary = {};
  for (const file of files) {
    const count = summary[file.deliverable] ?? emptyCount();
    count[file.status] += 1;
    if (file.status === "ready") {
      count.bytes += file.sizeBytes;
      count.seconds += file.durationSeconds ?? 0;
    }
    summary[file.deliverable] = count;
  }
  return summary;
}

/** Recomputes the sheet's upload summary from the media index and stores it. */
export async function refreshUploadSummary(visitId: string): Promise<UploadSummary> {
  const summary = summarize(await loadFicheFiles(visitId));
  const { error } = await supabaseAdmin.from("field_visits").update({ uploads: summary }).eq("id", visitId);
  if (error && !isMissingTable(error)) console.error("[field-visits] upload summary failed", { code: error.code });
  return summary;
}

/** The Drive folder for one deliverable: "Vente|Location / <CODE> <titre> / <type>". Created on first use. */
export async function ensureFicheFolder(
  visitId: string,
  deliverable: DeliverableKey,
): Promise<ServiceResult<{ folderId: string; path: string; propertyId: string }>> {
  const { row, error } = await loadRow(visitId);
  if (error) return dbError(error, "folder load");
  if (!row) return fail(404, "Fiche introuvable.");
  if (row.status === "abandonne") return fail(409, "Cette fiche a été abandonnée.");
  const def = DELIVERABLES.find((d) => d.key === deliverable)!;
  const cached = row.drive_subfolders?.[deliverable];
  if (cached && row.drive_folder_path) {
    return { ok: true, value: { folderId: cached, path: `${row.drive_folder_path}/${def.folder}`, propertyId: row.property_id } };
  }
  const property = await loadFicheProperty(row.property_id);
  if (!property) return fail(404, "Bien introuvable.");
  const top = topFolderFor(row.kind);
  const name = visitFolderName(property.reference, property.title);
  const parentId = row.drive_folder_id ?? (await ensureVisitFolder(top, name));
  const folderId = await findOrCreateFolder(parentId, def.folder);
  const path = `Biens/${top}/${name}`;
  // Re-read the cache so two uploads starting together keep each other's subfolder.
  const { row: fresh } = await loadRow(visitId);
  await supabaseAdmin
    .from("field_visits")
    .update({
      drive_folder_id: parentId,
      drive_folder_path: path,
      drive_subfolders: { ...(fresh?.drive_subfolders ?? {}), [deliverable]: folderId },
    })
    .eq("id", visitId);
  return { ok: true, value: { folderId, path: `${path}/${def.folder}`, propertyId: row.property_id } };
}

// ---------------------------------------------------------------------------
// The sheet

export type TaskView = { key: TaskKey; id: string; title: string; ownerId: string; dueDate: string; dueTime: string | null; status: "a_faire" | "fait" | "reportee" };

export type FichePayload = {
  fiche: FicheData;
  status: FieldVisitRow["status"];
  completedAt: string | null;
  property: FicheProperty;
  uploads: UploadSummary;
  files: FicheFile[];
  folderPath: string | null;
  folderUrl: string | null;
  tasks: TaskView[];
};

async function loadTasks(row: FieldVisitRow): Promise<TaskView[]> {
  const ids = Object.values(row.task_ids ?? {}).filter(Boolean) as string[];
  if (!ids.length) return [];
  const { data, error } = await supabaseAdmin
    .from("staff_tasks")
    .select("id, title, owner_id, due_date, due_time, status, source_key")
    .in("id", ids);
  if (error) throw error;
  const keyOf = new Map(Object.entries(row.task_ids).map(([k, v]) => [v, k as TaskKey]));
  return (data ?? [])
    .map((t) => ({
      key: keyOf.get(t.id as string)!,
      id: t.id as string,
      title: t.title as string,
      ownerId: t.owner_id as string,
      dueDate: t.due_date as string,
      dueTime: typeof t.due_time === "string" ? t.due_time.slice(0, 5) : null,
      status: t.status as TaskView["status"],
    }))
    .filter((t) => t.key)
    .sort((a, b) => TASK_KEYS.indexOf(a.key) - TASK_KEYS.indexOf(b.key));
}

async function payloadFor(row: FieldVisitRow): Promise<FichePayload | null> {
  const property = await loadFicheProperty(row.property_id);
  if (!property) return null;
  const [files, tasks] = await Promise.all([loadFicheFiles(row.id), loadTasks(row)]);
  return {
    fiche: rowToFiche(row),
    status: row.status,
    completedAt: row.completed_at,
    property,
    uploads: summarize(files),
    files,
    folderPath: row.drive_folder_path ?? `Biens/${topFolderFor(row.kind)}/${visitFolderName(property.reference, property.title)}`,
    folderUrl: row.drive_folder_id ? driveFolderUrl(row.drive_folder_id) : null,
    tasks,
  };
}

export async function getFiche(id: string): Promise<ServiceResult<FichePayload>> {
  const { row, error } = await loadRow(id);
  if (error) return dbError(error, "load");
  if (!row) return fail(404, "Fiche introuvable.");
  const payload = await payloadFor(row);
  if (!payload) return fail(404, "Le bien de cette fiche n’existe plus.");
  return { ok: true, value: payload };
}

export type StartPayload = {
  property: FicheProperty;
  open: FichePayload | null;
  people: Pick<Person, "id" | "firstName" | "fullName" | "initials" | "levelLabel">[];
  viewerId: string;
  installed: boolean;
};

/** What the start screen needs: the listing, the team, and an unfinished sheet for this property if any. */
export async function getStart(viewer: Viewer, propertyId: string, people: Person[]): Promise<ServiceResult<StartPayload>> {
  const property = await loadFicheProperty(propertyId);
  if (!property) return fail(404, "Bien introuvable.");
  const { data, error } = await supabaseAdmin
    .from("field_visits")
    .select("*")
    .eq("property_id", propertyId)
    .eq("status", "en_cours")
    .maybeSingle();
  if (error && !isMissingTable(error)) return dbError(error, "open lookup");
  const open = data ? await payloadFor(data as FieldVisitRow) : null;
  return {
    ok: true,
    value: {
      property,
      open,
      people: people.map((p) => ({ id: p.id, firstName: p.firstName, fullName: p.fullName, initials: p.initials, levelLabel: p.levelLabel })),
      viewerId: viewer.id,
      installed: !isMissingTable(error),
    },
  };
}

export type SaveAnswer = { savedAt: string; fiche: FicheData; status: FieldVisitRow["status"]; uploads: UploadSummary };

/**
 * Saves the whole sheet (autosave). Creates it on first save, with the id the
 * device chose, so a sheet started without network gets the same id later.
 * The newest device change wins; an older one gets 409 and the stored sheet.
 */
export async function saveFiche(viewer: Viewer, data: FicheData, people: Person[]): Promise<ServiceResult<SaveAnswer>> {
  const staffIds = new Set(people.map((p) => p.id));
  if (data.person1Id && !staffIds.has(data.person1Id)) return fail(400, "Cette personne ne fait pas partie de l’équipe.");
  if (data.person2Id && !staffIds.has(data.person2Id)) return fail(400, "Cette personne ne fait pas partie de l’équipe.");
  if (!data.person1Id) return fail(400, "Choisissez une ou deux personnes.");

  const { row, error } = await loadRow(data.id);
  if (error) return dbError(error, "save load");

  if (row) {
    if (row.property_id !== data.propertyId) return fail(400, "Cette fiche concerne un autre bien.");
    if (row.status !== "en_cours") {
      return fail(409, row.status === "termine" ? "Cette fiche est déjà envoyée à l’équipe." : "Cette fiche a été abandonnée.", {
        fiche: rowToFiche(row),
        status: row.status,
      });
    }
    if (row.client_updated_at && Date.parse(data.updatedAt) < Date.parse(row.client_updated_at)) {
      return fail(409, "Une version plus récente existe (autre appareil).", { fiche: rowToFiche(row), status: row.status });
    }
  }

  // "Photos et vidéos supprimées des appareils" only once everything is in the Drive.
  const uploads = row ? summarize(await loadFicheFiles(row.id)) : {};
  if (data.checks[DELETE_CHECK_ID] && !allUploaded(uploads)) {
    const checks = { ...data.checks };
    delete checks[DELETE_CHECK_ID];
    data = { ...data, checks };
  }

  const columns = { ...ficheToColumns(data), updated_by: viewer.id, uploads };
  const result = row
    ? await supabaseAdmin.from("field_visits").update(columns).eq("id", data.id).select("*").single()
    : await supabaseAdmin
        .from("field_visits")
        .insert({ id: data.id, ...columns, created_by: viewer.id })
        .select("*")
        .single();
  if (result.error) {
    if (result.error.code === "23505") {
      const { data: other } = await supabaseAdmin
        .from("field_visits")
        .select("id")
        .eq("property_id", data.propertyId)
        .eq("status", "en_cours")
        .maybeSingle();
      return fail(409, "Une autre fiche est déjà en cours pour ce bien.", { existingId: other?.id ?? null });
    }
    if (result.error.code === "23503") return fail(400, "Le bien ou une personne n’existe plus.");
    return dbError(result.error, "save");
  }
  const saved = result.data as FieldVisitRow;
  return { ok: true, value: { savedAt: saved.updated_at, fiche: rowToFiche(saved), status: saved.status, uploads } };
}

export async function abandonFiche(viewer: Viewer, id: string): Promise<ServiceResult<{ id: string }>> {
  const { error } = await supabaseAdmin
    .from("field_visits")
    .update({ status: "abandonne", updated_by: viewer.id })
    .eq("id", id)
    .eq("status", "en_cours");
  if (error) return dbError(error, "abandon");
  return { ok: true, value: { id } };
}

export type CompleteAnswer = FichePayload & { created: number };

/**
 * "Envoyer la fiche à l’équipe": checks every step on the server, creates the
 * six tasks in the assignees' briefings and closes the sheet. Safe to call
 * twice: each task carries source_key field-visit:<id>:<key> (unique since
 * 089), so a second call creates nothing new.
 */
export async function completeFiche(
  viewer: Viewer,
  id: string,
  owners: Partial<Record<TaskKey, string>>,
  now = new Date(),
): Promise<ServiceResult<CompleteAnswer>> {
  const { row, error } = await loadRow(id);
  if (error) return dbError(error, "complete load");
  if (!row) return fail(404, "Fiche introuvable.");
  if (row.status === "abandonne") return fail(409, "Cette fiche a été abandonnée.");

  const files = await loadFicheFiles(id);
  const uploads = summarize(files);
  const fiche = rowToFiche(row);
  if (row.status === "en_cours") {
    const check = canFinish(fiche, uploads);
    if (!check.ready) return fail(400, `La fiche n’est pas complète. Il manque : ${check.missing.join(", ")}.`);
  }

  const chosen = row.status === "termine" ? row.task_owners : { ...row.task_owners, ...owners };
  const tasks = plannedTasks(row.visit_date, { person1Id: row.person1_id, person2Id: row.person2_id }, chosen);
  const property = await loadFicheProperty(row.property_id);
  const label = property ? [property.reference, property.title].filter(Boolean).join(" · ") : "";

  const keys = tasks.map((t) => taskSourceKey(id, t.key));
  const existing = await supabaseAdmin.from("staff_tasks").select("id, source_key").in("source_key", keys);
  if (existing.error) return dbError(existing.error, "tasks lookup");
  const have = new Map((existing.data ?? []).map((t) => [t.source_key as string, t.id as string]));
  const missing = tasks.filter((t) => !have.has(taskSourceKey(id, t.key)));
  let created = 0;
  if (missing.length) {
    const insert = await supabaseAdmin
      .from("staff_tasks")
      .insert(
        missing.map((t) => ({
          owner_id: t.ownerId,
          created_by: viewer.id,
          kind: "manuel",
          title: t.title,
          note: `Fiche de visite${label ? ` : ${label}` : ""}. Tournage du ${row.visit_date.split("-").reverse().join("/")}.`,
          due_date: t.dueDate,
          due_time: t.dueTime,
          property_id: row.property_id,
          source_key: taskSourceKey(id, t.key),
          field_visit_id: id,
        })),
      )
      .select("id, source_key");
    if (insert.error && insert.error.code !== "23505") return dbError(insert.error, "tasks insert");
    for (const t of insert.data ?? []) have.set(t.source_key as string, t.id as string);
    created = insert.data?.length ?? 0;
    if (insert.error) {
      // Another device finished at the same time: read back what it created.
      const again = await supabaseAdmin.from("staff_tasks").select("id, source_key").in("source_key", keys);
      for (const t of again.data ?? []) have.set(t.source_key as string, t.id as string);
    }
  }
  const taskIds = Object.fromEntries(tasks.map((t) => [t.key, have.get(taskSourceKey(id, t.key))]).filter(([, v]) => v));

  const update = await supabaseAdmin
    .from("field_visits")
    .update({
      status: "termine",
      step: 6,
      completed_at: row.completed_at ?? now.toISOString(),
      task_owners: Object.fromEntries(tasks.map((t) => [t.key, t.ownerId])),
      task_ids: taskIds,
      deliverable_dates: deliverableDates(row.visit_date),
      uploads,
      updated_by: viewer.id,
    })
    .eq("id", id)
    .select("*")
    .single();
  if (update.error) return dbError(update.error, "complete");
  const done = update.data as FieldVisitRow;

  // Hook for the Studio publishing calendar (branch not merged): a no-op today.
  if (!done.publications_created_at) await createCalendarPublications(done.id, plannedPublications(done.visit_date));

  const payload = await payloadFor(done);
  if (!payload) return fail(404, "Le bien de cette fiche n’existe plus.");
  return { ok: true, value: { ...payload, created } };
}

// ---------------------------------------------------------------------------
// Follow-up list (Directeur and Fondateur) and briefing notices

export type SuiviItem = {
  id: string;
  propertyId: string;
  reference: string | null;
  title: string;
  kind: "location" | "vente";
  visitDate: string;
  team: string;
  status: FieldVisitRow["status"];
  statusLabel: FicheStatus;
  updatedAt: string;
};

function teamLabel(row: Pick<FieldVisitRow, "person1_id" | "person2_id">, names: Map<string, string>) {
  return [row.person1_id, row.person2_id]
    .filter(Boolean)
    .map((id) => names.get(id!) ?? "Membre")
    .join(" et ");
}

type PropertyMini = { id: string; reference: string | null; property_type: string | null; quartier: string | null; city: string | null; bedrooms: number | null; area: number | null };

async function propertiesById(ids: string[]): Promise<Map<string, PropertyMini>> {
  if (!ids.length) return new Map();
  const { data, error } = await supabaseAdmin
    .from("properties")
    .select("id, reference, property_type, quartier, city, bedrooms, area")
    .in("id", [...new Set(ids)]);
  if (error) throw error;
  return new Map((data ?? []).map((p) => [p.id as string, p as PropertyMini]));
}

async function doneTaskCounts(rows: FieldVisitRow[]): Promise<Map<string, number>> {
  const ids = rows.flatMap((r) => ["t1", "t2", "t3", "t4", "t5"].map((k) => r.task_ids?.[k as TaskKey]).filter(Boolean) as string[]);
  if (!ids.length) return new Map();
  const { data } = await supabaseAdmin.from("staff_tasks").select("id, field_visit_id, status").in("id", ids).eq("status", "fait");
  const counts = new Map<string, number>();
  for (const t of data ?? []) counts.set(t.field_visit_id as string, (counts.get(t.field_visit_id as string) ?? 0) + 1);
  return counts;
}

export async function listSuivi(people: Person[], now = new Date()): Promise<ServiceResult<{ items: SuiviItem[] }>> {
  const { data, error } = await supabaseAdmin
    .from("field_visits")
    .select("*")
    .neq("status", "abandonne")
    .order("created_at", { ascending: false })
    .limit(60);
  if (error) return dbError(error, "suivi list");
  const rows = (data ?? []) as FieldVisitRow[];
  const [props, done] = await Promise.all([propertiesById(rows.map((r) => r.property_id)), doneTaskCounts(rows)]);
  const names = new Map(people.map((p) => [p.id, p.firstName]));
  return {
    ok: true,
    value: {
      items: rows.map((row) => {
        const property = props.get(row.property_id);
        const fiche = rowToFiche(row);
        return {
          id: row.id,
          propertyId: row.property_id,
          reference: property?.reference ?? null,
          title: property ? visitTitle(property) : "Bien supprimé",
          kind: row.kind,
          visitDate: row.visit_date,
          team: teamLabel(row, names),
          status: row.status,
          statusLabel: ficheStatus({ status: row.status, step: row.step, times: fiche.times, uploads: row.uploads, tasksDone: done.get(row.id) ?? 0 }, now),
          updatedAt: row.updated_at,
        };
      }),
    },
  };
}

export type FieldNotice = {
  id: string;
  propertyId: string;
  label: string;
  team: string;
  last: string;
  lastAt: string | null;
  mine: boolean;
  done: boolean;
};

const NOTICE_LABELS: Record<TimeKey, string> = {
  depart: "Partis du bureau",
  arrivee: "Arrivés sur place",
  departSite: "Départ du site",
  retour: "De retour au bureau",
};

/**
 * "Sur le terrain" in the briefing: today's sheets with their latest time
 * button. This is the in-app notice the four time buttons promise; it is
 * read from field_visits, nothing is copied into staff_tasks.
 */
export async function fieldNoticesToday(viewerId: string, people: Person[], now = new Date()): Promise<FieldNotice[]> {
  const today = toDayKey(now);
  const { data, error } = await supabaseAdmin
    .from("field_visits")
    .select("*")
    .eq("visit_date", today)
    .neq("status", "abandonne")
    .order("created_at", { ascending: true })
    .limit(20);
  if (error) {
    if (isMissingTable(error)) return [];
    throw error;
  }
  const rows = (data ?? []) as FieldVisitRow[];
  const props = await propertiesById(rows.map((r) => r.property_id));
  const names = new Map(people.map((p) => [p.id, p.firstName]));
  return rows.map((row) => {
    const fiche = rowToFiche(row);
    const lastKey = (["retour", "departSite", "arrivee", "depart"] as TimeKey[]).find((k) => fiche.times[k]);
    const property = props.get(row.property_id);
    return {
      id: row.id,
      propertyId: row.property_id,
      label: [property?.reference, property ? visitTitle(property) : null].filter(Boolean).join(" · "),
      team: teamLabel(row, names),
      last:
        row.status === "termine"
          ? "Tournage terminé"
          : lastKey
            ? `${NOTICE_LABELS[lastKey]} à ${hhmm(fiche.times[lastKey])}`
            : "Fiche commencée, pas encore partis",
      lastAt: row.status === "termine" ? row.completed_at : lastKey ? fiche.times[lastKey]! : null,
      mine: row.person1_id === viewerId || row.person2_id === viewerId,
      done: row.status === "termine",
    };
  });
}
