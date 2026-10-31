// The TikTok panel of the approval screen (PRD « TikTok posting screen for the
// audit », approved 2026-10-31): the creator info TikTok returns, the choices
// Salif makes, and the rules TikTok's Content Sharing Guidelines set
// (developers.tiktok.com/doc/content-sharing-guidelines):
//
// - fresh creator info when the screen opens, nickname shown, a stop when the
//   account cannot post, the account's maximum video duration;
// - privacy picked from privacy_level_options, with no default;
// - comments, duets and stitches off by default, greyed out when the account
//   disabled them;
// - commercial content disclosure off by default; when on, « Votre marque »
//   and/or « Contenu de marque », and branded content is never « Moi seulement »;
// - TikTok's declaration (Music Usage Confirmation, plus the Branded Content
//   Policy for branded content) above the button.
//
// No runtime imports: node:test loads this file directly
// (tiktok-post-settings.test.mjs). The token only travels in the
// Authorization header.

export const CREATOR_INFO_PATH = "/v2/post/publish/creator_info/query/";

export const PRIVACY_LEVELS = ["PUBLIC_TO_EVERYONE", "MUTUAL_FOLLOW_FRIENDS", "FOLLOWER_OF_CREATOR", "SELF_ONLY"] as const;
export type PrivacyLevel = (typeof PRIVACY_LEVELS)[number];

export const PRIVACY_LABELS: Record<PrivacyLevel, string> = {
  PUBLIC_TO_EVERYONE: "Public",
  MUTUAL_FOLLOW_FRIENDS: "Amis",
  FOLLOWER_OF_CREATOR: "Abonnés",
  SELF_ONLY: "Moi seulement",
};

export const MUSIC_USAGE_URL = "https://www.tiktok.com/legal/page/global/music-usage-confirmation/en";
export const BRANDED_CONTENT_URL = "https://www.tiktok.com/legal/page/global/bc-policy/en";

export const COPY = {
  cannotPost: "Ce compte TikTok ne peut pas publier pour le moment. Réessayez plus tard.",
  brandedNotPrivate: "La visibilité du contenu de marque ne peut pas être privée.",
  pickPrivacy: "Choisissez qui peut voir la vidéo sur TikTok.",
  pickCommercial: "Indiquez si la vidéo fait la promotion de Roogo, d'un tiers, ou des deux.",
  processing: "Après publication, TikTok peut mettre quelques minutes à afficher la vidéo sur le profil.",
  missing: "Réglages TikTok manquants : « Annuler » la validation puis valider à nouveau en remplissant le panneau TikTok.",
} as const;

export type CreatorInfo = {
  nickname: string;
  username: string | null;
  avatarUrl: string | null;
  privacyLevelOptions: PrivacyLevel[];
  commentDisabled: boolean;
  duetDisabled: boolean;
  stitchDisabled: boolean;
  /** Seconds; null when TikTok did not say. */
  maxVideoPostDurationSec: number | null;
};

/** What the panel sends at approval. */
export type TikTokChoices = {
  privacyLevel: PrivacyLevel | null;
  allowComment: boolean;
  allowDuet: boolean;
  allowStitch: boolean;
  commercial: boolean;
  yourBrand: boolean;
  brandedContent: boolean;
};

export const EMPTY_CHOICES: TikTokChoices = {
  privacyLevel: null,
  allowComment: false,
  allowDuet: false,
  allowStitch: false,
  commercial: false,
  yourBrand: false,
  brandedContent: false,
};

/** Saved in studio_publications.tiktok_settings (migration 109). */
export type TikTokSettings = {
  privacy_level: PrivacyLevel;
  allow_comment: boolean;
  allow_duet: boolean;
  allow_stitch: boolean;
  your_brand: boolean;
  branded_content: boolean;
  creator_nickname: string;
  chosen_by: string;
  chosen_at: string;
};

function isPrivacy(v: unknown): v is PrivacyLevel {
  return typeof v === "string" && (PRIVACY_LEVELS as readonly string[]).includes(v);
}

