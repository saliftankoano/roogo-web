#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */

const { createClerkClient } = require("@clerk/backend");
const { createClient } = require("@supabase/supabase-js");

const supabaseUrl =
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const clerkSecretKey = process.env.CLERK_SECRET_KEY;
const isDryRun = process.argv.includes("--dry-run");

if (!supabaseUrl || !supabaseKey || !clerkSecretKey) {
  console.error(
    "Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL/EXPO_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or CLERK_SECRET_KEY.",
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const clerk = createClerkClient({ secretKey: clerkSecretKey });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchSignupSnapshot(clerkUserId) {
  const all = [];
  const limit = 100;
  let offset = 0;

  for (;;) {
    const page = await clerk.sessions.getSessionList({
      userId: clerkUserId,
      limit,
      offset,
    });
    if (!page.data?.length) break;
    all.push(...page.data);
    if (page.data.length < limit) break;
    offset += limit;
  }

  if (!all.length) return null;

  const earliest = all.sort((a, b) => a.createdAt - b.createdAt)[0];
  const activity = earliest?.latestActivity;
  if (!activity) return null;

  return {
    city: activity.city ?? null,
    country: activity.country ?? null,
    ipAddress: activity.ipAddress ?? null,
    deviceType: activity.deviceType ?? null,
    deviceIsMobile:
      typeof activity.isMobile === "boolean" ? activity.isMobile : null,
    browserName: activity.browserName ?? null,
    browserVersion: activity.browserVersion ?? null,
  };
}

async function main() {
  const { data: users, error } = await supabase
    .from("users")
    .select(
      [
        "id",
        "clerk_id",
        "email",
        "signup_city",
        "signup_country",
        "signup_ip",
        "signup_device_type",
        "signup_device_is_mobile",
        "signup_browser_name",
        "signup_browser_version",
      ].join(","),
    )
    .not("clerk_id", "is", null)
    .or(
      [
        "signup_city.is.null",
        "signup_device_type.is.null",
        "signup_device_is_mobile.is.null",
        "signup_browser_name.is.null",
        "signup_browser_version.is.null",
      ].join(","),
    );

  if (error) throw error;

  let checked = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const user of users ?? []) {
    checked += 1;
    const snapshot = await fetchSignupSnapshot(user.clerk_id);

    if (!snapshot) {
      skipped += 1;
      console.log(`- ${user.email ?? user.id}: no session snapshot available`);
      await sleep(200);
      continue;
    }

    const patch = {};
    if (!user.signup_city && snapshot.city) {
      patch.signup_city = snapshot.city;
      patch.signup_country = snapshot.country;
      patch.signup_ip = snapshot.ipAddress;
    }
    if (!user.signup_device_type && snapshot.deviceType) {
      patch.signup_device_type = snapshot.deviceType;
    }
    if (
      user.signup_device_is_mobile === null &&
      typeof snapshot.deviceIsMobile === "boolean"
    ) {
      patch.signup_device_is_mobile = snapshot.deviceIsMobile;
    }
    if (!user.signup_browser_name && snapshot.browserName) {
      patch.signup_browser_name = snapshot.browserName;
    }
    if (!user.signup_browser_version && snapshot.browserVersion) {
      patch.signup_browser_version = snapshot.browserVersion;
    }

    if (Object.keys(patch).length === 0) {
      skipped += 1;
      console.log(`- ${user.email ?? user.id}: nothing to backfill`);
      await sleep(200);
      continue;
    }

    patch.signup_captured_at = new Date().toISOString();

    if (isDryRun) {
      updated += 1;
      console.log(`[dry-run] ${user.email ?? user.id}:`, patch);
      await sleep(200);
      continue;
    }

    const { error: updateError } = await supabase
      .from("users")
      .update(patch)
      .eq("id", user.id);

    if (updateError) {
      failed += 1;
      console.error(`x ${user.email ?? user.id}:`, updateError.message);
    } else {
      updated += 1;
      console.log(`+ ${user.email ?? user.id}: ${Object.keys(patch).join(", ")}`);
    }

    await sleep(200);
  }

  console.log(
    `Done. checked=${checked} updated=${updated} skipped=${skipped} failed=${failed} dryRun=${isDryRun}`,
  );
}

main().catch((error) => {
  console.error("Signup snapshot backfill failed:", error);
  process.exit(1);
});
