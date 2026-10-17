import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildPropertyFacts,
  propertyTitle,
  toPropertySummary,
} from "./property-context.ts";
import {
  buildSystemPrompt,
  CONTACT_NUMBER,
  extractScript,
  stripScriptBlocks,
} from "./chat-prompt.ts";
import { encodeSse, openAiDelta, parseSseBuffer } from "./sse.ts";

const labels = {
  city: (c) => (c === "ouaga" ? "Ouagadougou" : (c ?? "")),
  type: (t) => (t === "villa" ? "Villa" : (t ?? "")),
  amount: (n) => Number(n).toLocaleString("fr-FR"),
};

const sale = {
  id: "p1",
  property_type: "villa",
  listing_type: "vendre",
  frequence: null,
  quartier: "Tanghin",
  city: "ouaga",
  price: 50000000,
  bedrooms: 3,
  bathrooms: 2,
  area: 300,
  amenities: ["Jardin", "Sécurité"],
  dos_and_donts: ["Pas de fêtes"],
  interdictions: [],
  description: "Belle villa calme.",
  status: "en_ligne",
  sejour_minimum: null,
  capacite_max: null,
  caution_mois: null,
  loyer_avance_mois: null,
  images: ["https://img/1.jpg"],
  // Fields that must never be read:
  seller_asking_price: 41234567,
  agent_phone: "+22670000000",
  agent_name: "Nom Secret",
};

describe("buildPropertyFacts", () => {
  it("builds French facts from the listing", () => {
    const facts = buildPropertyFacts(sale, labels);
    assert.match(facts, /Type de bien : Villa/);
    assert.match(facts, /Offre : À vendre/);
    assert.match(facts, /Lieu : Tanghin, Ouagadougou/);
    assert.match(facts, /Chambres : 3/);
    assert.match(facts, /Équipements : Jardin, Sécurité/);
    assert.match(facts, /Règles de la maison : Pas de fêtes/);
  });

  it("never exposes the seller's net price or the owner's details", () => {
    const facts = buildPropertyFacts(sale, labels);
    assert.equal(facts.includes("41234567"), false);
    assert.equal(facts.includes("41 234 567"), false);
    assert.equal(facts.includes("+22670000000"), false);
    assert.equal(facts.includes("Nom Secret"), false);
    // The public price is used instead.
    assert.match(facts, /50[\s  ]000[\s  ]000 FCFA/);
  });

  it("states rent frequency and omits empty fields", () => {
    const monthly = buildPropertyFacts(
      { ...sale, listing_type: "louer", frequence: "mensuel", price: 75000, bedrooms: null, amenities: [], dos_and_donts: [] },
      labels,
    );
    assert.match(monthly, /Offre : À louer au mois/);
    assert.match(monthly, /par mois/);
    assert.equal(monthly.includes("Chambres"), false);
    assert.equal(monthly.includes("Équipements"), false);

    const daily = buildPropertyFacts(
      { ...sale, listing_type: "louer", frequence: "journalier", price: 20000, sejour_minimum: 2 },
      labels,
    );
    assert.match(daily, /par nuit/);
    assert.match(daily, /Séjour minimum : 2 nuits/);
  });
});

describe("property summary and title", () => {
  it("makes a readable title and summary for the picker", () => {
    assert.equal(propertyTitle(sale, labels), "Villa à vendre, Tanghin");
    const summary = toPropertySummary(sale, labels);
    assert.equal(summary.image, "https://img/1.jpg");
    assert.equal(summary.live, true);
    assert.equal(summary.offer, "À vendre");
  });
});

describe("chat prompt", () => {
  it("includes the house rules and the closing line", () => {
    const prompt = buildSystemPrompt("Type de bien : Villa");
    assert.match(prompt, /N'invente rien/);
    assert.match(prompt, /roogobf\.com/);
    assert.ok(prompt.includes(CONTACT_NUMBER));
    assert.match(prompt, /Type de bien : Villa/);
  });

  it("asks for a property when none is selected", () => {
    assert.match(buildSystemPrompt(null), /Aucun bien/);
  });

  it("follows the copy rules (no em dash in the prompt)", () => {
    assert.equal(buildSystemPrompt("x").includes("—"), false);
  });
});

describe("script extraction", () => {
  const reply =
    "Voici une version.\n```script\nBienvenue chez Roogo.\n```\nDites-moi si ça va.";

  it("extracts the script and strips it from the bubble", () => {
    assert.equal(extractScript(reply), "Bienvenue chez Roogo.");
    assert.equal(stripScriptBlocks(reply), "Voici une version.\n\nDites-moi si ça va.");
  });

  it("takes the last block when there are several", () => {
    const two = "```script\nun\n```\nPuis\n```script\ndeux\n```";
    assert.equal(extractScript(two), "deux");
  });

  it("returns null without a block or with an empty one", () => {
    assert.equal(extractScript("Pas de script ici."), null);
    assert.equal(extractScript("```script\n\n```"), null);
  });
});

describe("streaming helpers", () => {
  it("round-trips events through the buffer parser", () => {
    const wire = encodeSse("delta", { text: "Bon" }) + encodeSse("done", { id: 1 });
    const { events, rest } = parseSseBuffer(wire);
    assert.deepEqual(events, [
      { event: "delta", data: { text: "Bon" } },
      { event: "done", data: { id: 1 } },
    ]);
    assert.equal(rest, "");
  });

  it("keeps an incomplete tail for the next chunk", () => {
    const half = encodeSse("delta", { text: "a" }) + "event: delta\ndata: {\"te";
    const { events, rest } = parseSseBuffer(half);
    assert.equal(events.length, 1);
    assert.match(rest, /^event: delta/);
  });

  it("reads OpenAI stream lines", () => {
    assert.equal(
      openAiDelta('data: {"choices":[{"delta":{"content":"Bon"}}]}'),
      "Bon",
    );
    assert.equal(openAiDelta("data: [DONE]"), "[DONE]");
    assert.equal(openAiDelta('data: {"choices":[{"delta":{}}]}'), null);
    assert.equal(openAiDelta(": keep-alive"), null);
  });
});
