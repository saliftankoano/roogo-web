import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildChallengeSentence,
  codeAsWords,
  extractDigits,
  frenchDate,
  generateCode,
  matchChallenge,
} from "./consent.ts";
import { encodeWav, readWavInfo } from "./wav.ts";

describe("challenge sentence", () => {
  it("builds a sentence with the name, date and spoken code", () => {
    const sentence = buildChallengeSentence(
      "Salif Tankoano",
      "4821",
      new Date("2026-10-06T10:00:00Z"),
    );
    assert.match(sentence, /Je m'appelle Salif Tankoano/);
    assert.match(sentence, /6 octobre 2026/);
    assert.match(sentence, /quatre, huit, deux, un/);
    assert.equal(sentence.includes("—"), false);
  });

  it("generates four digits and spells them", () => {
    assert.match(generateCode(), /^[0-9]{4}$/);
    assert.equal(generateCode(() => 0.5), "5555");
    assert.equal(codeAsWords("0907"), "zéro, neuf, zéro, sept");
    assert.equal(frenchDate(new Date("2026-01-01T00:00:00Z")), "1 janvier 2026");
  });
});

describe("extractDigits", () => {
  it("reads digits written as numerals or as words", () => {
    assert.equal(extractDigits("mon code est 4 8 2 1"), "4821");
    assert.equal(extractDigits("Mon code est 4821."), "4821");
    assert.equal(extractDigits("quatre, huit, deux, un"), "4821");
  });
});

describe("matchChallenge", () => {
  const sentence = buildChallengeSentence(
    "Salif Tankoano",
    "4821",
    new Date("2026-10-06T10:00:00Z"),
  );

  it("accepts an honest reading, even with small recognition slips", () => {
    const heard =
      "Je m'appelle Salif Tankoano. J'autorise Kazedra Tech à créer une voix numérique à partir de ma voix le 6 octobre 2026. Mon code est 4821.";
    const result = matchChallenge(heard, sentence, "4821");
    assert.equal(result.ok, true);
    assert.equal(result.codeFound, true);
    assert.ok(result.score >= 0.9);

    const slip = heard.replace("Kazedra", "Kazedra's").replace("Tankoano", "Tankouano");
    assert.equal(matchChallenge(slip, sentence, "4821").ok, true);
  });

  it("rejects a wrong or missing code", () => {
    const heard =
      "Je m'appelle Salif Tankoano. J'autorise Kazedra Tech à créer une voix numérique à partir de ma voix le 6 octobre 2026. Mon code est 1234.";
    const result = matchChallenge(heard, sentence, "4821");
    assert.equal(result.ok, false);
    assert.equal(result.codeFound, false);
  });

  it("rejects a clip that does not contain the sentence", () => {
    const result = matchChallenge(
      "Bonjour je vous présente une belle maison 4821",
      sentence,
      "4821",
    );
    assert.equal(result.ok, false);
    assert.equal(result.codeFound, true);
    assert.ok(result.score < 0.75);
  });

  it("rejects an empty transcript", () => {
    assert.equal(matchChallenge("", sentence, "4821").ok, false);
  });
});

describe("wav", () => {
  it("writes a valid header and reports the duration", () => {
    const seconds = 12;
    const rate = 24000;
    const samples = new Float32Array(seconds * rate).fill(0.25);
    const wav = new Uint8Array(encodeWav(samples, rate));

    assert.equal(String.fromCharCode(...wav.slice(0, 4)), "RIFF");
    assert.equal(String.fromCharCode(...wav.slice(8, 12)), "WAVE");
    assert.equal(wav.length, 44 + seconds * rate * 2);

    const info = readWavInfo(wav);
    assert.equal(info.sampleRate, rate);
    assert.equal(info.channels, 1);
    assert.equal(info.bitsPerSample, 16);
    assert.ok(Math.abs(info.durationSeconds - seconds) < 0.001);
  });

  it("clamps out of range samples and rejects non-WAV data", () => {
    const wav = new Uint8Array(encodeWav(new Float32Array([2, -2, 0]), 24000));
    const view = new DataView(wav.buffer);
    assert.equal(view.getInt16(44, true), 32767);
    assert.equal(view.getInt16(46, true), -32768);
    assert.equal(readWavInfo(new Uint8Array(100)), null);
    assert.equal(readWavInfo(new Uint8Array([1, 2, 3])), null);
  });
});
