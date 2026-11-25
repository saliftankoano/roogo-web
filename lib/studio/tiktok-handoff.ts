// TikTok by hand (2026-11-25). TikTok refuses every post from the Studio on a
// public account until it has audited the app, so the Studio hands the video
// to the team instead: a WhatsApp message with the Drive link and the text,
// a person posts it in the TikTok app, then marks it done here.
//
// Pure rules only (node:test loads this file directly): no value imports.

import type { NetworkResult, PublicationResults } from "./publishing";

export const MANUAL_NOTE = "Publiée à la main";

type HandoffPost = {
  status: string;
  publishing?: boolean;
  networks: readonly string[];
  results: PublicationResults;
};

/**
 * Where TikTok stands for the team:
 * - "auto": the Studio is sending it, or already did (nothing to hand over);
 * - "todo": to post by hand (TikTok was not ticked, or the Studio's try failed);
 * - "done": someone marked it posted by hand;
 * - null: the post is not approved yet, so nothing goes out.
 */
export function tiktokHandoff(post: HandoffPost): "auto" | "todo" | "done" | null {
  if (!["valide", "publie", "echec"].includes(post.status)) return null;
  const r = post.results.tiktok;
  if (r?.status === "published") return r.note === MANUAL_NOTE ? "done" : "auto";
  if (!post.networks.includes("tiktok")) return "todo";
  if (post.publishing || post.status === "valide") return "auto";
  return "todo";
}

/** « C'est publié » is only safe once the publisher has finished with the post. */
export function canMarkManual(post: HandoffPost): boolean {
  return tiktokHandoff(post) === "todo" && !post.publishing && (post.status === "publie" || post.status === "echec");
}

/** The stored result for a TikTok posted by hand. Nothing else in the results changes. */
export function manualTikTokResults(results: PublicationResults, nowIso: string, permalink: string): PublicationResults {
  const done: NetworkResult = {
    status: "published",
    note: MANUAL_NOTE,
    permalink,
    published_at: nowIso,
    error: null,
    held: false,
    manual_before: results.tiktok ?? null,
  };
  return { ...results, tiktok: done };
}

/** « Annuler » (founder): only a TikTok marked by hand, and never while a run holds the post. */
export function canUndoManual(post: HandoffPost): boolean {
  return tiktokHandoff(post) === "done" && !post.publishing && (post.status === "publie" || post.status === "echec");
}

/** Back to what TikTok's line said before « C'est publié »: the failed try, or nothing. */
export function undoManualTikTok(results: PublicationResults): PublicationResults {
  const { tiktok, ...rest } = results;
  const before = tiktok?.manual_before ?? null;
  return before ? { ...rest, tiktok: before } : rest;
}

export const TIKTOK_LINK_ERROR = "Collez le lien de la vidéo sur TikTok (dans TikTok : Partager, puis Copier le lien).";

/**
 * The proof that the video is online (Salif, 2026-11-25): the link TikTok
 * gives with « Partager › Copier le lien ». A video link on tiktok.com or a
 * short link (vm. / vt.tiktok.com); a profile or the home page is refused.
 * Tracking parameters are dropped.
 */
export function parseTikTokLink(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const found = raw.trim().match(/https?:\/\/\S+/i)?.[0] ?? `https://${raw.trim()}`;
  let url: URL;
  try {
    url = new URL(found);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  if (host !== "tiktok.com" && !host.endsWith(".tiktok.com")) return null;
  const path = url.pathname.replace(/\/+$/, "");
  const short = host === "vm.tiktok.com" || host === "vt.tiktok.com";
  const ok = short ? /^\/[A-Za-z0-9]{5,}$/.test(path) : /^\/@[^/]+\/(video|photo)\/\d+$/.test(path) || /^\/t\/[A-Za-z0-9]{5,}$/.test(path);
  return ok ? `https://${host}${path}${short ? "/" : ""}` : null;
}

type CopyLike = { text: string; hashtags: readonly string[] };

/** The text the team pastes in TikTok: its own version, else another network's, else the base. */
export function handoffCopy(copy: Partial<Record<string, CopyLike>> | undefined, base: CopyLike): CopyLike {
  for (const key of ["tiktok", "instagram", "facebook"]) {
    const c = copy?.[key];
    if (c?.text.trim()) return c;
  }
  return base;
}

function tagLine(tags: readonly string[]): string {
  return tags
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => (t.startsWith("#") ? t : `#${t}`))
    .join(" ");
}

/** The WhatsApp message for the team group: what to post, where the file is, the text to paste. */
export function handoffMessage(input: { title: string; driveUrl: string; copy: CopyLike }): string {
  const tags = tagLine(input.copy.hashtags);
  const text = input.copy.text.trim();
  return [
    "TikTok à publier à la main",
    input.title.trim(),
    "",
    `Vidéo : ${input.driveUrl}`,
    "",
    "Texte à coller :",
    text && tags && !text.includes(tags) ? `${text}\n\n${tags}` : text || tags,
    "",
    "Une fois publiée : copiez le lien TikTok et collez-le dans le Studio (C'est publié).",
  ]
    .join("\n")
    .trim();
}

/**
 * WhatsApp's share link: it opens the chat picker, the person chooses the
 * group and sends. On a computer WhatsApp first shows its own « Share on
 * WhatsApp » page, whose preview draws emoji as « ? » (checked 2026-11-25,
 * same on api.whatsapp.com); the message it passes on is intact. The desktop
 * app can keep only the link of a long message, so the screen also copies
 * the full message to the clipboard.
 */
export function whatsappShareUrl(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}
