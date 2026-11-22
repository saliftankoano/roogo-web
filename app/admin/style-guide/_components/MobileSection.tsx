"use client";

import {
  HeartIcon,
  HouseIcon,
  UserIcon,
  WalletIcon,
} from "@phosphor-icons/react";

import { cn } from "@/lib/utils";
import {
  GuideSection,
  GuideSubsection,
  Mono,
  Specimen,
  SpecimenGrid,
} from "./primitives";

type Rule = { rule: string; target: string; today: string };

// "Aujourd'hui" est relevé dans le code de l'app Expo (dossier roogo/) le
// 2026-11-22. Les cibles viennent du chantier de refonte mobile: elles ne sont
// pas encore dans l'app.
const pressRules: Rule[] = [
  {
    rule: "Pression",
    target: "Un seul composant Pressable: échelle 0,98 dès le toucher, retour en 160 ms.",
    today: "TouchableOpacity dans 92 fichiers, 11 valeurs d'opacité différentes, deux boutons en double.",
  },
  {
    rule: "Zone tactile",
    target: "44 px au minimum. Le dessin peut être plus petit, la zone non (hitSlop).",
    today: "Boutons ronds de 32 à 40 px, pastilles de 36 px.",
  },
  {
    rule: "Bouton principal",
    target: "Pilule de 56 px, texte blanc sur #B85E26 (4,5 contre 1). Un seul par écran.",
    today: "54 px, texte blanc sur #C96A2E (3,8 contre 1).",
  },
  {
    rule: "Désactivé",
    target: "Même forme, opacité 50 %. Jamais un gris plein qui change la forme.",
    today: "Deux versions du bouton, l'une grise à part.",
  },
];

const motionBars = [
  { name: "Rapide", ms: 160, width: "w-24", use: "Pression, couleur, coche, bascule." },
  { name: "Standard", ms: 260, width: "w-40", use: "Feuille, première entrée d'un écran." },
  { name: "Posé", ms: 420, width: "w-64", use: "Première révélation seulement." },
] as const;

const motionRules: string[] = [
  "Une seule courbe, celle du web: cubic-bezier(0.22, 1, 0.36, 1). Jamais de rebond.",
  "Feuille: ressort stiffness 520, damping 42, mass 0.7, avec la vitesse du doigt au relâché.",
  "L'entrée en cascade joue une fois par écran, quatre éléments au plus, 40 ms entre chaque. Changer d'onglet ne rejoue rien.",
  "Un écran poussé arrive par la droite et repart par la droite, avec le glissement du bord pour revenir (animation native de la pile).",
  "Réduire les animations: les glissements deviennent un fondu de 150 ms, le squelette arrête de briller, la pression passe à 0,8 d'opacité.",
];

const haptics: { moment: string; type: string; call: string }[] = [
  { moment: "Favori ajouté ou retiré", type: "Sélection", call: "selectionAsync()" },
  { moment: "Envoyer un message, réserver", type: "Impact léger", call: "impactAsync(Light)" },
  { moment: "Paiement reçu, dossier envoyé", type: "Succès", call: "notificationAsync(Success)" },
  { moment: "Erreur, paiement refusé", type: "Erreur", call: "notificationAsync(Error)" },
  { moment: "Cran d'une feuille ou d'un curseur", type: "Sélection", call: "selectionAsync()" },
  { moment: "Changer d'onglet, défiler", type: "Aucun", call: "volontairement muet" },
];

const typeRules: string[] = [
  "Urbanist partout, comme le web. Plancher de 12 px, corps de 15 px sur 24, détail de 14 px.",
  "Les hauteurs sont des minimums (minHeight), jamais fixes: un bouton grandit avec le texte.",
  "La barre d'onglets et les pastilles plafonnent la taille du texte à 1,2 (maxFontSizeMultiplier); le reste suit le réglage du téléphone.",
  "Texte secondaire en #6B625B sur la crème ou le blanc (5,3 contre 1 au moins).",
];

