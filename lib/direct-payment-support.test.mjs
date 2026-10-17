import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { test } from "node:test";
import ts from "typescript";
import React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";

const source = readFileSync(
  new URL("../components/payment/PropertyPaymentModal.tsx", import.meta.url),
  "utf8",
);
const transpile = (code) =>
  ts.transpileModule(code, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;

test("direct web initiation preserves an immediate support result", async () => {
  const start = source.indexOf("  const handleInitiatePayment = ");
  const end = source.indexOf("\n  const startPolling", start);
  const states = [],
    deposits = [];
  const context = {
    step: "phone",
    selectedCorrespondent: { dialCode: "226", code: "MOOV_BFA" },
    phoneNational: "02345048",
    otpCode: "",
    propertyId: "property",
    getToken: async () => "token",
    fetch: async () =>
      Response.json(
        { success: true, depositId: "paid-deposit", status: "NEEDS_SUPPORT" },
        { status: 202 },
      ),
    setStep: (value) => states.push(value),
    setDepositId: (value) => deposits.push(value),
    setErrorMessage() {},
    startPolling: () => assert.fail("Support is already terminal"),
    onSuccess: () => assert.fail("Support is not fulfillment"),
  };
  vm.runInNewContext(
    transpile(
      source.slice(start, end) + "\nglobalThis.done = handleInitiatePayment();",
    ),
    context,
  );
  await context.done;
  assert.deepEqual(states, ["processing", "needs_support"]);
  assert.deepEqual(deposits, ["paid-deposit"]);
});
function polling(fetch) {
  const start = source.indexOf("  const startPolling = ");
  const end = source.indexOf("\n  const formatAmount", start);
  const result = { steps: [], successes: [], timers: new Map() };
  const context = {
    fetch,
    getToken: async () => "token",
    console,
    attemptCountRef: { current: 0 },
    pollingRef: { current: null },
    pollingGenerationRef: { current: 0 },
    setStep: (step) => result.steps.push(step),
    setErrorMessage: () => {},
    onSuccess: (id) => result.successes.push(id),
    paymentFailureMessage: () => "Controlled failure",
    setInterval: (fn) => {
      result.timers.set(fn, fn);
      return fn;
    },
    clearInterval: (id) => result.timers.delete(id),
  };
  vm.runInNewContext(
    transpile(source.slice(start, end) + '\nstartPolling("paid-deposit");'),
    context,
  );
  return { result, context };
}

test("direct web polling stops on support without a success or failure state", async () => {
  const { result } = polling(async () =>
    Response.json({ success: true, status: "NEEDS_SUPPORT" }),
  );
  await [...result.timers.values()][0]();
  assert.deepEqual(result.steps, ["needs_support"]);
  assert.deepEqual(result.successes, []);
  assert.equal(result.timers.size, 0);
});

test("slow web polling is serialized and stale responses cannot change the modal", async () => {
  let resolve,
    calls = 0;
  const { result, context } = polling(() => {
    calls++;
    return new Promise((done) => {
      resolve = done;
    });
  });
  const tick = [...result.timers.values()][0];
  const request = tick();
  await tick();
  assert.equal(calls, 1);
  context.pollingGenerationRef.current++;
  resolve(Response.json({ status: "COMPLETED" }));
  await request;
  assert.deepEqual(result.steps, []);
  assert.deepEqual(result.successes, []);
});

test("failed status lookups are not accepted as payment outcomes", async () => {
  const { result } = polling(async () =>
    Response.json({ success: false, status: "COMPLETED" }, { status: 503 }),
  );
  await [...result.timers.values()][0]();
  assert.deepEqual(result.steps, []);
  assert.equal(result.timers.size, 1);
});

test("direct web support renders the paid reference and only support/close actions", () => {
  let index = 0;
  const states = [
    "needs_support",
    { iso: "BF" },
    null,
    "",
    "",
    "",
    "paid-deposit",
  ];
  const mocks = {
    react: {
      ...React,
      useState: () => [states[index++], () => {}],
      useRef: (value) => ({ current: value }),
      useEffect() {},
      useCallback: (fn) => fn,
    },
    "react/jsx-runtime": jsxRuntime,
    "framer-motion": {
      AnimatePresence: React.Fragment,
      motion: { div: "div" },
    },
    "@phosphor-icons/react": new Proxy({}, { get: () => "svg" }),
    "@clerk/nextjs": { useAuth: () => ({ getToken: async () => "token" }) },
    "@/lib/move-in-payment": {
      getMoveInPaymentBreakdown: () => ({
        totalAmount: 1000,
        cautionAmount: 500,
        advanceRentAmount: 500,
        loyerAvanceMois: 1,
        successFeeAmount: 0,
      }),
    },
    "@/lib/payment-providers": {
      PAYMENT_COUNTRIES: [{ iso: "BF" }],
      DEFAULT_PAYMENT_COUNTRY_ISO: "BF",
    },
    "@/lib/motion": { roogoMotion: { standard: {} } },
    "@/lib/payment-failures": {
      paymentFailureMessage: () => "Controlled failure",
    },
  };
  const context = {
    exports: {},
    require: (name) => {
      assert.ok(name in mocks, name);
      return mocks[name];
    },
  };
  vm.runInNewContext(transpile(source), context);
  const element = context.exports.default({
    isOpen: true,
    onClose() {},
    onSuccess() {},
    propertyId: "property",
    propertyLabel: "test",
    rentAmount: 1000,
    depositMonths: 1,
  });
  const html = renderToStaticMarkup(element);
  assert.match(html, /Paiement reçu, assistance requise/);
  assert.match(html, /paid-deposit/);
  assert.match(html, /Ne payez pas à nouveau/);
  assert.match(html, /href="\/nous-contacter"/);
  assert.match(html, /Fermer/);
  assert.doesNotMatch(html, /Reessayer|Echec du paiement|Payer/);
});

test("closing the support modal cannot reset its paid reference", () => {
  const start = source.indexOf("  const resetModal = ");
  const end = source.indexOf("\n  useEffect", start);
  // Any reset write would access an absent setter and fail this test.
  vm.runInNewContext(transpile(source.slice(start, end) + "\nresetModal();"), {
    step: "needs_support",
    useCallback: (fn) => fn,
  });
});
