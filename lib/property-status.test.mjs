import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { propertyStatusLabel, soldTransition } from "./property-status.ts";
import { STAFF_TITLES, isDirectorOrFounder } from "./team-tasks/core.ts";

const TODAY = "2026-10-16";
const base = {
  next: "vendu",
  current: "en_ligne",
  listingType: "vendre",
  isTest: false,
  canDecideSale: true,
  soldAt: "2026-10-10",
  soldPrice: 25000000,
  todayKey: TODAY,
  actorId: "u1",
};

describe("Vendu status: who", () => {
  it("only the Directeur and the Fondateur may set vendu", () => {
    for (const level of ["fondateur", ...STAFF_TITLES]) {
      const result = soldTransition({ ...base, canDecideSale: isDirectorOrFounder(level) });
      assert.equal(result.ok, level === "fondateur" || level === "directeur", level);
      if (!result.ok) assert.equal(result.status, 403);
    }
  });

  it("only the Directeur and the Fondateur may take vendu back, and leaving clears the sold fields", () => {
    const denied = soldTransition({ ...base, next: "en_ligne", current: "vendu", canDecideSale: false });
    assert.equal(denied.ok, false);
    assert.equal(denied.status, 403);
    const undo = soldTransition({ ...base, next: "en_ligne", current: "vendu" });
    assert.deepEqual(undo, { ok: true, fields: { sold_at: null, sold_price: null, sold_by: null } });
  });

  it("other changes do not touch the sold fields and need no title", () => {
    assert.deepEqual(soldTransition({ ...base, next: "expired", current: "en_ligne", canDecideSale: false }), { ok: true, fields: {} });
  });
});

describe("Vendu status: listing type and date", () => {
  it("sale listings only, never a test listing", () => {
    assert.equal(soldTransition({ ...base, listingType: "louer" }).code, "sold_not_sale");
    assert.equal(soldTransition({ ...base, listingType: null }).code, "sold_not_sale");
    assert.equal(soldTransition({ ...base, isTest: true }).code, "sold_test_listing");
  });

  it("needs a real signature date, not in the future; today is fine", () => {
    assert.equal(soldTransition({ ...base, soldAt: undefined }).code, "sold_date_required");
    assert.equal(soldTransition({ ...base, soldAt: "2026-02-30" }).code, "sold_date_required");
    assert.equal(soldTransition({ ...base, soldAt: "2026-10-17" }).code, "sold_date_future");
    assert.equal(soldTransition({ ...base, soldAt: TODAY }).ok, true);
  });

  it("stores the date at midnight UTC (Ouagadougou), the price and who marked it", () => {
    assert.deepEqual(soldTransition(base), {
      ok: true,
      fields: { sold_at: "2026-10-10T00:00:00.000Z", sold_price: 25000000, sold_by: "u1" },
    });
    assert.equal(soldTransition({ ...base, soldPrice: "12 500 000" }).fields.sold_price, 12500000);
    assert.equal(soldTransition({ ...base, soldPrice: null }).fields.sold_price, null);
    assert.equal(soldTransition({ ...base, soldPrice: "" }).fields.sold_price, null);
    assert.equal(soldTransition({ ...base, soldPrice: -5 }).code, "sold_price_invalid");
    assert.equal(soldTransition({ ...base, soldPrice: "abc" }).code, "sold_price_invalid");
  });

  it("vendu to vendu updates the date and price", () => {
    const result = soldTransition({ ...base, current: "vendu", soldAt: "2026-10-12" });
    assert.equal(result.ok, true);
    assert.equal(result.fields.sold_at, "2026-10-12T00:00:00.000Z");
  });
});

describe("status labels", () => {
  it("expired no longer means sold; vendu reads Vendu", () => {
    assert.equal(propertyStatusLabel("expired"), "Expirée");
    assert.equal(propertyStatusLabel("vendu"), "Vendu");
    assert.equal(propertyStatusLabel("autre"), "autre");
  });

  it("the status route checks the title with isDirectorOrFounder", () => {
    const route = readFileSync("app/api/properties/[id]/status/route.ts", "utf8");
    assert.match(route, /isDirectorOrFounder/);
    assert.match(route, /soldTransition/);
  });
});
