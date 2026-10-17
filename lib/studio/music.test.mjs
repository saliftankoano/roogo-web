import test from "node:test";
import assert from "node:assert/strict";
import { buildMusicPrompt, generatedTitle, isMusicMood } from "./music.ts";

test("music prompts are always instrumental and keep the mood", () => {
  const prompt = buildMusicPrompt("afro", "  matin   à Ouaga ");
  assert.match(prompt, /Instrumental background music/);
  assert.match(prompt, /balafon/);
  assert.match(prompt, /matin à Ouaga\./);
  assert.match(prompt, /No vocals, no singing, no lyrics/);
  assert.doesNotMatch(prompt, /\.\./);
  assert.match(buildMusicPrompt(null, "piano doux"), /^Instrumental.*piano doux\..*No vocals/);
});

test("generated tracks get a readable title", () => {
  assert.equal(generatedTitle("calm", "piano doux pour une villa"), "Calme, piano doux pour une villa");
  assert.equal(generatedTitle(null, "guitare"), "Guitare");
  assert.equal(generatedTitle(null, ""), "Musique générée");
  assert.ok(generatedTitle("joyful", "a".repeat(80)).length < 60);
  assert.equal(isMusicMood("afro"), true);
  assert.equal(isMusicMood("rock"), false);
});

test("downloaded tracks get a readable file name", async () => {
  const { musicDownloadName } = await import("./music.ts");
  assert.equal(musicDownloadName("Good Day Ouaga"), "Roogo - Musique - Good Day Ouaga.mp3");
  assert.equal(musicDownloadName("Bienvenu à Roogo"), "Roogo - Musique - Bienvenu à Roogo.mp3");
  assert.equal(musicDownloadName("Calme, piano doux / villa…"), "Roogo - Musique - Calme, piano doux villa.mp3");
  assert.equal(musicDownloadName("  "), "Roogo - Musique.mp3");
});
