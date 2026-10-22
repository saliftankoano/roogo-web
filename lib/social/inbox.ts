// Studio > Réseaux: the pure rules of the social inbox (comments and direct
// messages from the Roogo Facebook Page and @roogo.burkina on Instagram).
//
// No runtime imports, so node:test loads this file directly
// (lib/social/inbox.test.mjs) with a fake fetch and Meta fixtures. The server
// side (lib/social/inbox-server.ts) reads the env, swaps the system user token
// for the Page token, stores rows (migration 101) and sends replies.
//
// Every Graph call takes `fetch` as an argument. The token travels in the
// Authorization header, never in a URL we log, and errors are rebuilt in
// French from Meta's code: a token never reaches a message or a log.
//
// Graph API (v25, checked 2026-10-21):
//   Facebook comments  GET  /{page}/published_posts?fields=...,comments{...,comments{from}}
//   Instagram comments GET  /{ig-user}?fields=username,media{...,comments{...,replies{...}}}
//   Conversations      GET  /{page}/conversations?platform=messenger|instagram&fields=...,messages{...}
//   Reply to comment   POST /{comment}/comments (Facebook) | POST /{comment}/replies (Instagram)
//   Send a message     POST /{page}/messages { recipient: { id }, messaging_type: RESPONSE, message: { text } }

export type InboxNetwork = "facebook" | "instagram" | "tiktok";
export type InboxKind = "comment" | "message";
export type InboxStatus = "a_repondre" | "repondu" | "ignore";
export type InboxSource = "facebook_comments" | "instagram_comments" | "facebook_messages" | "instagram_messages";

export const INBOX_STATUSES: readonly InboxStatus[] = ["a_repondre", "repondu", "ignore"];
export const INBOX_SOURCES: readonly InboxSource[] = ["facebook_comments", "instagram_comments", "facebook_messages", "instagram_messages"];

export const INBOX_STATUS_LABELS: Record<InboxStatus, string> = {
  a_repondre: "À répondre",
  repondu: "Répondu",
  ignore: "Ignoré",
};

export const INBOX_NETWORK_LABELS: Record<InboxNetwork, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  tiktok: "TikTok",
};

export const SOURCE_LABELS: Record<InboxSource, string> = {
  facebook_comments: "Commentaires Facebook",
  instagram_comments: "Commentaires Instagram",
  facebook_messages: "Messages Messenger",
  instagram_messages: "Messages Instagram",
};

export function sourceOf(network: InboxNetwork, kind: InboxKind): InboxSource | null {
  if (network === "tiktok") return null;
  return `${network}_${kind === "comment" ? "comments" : "messages"}` as InboxSource;
}

export const INBOX_NOT_READY = "La boîte Réseaux n'est pas encore installée (migration 101 à lancer).";
export const TIKTOK_COMMENTS_NOTE =
  "TikTok : les commentaires ne sont pas lisibles avec l'accès actuel (Login Kit et publication). Ils arriveront avec l'API TikTok for Business.";

// --- Listing reference ------------------------------------------------------

/**
 * The first VEN-/LOC- code in a caption or a comment ("VEN-023", "loc 7",
 * "Réf VEN023"), normalised to the stored shape (VEN-023), or null.
 */
export function extractListingReference(...texts: Array<string | null | undefined>): string | null {
  for (const text of texts) {
    if (!text) continue;
    const match = /(?<![A-Za-z0-9])(VEN|LOC)[\s-]?(\d{1,6})(?![0-9])/i.exec(text);
    if (match) return `${match[1].toUpperCase()}-${match[2].padStart(3, "0")}`;
  }
  return null;
}

// --- Meta's messaging windows ------------------------------------------------
// A Page may answer normally for 24 hours after the person's last message, then
// up to 7 days with the HUMAN_AGENT tag (Human Agent feature on the Roogo Social app).

export const MESSAGING_WINDOW_MS = 24 * 60 * 60 * 1000;
export const HUMAN_AGENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
export const WINDOW_CLOSED_MESSAGE = "Fenêtre de 7 jours dépassée : répondez sur Instagram directement";
export const WINDOW_CLOSED_MESSAGE_FACEBOOK = "Fenêtre de 7 jours dépassée : répondez sur Messenger directement";

