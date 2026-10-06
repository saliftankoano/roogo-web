import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canAcceptVoiceTerms,
  canOwnAnotherVoice,
  canRevokeVoice,
  isVoiceUsable,
  visibleVoices,
} from "./voices.ts";
import {
  TERMS_PARAGRAPHS,
  TERMS_VERSION,
  termsFullText,
} from "./consent-terms.ts";

const staffA = { id: "user-a", user_type: "staff" };
const staffB = { id: "user-b", user_type: "staff" };
const founder = { id: "founder", user_type: "founder" };

const voice = (overrides) => ({
  id: "v1",
  key: "k",
  label: "Voix",
  description: null,
  cartesiaVoiceId: "cartesia-id",
  kind: "system",
  ownerUserId: null,
  status: "active",
  ...overrides,
});

describe("isVoiceUsable", () => {
  it("lets only active voices speak", () => {
    assert.equal(isVoiceUsable(voice({ status: "active" })), true);
    assert.equal(isVoiceUsable(voice({ status: "locked" })), false);
    assert.equal(isVoiceUsable(voice({ status: "pending" })), false);
    assert.equal(isVoiceUsable(voice({ status: "revoked" })), false);
  });
});

describe("canAcceptVoiceTerms", () => {
  it("lets the owner unlock a locked voice, and nobody else", () => {
    const locked = voice({ status: "locked", ownerUserId: "user-a" });
    assert.equal(canAcceptVoiceTerms(staffA, locked), true);
    assert.equal(canAcceptVoiceTerms(staffB, locked), false);
    assert.equal(canAcceptVoiceTerms(founder, locked), false);
  });

  it("does nothing for voices that are not locked", () => {
    assert.equal(
      canAcceptVoiceTerms(staffA, voice({ status: "active", ownerUserId: "user-a" })),
      false,
    );
  });
});

describe("canRevokeVoice", () => {
  const owned = voice({ ownerUserId: "user-a" });

  it("lets the owner and a founder withdraw a voice", () => {
    assert.equal(canRevokeVoice(staffA, owned), true);
    assert.equal(canRevokeVoice(founder, owned), true);
  });

  it("blocks other staff and already revoked voices", () => {
    assert.equal(canRevokeVoice(staffB, owned), false);
    assert.equal(
      canRevokeVoice(staffA, voice({ ownerUserId: "user-a", status: "revoked" })),
      false,
    );
  });
});

describe("one voice per person", () => {
  it("refuses a second voice while the first is not revoked", () => {
    for (const status of ["active", "locked", "pending"]) {
      assert.equal(
        canOwnAnotherVoice("user-a", [voice({ ownerUserId: "user-a", status })]),
        false,
        status,
      );
    }
  });

  it("allows a new voice once the old one is revoked", () => {
    assert.equal(
      canOwnAnotherVoice("user-a", [
        voice({ ownerUserId: "user-a", status: "revoked" }),
      ]),
      true,
    );
  });

  it("is per person", () => {
    assert.equal(
      canOwnAnotherVoice("user-b", [voice({ ownerUserId: "user-a" })]),
      true,
    );
  });
});

describe("visibleVoices", () => {
  const list = [
    voice({ id: "1", key: "house", ownerUserId: null, status: "active" }),
    voice({ id: "2", key: "mine", ownerUserId: "user-a", status: "locked" }),
    voice({ id: "3", key: "theirs", ownerUserId: "user-b", status: "locked" }),
    voice({ id: "4", key: "gone", ownerUserId: "user-a", status: "revoked" }),
  ];

  it("shows usable voices and the viewer's own locked voice only", () => {
    assert.deepEqual(
      visibleVoices(staffA, list).map((v) => v.key),
      ["house", "mine"],
    );
    assert.deepEqual(
      visibleVoices(staffB, list).map((v) => v.key),
      ["house", "theirs"],
    );
  });
});

describe("consent terms", () => {
  it("has a versioned French text covering the agreed scope", () => {
    assert.match(TERMS_VERSION, /^voix-v\d+-\d{4}-\d{2}-\d{2}$/);
    const text = termsFullText();
    assert.match(text, /Kazedra Tech/);
    assert.match(text, /interne/);
    assert.match(text, /externe/);
    assert.match(text, /retirer/);
    assert.ok(TERMS_PARAGRAPHS.length >= 5);
  });

  it("follows the house copy rules (no em dash, no emoji)", () => {
    const text = termsFullText();
    assert.equal(text.includes("—"), false);
    assert.equal(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(text), false);
  });
});
