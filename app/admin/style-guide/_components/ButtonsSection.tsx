"use client";

import * as React from "react";
import {
  ArrowRightIcon,
  CheckCircleIcon,
  FloppyDiskIcon,
  PaperPlaneTiltIcon,
  PlusIcon,
  TrashIcon,
  XCircleIcon,
} from "@phosphor-icons/react";

import {
  Button,
  buttonSizes,
  buttonVariants,
  type ButtonSize,
  type ButtonVariant,
} from "@/components/ui/Button";
import { RangeInput } from "@/components/ui/range-input";
import { formatCurrency } from "@/lib/format";
import {
  GuideSection,
  GuideSubsection,
  Mono,
  Specimen,
  SpecimenGrid,
} from "./primitives";

const variants: { id: ButtonVariant; label: string; when: string }[] = [
  { id: "primary", label: "Principal", when: "L'action attendue de la page, une seule fois." },
  { id: "secondary", label: "Secondaire", when: "Action utile mais pas prioritaire." },
  { id: "outline", label: "Contour", when: "Action alternative à côté du principal." },
  { id: "ghost", label: "Fantôme", when: "Actions de barre d'outils, fermer, annuler." },
  { id: "destructive", label: "Destructif", when: "Supprimer, refuser, résilier. Toujours derrière une confirmation." },
];

const sizes: { id: ButtonSize; label: string }[] = [
  { id: "sm", label: "Petit" },
  { id: "md", label: "Moyen" },
  { id: "lg", label: "Grand" },
];

const responsiveRules: { ok: boolean; text: string }[] = [
  { ok: true, text: "Un verbe, deux ou trois mots au maximum dans le libellé." },
  { ok: true, text: "Le prix, la voix ou tout autre détail se placent à côté du bouton, jamais dedans." },
  { ok: false, text: "Ne jamais laisser une icône rétrécir: elle garde 16, 18 ou 20 px selon la taille." },
  { ok: false, text: "Ne jamais couper un libellé sur deux lignes: le bouton passe à la ligne entier, ou se tronque." },
];

