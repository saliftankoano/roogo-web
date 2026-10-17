import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  estimateJobCostUsd,
  FAL_ENDPOINTS,
  isAllowedEndpoint,
  isPosterFormat,
  POSTER_FORMATS,
  toolKind,
} from "./ai-tools.ts";
import {
  buildGreetingPrompt,
  buildPosterPrompt,
  cleanPosterLine,
  sceneKeys,
} from "./poster-prompt.ts";
import { comparePosterText } from "./poster-check.ts";
import { alignScriptToWords, buildCues, toSrt } from "./captions.ts";

describe("model allowlist", () => {
  it("allows only the four chosen endpoints", () => {
    for (const endpoint of Object.values(FAL_ENDPOINTS)) {
      assert.equal(isAllowedEndpoint(endpoint), true, endpoint);
    }
    assert.equal(isAllowedEndpoint("openai/gpt-image-2"), false);
    assert.equal(isAllowedEndpoint("fal-ai/anything-else"), false);
  });

  it("refuses banned video and lip-sync models even by name", () => {
    for (const bad of [
      "bytedance/seedance-2.0/image-to-video",
      "fal-ai/kling-video/v2.5-turbo/pro/image-to-video",
      "veed/fabric-1.0",
      "fal-ai/sync-lipsync/v2/pro",
    ]) {
      assert.equal(isAllowedEndpoint(bad), false, bad);
    }
  });

  it("maps tools to ledger kinds and validates formats", () => {
    assert.equal(toolKind("captions"), "transcription");
    assert.equal(toolKind("poster"), "image");
    assert.equal(isPosterFormat("4x5"), true);
    assert.equal(isPosterFormat("16x9"), false);
    assert.equal(POSTER_FORMATS["9x16"].height % 16, 0);
  });
});

describe("pricing", () => {
  it("quotes a conservative poster price and the other tools", () => {
    assert.ok(estimateJobCostUsd({ tool: "poster" }) >= 0.05);
    assert.ok(estimateJobCostUsd({ tool: "poster", quality: "low" }) < estimateJobCostUsd({ tool: "poster" }));
    assert.equal(estimateJobCostUsd({ tool: "greeting" }), 0.15);
    assert.equal(estimateJobCostUsd({ tool: "cutout" }), 0.018);
    assert.equal(estimateJobCostUsd({ tool: "captions", audioSeconds: 44 }), 0.008);
    assert.equal(estimateJobCostUsd({ tool: "captions", audioSeconds: 130 }), 0.024);
  });

  it("charges more for a taller story format than a square", () => {
    assert.ok(
      estimateJobCostUsd({ tool: "poster", format: "9x16" }) >
        estimateJobCostUsd({ tool: "poster", format: "1x1" }),
    );
  });
});

