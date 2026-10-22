import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import {
  CLERK_ACCOUNTS_CACHE_KEY,
  CLERK_PAGE_SIZE,
  accountsGapLine,
  cachedClerkAccounts,
  clerkExclusion,
  collectClerkAccounts,
  resetClerkAccountsMemory,
} from "./clerk-users.ts";

const DAY = 86400000;
const T0 = Date.parse("2026-01-01T00:00:00Z");

function user(i, extra = {}) {
  return {
    createdAt: T0 + i * DAY,
    publicMetadata: { userType: "renter" },
    primaryEmailAddressId: `e${i}`,
    emailAddresses: [{ id: `e${i}`, emailAddress: `person${i}@mail.bf` }],
    ...extra,
  };
}

/** A fake Clerk list over `all`, recording each call. */
function fakeList(all, calls = []) {
  return async ({ limit, offset, orderBy }) => {
    calls.push({ limit, offset, orderBy });
    return { data: all.slice(offset, offset + limit), totalCount: all.length };
  };
}

describe("clerkExclusion", () => {
  it("leaves out staff, founder and admin accounts", () => {
    for (const type of ["staff", "founder", "admin", "Founder"]) {
      assert.equal(clerkExclusion(user(1, { publicMetadata: { userType: type } })), "team");
    }
  });
  it("leaves out Clerk test and example.com/.org addresses (primary email)", () => {
    for (const email of ["a+clerk_test@roogo.bf", "x@example.com", "y@example.org"]) {
      assert.equal(clerkExclusion(user(1, { emailAddresses: [{ id: "e1", emailAddress: email }] })), "test");
    }
  });
  it("counts owners, renters, agents and accounts with no type or no email", () => {
    for (const type of ["owner", "renter", "agent", undefined]) {
      assert.equal(clerkExclusion(user(1, { publicMetadata: type ? { userType: type } : {} })), null);
    }
    assert.equal(clerkExclusion(user(1, { emailAddresses: [] })), null);
  });
});

describe("collectClerkAccounts", () => {
  it("pages 500 at a time, oldest first, and stops at the last page", async () => {
    const all = Array.from({ length: 1203 }, (_, i) => user(i));
    const calls = [];
    const out = await collectClerkAccounts(fakeList(all, calls), new Date(T0));
    assert.deepEqual(calls.map((c) => c.offset), [0, 500, 1000]);
    assert.ok(calls.every((c) => c.limit === CLERK_PAGE_SIZE && c.orderBy === "+created_at"));
    assert.equal(out.createdAts.length, 1203);
    assert.equal(out.total, 1203);
    assert.equal(out.createdAts[0], new Date(T0).toISOString());
  });
  it("does not ask for an empty page when the total is a multiple of 500", async () => {
    const calls = [];
    await collectClerkAccounts(fakeList(Array.from({ length: 1000 }, (_, i) => user(i)), calls));
    assert.deepEqual(calls.map((c) => c.offset), [0, 500]);
  });
  it("keeps creation times only and counts the exclusions", async () => {
    const all = [
      user(1),
      user(2, { publicMetadata: { userType: "staff" } }),
      user(3, { emailAddresses: [{ id: "e3", emailAddress: "t+clerk_test@x.bf" }] }),
      user(4),
    ];
    const out = await collectClerkAccounts(fakeList(all));
    assert.equal(out.createdAts.length, 2);
    assert.equal(out.excludedTeam, 1);
    assert.equal(out.excludedTest, 1);
    assert.equal(out.total, 4);
    assert.doesNotMatch(JSON.stringify(out), /mail\.bf|person/);
  });
});

describe("cachedClerkAccounts", () => {
  beforeEach(() => resetClerkAccountsMemory());

  function fakeStore(initial) {
    const map = new Map(initial ? [[CLERK_ACCOUNTS_CACHE_KEY, initial]] : []);
    const sets = [];
    return {
      sets,
      get: async (k) => map.get(k) ?? null,
      set: async (k, v, opts) => { sets.push({ k, opts }); map.set(k, v); },
    };
  }

  it("reads Clerk once, then serves the shared cache for 10 minutes", async () => {
    const calls = [];
    const store = fakeStore();
    const first = await cachedClerkAccounts(fakeList([user(1), user(2)], calls), store, T0);
    assert.equal(first.createdAts.length, 2);
    assert.deepEqual(store.sets.map((s) => s.opts.ex), [600]);
    resetClerkAccountsMemory();
    const second = await cachedClerkAccounts(fakeList([user(1)], calls), store, T0 + 1000);
    assert.equal(second.createdAts.length, 2);
    assert.equal(calls.length, 1);
  });
  it("keeps a per-instance copy when there is no Redis, until it expires", async () => {
    const calls = [];
    await cachedClerkAccounts(fakeList([user(1)], calls), null, T0);
    await cachedClerkAccounts(fakeList([user(1)], calls), null, T0 + 5 * 60000);
    assert.equal(calls.length, 1);
    await cachedClerkAccounts(fakeList([user(1)], calls), null, T0 + 11 * 60000);
    assert.equal(calls.length, 2);
  });
  it("still counts when the cache is unreachable", async () => {
    const broken = { get: async () => { throw new Error("down"); }, set: async () => { throw new Error("down"); } };
    const out = await cachedClerkAccounts(fakeList([user(1)]), broken, T0);
    assert.equal(out.createdAts.length, 1);
  });
  it("ignores a cached value of the wrong shape", async () => {
    const calls = [];
    await cachedClerkAccounts(fakeList([user(1)], calls), fakeStore("{\"nope\":1}"), T0);
    assert.equal(calls.length, 1);
  });
});

describe("accountsGapLine", () => {
  it("names both counts and the gap, with no em dash", () => {
    const a = accountsGapLine(612, 540);
    assert.equal(a.title, "Comptes Clerk : 612 · Fiches Roogo : 540");
    assert.match(a.sub, /^72 comptes n’ont pas encore de fiche Roogo/);
    assert.match(accountsGapLine(10, 10).sub, /Aucun écart/);
    assert.match(accountsGapLine(9, 10).sub, /^1 fiche Roogo n’a plus de compte Clerk/);
    assert.match(accountsGapLine(1500, 1000).title, /1 500/);
    for (const line of [a, accountsGapLine(1, 0)]) assert.doesNotMatch(line.title + line.sub, /—/);
  });
});