export function ButtonsSection() {
  const [loading, setLoading] = React.useState(false);
  const [demoWidth, setDemoWidth] = React.useState(320);

  const simulate = () => {
    setLoading(true);
    setTimeout(() => setLoading(false), 1800);
  };

  return (
    <GuideSection
      id="boutons"
      number="06"
      title="Boutons"
      intro="Un composant, components/ui/Button.tsx, cinq variantes, trois tailles plus une taille icône. Pilule, gras, légère pression au clic (scale 0,985). Un seul bouton principal par écran."
    >
      <GuideSubsection title="Variantes et tailles" note="Chaque ligne est une variante, chaque colonne une taille.">
        <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50/50">
              <tr>
                <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-neutral-400">
                  Variante
                </th>
                {sizes.map((size) => (
                  <th
                    key={size.id}
                    className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-neutral-400"
                  >
                    {size.label} <span className="font-mono normal-case">{size.id}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {variants.map((variant) => (
                <tr key={variant.id}>
                  <td className="px-4 py-3 align-top">
                    <p className="font-bold text-neutral-900">{variant.label}</p>
                    <p className="mt-0.5 max-w-[200px] text-xs text-neutral-500">
                      {variant.when}
                    </p>
                    <code className="mt-1 block font-mono text-[11px] text-neutral-400">
                      variant=&quot;{variant.id}&quot;
                    </code>
                  </td>
                  {sizes.map((size) => (
                    <td key={size.id} className="px-4 py-3 align-middle">
                      <Button variant={variant.id} size={size.id}>
                        {variant.id === "destructive" ? "Supprimer" : "Enregistrer"}
                      </Button>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <details className="group rounded-2xl border border-neutral-200 bg-white">
          <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold text-neutral-700 transition-colors hover:text-neutral-900">
            Classes générées par variante et taille
          </summary>
          <div className="space-y-2 border-t border-neutral-100 px-4 py-3">
            {Object.entries(buttonVariants).map(([name, classes]) => (
              <p key={name} className="font-mono text-[11px] leading-5 text-neutral-600">
                <span className="font-bold text-neutral-900">{name}</span>: {classes}
              </p>
            ))}
            {Object.entries(buttonSizes).map(([name, classes]) => (
              <p key={name} className="font-mono text-[11px] leading-5 text-neutral-600">
                <span className="font-bold text-neutral-900">size {name}</span>: {classes}
              </p>
            ))}
          </div>
        </details>
      </GuideSubsection>

      <GuideSubsection
        title="États"
        note="Survol et focus se voient en direct. Les autres sont forcés par props."
      >
        <SpecimenGrid columns={3}>
          <Specimen label="Survol et pression" code="hover:bg-primary-hover enabled:active:scale-[0.985]">
            <Button>Survolez puis cliquez</Button>
          </Specimen>
          <Specimen label="Focus clavier" code="focus:ring-2 focus:ring-offset-2 focus:ring-primary">
            <Button variant="outline">Tabulez jusqu&apos;ici</Button>
          </Specimen>
          <Specimen label="Désactivé" code="disabled (opacity-50 cursor-not-allowed)">
            <div className="flex flex-wrap gap-2">
              <Button disabled>Enregistrer</Button>
              <Button variant="secondary" disabled>
                Annuler
              </Button>
            </div>
          </Specimen>
          <Specimen label="Chargement" code="loading (spinner, disabled, aria-busy)">
            <div className="flex flex-wrap items-center gap-3">
              <Button loading={loading} onClick={simulate} leftIcon={<FloppyDiskIcon size={18} weight="bold" />}>
                {loading ? "Enregistrement" : "Enregistrer"}
              </Button>
              <span className="text-xs text-neutral-500">Cliquez pour simuler 1,8 s.</span>
            </div>
          </Specimen>
          <Specimen label="Icône à gauche" code="leftIcon={<PlusIcon size={18} weight='bold' />}">
            <Button variant="secondary" leftIcon={<PlusIcon size={18} weight="bold" />}>
              Nouvelle annonce
            </Button>
          </Specimen>
          <Specimen label="Icône à droite" code="rightIcon={<ArrowRightIcon size={18} weight='bold' />}">
            <Button variant="outline" rightIcon={<ArrowRightIcon size={18} weight="bold" />}>
              Continuer
            </Button>
          </Specimen>
          <Specimen label="Icône seule" code='size="icon" aria-label="Supprimer"'>
            <div className="flex flex-wrap gap-2">
              <Button size="icon" aria-label="Ajouter">
                <PlusIcon size={20} weight="bold" />
              </Button>
              <Button size="icon" variant="ghost" aria-label="Supprimer">
                <TrashIcon size={20} weight="bold" />
              </Button>
              <Button size="icon" variant="destructive" aria-label="Supprimer définitivement">
                <TrashIcon size={20} weight="bold" />
              </Button>
            </div>
          </Specimen>
          <Specimen label="Pleine largeur" code="fullWidth">
            <Button fullWidth>Publier l&apos;annonce</Button>
          </Specimen>
          <Specimen label="Destructif avec icône" code='variant="destructive" leftIcon={...}'>
            <Button variant="destructive" leftIcon={<TrashIcon size={18} weight="bold" />}>
              Supprimer l&apos;annonce
            </Button>
          </Specimen>
        </SpecimenGrid>
        <p className="text-xs leading-relaxed text-neutral-500">
          Les icônes viennent de <Mono>@phosphor-icons/react</Mono> en graisse{" "}
          <Mono>bold</Mono>. Le bouton impose leur taille (16 px en petit, 18 px
          en moyen, 20 px en grand et en icône seule), quelle que soit la prop{" "}
          <Mono>size</Mono> passée à l&apos;icône. Une icône seule a toujours un{" "}
          <Mono>aria-label</Mono>.
        </p>
      </GuideSubsection>

      <GuideSubsection
        title="Règles de réactivité"
        note="Hauteur fixe par taille (h-9, h-11, h-12), libellé sur une ligne, icône qui ne rétrécit jamais."
      >
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)]">
          <Specimen
            label="Colonne étroite"
            code='whitespace-nowrap sur le libellé · icône shrink-0 dans une boîte fixe · truncate pour couper avec une ellipse et un title'
          >
            <div className="space-y-4">
              <RangeInput
                aria-label="Largeur de la colonne"
                min={160}
                max={480}
                step={8}
                value={demoWidth}
                onChange={(event) => setDemoWidth(Number(event.target.value))}
                showValue
                formatValue={(value) => `${value} px`}
              />
              <div
                className="max-w-full space-y-3 rounded-2xl border border-dashed border-neutral-300 bg-neutral-50/60 p-3"
                style={{ width: demoWidth }}
              >
                <div className="flex items-center justify-between gap-3 rounded-xl bg-white p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold tabular-nums text-neutral-900">
                      {formatCurrency(50000)} / mois
                    </p>
                    <p className="truncate text-xs text-neutral-500">
                      Studio meublé, Pissy
                    </p>
                  </div>
                  <Button
                    size="sm"
                    rightIcon={<ArrowRightIcon weight="bold" />}
                  >
                    Réserver
                  </Button>
                </div>
                <Button
                  fullWidth
                  truncate
                  leftIcon={<PaperPlaneTiltIcon weight="bold" />}
                >
                  Envoyer la demande
                </Button>
                <div className="flex flex-wrap justify-end gap-2">
                  <Button variant="ghost" size="sm">
                    Annuler
                  </Button>
                  <Button size="sm" leftIcon={<CheckCircleIcon weight="bold" />}>
                    Confirmer
                  </Button>
                </div>
              </div>
              <p className="text-xs leading-relaxed text-neutral-500">
                Réduisez à 160 px: le prix se tronque avant le bouton, le bouton
                pleine largeur coupe son libellé avec une ellipse (survolez-le pour
                lire le titre), les deux actions passent à la ligne ensemble. Aucune
                icône ne change de taille.
              </p>
            </div>
          </Specimen>

          <div className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">
              Règles
            </p>
            <ul className="space-y-2.5">
              {responsiveRules.map((rule) => (
                <li
                  key={rule.text}
                  className="flex items-start gap-2 text-sm leading-relaxed text-neutral-700"
                >
                  {rule.ok ? (
                    <CheckCircleIcon
                      size={16}
                      weight="fill"
                      className="mt-0.5 shrink-0 text-success"
                      aria-hidden="true"
                    />
                  ) : (
                    <XCircleIcon
                      size={16}
                      weight="fill"
                      className="mt-0.5 shrink-0 text-danger"
                      aria-hidden="true"
                    />
                  )}
                  {rule.text}
                </li>
              ))}
            </ul>
            <p className="text-xs leading-relaxed text-neutral-500">
              Le libellé tronqué reste lisible grâce à <Mono>title</Mono>, ajouté
              automatiquement quand <Mono>truncate</Mono> reçoit un texte simple.
            </p>
          </div>
        </div>
      </GuideSubsection>
    </GuideSection>
  );
}
