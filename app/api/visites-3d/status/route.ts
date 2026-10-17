import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { resolvePawaPayConfig } from "@/lib/pawapay-config";
import {
  finalizeVisit3dCompletion,
  handleVisit3dDepositCallback,
  type Visit3dBookingRow,
} from "@/lib/visit3d-callback";
import {
  extractPaymentFailure,
  parsePawaPayDepositStatus,
} from "@/lib/payment-failures";
import { queuePaymentFailureNotification } from "@/lib/payment-failure-notifications";

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
      "id, date, slot, name, company, phone, address, room_count, total_amount, status, payment_status, payment_failure_code, payment_failure_reason, payment_payer_phone",
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
    if (row.payment_status === "failed") {
      await queuePaymentFailureNotification({
        depositId,
        failureCode: row.payment_failure_code || "UNSPECIFIED_FAILURE",
        payerPhone: row.payment_payer_phone || row.phone,
        locale: "fr",
        transactionType: "visit3d",
      });
    }
    return NextResponse.json({
      status: "FAILED",
      bookingId: row.id,
      failureCode: row.payment_failure_code || "UNSPECIFIED_FAILURE",
    });
  }

  const finalizeNotFound = async () => {
    const failureCode = "UNSPECIFIED_FAILURE";
    const update = await handleVisit3dDepositCallback(depositId, "FAILED", {
      failureReason: { failureCode },
    });
    if (update.error || update.dbError || !update.handled) {
      console.error(
        "[visites-3d/status] not-found finalize",
        update.error || update.dbError || "booking not handled",
      );
      return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
    }
    if (update.paymentStatus === "completed") {
      return NextResponse.json({ status: "COMPLETED", bookingId: row.id });
    }
    if (update.paymentStatus && update.paymentStatus !== "failed") {
      return NextResponse.json({ status: "PENDING", bookingId: row.id });
    }
    return NextResponse.json({
      status: "FAILED",
      bookingId: row.id,
      failureCode: update.failureCode || failureCode,
    });
  };

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

  // Only a successful status lookup can establish a terminal payment state.
  // A gateway/resource 404 is not PawaPay's v2 NOT_FOUND response.
  if (!upstream.ok) {
    console.error("[visites-3d/status] upstream lookup", {
      httpStatus: upstream.status,
    });
    return NextResponse.json({ status: "PENDING" });
  }

  let result: unknown;
  try {
    result = JSON.parse(await upstream.text());
  } catch {
    return NextResponse.json({ status: "PENDING" });
  }

  const checked = parsePawaPayDepositStatus(result);
  if (checked.lookupStatus === "NOT_FOUND") return finalizeNotFound();

  const payload = checked.deposit;
  const status = checked.status || "";

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
      return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
    }
    if (!result.finalized) {
      const { data: current, error: currentError } = await supabase
        .from("bookings")
        .select("payment_status, payment_failure_code")
        .eq("id", row.id)
        .single();
      if (currentError) {
        console.error("[visites-3d/status] race reload", currentError);
        return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
      }
      if (current?.payment_status === "failed") {
        return NextResponse.json({
          status: "FAILED",
          bookingId: row.id,
          failureCode: current.payment_failure_code || "UNSPECIFIED_FAILURE",
        });
      }
      if (current?.payment_status !== "completed") {
        return NextResponse.json({ status: "PENDING", bookingId: row.id });
      }
    }
    return NextResponse.json({ status: "COMPLETED", bookingId: row.id });
  }

  if (status === "FAILED" || status === "CANCELLED" || status === "REJECTED") {
    const failure = extractPaymentFailure(payload);
    const update = await handleVisit3dDepositCallback(
      depositId,
      status,
      payload,
    );
    if (update.error) {
      console.error("[visites-3d/status] failure finalize", update.error);
      return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
    }
    if (update.paymentStatus === "completed") {
      return NextResponse.json({ status: "COMPLETED", bookingId: row.id });
    }
    if (update.paymentStatus && update.paymentStatus !== "failed") {
      return NextResponse.json({ status: "PENDING", bookingId: row.id });
    }
    return NextResponse.json({
      status: "FAILED",
      bookingId: row.id,
      failureCode: update.failureCode || failure.code,
    });
  }

  if (status === "SUBMITTED" && row.payment_status !== "submitted") {
    await supabase
      .from("bookings")
      .update({ payment_status: "submitted" })
      .eq("id", row.id)
      .eq("payment_status", row.payment_status);
  }

  return NextResponse.json({ status: status || "PENDING" });
}
