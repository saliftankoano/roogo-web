import assert from "node:assert/strict";
import { test } from "node:test";
import {
  propertyRequestSchema,
  propertyResponseSchema,
  responseReviewSchema,
  canRespondToPropertyRequest,
  isRequestAttachmentPath,
  commissionEstimate,
  PUBLIC_REQUEST_COLUMNS,
  OWN_RESPONSE_COLUMNS,
} from "./property-requests.ts";

const request = {
  title: "Villa familiale",
  description: "Villa avec trois chambres à Ouagadougou",
  listing_type: "vendre",
  property_type: "Villa",
  city: "Ouagadougou",
  budget_max: 45000000,
  commission_rate: 2.5,
  commission_terms:
    "Commission payable après la vente et encaissement des fonds.",
  customer_name: "Client privé",
  customer_contact: "+22670000000",
};
const response = {
  property_type: "Villa",
  city: "Ouagadougou",
  neighborhood: "Ouaga 2000",
  address: "Parcelle 12, section AB",
  asking_price: 42000000,
  area: 300,
  bedrooms: 3,
  bathrooms: 2,
  description: "Villa avec cour, terrasse et trois chambres ventilées.",
  document_types: ["Titre foncier"],
  contact_phone: "+226 70 00 00 00",
  request_updated_at: "2026-09-07T12:00:00.123456+00:00",
  terms_accepted: true,
};

test("staff must enter explicit commission terms and consistent budgets", () => {
  assert.equal(propertyRequestSchema.safeParse(request).success, true);
  for (const change of [
    { commission_rate: 0 },
    { commission_rate: 100.1 },
    { commission_rate: 2.555 },
    { commission_terms: "" },
    { budget_max: 0 },
    { budget_min: 50000000 },
    { customer_contact: "" },
  ]) {
    assert.equal(
      propertyRequestSchema.safeParse({ ...request, ...change }).success,
      false,
      JSON.stringify(change),
    );
  }
});
test("responses require complete dimensions, document declarations and acknowledged current terms", () => {
  assert.equal(propertyResponseSchema.safeParse(response).success, true);
  for (const change of [
    { area: 0 },
    { bedrooms: -1 },
    { bedrooms: 1.5 },
    { asking_price: Infinity },
    { description: "" },
    { document_types: [] },
    { document_types: ["Titre foncier", "Aucun document"] },
    { document_types: ["Autre document"] },
    { terms_accepted: false },
    { request_updated_at: "" },
    { contact_phone: "a phone number" },
  ]) {
    assert.equal(
      propertyResponseSchema.safeParse({ ...response, ...change }).success,
      false,
      JSON.stringify(change),
    );
  }
  assert.equal(
    propertyResponseSchema.safeParse({
      ...response,
      property_type: "Terrain",
      bedrooms: 0,
      bathrooms: 0,
      document_types: ["Aucun document"],
    }).success,
    true,
  );
});
test("respondents cannot inject commission rates, identities or review status", () => {
  const parsed = propertyResponseSchema.parse({
    ...response,
    commission_rate: 99,
    respondent_id: "someone-else",
    staff_notes: "private",
    status: "accepted",
  });
  for (const field of [
    "commission_rate",
    "respondent_id",
    "staff_notes",
    "status",
  ])
    assert.equal(field in parsed, false);
});
test("only owners and agents submit and private data is absent from mobile projections", () => {
  for (const role of [null, "renter", "staff", "founder", "hotel"])
    assert.equal(canRespondToPropertyRequest(role), false);
  for (const role of ["owner", "agent"])
    assert.equal(canRespondToPropertyRequest(role), true);
  for (const field of ["customer_name", "customer_contact", "internal_notes"])
    assert.equal(PUBLIC_REQUEST_COLUMNS.split(",").includes(field), false);
  assert.equal(OWN_RESPONSE_COLUMNS.split(",").includes("staff_notes"), false);
});
test("attachments must belong to the respondent and request", () => {
  const name = "01010101-0101-4101-8101-010101010101.pdf";
  assert.equal(
    isRequestAttachmentPath(`user/request/${name}`, "user", "request"),
    true,
  );
  for (const path of [
    `other/request/${name}`,
    `user/other/${name}`,
    `user/request/../${name}`,
    `user/request/${name}/evil`,
    "https://example.com/file.pdf",
  ])
    assert.equal(isRequestAttachmentPath(path, "user", "request"), false);
});
test("a published response needs an actual property id and cannot change terms", () => {
  assert.equal(
    responseReviewSchema.safeParse({ status: "listed", staff_notes: "" })
      .success,
    false,
  );
  assert.equal(
    responseReviewSchema.safeParse({ status: "accepted", staff_notes: "" })
      .success,
    true,
  );
  assert.equal(
    responseReviewSchema.parse({
      status: "contacted",
      staff_notes: "Called",
      commission_rate: 50,
    }).commission_rate,
    undefined,
  );
});
test("commission estimates use the specified price and percent with FCFA rounding", () => {
  assert.equal(commissionEstimate(42000000, 2.5), 1050000);
  assert.equal(commissionEstimate(175000, 10), 17500);
  assert.equal(commissionEstimate(333, 2.5), 8);
});
