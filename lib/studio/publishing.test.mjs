import test from "node:test";
import assert from "node:assert/strict";
import {
  addBusinessDays,
  buildCaption,
  buildHashtags,
  canChangeStatus,
  canRetry,
  captionProblems,
  finalStatus,
  isIsoDate,
  isJpegUrl,
  mediaProblems,
  networksToPublish,
  parseSlots,
  planVisitCadence,
  shortDescription,
  slotToIso,
  statusAfterEdit,
  summarizeErrors,
  typeHashtag,
  weekDays,
  weekLabel,
  weekStart,
} from "./publishing.ts";

const labels = {
  city: (c) => (c === "ouaga" ? "Ouagadougou" : c === "bobo" ? "Bobo-Dioulasso" : c ?? ""),
  type: (t) => ({ maison: "Maison", terrain: "Terrain", villa: "Villa", appartement: "Appartement" })[t] ?? t ?? "",
  amount: (a) => Number(a).toLocaleString("fr-FR"),
};

const tanghin = {
  id: "p1",
  property_type: "maison",
  listing_type: "louer",
  frequence: "mensuel",
  quartier: "Tanghin",
  city: "ouaga",
  price: 150000,
  bedrooms: 3,
  bathrooms: 2,
  area: 300,
  amenities: ["climatisation"],
  dos_and_donts: null,
  interdictions: null,
  description: "Belle maison neuve — proche du barrage. Cour spacieuse et portail sécurisé. Quartier calme.",
  status: "en_ligne",
  sejour_minimum: null,
  capacite_max: null,
  caution_mois: 3,
  loyer_avance_mois: 3,
};

test("business days: a Thursday visit gives Friday, Monday, Wednesday, Thursday", () => {
  const thursday = "2026-10-08";
  assert.equal(addBusinessDays(thursday, 1), "2026-10-09"); // Friday
  assert.equal(addBusinessDays(thursday, 2), "2026-10-12"); // Monday
  assert.equal(addBusinessDays(thursday, 4), "2026-10-14"); // Wednesday
  assert.equal(addBusinessDays(thursday, 5), "2026-10-15"); // Thursday
  // A Saturday visit starts counting on Monday.
  assert.equal(addBusinessDays("2026-10-10", 1), "2026-10-12");
  // A Friday visit: J+1 is Monday.
  assert.equal(addBusinessDays("2026-10-09", 1), "2026-10-12");
  // Across a month end.
  assert.equal(addBusinessDays("2026-10-30", 1), "2026-11-02");
});

test("visit cadence: five posts on business days at the right slots", () => {
  const plan = planVisitCadence("2026-10-08", ["19:00", "12:00"]);
  assert.deepEqual(
    plan.map((p) => [p.step, p.scheduledAt, p.mediaType, p.networks.join("+")]),
    [
      ["presentation", "2026-10-09T19:00:00.000Z", "video", "facebook+instagram"],
      ["walkthrough", "2026-10-12T19:00:00.000Z", "video", "facebook+instagram"],
      ["carousel", "2026-10-14T12:00:00.000Z", "carousel", "facebook+instagram"],
      ["tour_3d_link", "2026-10-14T19:00:00.000Z", "text", "facebook"],
      ["ambiance_3d", "2026-10-15T19:00:00.000Z", "video", "facebook+instagram"],
    ],
  );
  assert.throws(() => planVisitCadence("2026-02-30"));
});

test("weeks run Monday to Sunday in Ouagadougou time (UTC)", () => {
  assert.equal(weekStart("2026-10-12"), "2026-10-12"); // Monday
  assert.equal(weekStart("2026-10-18"), "2026-10-12"); // Sunday
  assert.equal(weekStart("2026-10-14"), "2026-10-12");
  assert.deepEqual(weekDays("2026-10-12").slice(-1), ["2026-10-18"]);
  assert.equal(weekLabel("2026-10-12"), "Semaine du 12 au 18 oct. 2026");
  assert.equal(weekLabel("2026-09-28"), "Semaine du 28 sept. au 4 oct. 2026");
  assert.equal(isIsoDate("2026-10-12"), true);
  assert.equal(isIsoDate("2026-13-01"), false);
});