function RuleTable({ rows }: { rows: Rule[] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-white">
      <table className="w-full text-sm">
        <thead className="border-b border-line bg-paper">
          <tr>
            {["Règle", "Cible", "Aujourd'hui dans l'app"].map((h) => (
              <th
                key={h}
                className="px-4 py-3 text-left text-[11px] font-extrabold uppercase tracking-[0.06em] text-ink-muted"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line-soft">
          {rows.map((row) => (
            <tr key={row.rule}>
              <td className="px-4 py-3 align-top font-bold text-ink">{row.rule}</td>
              <td className="px-4 py-3 align-top text-ink-body">{row.target}</td>
              <td className="px-4 py-3 align-top text-ink-muted">{row.today}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TabItem({
  icon: Icon,
  label,
  active,
}: {
  icon: typeof HouseIcon;
  label: string;
  active?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-1 flex-col items-center justify-center gap-0.5",
        active ? "text-[#A8521D]" : "text-ink-muted",
      )}
    >
      <Icon size={24} weight={active ? "fill" : "bold"} className={active ? "text-primary" : undefined} />
      <span className="text-xs font-bold leading-[14px]">{label}</span>
    </div>
  );
}

export function MobileSection() {
  return (
    <GuideSection
      id="mobile"
      number="12"
      title="Application mobile"
      intro="Mêmes couleurs, même police et même courbe que l'admin. Ici s'ajoutent la pression, les zones tactiles, le retour haptique et les feuilles de l'app Expo. Ce sont les cibles du chantier de refonte, pas encore dans l'app: la colonne « Aujourd'hui » dit ce qui existe."
    >
      <GuideSubsection title="Pression et zones tactiles" note="Relevé dans l'app le 22 novembre 2026.">
        <RuleTable rows={pressRules} />
        <SpecimenGrid columns={2}>
          <Specimen
            label="Pression"
            code="active:scale-[0.98] transition-transform duration-[160ms] motion-reduce:transition-none"
          >
            <div className="flex items-center gap-4">
              <button
                type="button"
                className="h-14 rounded-full bg-[#B85E26] px-8 text-[17px] font-extrabold text-white transition-transform duration-[160ms] active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100 motion-reduce:active:opacity-80"
              >
                Contacter
              </button>
              <p className="text-xs text-ink-muted">Maintenez le bouton: il rétrécit tout de suite.</p>
            </div>
          </Specimen>
          <Specimen label="Zone tactile de 44 px" code="dessin 28 px dans une zone de 44 px">
            <div className="flex items-center gap-4">
              <span className="relative flex h-11 w-11 items-center justify-center rounded-full border border-dashed border-[#C96A2E]">
                <span className="h-7 w-7 rounded-full bg-white shadow-[0_1px_4px_rgba(0,0,0,0.25)] ring-1 ring-black/5" />
              </span>
              <p className="text-xs text-ink-muted">Le curseur se dessine en 28 px, le doigt trouve 44 px.</p>
            </div>
          </Specimen>
        </SpecimenGrid>
      </GuideSubsection>

      <GuideSubsection title="Mouvement" note="Les durées du guide web, plus le ressort de la feuille.">
        <Specimen>
          <div className="space-y-3">
            {motionBars.map((bar) => (
              <div key={bar.name} className="grid grid-cols-[96px_1fr] items-center gap-4 sm:grid-cols-[96px_280px_64px_1fr]">
                <span className="text-sm font-bold text-ink">{bar.name}</span>
                <span className="hidden h-2.5 rounded-full bg-[#E2D8CC] sm:block">
                  <span className={cn("block h-2.5 rounded-full bg-[#C96A2E]", bar.width)} />
                </span>
                <span className="hidden text-xs text-ink-muted sm:block">{bar.ms} ms</span>
                <span className="text-sm text-ink-body">{bar.use}</span>
              </div>
            ))}
          </div>
        </Specimen>
        <ul className="list-disc space-y-1.5 pl-5 text-[15px] leading-[1.45] text-ink-body">
          {motionRules.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
        <p className="text-xs text-ink-muted">
          Aujourd&apos;hui: pile racine et onglets en <Mono>animation: none</Mono>, 53 entrées en cascade (80 ms entre chaque), 11 animations pilotées depuis le thread JS.
        </p>
      </GuideSubsection>

      <GuideSubsection title="Retour haptique" note="Seulement quand quelque chose est validé. Jamais au défilement ni aux onglets.">
        <div className="overflow-x-auto rounded-2xl border border-line bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-line bg-paper">
              <tr>
                {["Moment", "Type", "expo-haptics"].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-[11px] font-extrabold uppercase tracking-[0.06em] text-ink-muted"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {haptics.map((row) => (
                <tr key={row.moment}>
                  <td className="px-4 py-3 text-ink">{row.moment}</td>
                  <td className="px-4 py-3 font-bold text-ink">{row.type}</td>
                  <td className="px-4 py-3">
                    <Mono>{row.call}</Mono>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-ink-muted">
          Aujourd&apos;hui: 5 fichiers seulement (l&apos;accueil guidé et un curseur), une seule force d&apos;impact dans <Mono>lib/haptics.ts</Mono>.
        </p>
      </GuideSubsection>

      <GuideSubsection title="Texte" note="Urbanist, comme le reste.">
        <ul className="list-disc space-y-1.5 pl-5 text-[15px] leading-[1.45] text-ink-body">
          {typeRules.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
        <p className="text-xs text-ink-muted">
          Aujourd&apos;hui: 13 px est la taille la plus courante (163 usages), 17 usages de 9 à 10 px, aucune limite de taille de texte.
        </p>
      </GuideSubsection>

      <GuideSubsection title="Barre d'onglets, feuille et chargement">
        <SpecimenGrid columns={3}>
          <Specimen label="Barre d'onglets" code="pilule 64 px, libellé 12 px, icône pleine + #A8521D quand actif">
            <div className="mx-auto flex h-16 max-w-[280px] items-stretch rounded-full bg-white px-2 shadow-[0_4px_16px_rgba(0,0,0,0.08)] ring-1 ring-black/5">
              <TabItem icon={HouseIcon} label="Accueil" active />
              <TabItem icon={HeartIcon} label="Favoris" />
              <TabItem icon={WalletIcon} label="Paiements" />
              <TabItem icon={UserIcon} label="Profil" />
            </div>
            <p className="mt-3 text-xs text-ink-muted">Un composant hors du rendu de la mise en page: il ne se recrée plus à chaque changement d&apos;état. Les onglets ne s&apos;animent pas.</p>
          </Specimen>
          <Specimen label="Feuille" code="poignée 40 x 5, deux crans, fond #1F1A16 à 42 %">
            <div className="relative mx-auto h-40 max-w-[240px] overflow-hidden rounded-xl bg-[#1F1A16]/40">
              <div className="absolute inset-x-0 bottom-0 h-28 rounded-t-[22px] bg-white px-4 pt-2 shadow-[0_-8px_24px_rgba(0,0,0,0.12)]">
                <div className="mx-auto h-[5px] w-10 rounded-full bg-[#D1C9BE]" />
                <p className="mt-3 text-sm font-extrabold text-ink">Filtres</p>
              </div>
            </div>
            <p className="mt-3 text-xs text-ink-muted">Se glisse, s&apos;attrape en route, se ferme au geste. Aujourd&apos;hui: 25 fenêtres « slide », ni poignée ni geste.</p>
          </Specimen>
          <Specimen label="Chargement" code="squelette #EAE1D5, 1,6 s, arrêt si réduire les animations">
            <div className="space-y-2">
              <div className="h-20 animate-pulse rounded-xl bg-[#EAE1D5] motion-reduce:animate-none" />
              <div className="h-4 w-3/5 animate-pulse rounded bg-[#EAE1D5] motion-reduce:animate-none" />
              <div className="h-3.5 w-4/5 animate-pulse rounded bg-[#EAE1D5] motion-reduce:animate-none" />
            </div>
            <p className="mt-3 text-xs text-ink-muted">À la forme de la vraie carte. Le rond qui tourne reste pour un bouton, moins de 2 s. Aujourd&apos;hui: 57 fichiers avec un rond, 2 avec un squelette.</p>
          </Specimen>
        </SpecimenGrid>
      </GuideSubsection>
    </GuideSection>
  );
}
