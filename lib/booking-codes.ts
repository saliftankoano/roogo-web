import { randomBytes } from "crypto";

// Crockford base32: no 0/O or 1/I/L lookalikes, unambiguous when read out
// loud at a front desk or over the phone.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";

export function generateBookingCode(): string {
  const bytes = randomBytes(6);
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return `RG-${code}`;
}

export function normalizeBookingCode(input: string): string {
  // Accept 'RG-7XK2M9', 'RG7XK2M9', 'rg 7xk2m9', or the bare 6-char body.
  // Only strip the RG prefix from 8-char input: bodies are exactly 6 chars
  // and may themselves start with RG (R and G are in the alphabet), so a
  // 6-char 'RG34X7' is a body, not a prefixed code.
  const cleaned = input.trim().toUpperCase().replace(/[\s-]+/g, "");
  const body =
    cleaned.length === 8 && cleaned.startsWith("RG")
      ? cleaned.slice(2)
      : cleaned;
  return `RG-${body}`;
}

const INVITE_CODE_LENGTH = 8;

export function generateHotelInviteCode(): string {
  const bytes = randomBytes(INVITE_CODE_LENGTH);
  let code = "";
  for (let i = 0; i < INVITE_CODE_LENGTH; i++) {
    code += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return code;
}
