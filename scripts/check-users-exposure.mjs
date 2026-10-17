#!/usr/bin/env node
// Read-only check of what the public anon key can see (migrations 094 and 095).
// Sends GET requests only and prints statuses, row counts and column names,
// never values. Usage: node scripts/check-users-exposure.mjs [path/to/.env.local]
import { readFileSync } from "node:fs";

const envFile = process.argv[2] ?? ".env.local";
const env = { ...process.env };
try {
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && !env[match[1]]) env[match[1]] = match[2].trim().replace(/^"|"$/g, "");
  }
} catch {
  // Fall back to the process environment.
}

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !anonKey) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  process.exit(1);
}

async function probe(path) {
  const response = await fetch(`${url}/rest/v1/${path}`, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      Prefer: "count=exact",
      Range: "0-0",
    },
  });
  const body = await response.json().catch(() => null);
  const total = response.headers.get("content-range")?.split("/")[1] ?? "-";
  return { status: response.status, total, body };
}

const checks = [
  ["users (select *)", "users?select=*", "expect 401 permission denied after 095"],
  ["users (card columns)", "users?select=id,full_name,phone,email", "expect 0 rows after 095"],
  ["staff_users", "staff_users?select=id", "expect 401 after 094"],
  [
    "live listing cards",
    "public_property_details?select=id,agent_name,agent_phone,renter_phone,renter_email&status=eq.en_ligne",
    "expect rows, agent_name set on rentals, renter fields null after 094",
  ],
];

let renterLeak = 0;
for (const [label, path, expectation] of checks) {
  const { status, total, body } = await probe(path);
  const columns = Array.isArray(body) && body[0] ? Object.keys(body[0]).join(", ") : "";
  const error = !Array.isArray(body) && body ? `${body.code ?? ""}` : "";
  console.log(`${label.padEnd(22)} HTTP ${status}  rows ${String(total).padStart(4)}  ${error}${columns ? `cols: ${columns}` : ""}`);
  console.log(`${"".padEnd(22)} ${expectation}`);
  if (path.startsWith("public_property_details") && Array.isArray(body)) {
    renterLeak = body.filter((row) => row.renter_phone || row.renter_email).length;
  }
}

const renters = await probe(
  "public_property_details?select=id&or=(renter_phone.not.is.null,renter_email.not.is.null)",
);
console.log(`cards exposing a renter  rows ${renters.total} (expect 0 after 094)${renterLeak ? " LEAK" : ""}`);
