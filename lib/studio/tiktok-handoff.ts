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
export function manualTikTokResults(results: PublicationResults, nowIso: string): PublicationResults {
  const done: NetworkResult = { status: "published", note: MANUAL_NOTE, published_at: nowIso, error: null, held: false };
  return { ...results, tiktok: done };
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
  ]
    .join("\n")
    .trim();
}

/** WhatsApp's share link: it opens the chat picker, the person chooses the group and sends. */
export function whatsappShareUrl(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}
