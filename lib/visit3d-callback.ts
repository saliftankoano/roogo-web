import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  sendCustomerConfirmation,
  sendTeamNotification,
} from "@/lib/africastalking";
import { captureServerEvent } from "@/lib/posthog-server";

// Visites 3D bookings share the PawaPay callback endpoint with rent/listing
// transactions. Deposit IDs are UUIDs with unique indexes in both tables, so
// a depositId matches at most one of them — the callback route tries
// `transactions` first, then falls back to this handler.

export type Visit3dBookingRow = {
  id: string;
  date: string;
  slot: string;
  name: string;
  company: string | null;
  phone: string;
  address: string;
  room_count: number;
  total_amount: number;
  status: string;
  payment_status: string;
};

const TERMINAL_PAYMENT_STATUSES = ["completed", "failed", "cancelled", "refunded"];

/**
 * Atomically transition a booking to confirmed/completed and fire the
 * one-time side-effects (SMS + analytics).
 *
 * The webhook, the client status poll, and the initiate route can all observe
 * a deposit turn COMPLETED concurrently. The `.neq("payment_status",
 * "completed")` guard makes the DB the arbiter: exactly one caller gets the
 * updated row back and dispatches the side-effects; the others no-op.
 */
export async function finalizeVisit3dCompletion(
  row: Visit3dBookingRow,
  depositId: string,
): Promise<{ finalized: boolean; error?: string }> {
  const { data: updated, error: updErr } = await supabaseAdmin
    .from("bookings")
    .update({ status: "confirmed", payment_status: "completed" })
    .eq("id", row.id)
    .neq("payment_status", "completed")
    .select("id");

  if (updErr) {
    return { finalized: false, error: String(updErr) };
  }
  if (!updated || updated.length === 0) {
    // Another path already finalized this booking — its side-effects fired.
    return { finalized: false };
  }

  try {
    await Promise.all([
      sendCustomerConfirmation(row.phone, row.date, row.slot),
      sendTeamNotification({
        name: row.name,
        company: row.company,
        phone: row.phone,
        date: row.date,
        slot: row.slot,
        address: row.address,
        room_count: row.room_count,
        total_amount: row.total_amount,
      }),
    ]);
  } catch (err) {
    console.error("[visit3d] sms dispatch failed", err);
  }

  await captureServerEvent(depositId, "visit3d_payment_completed", {
    deposit_id: depositId,
    amount: row.total_amount,
    currency: "XOF",
    room_count: row.room_count,
    source: "visit3d_finalize",
  });

  return { finalized: true };
}

export async function handleVisit3dDepositCallback(
  depositId: string,
  pawaPayStatus: string,
): Promise<{
  handled: boolean;
  bookingId?: string;
  /** The bookings lookup itself failed — the caller must NOT ack the webhook
   *  as "not found", or PawaPay will never retry. */
  dbError?: string;
  error?: string;
}> {
  const status = pawaPayStatus.toUpperCase();

  let payment_status = "pending";
  if (status === "COMPLETED") payment_status = "completed";
  else if (status === "SUBMITTED") payment_status = "submitted";
  else if (status === "ACCEPTED") payment_status = "pending";
  else if (status === "FAILED" || status === "CANCELLED" || status === "REJECTED")
    payment_status = "failed";
  else if (status === "REFUNDED") payment_status = "refunded";

  const { data: row, error: fetchErr } = await supabaseAdmin
    .from("bookings")
    .select(
      "id, date, slot, name, company, phone, address, room_count, total_amount, status, payment_status",
    )
    .eq("payment_deposit_id", depositId)
    .maybeSingle<Visit3dBookingRow>();

  if (fetchErr) {
    return { handled: false, dbError: String(fetchErr) };
  }
  if (!row) {
    return { handled: false };
  }

  // Terminal-state guard: PawaPay delivers at-least-once and possibly out of
  // order. Never regress a settled booking (e.g. a redelivered SUBMITTED after
  // COMPLETED). The only terminal→terminal transition allowed is
  // completed → refunded.
  if (TERMINAL_PAYMENT_STATUSES.includes(row.payment_status)) {
    const isRefundOfCompleted =
      status === "REFUNDED" && row.payment_status === "completed";
    if (!isRefundOfCompleted) {
      return { handled: true, bookingId: row.id };
    }
  }

  if (status === "COMPLETED") {
    const result = await finalizeVisit3dCompletion(row, depositId);
    if (result.error) {
      return { handled: true, bookingId: row.id, error: result.error };
    }
    return { handled: true, bookingId: row.id };
  }

  const patch: Record<string, unknown> = { payment_status };
  if (payment_status === "failed" && row.status === "pending_payment") {
    patch.status = "cancelled";
  }

  const { error: updErr } = await supabaseAdmin
    .from("bookings")
    .update(patch)
    .eq("id", row.id);

  if (updErr) {
    return { handled: true, bookingId: row.id, error: String(updErr) };
  }

  return { handled: true, bookingId: row.id };
}