/** The data object of creator_info/query, read defensively. */
export function parseCreatorInfo(data: Record<string, unknown>): CreatorInfo {
  const options = Array.isArray(data.privacy_level_options) ? data.privacy_level_options.filter(isPrivacy) : [];
  const max = Number(data.max_video_post_duration_sec);
  return {
    nickname: typeof data.creator_nickname === "string" && data.creator_nickname ? data.creator_nickname : "Compte TikTok",
    username: typeof data.creator_username === "string" && data.creator_username ? data.creator_username : null,
    avatarUrl: typeof data.creator_avatar_url === "string" && data.creator_avatar_url ? data.creator_avatar_url : null,
    privacyLevelOptions: options,
    commentDisabled: data.comment_disabled === true,
    duetDisabled: data.duet_disabled === true,
    stitchDisabled: data.stitch_disabled === true,
    maxVideoPostDurationSec: Number.isFinite(max) && max > 0 ? max : null,
  };
}

/** Error codes of creator_info/query that mean « this account cannot post right now ». */
const CANNOT_POST = new Set(["spam_risk_too_many_posts", "spam_risk_user_banned_from_posting", "reached_active_user_cap", "rate_limit_exceeded"]);

export type CreatorInfoResult = { ok: true; creator: CreatorInfo } | { ok: false; cannotPost: boolean; error: string; code: string };

type Fetch = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string },
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

/** Reads the connected account's creator info. Never throws; the token never appears in a result. */
export async function fetchCreatorInfo(fetchImpl: Fetch, token: string, api = "https://open.tiktokapis.com"): Promise<CreatorInfoResult> {
  let res;
  try {
    res = await fetchImpl(`${api}${CREATOR_INFO_PATH}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=UTF-8" },
      body: "{}",
    });
  } catch {
    return { ok: false, cannotPost: false, code: "network", error: "TikTok ne répond pas. Réessayez." };
  }
  const body = ((await res.json().catch(() => null)) ?? {}) as { data?: Record<string, unknown>; error?: { code?: unknown } };
  const code = typeof body.error?.code === "string" ? body.error.code : res.ok ? "ok" : `http_${res.status}`;
  if (res.ok && code === "ok") return { ok: true, creator: parseCreatorInfo(body.data ?? {}) };
  if (CANNOT_POST.has(code)) return { ok: false, cannotPost: true, code, error: COPY.cannotPost };
  if (code === "access_token_invalid" || res.status === 401) {
    return { ok: false, cannotPost: false, code, error: "Le jeton TikTok a expiré ou a été révoqué : reconnectez TikTok." };
  }
  if (code === "scope_not_authorized") {
    return { ok: false, cannotPost: false, code, error: "TikTok n'a pas donné la permission de publier : reconnectez TikTok." };
  }
  return { ok: false, cannotPost: false, code, error: `TikTok n'a pas donné les informations du compte (${code}).` };
}

/** Each rule the panel enforces, in French, empty when the choices can be approved. */
export function choiceProblems(choices: TikTokChoices, creator: CreatorInfo, durationSec: number | null | undefined): string[] {
  const problems: string[] = [];
  if (creator.maxVideoPostDurationSec != null && durationSec != null && durationSec > creator.maxVideoPostDurationSec) {
    problems.push(`La vidéo dure ${Math.ceil(durationSec)} s : ce compte TikTok accepte ${creator.maxVideoPostDurationSec} s au plus.`);
  }
  if (!choices.privacyLevel) problems.push(COPY.pickPrivacy);
  else if (!creator.privacyLevelOptions.includes(choices.privacyLevel)) {
    problems.push(`TikTok ne propose plus « ${PRIVACY_LABELS[choices.privacyLevel]} » pour ce compte : choisissez à nouveau.`);
  }
  if (choices.allowComment && creator.commentDisabled) problems.push("Les commentaires sont désactivés sur ce compte TikTok.");
  if (choices.allowDuet && creator.duetDisabled) problems.push("Les duos sont désactivés sur ce compte TikTok.");
  if (choices.allowStitch && creator.stitchDisabled) problems.push("Les collages sont désactivés sur ce compte TikTok.");
  if (choices.commercial && !choices.yourBrand && !choices.brandedContent) problems.push(COPY.pickCommercial);
  if (choices.commercial && choices.brandedContent && choices.privacyLevel === "SELF_ONLY") problems.push(COPY.brandedNotPrivate);
  return problems;
}

/** The choices sent by the browser, kept only when they have the right types. */
export function parseChoices(raw: unknown): TikTokChoices | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const bool = (k: string) => r[k] === true;
  return {
    privacyLevel: isPrivacy(r.privacyLevel) ? r.privacyLevel : null,
    allowComment: bool("allowComment"),
    allowDuet: bool("allowDuet"),
    allowStitch: bool("allowStitch"),
    commercial: bool("commercial"),
    yourBrand: bool("commercial") && bool("yourBrand"),
    brandedContent: bool("commercial") && bool("brandedContent"),
  };
}

export function toSettings(choices: TikTokChoices, creator: CreatorInfo, chosenBy: string, chosenAt: string): TikTokSettings {
  if (!choices.privacyLevel) throw new Error("privacy level missing");
  return {
    privacy_level: choices.privacyLevel,
    allow_comment: choices.allowComment,
    allow_duet: choices.allowDuet,
    allow_stitch: choices.allowStitch,
    your_brand: choices.yourBrand,
    branded_content: choices.brandedContent,
    creator_nickname: creator.nickname,
    chosen_by: chosenBy,
    chosen_at: chosenAt,
  };
}

/** A saved row, or null when it is missing or malformed (then the post is not sent in direct mode). */
export function readSettings(raw: unknown): TikTokSettings | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (!isPrivacy(r.privacy_level)) return null;
  const b = (k: string) => r[k] === true;
  return {
    privacy_level: r.privacy_level,
    allow_comment: b("allow_comment"),
    allow_duet: b("allow_duet"),
    allow_stitch: b("allow_stitch"),
    your_brand: b("your_brand"),
    branded_content: b("branded_content"),
    creator_nickname: typeof r.creator_nickname === "string" ? r.creator_nickname : "",
    chosen_by: typeof r.chosen_by === "string" ? r.chosen_by : "",
    chosen_at: typeof r.chosen_at === "string" ? r.chosen_at : "",
  };
}

