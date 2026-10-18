#!/usr/bin/env node
// Clerk accounts that have no Supabase `users` row (« Fiches Roogo »).
//
// A row is created only when a Clerk user first reaches the API
// (lib/user-sync.ts), so accounts that signed up and never came back have
// none. The « utilisateurs » goal counts Clerk since 2026-10-18; this script
// shows the gap and, only with --apply, closes it through the same
// createUserInSupabase() the API uses.
//
// DRY RUN BY DEFAULT. Prints counts only: never a name, an email, a phone
// number or an id.
//
//   node --env-file=.env.local scripts/backfill-clerk-users.mjs           # dry run
//   node --env-file=.env.local scripts/backfill-clerk-users.mjs --apply   # writes rows
//
// .env.local points to the Clerk DEV instance and whatever Supabase it names.
// For production, the founder runs it with the production CLERK_SECRET_KEY and
// Supabase service key in the environment (never pasted into a file or a log).
// --apply refuses a Clerk development key unless --allow-dev is passed.
// Only the dry run was run while building it (counts only).

import { registerHooks } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createClerkClient } from "@clerk/backend";
import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");
const PAGE = 500;
const TEAM = ["staff", "founder", "admin"];
const TEST_EMAIL = /\+clerk_test|@example\.(com|org)$/i;

const clerkKey = process.env.CLERK_SECRET_KEY;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!clerkKey || !supabaseUrl || !supabaseKey) {
  console.error("Missing CLERK_SECRET_KEY, NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
const instance = clerkKey.startsWith("sk_live_") ? "production" : "development";

const clerk = createClerkClient({ secretKey: clerkKey });
const supabase = createClient(supabaseUrl, supabaseKey, { auth: { autoRefreshToken: false, persistSession: false } });

function primaryEmail(user) {
  const list = user.emailAddresses ?? [];
  return (list.find((e) => e.id === user.primaryEmailAddressId) ?? list[0])?.emailAddress ?? "";
}
function kind(user) {
  if (TEAM.includes(String(user.publicMetadata?.userType ?? "").toLowerCase())) return "team";
  if (TEST_EMAIL.test(primaryEmail(user))) return "test";
  return "user";
}

async function allClerkUsers() {
  const out = [];
  for (let offset = 0; offset < 100_000; offset += PAGE) {
    const page = await clerk.users.getUserList({ limit: PAGE, offset, orderBy: "+created_at" });
    out.push(...page.data);
    if (page.data.length < PAGE || out.length >= page.totalCount) break;
  }
  return out;
}

async function allRows() {
  const rows = [];
  for (let from = 0; from < 100_000; from += 1000) {
    const { data, error } = await supabase.from("users").select("clerk_id, email").range(from, from + 999);
    if (error) throw new Error(`Supabase users read failed: ${error.code ?? ""} ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

const [users, rows] = await Promise.all([allClerkUsers(), allRows()]);
const byClerkId = new Set(rows.map((r) => r.clerk_id).filter(Boolean));
const byEmail = new Set(rows.map((r) => (r.email ?? "").toLowerCase()).filter(Boolean));

const missing = users.filter((u) => !byClerkId.has(u.id));
const tally = (list) => list.reduce((acc, u) => ({ ...acc, [kind(u)]: (acc[kind(u)] ?? 0) + 1 }), {});
const linkable = missing.filter((u) => byEmail.has(primaryEmail(u).toLowerCase()));

console.log(`Clerk instance: ${instance}`);
console.log(`Comptes Clerk: ${users.length}`, tally(users));
console.log(`Fiches Roogo (rows in users): ${rows.length}`);
console.log(`Comptes sans fiche (by clerk_id): ${missing.length}`, tally(missing));
console.log(`  of which a row with the same email exists (would be linked, not created): ${linkable.length}`);
console.log(`  would be created: ${missing.length - linkable.length}`);

console.log(`Supabase host: ${new URL(supabaseUrl).host}`);

if (!APPLY) {
  console.log("\nDry run: nothing written. Add --apply to create the missing rows through lib/user-sync.ts.");
  process.exit(0);
}

// .env.local pairs the Clerk DEV instance with a Supabase project that may be
// production: writing dev accounts there would pollute real data.
if (instance !== "production" && !process.argv.includes("--allow-dev")) {
  console.error("\nRefused: --apply with a Clerk development key. Use the production keys, or add --allow-dev if the Supabase project above is a dev project.");
  process.exit(1);
}

// lib/user-sync.ts imports through the "@/..." alias without extensions.
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith("@/")) {
      return next(pathToFileURL(path.join(root, `${specifier.slice(2)}.ts`)).href, context);
    }
    return next(specifier, context);
  },
});
const { createUserInSupabase } = await import(pathToFileURL(path.join(root, "lib/user-sync.ts")).href);

let done = 0;
let failed = 0;
for (const u of missing) {
  try {
    await createUserInSupabase({
      id: u.id,
      email_addresses: u.emailAddresses.map((e) => ({ email_address: e.emailAddress })),
      first_name: u.firstName ?? undefined,
      last_name: u.lastName ?? undefined,
      image_url: u.imageUrl,
      phone_numbers: u.phoneNumbers?.map((p) => ({ phone_number: p.phoneNumber })),
      public_metadata: u.publicMetadata,
      private_metadata: u.privateMetadata,
      unsafe_metadata: u.unsafeMetadata,
    });
    done += 1;
  } catch (error) {
    failed += 1;
    console.error("row failed", { code: error?.code, message: String(error?.message ?? error).slice(0, 200) });
  }
}
console.log(`\nApplied: ${done} rows created or linked, ${failed} failed.`);
