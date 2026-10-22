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
    usage: "Bouton principal, compteur Accueil, focus",
  },
  {
    name: "Clay Brown",
    variable: "--color-roogo-primary-600",
    hex: "#8a4924",
    alias: "primary-hover",
    usage: "Surtitre d'Accueil, texte de la pastille terracotta",
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
    usage: "Bouton sable du site public",
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

// The admin palette as main renders it (components/admin/team/ui.tsx, Studio,
// the staff bar). Main writes them as hex literals; the tokens name them.
const adminTokens: Token[] = [
  { name: "Encre", variable: "--color-roogo-ink", hex: "#1f1a16", alias: "ink", usage: "Titres et texte principal, bouton encre, toast" },
  { name: "Texte courant", variable: "--color-roogo-ink-body", hex: "#4a4540", alias: "ink-body", usage: "Paragraphes, phrase du briefing, pastille grise" },
  { name: "Texte discret", variable: "--color-roogo-ink-muted", hex: "#6b625b", alias: "ink-muted", usage: "Libellés, titres de section en capitales" },
  { name: "Terracotta texte", variable: "--color-roogo-brand-text", hex: "#a8521d", alias: "brand-text", usage: "Onglet actif du Studio, lien survolé" },
  { name: "Terracotta survol", variable: "--color-roogo-brand-hover", hex: "#b85e26", alias: "brand-hover", usage: "Survol du bouton principal" },
  { name: "Filet", variable: "--color-roogo-line", hex: "#e2d8cc", alias: "line", usage: "Bordure des champs et des boutons contour" },
  { name: "Filet doux", variable: "--color-roogo-line-soft", hex: "#eae1d5", alias: "line-soft", usage: "Séparateurs dans un panneau" },
  { name: "Crème", variable: "--color-roogo-cream", hex: "#f6f1ea", alias: "cream", usage: "Fond de page d'Accueil et de L'équipe" },
  { name: "Papier", variable: "--color-roogo-paper", hex: "#fbf7f1", alias: "paper", usage: "Surface chaude dans un panneau blanc" },
];

const statusTokens: Token[] = [
  { name: "Vert plein", variable: "--color-roogo-success-500", hex: "#2f7a48", alias: "success", usage: "Coche faite, progression terminée" },
  { name: "Vert doux", variable: "--color-roogo-success-100", hex: "#e3f1e6", alias: "success-soft", usage: "Fond de la pastille verte" },
  { name: "Vert profond", variable: "--color-roogo-success-700", hex: "#245c33", alias: "success-strong", usage: "Texte sur fond vert" },
  { name: "Ambre plein", variable: "--color-roogo-warning-500", hex: "#e9a23b", alias: "warning", usage: "Badge « à valider », texte encre dessus" },
  { name: "Ambre doux", variable: "--color-roogo-warning-100", hex: "#fcefd4", alias: "warning-soft", usage: "Fond des avis d'attention" },
  { name: "Ambre profond", variable: "--color-roogo-warning-700", hex: "#6e4300", alias: "warning-strong", usage: "Texte sur fond ambre" },
  { name: "Rouge", variable: "--color-roogo-danger-500", hex: "#8e2a1e", alias: "danger", usage: "Badge en retard, texte destructif" },
  { name: "Rouge doux", variable: "--color-roogo-danger-100", hex: "#fbe3df", alias: "danger-soft", usage: "Fond des avis d'erreur, bouton Retirer" },
  { name: "Bleu", variable: "--color-roogo-info-500", hex: "#1f5f80", alias: "info", usage: "Texte d'information" },
  { name: "Bleu doux", variable: "--color-roogo-info-100", hex: "#e1eff8", alias: "info-soft", usage: "Fond de la pastille bleue" },
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

const CREAM = "#f6f1ea";

const pairs: Pair[] = [
  { label: "Titre", fg: "#1f1a16", bg: WHITE, fgName: "ink", bgName: "white", where: "Titres et texte principal" },
  { label: "Titre sur crème", fg: "#1f1a16", bg: CREAM, fgName: "ink", bgName: "cream", where: "Accueil, L'équipe" },
  { label: "Texte courant", fg: "#4a4540", bg: WHITE, fgName: "ink-body", bgName: "white", where: "Paragraphes, cellules" },
  { label: "Texte discret", fg: "#6b625b", bg: WHITE, fgName: "ink-muted", bgName: "white", where: "Libellés, titres de section" },
  { label: "Texte discret sur crème", fg: "#6b625b", bg: CREAM, fgName: "ink-muted", bgName: "cream", where: "Titres de section d'Accueil" },
  { label: "Surtitre argile", fg: "#8a4924", bg: CREAM, fgName: "[#8A4924]", bgName: "cream", where: "Date et niveau au-dessus de « Bonjour »" },
  { label: "Onglet actif", fg: "#a8521d", bg: WHITE, fgName: "brand-text", bgName: "white", where: "Onglet du Studio, entrée active" },
  { label: "Bouton principal", fg: WHITE, bg: "#c96a2e", fgName: "white", bgName: "primary", where: "Bouton terracotta, compteur Accueil" },
  { label: "Bouton principal survolé", fg: WHITE, bg: "#b85e26", fgName: "white", bgName: "brand-hover", where: "Survol du bouton terracotta" },
  { label: "Bouton encre", fg: WHITE, bg: "#1f1a16", fgName: "white", bgName: "ink", where: "Valider dans un panneau, toast" },
  { label: "Pastille terracotta", fg: "#8a4924", bg: "#f7e4d3", fgName: "[#8A4924]", bgName: "[#F7E4D3]", where: 'Chip tone="orange"' },
  { label: "Vert doux", fg: "#245c33", bg: "#e3f1e6", fgName: "success-strong", bgName: "success-soft", where: 'Chip tone="green", Flag vert' },
  { label: "Ambre plein", fg: "#1f1a16", bg: "#e9a23b", fgName: "ink", bgName: "warning", where: "Badge « à valider »" },
  { label: "Ambre doux", fg: "#6e4300", bg: "#fcefd4", fgName: "warning-strong", bgName: "warning-soft", where: "Flag ambre, avis d'attention" },
  { label: "Rouge plein", fg: WHITE, bg: "#8e2a1e", fgName: "white", bgName: "danger", where: "Badge en retard" },
  { label: "Rouge doux", fg: "#8e2a1e", bg: "#fbe3df", fgName: "danger-strong", bgName: "danger-soft", where: "Chip rouge, bouton Retirer, erreur" },
  { label: "Bleu doux", fg: "#1f5f80", bg: "#e1eff8", fgName: "info-strong", bgName: "info-soft", where: 'Chip tone="blue"' },
  { label: "Ciel du Sahel", fg: WHITE, bg: "#3fa6d9", fgName: "white", bgName: "accent", where: "À éviter pour du texte" },
];

function Swatch({ token }: { token: Token }) {
  return (
    <div className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-line bg-white">
      <div
        className="h-16 w-full border-b border-black/5"
        style={{ backgroundColor: token.hex }}
        aria-hidden="true"
      />
      <div className="space-y-1 p-3">
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 truncate text-sm font-bold text-ink">
            {token.name}
          </p>
          <CopyButton value={token.hex} label={`Copier ${token.hex}`} />
        </div>
        <p className="font-mono text-xs uppercase text-ink-body">
          {token.hex}
        </p>
        <p className="truncate font-mono text-[11px] text-[#8F867E]">
          {token.variable}
        </p>
        {token.alias && (
          <p className="text-[11px] text-ink-muted">
            Classe <Mono>bg-{token.alias}</Mono> <Mono>text-{token.alias}</Mono>
          </p>
        )}
        <p className="text-xs leading-snug text-ink-muted">{token.usage}</p>
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
    <div className="flex min-w-0 overflow-hidden rounded-2xl border border-line bg-white">
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
          <p className="min-w-0 truncate text-sm font-bold text-ink">
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
        <p className="font-mono text-sm font-semibold tabular-nums text-ink">
          {formatRatio(ratio)}
        </p>
        <p className="truncate font-mono text-[11px] text-ink-muted">
          text-{pair.fgName} / bg-{pair.bgName}
        </p>
        <p className="text-xs text-ink-muted">{pair.where}</p>
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
      intro="La palette vient de app/globals.css et reprend les valeurs que l'admin affiche aujourd'hui. Le terracotta porte l'action, l'encre et les gris chauds portent le texte, la crème sert de fond, quatre couleurs d'état disent où en est une chose. Thème clair uniquement."
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
        title="Palette de l'admin"
        note="Les tons chauds de l'équipe et du Studio, à utiliser pour tout nouvel écran admin."
      >
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
          {adminTokens.map((token) => (
            <Swatch key={token.variable} token={token} />
          ))}
        </div>
      </GuideSubsection>

      <GuideSubsection
        title="Neutres froids"
        note="Gardés pour le site public et les pages admin plus anciennes. Les autres crans viennent de Tailwind."
      >
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {neutralTokens.map((token) => (
            <Swatch key={token.variable} token={token} />
          ))}
        </div>
      </GuideSubsection>

      <GuideSubsection
        title="États"
        note="Les couleurs des pastilles de l'équipe: plein pour un badge ou une coche, doux pour un fond, profond pour le texte posé sur le doux."
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
        <p className="text-xs leading-relaxed text-ink-muted">
          Lecture honnête: le blanc sur terracotta passe seulement en AA large
          et le blanc sur ciel échoue. Le terracotta reste réservé aux boutons et aux
          compteurs en gras, jamais à un paragraphe; l&apos;ambre plein se lit
          avec du texte encre, pas blanc.
        </p>
      </GuideSubsection>
    </GuideSection>
  );
}
