import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { splitStreaming } from "./stream-split.ts";

describe("splitStreaming", () => {
  it("keeps plain prose", () => {
    assert.deepEqual(splitStreaming("Voici le script."), { prose: "Voici le script.", script: null, scriptDone: false });
  });
  it("hides a fence that is still arriving", () => {
    assert.equal(splitStreaming("Voici le script.\n``").prose, "Voici le script.");
    assert.equal(splitStreaming("Voici le script.\n```scr").prose, "Voici le script.");
  });
  it("streams the script into its own part", () => {
    const s = splitStreaming("Voici le script.\n```script\nVilla à vendre au quartier");
    assert.equal(s.prose, "Voici le script.");
    assert.equal(s.script, "Villa à vendre au quartier");
    assert.equal(s.scriptDone, false);
  });
  it("closes the script and keeps prose after it", () => {
    const s = splitStreaming("Voici.\n```script\nTexte complet.\n```\nDites-moi si ça vous va.");
    assert.equal(s.script, "Texte complet.");
    assert.equal(s.scriptDone, true);
    assert.equal(s.prose, "Voici.\n\nDites-moi si ça vous va.");
  });
});