/** humanAgent: past the standard 24 h, the reply goes out with the HUMAN_AGENT tag. remainingMs counts to the end of the current window. */
export type MessagingWindow = { open: boolean; closesAt: string | null; remainingMs: number; humanAgent: boolean };

export function messagingWindow(lastUserMessageAt: string | null | undefined, now: Date): MessagingWindow {
  const t = lastUserMessageAt ? new Date(lastUserMessageAt).getTime() : NaN;
  if (!Number.isFinite(t)) return { open: false, closesAt: null, remainingMs: 0, humanAgent: false };
  const standardEnd = t + MESSAGING_WINDOW_MS;
  const humanEnd = t + HUMAN_AGENT_WINDOW_MS;
  const nowMs = now.getTime();
  if (nowMs < standardEnd) return { open: true, closesAt: new Date(standardEnd).toISOString(), remainingMs: standardEnd - nowMs, humanAgent: false };
  const remaining = humanEnd - nowMs;
  return { open: remaining > 0, closesAt: new Date(humanEnd).toISOString(), remainingMs: Math.max(0, remaining), humanAgent: remaining > 0 };
}

/** "Encore 3 h pour répondre", "Encore 25 min pour répondre", or past 24 h "Encore 4 j pour répondre (agent humain)". */
export function windowLabel(w: MessagingWindow): string | null {
  if (!w.open) return null;
  const min = Math.ceil(w.remainingMs / 60000);
  const suffix = w.humanAgent ? " (agent humain)" : "";
  if (min < 60) return `Encore ${min} min pour répondre${suffix}`;
  if (w.humanAgent && min >= 24 * 60) return `Encore ${Math.floor(min / 1440)} j pour répondre${suffix}`;
  return `Encore ${Math.floor(min / 60)} h pour répondre${suffix}`;
}

export type ReplyTarget = {
  network: InboxNetwork;
  kind: InboxKind;
  lastUserMessageAt?: string | null;
  authorId?: string | null;
};

/** Why « Envoyer » is disabled for this item, or null when a reply can go out. */
export function replyBlockReason(item: ReplyTarget, now: Date): string | null {
  if (item.network === "tiktok") return "La réponse depuis Roogo n'est pas encore possible pour TikTok.";
  if (item.kind === "message") {
    if (!item.authorId) return "Meta ne donne pas le destinataire de cette conversation.";
    if (!messagingWindow(item.lastUserMessageAt, now).open) {
      return item.network === "facebook" ? WINDOW_CLOSED_MESSAGE_FACEBOOK : WINDOW_CLOSED_MESSAGE;
    }
  }
  return null;
}

export const MAX_REPLY_LENGTH = 2000;

/** The text to send, trimmed, or the French reason it cannot go. */
export function cleanReplyText(input: unknown): { text: string; error: string | null } {
  const text = typeof input === "string" ? input.replace(/\r\n?/g, "\n").trim() : "";
  if (!text) return { text, error: "Écrivez une réponse." };
  if (text.length > MAX_REPLY_LENGTH) return { text, error: `La réponse dépasse ${MAX_REPLY_LENGTH} caractères.` };
  return { text, error: null };
}

/** Where to answer when the dashboard cannot (window closed, TikTok). */
export function openOnNetworkUrl(item: { network: InboxNetwork; kind: InboxKind; permalink?: string | null }, pageId?: string | null): string {
  if (item.permalink) return item.permalink;
  if (item.network === "instagram") return item.kind === "message" ? "https://www.instagram.com/direct/inbox/" : "https://www.instagram.com/";
  if (item.network === "tiktok") return "https://www.tiktok.com/";
  return pageId ? `https://business.facebook.com/latest/inbox/all?asset_id=${encodeURIComponent(pageId)}` : "https://business.facebook.com/latest/inbox/all";
}

// --- Status transitions ---------------------------------------------------------

export type StatusAction = "mark_replied" | "ignore" | "reopen";

