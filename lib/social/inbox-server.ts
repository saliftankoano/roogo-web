// Server side of Studio > Réseaux: reads Meta (lib/social/inbox.ts), stores
// the items and the team's status in the tables of migration 101, sends
// replies as the Roogo Page / Instagram account and logs each one with the
// staff member who sent it.
//
// Never throws to the page: a missing table becomes the notice « migration
// 101 à lancer », a Meta failure becomes a French error on its source's card.

import { supabaseAdmin } from "@/lib/supabase-admin";
import { metaConfigFromEnv } from "@/lib/studio/meta-graph";
import {
  INBOX_NOT_READY,
  INBOX_SOURCES,
  SOURCE_LABELS,
  applyStatusAction,
  callGraph,
  cleanReplyText,
  frenchInboxError,
  inboxLogShape,
  readSource,
  sendReply,
  statusAfterSync,
  type InboxConfig,
  type InboxCounts,
  type InboxFetch,
  type InboxItemDto,
  type InboxKind,
  type InboxNetwork,
  type InboxPayload,
  type InboxReplyDto,
  type InboxSource,
  type InboxStatus,
  type SourceRead,
  type SourceStateDto,
  type StatusAction,
  type SyncedItem,
  type ThreadMessage,
} from "./inbox";
import { responseSummary, slaState, weekStart, type ResponseRow, type ResponseSummary } from "./sla";

/** « Actualiser » reads Meta again only when the last read is older than this. */
export const MIN_REFRESH_MS = 2 * 60 * 1000;
const LIST_LIMIT = 200;
const WAITING_LIMIT = 2000;

const log = (message: string, detail: Record<string, unknown>) => console.error(message, detail);
const fetchImpl: InboxFetch = (url, init) => fetch(url, init);

type DbError = { code?: string; message?: string } | null | undefined;

export function isMissingInboxTable(error: DbError): boolean {
  const message = error?.message ?? "";
  return error?.code === "42P01" || error?.code === "PGRST205" || (/social_inbox/.test(message) && /does not exist|schema cache/.test(message));
}

type ItemRow = {
  id: string;
  network: InboxNetwork;
  kind: InboxKind;
  external_id: string;
  author_id: string | null;
  author_name: string | null;
  author_username: string | null;
  text: string;
  remote_created_at: string;
  last_user_message_at: string | null;
  post_caption: string | null;
  post_permalink: string | null;
  post_thumbnail: string | null;
  permalink: string | null;
  listing_reference: string | null;
  property_id: string | null;
  messages: ThreadMessage[] | null;
  status: InboxStatus;
  status_changed_by: string | null;
  status_changed_at: string | null;
  replied_by: string | null;
  replied_at: string | null;
  replied_externally: boolean;
};

const ITEM_COLUMNS =
  "id, network, kind, external_id, author_id, author_name, author_username, text, remote_created_at, last_user_message_at, post_caption, post_permalink, post_thumbnail, permalink, listing_reference, property_id, messages, status, status_changed_by, status_changed_at, replied_by, replied_at, replied_externally";

// --- Meta config ----------------------------------------------------------------

/** The Page token (swapped from the system user token), or the French reason. */
export async function inboxConfig(): Promise<{ cfg: InboxConfig | null; missing: string[]; error: string | null }> {
  const env = metaConfigFromEnv(process.env);
  if (!env.config) return { cfg: null, missing: env.missing, error: "Meta n'est pas configuré sur le serveur." };
  const base: InboxConfig = { graphVersion: env.config.graphVersion, pageId: env.config.pageId, igUserId: env.config.igUserId, pageToken: env.config.pageToken };
  if (!env.config.needsPageToken || !base.pageId) return { cfg: base, missing: env.missing, error: null };
  try {
    const data = await callGraph(fetchImpl, base.graphVersion, base.pageToken, { method: "GET", path: base.pageId, query: { fields: "access_token" } });
    if (typeof data.access_token === "string" && data.access_token) {
      return { cfg: { ...base, pageToken: data.access_token }, missing: env.missing, error: null };
    }
    return { cfg: null, missing: env.missing, error: "Le jeton Meta (META_GRAPH_TOKEN) ne donne pas accès à la Page Facebook. Vérifiez que l'utilisateur système gère la Page." };
  } catch (error) {
    log("[social-inbox] page token swap failed", inboxLogShape(error));
    return { cfg: null, missing: env.missing, error: frenchInboxError(error, "facebook_messages").replace("lire les messages Messenger", "lire la Page") };
  }
}

