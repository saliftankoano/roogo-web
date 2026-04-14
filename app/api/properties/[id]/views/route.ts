import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getOrSyncUserByClerkId } from "@/lib/user-sync";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { resolveClerkId } from "@/lib/request-auth";
import {
  generateViewSessionId,
  inferDevicePlatform,
  VIEW_DEVICE_PLATFORM_HEADER_NAME,
  VIEWER_CITY_HEADER_NAME,
  VIEW_SESSION_COOKIE_NAME,
  VIEW_SESSION_HEADER_NAME,
  VIEW_SOURCE_HEADER_NAME,
} from "@/lib/view-tracking";

type RecordPropertyViewRow = {
  counted: boolean;
  views_count: number;
};

const INTERNAL_USER_TYPES = new Set(["staff", "founder", "admin"]);

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: propertyId } = await params;
    const clerkId = await resolveClerkId(req);
    const viewer = clerkId ? await getOrSyncUserByClerkId(clerkId) : null;

    const { data: property, error: propertyError } = await supabaseAdmin
      .from("properties")
      .select("id, agent_id, is_test, views_count")
      .eq("id", propertyId)
      .maybeSingle();

    if (propertyError || !property || property.is_test) {
      return NextResponse.json(
        {
          counted: false,
          viewsCount: 0,
          reason: "not_found",
        },
        { status: 404 },
      );
    }

    if (viewer?.user_type && INTERNAL_USER_TYPES.has(viewer.user_type)) {
      return NextResponse.json({
        counted: false,
        viewsCount: property.views_count ?? 0,
        reason: "internal_user",
      });
    }

    if (viewer?.id && property.agent_id === viewer.id) {
      return NextResponse.json({
        counted: false,
        viewsCount: property.views_count ?? 0,
        reason: "own_listing",
      });
    }

    const cookieStore = await cookies();
    const headerSessionId = req.headers.get(VIEW_SESSION_HEADER_NAME)?.trim();
    const cookieSessionId =
      cookieStore.get(VIEW_SESSION_COOKIE_NAME)?.value.trim() || "";
    const viewSessionId =
      headerSessionId || cookieSessionId || generateViewSessionId();
    const shouldSetCookie = !headerSessionId && !cookieSessionId;

    const viewerCity =
      req.headers.get(VIEWER_CITY_HEADER_NAME)?.trim() ||
      req.headers.get("x-vercel-ip-city")?.trim() ||
      null;
    const devicePlatform =
      req.headers.get(VIEW_DEVICE_PLATFORM_HEADER_NAME)?.trim() ||
      inferDevicePlatform(req.headers.get("user-agent"));
    const source =
      req.headers.get(VIEW_SOURCE_HEADER_NAME)?.trim() || "browse";

    const { data, error } = await supabaseAdmin.rpc("record_property_view", {
      p_property_id: propertyId,
      p_view_session_id: viewSessionId,
      p_user_id: viewer?.id ?? null,
      p_clerk_id: clerkId,
      p_device_platform: devicePlatform,
      p_source: source,
      p_viewer_city: viewerCity,
    });

    if (error) {
      console.error("Error recording property view:", error);
      return NextResponse.json(
        {
          counted: false,
          viewsCount: property.views_count ?? 0,
          error: "Failed to record property view",
        },
        { status: 500 },
      );
    }

    const result = (data as RecordPropertyViewRow[] | null)?.[0];
    const response = NextResponse.json({
      counted: result?.counted ?? false,
      viewsCount: result?.views_count ?? property.views_count ?? 0,
      ...(result?.counted === false ? { reason: "duplicate_session" } : {}),
    });

    if (shouldSetCookie) {
      response.cookies.set({
        name: VIEW_SESSION_COOKIE_NAME,
        value: viewSessionId,
        path: "/",
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      });
    }

    return response;
  } catch (error) {
    console.error("Error in property views API:", error);
    return NextResponse.json(
      {
        counted: false,
        viewsCount: 0,
        error: "Internal server error",
      },
      { status: 500 },
    );
  }
}
