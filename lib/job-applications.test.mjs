import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  APPLICATIONS_CLOSED_MESSAGE,
  COMMERCIAL_IMMOBILIER_SLUG,
  applicationKey,
  buildApplicationSchema,
  formatTimeLeft,
  getJobRole,
  isAllowedVideoLink,
  isApplicationOpen,
  isDuplicateApplicationError,
  isUploadPathFor,
  normalizeAnyPhone,
  normalizeBurkinaPhone,
  resolveUploadMime,
  timeLeft,
  uploadSizeError,
} from "./job-applications.ts";

const role = getJobRole(COMMERCIAL_IMMOBILIER_SLUG);
const at = (iso) => new Date(iso);

describe("deadline", () => {
  it("is open until Wednesday 28 October 23:59:59 Ouagadougou (UTC) and closed from midnight", () => {
    assert.equal(isApplicationOpen(role, at("2026-10-22T10:00:00Z")), true);
    assert.equal(isApplicationOpen(role, at("2026-10-28T23:59:00Z")), true);
    assert.equal(isApplicationOpen(role, at("2026-10-28T23:59:59.999Z")), true);
    assert.equal(isApplicationOpen(role, at("2026-10-29T00:00:00Z")), false);
    assert.equal(isApplicationOpen(role, at("2026-11-02T08:00:00Z")), false);
  });

  it("counts days, hours and minutes left", () => {
    assert.deepEqual(timeLeft(role, at("2026-10-22T20:00:00Z")), { closed: false, days: 6, hours: 4, minutes: 0 });
    assert.equal(formatTimeLeft(timeLeft(role, at("2026-10-22T20:00:00Z"))), "Il reste 6 jours et 4 heures");
    assert.equal(formatTimeLeft(timeLeft(role, at("2026-10-28T00:00:00Z"))), "Il reste 1 jour");
    assert.equal(formatTimeLeft(timeLeft(role, at("2026-10-28T20:30:00Z"))), "Il reste 3 heures");
    assert.equal(formatTimeLeft(timeLeft(role, at("2026-10-28T22:59:00Z"))), "Il reste 1 heure");
    assert.equal(formatTimeLeft(timeLeft(role, at("2026-10-28T23:50:00Z"))), "Il reste 10 minutes");
    assert.equal(formatTimeLeft(timeLeft(role, at("2026-10-28T23:59:59Z"))), "Il reste 1 minute");
    assert.equal(formatTimeLeft(timeLeft(role, at("2026-10-29T00:00:00Z"))), APPLICATIONS_CLOSED_MESSAGE);
  });

  it("unknown roles have no config", () => {
    assert.equal(getJobRole("toString"), null);
    assert.equal(getJobRole("inconnu"), null);
  });
});

describe("phones", () => {
  it("normalizes Burkina numbers in the usual spellings", () => {
    for (const input of ["70123456", "70 12 34 56", "+226 70 12 34 56", "0022670123456", "226-70-12-34-56"]) {
      assert.equal(normalizeBurkinaPhone(input), "+22670123456", input);
    }
  });

  it("rejects numbers that are not Burkina numbers", () => {
    for (const input of ["", "7012345", "701234567", "+33612345678", "abcdefgh", "00000000"]) {
      assert.equal(normalizeBurkinaPhone(input), null, input);
    }
  });

  it("accepts an international reference phone", () => {
    assert.equal(normalizeAnyPhone("+33 6 12 34 56 78"), "+33612345678");
    assert.equal(normalizeAnyPhone("76 00 00 01"), "+22676000001");
    assert.equal(normalizeAnyPhone("612345678"), null);
  });
});

describe("one application per phone and role", () => {
  it("two spellings of one number are the same application", () => {
    assert.equal(applicationKey(COMMERCIAL_IMMOBILIER_SLUG, "70 12 34 56"), applicationKey(COMMERCIAL_IMMOBILIER_SLUG, "+22670123456"));
    assert.notEqual(applicationKey(COMMERCIAL_IMMOBILIER_SLUG, "70123456"), applicationKey("autre-poste", "70123456"));
    assert.equal(applicationKey(COMMERCIAL_IMMOBILIER_SLUG, "123"), null);
  });

  it("recognizes the unique violation from Postgres", () => {
    assert.equal(isDuplicateApplicationError({ code: "23505" }), true);
    assert.equal(isDuplicateApplicationError({ code: "23503" }), false);
    assert.equal(isDuplicateApplicationError(null), false);
  });
});

