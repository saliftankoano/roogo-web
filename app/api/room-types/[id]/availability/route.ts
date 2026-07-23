import { NextResponse } from "next/server";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { supabaseAdmin } from "@/lib/supabase-admin";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const url = new URL(req.url);
    const start = url.searchParams.get("start") ?? "";
    const end = url.searchParams.get("end") ?? "";

    if (!DATE_RE.test(start) || !DATE_RE.test(end) || end <= start) {
      return errorResponse("Invalid date range", 400, req);
    }

    const { data: remaining, error } = await supabaseAdmin.rpc(
      "room_type_min_available",
      {
        p_room_type_id: id,
        p_start: start,
        p_end: end,
        p_exclude_request_id: null,
      },
    );
    if (error) throw error;

    if (remaining === null || remaining === undefined) {
      return errorResponse("Room type not found", 404, req);
    }

    const available = Math.max(0, Number(remaining));
    return cors(
      NextResponse.json({ roomTypeId: id, start, end, available }),
      req,
    );
  } catch (error) {
    console.error("Error checking room availability:", error);
    return errorResponse("Internal server error", 500, req);
  }
}
