import assert from "node:assert/strict";
import { test } from "node:test";
import {
  toRequestDraft,
  mergeRequestDraft,
  isNewerRequestVersion,
} from "./property-request-drafts.ts";

const base = {
  ...toRequestDraft(null),
  title: "Original title",
  internal_notes: "Original note",
  commission_rate: "2.5",
  status: "open",
};
test("new call drafts retain blank optional fields and explicit commission entry", () => {
  const draft = toRequestDraft(null);
  assert.equal(draft.property_type, "Maison");
  assert.equal(draft.listing_type, "vendre");
  assert.equal(draft.status, "draft");
  assert.equal(draft.commission_rate, "");
  assert.equal(draft.budget_min, "");
});
test("rebasing local edits preserves unrelated staff changes including call closure", () => {
  const result = mergeRequestDraft(
    base,
    { ...base, title: "My title", budget_min: "" },
    { ...base, internal_notes: "Another staff note", status: "closed" },
  );
  assert.equal(result.draft.title, "My title");
  assert.equal(result.draft.internal_notes, "Another staff note");
  assert.equal(result.draft.status, "closed");
  assert.deepEqual(result.conflicts, []);
});
test("overlapping edits require a choice; repeated refreshes cannot dismiss conflicts", () => {
  const local = { ...base, title: "My title", commission_rate: "3" };
  const latest = { ...base, title: "Their title", commission_rate: "5" };
  const first = mergeRequestDraft(base, local, latest);
  assert.deepEqual(first.conflicts, ["title", "commission_rate"]);
  assert.equal(first.draft.commission_rate, "3");
  const second = mergeRequestDraft(
    latest,
    first.draft,
    { ...latest, internal_notes: "New note" },
    first.conflicts,
  );
  assert.deepEqual(second.conflicts, first.conflicts);
  assert.equal(second.draft.internal_notes, "New note");
});
test("matching changes resolve automatically without creating artificial conflicts", () => {
  const changed = { ...base, title: "Same new title" };
  assert.deepEqual(mergeRequestDraft(base, changed, changed).conflicts, []);
  assert.deepEqual(
    mergeRequestDraft(changed, changed, changed, ["title"]).conflicts,
    [],
  );
});
test("version ordering ignores stale refreshes and preserves PostgreSQL microseconds", () => {
  assert.equal(
    isNewerRequestVersion(
      "2026-09-07T12:00:00.000002+00:00",
      "2026-09-07T12:00:00.000001Z",
    ),
    true,
  );
  assert.equal(
    isNewerRequestVersion(
      "2026-09-07T12:00:00.000001Z",
      "2026-09-07T12:00:00.000002+00:00",
    ),
    false,
  );
  assert.equal(
    isNewerRequestVersion(
      "2026-09-07T07:00:00-05:00",
      "2026-09-07T12:00:00.000000Z",
    ),
    false,
  );
  assert.equal(
    isNewerRequestVersion("2026-09-07T12:00:00Z", "2026-09-07T13:00:00Z"),
    false,
  );
});
