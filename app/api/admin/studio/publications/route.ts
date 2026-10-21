import { NextResponse } from "next/server";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { getStaffOrFounder } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { addDays, isIsoDate, weekStart } from "@/lib/studio/publishing";
import {
  PUBLICATION_COLUMNS,
  metaStatus,
  tiktokPublishStatus,
  parsePostInput,
  publishSlots,
  roleOf,
  staffDirectory,
  toDtos,
  type PublicationRow,
} from "@/lib/studio/publishing-server";

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

// The publishing calendar: one week (Monday to Sunday, Ouagadougou time = UTC).
export async function GET(req: Request) {
  const staff = await getStaffOrFounder(req);
  if (!staff) return errorResponse("Forbidden", 403, req);

  const url = new URL(req.url);
  const asked = url.searchParams.get("week");
  const monday = weekStart(isIsoDate(asked) ? asked : new Date().toISOString().slice(0, 10));
  const { data, error } = await supabaseAdmin
    .from("studio_publications")
    .select(PUBLICATION_COLUMNS)
    .gte("scheduled_at", `${monday}T00:00:00.000Z`)
    .lt("scheduled_at", `${addDays(monday, 7)}T00:00:00.000Z`)
    .order("scheduled_at", { ascending: true });
  if (error) {
    console.error("Studio calendar: list failed", error.code);
    return errorResponse("Calendrier indisponible", 500, req);
  }

  // The founder's tray "À valider par vous": every waiting post, whatever the week.
  const role = roleOf(staff);
  const { data: waitingRows } =
    role === "founder"
      ? await supabaseAdmin.from("studio_publications").select(PUBLICATION_COLUMNS).eq("status", "a_valider").order("scheduled_at", { ascending: true }).limit(20)
      : { data: [] };
  const [posts, team, waiting] = await Promise.all([
    toDtos((data ?? []) as PublicationRow[]),
    staffDirectory(),
    toDtos((waitingRows ?? []) as PublicationRow[]),
  ]);
  return cors(
    NextResponse.json({
      week: monday,
      posts,
      slots: publishSlots(),
      meta: metaStatus(),
      tiktok: await tiktokPublishStatus(),
      me: { id: staff.id, role },
      team,
      waiting,
    }),
    req,
  );
}

// A hand-made post. It starts "à faire"; approval is a separate step.
export async function POST(req: Request) {
  const staff = await getStaffOrFounder(req);
  if (!staff) return errorResponse("Forbidden", 403, req);
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return errorResponse("Requête invalide", 400, req);

  const { values, error } = await parsePostInput(body, null);
  if (error) return errorResponse(error, 400, req);
  if (!values.media_type) return errorResponse("Choisissez le type de publication.", 400, req);
  if (!values.scheduled_at) return errorResponse("Choisissez une date de publication.", 400, req);

  const { data, error: insertError } = await supabaseAdmin
    .from("studio_publications")
    .insert({
      networks: ["facebook", "instagram"],
      ...values,
      status: "a_faire",
      assignee_id: values.assignee_id ?? staff.id,
      created_by: staff.id,
    })
    .select(PUBLICATION_COLUMNS)
    .single();
  if (insertError || !data) {
    console.error("Studio calendar: insert failed", insertError?.code);
    return errorResponse("Création impossible", 500, req);
  }
  const [post] = await toDtos([data as PublicationRow]);
  return cors(NextResponse.json({ post }), req);
}
