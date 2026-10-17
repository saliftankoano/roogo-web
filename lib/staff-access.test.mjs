import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canChangeStaffMember,
  canGrantStaffLevel,
  capabilitiesForLevel,
  resolveStaffLevel,
  staffLevelCan,
  staffLevelsEnforced,
} from "./staff-access.ts";

const rolledOut = { enforced: false };
const enforced = { enforced: true };

describe("resolveStaffLevel", () => {
  it("a founder is always founder", () => {
    assert.equal(resolveStaffLevel({ userType: "founder" }, enforced), "founder");
    assert.equal(
      resolveStaffLevel({ userType: "founder", staffLevel: "intern" }, enforced),
      "founder",
    );
  });

  it("uses the level of a staff member who has one", () => {
    assert.equal(
      resolveStaffLevel({ userType: "staff", staffLevel: "director" }, enforced),
      "director",
    );
    assert.equal(
      resolveStaffLevel({ userType: "staff", staffLevel: "Advisor" }, rolledOut),
      "advisor",
    );
  });

  it("keeps unleveled staff as they were until enforcement is on", () => {
    assert.equal(resolveStaffLevel({ userType: "staff" }, rolledOut), "legacy");
    assert.equal(resolveStaffLevel({ userType: "staff" }, enforced), "advisor");
  });

  it("never lets a staff account hold the founder level", () => {
    assert.equal(
      resolveStaffLevel({ userType: "staff", staffLevel: "founder" }, enforced),
      "advisor",
    );
  });

  it("gives nothing to non-staff or unknown people", () => {
    assert.equal(resolveStaffLevel({ userType: "owner" }, rolledOut), null);
    assert.equal(resolveStaffLevel({ userType: "renter", staffLevel: "director" }, enforced), null);
    assert.equal(resolveStaffLevel(null, enforced), null);
  });
});

describe("approved matrix (2026-10-11)", () => {
  it("only the founder reaches settings and prices", () => {
    for (const level of ["director", "assistant", "advisor", "intern", "legacy"]) {
      assert.equal(staffLevelCan(level, "settings.manage"), false, level);
    }
    assert.equal(staffLevelCan("founder", "settings.manage"), true);
  });

  it("the director sees finances (read only) and validates referrals", () => {
    assert.equal(staffLevelCan("director", "finances.view"), true);
    assert.equal(staffLevelCan("director", "referrals.validate"), true);
    assert.equal(staffLevelCan("director", "users.listAll"), true);
  });

  it("legacy staff never see finances or the team page", () => {
    assert.equal(staffLevelCan("legacy", "finances.view"), false);
    assert.equal(staffLevelCan("legacy", "team.manage"), false);
  });

  it("deleting a listing is for founder and director only", () => {
    assert.equal(staffLevelCan("founder", "listings.delete"), true);
    assert.equal(staffLevelCan("director", "listings.delete"), true);
    assert.equal(staffLevelCan("assistant", "listings.delete"), false);
    assert.equal(staffLevelCan("advisor", "listings.delete"), false);
    assert.equal(staffLevelCan("intern", "listings.delete"), false);
  });

  it("an advisor writes listings but an assistant or director puts them online", () => {
    assert.equal(staffLevelCan("advisor", "listings.write"), true);
    assert.equal(staffLevelCan("advisor", "listings.publish"), false);
    assert.equal(staffLevelCan("assistant", "listings.publish"), true);
    assert.equal(staffLevelCan("director", "listings.publish"), true);
    assert.equal(staffLevelCan("intern", "listings.write"), false);
  });

  it("the advisor sees the status of identity papers, not the papers", () => {
    assert.equal(staffLevelCan("advisor", "identity.status"), true);
    assert.equal(staffLevelCan("advisor", "identity.review"), false);
    assert.equal(staffLevelCan("advisor", "ownership.review"), false);
  });

  it("the assistant sees owners and agents, not every user", () => {
    assert.equal(staffLevelCan("assistant", "users.listOwnersAgents"), true);
    assert.equal(staffLevelCan("assistant", "users.listAll"), false);
    assert.equal(staffLevelCan("advisor", "users.listOwnersAgents"), false);
  });

  it("only founder and director settle disputes; others read", () => {
    assert.equal(staffLevelCan("director", "disputes.resolve"), true);
    assert.equal(staffLevelCan("assistant", "disputes.resolve"), false);
    assert.equal(staffLevelCan("assistant", "disputes.view"), true);
    assert.equal(staffLevelCan("intern", "disputes.view"), false);
  });

  it("the intern only reads listings and applications, and uses the Studio", () => {
    assert.deepEqual(capabilitiesForLevel("intern").sort(), [
      "applications.view",
      "listings.view",
      "studio.use",
    ]);
  });

  it("a person with no level has no capability", () => {
    assert.deepEqual(capabilitiesForLevel(null), []);
    assert.equal(staffLevelCan(null, "listings.view"), false);
  });
});

describe("who may give access", () => {
  const base = { actorUserId: "a", targetUserId: "b" };

  it("the founder grants any assignable level", () => {
    for (const targetLevel of ["director", "assistant", "advisor", "intern"]) {
      assert.equal(
        canGrantStaffLevel({ ...base, actorLevel: "founder", targetLevel }),
        true,
        targetLevel,
      );
    }
  });

  it("a director grants assistant, advisor and intern, never another director", () => {
    assert.equal(canGrantStaffLevel({ ...base, actorLevel: "director", targetLevel: "assistant" }), true);
    assert.equal(canGrantStaffLevel({ ...base, actorLevel: "director", targetLevel: "intern" }), true);
    assert.equal(canGrantStaffLevel({ ...base, actorLevel: "director", targetLevel: "director" }), false);
  });

  it("nobody else grants anything", () => {
    for (const actorLevel of ["assistant", "advisor", "intern", "legacy", null]) {
      assert.equal(canGrantStaffLevel({ ...base, actorLevel, targetLevel: "intern" }), false, String(actorLevel));
    }
  });

  it("nobody changes their own level, even the founder", () => {
    assert.equal(
      canGrantStaffLevel({ actorLevel: "founder", actorUserId: "a", targetUserId: "a", targetLevel: "advisor" }),
      false,
    );
    assert.equal(
      canChangeStaffMember({ actorLevel: "director", actorUserId: "a", targetUserId: "a", currentLevel: "advisor" }),
      false,
    );
  });

  it("a director cannot touch a director or the founder", () => {
    assert.equal(canChangeStaffMember({ actorLevel: "director", actorUserId: "a", targetUserId: "b", currentLevel: "director" }), false);
    assert.equal(canChangeStaffMember({ actorLevel: "director", actorUserId: "a", targetUserId: "b", currentLevel: "founder" }), false);
    assert.equal(canChangeStaffMember({ actorLevel: "director", actorUserId: "a", targetUserId: "b", currentLevel: "advisor" }), true);
  });

  it("the founder cannot be changed by anyone", () => {
    assert.equal(canChangeStaffMember({ actorLevel: "founder", actorUserId: "a", targetUserId: "b", currentLevel: "founder" }), false);
  });
});

describe("staffLevelsEnforced", () => {
  it("is off unless the switch is exactly true", () => {
    assert.equal(staffLevelsEnforced({}), false);
    assert.equal(staffLevelsEnforced({ STAFF_LEVELS_ENFORCED: "1" }), false);
    assert.equal(staffLevelsEnforced({ STAFF_LEVELS_ENFORCED: "true" }), true);
  });
});
