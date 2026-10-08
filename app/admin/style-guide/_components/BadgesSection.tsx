import { Badge } from "@/components/ui/badge";
import {
  LISTING_STATUS,
  StatusBadge,
  type ListingStatus,
} from "@/components/ui/status-badge";
import {
  GuideSection,
  GuideSubsection,
  Mono,
  Specimen,
  SpecimenGrid,
} from "./primitives";

const badgeVariants = [
  { variant: "default", label: "Par défaut", when: "Compteurs, étiquettes neutres fortes" },
  { variant: "secondary", label: "Secondaire", when: "Étiquettes discrètes, filtres actifs" },
  { variant: "outline", label: "Contour", when: "Métadonnées, sources, villes" },
  { variant: "primary", label: "Marque", when: "Mis en avant, premium, parrainé" },
  { variant: "success", label: "Succès", when: "Payé, vérifié, en ligne" },
  { variant: "warning", label: "Attention", when: "En attente, à relancer" },
  { variant: "danger", label: "Erreur", when: "Refusé, en retard, litige" },
  { variant: "info", label: "Info", when: "Nouveau, importé, brouillon" },
] as const;

export function BadgesSection() {
  return (
    <GuideSection
      id="badges"
      number="09"
      title="Badges et statuts"
      intro="Deux familles: le Badge générique (components/ui/badge.tsx) pour étiqueter n'importe quoi, et le StatusBadge (components/ui/status-badge.tsx) qui connaît les statuts d'annonce et leurs couleurs. Un statut a toujours la même couleur partout."
    >
      <GuideSubsection title="Badge" note='<Badge variant="..."> sur fond doux, texte profond.'>
        <SpecimenGrid columns={4}>
          {badgeVariants.map((item) => (
            <Specimen key={item.variant} label={item.label} code={`variant="${item.variant}"`}>
              <div className="space-y-2">
                <Badge variant={item.variant}>{item.label}</Badge>
                <p className="text-xs text-neutral-500">{item.when}</p>
              </div>
            </Specimen>
          ))}
        </SpecimenGrid>
        <p className="text-xs text-neutral-500">
          La variante <Mono>destructive</Mono> (fond rouge plein) reste disponible
          pour les appels existants; préférer <Mono>danger</Mono> pour tout nouvel
          usage.
        </p>
      </GuideSubsection>

      <GuideSubsection
        title="Statuts d'annonce"
        note="Chip en capitales utilisée sur les cartes d'annonces admin. Clés identiques à properties.status."
      >
        <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
          <ul className="divide-y divide-neutral-100">
            {(Object.keys(LISTING_STATUS) as ListingStatus[]).map((status) => (
              <li
                key={status}
                className="grid items-center gap-3 px-4 py-3 sm:grid-cols-[150px_minmax(0,1fr)] md:px-5"
              >
                <StatusBadge status={status} />
                <div className="min-w-0">
                  <code className="block font-mono text-[11px] text-neutral-500">
                    status=&quot;{status}&quot;
                  </code>
                  <code className="block break-words font-mono text-[11px] text-neutral-400">
                    {LISTING_STATUS[status].className}
                  </code>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs leading-relaxed text-neutral-500">
          Sans le point: <Mono>dot={"{false}"}</Mono>. Libellé au féminin par
          défaut (une annonce); passer <Mono>label</Mono> pour un bien au
          masculin.
        </p>
      </GuideSubsection>
    </GuideSection>
  );
}
