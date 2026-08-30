import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeRccmSubmission } from "./hotel-business-verification.ts";
import { normalizeHotelChatBody } from "./hotel-chat-validation.ts";

describe("hotel booking chat validation", () => {
  it("trims valid messages", () => {
    assert.equal(normalizeHotelChatBody("  Bonjour, nous arrivons à 18 h.  "), "Bonjour, nous arrivons à 18 h.");
  });

  it("rejects empty and oversized messages", () => {
    assert.equal(normalizeHotelChatBody("   "), null);
    assert.equal(normalizeHotelChatBody("x".repeat(2001)), null);
  });
});

describe("hotel RCCM validation", () => {
  it("normalizes a complete business submission", () => {
    assert.deepEqual(
      normalizeRccmSubmission({
        legalName: "  Hôtel du Faso SARL ",
        rccmNumber: "bf oua 2026 b 1234",
        taxNumber: "  IFU-123 ",
        documentStoragePath: "hotel-1/document/rccm.pdf",
        documentMimeType: "application/pdf",
      }),
      {
        value: {
          legal_name: "Hôtel du Faso SARL",
          rccm_number: "BF OUA 2026 B 1234",
          tax_number: "IFU-123",
          document_storage_path: "hotel-1/document/rccm.pdf",
          document_mime_type: "application/pdf",
        },
      },
    );
  });

  it("requires legal identity, an RCCM number and a document", () => {
    assert.equal(normalizeRccmSubmission({}).error, "Invalid legal name");
    assert.equal(
      normalizeRccmSubmission({ legalName: "AB" }).error,
      "Invalid RCCM number",
    );
    assert.equal(
      normalizeRccmSubmission({ legalName: "AB", rccmNumber: "123" }).error,
      "RCCM document is required",
    );
  });
});
