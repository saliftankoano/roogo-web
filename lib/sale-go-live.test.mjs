import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { saleGoLiveDecision, secondApproverError } from "./sale-go-live.ts";

const complete = {
  agentId: "owner-1",
  ownershipStatus: "approved",
  hasSignedMandate: true,
  canSkipChecks: false,
};

describe("sale go-live checks", () => {
  it("lets a fully checked sale go online for anyone who may publish", () => {
    assert.deepEqual(saleGoLiveDecision(complete), { ok: true, skipped: [] });
    assert.deepEqual(saleGoLiveDecision({ ...complete, canSkipChecks: true }), { ok: true, skipped: [] });
  });

  it("blocks an Assistant on each missing check, in order", () => {
    assert.equal(saleGoLiveDecision({ ...complete, agentId: null }).code, "sale_owner_link_required");
    assert.equal(
      saleGoLiveDecision({ ...complete, ownershipStatus: "pending" }).code,
      "sale_ownership_verification_required",
    );
    assert.equal(
      saleGoLiveDecision({ ...complete, ownershipStatus: "unsubmitted" }).code,
      "sale_ownership_verification_required",
    );
    assert.equal(saleGoLiveDecision({ ...complete, hasSignedMandate: false }).code, "sale_mandate_required");
  });

  it("lets a Directeur skip all three and lists what was skipped", () => {
    assert.deepEqual(
      saleGoLiveDecision({
        agentId: null,
        ownershipStatus: "unsubmitted",
        hasSignedMandate: false,
        canSkipChecks: true,
      }),
      { ok: true, skipped: ["owner_link", "ownership_documents", "signed_mandate"] },
    );
    assert.deepEqual(
      saleGoLiveDecision({ ...complete, hasSignedMandate: false, canSkipChecks: true }),
      { ok: true, skipped: ["signed_mandate"] },
    );
  });

  it("never lets refused documents through, Directeur included", () => {
    for (const canSkipChecks of [false, true]) {
      const decision = saleGoLiveDecision({
        agentId: null,
        ownershipStatus: "rejected",
        hasSignedMandate: false,
        canSkipChecks,
      });
      assert.equal(decision.ok, false);
      assert.equal(decision.code, "sale_ownership_rejected");
    }
  });

  it("keeps user copy free of long dashes", () => {
    for (const input of [
      { ...complete, agentId: null },
      { ...complete, ownershipStatus: "pending" },
      { ...complete, hasSignedMandate: false },
      { ...complete, ownershipStatus: "rejected" },
    ]) {
      assert.doesNotMatch(saleGoLiveDecision(input).error, /—/);
    }
  });
});

describe("second approver on documents", () => {
  const base = { reviewerId: "dir", filerId: "owner", ownerId: "owner", publishedWithoutChecksBy: null };

  it("lets anyone approve an owner's own dossier on a normally published sale", () => {
    assert.equal(secondApproverError(base), null);
  });

  it("refuses the staff member who filed the dossier for an owner without an account", () => {
    assert.match(secondApproverError({ ...base, filerId: "dir", ownerId: null }), /déposé ce dossier/);
    assert.equal(secondApproverError({ ...base, filerId: "assistant", ownerId: null }), null);
  });

  it("refuses the person who put the sale online without the checks", () => {
    assert.match(
      secondApproverError({ ...base, publishedWithoutChecksBy: "dir" }),
      /sans vérifications/,
    );
    assert.equal(secondApproverError({ ...base, publishedWithoutChecksBy: "founder" }), null);
  });

  it("keeps the messages free of long dashes", () => {
    assert.doesNotMatch(secondApproverError({ ...base, filerId: "dir", ownerId: null }), /—/);
    assert.doesNotMatch(secondApproverError({ ...base, publishedWithoutChecksBy: "dir" }), /—/);
  });
});
