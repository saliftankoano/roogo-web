"use client";

import { formatCurrency, formatNumber, parsePrice } from "@/lib/format";
import { formatMoney } from "@/lib/studio/currency";
import { formatPhoneDisplay } from "@/lib/phone";
import { Alert } from "@/components/ui/alert";
import { GuideSection, GuideSubsection, Mono } from "./primitives";

const OUAGA = "Africa/Ouagadougou";
const sampleDate = new Date("2026-10-08T17:45:00Z");
const rate = 600;

type Row = { rule: string; code: string; output: string };

function percent(value: number, digits = 0) {
  return new Intl.NumberFormat("fr-FR", {
    style: "percent",
    maximumFractionDigits: digits,
  }).format(value);
}

const groups: { title: string; note: string; rows: Row[] }[] = [
  {
    title: "Montants en FCFA",
    note: "Espace fine insécable (U+202F) entre les milliers, jamais de décimales, l'unité FCFA après une espace normale.",
    rows: [
      {
        rule: "Prix de vente",
        code: "formatCurrency(1000000)",
        output: formatCurrency(1000000),
      },
      {
        rule: "Prix arrondi aux milliers",
        code: "formatCurrency(990000)",
        output: formatCurrency(990000),
      },
      {
        rule: "Loyer mensuel",
        code: 'formatCurrency(50000) + " / mois"',
        output: `${formatCurrency(50000)} / mois`,
      },
      {
        rule: "Commission 7 % sur 50 000",
        code: "formatCurrency(50000 * 0.07)",
        output: formatCurrency(50000 * 0.07),
      },
      {
        rule: "Décimales supprimées",
        code: "formatCurrency(3499.6)",
        output: formatCurrency(3499.6),
      },
      {
        rule: "Nombre seul",
        code: "formatNumber(1250000)",
        output: formatNumber(1250000),
      },
      {
        rule: "Saisie utilisateur avec espaces",
        code: 'formatNumber("1 000 000")',
        output: formatNumber("1 000 000"),
      },
      {
        rule: "Valeur absente",
        code: "formatCurrency(null)",
        output: formatCurrency(null) || "(chaîne vide)",
      },
      {
        rule: "Retour au nombre",
        code: 'parsePrice("1 000 000 FCFA")',
        output: String(parsePrice("1 000 000 FCFA")),
      },
    ],
  },
  {
    title: "Coûts Studio (USD et conversion)",
    note: "Le Studio facture en dollars: deux décimales avec un point, symbole après. En FCFA, arrondi au franc supérieur pour ne jamais sous-estimer.",
    rows: [
      {
        rule: "Coût en dollars",
        code: 'formatMoney(2.5, "USD", 600)',
        output: formatMoney(2.5, "USD", rate),
      },
      {
        rule: "Micro-coût en dollars",
        code: 'formatMoney(0.004, "USD", 600)',
        output: formatMoney(0.004, "USD", rate),
      },
      {
        rule: "Même coût en FCFA",
        code: 'formatMoney(2.5, "FCFA", 600)',
        output: formatMoney(2.5, "FCFA", rate),
      },
    ],
  },
  {
    title: "Dates et heures",
    note: "Toujours en fr-FR et dans le fuseau Africa/Ouagadougou (UTC sans heure d'été), même si le staff lit depuis l'étranger.",
    rows: [
      {
        rule: "Date longue",
        code: 'date.toLocaleDateString("fr-FR", { dateStyle: "long", timeZone })',
        output: sampleDate.toLocaleDateString("fr-FR", {
          dateStyle: "long",
          timeZone: OUAGA,
        }),
      },
      {
        rule: "Date longue avec jour",
        code: 'date.toLocaleDateString("fr-FR", { dateStyle: "full", timeZone })',
        output: sampleDate.toLocaleDateString("fr-FR", {
          dateStyle: "full",
          timeZone: OUAGA,
        }),
      },
      {
        rule: "Date courte",
        code: 'date.toLocaleDateString("fr-FR", { timeZone })',
        output: sampleDate.toLocaleDateString("fr-FR", { timeZone: OUAGA }),
      },
      {
        rule: "Date et heure",
        code: 'date.toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone })',
        output: sampleDate.toLocaleString("fr-FR", {
          dateStyle: "medium",
          timeStyle: "short",
          timeZone: OUAGA,
        }),
      },
      {
        rule: "Heure seule (24 h)",
        code: 'date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone })',
        output: sampleDate.toLocaleTimeString("fr-FR", {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: OUAGA,
        }),
      },
    ],
  },
  {
    title: "Téléphones",
    note: "Stockés en E.164, affichés avec l'indicatif puis des paires de chiffres. Le numéro reste visible: au Burkina il rassure.",
    rows: [
      {
        rule: "Numéro burkinabè",
        code: 'formatPhoneDisplay("+22667006116")',
        output: formatPhoneDisplay("+22667006116"),
      },
      {
        rule: "Numéro français",
        code: 'formatPhoneDisplay("+33612345678")',
        output: formatPhoneDisplay("+33612345678"),
      },
      {
        rule: "Lien d'appel",
        code: 'href="tel:+22667006116"',
        output: "tel:+22667006116",
      },
    ],
  },
  {
    title: "Pourcentages et surfaces",
    note: "Espace insécable avant le signe %, virgule décimale, m² après une espace.",
    rows: [
      {
        rule: "Commission",
        code: 'Intl.NumberFormat("fr-FR", { style: "percent" }).format(0.07)',
        output: percent(0.07),
      },
      {
        rule: "Taux avec décimale",
        code: "...format(0.125) avec maximumFractionDigits: 1",
        output: percent(0.125, 1),
      },
      {
        rule: "Surface",
        code: 'formatNumber(12) + " m²"',
        output: `${formatNumber(12)} m²`,
      },
      {
        rule: "Grande surface",
        code: 'formatNumber(1250) + " m²"',
        output: `${formatNumber(1250)} m²`,
      },
    ],
  },
];

