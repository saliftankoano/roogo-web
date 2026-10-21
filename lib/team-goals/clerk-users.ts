// Accounts for the « utilisateurs » goal, counted from Clerk (the source of
// truth for accounts since 2026-10-18). Supabase `users` rows are created
// only when a Clerk user first reaches the API (lib/user-sync.ts), so they
// can miss accounts that never synced; they are kept as a comparison line.
//
// No imports: the paging, the exclusion rule and the cache are tested with
// node:test (clerk-users.test.mjs); lib/team-goals/server.ts passes the real
// Clerk client and Redis.
//
// Privacy: only creation times leave this file, never a name, an email or a
// phone number.

/** Clerk test users and example.com accounts (same rule as core.ts isTestEmail). */
const TEST_EMAIL = /\+clerk_test|@example\.(com|org)$/i;
const TEAM_TYPES = ["staff", "founder", "admin"];

/** The few fields of a Clerk User this file reads. */
export type ClerkUserLike = {
  createdAt: number;
  publicMetadata?: Record<string, unknown> | null;
  primaryEmailAddressId?: string | null;
  emailAddresses?: { id?: string; emailAddress: string }[];
};

export type ClerkPage = { data: ClerkUserLike[]; totalCount: number };

/** One page of the Clerk user list, oldest first. */
export type ListClerkUsers = (params: { limit: number; offset: number; orderBy: "+created_at" }) => Promise<ClerkPage>;

export const CLERK_PAGE_SIZE = 500;
/** Safety stop: 200 pages of 500. */
const MAX_PAGES = 200;

function primaryEmail(user: ClerkUserLike): string {
  const list = user.emailAddresses ?? [];
  const primary = list.find((e) => e.id && e.id === user.primaryEmailAddressId) ?? list[0];
  return primary?.emailAddress ?? "";
}

export type ClerkExclusion = "team" | "test" | null;

/** Why a Clerk account does not count, or null when it counts. */
export function clerkExclusion(user: ClerkUserLike): ClerkExclusion {
  const type = String(user.publicMetadata?.userType ?? "").toLowerCase();
  if (TEAM_TYPES.includes(type)) return "team";
  if (TEST_EMAIL.test(primaryEmail(user))) return "test";
  return null;
}

export type ClerkAccounts = {
  /** Creation times (ISO) of the accounts that count, oldest first. */
  createdAts: string[];
  /** Every Clerk account, team and tests included (Clerk's totalCount). */
  total: number;
  excludedTeam: number;
  excludedTest: number;
  /** When the list was read (ISO). */
  readAt: string;
};

/** Reads every Clerk account, 500 at a time, and keeps the ones that count. */
export async function collectClerkAccounts(list: ListClerkUsers, now = new Date()): Promise<ClerkAccounts> {
  const createdAts: string[] = [];
  let excludedTeam = 0;
  let excludedTest = 0;
  let total = 0;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const offset = page * CLERK_PAGE_SIZE;
    const { data, totalCount } = await list({ limit: CLERK_PAGE_SIZE, offset, orderBy: "+created_at" });
    total = totalCount;
    for (const user of data) {
      const why = clerkExclusion(user);
      if (why === "team") excludedTeam += 1;
      else if (why === "test") excludedTest += 1;
      else if (Number.isFinite(user.createdAt)) createdAts.push(new Date(user.createdAt).toISOString());
    }
    if (data.length < CLERK_PAGE_SIZE || offset + data.length >= totalCount) break;
  }
  createdAts.sort();
  return { createdAts, total, excludedTeam, excludedTest, readAt: now.toISOString() };
}

/** A tiny key-value store with expiry (Upstash Redis has this shape). */
export type CacheStore = {
  get: (key: string) => Promise<unknown>;
  set: (key: string, value: unknown, opts: { ex: number }) => Promise<unknown>;
};

export const CLERK_ACCOUNTS_CACHE_KEY = "team-goals:clerk-accounts:v1";
export const CLERK_ACCOUNTS_TTL_SECONDS = 600;

function isAccounts(value: unknown): value is ClerkAccounts {
  const v = value as ClerkAccounts | null;
  return !!v && Array.isArray(v.createdAts) && typeof v.total === "number" && typeof v.readAt === "string";
}

const memory: { value: ClerkAccounts | null; until: number } = { value: null, until: 0 };

/** Test hook: forget the per-instance copy. */
export function resetClerkAccountsMemory() {
  memory.value = null;
  memory.until = 0;
}

/**
 * The accounts, from the shared cache (10 minutes) when it is there, else
 * from this instance's memory, else from Clerk. A cache failure never blocks
 * the count: it falls back to reading Clerk.
 */
export async function cachedClerkAccounts(
  list: ListClerkUsers,
  store: CacheStore | null,
  nowMs = Date.now(),
): Promise<ClerkAccounts> {
  if (memory.value && memory.until > nowMs) return memory.value;
  if (store) {
    try {
      const hit = await store.get(CLERK_ACCOUNTS_CACHE_KEY);
      const parsed = typeof hit === "string" ? JSON.parse(hit) : hit;
      if (isAccounts(parsed)) {
        memory.value = parsed;
        memory.until = nowMs + CLERK_ACCOUNTS_TTL_SECONDS * 1000;
        return parsed;
      }
    } catch {
      // Unreachable cache: read Clerk.
    }
  }
  const fresh = await collectClerkAccounts(list, new Date(nowMs));
  memory.value = fresh;
  memory.until = nowMs + CLERK_ACCOUNTS_TTL_SECONDS * 1000;
  if (store) {
    try {
      await store.set(CLERK_ACCOUNTS_CACHE_KEY, JSON.stringify(fresh), { ex: CLERK_ACCOUNTS_TTL_SECONDS });
    } catch {
      // The count is right even when it cannot be shared.
    }
  }
  return fresh;
}

/** « Comptes Clerk » vs « Fiches Roogo »: the line that makes a sync gap visible. */
export function accountsGapLine(clerk: number, roogo: number): { title: string; sub: string } {
  const gap = clerk - roogo;
  const n = (v: number) => new Intl.NumberFormat("fr-FR").format(v).replace(/ | /g, " ");
  const title = `Comptes Clerk : ${n(clerk)} · Fiches Roogo : ${n(roogo)}`;
  if (gap === 0) return { title, sub: "Aucun écart : chaque compte a sa fiche." };
  if (gap > 0) return { title, sub: `${n(gap)} ${gap > 1 ? "comptes n’ont" : "compte n’a"} pas encore de fiche Roogo (jamais passé par l’appli depuis l’inscription).` };
  return { title, sub: `${n(-gap)} ${-gap > 1 ? "fiches Roogo n’ont" : "fiche Roogo n’a"} plus de compte Clerk.` };
}