describe("uploads and links", () => {
  it("resolves mime types, from the extension when the browser gives none", () => {
    assert.equal(resolveUploadMime("cv", "application/pdf", "cv.pdf"), "application/pdf");
    assert.equal(resolveUploadMime("cv", "", "photo.JPEG"), "image/jpeg");
    assert.equal(resolveUploadMime("cv", "image/heic", "photo.heic"), null);
    assert.equal(resolveUploadMime("video", "", "vente.MOV"), "video/quicktime");
    assert.equal(resolveUploadMime("video", "video/3gpp", "vente.3gp"), null);
    assert.equal(resolveUploadMime("video", "application/pdf", "cv.pdf"), null);
  });

  it("enforces size limits", () => {
    assert.equal(uploadSizeError("cv", 9 * 1024 * 1024), null);
    assert.match(uploadSizeError("cv", 11 * 1024 * 1024), /10 Mo/);
    assert.equal(uploadSizeError("video", 150 * 1024 * 1024), null);
    assert.match(uploadSizeError("video", 151 * 1024 * 1024), /150 Mo/);
    assert.match(uploadSizeError("video", 0), /vide/);
  });

  it("only accepts paths issued for this role and kind", () => {
    const id = "3f2b9c1e-8a4d-4c2b-9e1f-0a1b2c3d4e5f";
    assert.equal(isUploadPathFor(COMMERCIAL_IMMOBILIER_SLUG, "video", `commercial-immobilier/video/${id}.mp4`), true);
    assert.equal(isUploadPathFor(COMMERCIAL_IMMOBILIER_SLUG, "cv", `commercial-immobilier/video/${id}.mp4`), false);
    assert.equal(isUploadPathFor(COMMERCIAL_IMMOBILIER_SLUG, "video", `autre/video/${id}.mp4`), false);
    assert.equal(isUploadPathFor(COMMERCIAL_IMMOBILIER_SLUG, "video", `commercial-immobilier/video/../${id}.mp4`), false);
  });

  it("accepts TikTok, YouTube, Drive and Facebook links only", () => {
    for (const ok of [
      "https://www.tiktok.com/@x/video/1",
      "https://vm.tiktok.com/abc/",
      "https://youtu.be/abc",
      "https://www.youtube.com/watch?v=abc",
      "https://drive.google.com/file/d/abc/view",
      "https://www.facebook.com/reel/1",
      "https://fb.watch/abc/",
    ]) {
      assert.equal(isAllowedVideoLink(ok), true, ok);
    }
    for (const bad of ["https://evil.com/tiktok.com", "https://tiktok.com.evil.com/x", "javascript:alert(1)", "pas un lien", ""]) {
      assert.equal(isAllowedVideoLink(bad), false, bad);
    }
  });
});

describe("application validation", () => {
  const schema = buildApplicationSchema(role);
  const id = "3f2b9c1e-8a4d-4c2b-9e1f-0a1b2c3d4e5f";
  const valid = {
    website: "",
    fullName: "Awa Ouédraogo",
    phone: "70 12 34 56",
    quartier: "Karpala",
    email: "",
    cvPath: `commercial-immobilier/cv/${id}.pdf`,
    sales: [
      { propertyType: "Villa", quartier: "Ouaga 2000", price: "45000000", year: "2025", buyerSource: "Recommandation d'un ancien client" },
    ],
    reference: { name: "Issa Kaboré", phone: "76 00 00 01", relation: "Ancien patron" },
    videoPath: `commercial-immobilier/video/${id}.mp4`,
    videoUrl: null,
    listingId: id,
    answers: {
      paymentPlan: "Je lui explique que la vente se fait au comptant.",
      fiveBuyers: "Groupes WhatsApp de la diaspora, églises, collègues.",
      otherAgency: "Non, je suis disponible à plein temps.",
    },
    canStartOnDate: true,
    availableFrom: null,
    consent: true,
  };

  it("accepts a complete application and normalizes it", () => {
    const result = schema.safeParse(valid);
    assert.equal(result.success, true, JSON.stringify(result.error?.issues));
    assert.equal(result.data.phone, "+22670123456");
    assert.equal(result.data.email, null);
    assert.equal(result.data.sales[0].price, 45000000);
    assert.equal(result.data.reference.phone, "+22676000001");
  });

  it("requires at least one sale and at most three", () => {
    assert.equal(schema.safeParse({ ...valid, sales: [] }).success, false);
    assert.equal(schema.safeParse({ ...valid, sales: Array(4).fill(valid.sales[0]) }).success, false);
  });

  it("requires a video file or an allowed link", () => {
    assert.equal(schema.safeParse({ ...valid, videoPath: null }).success, false);
    assert.equal(schema.safeParse({ ...valid, videoPath: null, videoUrl: "https://youtu.be/abc" }).success, true);
    assert.equal(schema.safeParse({ ...valid, videoPath: null, videoUrl: "https://exemple.com/v.mp4" }).success, false);
  });

  it("caps answers at 600 characters", () => {
    const long = "a".repeat(601);
    assert.equal(schema.safeParse({ ...valid, answers: { ...valid.answers, fiveBuyers: long } }).success, false);
    assert.equal(schema.safeParse({ ...valid, answers: { ...valid.answers, fiveBuyers: "a".repeat(600) } }).success, true);
  });

  it("asks for a later start date when the candidate cannot start on 2 November", () => {
    assert.equal(schema.safeParse({ ...valid, canStartOnDate: false }).success, false);
    assert.equal(schema.safeParse({ ...valid, canStartOnDate: false, availableFrom: "2026-11-02" }).success, false);
    assert.equal(schema.safeParse({ ...valid, canStartOnDate: false, availableFrom: "2026-11-16" }).success, true);
  });

  it("requires consent and a valid Burkina WhatsApp number", () => {
    assert.equal(schema.safeParse({ ...valid, consent: false }).success, false);
    assert.equal(schema.safeParse({ ...valid, phone: "+33612345678" }).success, false);
  });
});
