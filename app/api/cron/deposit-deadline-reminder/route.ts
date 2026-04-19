import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { notifyUser } from "@/lib/push-notifications";

// Reminds owners before the 72h auto-release deadline. Runs hourly; each
// hold is only nudged once per bucket thanks to metadata bookkeeping.

const BUCKETS = [
  { key: "24h", hoursBefore: 24, toleranceHours: 1 },
  { key: "6h", hoursBefore: 6, toleranceHours: 1 },
];

interface Hold {
  id: string;
  owner_id: string;
  amount: number;
  review_deadline_at: string;
  metadata: Record<string, unknown> | null;
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = Date.now();
    const results: { bucket: string; notified: number; considered: number }[] = [];

    for (const bucket of BUCKETS) {
      const targetTime = now + bucket.hoursBefore * 60 * 60 * 1000;
      const toleranceMs = bucket.toleranceHours * 60 * 60 * 1000;
      const windowStart = new Date(targetTime - toleranceMs).toISOString();
      const windowEnd = new Date(targetTime + toleranceMs).toISOString();

      const { data: holds, error } = await supabaseAdmin
        .from("deposit_holds")
        .select("id, owner_id, amount, review_deadline_at, metadata")
        .eq("status", "held")
        .gte("review_deadline_at", windowStart)
        .lte("review_deadline_at", windowEnd)
        .limit(100);

      if (error) {
        console.error("Deadline reminder query error:", error);
        continue;
      }

      const candidates = (holds || []) as Hold[];
      let notified = 0;

      for (const hold of candidates) {
        const metadata = hold.metadata || {};
        const reminders =
          (metadata.deadlineReminders as Record<string, string>) || {};
        if (reminders[bucket.key]) continue; // already nudged

        const hoursLeft = bucket.hoursBefore;
        const title =
          hoursLeft >= 24
            ? "Caution: 24h pour décider"
            : "Caution: 6h avant remboursement auto";
        const body =
          hoursLeft >= 24
            ? "Confirmez que tout va bien ou déclarez un dommage avant l'échéance."
            : "Sans action de votre part, la caution sera rendue au locataire.";

        try {
          await notifyUser(hold.owner_id, "payments", title, body, {
            holdId: hold.id,
            type: "deposit_deadline_reminder",
            bucket: bucket.key,
          });
        } catch (err) {
          console.error("Deadline notify failed:", hold.id, err);
          continue;
        }

        const nextMetadata = {
          ...metadata,
          deadlineReminders: {
            ...reminders,
            [bucket.key]: new Date().toISOString(),
          },
        };

        await supabaseAdmin
          .from("deposit_holds")
          .update({ metadata: nextMetadata })
          .eq("id", hold.id);

        notified += 1;
      }

      results.push({
        bucket: bucket.key,
        considered: candidates.length,
        notified,
      });
    }

    return NextResponse.json({
      success: true,
      results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Deadline reminder cron failed";
    console.error("Deposit deadline reminder cron failed:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
