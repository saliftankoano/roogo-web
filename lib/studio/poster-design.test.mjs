import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BRAND,
  HEADLINE_MAX,
  STYLE_FAMILIES,
  buildGreetingPrompt,
  chooseDesign,
  cleanPosterLine,
  cutAtWord,
  familiesFor,
  fitGreetingText,
  inferSubject,
  stripPictographs,
  wrapHeadline,
} from "./poster-prompt.ts";
import { comparePosterText } from "./poster-check.ts";

// The headline from Salif's screenshot (2026-10-23).
const BASKOURE =
  "OPPORTUNITÉ EXCEPTIONNELLE HORS LOTISSEMENT À BASKOURÉ 🔥 À SAISIR VITE, PARCELLE DE 300 M² AVEC TOUS LES PAPIERS EN RÈGLE";

/** A repeatable "random" that walks through the given values. */
function seq(...values) {
  let i = 0;
  return () => values[i++ % values.length];
}

const EMOJI = /[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/u;

describe("art direction library", () => {
  it("has at least 8 families with short French names and varied backgrounds", () => {
    assert.ok(STYLE_FAMILIES.length >= 8);
    const ids = new Set(STYLE_FAMILIES.map((f) => f.id));
    assert.equal(ids.size, STYLE_FAMILIES.length);
    for (const f of STYLE_FAMILIES) {
      assert.ok(f.label.length <= 16, f.label);
      assert.ok(f.visual.length > 40, f.id);
      assert.doesNotMatch(f.visual, /sunrise/i);
    }
    const backgrounds = new Set(STYLE_FAMILIES.flatMap((f) => f.backgrounds));
    assert.ok(backgrounds.size >= 3, "not always terracotta");
  });

  it("offers several families for every subject", () => {
    for (const subject of ["land", "house", "celebration", "hiring", "general"]) {
      assert.ok(familiesFor(subject).length >= 4, subject);
    }
    assert.ok(familiesFor("land").some((f) => f.id === "parcelle"));
    assert.ok(familiesFor("house").some((f) => f.id === "facade"));
    assert.ok(familiesFor("celebration").some((f) => f.id === "dan-fani"));
    assert.ok(familiesFor("hiring").some((f) => f.id === "bureau"));
    assert.ok(!familiesFor("land").some((f) => f.id === "facade"));
  });
});

describe("subject inference", () => {
  it("reads land, house, celebration, hiring and general", () => {
    assert.equal(inferSubject(BASKOURE), "land");
    assert.equal(inferSubject("Parcelle à vendre à Ouaga 2000"), "land");
    assert.equal(inferSubject("Terrain loti, 400 m²"), "land");
    assert.equal(inferSubject("Villa duplex à louer"), "house");
    assert.equal(inferSubject("Appartement meublé à Koulouba"), "house");
    assert.equal(inferSubject("Bonne fête de Tabaski"), "celebration");
    assert.equal(inferSubject("Joyeux Noël"), "celebration");
    assert.equal(inferSubject("Bonne semaine à tous"), "celebration");
    assert.equal(inferSubject("Bon mois de novembre"), "celebration");
    assert.equal(inferSubject("Nouvel an 2027"), "celebration");
    assert.equal(inferSubject("On recrute !"), "hiring");
    assert.equal(inferSubject("Recrutement : agent commercial"), "hiring");
    assert.equal(inferSubject("Roogo, la confiance avant tout"), "general");
  });

  it("lets the headline win over the second line", () => {
    assert.equal(inferSubject("Bonne fête", "Trouvez votre maison sur Roogo"), "celebration");
    assert.equal(inferSubject("Merci", "Trouvez votre maison sur Roogo"), "house");
  });
});

describe("family choice", () => {
  it("is deterministic with an injected random", () => {
    const a = chooseDesign({ subject: "land", ratio: "4:5", random: seq(0.1, 0.5, 0.9, 0.3, 0.7) });
    const b = chooseDesign({ subject: "land", ratio: "4:5", random: seq(0.1, 0.5, 0.9, 0.3, 0.7) });
    assert.deepEqual(a, b);
    assert.ok(familiesFor("land").some((f) => f.id === a.family));
  });

  it("only picks families that fit the subject when surprised", () => {
    for (let i = 0; i < 50; i++) {
      const r = i / 50;
      const d = chooseDesign({ subject: "hiring", ratio: "4:5", random: () => r });
      assert.ok(familiesFor("hiring").some((f) => f.id === d.family), d.family);
    }
  });

  it("never repeats the previous family for the same project", () => {
    const fit = familiesFor("land");
    for (const previous of fit) {
      for (let i = 0; i < 20; i++) {
        const r = i / 20;
        const d = chooseDesign({
          subject: "land",
          ratio: "4:5",
          recent: [{ family: previous.id, background: "terracotta" }],
          random: () => r,
        });
        assert.notEqual(d.family, previous.id);
      }
    }
  });

  it("walks through different families over a series of generations", () => {
    const recent = [];
    let random = seq(0, 0.99, 0.42, 0.13, 0.77, 0.58);
    for (let i = 0; i < 12; i++) {
      const d = chooseDesign({ subject: "general", ratio: "4:5", recent, random });
      if (recent[0]) assert.notEqual(d.family, recent[0].family);
      recent.unshift({ family: d.family, background: d.background });
    }
    assert.ok(new Set(recent.map((d) => d.family)).size >= 5);
    assert.ok(new Set(recent.map((d) => d.background)).size >= 2);
  });

  it("honours 'avoid' for « Une autre version » and an explicit choice", () => {
    const d = chooseDesign({ subject: "land", ratio: "4:5", avoid: ["parcelle"], random: () => 0 });
    assert.notEqual(d.family, "parcelle");
    const chosen = chooseDesign({
      subject: "land",
      ratio: "4:5",
      requested: "dan-fani",
      recent: [{ family: "dan-fani" }],
      random: () => 0,
    });
    assert.equal(chosen.family, "dan-fani");
  });

  it("never places text on the left of a 9:16 story", () => {
    for (let i = 0; i < 40; i++) {
      const r = i / 40;
      assert.notEqual(chooseDesign({ subject: "general", ratio: "9:16", random: () => r }).layout, "left");
    }
  });
});

describe("headline text", () => {
  it("strips emoji and pictographs", () => {
    assert.equal(stripPictographs("BASKOURÉ 🔥 À saisir 🇧🇫 👍🏾"), "BASKOURÉ À saisir");
    assert.equal(cleanPosterLine("Bonne fête ❤️"), "Bonne fête");
  });

  it("keeps up to 90 characters and never cuts mid-word", () => {
    const fitted = fitGreetingText({ headline: BASKOURE, subline: "" });
    assert.ok(fitted.headline.text.length <= HEADLINE_MAX);
    assert.equal(fitted.headline.shortened, true);
    assert.ok(BASKOURE.replace(" 🔥", "").startsWith(fitted.headline.text));
    const next = BASKOURE.replace(" 🔥", "").charAt(fitted.headline.text.length);
    assert.equal(next, " ", "cut lands on a space");
    assert.doesNotMatch(fitted.headline.text, /\s(À|DE|LA|ET)$/i, "no dangling small word");
    assert.match(fitted.notices.join(" "), /raccourci|trop long/);
    assert.match(fitted.notices.join(" "), /emoji/);
  });

  it("does not shorten a headline that fits and keeps it on at most 2 lines", () => {
    const head = "Opportunité exceptionnelle hors lotissement à Baskouré";
    const fitted = fitGreetingText({ headline: head });
    assert.equal(fitted.headline.text, head);
    assert.equal(fitted.headline.shortened, false);
    assert.equal(fitted.notices.length, 0);
    assert.equal(fitted.headline.lines.length, 2);
    assert.equal(fitted.headline.lines.join(" "), head);
    assert.deepEqual(wrapHeadline("Bon mois"), ["Bon mois"]);
    assert.deepEqual(wrapHeadline("Villa moderne à louer à Ouaga 2000"), ["Villa moderne", "à louer à Ouaga 2000"]);
  });

  it("cuts a long property line at a word boundary", () => {
    const line = cleanPosterLine("Villa moderne de quatre chambres avec piscine et jardin arboré à Ouaga 2000");
    assert.ok(line.length <= 60);
    assert.ok("Villa moderne de quatre chambres avec piscine et jardin arboré à Ouaga 2000".startsWith(line));
    assert.doesNotMatch(line, /\s(à|et|de)$/);
    assert.deepEqual(cutAtWord("court", 60), { text: "court", shortened: false });
  });
});

describe("free poster prompt", () => {
  const design = chooseDesign({ subject: "land", ratio: "4:5", random: () => 0 });

  it("contains no emoji and the fitted lines only", () => {
    const prompt = buildGreetingPrompt({ headline: BASKOURE, subline: "Roogo 🙏 vous accompagne" }, "4:5", design);
    assert.doesNotMatch(prompt, EMOJI);
    assert.match(prompt, /Roogo vous accompagne/);
    assert.doesNotMatch(prompt, /BASKOURÉ\s+À"/);
  });

  it("keeps the brand rules", () => {
    const prompt = buildGreetingPrompt({ headline: "Bon mois", subline: "" }, "1:1", design);
    assert.match(prompt, new RegExp(BRAND.terracotta));
    assert.match(prompt, /No people/);
    assert.match(prompt, /no religious figures/);
    assert.match(prompt, /No logo/);
    assert.match(prompt, /no rounded cards, no coloured edge bars, no frosted glass panels/);
    assert.doesNotMatch(prompt, /Under it/, "no empty second line");
  });

  it("differs across families for the same text", () => {
    const prompts = new Set(
      STYLE_FAMILIES.map((f) =>
        buildGreetingPrompt(
          { headline: "Bon mois", subline: "" },
          "4:5",
          chooseDesign({ subject: "general", ratio: "4:5", requested: f.id, random: () => 0 }),
        ),
      ),
    );
    assert.equal(prompts.size, STYLE_FAMILIES.length);
  });
});

describe("post-check against the typed text", () => {
  it("flags a shortened headline even when the image matches what was sent", () => {
    const fitted = fitGreetingText({ headline: BASKOURE });
    const result = comparePosterText([fitted.headline.text], {
      lines: [{ typed: BASKOURE, sent: fitted.headline.text }],
    });
    assert.equal(result.ok, false);
    assert.equal(result.fields[0].label, "Texte raccourci");
    assert.equal(result.fields[0].expected, BASKOURE);
    assert.match(result.fields[0].note, /pas le texte saisi en entier/);
  });

  it("passes when the image shows what was typed (emoji aside)", () => {
    const typed = "Bonne fête de Tabaski 🐑";
    const sent = fitGreetingText({ headline: typed }).headline.text;
    const result = comparePosterText(["Bonne fête de Tabaski"], { lines: [{ typed, sent }] });
    assert.equal(result.ok, true);
    assert.equal(result.fields[0].label, "Texte");
  });

  it("flags an image whose text differs from the typed text", () => {
    const result = comparePosterText(["Bonne fete de Tabsaki"], {
      lines: [{ typed: "Bonne fête de Tabaski", sent: "Bonne fête de Tabaski" }],
    });
    assert.equal(result.ok, false);
  });
});
