export const VIEW_SESSION_COOKIE_NAME = "roogo_view_session";
export const VIEW_SESSION_HEADER_NAME = "x-roogo-view-session";
export const VIEW_DEVICE_PLATFORM_HEADER_NAME = "x-roogo-device-platform";
export const VIEW_SOURCE_HEADER_NAME = "x-roogo-view-source";
export const VIEWER_CITY_HEADER_NAME = "x-roogo-viewer-city";
export const VIEW_TRACKED_PROPERTIES_SESSION_KEY =
  "roogo:web:session:viewed-properties";

export function generateViewSessionId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `rvs_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 12)}`;
}

export function inferDevicePlatform(userAgent: string | null) {
  if (!userAgent) {
    return "web";
  }

  const normalizedUserAgent = userAgent.toLowerCase();

  if (normalizedUserAgent.includes("android")) {
    return "android";
  }

  if (
    normalizedUserAgent.includes("iphone") ||
    normalizedUserAgent.includes("ipad") ||
    normalizedUserAgent.includes("ios")
  ) {
    return "ios";
  }

  return "web";
}
