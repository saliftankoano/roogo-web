import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  INDEX_ALERT_AFTER_DAYS,
  buildIndexCheckRow,
  coverageStateLabel,
  indexHealth,
} from "./listing-index.ts";

const NOW = "2026-10-18T03:00:00.000Z";
const base = { propertyId: "p1", url: "https://www.roogobf.com/proprietes/x", now: NOW };

describe("buildIndexCheckRow", () => {
  it("first check of a listing Google has not indexed", () => {
    const row = buildIndexCheckRow({
      ...base,
      previous: null,
      error: null,
      result: {
        verdict: "NEUTRAL",
        coverageState: "Discovered - currently not indexed",
      },
    });
    assert.equal(row.verdict, "NEUTRAL");
    assert.equal(row.first_seen_at, NOW);
    assert.equal(row.first_indexed_at, null);
    assert.deepEqual(row.referring_urls, []);
  });

  it("keeps first_seen_at and records the first PASS", () => {
    const row = buildIndexCheckRow({
      ...base,
      previous: {
        first_seen_at: "2026-10-10T03:00:00.000Z",
        first_indexed_at: null,
        verdict: "NEUTRAL",
        coverage_state: "Discovered - currently not indexed",
      },
      error: null,
      result: { verdict: "PASS", coverageState: "Submitted and indexed" },
    });
    assert.equal(row.first_seen_at, "2026-10-10T03:00:00.000Z");
    assert.equal(row.first_indexed_at, NOW);
  });

  it("a failed call keeps the last verdict and records the error", () => {
    const row = buildIndexCheckRow({
      ...base,
      previous: {
        first_seen_at: "2026-10-01T03:00:00.000Z",
        first_indexed_at: "2026-10-05T03:00:00.000Z",
        verdict: "PASS",
        coverage_state: "Submitted and indexed",
      },
      result: null,
      error: "HTTP 429 quota",
    });
    assert.equal(row.verdict, "PASS");
    assert.equal(row.first_indexed_at, "2026-10-05T03:00:00.000Z");
    assert.equal(row.last_error, "HTTP 429 quota");
  });
});

describe("indexHealth", () => {
  const now = new Date(NOW);
  const daysAgo = (d) => new Date(now.getTime() - d * 86_400_000).toISOString();

  it("classifies", () => {
    assert.equal(indexHealth(null, now), "unchecked");
    assert.equal(indexHealth({ verdict: "PASS", first_seen_at: daysAgo(30) }, now), "indexed");
    assert.equal(indexHealth({ verdict: "NEUTRAL", first_seen_at: daysAgo(2) }, now), "waiting");
    assert.equal(
      indexHealth({ verdict: "NEUTRAL", first_seen_at: daysAgo(INDEX_ALERT_AFTER_DAYS) }, now),
      "late",
    );
  });
});

describe("coverageStateLabel", () => {
  it("translates known states and passes unknown ones through", () => {
    assert.equal(
      coverageStateLabel("Discovered - currently not indexed"),
      "Découverte, pas encore explorée",
    );
    assert.equal(coverageStateLabel("Something new"), "Something new");
    assert.equal(coverageStateLabel(null), "");
  });
});
