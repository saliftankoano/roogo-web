import test from "node:test";
import assert from "node:assert/strict";
import {
  CAPTION_CONTACT,
  canChangeStatus,
  canReturn,
  captionChecks,
  captionProblems,
  cleanReturnInput,
  finalizeCaption,
  networksLabel,
  normalizeHashtags,
  postText,
  publicationStage,
  slotLabel,
  stageLabel,
  stageStep,
  statusAfterEdit,
  submitProblems,
  suggestSlots,
} from "./publishing.ts";
import { buildDescriptionRequest, parseDescriptionOutput, requestDescription } from "./publication-ai.ts";

// --- Caption post-processing ----------------------------------------------

test("finalizeCaption replaces every em and en dash", () => {
  const { caption } = finalizeCaption({ caption: "Maison neuve — cour spacieuse – portail sécurisé.\n" + CAPTION_CONTACT });
  assert.ok(!/[—–]/.test(caption));
  assert.match(caption, /Maison neuve, cour spacieuse, portail sécurisé\./);
});

test("finalizeCaption adds the phone line and roogobf.com on its own line when missing", () => {
  const { caption } = finalizeCaption({ caption: "Maison à louer à Tanghin." });
  const lines = caption.split("\n");
  assert.equal(lines.at(-2), CAPTION_CONTACT);
  assert.equal(lines.at(-1), "roogobf.com");
  assert.deepEqual(captionChecks(caption, []), { site: true, phone: true, noEmDash: true, hashtags: 0 });
  assert.deepEqual(captionProblems(caption, { mediaType: "video" }), []);
});

test("finalizeCaption moves roogobf.com right under an existing phone line, once", () => {
  const input = "roogobf.com\nBelle villa.\nAppelez le 67 00 61 16\n\nÀ bientôt.\nroogobf.com";
  const { caption } = finalizeCaption({ caption: input });
  const lines = caption.split("\n");
  const phone = lines.findIndex((l) => l.includes("67 00 61 16"));
  assert.equal(lines[phone + 1], "roogobf.com");
  assert.equal(lines.filter((l) => l === "roogobf.com").length, 1);
  assert.ok(!caption.includes(CAPTION_CONTACT), "an existing phone line is kept, not duplicated");
});

test("finalizeCaption fixes roogo.bf", () => {
  const { caption } = finalizeCaption({ caption: "Tout sur roogo.bf\n" + CAPTION_CONTACT });
  assert.ok(!/roogo\.bf\b/.test(caption));
});

test("finalizeCaption takes hashtag lines out of the text, max 5, no accents", () => {
  const { caption, hashtags } = finalizeCaption({
    caption: `Maison à louer.\n${CAPTION_CONTACT}\n\n#Roogo #Ouagadougou #MaisonÀLouer\n#Tanghin #BurkinaFaso #EnPlus`,
    hashtags: ["Roogo"],
  });
  assert.ok(!caption.includes("#"));
  assert.deepEqual(hashtags, ["#Roogo", "#Ouagadougou", "#MaisonALouer", "#Tanghin", "#BurkinaFaso"]);
});

test("finalizeCaption keeps at most two emoji", () => {
  const { caption } = finalizeCaption({ caption: `Maison 🏡 neuve 🔑 au calme 🌳 près du barrage 💧\n${CAPTION_CONTACT}` });
  const count = [...caption.matchAll(/\p{Extended_Pictographic}/gu)].length;
  assert.equal(count, 2);
  assert.match(caption, /🏡/);
  assert.match(caption, /🔑/);
});

test("normalizeHashtags dedupes case-insensitively and drops empty tags", () => {
  assert.deepEqual(normalizeHashtags(["#roogo", "Roogo", "#", "Saint-Léon", "Ouaga 2000"]), ["#Roogo", "#SaintLeon", "#Ouaga2000"]);
});

test("postText is the description then the hashtags", () => {
  assert.equal(postText("Texte\nroogobf.com", ["#Roogo", "#Tanghin"]), "Texte\nroogobf.com\n\n#Roogo #Tanghin");
  assert.equal(postText("Texte", []), "Texte");
});

