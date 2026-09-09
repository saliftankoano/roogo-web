import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { beforeEach, test } from "node:test";

const state = {
  transaction: null,
  booking: null,
  raceTo: null,
  reloadError: false,
  reads: 0,
  queued: [],
  successes: [],
};
globalThis.__paymentCallbackTest = state;
const root = new URL("../", import.meta.url);
const mocks = {
  "@/lib/api-helpers":
    "export const cors = r => r; export const corsOptions = () => {};",
  "@clerk/backend":
    "export const verifyToken = async () => ({ sub: 'clerk' });",
  "@/lib/referrals":
    "export const voidPendingReferralForTransaction = async () => {};",
  "@/lib/visites-3d": `export const computePrice = () => 1000;
    export const normalizePhone = value => value;
    export const toPawaPayPhone = value => value;
    export const visit3dPaymentInitiateSchema = { safeParse: value => ({ success: true, data: value }) };`,
  "@/lib/pawapay-config":
    "export const resolvePawaPayConfig = () => ({ url: 'https://pawapay.test', token: 'test-token' });",
  "@/lib/rate-limit":
    "export const paymentLimiter = {}; export const checkRateLimit = async () => ({ success: true, headers: {} });",
  "next/server": "export const NextResponse = Response;",
  "@/lib/user-sync":
    "export const getSupabaseClient = () => globalThis.__paymentCallbackTest.db; export const getOrSyncUserByClerkId = async () => ({ id: 'customer' });",
  "@/lib/supabase-admin":
    "export const supabaseAdmin = globalThis.__paymentCallbackTest.db;",
  "@/lib/push-notifications":
    "export const notifyUserWithTemplate = async (...args) => { globalThis.__paymentCallbackTest.successes.push(args); return true; };",
  "@/lib/text-sanitize": "export const unescapeText = value => value;",
  "@/lib/posthog-server": "export const captureServerEvent = async () => {};",
  "@/lib/owner-wallet":
    "export const creditOwnerEarningForSchedule = async () => {}; export const updateOwnerPayoutFromPawaPayStatus = async () => {};",
  "@/lib/rent-notifications":
    "export const notifyOwnerRentReceivedForSchedule = async () => {};",
  "@/lib/pawapay-payouts":
    "export const updateDepositRefundFromPawaPayStatus = async () => {};",
  "@/lib/daily-bookings":
    "export const finalizeDailyBookingAfterPayment = async () => ({}); export const isBlockedDailyFinalize = () => false;",
  "@/lib/africastalking":
    "export const sendCustomerConfirmation = async () => {}; export const sendTeamNotification = async () => {};",
  "@/lib/payment-failure-notifications":
    "export const queuePaymentFailureNotification = async input => { globalThis.__paymentCallbackTest.queued.push(input); };",
  "@/lib/property-lock-finalization":
    "export const isMonthlyProperty = async () => false; export const finalizeMonthlyPropertyLock = async () => ({ paymentStatus: 'completed', fulfillmentConflict: false });",
};
state.db = {
  from(table) {
    assert.ok(
      ["transactions", "bookings", "properties"].includes(table),
      table,
    );
    const field =
      table === "transactions"
        ? "transaction"
        : table === "properties"
          ? "property"
          : "booking";
    const statusKey = field === "transaction" ? "status" : "payment_status";
    const filters = [];
    let patch;
    const execute = (single) => {
      if (!patch) {
        state.reads++;
        if (state.reloadError && state.reads > 1)
          return { data: null, error: { code: "08006" } };
      } else if (state.raceTo) {
        state[field][statusKey] = state.raceTo;
        if (state.raceConflict)
          state[field].metadata = {
            ...state[field].metadata,
            propertyLockFinalizedAt: "2026-09-08",
            propertyLockConflict: true,
          };
        if (state.raceTo === "failed") {
          state[field][
            field === "transaction" ? "failure_code" : "payment_failure_code"
          ] = "INSUFFICIENT_BALANCE";
        }
        state.raceTo = null;
      }
      const row = state[field];
      const matched =
        row && filters.every(([key, values]) => values.includes(row[key]));
      if (matched && patch) Object.assign(row, patch);
      return {
        data: single
          ? matched
            ? structuredClone(row)
            : null
          : matched
            ? [structuredClone(row)]
            : [],
        error: null,
      };
    };
    const query = {
      select: () => query,
      lt: () => query,
      insert: (value) => {
        state[field] = { id: "booking", ...value };
        return query;
      },
      eq: (key, value) => {
        filters.push([key, [value]]);
        return query;
      },
      in: (key, values) => {
        filters.push([key, values]);
        return query;
      },
      update: (value) => {
        patch = value;
        return query;
      },
      single: async () => execute(true),
      maybeSingle: async () => execute(true),
      then: (resolve, reject) =>
        Promise.resolve(execute(false)).then(resolve, reject),
    };
    return query;
  },
};
registerHooks({
  resolve(specifier, context, next) {
    if (mocks[specifier])
      return {
        url: `data:text/javascript,${encodeURIComponent(mocks[specifier])}`,
        shortCircuit: true,
      };
    if (specifier.startsWith("@/"))
      return {
        url: new URL(`${specifier.slice(2)}.ts`, root).href,
        shortCircuit: true,
      };
    return next(specifier, context);
  },
});
const { POST } = await import("../app/api/pawapay/callback/route.ts");
const { POST: checkPaymentStatus } =
  await import("../app/api/payments/status/route.ts");
