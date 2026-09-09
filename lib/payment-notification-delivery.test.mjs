import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { before, after, beforeEach, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const state = {
  sms: 0,
  push: 0,
  outcomeFailures: 0,
  smsOutcome: "accepted",
  pushOutcome: "accepted",
  context: null,
};
globalThis.__deliveryTest = state;
state.db = {
  async rpc(name, input) {
    const values = Object.values(input);
    const result = await db.query(
      `SELECT public.${name}(${values.map((_, i) => "$" + (i + 1)).join(",")}) AS value`,
      values,
    );
    return { data: result.rows[0].value, error: null };
  },
  from(table) {
    if (table !== "notification_deliveries") {
      const result = {
        data:
          table === "transactions"
            ? {
                id: "tx",
                user_id: "00000000-0000-0000-0000-000000000001",
                property_id: "property",
              }
            : table === "properties"
              ? { quartier: "test" }
              : [],
        error: null,
      };
      const q = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => result,
        then: (resolve) => Promise.resolve(result).then(resolve),
      };
      return q;
    }
    assert.equal(table, "notification_deliveries");
    let patch;
    const filters = [];
    const query = {
      update(value) {
        patch = value;
        return query;
      },
      eq(key, value) {
        filters.push([key, value]);
        return query;
      },
      select() {
        return query;
      },
      then(resolve, reject) {
        return (async () => {
          if (state.outcomeFailures > 0) {
            state.outcomeFailures--;
            return {
              data: null,
              error: { message: "Injected outcome write failure" },
            };
          }
          const entries = Object.entries(patch);
          const values = [
            ...entries.map(([, v]) => v),
            ...filters.map(([, v]) => v),
          ];
          const result = await db.query(
            `UPDATE notification_deliveries SET ${entries.map(([k], i) => k + "=$" + (i + 1)).join(",")}
             WHERE ${filters
               .map(
                 ([k], i) =>
                   (k === "metadata->>deliveryAttemptId"
                     ? "metadata->>'deliveryAttemptId'"
                     : k) +
                   "=$" +
                   (entries.length + i + 1),
               )
               .join(" AND ")} RETURNING id`,
            values,
          );
          return { data: result.rows, error: null };
        })().then(resolve, reject);
      },
    };
    return query;
  },
};
const mocks = {
  "next/server": "export const after = () => {};",
  "@/lib/supabase-admin":
    "export const supabaseAdmin = globalThis.__deliveryTest.db;",
  "@/lib/africastalking": `export const sendTransactionalSmsWithResult = async () => {
    globalThis.__deliveryTest.sms++; return globalThis.__deliveryTest.smsOutcome;
  };`,
  "@/lib/push-notifications": `export const getUserPushNotificationContext = async () => globalThis.__deliveryTest.context;
    export const removeUserPushTokens = async () => {};
    export const sendExpoPushNotificationsWithResult = async () => {
      const s = globalThis.__deliveryTest; s.push++;
      if (s.pushOutcome === 'throw') throw new Error('Lost response');
      return { accepted: s.pushOutcome === 'accepted', outcome: s.pushOutcome, invalidTokens: [] };
    };`,
  "@/lib/property-lock-finalization":
    "export const releaseMonthlyPropertyLockPayment = async () => {};",
  "@/lib/text-sanitize": "export const unescapeText = value => value;",
};
registerHooks({
  resolve(specifier, context, next) {
    if (mocks[specifier])
      return {
        url: "data:text/javascript," + encodeURIComponent(mocks[specifier]),
        shortCircuit: true,
      };
    if (specifier.startsWith("@/"))
      return {
        url: new URL("../" + specifier.slice(2) + ".ts", import.meta.url).href,
        shortCircuit: true,
      };
    return next(specifier, context);
  },
});
const { notifyPaymentFailure } =
  await import("./payment-failure-notifications.ts");
const { notifyMonthlyPropertyLockConflict } =
  await import("./property-lock-finalization.ts");
