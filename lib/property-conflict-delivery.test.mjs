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
    export const claimRetryableNotificationDelivery = async ({userId}) => !globalThis.__conflictDelivery.delivered.has(userId) && 'attempt';
    export const beginRetryableNotificationSend = async () => true;
    export const persistNotificationDeliveryOutcome = async ({userId, deliveryStatus}) => {
      if (deliveryStatus === 'sent') globalThis.__conflictDelivery.delivered.add(userId);
    };`,
  "@/lib/push-notifications": `
  export const getUserPushNotificationContext = async userId => ({status:'ready', context:{enabled:true,locale:'fr',tokens:[userId]}});
  export const removeUserPushTokens = async () => {};
  export const sendExpoPushNotificationsWithResult = async ({to:[userId]}) => {
    const s = globalThis.__conflictDelivery;
    s.sent.push(userId);
    const accepted = userId === 'customer' || s.staffAvailable;
    return {accepted, outcome:accepted ? 'accepted' : 'rejected', invalidTokens:[]};
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
      : specifier.startsWith("@/")
        ? {
            url: new URL("../" + specifier.slice(2) + ".ts", import.meta.url)
              .href,
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
