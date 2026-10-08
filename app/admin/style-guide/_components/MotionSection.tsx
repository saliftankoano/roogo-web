"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowsClockwiseIcon,
  CheckCircleIcon,
  HouseLineIcon,
  ShuffleIcon,
} from "@phosphor-icons/react";

import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/alert";
import { roogoMotion } from "@/lib/motion";
import { formatCurrency } from "@/lib/format";
import { formatMoney } from "@/lib/studio/currency";
import { cn } from "@/lib/utils";
import {
  GuideSection,
  GuideSubsection,
  Mono,
  Specimen,
  SpecimenGrid,
} from "./primitives";

const tokens = [
  {
    name: "Rapide",
    variable: "--motion-duration-quick",
    value: "160 ms",
    js: "roogoMotion.quick",
    when: "Retour immédiat: survol, pression, bascule, apparition d'une coche.",
  },
  {
    name: "Standard",
    variable: "--motion-duration-standard",
    value: "260 ms",
    js: "roogoMotion.standard",
    when: "Changement de vue: panneau, modale, onglet, ligne qui apparaît.",
  },
  {
    name: "Posé",
    variable: "--motion-duration-deliberate",
    value: "420 ms",
    js: "roogoMotion.deliberate",
    when: "Grandes révélations: entrée de page, barre de progression, grille entière.",
  },
  {
    name: "Courbe",
    variable: "--motion-ease-out",
    value: "cubic-bezier(0.22, 1, 0.36, 1)",
    js: "roogoEase",
    when: "La seule courbe. Démarre vite, se pose doucement, jamais de rebond.",
  },
  {
    name: "Ressort",
    variable: "roogoMotion.spring",
    value: "stiffness 520, damping 42, mass 0.7",
    js: "layout / layoutId",
    when: "Éléments qui changent de place: pilule de navigation, liste réordonnée.",
  },
];

const engines = [
  {
    name: "Transitions CSS",
    status: "En place",
    use: "Survol, focus, pression, changement de couleur. Classes transition-* de Tailwind avec duration-150.",
  },
  {
    name: "Framer Motion",
    status: "En place",
    use: "Entrée et sortie de composants React (AnimatePresence), changement de place (layout). Reste acceptable pour ces cas simples.",
  },
  {
    name: "GSAP",
    status: "Prévu",
    use: "Moteur retenu pour les animations orchestrées: séquences, timelines, scrubbing, chorégraphies à plusieurs éléments. Pas encore dans package.json; à ajouter quand le premier cas réel arrive.",
  },
];

const panels = {
  loyers: {
    label: "Loyers",
    rows: ["Villa 4 pièces, 350 000 F", "Studio meublé, 75 000 F", "Boutique 24 m², 60 000 F"],
  },
  candidatures: {
    label: "Candidatures",
    rows: ["Awa Ouédraogo, villa Ouaga 2000", "Issa Sawadogo, studio Pissy"],
  },
} as const;

type PanelKey = keyof typeof panels;

const initialList = [
  { id: "a", label: "Villa 4 pièces à Ouaga 2000" },
  { id: "b", label: "Studio meublé à Pissy" },
  { id: "c", label: "Boutique à Gounghin" },
  { id: "d", label: "Appartement à Koulouba" },
];

