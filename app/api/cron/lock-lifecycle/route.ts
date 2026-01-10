import { NextResponse } from "next/server";
import { getSupabaseClient } from "@/lib/user-sync";
import { notifyLockParties } from "@/lib/lock-notifications";

export async function GET(req: Request) {
  try {
    // 1. Auth check (optional, but recommended for crons)
    const authHeader = req.headers.get("authorization");
    if (
      process.env.NODE_ENV === "production" &&
      authHeader !== `Bearer ${process.env.CRON_SECRET}`
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getSupabaseClient();
    const now = new Date();

    // 2. Fetch all active locks
    const { data: locks, error: fetchError } = await supabase
      .from("property_locks")
      .select(
        `
        *,
        property:properties (
          id,
          address,
          agent_id
        )
      `
      )
      .eq("status", "active");

    if (fetchError) {
      console.error("Cron fetch error:", fetchError);
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    if (!locks || locks.length === 0) {
      return NextResponse.json({ message: "No active locks to process" });
    }

    const results = {
      processed: 0,
      notifications: 0,
      reopened: 0,
    };

    for (const lock of locks) {
      results.processed++;
      const lockedAt = new Date(lock.locked_at);
      const expiresAt = new Date(lock.expires_at);
      const diffDays = Math.floor(
        (now.getTime() - lockedAt.getTime()) / (1000 * 60 * 60 * 24)
      );

      const property = lock.property;
      if (!property) continue;

      // 3. Handle Auto-Reopen (Day 7+)
      if (now >= expiresAt) {
        console.log(`Lock expired for property ${property.id}. Reopening...`);

        // Update property status
        await supabase
          .from("properties")
          .update({ status: "en_ligne" })
          .eq("id", property.id);

        // Update lock status
        await supabase
          .from("property_locks")
          .update({ status: "expired", resolved_at: now.toISOString() })
          .eq("id", lock.id);

        // Notify parties
        await notifyLockParties(
          "DAY_7",
          property.agent_id,
          lock.renter_id,
          property.address || "Propriété",
          property.id
        );

        results.reopened++;
        continue; // Move to next lock
      }

      // 4. Handle Day 5 Notification
      if (diffDays >= 5 && !lock.notification_sent_day5) {
        await notifyLockParties(
          "DAY_5",
          property.agent_id,
          lock.renter_id,
          property.address || "Propriété",
          property.id
        );

        await supabase
          .from("property_locks")
          .update({ notification_sent_day5: true })
          .eq("id", lock.id);

        results.notifications++;
        continue;
      }

      // 5. Handle Day 3 Notification
      if (diffDays >= 3 && !lock.notification_sent_day3) {
        await notifyLockParties(
          "DAY_3",
          property.agent_id,
          lock.renter_id,
          property.address || "Propriété",
          property.id
        );

        await supabase
          .from("property_locks")
          .update({ notification_sent_day3: true })
          .eq("id", lock.id);

        results.notifications++;
        continue;
      }
    }

    return NextResponse.json({
      success: true,
      processed: results.processed,
      notificationsSent: results.notifications,
      reopenedProperties: results.reopened,
    });
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error("Cron execution error:", error);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