// --- Sync -------------------------------------------------------------------------

export type SyncSummary = {
  ready: boolean;
  skipped: boolean;
  sources: Array<{ source: InboxSource; ok: boolean; items: number; error: string | null }>;
};

async function lastAttemptAt(): Promise<{ ready: boolean; at: string | null }> {
  const { data, error } = await supabaseAdmin.from("social_inbox_sync").select("last_attempt_at").order("last_attempt_at", { ascending: false, nullsFirst: false }).limit(1);
  if (error) {
    if (isMissingInboxTable(error)) return { ready: false, at: null };
    throw error;
  }
  return { ready: true, at: (data?.[0]?.last_attempt_at as string | null | undefined) ?? null };
}

async function propertyIdsByReference(refs: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(refs)];
  const map = new Map<string, string>();
  if (!unique.length) return map;
  const { data, error } = await supabaseAdmin.from("properties").select("id, reference").in("reference", unique);
  if (error) {
    log("[social-inbox] reference lookup failed", { code: error.code, message: error.message });
    return map;
  }
  for (const row of data ?? []) if (row.reference) map.set(row.reference as string, row.id as string);
  return map;
}

/** Stores one source's items, keeping the team's status (statusAfterSync). */
async function storeItems(read: SourceRead, now: Date): Promise<void> {
  if (!read.items.length) return;
  const byKey = new Map<string, SyncedItem>();
  for (const item of read.items) byKey.set(`${item.network}|${item.kind}|${item.externalId}`, item);
  const items = [...byKey.values()];
  const first = items[0];
  const { data: existingRows, error } = await supabaseAdmin
    .from("social_inbox_items")
    .select("external_id, status, last_user_message_at, replied_at, replied_externally, status_changed_at, status_changed_by")
    .eq("network", first.network)
    .eq("kind", first.kind)
    .in("external_id", items.map((i) => i.externalId));
  if (error) throw error;
  const existing = new Map((existingRows ?? []).map((r) => [r.external_id as string, r]));
  const properties = await propertyIdsByReference(items.map((i) => i.listingReference).filter((r): r is string => Boolean(r)));
  const nowIso = now.toISOString();

  const rows = items.map((item) => {
    const prev = existing.get(item.externalId) ?? null;
    const next = statusAfterSync(
      prev ? { status: prev.status as InboxStatus, last_user_message_at: prev.last_user_message_at as string | null, replied_at: prev.replied_at as string | null } : null,
      { kind: item.kind, repliedByUs: item.repliedByUs, lastUserMessageAt: item.lastUserMessageAt },
    );
    const changed = !prev || prev.status !== next.status;
    return {
      network: item.network,
      kind: item.kind,
      external_id: item.externalId,
      parent_external_id: item.parentExternalId,
      author_id: item.authorId,
      author_name: item.authorName,
      author_username: item.authorUsername,
      text: item.text,
      remote_created_at: item.at,
      last_user_message_at: item.lastUserMessageAt,
      post_caption: item.post?.caption ?? null,
      post_permalink: item.post?.permalink ?? null,
      post_thumbnail: item.post?.thumbnail ?? null,
      permalink: item.permalink,
      listing_reference: item.listingReference,
      property_id: item.listingReference ? properties.get(item.listingReference) ?? null : null,
      messages: item.messages,
      status: next.status,
      status_changed_at: prev && changed ? nowIso : ((prev?.status_changed_at as string | null | undefined) ?? null),
      status_changed_by: prev && changed ? null : ((prev?.status_changed_by as string | null | undefined) ?? null),
      replied_externally: Boolean(prev?.replied_externally) || next.repliedExternally,
      raw: item.raw,
      last_synced_at: nowIso,
    };
  });
  const { error: upsertError } = await supabaseAdmin.from("social_inbox_items").upsert(rows, { onConflict: "network,kind,external_id" });
  if (upsertError) throw upsertError;
}