// --- Status transitions -----------------------------------------------------

test("publicationStage maps statuses to the card states", () => {
  assert.equal(publicationStage(null), "pret");
  assert.equal(publicationStage({ status: "a_faire", returnedAt: null }), "pret");
  assert.equal(publicationStage({ status: "a_faire", returnedAt: "2026-10-12T10:00:00Z" }), "renvoye");
  assert.equal(publicationStage({ status: "a_valider" }), "propose");
  assert.equal(publicationStage({ status: "valide" }), "programme");
  assert.equal(publicationStage({ status: "publie" }), "publie");
  assert.equal(publicationStage({ status: "echec" }), "echec");
  assert.equal(stageStep("pret"), 1);
  assert.equal(stageStep("programme"), 2);
  assert.equal(stageStep("publie"), 3);
});

test("stage labels follow the viewer's role", () => {
  assert.equal(stageLabel("propose", "staff"), "En attente de Salif");
  assert.equal(stageLabel("propose", "founder"), "À valider par vous");
  assert.equal(stageLabel("pret", "staff"), "Prête, pas encore planifiée");
  assert.equal(stageLabel("renvoye", "staff"), "À corriger");
});

test("only a founder sends back, and only a waiting post", () => {
  assert.equal(canReturn("founder", "a_valider"), true);
  assert.equal(canReturn("staff", "a_valider"), false);
  assert.equal(canReturn("founder", "valide"), false);
  assert.equal(canReturn("founder", "a_faire"), false);
});

test("a send-back needs a comment; tags are filtered to the four quick tags", () => {
  assert.equal(cleanReturnInput("  ", ["Son"]).error !== null, true);
  const ok = cleanReturnInput("Refaire le son — moto à 0:12", ["Son", "Son", "Autre", "Date"]);
  assert.equal(ok.error, null);
  assert.equal(ok.comment, "Refaire le son, moto à 0:12");
  assert.deepEqual(ok.tags, ["Son", "Date"]);
});

test("sending to the founder needs a description", () => {
  assert.equal(submitProblems("").length, 1);
  assert.equal(submitProblems("   \n").length, 1);
  assert.deepEqual(submitProblems("Maison"), []);
});

test("full flow: propose, approve, cancel, return, resend", () => {
  assert.equal(canChangeStatus("staff", "a_faire", "a_valider"), true);
  assert.equal(canChangeStatus("staff", "a_valider", "valide"), false);
  assert.equal(canChangeStatus("founder", "a_valider", "valide"), true);
  // "Annuler" right after "Valider et programmer".
  assert.equal(canChangeStatus("founder", "valide", "a_valider"), true);
  // Founder edits the description while it waits: it keeps waiting.
  assert.equal(statusAfterEdit("a_valider", true), "a_valider");
  // A team edit after approval sends it back to validation.
  assert.equal(statusAfterEdit("valide", true), "a_valider");
});

// --- Slots ------------------------------------------------------------------

test("suggestSlots recommends J+2 business days after the visit, last slot", () => {
  // Visit Thursday 8 Oct 2026, J+2 business days = Monday 12 Oct.
  const slots = suggestSlots({
    now: new Date("2026-10-10T09:00:00Z"),
    slots: ["12:00", "19:00"],
    visitDate: "2026-10-08",
    place: "Tanghin",
    taken: [{ scheduledAt: "2026-10-14T12:00:00.000Z", title: "Carrousel photos de Tanghin" }],
    count: 4,
  });
  assert.equal(slots[0].scheduledAt, "2026-10-12T19:00:00.000Z");
  assert.equal(slots[0].recommended, true);
  assert.equal(slots[0].hint, "Recommandé : J+2 de la visite de Tanghin");
  assert.deepEqual(slots.map((s) => s.scheduledAt), [
    "2026-10-12T19:00:00.000Z",
    "2026-10-13T12:00:00.000Z",
    "2026-10-13T19:00:00.000Z",
    "2026-10-14T12:00:00.000Z",
  ]);
  assert.equal(slots[3].taken, true);
  assert.equal(slots[3].hint, "Déjà pris : carrousel photos de tanghin");
});

