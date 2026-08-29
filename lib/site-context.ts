export const ROOGO_PRIMARY_HOST = "www.roogobf.com";
export const ROOGO_PRIMARY_ORIGIN = `https://${ROOGO_PRIMARY_HOST}`;
export const ROOGO_MEBO_HOST = "roogomebo.com";
export const ROOGO_MEBO_ORIGIN = `https://${ROOGO_MEBO_HOST}`;

const PRODUCTION_MEBO_HOSTS = new Set([
  ROOGO_MEBO_HOST,
  `www.${ROOGO_MEBO_HOST}`,
]);

const DEVELOPMENT_MEBO_HOSTS = new Set([
  "mebo.localhost",
  "roogomebo.localhost",
]);

export type RoogoSite = "immobilier" | "mebo";

export function normalizeRequestHost(rawHost: string | null | undefined) {
  const firstHost = rawHost?.split(",")[0]?.trim().toLowerCase() ?? "";
  const withoutTrailingDot = firstHost.replace(/\.$/, "");

  if (withoutTrailingDot.startsWith("[")) {
    const closingBracket = withoutTrailingDot.indexOf("]");
    return closingBracket >= 0
      ? withoutTrailingDot.slice(0, closingBracket + 1)
      : withoutTrailingDot;
  }

  return withoutTrailingDot.split(":")[0] ?? "";
}

export function getForwardedRequestHost(headers: Pick<Headers, "get">) {
  return normalizeRequestHost(
    headers.get("x-forwarded-host") ?? headers.get("host"),
  );
}

export function isProductionMeboHost(rawHost: string | null | undefined) {
  return PRODUCTION_MEBO_HOSTS.has(normalizeRequestHost(rawHost));
}

export function isMeboHost(rawHost: string | null | undefined) {
  const host = normalizeRequestHost(rawHost);
  return (
    PRODUCTION_MEBO_HOSTS.has(host) || DEVELOPMENT_MEBO_HOSTS.has(host)
  );
}

export function getRoogoSiteFromHost(
  rawHost: string | null | undefined,
): RoogoSite {
  return isMeboHost(rawHost) ? "mebo" : "immobilier";
}

export function isMeboPublicPath(pathname: string) {
  return (
    pathname === "/" ||
    pathname === "/mebo" ||
    pathname.startsWith("/plans") ||
    pathname.startsWith("/vendeurs") ||
    pathname.startsWith("/mebo/plans") ||
    pathname.startsWith("/mebo/vendeurs")
  );
}

export function getMeboRewritePath(pathname: string) {
  if (
    pathname === "/mebo" ||
    pathname.startsWith("/mebo/") ||
    pathname.startsWith("/api/") ||
    pathname === "/api" ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/connexion") ||
    pathname.startsWith("/inscription")
  ) {
    return null;
  }

  return pathname === "/" ? "/mebo" : `/mebo${pathname}`;
}