async function recordSource(source: InboxSource, now: Date, ok: boolean, count: number, error: string | null) {
  const nowIso = now.toISOString();
  const row: Record<string, unknown> = { source, last_attempt_at: nowIso, last_error: error, updated_at: nowIso };
  if (ok) {
    row.last_success_at = nowIso;
    row.item_count = count;
  }
  const { error: dbError } = await supabaseAdmin.from("social_inbox_sync").upsert(row, { onConflict: "source" });
  if (dbError) log("[social-inbox] sync state write failed", { source, code: dbError.code, message: dbError.message });
}

/**
 * Reads the four sources and stores them. With `minIntervalMs`, nothing is
 * read when the last attempt is more recent (« Actualiser » protection).
 */
export async function syncInbox(opts: { now?: Date; minIntervalMs?: number } = {}): Promise<SyncSummary> {
  const now = opts.now ?? new Date();
  const last = await lastAttemptAt();
  if (!last.ready) return { ready: false, skipped: true, sources: [] };
  if (opts.minIntervalMs && last.at) {
    const age = now.getTime() - new Date(last.at).getTime();
    if (age >= 0 && age < opts.minIntervalMs) return { ready: true, skipped: true, sources: [] };
  }

  const { cfg, error: cfgError } = await inboxConfig();
  const reads: SourceRead[] = cfg
    ? await Promise.all(INBOX_SOURCES.map((source) => readSource(fetchImpl, cfg, source, log)))
    : INBOX_SOURCES.map((source) => ({ source, ok: false, items: [], error: cfgError ?? "Meta n'est pas configuré sur le serveur." }));

  const summary: SyncSummary = { ready: true, skipped: false, sources: [] };
  for (const read of reads) {
    let ok = read.ok;
    let error = read.error;
    if (ok) {
      try {
        await storeItems(read, now);
      } catch (e) {
        const err = e as DbError;
        log("[social-inbox] store failed", { source: read.source, code: err?.code, message: err?.message });
        ok = false;
        error = "Les éléments lus chez Meta n'ont pas pu être enregistrés. Réessayez.";
      }
    }
    await recordSource(read.source, now, ok, read.items.length, error);
    summary.sources.push({ source: read.source, ok, items: read.items.length, error });
  }
  return summary;
}

// --- Reading for the page -----------------------------------------------------------

async function userNames(ids: Array<string | null | undefined>): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  const names = new Map<string, string>();
  if (!unique.length) return names;
  const { data } = await supabaseAdmin.from("users").select("id, full_name").in("id", unique);
  for (const u of data ?? []) names.set(u.id as string, (u.full_name as string | null) ?? "Sans nom");
  return names;
}

