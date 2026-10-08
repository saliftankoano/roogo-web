"use client";

import { contrastRatio, formatRatio, wcagLevel } from "@/lib/color-contrast";
import { cn } from "@/lib/utils";
import {
  CopyButton,
  GuideSection,
  GuideSubsection,
  Mono,
} from "./primitives";

type Token = {
  name: string;
  variable: string;
  hex: string;
  /** Tailwind class or alias that maps to it. */
  alias?: string;
  usage: string;
};

const brandTokens: Token[] = [
  {
    name: "Terracotta Ember",
    variable: "--color-roogo-primary-500",
    hex: "#c96a2e",
    alias: "primary",
    usage: "Action principale, liens, accents",
  },
  {
    name: "Clay Brown",
    variable: "--color-roogo-primary-600",
    hex: "#8a4924",
    alias: "primary-hover",
    usage: "Survol du bouton principal, texte sur fond sable",
  },
  {
    name: "Earth Umber",
    variable: "--color-roogo-primary-700",
    hex: "#5a321a",
    usage: "Titres sur fond chaud, réserve",
  },
  {
    name: "Sand Dune",
    variable: "--color-roogo-secondary-100",
    hex: "#f4e8d7",
    alias: "secondary",
    usage: "Bouton secondaire, surfaces chaudes, survol de ligne",
  },
  {
    name: "Warm Linen",
    variable: "--color-roogo-secondary-200",
    hex: "#e8d8c5",
    usage: "Piste de curseur, séparateurs chauds",
  },
  {
    name: "Desert Night",
    variable: "--color-roogo-secondary-800",
    hex: "#2b241d",
    usage: "Texte sur fond sable quand le noir est trop froid",
  },
  {
    name: "Sahel Sky",
    variable: "--color-roogo-accent-500",
    hex: "#3fa6d9",
    alias: "accent",
    usage: "Accent décoratif, jamais pour du texte sur blanc",
  },
  {
    name: "Deep Oasis",
    variable: "--color-roogo-accent-600",
    hex: "#1f7ca5",
    usage: "Accent lisible, aussi couleur info",
  },
];

const neutralTokens: Token[] = [
  {
    name: "Neutral 900",
    variable: "--color-roogo-neutral-900",
    hex: "#1a1a1a",
    alias: "neutral-900",
    usage: "Titres et texte principal",
  },
  {
    name: "Neutral 700",
    variable: "--color-roogo-neutral-700",
    hex: "#323232",
    alias: "neutral-700",
    usage: "Texte courant",
  },
  {
    name: "Neutral 500",
    variable: "--color-roogo-neutral-500",
    hex: "#6a6a6a",
    alias: "neutral-500",
    usage: "Texte secondaire, libellés",
  },
  {
    name: "Neutral 100",
    variable: "--color-roogo-neutral-100",
    hex: "#f8f8f8",
    alias: "neutral-100",
    usage: "Fonds de squelettes, survol fantôme",
  },
];

const statusTokens: Token[] = [
  {
    name: "Acacia Green",
    variable: "--color-roogo-success-500",
    hex: "#2f8f5b",
    alias: "success",
    usage: "Succès, en ligne, payé",
  },
  {
    name: "Acacia Mist",
    variable: "--color-roogo-success-100",
    hex: "#e3f3ea",
    alias: "success-soft",
    usage: "Fond des badges et alertes de succès",
  },
  {
    name: "Acacia Deep",
    variable: "--color-roogo-success-700",
    hex: "#1f6440",
    alias: "success-strong",
    usage: "Texte sur fond succès",
  },
  {
    name: "Shea Amber",
    variable: "--color-roogo-warning-500",
    hex: "#c47a12",
    alias: "warning",
    usage: "Attention, en attente, à traiter",
  },
  {
    name: "Shea Cream",
    variable: "--color-roogo-warning-100",
    hex: "#fbefd9",
    alias: "warning-soft",
    usage: "Fond des badges et alertes d'attention",
  },
  {
    name: "Shea Deep",
    variable: "--color-roogo-warning-700",
    hex: "#8a550c",
    alias: "warning-strong",
    usage: "Texte sur fond attention",
  },
  {
    name: "Laterite Red",
    variable: "--color-roogo-danger-500",
    hex: "#c93b2e",
    alias: "danger",
    usage: "Erreur, suppression, refus",
  },
  {
    name: "Laterite Blush",
    variable: "--color-roogo-danger-100",
    hex: "#fae4e1",
    alias: "danger-soft",
    usage: "Fond des badges et alertes d'erreur",
  },
  {
    name: "Laterite Deep",
    variable: "--color-roogo-danger-700",
    hex: "#8a2820",
    alias: "danger-strong",
    usage: "Texte sur fond erreur",
  },
  {
    name: "Deep Oasis",
    variable: "--color-roogo-info-500",
    hex: "#1f7ca5",
    alias: "info",
    usage: "Information, nouveau",
  },
  {
    name: "Oasis Mist",
    variable: "--color-roogo-info-100",
    hex: "#e3f2fa",
    alias: "info-soft",
    usage: "Fond des badges et alertes d'information",
  },
  {
    name: "Oasis Deep",
    variable: "--color-roogo-info-700",
    hex: "#155a7a",
    alias: "info-strong",
    usage: "Texte sur fond information",
  },
];

