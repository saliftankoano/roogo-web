// Runs the real Next route against a delayed local Supabase fixture. Requires
// the usual local Clerk configuration; never reads or writes production data.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { once } from "node:events";

const require = createRequire(import.meta.url);
let mode = "success";
let databaseFinishedAt = 0;
const fixture = createServer(async (_request, response) => {
  const requestedMode = mode;
  await new Promise(resolve => setTimeout(resolve, 1500));
  const row = {
    id: "11111111-1111-4111-8111-111111111111",
    slug: "stream-fixture",
    quartier: "STREAMED_LISTING_MARKER",
    city: "ouagadougou",
    address: "Local fixture",
    price: requestedMode === "malformed" ? null : 150000,
    description: "Local streaming verification",
    status: "en_ligne",
    property_type: "appartement",
    images: ["/hero-bg.jpg"],
  };
  const data = requestedMode === "error"
    ? { message: "Fixture unavailable" }
    : requestedMode === "empty" ? [] : [row];
  response.writeHead(requestedMode === "error" ? 500 : 200, {
    "Content-Type": "application/json",
    "Content-Range": "0-0/1",
  });
  databaseFinishedAt = performance.now();
  response.end(JSON.stringify(data));
});
fixture.listen(0, "127.0.0.1");
await once(fixture, "listening");
const fixturePort = fixture.address().port;
const probe = createServer();
probe.listen(0, "127.0.0.1");
await once(probe, "listening");
const appPort = probe.address().port;
await new Promise(resolve => probe.close(resolve));

let output = "";
const next = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "dev", "--port", String(appPort)], {
  cwd: new URL("../", import.meta.url),
  env: {
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${fixturePort}`,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "local-fixture-key",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
next.stdout.on("data", chunk => { output += chunk; });
next.stderr.on("data", chunk => { output += chunk; });

try {
  const deadline = Date.now() + 90000;
  while (!output.includes("Ready in")) {
    if (next.exitCode !== null || Date.now() > deadline) throw new Error(`Next did not start:\n${output}`);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const url = `http://localhost:${appPort}/`;
  // Compile before asserting stream order; this is not a production benchmark.
  await (await fetch(url)).text();
  for (mode of ["success", "empty", "error", "malformed"]) {
    databaseFinishedAt = 0;
    const startedAt = performance.now();
    const response = await fetch(url);
    assert.equal(response.status, 200);
    let html = "";
    let heroAt = 0;
    let fallbackAt = 0;
    const decoder = new TextDecoder();
    for await (const chunk of response.body) {
      html += decoder.decode(chunk, { stream: true });
      if (!heroAt && html.includes('alt="Maison moderne disponible à Ouagadougou"')) heroAt = performance.now();
      if (!fallbackAt && html.includes('aria-label="Chargement des annonces en vedette"')) fallbackAt = performance.now();
    }
    html += decoder.decode();
    assert.ok(databaseFinishedAt > startedAt, "must use the local database fixture");
    assert.ok(heroAt > 0 && heroAt < databaseFinishedAt, "hero must reach the client before the listing query completes");
    assert.ok(fallbackAt > 0 && fallbackAt < databaseFinishedAt, "listing skeleton must stream in the shell");
    assert.ok(html.includes("roogo-hero-dusk-home.jpg") && html.includes('rel="preload"'), "hero preload must remain available");
    if (mode === "success") assert.ok(html.includes("STREAMED_LISTING_MARKER"), "resolved listings must appear in the response");
    else if (mode === "malformed") assert.ok(html.includes("Les annonces sont momentanément indisponibles"));
    else assert.ok(html.includes("Aucun bien en vedette pour le moment"));
    console.log(`${mode}: hero at ${Math.round(heroAt - startedAt)} ms; listing query finished at ${Math.round(databaseFinishedAt - startedAt)} ms`);
  }
} catch (error) {
  console.error(output.slice(-6000));
  throw error;
} finally {
  next.kill("SIGTERM");
  const timeout = setTimeout(() => next.kill("SIGKILL"), 5000);
  timeout.unref();
  if (next.exitCode === null && next.signalCode === null) await once(next, "exit");
  clearTimeout(timeout);
  fixture.closeAllConnections();
  await new Promise(resolve => fixture.close(resolve));
}