async function toDtos(rows: ItemRow[]): Promise<InboxItemDto[]> {
  const ids = rows.map((r) => r.id);
  const repliesByItem = new Map<string, Array<{ id: string; staff_id: string | null; text: string; status: "sent" | "failed"; error: string | null; sent_at: string }>>();
  if (ids.length) {
    const { data, error } = await supabaseAdmin
      .from("social_inbox_replies")
      .select("id, item_id, staff_id, text, status, error, sent_at")
      .in("item_id", ids)
      .order("sent_at", { ascending: true })
      .limit(1000);
    if (error) log("[social-inbox] replies read failed", { code: error.code, message: error.message });
    for (const r of data ?? []) {
      const list = repliesByItem.get(r.item_id as string) ?? [];
      list.push(r as never);
      repliesByItem.set(r.item_id as string, list);
    }
  }
  const allReplies = [...repliesByItem.values()].flat();
  const names = await userNames([...rows.flatMap((r) => [r.replied_by, r.status_changed_by]), ...allReplies.map((r) => r.staff_id)]);
  return rows.map((r) => ({
    id: r.id,
    network: r.network,
    kind: r.kind,
    authorName: r.author_name ?? "Inconnu",
    authorUsername: r.author_username,
    hasRecipient: Boolean(r.author_id),
    text: r.text,
    at: r.remote_created_at,
    lastUserMessageAt: r.last_user_message_at,
    post: r.post_caption !== null || r.post_permalink || r.post_thumbnail ? { caption: r.post_caption ?? "", permalink: r.post_permalink, thumbnail: r.post_thumbnail } : null,
    permalink: r.permalink,
    listingReference: r.listing_reference,
    propertyId: r.property_id,
    status: r.status,
    statusChangedByName: r.status_changed_by ? names.get(r.status_changed_by) ?? null : null,
    statusChangedAt: r.status_changed_at,
    repliedByName: r.replied_by ? names.get(r.replied_by) ?? null : null,
    repliedAt: r.replied_at,
    repliedExternally: r.replied_externally,
    messages: Array.isArray(r.messages) ? r.messages : [],
    replies: (repliesByItem.get(r.id) ?? []).slice(-5).map(
      (x): InboxReplyDto => ({ id: x.id, staffName: x.staff_id ? names.get(x.staff_id) ?? null : null, text: x.text, status: x.status, error: x.error, sentAt: x.sent_at }),
    ),
  }));
}

/**
 * « À répondre » per list, and how many are past the 24 business hours
 * deadline (lib/social/sla.ts), for the badges and the briefing. Zero when the
 * tables are missing.
 */
export async function inboxCounts(now = new Date()): Promise<InboxCounts & { ready: boolean }> {
  const { data, error } = await supabaseAdmin
    .from("social_inbox_items")
    .select("kind, remote_created_at, last_user_message_at")
    .eq("status", "a_repondre")
    .limit(WAITING_LIMIT);
  if (error) {
    if (!isMissingInboxTable(error)) log("[social-inbox] count failed", { code: error.code, message: error.message });
    return { ready: !isMissingInboxTable(error), comments: 0, messages: 0, total: 0, overdue: 0 };
  }
  let comments = 0;
  let messages = 0;
  let overdue = 0;
  for (const row of data ?? []) {
    const kind = row.kind as InboxKind;
    if (kind === "comment") comments += 1;
    else messages += 1;
    const sla = slaState({ kind, status: "a_repondre", at: row.remote_created_at as string, lastUserMessageAt: row.last_user_message_at as string | null }, now);
    if (sla?.overdue) overdue += 1;
  }
  return { ready: true, comments, messages, total: comments + messages, overdue };
}

/**
 * « Délai de réponse » of the current week (Directeur and Fondateur only, the
 * page checks). Built from migration 101's columns: replied_at and replied_by
 * hold the LAST reply of an item, so one reply per item is measured. Null when
 * the tables are missing or the read fails.
 */
