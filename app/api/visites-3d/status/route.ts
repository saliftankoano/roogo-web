import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { resolvePawaPayConfig } from "@/lib/pawapay-config";
import {
  finalizeVisit3dCompletion,
  type Visit3dBookingRow,
} from "@/lib/visit3d-callback";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: { depositId?: string };
  try {
    body = (await req.json()) as { depositId?: string };
  } catch {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }

  const depositId = body.depositId?.trim();
  if (!depositId) {
    return NextResponse.json({ error: "depositId manquant" }, { status: 400 });
  }

  const supabase = supabaseAdmin;

  const { data: row, error: fetchErr } = await supabase
    .from("bookings")
    .select(
      "id, date, slot, name, company, phone, address, room_count, total_amount, status, payment_status",
    )
    .eq("payment_deposit_id", depositId)
    .maybeSingle<Visit3dBookingRow>();

  if (fetchErr) {
    console.error("[visites-3d/status] db fetch", fetchErr);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json(
      { status: "NOT_FOUND", error: "Réservation introuvable" },
      { status: 404 },
    );
  }

  // Terminal DB state — short-circuit.
  if (row.payment_status === "completed") {
    return NextResponse.json({ status: "COMPLETED", bookingId: row.id });
  }
  if (row.payment_status === "failed" || row.payment_status === "cancelled") {
    return NextResponse.json({ status: "FAILED", bookingId: row.id });
  }

  // Still in flight — ask PawaPay.
  let pawa: { url: string; token: string };
  try {
    const cfg = resolvePawaPayConfig();
    pawa = { url: cfg.url, token: cfg.token };
  } catch (err) {
    console.error("[visites-3d/status] config", err);
    return NextResponse.json({ status: "PENDING" });
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${pawa.url}/v2/deposits/${depositId}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${pawa.token}`,
      },
    });
  } catch (err) {
    console.error("[visites-3d/status] upstream fetch", err);
    return NextResponse.json({ status: "PENDING" });
  }

  if (upstream.status === 404) {
    return NextResponse.json({ status: "PENDING" });
  }

  const text = await upstream.text();
  let result: unknown;
  try {
    result = JSON.parse(text);
  } catch {
    return NextResponse.json({ status: "PENDING" });
  }

  const payload = Array.isArray(result) ? result[0] : result;
  const statusRaw =
    (payload as { status?: string; depositStatus?: string })?.status ||
    (payload as { depositStatus?: string })?.depositStatus ||
    "";
  const status = String(statusRaw).toUpperCase();

  if (!status) {
    return NextResponse.json({ status: "PENDING" });
  }

  // Translate & persist if we just learned a new terminal state. The atomic
  // guard inside finalizeVisit3dCompletion ensures SMS/analytics fire exactly
  // once even when the webhook observes the same completion concurrently.
  if (status === "COMPLETED" && row.payment_status !== "completed") {
    const result = await finalizeVisit3dCompletion(row, depositId);
    if (result.error) {
      console.error("[visites-3d/status] finalize failed", result.error);
    }
    return NextResponse.json({ status: "COMPLETED", bookingId: row.id });
  }

  if (status === "FAILED" || status === "CANCELLED" || status === "REJECTED") {
    await supabase
      .from("bookings")
      .update({ status: "cancelled", payment_status: "failed" })
      .eq("id", row.id);
    return NextResponse.json({ status: "FAILED", bookingId: row.id });
  }

  if (status === "SUBMITTED" && row.payment_status !== "submitted") {
    await supabase
      .from("bookings")
      .update({ payment_status: "submitted" })
      .eq("id", row.id);
  }

  return NextResponse.json({ status: status || "PENDING" });
}