/** Manual status changes. A reply sent from the dashboard always sets « Répondu ». */
export function applyStatusAction(current: InboxStatus, action: StatusAction): { status: InboxStatus | null; error: string | null } {
  switch (action) {
    case "mark_replied":
      return current === "repondu" ? { status: null, error: "Déjà marqué comme répondu." } : { status: "repondu", error: null };
    case "ignore":
      return current === "a_repondre" ? { status: "ignore", error: null } : { status: null, error: "Seul un élément « À répondre » peut être ignoré." };
    case "reopen":
      return current === "a_repondre" ? { status: null, error: "Cet élément attend déjà une réponse." } : { status: "a_repondre", error: null };
    default:
      return { status: null, error: "Action inconnue." };
  }
}

export function isStatusAction(value: unknown): value is StatusAction {
  return value === "mark_replied" || value === "ignore" || value === "reopen";
}

export type StoredState = {
  status: InboxStatus;
  last_user_message_at: string | null;
  replied_at: string | null;
};

/**
 * Status after a sync. A new item waits for a reply unless the Page already
 * answered it in the Meta apps. On a known item:
 * - the team's choice stays (Répondu, Ignoré),
 * - a new message from the person reopens a conversation, even an ignored one
 *   (nobody misses a buyer),
 * - an answer seen on the network closes « À répondre » (replied elsewhere).
 */
export function statusAfterSync(
  existing: StoredState | null,
  incoming: { kind: InboxKind; repliedByUs: boolean; lastUserMessageAt: string | null },
): { status: InboxStatus; repliedExternally: boolean } {
  if (!existing) {
    return { status: incoming.repliedByUs ? "repondu" : "a_repondre", repliedExternally: incoming.repliedByUs };
  }
  if (incoming.kind === "message") {
    const before = existing.last_user_message_at ? new Date(existing.last_user_message_at).getTime() : 0;
    const after = incoming.lastUserMessageAt ? new Date(incoming.lastUserMessageAt).getTime() : 0;
    if (after > before && !incoming.repliedByUs) return { status: "a_repondre", repliedExternally: false };
  }
  if (existing.status === "a_repondre" && incoming.repliedByUs) return { status: "repondu", repliedExternally: true };
  return { status: existing.status, repliedExternally: false };
}

// --- Parsed items ---------------------------------------------------------------

export type ThreadMessage = { id: string; fromUs: boolean; text: string; at: string };

export type SyncedItem = {
  network: InboxNetwork;
  kind: InboxKind;
  externalId: string;
  parentExternalId: string | null;
  authorId: string | null;
  authorName: string;
  authorUsername: string | null;
  text: string;
  at: string;
  lastUserMessageAt: string | null;
  post: { id: string; caption: string; permalink: string | null; thumbnail: string | null } | null;
  permalink: string | null;
  listingReference: string | null;
  /** The Page or account has answered after the person's last word. */
  repliedByUs: boolean;
  messages: ThreadMessage[];
  raw: Record<string, unknown>;
};

type Json = Record<string, unknown>;

function str(value: unknown): string | null {
  return typeof value === "string" && value ? value : typeof value === "number" ? String(value) : null;
}

