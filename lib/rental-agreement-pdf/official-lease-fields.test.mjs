import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  amountInFrenchWords,
  buildOfficialLeaseFields,
  formatAmount,
  leaseMonths,
  splitFullName,
} from "./official-lease-fields.ts";

const base = {
  id: "3f2a9c1e-0000-4000-8000-000000000000",
  monthly_rent: 75000,
  caution_mois: 2,
  loyer_avance_mois: 3,
  property_frequence: "mensuel",
  start_date: "2026-11-01",
  end_date: "2027-10-31",
  dos_and_donts: ["Sortir les poubelles le lundi"],
  interdictions: ["Pas d'animaux"],
  terms_text: null,
  owner_signed_at: null,
  renter_signed_at: null,
  property: {
    quartier: "Ouaga 2000",
    city: "Ouagadougou",
    property_type: "villa",
    area: 300,
    bedrooms: 3,
    bathrooms: 2,
    amenities: ["WiFi", "Eau courante (ONEA)"],
  },
  owner: { full_name: "Awa Kaboré", phone: "+226 70 00 00 00" },
  renter: { full_name: "Jean-Baptiste Paul Ouédraogo", phone: null },
};

describe("official lease field mapping", () => {
  it("writes amounts in French words and digits", () => {
    assert.equal(formatAmount(1250000), "1 250 000");
    assert.equal(amountInFrenchWords(75000), "soixante-quinze mille");
    assert.equal(amountInFrenchWords(80000), "quatre-vingt mille");
    assert.equal(amountInFrenchWords(200000), "deux cent mille");
    assert.equal(amountInFrenchWords(171000), "cent soixante et onze mille");
    assert.equal(amountInFrenchWords(1500000), "un million cinq cent mille");
    assert.equal(amountInFrenchWords(91), "quatre-vingt-onze");
  });

  it("accepts both end-date conventions for whole months", () => {
    assert.equal(leaseMonths("2026-11-01", "2027-10-31"), 12);
    assert.equal(leaseMonths("2026-11-01", "2027-11-01"), 12);
    assert.equal(leaseMonths("2026-11-01", "2027-02-14"), null);
    assert.equal(leaseMonths("2026-11-01", null), null);
  });

  it("splits the stored first-then-last full name", () => {
    assert.deepEqual(splitFullName("Awa Kaboré"), {
      nom: "Kaboré",
      prenom: "Awa",
    });
    assert.deepEqual(splitFullName("Moussa"), { nom: "Moussa", prenom: null });
    assert.deepEqual(splitFullName("  "), { nom: null, prenom: null });
  });

  it("fills what the agreement knows", () => {
    const f = buildOfficialLeaseFields(base);
    assert.equal(f.bien.usage, "habitation");
    assert.equal(f.bien.commune, "Ouagadougou");
    assert.equal(f.bien.superficie, "300");
    assert.equal(
      buildOfficialLeaseFields({ ...base, property: { area: 1250.5 } }).bien
        .superficie,
      "1 250,5",
    );
    assert.equal(f.bien.eauCourante, true);
    assert.equal(f.bien.electricite, null);
    assert.equal(
      f.bien.autresEquipements,
      "3 chambres, 2 salles de bain, WiFi",
    );
    assert.equal(f.duree.duree, "un (1) an");
    assert.equal(f.loyer.mensuel, "soixante-quinze mille (75 000)");
    assert.equal(f.loyer.depot, "cent cinquante mille (150 000)");
    assert.equal(f.loyer.representant, "deux (2) mois de loyer");
    assert.equal(f.preneur.prenom, "Jean-Baptiste Paul");
    assert.equal(f.preneur.nom, "Ouédraogo");
    assert.ok(f.conditionsParticulieres.includes("Pas d'animaux."));
    assert.ok(
      f.conditionsParticulieres.includes("Sortir les poubelles le lundi."),
    );
    assert.match(f.conditionsParticulieres[0], /375 000 FCFA/);
    assert.equal(f.faitLe, null);
  });

  it("leaves blanks instead of placeholders when data is missing", () => {
    const f = buildOfficialLeaseFields({
      ...base,
      caution_mois: null,
      start_date: null,
      end_date: null,
      property: { property_type: "terrain", amenities: [] },
      owner: { full_name: "—" },
      renter: null,
    });
    const values = JSON.stringify(f);
    assert.ok(!values.includes("—"));
    assert.ok(!values.includes("undefined"));
    assert.equal(f.bien.usage, null);
    assert.equal(f.bien.superficie, null);
    assert.equal(f.bien.autresEquipements, null);
    assert.equal(f.loyer.depot, null);
    assert.equal(f.loyer.representant, null);
    assert.equal(f.duree.duree, null);
    assert.equal(f.bailleur.nom, null);
    assert.equal(f.preneur.pieceNumero, null);
    assert.equal(f.preneur.pieceDate, null);
    assert.equal(f.preneur.pieceLieu, null);
    assert.equal(f.bien.titreNumero, null);
    assert.equal(f.bien.titreDate, null);
    assert.equal(
      f.conditionsParticulieres[0],
      "Loyer d'avance : 3 mois, soit 225 000 FCFA, payable à la signature.",
    );
  });

  it("dates the contract once both parties signed", () => {
    const f = buildOfficialLeaseFields({
      ...base,
      owner_signed_at: "2026-10-30T09:00:00Z",
      renter_signed_at: "2026-10-28T09:00:00Z",
    });
    assert.equal(f.faitLe, "30/10/2026");
    assert.equal(f.signatures.preneur.signeLe, "28/10/2026");
    assert.equal(
      f.signatures.bailleur.mention,
      "Lu et approuvé. Signé électroniquement sur Roogo Burkina le 30/10/2026.",
    );
    assert.equal(f.signatures.preneur.image, null);
  });
});
