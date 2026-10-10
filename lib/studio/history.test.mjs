import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { projectContains, projectKind, projectSummary } from "./history.ts";

const row = (kind, title = kind) => ({ conversation_id: "c", kind, title, created_at: "2026-10-09" });

describe("projectKind", () => {
  it("calls a project with only visuals a visual project", () => {
    assert.equal(projectKind(["image", "image"]), "visual");
  });
  it("calls anything with a script or a voice a conversation", () => {
    assert.equal(projectKind(["image", "script"]), "chat");
    assert.equal(projectKind([]), "chat");
  });
});

describe("projectContains", () => {
  it("lists every filter a project matches", () => {
    assert.deepEqual(projectContains(["script", "voiceover", "image"]), ["chat", "visual"]);
    assert.deepEqual(projectContains(["image"]), ["visual"]);
    assert.deepEqual(projectContains([]), []);
  });
});

describe("projectSummary", () => {
  it("numbers scripts", () => {
    assert.equal(projectSummary([row("script"), row("script")]), "Script v2");
  });
  it("names the latest result", () => {
    assert.equal(projectSummary([row("script"), row("voiceover", "Voix off (Sandrine)")]), "Voix off (Sandrine) prête");
    assert.equal(projectSummary([row("captions")]), "Sous-titres prêts");
    assert.equal(projectSummary([row("image", "Affiche de voeux")]), "Affiche de voeux");
  });
  it("is empty for a new project", () => {
    assert.equal(projectSummary([]), null);
  });
});