test("slots are configurable and default to 12:00 and 19:00", () => {
  assert.deepEqual(parseSlots(undefined), ["12:00", "19:00"]);
  assert.deepEqual(parseSlots("19:30, 08:00,bad,25:00"), ["08:00", "19:30"]);
  assert.deepEqual(parseSlots(""), ["12:00", "19:00"]);
  assert.equal(slotToIso("2026-10-12", "19:00"), "2026-10-12T19:00:00.000Z");
});

test("only a founder approves; staff hand over for validation", () => {
  assert.equal(canChangeStatus("staff", "a_faire", "a_valider"), true);
  assert.equal(canChangeStatus("staff", "a_valider", "valide"), false);
  assert.equal(canChangeStatus("staff", "a_faire", "valide"), false);
  assert.equal(canChangeStatus("founder", "a_valider", "valide"), true);
  assert.equal(canChangeStatus("founder", "a_faire", "valide"), true);
  assert.equal(canChangeStatus("founder", "valide", "publie"), false);
  assert.equal(canChangeStatus("founder", "publie", "a_valider"), false);
  assert.equal(canChangeStatus("staff", "valide", "a_valider"), true);
  assert.equal(canChangeStatus("staff", "a_valider", "a_faire"), true);
  assert.equal(canRetry("staff", "echec", true), true);
  assert.equal(canRetry("staff", "echec", false), false);
  assert.equal(canRetry("founder", "valide", true), false);
});

test("editing approved content sends it back for validation", () => {
  assert.equal(statusAfterEdit("valide", true), "a_valider");
  assert.equal(statusAfterEdit("echec", true), "a_valider");
  assert.equal(statusAfterEdit("valide", false), "valide");
  assert.equal(statusAfterEdit("a_faire", true), "a_faire");
});

test("hashtags: Roogo, quartier, city, type, ImmobilierBurkina", () => {
  assert.deepEqual(buildHashtags(tanghin, "Ouagadougou"), ["#Roogo", "#Tanghin", "#Ouagadougou", "#MaisonALouer", "#ImmobilierBurkina"]);
  assert.equal(typeHashtag("terrain", "vendre"), "#ParcelleAVendre");
  assert.equal(typeHashtag("villa", "louer"), "#VillaALouer");
  assert.deepEqual(
    buildHashtags({ property_type: "terrain", listing_type: "vendre", quartier: "Ouaga 2000", city: "ouaga" }, "Ouagadougou"),
    ["#Roogo", "#Ouaga2000", "#Ouagadougou", "#ParcelleAVendre", "#ImmobilierBurkina"],
  );
});

test("caption follows the house template", () => {
  const caption = buildCaption(tanghin, labels);
  const blocks = caption.split("\n\n");
  assert.equal(blocks[0], "MAISON À LOUER, TANGHIN");
  assert.equal(blocks[1], "Belle maison neuve, proche du barrage. Cour spacieuse et portail sécurisé.");
  assert.deepEqual(blocks[2].split("\n"), ["3 chambres", "2 salles de bain", "300 m²", "Prix : 150 000 FCFA par mois"]);
  assert.equal(blocks[3], "Avec Roogo, on s'occupe de tout, de la visite jusqu'au notaire.");
  assert.equal(blocks[4], "Appel ou WhatsApp : +226 67 00 61 16\nroogobf.com");
  assert.equal(blocks[5], "#Roogo #Tanghin #Ouagadougou #MaisonALouer #ImmobilierBurkina");
  assert.doesNotMatch(caption, /—|roogo\.bf/);
  assert.deepEqual(captionProblems(caption, { mediaType: "video" }), []);
});

