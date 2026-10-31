// The TikTok panel rules (lib/social/tiktok-post-settings.ts), from TikTok's
// Content Sharing Guidelines, with a mocked fetch. No real TikTok call.
import assert from "node:assert/strict";
import test from "node:test";
import {
  COPY,
  EMPTY_CHOICES,
  PRIVACY_LABELS,
  choiceProblems,
  commercialLabel,
  fetchCreatorInfo,
  parseChoices,
  parseCreatorInfo,
  postInfoFields,
  readSettings,
  settingsProblems,
  settingsSummary,
  toSettings,
} from "./tiktok-post-settings.ts";

const CREATOR = parseCreatorInfo({
  creator_nickname: "Roogo Burkina",
  creator_username: "roogo.226",
  creator_avatar_url: "https://p16.tiktokcdn.com/a.jpg",
  privacy_level_options: ["PUBLIC_TO_EVERYONE", "MUTUAL_FOLLOW_FRIENDS", "FOLLOWER_OF_CREATOR", "SELF_ONLY", "SOMETHING_NEW"],
  comment_disabled: false,
  duet_disabled: false,
  stitch_disabled: true,
  max_video_post_duration_sec: 600,
});

const PUBLIC = { ...EMPTY_CHOICES, privacyLevel: "PUBLIC_TO_EVERYONE" };

test("creator info is read defensively: unknown privacy options dropped, disabled interactions kept", () => {
  assert.equal(CREATOR.nickname, "Roogo Burkina");
  assert.deepEqual(CREATOR.privacyLevelOptions, ["PUBLIC_TO_EVERYONE", "MUTUAL_FOLLOW_FRIENDS", "FOLLOWER_OF_CREATOR", "SELF_ONLY"]);
  assert.equal(CREATOR.stitchDisabled, true);
  assert.equal(CREATOR.maxVideoPostDurationSec, 600);
  const bare = parseCreatorInfo({});
  assert.equal(bare.nickname, "Compte TikTok");
  assert.deepEqual(bare.privacyLevelOptions, []);
  assert.equal(bare.maxVideoPostDurationSec, null);
});

test("nothing is chosen by default: privacy empty, interactions and disclosure off", () => {
  assert.equal(EMPTY_CHOICES.privacyLevel, null);
  assert.equal(EMPTY_CHOICES.allowComment || EMPTY_CHOICES.allowDuet || EMPTY_CHOICES.allowStitch, false);
  assert.equal(EMPTY_CHOICES.commercial, false);
  assert.deepEqual(choiceProblems(EMPTY_CHOICES, CREATOR, 30), [COPY.pickPrivacy]);
  assert.deepEqual(choiceProblems(PUBLIC, CREATOR, 30), []);
});

test("privacy must be one TikTok offers for this account", () => {
  const onlyPrivate = { ...CREATOR, privacyLevelOptions: ["SELF_ONLY"] };
  assert.match(choiceProblems(PUBLIC, onlyPrivate, 30)[0], /ne propose plus « Public »/);
  assert.deepEqual(choiceProblems({ ...EMPTY_CHOICES, privacyLevel: "SELF_ONLY" }, onlyPrivate, 30), []);
});

test("interactions the account disabled cannot be turned on", () => {
  assert.match(choiceProblems({ ...PUBLIC, allowStitch: true }, CREATOR, 30)[0], /collages sont désactivés/);
  assert.deepEqual(choiceProblems({ ...PUBLIC, allowComment: true, allowDuet: true }, CREATOR, 30), []);
});

test("the video must fit the account's maximum duration; unknown duration is not blocked", () => {
  assert.match(choiceProblems(PUBLIC, CREATOR, 601)[0], /601 s : ce compte TikTok accepte 600 s au plus/);
  assert.deepEqual(choiceProblems(PUBLIC, CREATOR, null), []);
});

test("commercial disclosure: one option required, branded content never « Moi seulement », labels", () => {
  assert.deepEqual(choiceProblems({ ...PUBLIC, commercial: true }, CREATOR, 30), [COPY.pickCommercial]);
  assert.deepEqual(choiceProblems({ ...PUBLIC, commercial: true, yourBrand: true }, CREATOR, 30), []);
  assert.deepEqual(
    choiceProblems({ ...EMPTY_CHOICES, privacyLevel: "SELF_ONLY", commercial: true, brandedContent: true }, CREATOR, 30),
    [COPY.brandedNotPrivate],
  );
  assert.equal(commercialLabel({ commercial: false, yourBrand: true, brandedContent: false }), null);
  assert.match(commercialLabel({ commercial: true, yourBrand: true, brandedContent: false }), /Contenu promotionnel/);
  assert.match(commercialLabel({ commercial: true, yourBrand: true, brandedContent: true }), /Partenariat rémunéré/);
});