function shuffle<T>(items: T[]): T[] {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

export function MotionSection() {
  const reduceMotion = useReducedMotion();
  const [cardKey, setCardKey] = React.useState(0);
  const [panel, setPanel] = React.useState<PanelKey>("loyers");
  const [list, setList] = React.useState(initialList);
  const [currency, setCurrency] = React.useState<"FCFA" | "USD">("FCFA");
  const [amountIndex, setAmountIndex] = React.useState(0);

  const amounts = [3.5, 12.25, 0.4];
  const usd = amounts[amountIndex % amounts.length];
  const shown = formatMoney(usd, currency, 600);

  return (
    <GuideSection
      id="mouvement"
      number="03"
      title="Mouvement"
      intro="Chaque changement de vue ou d'état est animé: simplement, élégamment, sans à-coup. Le mouvement oriente (d'où ça vient), confirme (l'action est reçue) ou guide (où regarder ensuite). S'il ne fait aucun des trois, on l'enlève."
    >
      <GuideSubsection
        title="Jetons"
        note="Définis dans app/globals.css et repris dans lib/motion.ts pour Framer Motion."
      >
        <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
          <ul className="divide-y divide-neutral-100">
            {tokens.map((token) => (
              <li
                key={token.variable}
                className="grid gap-2 px-4 py-3 md:grid-cols-[120px_minmax(0,1fr)_minmax(0,1.4fr)] md:items-center md:gap-6 md:px-5"
              >
                <p className="text-sm font-bold text-neutral-900">{token.name}</p>
                <div className="min-w-0">
                  <p className="font-mono text-sm font-semibold tabular-nums text-neutral-900">
                    {token.value}
                  </p>
                  <p className="truncate font-mono text-[11px] text-neutral-400">
                    {token.variable} · {token.js}
                  </p>
                </div>
                <p className="text-xs leading-relaxed text-neutral-500">{token.when}</p>
              </li>
            ))}
          </ul>
        </div>
      </GuideSubsection>

      <GuideSubsection title="Moteurs" note="Trois outils, chacun à sa place.">
        <div className="grid gap-4 md:grid-cols-3">
          {engines.map((engine) => (
            <div
              key={engine.name}
              className="space-y-2 rounded-2xl border border-neutral-200 bg-white p-4"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-bold text-neutral-900">{engine.name}</p>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                    engine.status === "Prévu"
                      ? "bg-info-soft text-info-strong"
                      : "bg-success-soft text-success-strong",
                  )}
                >
                  {engine.status}
                </span>
              </div>
              <p className="text-xs leading-relaxed text-neutral-500">{engine.use}</p>
            </div>
          ))}
        </div>
      </GuideSubsection>

      <GuideSubsection
        title="Mouvement réduit"
        note="Quand le système demande moins d'animation, tout passe à 1 ms."
      >
        <Specimen code="@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 1ms !important; transition-duration: 1ms !important; } }  +  <MotionConfig reducedMotion='user'>">
          <p className="text-sm text-neutral-600">
            Deux garde-fous: la règle CSS globale dans globals.css, et{" "}
            <Mono>MotionConfig reducedMotion=&quot;user&quot;</Mono> dans
            AppMotionProvider pour Framer Motion. Les démos ci-dessous suivent
            votre réglage système
            {reduceMotion ? " (mouvement réduit actif)" : " (mouvement complet)"}.
          </p>
        </Specimen>
      </GuideSubsection>

      <GuideSubsection title="Exemples en direct" note="Cliquez pour rejouer chaque mouvement.">
        <SpecimenGrid columns={2}>
          <Specimen
            label="Pression de bouton (CSS, 150 ms)"
            code="transition-[color,background-color,transform] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] enabled:active:scale-[0.985]"
          >
            <div className="flex flex-wrap items-center gap-3">
              <Button>Maintenez le clic</Button>
              <Button variant="secondary">Puis celui-ci</Button>
            </div>
          </Specimen>

          <Specimen
            label="Carte qui entre (Framer Motion, standard)"
            code="initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={roogoMotion.standard}"
          >
            <div className="space-y-3">
              <div className="h-24">
                <motion.div
                  key={cardKey}
                  initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={roogoMotion.standard}
                  className="flex h-full items-center gap-3 rounded-xl border border-neutral-200 bg-white p-3 shadow-sm"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-primary">
                    <HouseLineIcon size={20} weight="bold" />
                  </span>
                  <div>
                    <p className="text-sm font-bold text-neutral-900">Nouvelle annonce</p>
                    <p className="text-xs text-neutral-500">Villa 4 pièces, Ouaga 2000</p>
                  </div>
                </motion.div>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setCardKey((k) => k + 1)}
                leftIcon={<ArrowsClockwiseIcon size={16} weight="bold" />}
              >
                Rejouer
              </Button>
            </div>
          </Specimen>

          <Specimen
            label="Changement de vue (fondu + glissement 8 px)"
            code='<AnimatePresence mode="wait" initial={false}> initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }}'
          >
            <div className="space-y-3">
              <div className="inline-flex rounded-full bg-neutral-100 p-1">
                {(Object.keys(panels) as PanelKey[]).map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setPanel(key)}
                    aria-pressed={panel === key}
                    className="relative rounded-full px-4 py-1.5 text-sm font-semibold text-neutral-600 transition-colors duration-150 aria-pressed:text-primary"
                  >
                    {panel === key && (
                      <motion.span
                        layoutId="style-guide-view-pill"
                        transition={roogoMotion.spring}
                        className="absolute inset-0 rounded-full bg-white shadow-sm"
                      />
                    )}
                    <span className="relative">{panels[key].label}</span>
                  </button>
                ))}
              </div>
              <div className="relative h-28 overflow-hidden rounded-xl border border-neutral-200 bg-white">
                <AnimatePresence mode="wait" initial={false}>
                  <motion.ul
                    key={panel}
                    initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -8 }}
                    transition={roogoMotion.standard}
                    className="absolute inset-0 divide-y divide-neutral-100"
                  >
                    {panels[panel].rows.map((row) => (
                      <li key={row} className="px-3 py-2 text-sm text-neutral-700">
                        {row}
                      </li>
                    ))}
                  </motion.ul>
                </AnimatePresence>
              </div>
            </div>
          </Specimen>

          <Specimen
            label="Liste réordonnée (layout + ressort)"
            code="<motion.li layout transition={roogoMotion.spring}>"
          >
            <div className="space-y-3">
              <ul className="space-y-1.5">
                {list.map((item, index) => (
                  <motion.li
                    key={item.id}
                    layout
                    transition={reduceMotion ? { duration: 0 } : roogoMotion.spring}
                    className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-700"
                  >
                    <span className="w-5 font-mono text-[11px] tabular-nums text-neutral-400">
                      {index + 1}
                    </span>
                    {item.label}
                  </motion.li>
                ))}
              </ul>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setList((current) => shuffle(current))}
                leftIcon={<ShuffleIcon size={16} weight="bold" />}
              >
                Mélanger
              </Button>
            </div>
          </Specimen>
        </SpecimenGrid>
      </GuideSubsection>

      <GuideSubsection
        title="Zéro décalage de mise en page"
        note="Changer un état ne doit jamais déplacer ce qui l'entoure."
      >
        <SpecimenGrid columns={2}>
          <Specimen
            label="Sans réserve: le texte autour bouge"
            code="(à ne pas faire) le badge et le montant prennent la largeur de leur contenu"
          >
            <p className="text-sm text-neutral-700">
              Coût{" "}
              <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-bold text-neutral-700">
                {currency}
              </span>{" "}
              estimé à <span className="font-bold text-neutral-900">{shown}</span>{" "}
              pour cette génération.
            </p>
          </Specimen>
          <Specimen
            label="Avec réserve: rien ne bouge"
            code="badge w-14 text-center · montant inline-block min-w-[9ch] text-right tabular-nums"
          >
            <p className="text-sm text-neutral-700">
              Coût{" "}
              <span className="inline-block w-14 rounded-full bg-neutral-100 px-2 py-0.5 text-center text-xs font-bold text-neutral-700">
                {currency}
              </span>{" "}
              estimé à{" "}
              <span className="inline-block min-w-[9ch] text-right font-bold tabular-nums text-neutral-900">
                {shown}
              </span>{" "}
              pour cette génération.
            </p>
          </Specimen>
        </SpecimenGrid>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setCurrency((c) => (c === "FCFA" ? "USD" : "FCFA"))}
          >
            Basculer FCFA / $
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setAmountIndex((i) => i + 1)}
          >
            Changer le montant
          </Button>
        </div>
        <ul className="space-y-1.5 text-sm text-neutral-700">
          {[
            "Réserver la largeur de la valeur la plus longue (w-*, min-w-[Nch]).",
            "tabular-nums sur tout nombre qui change: compteur, montant, horloge.",
            "Ne jamais échanger un texte de longueur différente sans boîte fixe.",
            "Un squelette a exactement la hauteur du contenu qu'il remplace.",
          ].map((rule) => (
            <li key={rule} className="flex items-start gap-2">
              <CheckCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-success" />
              {rule}
            </li>
          ))}
        </ul>
        <p className="text-xs text-neutral-500">
          Exemple réel: {formatCurrency(1250000)} et 2 083,33 $ n&apos;ont pas la même
          longueur; sans réserve, la phrase saute à chaque bascule.
        </p>
      </GuideSubsection>

      <GuideSubsection title="À éviter">
        <Alert tone="danger" title="Trois fautes qui cassent la fluidité" icon={null}>
          <ul className="mt-1 list-disc space-y-1 pl-4">
            <li>
              Animer width, height, top ou margin. Seuls <Mono>transform</Mono> et{" "}
              <Mono>opacity</Mono> restent fluides sur un téléphone d&apos;entrée de
              gamme.
            </li>
            <li>
              Dépasser 420 ms pour un mouvement d&apos;interface. Au-delà, l&apos;outil
              paraît lent, pas élégant.
            </li>
            <li>
              Un mouvement sans version réduite. Toute animation infinie ou décorative
              doit vérifier <Mono>useReducedMotion</Mono>.
            </li>
          </ul>
        </Alert>
        <p className="text-xs text-neutral-500">
          Le script <Mono>npm run motion:audit</Mono> bloque le build sur les écarts les
          plus fréquents (déplacements de 20 px et plus, scale sous 98 %, durées au-delà
          de 500 ms, rebonds).
        </p>
      </GuideSubsection>
    </GuideSection>
  );
}