export function FormatsSection() {
  return (
    <GuideSection
      id="chiffres"
      number="04"
      title="Chiffres et formats"
      intro="Chaque valeur ci-dessous sort des vraies fonctions du dépôt: lib/format.ts pour les nombres et les montants, lib/studio/currency.ts pour les coûts Studio, lib/phone.ts pour les téléphones, et l'API Intl en fr-FR pour les dates. Si le rendu change ici, il change partout."
    >
      <Alert tone="info" title="Un seul formateur, partagé avec le mobile">
        <Mono>lib/format.ts</Mono> reprend à l&apos;identique les fonctions de
        l&apos;application mobile (<Mono>utils/formatting.ts</Mono>,{" "}
        <Mono>lib/i18n.tsx</Mono>): Intl.NumberFormat en français, zéro décimale,
        espace fine insécable entre les milliers, libellé FCFA à la fin. Les quatre
        anciens helpers du site (<Mono>lib/utils.ts formatPrice</Mono>,{" "}
        <Mono>lib/visites-3d.ts formatFCFA</Mono>,{" "}
        <Mono>lib/rental-period.ts formatXofAmount</Mono>,{" "}
        <Mono>lib/notification-copy.ts formatXofAmount</Mono>) sont à migrer vers
        lui.
      </Alert>

      {groups.map((group) => (
        <GuideSubsection key={group.title} title={group.title} note={group.note}>
          <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
            <ul className="divide-y divide-neutral-100">
              {group.rows.map((row) => (
                <li
                  key={row.rule}
                  className="grid gap-2 px-4 py-3 md:grid-cols-[180px_minmax(0,1fr)_auto] md:items-center md:gap-6 md:px-5"
                >
                  <p className="text-sm font-semibold text-neutral-900">
                    {row.rule}
                  </p>
                  <code className="min-w-0 break-words font-mono text-[11px] leading-5 text-neutral-500">
                    {row.code}
                  </code>
                  <p
                    suppressHydrationWarning
                    className="text-base font-bold tabular-nums text-neutral-900 md:text-right"
                  >
                    {row.output}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </GuideSubsection>
      ))}
    </GuideSection>
  );
}