function iso(value: unknown): string | null {
  const s = str(value);
  if (!s) return null;
  const t = new Date(s).getTime();
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

function list(value: unknown): Json[] {
  const data = (value as { data?: unknown } | null | undefined)?.data;
  return Array.isArray(data) ? (data.filter((x) => x && typeof x === "object") as Json[]) : [];
}

/** One readable line, cut at `max`. */
export function oneLine(text: unknown, max = 160): string {
  const flat = (typeof text === "string" ? text : "").replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}

function absoluteFacebook(link: string | null): string | null {
  if (!link) return null;
  return link.startsWith("http") ? link : `https://www.facebook.com${link.startsWith("/") ? "" : "/"}${link}`;
}

const HIDDEN_AUTHOR = "Personne sur Facebook";

/**
 * Facebook Page comments from /{page}/published_posts. Comments by the Page
 * itself are skipped; a comment counts as answered when the Page wrote under
 * it. Without pages_read_user_content Meta hides `from`: the item still shows.
 */
export function parseFacebookComments(body: unknown, pageId: string): SyncedItem[] {
  const out: SyncedItem[] = [];
  for (const post of list(body)) {
    const postId = str(post.id);
    if (!postId) continue;
    const fullCaption = typeof post.message === "string" ? post.message : "";
    const postRef = {
      id: postId,
      caption: oneLine(fullCaption || post.story, 140),
      permalink: str(post.permalink_url),
      thumbnail: str(post.full_picture),
    };
    for (const c of list(post.comments)) {
      const id = str(c.id);
      const at = iso(c.created_time);
      if (!id || !at) continue;
      const from = (c.from ?? null) as Json | null;
      if (str(from?.id) === pageId) continue;
      const replies = list(c.comments);
      const text = typeof c.message === "string" ? c.message : "";
      out.push({
        network: "facebook",
        kind: "comment",
        externalId: id,
        parentExternalId: postId,
        authorId: str(from?.id),
        authorName: str(from?.name) ?? HIDDEN_AUTHOR,
        authorUsername: null,
        text: text.slice(0, 8000),
        at,
        lastUserMessageAt: null,
        post: postRef,
        permalink: str(c.permalink_url) ?? postRef.permalink,
        listingReference: extractListingReference(fullCaption, text),
        repliedByUs: replies.some((r) => str((r.from as Json | undefined)?.id) === pageId),
        messages: [],
        raw: { id, created_time: c.created_time, from: from ? { id: from.id, name: from.name } : null, message: text, replies: replies.length },
      });
    }
  }
  return out;
}

/**
 * Instagram comments from GET /{ig-user}?fields=username,media{...comments{...}}.
 * Comments by @roogo.burkina are skipped; a comment counts as answered when
 * the account replied under it.
 */
export function parseInstagramComments(body: unknown, igUserId: string): SyncedItem[] {
  const root = (body ?? {}) as Json;
  const own = (str(root.username) ?? "").toLowerCase();
  const isOwn = (c: Json) => {
    const from = (c.from ?? null) as Json | null;
    return str(from?.id) === igUserId || (!!own && (str(c.username) ?? str(from?.username) ?? "").toLowerCase() === own);
  };
  const media = Array.isArray((root as { data?: unknown }).data) ? list(root) : list(root.media);
  const out: SyncedItem[] = [];
  for (const m of media) {
    const mediaId = str(m.id);
    if (!mediaId) continue;
    const fullCaption = typeof m.caption === "string" ? m.caption : "";
    const postRef = {
      id: mediaId,
      caption: oneLine(fullCaption, 140),
      permalink: str(m.permalink),
      thumbnail: str(m.thumbnail_url) ?? (str(m.media_type) === "VIDEO" ? null : str(m.media_url)),
    };
    for (const c of list(m.comments)) {
      const id = str(c.id);
      const at = iso(c.timestamp);
      if (!id || !at || isOwn(c)) continue;
      const from = (c.from ?? null) as Json | null;
      const username = str(c.username) ?? str(from?.username);
      const replies = list(c.replies);
      const text = typeof c.text === "string" ? c.text : "";
      out.push({
        network: "instagram",
        kind: "comment",
        externalId: id,
        parentExternalId: mediaId,
        authorId: str(from?.id),
        authorName: username ? `@${username}` : "Compte Instagram",
        authorUsername: username,
        text: text.slice(0, 8000),
        at,
        lastUserMessageAt: null,
        post: postRef,
        permalink: postRef.permalink,
        listingReference: extractListingReference(fullCaption, text),
        repliedByUs: replies.some(isOwn),
        messages: [],
        raw: { id, timestamp: c.timestamp, username, text, replies: replies.length },
      });
    }
  }
  return out;
}

/**
 * Conversations from /{page}/conversations (platform=messenger or instagram).
 * Meta lists messages newest first. `selfIds` are the Page id and the
 * Instagram account id: a message from one of them is « from us ».
 */
export function parseConversations(body: unknown, network: "facebook" | "instagram", selfIds: string[]): SyncedItem[] {
  const self = new Set(selfIds.filter(Boolean));
  const out: SyncedItem[] = [];
  for (const conv of list(body)) {
    const id = str(conv.id);
    if (!id) continue;
    const raw = list(conv.messages);
    const msgs: ThreadMessage[] = [];
    let other: Json | null = null;
    for (const m of raw) {
      const mid = str(m.id);
      const at = iso(m.created_time);
      if (!mid || !at) continue;
      const from = (m.from ?? null) as Json | null;
      const fromUs = self.has(str(from?.id) ?? "");
      if (!fromUs && !other && from) other = from;
      const text = typeof m.message === "string" && m.message.trim() ? m.message : "[Pièce jointe ou réaction]";
      msgs.push({ id: mid, fromUs, text: text.slice(0, 2000), at });
    }
    msgs.sort((a, b) => a.at.localeCompare(b.at));
    if (!other) {
      other = list(conv.participants).find((p) => !self.has(str(p.id) ?? "")) ?? null;
    }
    const lastUser = [...msgs].reverse().find((m) => !m.fromUs) ?? null;
    if (!lastUser) continue; // Only messages we sent: nothing to answer.
    const latest = msgs[msgs.length - 1];
    const username = str(other?.username);
    const name = str(other?.name) ?? (username ? `@${username}` : network === "instagram" ? "Compte Instagram" : HIDDEN_AUTHOR);
    out.push({
      network,
      kind: "message",
      externalId: id,
      parentExternalId: null,
      authorId: str(other?.id),
      authorName: name,
      authorUsername: username,
      text: lastUser.text,
      at: iso(conv.updated_time) ?? latest.at,
      lastUserMessageAt: lastUser.at,
      post: null,
      permalink: network === "facebook" ? absoluteFacebook(str(conv.link)) : null,
      listingReference: extractListingReference(...[...msgs].reverse().map((m) => m.text)),
      repliedByUs: latest.fromUs,
      messages: msgs.slice(-20),
      raw: { id, updated_time: conv.updated_time, messages: msgs.length, participant: other ? { id: other.id } : null },
    });
  }
  return out;
}

// --- Graph requests ---------------------------------------------------------------

export const INBOX_POSTS = 15;
export const INBOX_COMMENTS_PER_POST = 50;
export const INBOX_CONVERSATIONS = 25;

export type InboxConfig = {
  graphVersion: string;
  pageId: string;
  igUserId: string;
  /** Page token (after the swap). */
  pageToken: string;
};

export type GraphReq = {
  method: "GET" | "POST";
  path: string;
  query?: Record<string, string>;
  json?: Record<string, unknown>;
  form?: Record<string, string>;
};

export const requests = {
  facebookComments: (cfg: InboxConfig): GraphReq => ({
    method: "GET",
    path: `${cfg.pageId}/published_posts`,
    query: {
      limit: String(INBOX_POSTS),
      fields: `id,message,story,permalink_url,full_picture,created_time,comments.limit(${INBOX_COMMENTS_PER_POST}).order(reverse_chronological){id,message,from{id,name},created_time,permalink_url,comments.limit(10){from{id},created_time}}`,
    },
  }),
  instagramComments: (cfg: InboxConfig): GraphReq => ({
    method: "GET",
    path: cfg.igUserId,
    query: {
      fields: `username,media.limit(${INBOX_POSTS}){id,caption,permalink,media_type,media_url,thumbnail_url,timestamp,comments.limit(${INBOX_COMMENTS_PER_POST}){id,text,username,timestamp,from,replies{id,username,from,timestamp}}}`,
    },
  }),
  conversations: (cfg: InboxConfig, platform: "messenger" | "instagram"): GraphReq => ({
    method: "GET",
    path: `${cfg.pageId}/conversations`,
    query: {
      platform,
      limit: String(INBOX_CONVERSATIONS),
      fields: "id,updated_time,link,participants,messages.limit(10){id,message,from,to,created_time}",
    },
  }),
  replyToComment: (network: "facebook" | "instagram", commentId: string, text: string): GraphReq => ({
    method: "POST",
    path: network === "facebook" ? `${commentId}/comments` : `${commentId}/replies`,
    form: { message: text },
  }),
  sendMessage: (cfg: InboxConfig, recipientId: string, text: string, humanAgent = false): GraphReq => ({
    method: "POST",
    path: `${cfg.pageId}/messages`,
    json: humanAgent
      ? { recipient: { id: recipientId }, messaging_type: "MESSAGE_TAG", tag: "HUMAN_AGENT", message: { text } }
      : { recipient: { id: recipientId }, messaging_type: "RESPONSE", message: { text } },
  }),
};

// --- Errors -------------------------------------------------------------------------

export class InboxGraphError extends Error {
  readonly code: number | null;
  readonly subcode: number | null;
  readonly httpStatus: number;
  constructor(code: number | null, subcode: number | null, httpStatus: number, message: string) {
    super(message);
    this.name = "InboxGraphError";
    this.code = code;
    this.subcode = subcode;
    this.httpStatus = httpStatus;
  }
}

export type InboxErrorKind = "token" | "permission" | "limit" | "window" | "unavailable" | "network" | "other";

export function inboxErrorKind(error: unknown): InboxErrorKind {
  if (!(error instanceof InboxGraphError)) return "network";
  const c = error.code;
  const sub = error.subcode;
  // Messenger: "This message is sent outside of allowed window" (10 / 2018278), Instagram (10 / 2534022).
  if (sub === 2018278 || sub === 2534022 || (c === 10 && /window/i.test(error.message))) return "window";
  if (c === 190 || c === 102 || c === 463 || c === 467) return "token";
  if (c === 10 || c === 200 || c === 3 || (c !== null && c > 200 && c < 300)) return "permission";
  if (c === 4 || c === 17 || c === 32 || c === 613 || (c !== null && c >= 80001 && c <= 80009)) return "limit";
  if (c === 1 || c === 2 || error.httpStatus >= 500) return "unavailable";
  return "other";
}

export type InboxAction = InboxSource | "facebook_comment_reply" | "instagram_comment_reply" | "facebook_message_send" | "instagram_message_send";

/** The Meta permissions each read or write needs (docs, PR body and error texts). */
export const ACTION_PERMISSIONS: Record<InboxAction, string> = {
  facebook_comments: "pages_read_engagement et pages_read_user_content",
  instagram_comments: "instagram_basic et instagram_manage_comments",
  facebook_messages: "pages_messaging",
  instagram_messages: "instagram_manage_messages",
  facebook_comment_reply: "pages_manage_engagement",
  instagram_comment_reply: "instagram_manage_comments",
  facebook_message_send: "pages_messaging",
  instagram_message_send: "instagram_manage_messages",
};

/** The full list for the system user token (docs and PR body). */
export const REQUIRED_META_PERMISSIONS = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  "pages_read_user_content",
  "pages_manage_engagement",
  "pages_messaging",
  "read_insights",
  "instagram_basic",
  "instagram_manage_insights",
  "instagram_content_publish",
  "instagram_manage_comments",
  "instagram_manage_messages",
  "business_management",
] as const;