const {
  claimPaymentFailureDelivery,
  claimPaymentFailureSmsCooldown,
  beginPaymentFailureSend,
  updateNotificationDeliveryMetadata,
  claimRetryableNotificationDelivery,
  beginRetryableNotificationSend,
} = await import("./notification-deliveries.ts");
const input = {
  depositId: "deposit",
  failureCode: "INSUFFICIENT_BALANCE",
  payerPhone: "22600000000",
  transactionType: "visit3d",
};
const expire = () =>
  db.exec(
    "UPDATE notification_deliveries SET lease_expires_at = NOW() - INTERVAL '1 second'",
  );
const row = async () =>
  (
    await db.query(
      "SELECT * FROM notification_deliveries WHERE subject_id='deposit'",
    )
  ).rows[0];

before(async () => {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE transactions(id UUID); CREATE TABLE bookings(id UUID);
    CREATE TABLE notification_deliveries(
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL,
      notification_type TEXT, event_type TEXT, subject_id TEXT, metadata JSONB,
      sent_at TIMESTAMPTZ, UNIQUE(user_id, event_type, subject_id)
    );
  `);
  for (const file of [
    "068_payment_failure_notifications.sql",
    "072_payment_failure_send_boundary.sql",
    "073_conflict_notification_send_boundary.sql",
  ]) {
    await db.exec(
      readFileSync(
        new URL("../supabase/migrations/" + file, import.meta.url),
        "utf8",
      ),
    );
  }
});

const conflictInput = {
  userId: "00000000-0000-0000-0000-000000000001",
  notificationType: "payments",
  eventType: "payments.property_lock_conflict",
  subjectId: "deposit",
};
const notifyConflict = () => notifyMonthlyPropertyLockConflict("deposit");

test("accepted conflict push retries outcome persistence without resending", async () => {
  state.outcomeFailures = 1;
  await notifyConflict();
  assert.equal((await row()).delivery_status, "sent");
  await expire();
  await notifyConflict();
  assert.equal(state.push, 1);
});

test("persistent conflict outcome-write failure cannot reclaim an accepted send", async () => {
  state.outcomeFailures = Infinity;
  await notifyConflict();
  assert.equal((await row()).delivery_status, "sending");
  await expire();
  await notifyConflict();
  assert.equal(state.push, 1);
});

for (const outcome of ["unknown", "throw"]) {
  test(`${outcome} conflict push is never resent`, async () => {
    state.pushOutcome = outcome;
    await notifyConflict();
    assert.equal((await row()).delivery_status, "uncertain");
    await expire();
    await notifyConflict();
    assert.equal(state.push, 1);
  });
}

test("definitively rejected conflict pushes remain retryable", async () => {
  state.pushOutcome = "rejected";
  await notifyConflict();
  assert.equal((await row()).delivery_status, "failed");
  await expire();
  state.pushOutcome = "accepted";
  await notifyConflict();
  assert.equal((await row()).delivery_status, "sent");
  assert.equal(state.push, 2);
});

test("concurrent conflict polling and callbacks send one push", async () => {
  await Promise.all([notifyConflict(), notifyConflict()]);
  assert.equal(state.push, 1);
});

test("conflict context outages retry, but opt-outs and no tokens send nothing", async () => {
  state.context = { status: "retry" };
  await notifyConflict();
  assert.equal((await row()).delivery_status, "failed");
  await expire();
  state.context = {
    status: "ready",
    context: { enabled: false, locale: "fr", tokens: ["token"] },
  };
  await notifyConflict();
  assert.equal((await row()).metadata.reason, "push_disabled");
  assert.equal(state.push, 0);
  await db.exec("TRUNCATE notification_deliveries");
  state.context.context = { enabled: true, locale: "fr", tokens: [] };
  await notifyConflict();
  assert.equal((await row()).metadata.reason, "missing_token");
  assert.equal(state.push, 0);
});

test("expired conflict workers cannot send or overwrite the newer attempt", async () => {
  const old = await claimRetryableNotificationDelivery(conflictInput);
  await expire();
  const current = await claimRetryableNotificationDelivery(conflictInput);
  assert.equal(
    await beginRetryableNotificationSend(
      conflictInput.userId,
      conflictInput.eventType,
      "deposit",
      old,
    ),
    false,
  );
  assert.equal(
    await updateNotificationDeliveryMetadata({
      ...conflictInput,
      attemptId: old,
      metadata: {},
      deliveryStatus: "failed",
    }),
    false,
  );
  assert.equal(
    await beginRetryableNotificationSend(
      conflictInput.userId,
      conflictInput.eventType,
      "deposit",
      current,
    ),
    true,
  );
  assert.equal(
    await beginRetryableNotificationSend(
      "00000000-0000-0000-0000-000000000002",
      conflictInput.eventType,
      "deposit",
      current,
    ),
    false,
  );
  assert.equal((await row()).metadata.deliveryAttemptId, current);
});

test("conflict migration protects legacy pending and failed sends and restricts RPC access", async () => {
  for (const status of ["pending", "failed"])
    await db.query(
      "INSERT INTO notification_deliveries(user_id,event_type,subject_id,metadata,delivery_status) VALUES ($1,$2,$3,'{}',$4)",
      [conflictInput.userId, conflictInput.eventType, status, status],
    );
  await db.exec(
    readFileSync(
      new URL(
        "../supabase/migrations/073_conflict_notification_send_boundary.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  assert.ok(
    (
      await db.query("SELECT delivery_status FROM notification_deliveries")
    ).rows.every((row) => row.delivery_status === "uncertain"),
  );
  for (const role of ["anon", "authenticated"])
    assert.equal(
      (
        await db.query(
          "SELECT has_function_privilege($1,'begin_retryable_notification_send(uuid,text,text,uuid)','EXECUTE') AS allowed",
          [role],
        )
      ).rows[0].allowed,
      false,
    );
});
after(() => db.close());
beforeEach(async () => {
  await db.exec("TRUNCATE notification_deliveries");
  Object.assign(state, {
    sms: 0,
    push: 0,
    outcomeFailures: 0,
    smsOutcome: "accepted",
    pushOutcome: "accepted",
    context: {
      status: "ready",
      context: { enabled: true, locale: "en", tokens: ["token"] },
    },
  });
});

test("accepted SMS retries its outcome write without resending", async () => {
  state.outcomeFailures = 1;
  assert.equal((await notifyPaymentFailure(input)).delivered, true);
  assert.equal((await row()).delivery_status, "sent");
  await expire();
  assert.equal((await notifyPaymentFailure(input)).reason, "duplicate");
  assert.equal(state.sms, 1);
});

test("persistent outcome-write failure cannot be reclaimed after sending", async () => {
  state.outcomeFailures = Infinity;
  await notifyPaymentFailure(input);
  assert.equal((await row()).delivery_status, "sending");
  await expire();
  assert.equal((await notifyPaymentFailure(input)).reason, "duplicate");
  assert.equal(state.sms, 1);
});

test("uncertain SMS does not resend and still suppresses matching SMS cooldown", async () => {
  state.smsOutcome = "unknown";
  assert.equal((await notifyPaymentFailure(input)).reason, "sms_unknown");
  assert.equal((await row()).delivery_status, "uncertain");
  await expire();
  assert.equal((await notifyPaymentFailure(input)).reason, "duplicate");
  assert.equal(
    (await notifyPaymentFailure({ ...input, depositId: "another" })).reason,
    "sms_cooldown",
  );
  assert.equal(state.sms, 1);
});

test("definite rejection releases SMS claim and can be retried", async () => {
  state.smsOutcome = "rejected";
  await notifyPaymentFailure(input);
  assert.equal((await row()).delivery_status, "failed");
  assert.equal((await row()).sms_claimed_at, null);
  await expire();
  state.smsOutcome = "accepted";
  assert.equal((await notifyPaymentFailure(input)).delivered, true);
  assert.equal(state.sms, 2);
});

for (const outcome of ["accepted", "unknown"]) {
  test(`a ${outcome} push never becomes a second push or an SMS fallback`, async () => {
    state.pushOutcome = outcome;
    state.outcomeFailures = Infinity;
    const pushInput = {
      ...input,
      userId: "00000000-0000-0000-0000-000000000001",
    };
    await notifyPaymentFailure(pushInput);
    await expire();
    await notifyPaymentFailure(pushInput, { fallbackToSmsOnPushFailure: true });
    assert.equal(state.push, 1);
    assert.equal(state.sms, 0);
  });
}

test("expired workers cannot begin sending or overwrite the next lease's outcome", async () => {
  const reservation = {
    notificationType: "payments",
    eventType: "payments.failed",
    subjectId: "deposit",
  };
  const oldAttempt = await claimPaymentFailureDelivery(reservation);
  await expire();
  const newAttempt = await claimPaymentFailureDelivery(reservation);
  assert.notEqual(oldAttempt, newAttempt);
  assert.equal(
    await claimPaymentFailureSmsCooldown({
      subjectId: "deposit",
      phoneHash: "hash",
      failureCode: "INSUFFICIENT_BALANCE",
      since: new Date(Date.now() - 900000),
      attemptId: oldAttempt,
    }),
    false,
  );
  assert.equal((await row()).sms_claimed_at, null);
  assert.equal(
    await beginPaymentFailureSend("deposit", oldAttempt, "sms"),
    false,
  );
  assert.equal(
    await updateNotificationDeliveryMetadata({
      ...reservation,
      attemptId: oldAttempt,
      metadata: {},
      deliveryStatus: "failed",
    }),
    false,
  );
  assert.equal(
    await beginPaymentFailureSend("deposit", newAttempt, "sms"),
    true,
  );
  await expire();
  assert.equal(await claimPaymentFailureDelivery(reservation), false);
});

test("concurrent webhook and polling send one notification", async () => {
  await Promise.all([notifyPaymentFailure(input), notifyPaymentFailure(input)]);
  assert.equal(state.sms, 1);
});

test("a definitively rejected push can fall back to SMS on a later attempt", async () => {
  const pushInput = {
    ...input,
    userId: "00000000-0000-0000-0000-000000000001",
  };
  state.pushOutcome = "rejected";
  await notifyPaymentFailure(pushInput);
  await expire();
  assert.equal(
    (
      await notifyPaymentFailure(pushInput, {
        fallbackToSmsOnPushFailure: true,
      })
    ).delivered,
    true,
  );
  assert.equal(state.push, 1);
  assert.equal(state.sms, 1);
});

test("migration preserves legacy pending-send uncertainty and restricts send RPC access", async () => {
  await db.query(`INSERT INTO notification_deliveries(event_type, subject_id, metadata, delivery_status)
    VALUES ('payments.failed', 'legacy', '{}', 'pending')`);
  await db.exec(
    readFileSync(
      new URL(
        "../supabase/migrations/072_payment_failure_send_boundary.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  assert.equal(
    (
      await db.query(
        "SELECT delivery_status FROM notification_deliveries WHERE subject_id='legacy'",
      )
    ).rows[0].delivery_status,
    "uncertain",
  );
  assert.equal(
    await claimPaymentFailureDelivery({
      notificationType: "payments",
      eventType: "payments.failed",
      subjectId: "legacy",
    }),
    false,
  );
  for (const role of ["anon", "authenticated"]) {
    const result = await db.query(
      "SELECT has_function_privilege($1, 'begin_payment_failure_send(text,uuid,text)', 'EXECUTE') AS allowed",
      [role],
    );
    assert.equal(result.rows[0].allowed, false);
  }
});

test("pre-send lookup failures stay retryable and opt-outs send nothing", async () => {
  const userInput = {
    ...input,
    userId: "00000000-0000-0000-0000-000000000001",
  };
  state.context = { status: "retry" };
  assert.equal((await notifyPaymentFailure(userInput)).reason, "push_context");
  assert.equal((await row()).send_started_at, null);
  await expire();
  state.context = {
    status: "ready",
    context: { enabled: false, tokens: [], locale: "fr" },
  };
  assert.equal((await notifyPaymentFailure(userInput)).reason, "push_disabled");
  assert.equal(state.sms + state.push, 0);
});