export async function loadResponseSummary(now = new Date()): Promise<ResponseSummary | null> {
  const since = weekStart(now).toISOString();
  const { data, error } = await supabaseAdmin
    .from("social_inbox_items")
    .select("kind, status, remote_created_at, last_user_message_at, replied_at, replied_by, replied_externally, status_changed_at")
    .eq("status", "repondu")
    .or(`replied_at.gte.${since},status_changed_at.gte.${since}`)
    .limit(2000);
  if (error) {
    if (!isMissingInboxTable(error)) log("[social-inbox] response times failed", { code: error.code, message: error.message });
    return null;
  }
  const rows = data ?? [];
  const names = await userNames(rows.map((r) => r.replied_by as string | null));
  return responseSummary(
    rows.map(
      (r): ResponseRow => ({
        kind: r.kind as InboxKind,
        status: r.status as InboxStatus,
        at: r.remote_created_at as string,
        lastUserMessageAt: r.last_user_message_at as string | null,
        repliedAt: r.replied_at as string | null,
        repliedById: r.replied_by as string | null,
        repliedByName: r.replied_by ? names.get(r.replied_by as string) ?? null : null,
        repliedExternally: Boolean(r.replied_externally),
        statusChangedAt: r.status_changed_at as string | null,
      }),
    ),
    now,
  );
}

function emptySources(): SourceStateDto[] {
  return INBOX_SOURCES.map((source) => ({ source, label: SOURCE_LABELS[source], lastAttemptAt: null, lastSuccessAt: null, lastError: null, itemCount: 0 }));
}

/** Everything Studio > Réseaux shows. Never throws. */
export async function loadInbox(now = new Date()): Promise<InboxPayload> {
  const env = metaConfigFromEnv(process.env);
  const base: InboxPayload = {
    ready: false,
    notice: null,
    items: [],
    counts: { comments: 0, messages: 0, total: 0, overdue: 0 },
    sources: emptySources(),
    missing: env.missing,
    pageId: env.config?.pageId || null,
    lastSyncAt: null,
    fetchedAt: now.toISOString(),
  };
  try {
    const { data, error } = await supabaseAdmin.from("social_inbox_items").select(ITEM_COLUMNS).order("remote_created_at", { ascending: false }).limit(LIST_LIMIT);
    if (error) {
      if (isMissingInboxTable(error)) return { ...base, notice: INBOX_NOT_READY };
      throw error;
    }
    const [items, counts, sync] = await Promise.all([
      toDtos((data ?? []) as unknown as ItemRow[]),
      inboxCounts(now),
      supabaseAdmin.from("social_inbox_sync").select("source, last_attempt_at, last_success_at, last_error, item_count"),
    ]);
    const states = new Map((sync.data ?? []).map((s) => [s.source as InboxSource, s]));
    const sources = emptySources().map((s) => {
      const row = states.get(s.source);
      return row
        ? { ...s, lastAttemptAt: row.last_attempt_at as string | null, lastSuccessAt: row.last_success_at as string | null, lastError: row.last_error as string | null, itemCount: (row.item_count as number) ?? 0 }
        : s;
    });
    const lastSyncAt = sources.map((s) => s.lastAttemptAt).filter((v): v is string => Boolean(v)).sort().at(-1) ?? null;
    return { ...base, ready: true, items, counts: { comments: counts.comments, messages: counts.messages, total: counts.total, overdue: counts.overdue }, sources, lastSyncAt };
  } catch (error) {
    const e = error as DbError;
    log("[social-inbox] load failed", { code: e?.code, message: e?.message });
    return { ...base, notice: "La boîte Réseaux n'a pas pu se charger. Rechargez la page dans un instant." };
  }
}

// --- Actions ------------------------------------------------------------------------

export type ActionResult = { ok: true; item: InboxItemDto } | { ok: false; status: number; error: string };

async function loadItem(id: string): Promise<{ row: ItemRow | null; notReady: boolean }> {
  const { data, error } = await supabaseAdmin.from("social_inbox_items").select(ITEM_COLUMNS).eq("id", id).maybeSingle();
  if (error) {
    if (isMissingInboxTable(error)) return { row: null, notReady: true };
    throw error;
  }
  return { row: (data as unknown as ItemRow | null) ?? null, notReady: false };
}