type Pair = {
  label: string;
  fg: string;
  bg: string;
  fgName: string;
  bgName: string;
  where: string;
};

const WHITE = "#ffffff";

const pairs: Pair[] = [
  { label: "Titre", fg: "#1a1a1a", bg: WHITE, fgName: "neutral-900", bgName: "white", where: "Titres et texte principal" },
  { label: "Texte courant", fg: "#323232", bg: WHITE, fgName: "neutral-700", bgName: "white", where: "Paragraphes, cellules" },
  { label: "Texte secondaire", fg: "#6a6a6a", bg: WHITE, fgName: "neutral-500", bgName: "white", where: "Libellés, aide" },
  { label: "Surtitre", fg: "#a1a1a1", bg: WHITE, fgName: "neutral-400", bgName: "white", where: "En-têtes de tableau, surtitres" },
  { label: "Lien", fg: "#c96a2e", bg: WHITE, fgName: "primary", bgName: "white", where: "Liens, bouton contour" },
  { label: "Bouton principal", fg: WHITE, bg: "#c96a2e", fgName: "white", bgName: "primary", where: "Bouton principal, chip réservée" },
  { label: "Bouton principal survolé", fg: WHITE, bg: "#8a4924", fgName: "white", bgName: "primary-hover", where: "Survol du bouton principal" },
  { label: "Bouton secondaire", fg: "#1a1a1a", bg: "#f4e8d7", fgName: "neutral-900", bgName: "secondary", where: "Bouton secondaire" },
  { label: "Accent sur sable", fg: "#c96a2e", bg: "#f4e8d7", fgName: "primary", bgName: "secondary", where: "Icônes sur fond sable" },
  { label: "Badge marque", fg: "#8a4924", bg: "#f4e8d7", fgName: "primary-hover", bgName: "secondary", where: "Badge primary, chip réservée" },
  { label: "Toast", fg: WHITE, bg: "#1a1a1a", fgName: "white", bgName: "neutral-900", where: "Toast, badge par défaut, chip louée" },
  { label: "Succès plein", fg: WHITE, bg: "#2f8f5b", fgName: "white", bgName: "success", where: "Icônes pleines, points" },
  { label: "Succès doux", fg: "#1f6440", bg: "#e3f3ea", fgName: "success-strong", bgName: "success-soft", where: "Badge et alerte succès" },
  { label: "Attention plein", fg: WHITE, bg: "#c47a12", fgName: "white", bgName: "warning", where: "Icônes pleines, points" },
  { label: "Attention doux", fg: "#8a550c", bg: "#fbefd9", fgName: "warning-strong", bgName: "warning-soft", where: "Badge et alerte attention" },
  { label: "Erreur plein", fg: WHITE, bg: "#c93b2e", fgName: "white", bgName: "danger", where: "Bouton destructif" },
  { label: "Erreur doux", fg: "#8a2820", bg: "#fae4e1", fgName: "danger-strong", bgName: "danger-soft", where: "Badge et alerte erreur" },
  { label: "Info plein", fg: WHITE, bg: "#1f7ca5", fgName: "white", bgName: "info", where: "Icônes pleines" },
  { label: "Info doux", fg: "#155a7a", bg: "#e3f2fa", fgName: "info-strong", bgName: "info-soft", where: "Badge et alerte info" },
  { label: "Ciel du Sahel", fg: WHITE, bg: "#3fa6d9", fgName: "white", bgName: "accent", where: "À éviter pour du texte" },
];

