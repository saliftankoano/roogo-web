// The shared Studio history: what kind each project is and its latest result.
// Pure, so the history line can be tested without a database.

export type ArtifactRow = { conversation_id: string; kind: string; title: string; created_at: string };

/** Visuals only means a visual project; anything with a script or voice is a conversation. */
export function projectKind(kinds: string[]): "chat" | "visual" {
  if (kinds.length && kinds.every((k) => k === "image")) return "visual";
  return "chat";
}

/** Which filters a project answers to: it can hold a script and visuals at once. */
export function projectContains(kinds: string[]): Array<"chat" | "visual" | "video"> {
  const out: Array<"chat" | "visual" | "video"> = [];
  if (kinds.some((k) => k === "script" || k === "voiceover" || k === "captions")) out.push("chat");
  if (kinds.includes("image")) out.push("visual");
  if (kinds.includes("video")) out.push("video");
  return out;
}

/** One short line for the history: the latest result in the project. Rows are oldest first. */
export function projectSummary(rows: ArtifactRow[]): string | null {
  const latest = rows[rows.length - 1];
  if (!latest) return null;
  if (latest.kind === "script") return `Script v${rows.filter((r) => r.kind === "script").length}`;
  if (latest.kind === "voiceover") return `${latest.title} prête`;
  if (latest.kind === "captions") return "Sous-titres prêts";
  return latest.title;
}
