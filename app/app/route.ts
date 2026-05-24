import { NextRequest, NextResponse } from "next/server";

const IOS_APP_STORE_URL =
  "https://apps.apple.com/us/app/roogo-burkina/id6761714300";
const ANDROID_PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=com.kazedra.roogo";
const WEB_FALLBACK_URL = "https://www.roogobf.com/";

type Platform = "ios" | "android" | "other";

function detectPlatform(userAgent: string): Platform {
  const ua = userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return "ios";
  if (/android/.test(ua)) return "android";
  return "other";
}

function destinationFor(platform: Platform): string {
  switch (platform) {
    case "ios":
      return IOS_APP_STORE_URL;
    case "android":
      return ANDROID_PLAY_STORE_URL;
    default:
      return WEB_FALLBACK_URL;
  }
}

export function GET(req: NextRequest) {
  const userAgent = req.headers.get("user-agent") ?? "";
  const platform = detectPlatform(userAgent);
  const destination = destinationFor(platform);

  const response = NextResponse.redirect(destination, 302);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("X-Roogo-Redirect-Platform", platform);
  return response;
}