function Swatch({ token }: { token: Token }) {
  return (
    <div className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white">
      <div
        className="h-16 w-full border-b border-black/5"
        style={{ backgroundColor: token.hex }}
        aria-hidden="true"
      />
      <div className="space-y-1 p-3">
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 truncate text-sm font-bold text-neutral-900">
            {token.name}
          </p>
          <CopyButton value={token.hex} label={`Copier ${token.hex}`} />
        </div>
        <p className="font-mono text-xs uppercase text-neutral-700">
          {token.hex}
        </p>
        <p className="truncate font-mono text-[11px] text-neutral-400">
          {token.variable}
        </p>
        {token.alias && (
          <p className="text-[11px] text-neutral-500">
            Classe <Mono>bg-{token.alias}</Mono> <Mono>text-{token.alias}</Mono>
          </p>
        )}
        <p className="text-xs leading-snug text-neutral-500">{token.usage}</p>
      </div>
    </div>
  );
}

function levelClass(level: ReturnType<typeof wcagLevel>) {
  switch (level) {
    case "AAA":
    case "AA":
      return "bg-success-soft text-success-strong";
    case "AA large":
      return "bg-warning-soft text-warning-strong";
    default:
      return "bg-danger-soft text-danger-strong";
  }
}

function ContrastCard({ pair }: { pair: Pair }) {
  const ratio = contrastRatio(pair.fg, pair.bg);
  const level = wcagLevel(ratio);
  return (
    <div className="flex min-w-0 overflow-hidden rounded-2xl border border-neutral-200 bg-white">
      <div
        className="flex w-24 shrink-0 flex-col items-center justify-center gap-0.5 border-r border-black/5"
        style={{ backgroundColor: pair.bg, color: pair.fg }}
        aria-hidden="true"
      >
        <span className="text-2xl font-black leading-none">Aa</span>
        <span className="text-[10px] font-semibold">texte</span>
      </div>
      <div className="min-w-0 flex-1 space-y-1 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="min-w-0 truncate text-sm font-bold text-neutral-900">
            {pair.label}
          </p>
          <span
            className={cn(
              "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
              levelClass(level),
            )}
          >
            {level}
          </span>
        </div>
        <p className="font-mono text-sm font-semibold tabular-nums text-neutral-900">
          {formatRatio(ratio)}
        </p>
        <p className="truncate font-mono text-[11px] text-neutral-500">
          text-{pair.fgName} / bg-{pair.bgName}
        </p>
        <p className="text-xs text-neutral-500">{pair.where}</p>
      </div>
    </div>
  );
}

export function ColorsSection() {
  return (
    <GuideSection
      id="couleurs"
      number="01"
      title="Couleurs"
      intro="La palette vient de app/globals.css. Les tons chauds portent la marque, les neutres portent le texte, les quatre couleurs d'état disent où en est une chose. Jamais de thème sombre."
    >
      <GuideSubsection
        title="Marque"
        note="Terracotta pour agir, sable pour reposer, ciel pour ponctuer."
      >
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
          {brandTokens.map((token) => (
            <Swatch key={token.variable} token={token} />
          ))}
        </div>
      </GuideSubsection>

      <GuideSubsection
        title="Neutres"
        note="Les autres crans (200, 300, 400, 600) viennent de Tailwind."
      >
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {neutralTokens.map((token) => (
            <Swatch key={token.variable} token={token} />
          ))}
        </div>
      </GuideSubsection>

      <GuideSubsection
        title="États"
        note="Trois crans par état: plein (500), doux (100) pour les fonds, profond (700) pour le texte posé sur le doux."
      >
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
          {statusTokens.map((token) => (
            <Swatch key={token.variable} token={token} />
          ))}
        </div>
      </GuideSubsection>

      <GuideSubsection
        title="Paires de contraste"
        note="Ratio WCAG calculé en direct. AA = 4,5:1 pour le texte courant, AA large = 3:1 pour le texte gras de 19 px et plus ou les éléments d'interface."
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {pairs.map((pair) => (
            <ContrastCard key={pair.label} pair={pair} />
          ))}
        </div>
        <p className="text-xs leading-relaxed text-neutral-500">
          Lecture honnête: le blanc sur terracotta et le surtitre neutral-400
          passent seulement en AA large. Ils restent réservés aux boutons en gras
          et aux surtitres en capitales, jamais à un paragraphe.
        </p>
      </GuideSubsection>
    </GuideSection>
  );
}
