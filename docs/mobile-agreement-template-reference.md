# Mobile agreement template — design reference

Moved from `roogo` mobile app at `utils/agreementTemplate.ts` on 2026-04-17. Kept here as a visual/structural reference for the pending PDF branding task.

The mobile app no longer generates its own PDFs — `generateAgreementPdf` delegates entirely to `POST /api/rental-agreements/{id}/generate-pdf` (this repo, at `app/api/rental-agreements/[id]/generate-pdf/route.tsx`). The backend PDF uses `@react-pdf/renderer` instead of HTML. This reference captures the visual decisions (terracotta `#C96A2E` header border, `logoUri` embed at 36px centered, section layout, daily-rental vs monthly-rental variants) so they can be ported to the React-PDF route.

## Pending

Mirror the `logoUri` behaviour in the backend PDF: load a hosted (or bundled) Roogo logo and render it at ~36px centered above the `CONTRAT DE BAIL` title, preserving the existing terracotta header border.

## Source

```ts
import type { RentalAgreement } from "../types/database";
import { INTERDICTIONS_CONFIG } from "./interdictions";
import { formatCurrency } from "./formatting";

/**
 * Format a date string to French format (DD/MM/YYYY)
 */
function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleDateString("fr-FR");
}

/**
 * Resolve interdiction label from ID
 */
function getInterdictionLabel(id: string): string {
  const found = INTERDICTIONS_CONFIG.find((i) => i.id === id);
  return found ? found.label : id;
}

/**
 * Build the HTML string for a rental agreement.
 * Used both by expo-print (client-side preview) and @react-pdf/renderer (backend stored PDF).
 */
export function buildAgreementHtml(agreement: RentalAgreement, logoUri?: string): string {
  const owner = agreement.owner;
  const renter = agreement.renter;
  const property = agreement.property;

  const ownerName = owner?.full_name || "—";
  const ownerPhone = owner?.phone || "—";
  const renterName = renter?.full_name || "—";
  const renterPhone = renter?.phone || "—";
  const propertyTitle = property?.title || "—";
  const propertyAddress = property?.address || "—";

  const isDaily = agreement.property_frequence === "journalier";

  // Night count for daily rentals
  let nightCount = 0;
  if (isDaily && agreement.start_date && agreement.end_date) {
    const start = new Date(agreement.start_date);
    const end = new Date(agreement.end_date);
    nightCount = Math.max(0, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
  }
  const stayAmount = agreement.monthly_rent * nightCount;
  const depositAmount = agreement.monthly_rent * agreement.caution_mois;
  const advanceRentMonths = agreement.loyer_avance_mois ?? 1;
  const advanceRentAmount = isDaily ? 0 : agreement.monthly_rent * advanceRentMonths;
  const moveInTotal = isDaily
    ? stayAmount + depositAmount
    : depositAmount + advanceRentAmount;

  const dosAndDontsHtml =
    agreement.dos_and_donts.length > 0
      ? agreement.dos_and_donts
          .map((rule, i) => `<li>${i + 1}. ${rule}</li>`)
          .join("\n")
      : "<li>Aucune règle spécifique</li>";

  const interdictionsHtml =
    agreement.interdictions.length > 0
      ? agreement.interdictions
          .map((id) => `<li>• ${getInterdictionLabel(id)}</li>`)
          .join("\n")
      : "<li>Aucune interdiction spécifique</li>";

  const ownerSignedBlock = agreement.owner_signed_at
    ? `<div class="signed">✓ Signé le ${formatDate(agreement.owner_signed_at)}</div>`
    : `<div class="sig-line"></div><p class="sig-label">Signature du propriétaire</p>`;

  const renterSignedBlock = agreement.renter_signed_at
    ? `<div class="signed">✓ Signé le ${formatDate(agreement.renter_signed_at)}</div>`
    : `<div class="sig-line"></div><p class="sig-label">${isDaily ? "Signature du voyageur" : "Signature du locataire"}</p>`;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Contrat de Bail — Roogo</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif;
      color: #1a1a1a;
      background: #fff;
      padding: 40px;
      line-height: 1.6;
      font-size: 13px;
    }
    .header {
      text-align: center;
      border-bottom: 3px solid #C96A2E;
      padding-bottom: 20px;
      margin-bottom: 30px;
    }
    .header h1 {
      font-size: 24px;
      color: #C96A2E;
      letter-spacing: 1px;
      margin-bottom: 4px;
    }
    .header p { color: #666; font-size: 12px; }
    .section {
      margin-bottom: 24px;
    }
    .section-title {
      font-size: 14px;
      font-weight: bold;
      color: #C96A2E;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      border-bottom: 1px solid #f0e0d8;
      padding-bottom: 6px;
      margin-bottom: 14px;
    }
    .parties-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
    }
    .party-box {
      background: #fdf7f4;
      border: 1px solid #f0e0d8;
      border-radius: 8px;
      padding: 14px;
    }
    .party-box h3 {
      font-size: 12px;
      color: #C96A2E;
      margin-bottom: 8px;
      text-transform: uppercase;
    }
    .row { display: flex; justify-content: space-between; margin-bottom: 6px; }
    .row .label { color: #666; }
    .row .value { font-weight: 600; }
    .fin-table {
      width: 100%;
      border-collapse: collapse;
    }
    .fin-table td {
      padding: 8px 12px;
      border-bottom: 1px solid #f5f5f5;
    }
    .fin-table tr:last-child td { border-bottom: none; font-weight: bold; }
    .fin-table .total-row td { background: #fdf7f4; }
    .rules-list { padding-left: 0; list-style: none; }
    .rules-list li {
      padding: 6px 10px;
      background: #fafafa;
      border-left: 3px solid #C96A2E;
      margin-bottom: 6px;
      border-radius: 0 4px 4px 0;
    }
    .int-list { padding-left: 0; list-style: none; }
    .int-list li {
      padding: 6px 10px;
      background: #fff5f5;
      border-left: 3px solid #ef4444;
      margin-bottom: 6px;
      border-radius: 0 4px 4px 0;
    }
    .terms-text {
      background: #fafafa;
      border: 1px solid #e5e5e5;
      border-radius: 8px;
      padding: 16px;
      font-size: 11px;
      color: #555;
      line-height: 1.7;
    }
    .sig-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
      margin-top: 10px;
    }
    .sig-box { text-align: center; }
    .sig-line {
      border-bottom: 1px solid #ccc;
      height: 60px;
      margin-bottom: 8px;
    }
    .sig-label { font-size: 11px; color: #888; }
    .signed {
      color: #16a34a;
      font-weight: bold;
      font-size: 13px;
      padding: 10px 0;
      background: #f0fdf4;
      border-radius: 6px;
      text-align: center;
    }
    .footer {
      text-align: center;
      margin-top: 40px;
      padding-top: 16px;
      border-top: 1px solid #eee;
      font-size: 11px;
      color: #aaa;
    }
  </style>
</head>
<body>

<div class="header">
  ${logoUri ? `<img src="${logoUri}" alt="Roogo" style="height:36px;margin-bottom:10px;display:block;margin-left:auto;margin-right:auto;"/>` : ""}
  <h1>${isDaily ? "CONTRAT DE LOCATION COURTE DURÉE" : "CONTRAT DE BAIL"}</h1>
  <p>Généré par Roogo — Marketplace Immobilière du Burkina Faso</p>
  <p>Réf : ${agreement.id.substring(0, 8).toUpperCase()}</p>
</div>

<div class="section">
  <div class="section-title">Parties au contrat</div>
  <div class="parties-grid">
    <div class="party-box">
      <h3>Propriétaire / Bailleur</h3>
      <div class="row"><span class="label">Nom</span><span class="value">${ownerName}</span></div>
      <div class="row"><span class="label">Téléphone</span><span class="value">${ownerPhone}</span></div>
    </div>
    <div class="party-box">
      <h3>${isDaily ? "Voyageur / Hôte" : "Locataire / Preneur"}</h3>
      <div class="row"><span class="label">Nom</span><span class="value">${renterName}</span></div>
      <div class="row"><span class="label">Téléphone</span><span class="value">${renterPhone}</span></div>
    </div>
  </div>
</div>

<div class="section">
  <div class="section-title">Bien loué</div>
  <div class="row"><span class="label">Propriété</span><span class="value">${propertyTitle}</span></div>
  <div class="row" style="margin-top:8px;"><span class="label">Adresse</span><span class="value">${propertyAddress}</span></div>
</div>

<div class="section">
  <div class="section-title">Conditions financières</div>
  <table class="fin-table">
    ${isDaily ? `
    <tr>
      <td class="label">Tarif par nuit</td>
      <td class="value">${formatCurrency(agreement.monthly_rent)}</td>
    </tr>
    <tr>
      <td class="label">Durée du séjour</td>
      <td class="value">${nightCount} nuit${nightCount > 1 ? "s" : ""}</td>
    </tr>
    <tr>
      <td class="label">Montant du séjour</td>
      <td class="value">${formatCurrency(stayAmount)}</td>
    </tr>
    ${depositAmount > 0 ? `<tr><td class="label">Caution remboursable</td><td class="value">${formatCurrency(depositAmount)}</td></tr>` : ""}
    ${agreement.start_date ? `<tr><td class="label">Date d'arrivée</td><td class="value">${formatDate(agreement.start_date)}</td></tr>` : ""}
    ${agreement.end_date ? `<tr><td class="label">Date de départ</td><td class="value">${formatDate(agreement.end_date)}</td></tr>` : ""}
    <tr class="total-row">
      <td class="label">Total à régler</td>
      <td class="value">${formatCurrency(moveInTotal)}</td>
    </tr>
    ` : `
    <tr>
      <td class="label">Loyer mensuel</td>
      <td class="value">${formatCurrency(agreement.monthly_rent)}</td>
    </tr>
    <tr>
      <td class="label">Caution remboursable (${agreement.caution_mois} mois)</td>
      <td class="value">${formatCurrency(depositAmount)}</td>
    </tr>
    <tr>
      <td class="label">Loyer d'avance (${advanceRentMonths} mois)</td>
      <td class="value">${formatCurrency(advanceRentAmount)}</td>
    </tr>
    ${agreement.start_date ? `<tr><td class="label">Date d'entrée</td><td class="value">${formatDate(agreement.start_date)}</td></tr>` : ""}
    ${agreement.end_date ? `<tr><td class="label">Fin du bail</td><td class="value">${formatDate(agreement.end_date)}</td></tr>` : ""}
    <tr class="total-row">
      <td class="label">Total payé à l'entrée</td>
      <td class="value">${formatCurrency(moveInTotal)}</td>
    </tr>
    `}
  </table>
</div>

<div class="section">
  <div class="section-title">Règles du propriétaire</div>
  <ul class="rules-list">${dosAndDontsHtml}</ul>
</div>

<div class="section">
  <div class="section-title">Interdictions</div>
  <ul class="int-list">${interdictionsHtml}</ul>
</div>

<div class="section">
  <div class="section-title">Termes généraux</div>
  <div class="terms-text">
    ${agreement.terms_text || (isDaily
      ? `Le présent contrat de location courte durée est établi pour la période indiquée ci-dessus. Le locataire s'engage à libérer le logement à la date de départ convenue, à maintenir le bien en bon état et à respecter le règlement intérieur. La caution éventuelle sera restituée dans un délai de 48h après l'état des lieux de sortie, sous réserve de l'absence de dommages. Tout litige sera réglé à l'amiable, puis devant les juridictions compétentes de Ouagadougou.`
      : `Le présent contrat est soumis aux dispositions légales en vigueur au Burkina Faso régissant les baux d'habitation. Le locataire s'engage à maintenir le bien en bon état et à s'acquitter du loyer à la date convenue. Tout litige sera réglé à l'amiable dans un premier temps, puis devant les juridictions compétentes de Ouagadougou.`)}
  </div>
</div>

<div class="section">
  <div class="section-title">Signatures</div>
  <p style="font-size:11px;color:#666;margin-bottom:16px;">
    En signant, les deux parties déclarent avoir lu et accepté l'intégralité du présent contrat.
  </p>
  <div class="sig-grid">
    <div class="sig-box">
      <p style="font-weight:bold;margin-bottom:8px;">${ownerName}</p>
      ${ownerSignedBlock}
    </div>
    <div class="sig-box">
      <p style="font-weight:bold;margin-bottom:8px;">${renterName}</p>
      ${renterSignedBlock}
    </div>
  </div>
</div>

<div class="footer">
  Roogo — roogo.app • Document généré le ${formatDate(new Date().toISOString())}
</div>

</body>
</html>`;
}
```
