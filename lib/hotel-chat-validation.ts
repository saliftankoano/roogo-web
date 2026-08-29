export function normalizeHotelChatBody(value: unknown) {
  if (typeof value !== "string") return null;
  const body = value.trim();
  return body.length >= 1 && body.length <= 2000 ? body : null;
}
