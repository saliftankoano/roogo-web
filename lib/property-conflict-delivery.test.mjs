import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";

const state = { delivered: new Set(), sent: [], staffAvailable: false };
globalThis.__conflictDelivery = state;
const mocks = {
  "@/lib/supabase-admin": `export const supabaseAdmin = {
    from(table) {
      const result = { data: table === 'transactions'
        ? {id:'tx', user_id:'customer', property_id:'property'}
        : table === 'properties' ? {quartier:'test'} : [{id:'staff'}], error: null };
      const q = { select:()=>q, eq:()=>q, maybeSingle:async()=>result, then:resolve=>Promise.resolve(result).then(resolve) };
      return q;
    }
  };`,
  "@/lib/notification-deliveries": `
    export const claimRetryableNotificationDelivery = async ({userId}) => !globalThis.__conflictDelivery.delivered.has(userId);
    export const updateNotificationDeliveryMetadata = async ({userId, deliveryStatus}) => {
      if (deliveryStatus === 'sent') globalThis.__conflictDelivery.delivered.add(userId);
    };`,
  "@/lib/push-notifications": `export const notifyUserWithTemplate = async userId => {
    const s = globalThis.__conflictDelivery;
    s.sent.push(userId);
    return userId === 'customer' || s.staffAvailable;
  };`,
  "@/lib/text-sanitize": "export const unescapeText = value => value;",
};
registerHooks({
  resolve(specifier, context, next) {
    return mocks[specifier]
      ? {
          url: "data:text/javascript," + encodeURIComponent(mocks[specifier]),
          shortCircuit: true,
        }
      : next(specifier, context);
  },
});
const { notifyMonthlyPropertyLockConflict } =
  await import("./property-lock-finalization.ts");

test("retrying a stored conflict retries only its undelivered recipient", async () => {
  await notifyMonthlyPropertyLockConflict("deposit");
  assert.deepEqual(state.sent, ["customer", "staff"]);
  state.staffAvailable = true;
  await notifyMonthlyPropertyLockConflict("deposit");
  await notifyMonthlyPropertyLockConflict("deposit");
  assert.deepEqual(state.sent, ["customer", "staff", "staff"]);
  assert.equal(state.delivered.size, 2);
});