const ACTION_WHAT: Record<InboxAction, string> = {
  facebook_comments: "lire les commentaires Facebook",
  instagram_comments: "lire les commentaires Instagram",
  facebook_messages: "lire les messages Messenger",
  instagram_messages: "lire les messages Instagram",
  facebook_comment_reply: "répondre aux commentaires Facebook",
  instagram_comment_reply: "répondre aux commentaires Instagram",
  facebook_message_send: "répondre sur Messenger",
  instagram_message_send: "répondre aux messages Instagram",
};

/** French text for a card or a reply box. Never includes a token or a URL. */
export function frenchInboxError(error: unknown, action: InboxAction): string {
  if (error instanceof Error && error.message.startsWith("ROOGO:")) return error.message.slice(6);
  const what = ACTION_WHAT[action];
  switch (inboxErrorKind(error)) {
    case "window":
      return action === "facebook_message_send" ? WINDOW_CLOSED_MESSAGE_FACEBOOK : WINDOW_CLOSED_MESSAGE;
    case "token":
      return "Le jeton Meta a expiré ou a été révoqué. Il faut générer un nouveau jeton META_GRAPH_TOKEN dans le Business Manager puis le remplacer sur Vercel.";
    case "permission":
      return `Permission Meta manquante pour ${what} : ajoutez ${ACTION_PERMISSIONS[action]} au jeton.`;
    case "limit":
      return "Meta limite les appels pour le moment. Réessayez dans quelques minutes.";
    case "unavailable":
      return "Meta ne répond pas pour le moment. Réessayez plus tard.";
    case "network":
      return "Pas de réponse de Meta. Réessayez plus tard.";
    default: {
      const e = error as InboxGraphError;
      const detail = String(e?.message ?? "")
        .replace(/https?:\/\/\S+/g, "[lien]")
        .replace(/access_token=\S+/g, "")
        .slice(0, 140);
      return `Erreur Meta${e?.code != null ? ` (${e.code})` : ""} : ${detail || "réponse inattendue"}`;
    }
  }
}

