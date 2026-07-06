import { notifyUser } from "@/lib/push-notifications";
import { redis } from "@/lib/rate-limit";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { SaleConversationRow } from "@/lib/sale-chat";

// New-message pushes for sale chat are coalesced so a burst of messages doesn't
// fan out one buzz per message, and are deferred during quiet hours. Visit
// confirmations are NOT routed through here — they push immediately (sale-visits.ts).

// Quiet hours in GMT (Burkina Faso is UTC+0): 22:00–07:00 → deferred to morning.
const QUIET_START_HOUR = 22;
const QUIET_END_HOUR = 7;
// Min seconds between two pushes to the same recipient for the same conversation.
const THROTTLE_SECONDS = 120;
const COUNT_TTL_SECONDS = 60 * 60 * 6; // pending-count window
const DEFERRED_SET_KEY = "salepush:deferred";

function isQuietHour(hourUtc: number) {
  return hourUtc >= QUIET_START_HOUR || hourUtc < QUIET_END_HOUR;
}

function messageBody(senderLabel: string, count: number) {
  if (count <= 1) return `${senderLabel} vous a envoyé un message`;
  return `${count} nouveaux messages de ${senderLabel}`;
}

/**
 * Coalesced sale-chat message notification.
 * - First message → immediate push.
 * - Bursts within THROTTLE_SECONDS → counted, not re-pushed (badge still updates in-app).
 * - During quiet hours → deferred to a Redis set drained by the morning cron.
 *
 * Falls back to a plain push when Redis isn't configured (e.g. local dev).
 */
export async function notifySaleMessageCoalesced(params: {
  recipientId: string;
  conversationId: string;
  senderLabel: string;
}) {
  const { recipientId, conversationId, senderLabel } = params;
  const nowHourUtc = new Date().getUTCHours();

  if (!redis) {
    // No Redis: best-effort single push, no coalescing.
    await notifyUser(
      recipientId,
      "messages",
      senderLabel,
      messageBody(senderLabel, 1),
      { type: "sale_message", conversationId },
    );
    return;
  }

  const countKey = `salepush:count:${conversationId}:${recipientId}`;
  const throttleKey = `salepush:throttle:${conversationId}:${recipientId}`;

  const count = await redis.incr(countKey);
  if (count === 1) await redis.expire(countKey, COUNT_TTL_SECONDS);

  // During quiet hours, stash for the morning flush and stop.
  if (isQuietHour(nowHourUtc)) {
    await redis.sadd(
      DEFERRED_SET_KEY,
      JSON.stringify({ recipientId, conversationId, senderLabel }),
    );
    return;
  }

  // Outside quiet hours: throttle. set NX succeeds only if no recent push.
  const acquired = await redis.set(throttleKey, "1", {
    nx: true,
    ex: THROTTLE_SECONDS,
  });
  if (!acquired) {
    // A push went out recently; this message is coalesced into the count.
    return;
  }

  await redis.del(countKey);
  await notifyUser(
    recipientId,
    "messages",
    senderLabel,
    messageBody(senderLabel, count),
    { type: "sale_message", conversationId },
  );
}

/**
 * A user sent a message to Roogo. Notify the team: the staff member already on the
 * thread if one is assigned, otherwise every staff/founder so the thread gets picked
 * up. Each recipient is coalesced/throttled like any other sale-chat push.
 */
export async function notifyStaffSaleMessage(params: {
  conversation: Pick<SaleConversationRow, "id" | "staff_id">;
  senderLabel: string;
}) {
  const { conversation, senderLabel } = params;

  let recipientIds: string[];
  if (conversation.staff_id) {
    recipientIds = [conversation.staff_id];
  } else {
    const { data: staffUsers } = await supabaseAdmin
      .from("users")
      .select("id")
      .in("user_type", ["staff", "founder"]);
    recipientIds = (staffUsers ?? []).map((s: { id: string }) => s.id);
  }

  await Promise.all(
    recipientIds.map((recipientId) =>
      notifySaleMessageCoalesced({
        recipientId,
        conversationId: conversation.id,
        senderLabel,
      }),
    ),
  );
}

/**
 * Drains the quiet-hours deferred set: one summarized push per recipient.
 * Called by the morning cron. Returns the number of pushes sent.
 */
export async function flushDeferredSaleNotifications(): Promise<number> {
  if (!redis) return 0;

  const members = (await redis.smembers(DEFERRED_SET_KEY)) as string[];
  if (!members || members.length === 0) return 0;

  // Group by recipient; summarize the distinct conversations.
  const byRecipient = new Map<string, Set<string>>();
  for (const raw of members) {
    try {
      const { recipientId, conversationId } = JSON.parse(raw) as {
        recipientId: string;
        conversationId: string;
      };
      const set = byRecipient.get(recipientId) ?? new Set<string>();
      set.add(conversationId);
      byRecipient.set(recipientId, set);
    } catch {
      // ignore malformed members
    }
  }

  let sent = 0;
  for (const [recipientId, conversations] of byRecipient) {
    const n = conversations.size;
    const anyConversation = [...conversations][0];
    const body =
      n === 1
        ? "Vous avez de nouveaux messages en attente"
        : `Vous avez des messages dans ${n} conversations`;
    const ok = await notifyUser(recipientId, "messages", "Roogo", body, {
      type: "sale_message",
      conversationId: anyConversation,
    });
    if (ok) sent += 1;
  }

  await redis.del(DEFERRED_SET_KEY);
  return sent;
}