const { POST: initiateVisit3d } =
  await import("../app/api/visites-3d/initiate/route.ts");
const { handleVisit3dDepositCallback } = await import("./visit3d-callback.ts");
const payload = (status) => ({
  depositId: "deposit",
  status,
  failureReason: { failureCode: "INSUFFICIENT_BALANCE" },
});
const callback = (status) =>
  POST(
    new Request("https://roogo.test/api/pawapay/callback", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": "3.64.89.224",
      },
      body: JSON.stringify(payload(status)),
    }),
  );
beforeEach(() => {
  state.raceConflict = false;
  state.property = { id: "property", period: "month", quartier: "test" };
  state.transaction = {
    id: "transaction",
    deposit_id: "deposit",
    status: "pending",
    type: "listing_submission",
    user_id: "customer",
    metadata: {},
  };
  state.booking = {
    id: "booking",
    payment_deposit_id: "deposit",
    payment_status: "pending",
    status: "pending_payment",
    phone: "test-phone",
  };
  state.raceTo = null;
  state.reloadError = false;
  state.reads = 0;
  state.queued = [];
  state.successes = [];
});

for (const providerStatus of ["SUBMITTED", "NOT_FOUND"]) {
  test(`status ${providerStatus} CAS loser preserves a concurrent fulfillment conflict`, async (t) => {
    state.transaction.type = "property_lock";
    state.transaction.property_id = "property";
    state.raceTo = "completed";
    state.raceConflict = true;
    t.mock.method(globalThis, "fetch", async () =>
      Response.json(
        providerStatus === "NOT_FOUND"
          ? { status: "NOT_FOUND" }
          : { status: "FOUND", data: { status: providerStatus } },
      ),
    );
    const request = () =>
      new Request("https://roogo.test/api/payments/status", {
        method: "POST",
        headers: {
          Authorization: "Bearer test",
          "content-type": "application/json",
        },
        body: JSON.stringify({ depositId: "deposit" }),
      });
    const racing = await checkPaymentStatus(request());
    assert.equal(racing.status, 200);
    assert.equal((await racing.json()).status, "NEEDS_SUPPORT");
    assert.equal(
      (await (await checkPaymentStatus(request())).json()).status,
      "NEEDS_SUPPORT",
    );
  });
}

