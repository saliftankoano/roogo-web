import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  blockingProblems,
  carouselPaths,
  carouselPhotoRefs,
  carouselSlidePage,
  parseCarouselSpec,
  readCarouselMeta,
  rich,
  safePhotoName,
  slideFileName,
  slideWordCount,
} from "./carousel.ts";

const example = JSON.parse(readFileSync(new URL("./carousel.fixture.json", import.meta.url), "utf8"));
const opts = { photoUrl: (ref) => `https://cdn.test/${ref}`, badgeUrl: "/studio/carousel-badge-roogo.png" };

test("the approved carousel (7 signes d'une arnaque) parses without blocking problems", () => {
  const { spec, problems } = parseCarouselSpec(example);
  assert.ok(spec);
  assert.equal(spec.slides.length, 10);
  assert.deepEqual(blockingProblems(problems), []);
});

test("every slide needs a photo and a title; unknown types and bad framing are refused", () => {
  const bad = structuredClone(example);
  bad.slides[1].photo = "";
  bad.slides[2].type = "poster";
  bad.slides[3].photo_position = "top";
  bad.slides[4].title = " ";
  const messages = blockingProblems(parseCarouselSpec(bad).problems).map((p) => p.message);
  assert.ok(messages.some((m) => m.includes("Slide 2") && m.includes("photo")));
  assert.ok(messages.some((m) => m.includes("Slide 3") && m.includes("type inconnu")));
  assert.ok(messages.some((m) => m.includes("Slide 4") && m.includes("cadrage")));
  assert.ok(messages.some((m) => m.includes("Slide 5") && m.includes("titre")));
});

test("house rules: no em dash and no emoji on slides", () => {
  const bad = structuredClone(example);
  bad.slides[1].title = "Les papiers — pas à son nom";
  bad.slides[2].action = "Vérifiez 🏠";
  const messages = blockingProblems(parseCarouselSpec(bad).problems).map((p) => p.message);
  assert.ok(messages.some((m) => m.includes("Slide 2") && m.includes("tiret")));
  assert.ok(messages.some((m) => m.includes("Slide 3") && m.includes("emoji")));
});

test("long slides and more than 10 slides warn without blocking", () => {
  const long = structuredClone(example);
  long.slides[1].action = "mot ".repeat(40);
  const { problems } = parseCarouselSpec(long);
  assert.ok(problems.some((p) => !p.blocking && p.message.includes("mots")));
  assert.equal(slideWordCount({ title: "Un deux", action: "trois quatre cinq" }), 5);
});

test("photo treatment must be known settings between 0 and 2", () => {
  const bad = structuredClone(example);
  bad.slides[1].photo_treatment = { brightness: 5 };
  bad.slides[2].photo_treatment = { blur: 1 };
  const messages = blockingProblems(parseCarouselSpec(bad).problems).map((p) => p.message);
  assert.ok(messages.some((m) => m.includes("Slide 2") && m.includes("entre 0 et 2")));
  assert.ok(messages.some((m) => m.includes("Slide 3") && m.includes("inconnu")));
});

test("the slide page is modular: photo, framing, treatment, colours and logo come from the file", () => {
  const spec = structuredClone(parseCarouselSpec(example).spec);
  spec.slides[1].photo = "carousels/a/photos/autre.jpg";
  spec.slides[1].photo_treatment = { brightness: 1, shade: 0.7 };
  spec.theme = { colors: { terra_light: "#7FD1AE" } };
  spec.brand = { badge: "carousels/a/photos/logo.png" };
  const page = carouselSlidePage(spec, 2, opts);
  assert.ok(page.includes('src="https://cdn.test/carousels/a/photos/autre.jpg"'));
  assert.ok(page.includes('style="--photo-bright:1;--shade:0.7"'));
  assert.ok(page.includes(":root{--terraLt:#7FD1AE}"));
  const cover = carouselSlidePage(spec, 1, opts);
  assert.ok(cover.includes('src="https://cdn.test/carousels/a/photos/logo.png"'));
  assert.ok(page.includes('class="s on"'));
  assert.ok(!page.includes("rule"), "no ruled lines in the design");
});

test("text is escaped and *words* become the italic accent", () => {
  assert.equal(rich("<b>vendue à *trois personnes.*</b>"), "&lt;b&gt;vendue à <em>trois personnes.</em>&lt;/b&gt;");
});

test("file names and storage paths", () => {
  assert.equal(slideFileName({ file_title: "Roogo - 7 signes: arnaque/parcelle" }, 3), "Roogo - 7 signes arnaqueparcelle - 03.jpg");
  assert.equal(carouselPaths.slide("art", "v2", 7), "carousels/art/slides/v2/07.jpg");
  assert.ok(carouselPaths.isOwnPhoto("art", "carousels/art/photos/01.jpg"));
  assert.ok(!carouselPaths.isOwnPhoto("art", "carousels/other/photos/01.jpg"));
  assert.ok(!carouselPaths.isOwnPhoto("art", "carousels/art/photos/../../x.jpg"));
  assert.equal(safePhotoName("Parcelle Tanghin (réelle).JPG", 1), "01-parcelle-tanghin-reelle.jpg");
  assert.equal(safePhotoName("logo.png", 12), "12-logo.png");
});

test("meta round-trip and photo references", () => {
  const meta = readCarouselMeta({ spec: example, slides: ["a.jpg"], version: "v1", rendered_at: "2026-10-22T00:00:00Z" });
  assert.equal(meta.slides.length, 1);
  assert.equal(carouselPhotoRefs(meta.spec).length, 10);
  assert.equal(readCarouselMeta({}), null);
});

import { mediaProblems } from "./publishing.ts";
import { projectContains, projectKind } from "./history.ts";

test("publishing a Studio carousel counts its saved slides, alone", () => {
  const base = { mediaType: "carousel", networks: ["facebook", "instagram"], hasArtifact: true, artifactKind: "carousel", photoCount: 0 };
  assert.deepEqual(mediaProblems({ ...base, artifactSlideCount: 10 }), []);
  assert.ok(mediaProblems({ ...base, artifactSlideCount: 0 }).some((p) => p.code === "carousel-render"));
  assert.ok(mediaProblems({ ...base, artifactSlideCount: 11 }).some((p) => p.code === "carousel-size"));
  assert.ok(mediaProblems({ ...base, artifactSlideCount: 10, photoCount: 2 }).some((p) => p.code === "carousel-mix"));
  // Listing-photo carousels are unchanged.
  assert.deepEqual(mediaProblems({ ...base, hasArtifact: false, artifactKind: null, photoCount: 4 }), []);
});

test("a carousel import is a carousel project in the history", () => {
  assert.equal(projectKind(["carousel"]), "carousel");
  assert.equal(projectKind(["script", "carousel"]), "chat");
  assert.deepEqual(projectContains(["carousel"]), ["carousel"]);
});
