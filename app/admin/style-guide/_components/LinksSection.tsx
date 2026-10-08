import { TextLink, textLinkVariants } from "@/components/ui/text-link";
import {
  GuideSection,
  GuideSubsection,
  Mono,
  Specimen,
  SpecimenGrid,
} from "./primitives";

export function LinksSection() {
  return (
    <GuideSection
      id="liens"
      number="05"
      title="Liens et survol"
      intro="Un lien se reconnaît sans sa couleur: soulignement léger au repos, plein au survol. Le focus clavier est l'anneau terracotta global défini dans globals.css, le même sur tous les éléments interactifs."
    >
      <GuideSubsection title="Variantes" note="Survolez et tabulez pour voir les états.">
        <SpecimenGrid columns={3}>
          <Specimen label="Lien principal" code={textLinkVariants.primary}>
            <p className="text-sm text-neutral-700">
              Consultez la{" "}
              <TextLink href="/admin/annonces">liste des annonces</TextLink>{" "}
              avant de valider.
            </p>
          </Specimen>
          <Specimen label="Lien discret" code={textLinkVariants.muted}>
            <p className="text-sm text-neutral-700">
              Déjà traité ?{" "}
              <TextLink href="/admin/modifications" variant="muted">
                Voir l&apos;historique
              </TextLink>
            </p>
          </Specimen>
          <Specimen label="Lien externe" code={textLinkVariants.external}>
            <p className="text-sm text-neutral-700">
              Fiche publique sur{" "}
              <TextLink href="https://www.roogobf.com" variant="external">
                roogobf.com
              </TextLink>
            </p>
          </Specimen>
        </SpecimenGrid>
      </GuideSubsection>

      <GuideSubsection
        title="Focus clavier"
        note="Règle globale: outline 2 px terracotta à 72 %, décalé de 3 px."
      >
        <SpecimenGrid columns={2}>
          <Specimen
            label="Anneau global"
            code=":where(button, a, input, select, textarea):focus-visible { outline: 2px solid color-mix(in srgb, var(--color-roogo-primary-500) 72%, white); outline-offset: 3px; }"
          >
            <div className="flex flex-wrap items-center gap-4">
              <a
                href="#liens"
                className="rounded-md text-sm font-semibold text-primary underline decoration-primary/30 underline-offset-4"
              >
                Tabulez jusqu&apos;ici
              </a>
              <button
                type="button"
                className="rounded-full border border-neutral-200 px-4 py-2 text-sm font-semibold text-neutral-700"
              >
                puis ici
              </button>
            </div>
          </Specimen>
          <Specimen
            label="Survol de ligne"
            code="hover:bg-secondary/40 transition-colors duration-100"
          >
            <ul className="divide-y divide-neutral-100 overflow-hidden rounded-xl border border-neutral-200">
              {["Villa à Ouaga 2000", "Studio à Pissy", "Boutique à Gounghin"].map(
                (item) => (
                  <li
                    key={item}
                    className="cursor-pointer px-4 py-2.5 text-sm text-neutral-700 transition-colors duration-100 hover:bg-secondary/40"
                  >
                    {item}
                  </li>
                ),
              )}
            </ul>
          </Specimen>
        </SpecimenGrid>
        <p className="text-xs text-neutral-500">
          Les boutons gardent en plus leur anneau{" "}
          <Mono>focus:ring-2 focus:ring-offset-2</Mono> coloré selon la variante.
        </p>
      </GuideSubsection>
    </GuideSection>
  );
}
