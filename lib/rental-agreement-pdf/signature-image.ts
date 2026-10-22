// Validation of the drawn signature sent by the app to
// POST /api/rental-agreements/[id]/sign. PNG only, 200 KB at most, with a
// real image header. Kept free of runtime imports so node --test can run it.

export const SIGNATURE_BUCKET = "agreement-signatures";
export const SIGNATURE_MAX_BYTES = 200 * 1024;
const MAX_SIDE = 4000;
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export type SignatureParseResult =
  | { ok: true; bytes: Buffer; width: number; height: number }
  | { ok: false; error: string };

/** Accepts "data:image/png;base64,..." or bare base64. */
export function parseSignaturePng(input: unknown): SignatureParseResult {
  if (typeof input !== "string" || input.trim() === "") {
    return { ok: false, error: "signature must be a non-empty PNG string" };
  }
  let payload = input.trim();
  const dataUrl = /^data:([^;,]+);base64,/i.exec(payload);
  if (dataUrl) {
    if (dataUrl[1].toLowerCase() !== "image/png") {
      return { ok: false, error: "signature must be a PNG image" };
    }
    payload = payload.slice(dataUrl[0].length);
  } else if (payload.startsWith("data:")) {
    return { ok: false, error: "signature data URL must be base64" };
  }
  payload = payload.replace(/\s+/g, "");
  // Reject before decoding anything clearly too large (base64 is 4/3 of bytes).
  if (payload.length > Math.ceil((SIGNATURE_MAX_BYTES * 4) / 3) + 4) {
    return { ok: false, error: "signature is larger than 200 KB" };
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(payload)) {
    return { ok: false, error: "signature is not valid base64" };
  }
  const bytes = Buffer.from(payload, "base64");
  if (bytes.length > SIGNATURE_MAX_BYTES) {
    return { ok: false, error: "signature is larger than 200 KB" };
  }
  if (
    bytes.length < 33 ||
    !PNG_MAGIC.every((byte, i) => bytes[i] === byte) ||
    bytes.toString("ascii", 12, 16) !== "IHDR"
  ) {
    return { ok: false, error: "signature must be a PNG image" };
  }
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (width < 1 || height < 1 || width > MAX_SIDE || height > MAX_SIDE) {
    return { ok: false, error: "signature image size is not valid" };
  }
  return { ok: true, bytes, width, height };
}

/** Storage path of a party's signature inside the private bucket. */
export function signaturePath(
  agreementId: string,
  role: "owner" | "renter",
): string {
  return `${agreementId}/${role}.png`;
}

/** Fits a width x height image into a box, keeping its aspect ratio. */
export function fitSignature(
  width: number,
  height: number,
  maxWidth = 140,
  maxHeight = 50,
): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: maxWidth, height: maxHeight };
  const scale = Math.min(maxWidth / width, maxHeight / height);
  return {
    width: Math.round(width * scale * 10) / 10,
    height: Math.round(height * scale * 10) / 10,
  };
}