test("the browser's choices are type-checked; brand boxes only count with the switch on", () => {
  assert.equal(parseChoices(null), null);
  assert.deepEqual(parseChoices({ privacyLevel: "HACK", allowComment: "yes", yourBrand: true }), EMPTY_CHOICES);
  assert.deepEqual(parseChoices({ privacyLevel: "FOLLOWER_OF_CREATOR", commercial: true, brandedContent: true }), {
    ...EMPTY_CHOICES,
    privacyLevel: "FOLLOWER_OF_CREATOR",
    commercial: true,
    brandedContent: true,
  });
});

test("saved settings map to post_info exactly, and survive a round trip", () => {
  const choices = { ...PUBLIC, allowComment: true, commercial: true, yourBrand: true };
  const saved = toSettings(choices, CREATOR, "user-1", "2026-10-31T10:00:00.000Z");
  assert.deepEqual(readSettings(JSON.parse(JSON.stringify(saved))), saved);
  assert.deepEqual(postInfoFields(saved), {
    privacy_level: "PUBLIC_TO_EVERYONE",
    disable_comment: false,
    disable_duet: true,
    disable_stitch: true,
    brand_content_toggle: false,
    brand_organic_toggle: true,
  });
  assert.equal(readSettings(null), null);
  assert.equal(readSettings({ privacy_level: "EVERYBODY" }), null);
  assert.equal(settingsSummary(saved), "Public · commentaires autorisés · contenu promotionnel");
  assert.equal(settingsSummary({ ...saved, allow_comment: false, your_brand: false }), "Public · commentaires, duos et collages fermés");
});

test("before posting, saved settings are checked again against fresh creator info", () => {
  const saved = toSettings({ ...PUBLIC, allowDuet: true }, CREATOR, "u", "t");
  assert.deepEqual(settingsProblems(saved, CREATOR, 30), []);
  assert.match(settingsProblems(saved, { ...CREATOR, duetDisabled: true }, 30)[0], /duos sont désactivés/);
  assert.match(settingsProblems(saved, { ...CREATOR, privacyLevelOptions: ["SELF_ONLY"] }, 30)[0], /ne propose plus/);
});

test("creator info call: token only in the header; « cannot post » codes stop; never throws", async () => {
  const calls = [];
  const ok = await fetchCreatorInfo(async (url, init) => {
    calls.push({ url, init });
    return { ok: true, status: 200, json: async () => ({ data: { creator_nickname: "Roogo Burkina", privacy_level_options: ["SELF_ONLY"] }, error: { code: "ok" } }) };
  }, "TOKEN-SECRET");
  assert.equal(ok.ok, true);
  assert.equal(calls[0].url, "https://open.tiktokapis.com/v2/post/publish/creator_info/query/");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers.Authorization, "Bearer TOKEN-SECRET");

  const capped = await fetchCreatorInfo(async () => ({ ok: true, status: 200, json: async () => ({ error: { code: "spam_risk_too_many_posts" } }) }), "TOKEN-SECRET");
  assert.deepEqual([capped.ok, capped.cannotPost, capped.error], [false, true, COPY.cannotPost]);

  const expired = await fetchCreatorInfo(async () => ({ ok: false, status: 401, json: async () => ({ error: { code: "access_token_invalid" } }) }), "TOKEN-SECRET");
  assert.match(expired.error, /reconnectez TikTok/);

  const down = await fetchCreatorInfo(async () => {
    throw new Error("socket hang up");
  }, "TOKEN-SECRET");
  assert.equal(down.ok, false);
  for (const r of [capped, expired, down]) assert.ok(!JSON.stringify(r).includes("TOKEN-SECRET"));
});

test("French copy follows the house rules (no em dash), privacy labels are French", () => {
  assert.deepEqual(Object.values(PRIVACY_LABELS), ["Public", "Amis", "Abonnés", "Moi seulement"]);
  for (const text of Object.values(COPY)) assert.ok(!/[—–]/.test(text), text);
});