/** Problems with saved settings against fresh creator info, right before posting. */
export function settingsProblems(settings: TikTokSettings, creator: CreatorInfo, durationSec: number | null | undefined): string[] {
  return choiceProblems(
    {
      privacyLevel: settings.privacy_level,
      allowComment: settings.allow_comment,
      allowDuet: settings.allow_duet,
      allowStitch: settings.allow_stitch,
      commercial: settings.your_brand || settings.branded_content,
      yourBrand: settings.your_brand,
      brandedContent: settings.branded_content,
    },
    creator,
    durationSec,
  );
}

/** The post_info fields of /v2/post/publish/video/init/, exactly what was saved. */
export function postInfoFields(settings: TikTokSettings) {
  return {
    privacy_level: settings.privacy_level,
    disable_comment: !settings.allow_comment,
    disable_duet: !settings.allow_duet,
    disable_stitch: !settings.allow_stitch,
    brand_content_toggle: settings.branded_content,
    brand_organic_toggle: settings.your_brand,
  };
}

/** « Contenu promotionnel » for your brand only, « Partenariat rémunéré » as soon as branded content is ticked. */
export function commercialLabel(choices: Pick<TikTokChoices, "commercial" | "yourBrand" | "brandedContent">): string | null {
  if (!choices.commercial) return null;
  if (choices.brandedContent) return "Votre vidéo sera étiquetée « Partenariat rémunéré ».";
  if (choices.yourBrand) return "Votre vidéo sera étiquetée « Contenu promotionnel ».";
  return null;
}

/** One line for the read-only summary after approval. */
export function settingsSummary(s: Pick<TikTokSettings, "privacy_level" | "allow_comment" | "allow_duet" | "allow_stitch" | "your_brand" | "branded_content">): string {
  const allowed = [s.allow_comment && "commentaires", s.allow_duet && "duos", s.allow_stitch && "collages"].filter(Boolean) as string[];
  const parts = [
    PRIVACY_LABELS[s.privacy_level],
    allowed.length ? `${allowed.join(", ")} autorisés` : "commentaires, duos et collages fermés",
  ];
  if (s.branded_content) parts.push("partenariat rémunéré");
  else if (s.your_brand) parts.push("contenu promotionnel");
  return parts.join(" · ");
}
