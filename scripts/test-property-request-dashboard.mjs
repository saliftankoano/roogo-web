import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { chromium } from "playwright";

const root = fileURLToPath(new URL("../", import.meta.url));
const directory = await mkdtemp(join(tmpdir(), "roogo-request-dashboard-"));
let browser;
let server;
try {
  await build({
    stdin: {
      contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import Page from './app/admin/property-requests/page'; createRoot(document.getElementById('root')).render(<Page/>);`,
      resolveDir: root,
      loader: "tsx",
    },
    absWorkingDir: root,
    bundle: true,
    outfile: join(directory, "app.js"),
    jsx: "automatic",
    define: { "process.env": JSON.stringify({ NODE_ENV: "development" }) },
  });
  const script = await readFile(join(directory, "app.js"));
  server = createServer((req, res) => {
    res.setHeader(
      "Content-Type",
      req.url === "/app.js" ? "text/javascript" : "text/html",
    );
    res.end(
      req.url === "/app.js"
        ? script
        : '<html lang="fr"><body><div id="root"></div><script src="/app.js"></script></body></html>',
    );
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROME_EXECUTABLE
      ? { executablePath: process.env.CHROME_EXECUTABLE }
      : {}),
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(10000);
  const record = {
    id: "01010101-0101-4101-8101-010101010101",
    title: "Villa familiale à Ouaga 2000",
    description: "Une villa de trois chambres avec cour clôturée.",
    listing_type: "vendre",
    property_type: "Villa",
    city: "Ouagadougou",
    neighborhood: "Ouaga 2000",
    budget_min: 35000000,
    budget_max: 45000000,
    min_area: 300,
    min_bedrooms: 3,
    commission_rate: 2.5,
    commission_terms: "Payable après la vente et encaissement des fonds.",
    customer_name: "Client Test",
    customer_contact: "+22670000000",
    internal_notes: "Note initiale",
    status: "open",
    created_at: "2026-09-07T12:00:00.000Z",
    updated_at: "2026-09-07T12:00:00.000Z",
    response_count: 0,
  };
  let revision = 0;
  let failDetailOnce = false;
  const update = (changes) =>
    Object.assign(record, changes, {
      updated_at: new Date(
        Date.parse(record.created_at) + ++revision * 1000,
      ).toISOString(),
    });
  await page.route("**/api/property-requests**", async (route) => {
    if (route.request().method() === "POST") {
      update(JSON.parse(route.request().postData()));
      return route.fulfill({ status: 201, json: { request: record } });
    }
    if (route.request().method() === "PUT") {
      const body = JSON.parse(route.request().postData());
      if (body.updated_at !== record.updated_at)
        return route.fulfill({
          status: 409,
          json: {
            error: "Cet appel a changé. Actualisez avant de le modifier.",
          },
        });
      update(body);
      return route.fulfill({ json: { request: record } });
    }
    if (route.request().url().endsWith("/api/property-requests"))
      return route.fulfill({ json: { requests: [record] } });
    if (failDetailOnce) {
      failDetailOnce = false;
      return route.fulfill({
        status: 500,
        json: { error: "Temporary failure" },
      });
    }
    return route.fulfill({ json: { request: record, responses: [] } });
  });
  const saveButton = page.getByRole("button", {
    name: "Enregistrer",
    exact: true,
  });
  async function save(status) {
    const result = page.waitForResponse(
      (response) => response.request().method() === "PUT",
    );
    await saveButton.click();
    assert.equal((await result).status(), status);
  }
  async function refresh() {
    const result = page.waitForResponse(
      (response) =>
        response.request().method() === "GET" &&
        response.url().endsWith(record.id),
    );
    await page.getByRole("button", { name: "Actualiser", exact: true }).click();
    await result;
    await page.getByRole("button", { name: "Modifier", exact: true }).waitFor();
  }
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.getByRole("button", { name: "Modifier", exact: true }).click();
  await page.getByLabel("Titre de l’appel *").fill("Mon titre conservé");
  update({ internal_notes: "Note d’un autre membre", status: "closed" });
  await save(409);
  await page
    .getByText(
      "L’appel a été actualisé. Vos modifications sont conservées. Vérifiez les éventuels conflits avant d’enregistrer à nouveau.",
      { exact: true },
    )
    .waitFor();
  assert.equal(
    await page.getByLabel("Titre de l’appel *").inputValue(),
    "Mon titre conservé",
  );
  assert.equal(
    await page.locator('textarea[name="internal_notes"]').inputValue(),
    "Note d’un autre membre",
  );
  assert.equal(
    await page.locator('select[name="status"]').inputValue(),
    "closed",
  );
  await refresh();
  await save(200);
  await page
    .getByRole("heading", { name: "Modifier l’appel" })
    .waitFor({ state: "hidden" });
  assert.equal(record.title, "Mon titre conservé");
  assert.equal(
    record.status,
    "closed",
    "Saving a draft must not reopen a call closed by another operator",
  );
  console.log(
    "PASS: stale call save recovers automatically, preserves draft and unrelated staff changes, and succeeds after refresh.",
  );

  await page.getByRole("button", { name: "Modifier", exact: true }).click();
  await page.getByLabel("Titre de l’appel *").fill("Mon titre en conflit");
  await page.getByLabel("Commission (%) *", { exact: true }).fill("3");
  update({
    title: "Titre concurrent",
    commission_rate: 5,
    budget_max: 47000000,
  });
  await refresh();
  await page
    .getByRole("button", {
      name: "Garder mon brouillon · Titre de l’appel",
      exact: true,
    })
    .waitFor();
  assert.equal(await saveButton.isDisabled(), true);
  await refresh();
  assert.equal(
    await saveButton.isDisabled(),
    true,
    "Refreshing cannot dismiss unresolved conflicts",
  );
  await page
    .getByRole("button", {
      name: "Utiliser la version enregistrée · Commission (%)",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", {
      name: "Garder mon brouillon · Titre de l’appel",
      exact: true,
    })
    .click();
  update({ title: "Nouveau titre concurrent", commission_rate: 7 });
  await save(409);
  await page
    .getByRole("button", {
      name: "Garder mon brouillon · Titre de l’appel",
      exact: true,
    })
    .waitFor();
  assert.equal(
    await page.getByLabel("Commission (%) *", { exact: true }).inputValue(),
    "7",
  );
  await page
    .getByRole("button", {
      name: "Garder mon brouillon · Titre de l’appel",
      exact: true,
    })
    .click();
  await save(200);
  await page
    .getByRole("heading", { name: "Modifier l’appel" })
    .waitFor({ state: "hidden" });
  assert.equal(record.title, "Mon titre en conflit");
  assert.equal(record.commission_rate, 7);
  assert.equal(record.budget_max, 47000000);
  console.log(
    "PASS: overlapping title/commission edits require choices, repeated conflicts recover, and unrelated budgets survive.",
  );

  await page.getByRole("button", { name: "Modifier", exact: true }).click();
  await page
    .getByLabel("Titre de l’appel *")
    .fill("Brouillon malgré une panne");
  update({ internal_notes: "Note après panne" });
  failDetailOnce = true;
  await save(409);
  await page
    .getByText(
      "Impossible d’actualiser l’appel. Votre brouillon est conservé ; utilisez Actualiser puis réessayez.",
      { exact: true },
    )
    .waitFor();
  assert.equal(
    await page.getByLabel("Titre de l’appel *").inputValue(),
    "Brouillon malgré une panne",
  );
  await refresh();
  await save(200);
  assert.equal(record.title, "Brouillon malgré une panne");
  assert.equal(record.internal_notes, "Note après panne");
  console.log(
    "PASS: failed conflict reload preserves the draft and manual refresh recovers.",
  );
  await page
    .getByRole("heading", { name: "Modifier l’appel" })
    .waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "Nouvel appel", exact: true }).click();
  for (const [field, value] of Object.entries({
    title: "Nouvel appel mensuel",
    city: "Ouagadougou",
    budget_max: "200000",
    commission_rate: "2.5",
    customer_name: "Client Exemple",
    customer_contact: "+22670000001",
  })) {
    await page.locator(`input[name="${field}"]`).fill(value);
  }
  await page
    .locator('textarea[name="description"]')
    .fill("Recherche une maison avec trois chambres.");
  await page
    .locator('textarea[name="commission_terms"]')
    .fill("Commission payable après signature du contrat de location.");
  await page.locator('select[name="listing_type"]').selectOption("louer");
  await page.locator('select[name="status"]').selectOption("open");
  const created = page.waitForResponse(
    (response) => response.request().method() === "POST",
  );
  await saveButton.click();
  assert.equal((await created).status(), 201);
  assert.equal(record.title, "Nouvel appel mensuel");
  assert.equal(record.listing_type, "louer");
  assert.equal(record.status, "open");
  assert.equal(record.budget_min, null);
  assert.equal(record.commission_rate, 2.5);
  console.log(
    "PASS: ordinary call creation and publishing still use the entered values and defaults.",
  );
} finally {
  await browser?.close();
  if (server?.listening) await new Promise((resolve) => server.close(resolve));
  await rm(directory, { recursive: true, force: true });
}