async function reloadDto(id: string): Promise<InboxItemDto | null> {
  const { row } = await loadItem(id);
  return row ? (await toDtos([row]))[0] : null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Sends a reply as the Roogo Page / account and logs it with the staff member. */
export async function replyToItem(id: string, staffId: string, input: unknown, now = new Date()): Promise<ActionResult> {
  if (!UUID_RE.test(id)) return { ok: false, status: 404, error: "Élément introuvable." };
  const { text, error: textError } = cleanReplyText(input);
  if (textError) return { ok: false, status: 400, error: textError };
  const { row, notReady } = await loadItem(id);
  if (notReady) return { ok: false, status: 503, error: INBOX_NOT_READY };
  if (!row) return { ok: false, status: 404, error: "Élément introuvable." };

  const { cfg, error: cfgError } = await inboxConfig();
  const result = cfg
    ? await sendReply(
        fetchImpl,
        cfg,
        { network: row.network, kind: row.kind, externalId: row.external_id, authorId: row.author_id, lastUserMessageAt: row.last_user_message_at },
        text,
        now,
        log,
      )
    : { ok: false as const, error: cfgError ?? "Meta n'est pas configuré sur le serveur." };

  const nowIso = now.toISOString();
  const { error: logError } = await supabaseAdmin.from("social_inbox_replies").insert({
    item_id: row.id,
    network: row.network,
    kind: row.kind,
    staff_id: staffId,
    text,
    status: result.ok ? "sent" : "failed",
    external_id: result.ok ? result.externalId : null,
    error: result.ok ? null : result.error,
    sent_at: nowIso,
  });
  if (logError) log("[social-inbox] reply log failed", { item: row.id, ok: result.ok, code: logError.code, message: logError.message });

  if (!result.ok) return { ok: false, status: 502, error: result.error };

  const messages = row.kind === "message" ? [...(row.messages ?? []), { id: result.externalId ?? `local-${nowIso}`, fromUs: true, text, at: nowIso }].slice(-20) : row.messages ?? [];
  const { error: updateError } = await supabaseAdmin
    .from("social_inbox_items")
    .update({ status: "repondu", replied_by: staffId, replied_at: nowIso, status_changed_by: staffId, status_changed_at: nowIso, messages })
    .eq("id", row.id);
  if (updateError) log("[social-inbox] status after reply failed", { item: row.id, code: updateError.code, message: updateError.message });
  const item = await reloadDto(row.id);
  return item ? { ok: true, item } : { ok: false, status: 500, error: "Réponse envoyée, mais l'élément n'a pas pu être relu." };
}

/** « Marquer comme répondu », « Ignorer », « Remettre à répondre ». */
export async function setItemStatus(id: string, staffId: string, action: StatusAction, now = new Date()): Promise<ActionResult> {
  if (!UUID_RE.test(id)) return { ok: false, status: 404, error: "Élément introuvable." };
  const { row, notReady } = await loadItem(id);
  if (notReady) return { ok: false, status: 503, error: INBOX_NOT_READY };
  if (!row) return { ok: false, status: 404, error: "Élément introuvable." };
  const next = applyStatusAction(row.status, action);
  if (!next.status) return { ok: false, status: 409, error: next.error ?? "Changement impossible." };
  const nowIso = now.toISOString();
  const patch: Record<string, unknown> = { status: next.status, status_changed_by: staffId, status_changed_at: nowIso };
  if (action === "mark_replied") {
    patch.replied_by = staffId;
    patch.replied_at = nowIso;
  }
  const { error } = await supabaseAdmin.from("social_inbox_items").update(patch).eq("id", row.id).eq("status", row.status);
  if (error) {
    log("[social-inbox] status change failed", { item: row.id, code: error.code, message: error.message });
    return { ok: false, status: 500, error: "Le statut n'a pas pu être changé. Réessayez." };
  }
  const item = await reloadDto(row.id);
  return item ? { ok: true, item } : { ok: false, status: 500, error: "Statut changé, mais l'élément n'a pas pu être relu." };
}
