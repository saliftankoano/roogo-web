import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  STUDIO_CAPS_BY_LEVEL,
  emailMatchesInvitation,
  hashInvitationToken,
  invitationExpiresAt,
  invitationState,
  newInvitationToken,
  normalizeInvitationEmail,
  normalizeReason,
} from "./staff-team.ts";

describe("normalizeInvitationEmail", () => {
  it("lowercases and trims a good address", () => {
    assert.equal(normalizeInvitationEmail("  Rokiatou@Roogobf.COM "), "rokiatou@roogobf.com");
  });
  it("rejects what is not an address", () => {
    for (const value of ["", "abc", "a@b", "a b@c.d", "@x.co", null, 12]) {
      assert.equal(normalizeInvitationEmail(value), null, String(value));
    }
  });
});

describe("invitation tokens", () => {
  it("makes a long random token and stores only its hash", () => {
    const a = newInvitationToken();
    const b = newInvitationToken();
    assert.match(a.token, /^[0-9a-f]{64}$/);
    assert.notEqual(a.token, b.token);
    assert.equal(a.tokenHash, hashInvitationToken(a.token));
    assert.notEqual(a.tokenHash, a.token);
  });
});

describe("invitationState", () => {
  const now = new Date("2026-10-16T12:00:00Z");
  const future = "2026-10-20T12:00:00Z";
  const past = "2026-10-10T12:00:00Z";
  it("reads open, accepted, revoked and expired", () => {
    assert.equal(invitationState({ expires_at: future }, now), "open");
    assert.equal(invitationState({ expires_at: past }, now), "expired");
    assert.equal(invitationState({ expires_at: future, revoked_at: past }, now), "revoked");
    assert.equal(invitationState({ expires_at: future, accepted_at: past }, now), "accepted");
  });
  it("lasts seven days", () => {
    assert.equal(invitationExpiresAt(now).toISOString(), "2026-10-23T12:00:00.000Z");
  });
});

describe("emailMatchesInvitation", () => {
  it("matches any address of the account, ignoring case", () => {
    assert.equal(emailMatchesInvitation("a@b.co", ["x@y.z", "A@B.co"]), true);
    assert.equal(emailMatchesInvitation("a@b.co", ["x@y.z"]), false);
  });
});

describe("normalizeReason", () => {
  it("collapses spaces, caps at 300 and treats blank as none", () => {
    assert.equal(normalizeReason("  trois   mots  "), "trois mots");
    assert.equal(normalizeReason("   "), null);
    assert.equal(normalizeReason("x".repeat(500)).length, 300);
  });
});

describe("Studio caps approved on 2026-10-11", () => {
  it("match the approved table", () => {
    assert.deepEqual(STUDIO_CAPS_BY_LEVEL, {
      director: { video: 3, other: 10 },
      advisor: { video: 3, other: 8 },
      assistant: { video: 1, other: 4 },
      intern: { video: 0.5, other: 2 },
    });
  });
});
