const KUULA_HOSTS = new Set(["kuula.co", "www.kuula.co"]);
const MAX_KUULA_URL_LENGTH = 2048;

const KUULA_DEFAULT_PARAMS = {
  logo: "1",
  info: "1",
  fs: "1",
  vr: "0",
  thumbs: "1",
  inst: "fr",
} as const;

export function isKuulaShareUrl(url: URL): boolean {
  return (
    KUULA_HOSTS.has(url.hostname.toLowerCase()) &&
    url.protocol === "https:" &&
    url.pathname.startsWith("/share/")
  );
}

export function normalizeKuulaVirtualTourUrl(
  input: string | null | undefined,
): string | null {
  if (input == null) return null;

  const trimmed = input.trim();
  if (!trimmed) return null;

  if (trimmed.length > MAX_KUULA_URL_LENGTH) {
    throw new Error("Le lien Kuula est trop long.");
  }

  if (/[<>]/.test(trimmed) || /<(script|iframe)\b/i.test(trimmed)) {
    throw new Error(
      "Collez uniquement le lien de partage Kuula, pas le code d'intégration.",
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("Le lien de visite virtuelle est invalide.");
  }

  if (!isKuulaShareUrl(parsed)) {
    throw new Error("Le lien doit être un lien de partage Kuula HTTPS valide.");
  }

  parsed.hash = "";
  return parsed.toString();
}

export function buildKuulaRenderUrl(normalizedUrl: string): string {
  const parsed = new URL(normalizedUrl);
  for (const [key, value] of Object.entries(KUULA_DEFAULT_PARAMS)) {
    if (!parsed.searchParams.has(key)) {
      parsed.searchParams.set(key, value);
    }
  }
  return parsed.toString();
}
