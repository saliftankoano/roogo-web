// Access levels for the Roogo team, one per job title.
//
// Source: vault note "Permissions de l'equipe par titre" (approved by Salif on
// 2026-10-11). The table below is that note's matrix, written as code. Change
// the note first, then this file.
//
// Where the level lives: Clerk publicMetadata.staffLevel (read by the browser)
// mirrored into users.staff_level (read by API routes). userType stays "staff"
// or "founder"; a Director is a staff member whose level is "director".

export type StaffLevel =
  | "founder"
  | "director"
  | "assistant"
  | "advisor"
  | "intern";

/** Levels that can be handed to someone. The founder level is never granted. */
export type AssignableStaffLevel = Exclude<StaffLevel, "founder">;

/**
 * "legacy" is a staff member who has no level yet. It exists only while the
 * levels are being rolled out (STAFF_LEVELS_ENFORCED is not "true"): it keeps
 * exactly the access a staff member had before levels existed.
 */
export type EffectiveStaffLevel = StaffLevel | "legacy";

export const ASSIGNABLE_STAFF_LEVELS: readonly AssignableStaffLevel[] = [
  "director",
  "assistant",
  "advisor",
  "intern",
];

export const STAFF_LEVEL_LABELS: Record<StaffLevel, string> = {
  founder: "Fondateur",
  director: "Directeur",
  assistant: "Assistant commercial et administratif",
  advisor: "Conseiller clientèle et réseaux sociaux",
  intern: "Stagiaire",
};

export const STAFF_LEVEL_SHORT_LABELS: Record<StaffLevel, string> = {
  founder: "Fondateur",
  director: "Directeur",
  assistant: "Assistant",
  advisor: "Conseiller",
  intern: "Stagiaire",
};

export type StaffCapability =
  | "listings.view"
  | "listings.write"
  | "listings.publish"
  | "listings.publishWithoutSaleChecks"
  | "listings.delete"
  | "identity.review"
  | "identity.status"
  | "ownership.review"
  | "ownership.status"
  | "pendingEdits.view"
  | "pendingEdits.act"
  | "rentalImports.manage"
  | "support.reply"
  | "saleChat.view"
  | "saleChat.reply"
  | "applications.view"
  | "applications.manage"
  | "disputes.view"
  | "disputes.resolve"
  | "users.listAll"
  | "users.listOwnersAgents"
  | "talent.manage"
  | "referrals.validate"
  | "finances.view"
  | "settings.manage"
  | "studio.use"
  | "studio.cloneVoice"
  | "studio.moderateGlossary"
  | "social.inbox"
  | "team.manage";

type LevelList = readonly EffectiveStaffLevel[];

const F: StaffLevel = "founder";
const D: StaffLevel = "director";
const A: StaffLevel = "assistant";
const C: StaffLevel = "advisor";
const S: StaffLevel = "intern";
const L: EffectiveStaffLevel = "legacy";

// "legacy" appears wherever a staff member could already do the thing before
// levels existed. Founder-only things (finances, settings, team) never list it.
export const STAFF_CAPABILITY_MATRIX: Record<StaffCapability, LevelList> = {
  "listings.view": [F, D, A, C, S, L],
  "listings.write": [F, D, A, C, L],
  // An advisor creates and edits listings; the Assistant or Director puts them online.
  "listings.publish": [F, D, A, L],
  // Put a sale online without the owner's account, verified documents or
  // signed mandate, for owners who cannot use the app (Salif, 2026-10-30).
  "listings.publishWithoutSaleChecks": [F, D],
  "listings.delete": [F, D, L],
  "identity.review": [F, D, A, L],
  "identity.status": [F, D, A, C, L],
  "ownership.review": [F, D, A, L],
  "ownership.status": [F, D, A, C, L],
  "pendingEdits.view": [F, D, A, C, L],
  "pendingEdits.act": [F, D, A, L],
  "rentalImports.manage": [F, D, A, L],
  "support.reply": [F, D, A, C, L],
  "saleChat.view": [F, D, A, C, L],
  "saleChat.reply": [F, D, A, L],
  "applications.view": [F, D, A, C, S, L],
  "applications.manage": [F, D, A, C, L],
  "disputes.view": [F, D, A, C, L],
  "disputes.resolve": [F, D, L],
  "users.listAll": [F, D, L],
  "users.listOwnersAgents": [F, D, A, L],
  "talent.manage": [F, D, L],
  "referrals.validate": [F, D, L],
  "finances.view": [F, D],
  "settings.manage": [F],
  "studio.use": [F, D, A, C, S, L],
  "studio.cloneVoice": [F, D, A, C, L],
  "studio.moderateGlossary": [F, D],
  // Studio > Réseaux: read and answer comments and direct messages as the Roogo
  // Page / account (Salif, 2026-10-21: Conseiller and above).
  "social.inbox": [F, D, A, C, L],
  "team.manage": [F, D],
};

