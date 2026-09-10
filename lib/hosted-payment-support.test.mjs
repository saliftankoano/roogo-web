import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { test } from "node:test";
import ts from "typescript";

const source = readFileSync(
  new URL("../app/payments/callback/page.tsx", import.meta.url),
  "utf8",
);
const start = source.indexOf("  useEffect(() => {");
const end = source.indexOf("\n  }, [depositId", start);
const script = ts.transpileModule(
  "globalThis.cleanup = (() => {" +
    source.slice(start + "  useEffect(() => {".length, end) +
    "})();",
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
).outputText;

function run(fetch) {
  const result = { statuses: [], messages: [], timers: [] };
  const context = {
    isLoaded: true,
    isSignedIn: true,
    depositId: "deposit",
    getToken: async () => "token",
    fetch,
    setStatus: (value) => result.statuses.push(value),
    setMessage: (value) => result.messages.push(value),
    setPaymentContext: () => {},
    paymentFailureMessage: () => "Controlled failure reason",
    setTimeout: (callback) => {
      result.timers.push(callback);
      return callback;
    },
    clearTimeout: (callback) => {
      result.timers = result.timers.filter((timer) => timer !== callback);
    },
    console,
  };
  vm.createContext(context);
  vm.runInContext(script, context);
  return { result, cleanup: context.cleanup };
}
const flush = () => new Promise((resolve) => setImmediate(resolve));

test("hosted support is terminal, explicit and never scheduled for another poll", async () => {
  const { result } = run(async () =>
    Response.json({ success: true, status: "NEEDS_SUPPORT" }),
  );
  await flush();
  assert.deepEqual(result.statuses, ["needs_support"]);
  assert.match(result.messages[0], /Ne payez pas à nouveau/);
  assert.equal(result.timers.length, 0);
  assert.match(source, /Paiement reçu, assistance requise/);
  assert.match(source, /href="\/nous-contacter"/);
  assert.match(source, /Référence du paiement : \{depositId\}/);
});

test("pending polls serialize and stop immediately when support is required", async () => {
  let calls = 0;
  const { result } = run(async () =>
    Response.json({
      success: true,
      status: ++calls === 1 ? "PENDING" : "NEEDS_SUPPORT",
    }),
  );
  await flush();
  assert.equal(result.timers.length, 1);
  await result.timers.shift()();
  assert.deepEqual(result.statuses, ["pending", "needs_support"]);
  assert.equal(result.timers.length, 0);
});

test("a cancelled status request cannot overwrite the next payment", async () => {
  let resolve;
  const pending = new Promise((done) => {
    resolve = done;
  });
  const { result, cleanup } = run(() => pending);
  await flush();
  cleanup();
  resolve(Response.json({ success: true, status: "COMPLETED" }));
  await flush();
  assert.deepEqual(result.statuses, []);
  assert.equal(result.timers.length, 0);
});

test("completed and failed deposits retain their normal terminal states", async () => {
  for (const status of ["COMPLETED", "FAILED"]) {
    const { result } = run(async () =>
      Response.json({ success: true, status }),
    );
    await flush();
    assert.deepEqual(result.statuses, [
      status === "COMPLETED" ? "success" : "failed",
    ]);
    assert.equal(result.timers.length, 0);
  }
});