test("suggestSlots without a usable visit recommends the next free slot", () => {
  const slots = suggestSlots({
    now: new Date("2026-10-14T13:00:00Z"),
    slots: ["12:00", "19:00"],
    visitDate: "2026-09-01",
    taken: [{ scheduledAt: "2026-10-15T12:00:00.000Z", title: "Photos" }],
  });
  assert.equal(slots[0].scheduledAt, "2026-10-15T12:00:00.000Z");
  assert.equal(slots[0].taken, true);
  assert.equal(slots[0].recommended, false);
  assert.equal(slots[1].recommended, true);
  assert.equal(slots.filter((s) => s.recommended).length, 1);
});

test("slot and network labels read like the design", () => {
  assert.equal(slotLabel("2026-10-12T19:00:00.000Z"), "Lundi 12 oct. à 19:00");
  assert.equal(networksLabel(["facebook", "instagram"]), "Facebook et Instagram");
  assert.equal(networksLabel(["instagram"]), "Instagram");
});

// --- AI description (OpenAI mocked, never called for real) -----------------

const input = {
  property: { title: "Maison à louer, Tanghin", offer: "À louer", place: "Tanghin", price: "100 000 FCFA / mois" },
  template: "Vidéo du bien (Visite POV)",
  script: "Bienvenue à Tanghin",
  voiceover: "Bienvenue à Tanghin",
  contactLine: CAPTION_CONTACT,
};

test("buildDescriptionRequest asks for strict JSON { caption, hashtags }", () => {
  const req = buildDescriptionRequest(input, "gpt-5-mini");
  assert.equal(req.model, "gpt-5-mini");
  assert.equal(req.text.format.type, "json_schema");
  assert.deepEqual(req.text.format.schema.required, ["caption", "hashtags"]);
  assert.match(req.input[0].content, /tiret long/);
  assert.match(req.input[1].content, /Tanghin/);
});

test("requestDescription posts to the Responses API and parses the JSON", async () => {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ output_text: JSON.stringify({ caption: "Maison neuve à Tanghin", hashtags: ["#Roogo"] }) }), { status: 200 });
  };
  const out = await requestDescription({ fetch, apiKey: "test-key", model: null }, input);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.openai.com/v1/responses");
  assert.equal(calls[0].init.headers.Authorization, "Bearer test-key");
  assert.deepEqual(out, { caption: "Maison neuve à Tanghin", hashtags: ["#Roogo"], model: "gpt-5-mini" });
});

test("requestDescription uses the model override", async () => {
  let body;
  const fetch = async (_url, init) => {
    body = JSON.parse(init.body);
    return new Response(JSON.stringify({ output: [{ content: [{ text: JSON.stringify({ caption: "x", hashtags: [] }) }] }] }), { status: 200 });
  };
  const out = await requestDescription({ fetch, apiKey: "k", model: "gpt-x" }, input);
  assert.equal(body.model, "gpt-x");
  assert.equal(out.model, "gpt-x");
});

test("requestDescription fails clearly without a key, on HTTP errors and on bad JSON", async () => {
  await assert.rejects(requestDescription({ fetch: async () => new Response("{}"), apiKey: undefined }, input), /OPENAI_API_KEY/);
  const origError = console.error;
  console.error = () => {};
  try {
    await assert.rejects(
      requestDescription({ fetch: async () => new Response(JSON.stringify({ error: { message: "nope" } }), { status: 429 }), apiKey: "k" }, input),
      /HTTP 429/,
    );
  } finally {
    console.error = origError;
  }
  assert.throws(() => parseDescriptionOutput({ output_text: "pas du json" }), /lisible/);
  assert.throws(() => parseDescriptionOutput({ output_text: JSON.stringify({ caption: " ", hashtags: [] }) }), /vide/);
});