test("status reload errors remain retryable instead of returning successful PENDING", async (t) => {
  state.raceTo = "submitted";
  state.reloadError = true;
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({ status: "FOUND", data: { status: "SUBMITTED" } }),
  );
  const response = await checkPaymentStatus(
    new Request("https://roogo.test/api/payments/status", {
      method: "POST",
      headers: { Authorization: "Bearer test" },
      body: JSON.stringify({ depositId: "deposit" }),
    }),
  );
  assert.equal(response.status, 503);
});

for (const status of ["FAILED", "COMPLETED"]) {
  test(`retries ${status} callback when a concurrent poll wins pending -> submitted`, async () => {
    state.raceTo = "submitted";
    const first = await callback(status);
    assert.equal(first.status, 503);
    assert.equal(state.transaction.status, "submitted");
    assert.equal(state.queued.length, 0);
    assert.equal(state.successes.length, 0);
    const retry = await callback(status);
    assert.equal(retry.status, 200);
    assert.equal(state.transaction.status, status.toLowerCase());
    assert.equal(state.queued.length, status === "FAILED" ? 1 : 0);
    assert.equal(state.successes.length, status === "COMPLETED" ? 1 : 0);
  });
}

test("a winning failure is acknowledged and notification dispatch is re-driven", async () => {
  state.raceTo = "failed";
  assert.equal((await callback("FAILED")).status, 200);
  assert.equal(state.queued.length, 1);
  assert.equal(state.queued[0].failureCode, "INSUFFICIENT_BALANCE");
});

test("a winning completion is never overwritten or announced as failed", async () => {
  state.raceTo = "completed";
  assert.equal((await callback("FAILED")).status, 200);
  assert.equal(state.transaction.status, "completed");
  assert.equal(state.queued.length, 0);
});

test("a refund racing a completion still requests retry", async () => {
  state.raceTo = "completed";
  assert.equal((await callback("REFUNDED")).status, 503);
  assert.equal((await callback("REFUNDED")).status, 200);
  assert.equal(state.transaction.status, "refunded");
});

test("a failed reload cannot be acknowledged as a duplicate", async () => {
  state.raceTo = "submitted";
  state.reloadError = true;
  assert.equal((await callback("FAILED")).status, 503);
  assert.equal(state.queued.length, 0);
});

test("accountless 3D failure races return retryable errors and persist on retry", async () => {
  state.transaction = null;
  state.raceTo = "submitted";
  assert.equal((await callback("FAILED")).status, 500);
  assert.equal(state.booking.payment_status, "submitted");
  assert.equal(state.queued.length, 0);
  assert.equal((await callback("FAILED")).status, 200);
  assert.equal(state.booking.payment_status, "failed");
  assert.equal(state.queued.length, 1);
  assert.equal(state.queued[0].transactionType, "visit3d");
});

test("accountless 3D failure winner is acknowledged and notification re-driven", async () => {
  state.raceTo = "failed";
  const result = await handleVisit3dDepositCallback(
    "deposit",
    "FAILED",
    payload("FAILED"),
  );
  assert.equal(result.error, undefined);
  assert.equal(result.paymentStatus, "failed");
  assert.equal(state.queued.length, 1);
});

for (const winner of ["failed", "completed", "pending"]) {
  test(`3D SUBMITTED initiation preserves a ${winner} callback winner`, async (t) => {
    t.mock.method(globalThis, "fetch", async () => {
      // The callback may settle while the original POST is awaiting PawaPay.
      state.booking.payment_status = winner;
      return Response.json({ status: "SUBMITTED" });
    });
    const response = await initiateVisit3d(
      new Request("https://roogo.test/api/visites-3d/initiate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          date: "2100-01-01",
          slot: "morning",
          name: "test",
          phone: "test-phone",
          payment_phone: "test-phone",
          payment_provider: "MOOV_BFA",
          room_count: 1,
          address: "test",
        }),
      }),
    );
    assert.equal(response.status, 201);
    assert.equal(
      state.booking.payment_status,
      winner === "pending" ? "submitted" : winner,
    );
    assert.equal(state.queued.length, 0);
  });
}
