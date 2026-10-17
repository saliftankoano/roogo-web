import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { selfServiceUserTypeError } from "./user-types.ts";

test("members cannot promote themselves to staff, founder or admin", () => {
  for (const from of ["renter", "owner", "agent", "regular", "hotel", null, undefined]) {
    for (const to of ["staff", "founder", "admin", "Founder", "STAFF"]) {
      assert.ok(selfServiceUserTypeError(from, to), `${from} -> ${to} must be refused`);
    }
  }
});

test("staff and founders cannot change their type through self-service", () => {
  assert.ok(selfServiceUserTypeError("staff", "renter"));
  assert.ok(selfServiceUserTypeError("founder", "owner"));
  assert.ok(selfServiceUserTypeError("staff", "founder"));
});

test("ordinary changes and no-ops stay allowed", () => {
  assert.equal(selfServiceUserTypeError("renter", "owner"), null);
  assert.equal(selfServiceUserTypeError(null, "agent"), null);
  assert.equal(selfServiceUserTypeError("owner", undefined), null);
  assert.equal(selfServiceUserTypeError("staff", "staff"), null);
  assert.equal(selfServiceUserTypeError("founder", "founder"), null);
});

test("the metadata route applies the rule before writing", () => {
  const source = readFileSync(new URL("../app/api/clerk/users/me/metadata/route.ts", import.meta.url), "utf8");
  const guard = source.indexOf("selfServiceUserTypeError(previousUserType");
  const write = source.indexOf("publicMetadata.userType = userType");
  assert.ok(guard > 0, "route must call selfServiceUserTypeError");
  assert.ok(guard < write, "the check must run before the userType is written");
});
