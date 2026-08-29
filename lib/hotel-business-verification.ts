export const HOTEL_BUSINESS_DOCUMENTS_BUCKET = "hotel-business-documents";

export function normalizeRccmSubmission(
  input: Record<string, unknown>,
):
  | { error: string }
  | {
      value: {
        legal_name: string;
        rccm_number: string;
        tax_number: string | null;
        document_storage_path: string;
        document_mime_type: string | null;
      };
    } {
  const legalName = typeof input.legalName === "string" ? input.legalName.trim() : "";
  const rccmNumber =
    typeof input.rccmNumber === "string"
      ? input.rccmNumber.trim().toUpperCase().replace(/\s+/g, " ")
      : "";
  const taxNumber =
    typeof input.taxNumber === "string" ? input.taxNumber.trim().toUpperCase() : "";
  const documentStoragePath =
    typeof input.documentStoragePath === "string" ? input.documentStoragePath : "";
  const documentMimeType =
    typeof input.documentMimeType === "string" ? input.documentMimeType : null;

  if (legalName.length < 2 || legalName.length > 160) {
    return { error: "Invalid legal name" };
  }
  if (rccmNumber.length < 3 || rccmNumber.length > 80) {
    return { error: "Invalid RCCM number" };
  }
  if (!documentStoragePath) return { error: "RCCM document is required" };

  return {
    value: {
      legal_name: legalName,
      rccm_number: rccmNumber,
      tax_number: taxNumber || null,
      document_storage_path: documentStoragePath,
      document_mime_type: documentMimeType,
    },
  };
}