/** For server logs: status, code and kind, never the token or the URL. */
export function inboxLogShape(error: unknown) {
  if (error instanceof InboxGraphError) {
    return { kind: inboxErrorKind(error), status: error.httpStatus, code: error.code, subcode: error.subcode, message: error.message.slice(0, 200) };
  }
  return { kind: "network", message: error instanceof Error ? error.message.slice(0, 200) : String(error) };
}

// --- Graph caller -------------------------------------------------------------------

export type InboxFetch = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string; signal?: AbortSignal; cache?: "no-store" },
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

const GRAPH_HOST = "https://graph.facebook.com";
const TIMEOUT_MS = 15_000;

export function inboxGraphUrl(version: string, req: GraphReq): string {
  const qs = new URLSearchParams(req.query ?? {}).toString();
  return `${GRAPH_HOST}/${version}/${req.path}${qs ? `?${qs}` : ""}`;
}

export async function callGraph(fetchImpl: InboxFetch, version: string, token: string, req: GraphReq): Promise<Json> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  let body: string | undefined;
  if (req.json) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(req.json);
  } else if (req.form) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    body = new URLSearchParams(req.form).toString();
  }
  try {
    let res;
    try {
      res = await fetchImpl(inboxGraphUrl(version, req), { method: req.method, headers, body, signal: controller.signal, cache: "no-store" });
    } catch (error) {
      const aborted = error instanceof Error && error.name === "AbortError";
      throw new Error(aborted ? `pas de réponse en ${TIMEOUT_MS / 1000} s` : "erreur réseau");
    }
    let data: Json = {};
    try {
      data = ((await res.json()) ?? {}) as Json;
    } catch {
      data = {};
    }
    const err = data.error as { code?: number; error_subcode?: number; message?: string } | undefined;
    if (!res.ok || err) {
      throw new InboxGraphError(err?.code ?? null, err?.error_subcode ?? null, res.status, err?.message ?? `HTTP ${res.status}`);
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

// --- Reading and replying --------------------------------------------------------------

export type SourceRead = { source: InboxSource; ok: boolean; items: SyncedItem[]; error: string | null };

/** Reads one source. Never throws: a failure comes back as a French error for its card. */
export async function readSource(
  fetchImpl: InboxFetch,
  cfg: InboxConfig,
  source: InboxSource,
  log: (message: string, detail: Record<string, unknown>) => void = () => {},
): Promise<SourceRead> {
  try {
    if (source === "facebook_comments") {
      if (!cfg.pageId) throw new Error("ROOGO:META_PAGE_ID manque sur le serveur.");
      const body = await callGraph(fetchImpl, cfg.graphVersion, cfg.pageToken, requests.facebookComments(cfg));
      return { source, ok: true, items: parseFacebookComments(body, cfg.pageId), error: null };
    }
    if (source === "instagram_comments") {
      if (!cfg.igUserId) throw new Error("ROOGO:META_IG_ACCOUNT_ID manque sur le serveur.");
      const body = await callGraph(fetchImpl, cfg.graphVersion, cfg.pageToken, requests.instagramComments(cfg));
      return { source, ok: true, items: parseInstagramComments(body, cfg.igUserId), error: null };
    }
    if (!cfg.pageId) throw new Error("ROOGO:META_PAGE_ID manque sur le serveur.");
    const platform = source === "facebook_messages" ? "messenger" : "instagram";
    const body = await callGraph(fetchImpl, cfg.graphVersion, cfg.pageToken, requests.conversations(cfg, platform));
    const network = source === "facebook_messages" ? "facebook" : "instagram";
    return { source, ok: true, items: parseConversations(body, network, [cfg.pageId, cfg.igUserId]), error: null };
  } catch (error) {
    log(`[social-inbox] ${source} read failed`, inboxLogShape(error));
    return { source, ok: false, items: [], error: frenchInboxError(error, source) };
  }
}

export type ReplyItem = { network: InboxNetwork; kind: InboxKind; externalId: string; authorId: string | null; lastUserMessageAt: string | null };

export type ReplyResult = { ok: true; externalId: string | null } | { ok: false; error: string };

/** Sends one reply as the Page or the Instagram account. Never throws. */
export async function sendReply(
  fetchImpl: InboxFetch,
  cfg: InboxConfig,
  item: ReplyItem,
  text: string,
  now: Date,
  log: (message: string, detail: Record<string, unknown>) => void = () => {},
): Promise<ReplyResult> {
  const blocked = replyBlockReason(item, now);
  if (blocked) return { ok: false, error: blocked };
  if (item.network === "tiktok") return { ok: false, error: "La réponse depuis Roogo n'est pas encore possible pour TikTok." };
  const action: InboxAction =
    item.kind === "comment" ? (item.network === "facebook" ? "facebook_comment_reply" : "instagram_comment_reply") : item.network === "facebook" ? "facebook_message_send" : "instagram_message_send";
  try {
    const humanAgent = item.kind === "message" && messagingWindow(item.lastUserMessageAt, now).humanAgent;
    const req =
      item.kind === "comment" ? requests.replyToComment(item.network, item.externalId, text) : requests.sendMessage(cfg, item.authorId ?? "", text, humanAgent);
    const data = await callGraph(fetchImpl, cfg.graphVersion, cfg.pageToken, req);
    return { ok: true, externalId: str(data.id) ?? str(data.message_id) };
  } catch (error) {
    log(`[social-inbox] ${action} failed`, inboxLogShape(error));
    return { ok: false, error: frenchInboxError(error, action) };
  }
}

// --- Counts ------------------------------------------------------------------------------

/** « À répondre » per list; `overdue` counts those past the 24 business hours deadline (lib/social/sla.ts). */
export type InboxCounts = { comments: number; messages: number; total: number; overdue: number };

/**
 * « 3 commentaires et 2 messages attendent une réponse, dont 2 en retard », or
 * null when nothing waits. `where` goes before the overdue part
 * (« ... une réponse sur Facebook et Instagram, dont 2 en retard »).
 */
export function waitingSentence(counts: Pick<InboxCounts, "comments" | "messages"> & { overdue?: number }, where?: string): string | null {
  const parts: string[] = [];
  if (counts.comments) parts.push(`${counts.comments} commentaire${counts.comments > 1 ? "s" : ""}`);
  if (counts.messages) parts.push(`${counts.messages} message${counts.messages > 1 ? "s" : ""}`);
  if (!parts.length) return null;
  const total = counts.comments + counts.messages;
  const late = counts.overdue && counts.overdue > 0 ? `, dont ${Math.min(counts.overdue, total)} en retard` : "";
  return `${parts.join(" et ")} ${total > 1 ? "attendent" : "attend"} une réponse${where ? ` ${where}` : ""}${late}`;
}

/** Accessible label of a « Réseaux » badge: « 5 à répondre, dont 2 en retard ». */
export function waitingBadgeLabel(total: number, overdue: number): string {
  return `${total} à répondre${overdue > 0 ? `, dont ${overdue} en retard` : ""}`;
}

// --- What the page receives ------------------------------------------------------------

export type InboxReplyDto = { id: string; staffName: string | null; text: string; status: "sent" | "failed"; error: string | null; sentAt: string };

export type InboxItemDto = {
  id: string;
  network: InboxNetwork;
  kind: InboxKind;
  authorName: string;
  authorUsername: string | null;
  /** Needed to answer a direct message; never shown. */
  hasRecipient: boolean;
  text: string;
  at: string;
  lastUserMessageAt: string | null;
  post: { caption: string; permalink: string | null; thumbnail: string | null } | null;
  permalink: string | null;
  listingReference: string | null;
  propertyId: string | null;
  status: InboxStatus;
  statusChangedByName: string | null;
  statusChangedAt: string | null;
  repliedByName: string | null;
  repliedAt: string | null;
  repliedExternally: boolean;
  messages: ThreadMessage[];
  replies: InboxReplyDto[];
};

export type SourceStateDto = { source: InboxSource; label: string; lastAttemptAt: string | null; lastSuccessAt: string | null; lastError: string | null; itemCount: number };

export type InboxPayload = {
  ready: boolean;
  /** French notice when the tables are missing or the read failed. */
  notice: string | null;
  items: InboxItemDto[];
  counts: InboxCounts;
  sources: SourceStateDto[];
  /** Env names missing (names only). */
  missing: string[];
  pageId: string | null;
  lastSyncAt: string | null;
  fetchedAt: string;
};