test("caption for a plot for sale without description", () => {
  const caption = buildCaption(
    { ...tanghin, property_type: "terrain", listing_type: "vendre", quartier: "Balkuy", bedrooms: null, bathrooms: null, area: 500, amenities: [], description: "", price: 12000000 },
    labels,
  );
  assert.match(caption, /^TERRAIN À VENDRE, BALKUY\n\nUn terrain à vendre à Balkuy, disponible dès maintenant\.\n\n500 m²\nPrix : 12 000 000 FCFA\n\n/);
  assert.match(caption, /#ParcelleAVendre/);
});

test("short description keeps one or two sentences and never 'faux'", () => {
  assert.equal(shortDescription(""), "");
  assert.equal(shortDescription("Une villa"), "Une villa.");
  const long = "a ".repeat(200);
  assert.ok(shortDescription(long).length <= 223);
  const caption = buildCaption({ ...tanghin, description: "Maison avec faux plafond. Très propre." }, labels);
  assert.doesNotMatch(caption, /\bfaux\b/i);
});

test("caption problems block approval", () => {
  const codes = (text, opts = { mediaType: "video" }) => captionProblems(text, opts).map((p) => p.code);
  assert.deepEqual(codes(""), ["empty"]);
  assert.ok(codes("Belle maison — calme\nroogobf.com").includes("em-dash"));
  assert.ok(codes("Visitez roogo.bf").includes("wrong-domain"));
  assert.ok(codes("Faux plafond partout\nroogobf.com").includes("faux"));
  assert.ok(codes("Pas de site").includes("site-line"));
  assert.deepEqual(codes("Texte seul", { mediaType: "text" }), []);
  assert.ok(codes("Visite 3D : bientôt", { mediaType: "text", step: "tour_3d_link" }).includes("tour-link"));
  assert.deepEqual(codes("Visite 3D : https://roogobf.com/visites-3d/x", { mediaType: "text", step: "tour_3d_link" }), []);
});

test("media problems: networks, formats and counts", () => {
  const codes = (input) => mediaProblems(input).map((p) => p.code);
  assert.deepEqual(codes({ mediaType: "video", networks: ["facebook"], hasArtifact: true, artifactKind: "video", photoCount: 0 }), []);
  assert.ok(codes({ mediaType: "video", networks: ["facebook"], hasArtifact: false, photoCount: 0 }).includes("no-video"));
  assert.ok(codes({ mediaType: "text", networks: ["instagram"], hasArtifact: false, photoCount: 0 }).includes("ig-text"));
  assert.ok(codes({ mediaType: "carousel", networks: ["instagram"], hasArtifact: false, photoCount: 1 }).includes("carousel-size"));
  assert.ok(codes({ mediaType: "carousel", networks: ["instagram"], hasArtifact: false, photoCount: 11 }).includes("carousel-size"));
  assert.ok(codes({ mediaType: "image", networks: ["tiktok"], hasArtifact: true, artifactKind: "image", photoCount: 0 }).includes("tiktok"));
  // TikTok connected for publishing (2026-10-21): videos only.
  assert.deepEqual(codes({ mediaType: "video", networks: ["tiktok"], hasArtifact: true, artifactKind: "video", photoCount: 0, tiktokEnabled: true }), []);
  assert.ok(codes({ mediaType: "image", networks: ["tiktok"], hasArtifact: true, artifactKind: "image", photoCount: 0, tiktokEnabled: true }).includes("tiktok-video"));
  assert.ok(codes({ mediaType: "image", networks: [], hasArtifact: true, artifactKind: "image", photoCount: 0 }).includes("no-network"));
  assert.equal(isJpegUrl("https://x.supabase.co/a/b.jpg?token=1"), true);
  assert.equal(isJpegUrl("https://x/b.png"), false);
});

test("a retry never re-publishes a network that already succeeded", () => {
  const results = { facebook: { status: "published", remote_id: "1" }, instagram: { status: "failed", error: "Meta est indisponible pour le moment. Réessayez." } };
  assert.deepEqual(networksToPublish(["facebook", "instagram"], results), ["instagram"]);
  assert.deepEqual(networksToPublish(["facebook", "instagram", "tiktok"], results), ["instagram", "tiktok"]);
  assert.deepEqual(networksToPublish(["tiktok"], { tiktok: { status: "published", remote_id: "v_pub_1" } }), []);
  assert.equal(finalStatus(["facebook", "instagram"], results), "echec");
  assert.equal(finalStatus(["facebook"], results), "publie");
  assert.equal(finalStatus(["tiktok"], {}), "echec");
  assert.equal(summarizeErrors(results), "Instagram : Meta est indisponible pour le moment. Réessayez.");
});
