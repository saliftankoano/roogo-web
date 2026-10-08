"use client";

import * as React from "react";
import {
  ArrowRightIcon,
  FloppyDiskIcon,
  PlusIcon,
  TrashIcon,
} from "@phosphor-icons/react";

import {
  Button,
  buttonSizes,
  buttonVariants,
  type ButtonSize,
  type ButtonVariant,
} from "@/components/ui/Button";
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

export function ButtonsSection() {
  const [loading, setLoading] = React.useState(false);

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
          <Mono>bold</Mono>, 18 px dans un bouton moyen, 16 px en petit. Une
          icône seule a toujours un <Mono>aria-label</Mono>.
        </p>
      </GuideSubsection>
    </GuideSection>
  );
}