describe("poster prompts", () => {
  const lines = {
    headline: "Villa à vendre",
    place: "Tanghin",
    price: "40 000 000 FCFA",
    phone: "+226 67 00 61 16",
  };

  it("keeps the real photo and logo, forbids people and extra text", () => {
    const prompt = buildPosterPrompt(lines, "4:5");
    assert.match(prompt, /4:5/);
    assert.match(prompt, /exactly as it appears in the first photo/);
    assert.match(prompt, /second image as the Roogo logo/);
    assert.match(prompt, /No people/);
    assert.match(prompt, /"40 000 000 FCFA"/);
    assert.match(prompt, /#C96A2E/);
  });

  it("cleans text lines (no quotes, dashes, newlines) and caps length", () => {
    assert.equal(cleanPosterLine('«Villa» — neuve\n"ici"'), "Villa , neuve ici");
    assert.equal(cleanPosterLine("x".repeat(200)).length, 60);
  });

  it("builds a greeting prompt with no people or religious figures", () => {
    const prompt = buildGreetingPrompt(
      { headline: "Bon mois de novembre", subline: "Roogo vous accompagne" },
      "4:5",
      "sunrise",
    );
    assert.match(prompt, /Bon mois de novembre/);
    assert.match(prompt, /No people, no religious figures/);
    assert.ok(sceneKeys().includes("sunrise"));
    assert.match(buildGreetingPrompt({ headline: "a", subline: "b" }, "1:1", "unknown"), /Sahelian/);
  });
});

describe("poster text check", () => {
  const expected = {
    price: "40 000 000 FCFA",
    phone: "+226 67 00 61 16",
    place: "Tanghin",
  };

  it("passes when price, phone and place are read correctly", () => {
    const result = comparePosterText(
      ["Villa à vendre", "40 000 000 FCFA", "+226 67 00 61 16", "Roogo", "Tanghin"],
      expected,
    );
    assert.equal(result.ok, true);
    assert.equal(result.fields.length, 3);
  });

  it("flags a wrong price and a wrong phone number", () => {
    const result = comparePosterText(
      ["Villa à vendre", "4 000 000 FCFA", "+226 67 00 61 17", "Tanghin"],
      expected,
    );
    assert.equal(result.ok, false);
    const bad = result.fields.filter((f) => !f.found).map((f) => f.key);
    assert.deepEqual(bad.sort(), ["phone", "price"]);
  });

  it("is tolerant of spacing, accents and the +226 prefix", () => {
    assert.equal(
      comparePosterText(["67006116", "40000000", "TANGHIN"], expected).ok,
      true,
    );
    const g = comparePosterText(["Bon mois de novembre", "Roogo vous accompagne"], {
      lines: ["Bon mois de novembre", "Roogo vous accompagne"],
    });
    assert.equal(g.ok, true);
    assert.equal(comparePosterText(["Bon mois"], { lines: ["Bon mois de novembre"] }).ok, false);
  });
});

describe("subtitles from a voice-over", () => {
  // The speech-to-text hears the spoken form, the script shows the display form.
  const script = "Voici un appartement à Ouaga. Loyer 500 000 FCFA par mois.";
  const heard = [
    ["Voici", 0.2, 0.5],
    ["un", 0.55, 0.65],
    ["appartement", 0.7, 1.3],
    ["à", 1.35, 1.4],
    ["Ouaga", 1.45, 1.9],
    ["Loyer", 2.2, 2.6],
    ["cinq", 2.7, 2.9],
    ["cent", 2.95, 3.1],
    ["mille", 3.15, 3.4],
    ["francs", 3.45, 3.7],
    ["CFA", 3.75, 4.0],
    ["par", 4.1, 4.25],
    ["mois", 4.3, 4.7],
  ].map(([text, start, end]) => ({ text, start, end }));

  it("keeps the script's own words and borrows the timing", () => {
    const aligned = alignScriptToWords(script, heard);
    assert.deepEqual(
      aligned.map((w) => w.text),
      ["Voici", "un", "appartement", "à", "Ouaga.", "Loyer", "500", "000", "FCFA", "par", "mois."],
    );
    assert.equal(aligned[0].start, 0.2);
    // The words with no spoken twin get times between their neighbors.
    const fcfa = aligned[8];
    assert.ok(fcfa.start >= aligned[5].end - 1e-9 && fcfa.end <= aligned[9].start + 1e-9);
    // Times never go backwards.
    for (let i = 1; i < aligned.length; i += 1) {
      assert.ok(aligned[i].start >= aligned[i - 1].start - 1e-9, `word ${i}`);
    }
  });

  it("spreads time evenly when nothing matches", () => {
    const aligned = alignScriptToWords("alpha beta", [
      { text: "zzz", start: 1, end: 2 },
      { text: "qqq", start: 2, end: 3 },
    ]);
    assert.equal(aligned.length, 2);
    assert.ok(aligned[0].start >= 1 && aligned[1].end <= 3 + 1e-9);
  });

  it("builds short cues that split at sentences and write a valid SRT", () => {
    const cues = buildCues(alignScriptToWords(script, heard));
    assert.equal(cues.length >= 2, true);
    assert.match(cues[0].text, /Ouaga\.$/);
    for (const cue of cues) assert.ok(cue.text.length <= 42);
    const srt = toSrt(cues);
    assert.match(srt, /^1\n00:00:00,200 --> /);
    assert.match(srt, /\n\n2\n/);
    assert.equal(srt.includes("—"), false);
  });

  it("returns nothing for empty input", () => {
    assert.deepEqual(alignScriptToWords("", heard), []);
    assert.deepEqual(alignScriptToWords("bonjour", []), []);
  });
});
