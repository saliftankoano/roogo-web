// Surfaces for the Studio only (page-scoped, light theme): a warm stage and
// frosted panels, after Salif's "KCHAT" reference of 2026-10-09.

export const stage =
  "rounded-[34px] bg-[radial-gradient(1100px_700px_at_6%_-10%,rgba(201,106,46,0.26),transparent_60%),radial-gradient(900px_640px_at_104%_110%,rgba(63,166,217,0.16),transparent_60%),linear-gradient(160deg,#f7ede1_0%,#f3e6d6_45%,#efe2d3_100%)]";

export const glass =
  "rounded-[26px] border border-white/75 bg-[rgba(255,252,248,0.64)] shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_18px_50px_-24px_rgba(90,50,26,0.35)] backdrop-blur-xl";

export const glassStrong =
  "border border-white/80 bg-[rgba(255,252,248,0.9)] shadow-[0_18px_40px_-22px_rgba(90,50,26,0.55)] backdrop-blur-xl";

export const primaryGradient =
  "bg-[linear-gradient(135deg,#d47a40,#b45a22)] text-white shadow-[0_10px_22px_-14px_rgba(180,90,34,0.9)]";

export const hair = "border-[rgba(74,52,36,0.10)]";

/** Stable soft colour per person, so a teammate's initials always look the same. */
const AVATAR_TONES = [
  "bg-[linear-gradient(145deg,#f6d6bf,#e9ae83)] text-[#7a3b14]",
  "bg-[linear-gradient(145deg,#d9ecf6,#a9d3ea)] text-[#1f5f80]",
  "bg-[linear-gradient(145deg,#e6f1df,#bcd9ad)] text-[#3d6a2a]",
  "bg-[linear-gradient(145deg,#efe4f7,#d2bde6)] text-[#5b3a7a]",
  "bg-[linear-gradient(145deg,#f9e7c8,#efc98a)] text-[#7a5310]",
];

export function avatarTone(name: string | null): string {
  const key = name ?? "?";
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return AVATAR_TONES[hash % AVATAR_TONES.length];
}

export function initials(name: string | null): string {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