export function isStaffLevel(value: unknown): value is StaffLevel {
  return (
    value === "founder" ||
    value === "director" ||
    value === "assistant" ||
    value === "advisor" ||
    value === "intern"
  );
}

export function isAssignableStaffLevel(
  value: unknown,
): value is AssignableStaffLevel {
  return isStaffLevel(value) && value !== "founder";
}

export type StaffAccessInput = {
  userType?: string | null;
  staffLevel?: string | null;
};

/**
 * Works out the level a person acts with.
 * - A founder is always "founder".
 * - Staff with a valid level use it.
 * - Staff without a level: "legacy" (unchanged access) during rollout, then
 *   "advisor", the lowest level that still has a working back office, once
 *   enforcement is on.
 * - Anyone else has no staff access (null).
 */
export function resolveStaffLevel(
  input: StaffAccessInput | null | undefined,
  options: { enforced: boolean },
): EffectiveStaffLevel | null {
  const userType = String(input?.userType ?? "").toLowerCase();
  if (userType === "founder") return "founder";
  if (userType !== "staff" && userType !== "admin") return null;

  const level = String(input?.staffLevel ?? "").toLowerCase();
  // A stored "founder" level on a staff account is a data error, not a grant.
  if (isAssignableStaffLevel(level)) return level;
  return options.enforced ? "advisor" : "legacy";
}

export function staffLevelCan(
  level: EffectiveStaffLevel | null,
  capability: StaffCapability,
): boolean {
  if (!level) return false;
  return STAFF_CAPABILITY_MATRIX[capability].includes(level);
}

/** Every capability a level holds, for the browser. */
export function capabilitiesForLevel(
  level: EffectiveStaffLevel | null,
): StaffCapability[] {
  if (!level) return [];
  return (Object.keys(STAFF_CAPABILITY_MATRIX) as StaffCapability[]).filter(
    (capability) => STAFF_CAPABILITY_MATRIX[capability].includes(level),
  );
}

/**
 * Who may give or remove which level (rules 1 to 3 of the approved note).
 * - The founder gives or removes any assignable level, Director included.
 * - A Director gives or removes Assistant, Advisor and Intern, never another
 *   Director.
 * - Nobody changes their own level.
 */
export function canGrantStaffLevel(params: {
  actorLevel: EffectiveStaffLevel | null;
  actorUserId: string;
  targetUserId?: string | null;
  targetLevel: AssignableStaffLevel;
}): boolean {
  const { actorLevel, actorUserId, targetUserId, targetLevel } = params;
  if (targetUserId && targetUserId === actorUserId) return false;
  if (actorLevel === "founder") return true;
  if (actorLevel === "director") return targetLevel !== "director";
  return false;
}

/** Whether the actor may change someone who currently holds `currentLevel`. */
export function canChangeStaffMember(params: {
  actorLevel: EffectiveStaffLevel | null;
  actorUserId: string;
  targetUserId: string;
  currentLevel: EffectiveStaffLevel | null;
}): boolean {
  const { actorLevel, actorUserId, targetUserId, currentLevel } = params;
  if (targetUserId === actorUserId) return false;
  if (actorLevel === "founder") return currentLevel !== "founder";
  if (actorLevel === "director") {
    return (
      currentLevel === "assistant" ||
      currentLevel === "advisor" ||
      currentLevel === "intern" ||
      currentLevel === "legacy"
    );
  }
  return false;
}

/** Server only. Rollout switch: off keeps unleveled staff as they were. */
export function staffLevelsEnforced(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env.STAFF_LEVELS_ENFORCED === "true";
}
