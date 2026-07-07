import { NextResponse } from "next/server";
// Service-role client: booking_slots_view is security_invoker and the bookings
// table is RLS deny-all, so the anon key sees zero rows through the view. The
// view itself only exposes (date, slot) — no PII reaches the client.
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? "";

  if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
    return NextResponse.json(
      { error: "Paramètres from/to invalides (format YYYY-MM-DD)." },
      { status: 400 },
    );
  }

  const { data, error } = await supabaseAdmin
    .from("booking_slots_view")
    .select("date, slot")
    .gte("date", from)
    .lte("date", to);

  if (error) {
    console.error("[visites-3d/availability] query failed", error);
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }

  const booked: Record<string, string[]> = {};
  for (const row of data ?? []) {
    const d = row.date as string;
    const s = row.slot as string;
    if (!booked[d]) booked[d] = [];
    booked[d].push(s);
  }

  return NextResponse.json(
    { booked },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
