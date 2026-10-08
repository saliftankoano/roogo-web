import { Alert } from "@/components/ui/alert";
import { GuideSection, GuideSubsection, Mono, Specimen } from "./primitives";

type TypeLevel = {
  name: string;
  tag: "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "p" | "span" | "code";
  classes: string;
  size: string;
  weight: string;
  sample: string;
  where: string;
};

const levels: TypeLevel[] = [
  {
    name: "Titre de page (h1)",
    tag: "h1",
    classes: "text-3xl font-black tracking-tight text-neutral-900",
    size: "30 px / 36 px",
    weight: "900",
    sample: "Annonces à vérifier",
    where: "Un seul par page, en haut.",
  },
  {
    name: "Titre de section (h2)",
    tag: "h2",
    classes: "text-2xl font-black tracking-tight text-neutral-900",
    size: "24 px / 32 px",
    weight: "900",
    sample: "Paiements du mois",
    where: "Grands blocs d'une page.",
  },
  {
    name: "Titre de carte (h3)",
    tag: "h3",
    classes: "text-xl font-bold text-neutral-900",
    size: "20 px / 28 px",
    weight: "700",
    sample: "Villa 4 pièces à Ouaga 2000",
    where: "Cartes, panneaux, modales.",
  },
  {
    name: "Sous-titre (h4)",
    tag: "h4",
    classes: "text-lg font-bold text-neutral-900",
    size: "18 px / 28 px",
    weight: "700",
    sample: "Conditions de location",
    where: "Groupes de champs, titres de dialogue.",
  },
  {
    name: "Intertitre (h5)",
    tag: "h5",
    classes: "text-base font-bold text-neutral-900",
    size: "16 px / 24 px",
    weight: "700",
    sample: "Documents fournis",
    where: "Listes, lignes de résumé.",
  },
  {
    name: "Surtitre (h6)",
    tag: "h6",
    classes: "text-xs font-black uppercase tracking-widest text-neutral-400",
    size: "12 px / 16 px",
    weight: "900, capitales, +0,1 em",
    sample: "Pilotage",
    where: "Au-dessus d'un titre ou d'un groupe, en-têtes de tableau.",
  },
  {
    name: "Corps",
    tag: "p",
    classes: "text-base leading-relaxed text-neutral-700",
    size: "16 px / 26 px",
    weight: "400",
    sample:
      "Le propriétaire reçoit le loyer sur son compte mobile money le jour même, sans frais cachés.",
    where: "Paragraphes, descriptions longues.",
  },
  {
    name: "Petit texte",
    tag: "p",
    classes: "text-sm text-neutral-500",
    size: "14 px / 20 px",
    weight: "400",
    sample: "Dernière mise à jour il y a 3 heures.",
    where: "Sous-lignes, aide, cellules secondaires.",
  },
  {
    name: "Légende",
    tag: "span",
    classes: "text-xs font-medium text-neutral-400",
    size: "12 px / 16 px",
    weight: "500",
    sample: "Photo 3 sur 12",
    where: "Horodatages, compteurs, mentions.",
  },
  {
    name: "Libellé de champ",
    tag: "span",
    classes: "text-xs font-bold uppercase tracking-wider text-neutral-500",
    size: "12 px / 16 px",
    weight: "700, capitales, +0,05 em",
    sample: "Numéro WhatsApp",
    where: "Au-dessus de chaque champ de formulaire.",
  },
  {
    name: "Code et identifiants",
    tag: "code",
    classes: "font-mono text-sm text-neutral-700",
    size: "14 px / 20 px",
    weight: "400, Geist Mono",
    sample: "RG-2026-00417",
    where: "Références, codes de réservation, valeurs techniques.",
  },
];

function Sample({ level }: { level: TypeLevel }) {
  const Tag = level.tag;
  return <Tag className={level.classes}>{level.sample}</Tag>;
}

export function TypographySection() {
  return (
    <GuideSection
      id="typographie"
      number="02"
      title="Typographie"
      intro="Une seule famille, Geist Sans, chargée dans app/layout.tsx avec Geist Mono pour le code. Le contraste vient des graisses: 900 pour les titres, 400 pour la lecture, capitales espacées pour les surtitres."
    >
      <Alert tone="warning" title="Écart à trancher">
        L&apos;application mobile utilise Urbanist et le CLAUDE.md du dépôt le
        cite comme police principale, mais le site charge toujours Geist. Ce
        guide montre ce qui est réellement rendu, Geist. La police à retenir
        pour les deux surfaces reste à décider.
      </Alert>

      <GuideSubsection title="Familles">
        <div className="grid gap-4 md:grid-cols-2">
          <Specimen
            label="Geist Sans"
            code='font-sans (body) via --font-geist-sans'
          >
            <p className="text-3xl font-black tracking-tight text-neutral-900">
              Aa Bb Cc 0123
            </p>
            <p className="mt-1 text-sm text-neutral-500">
              Interface, titres, corps. Chiffres alignés avec{" "}
              <Mono>tabular-nums</Mono> dans les tableaux.
            </p>
          </Specimen>
          <Specimen label="Geist Mono" code="font-mono via --font-geist-mono">
            <p className="font-mono text-3xl font-bold text-neutral-900">
              Aa Bb Cc 0123
            </p>
            <p className="mt-1 text-sm text-neutral-500">
              Codes, références, classes Tailwind dans ce guide.
            </p>
          </Specimen>
        </div>
      </GuideSubsection>

      <GuideSubsection
        title="Échelle"
        note="Relevée dans les pages admin et réduite à onze niveaux. Copier les classes telles quelles."
      >
        <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
          <ul className="divide-y divide-neutral-100">
            {levels.map((level) => (
              <li
                key={level.name}
                className="grid gap-3 px-4 py-4 md:grid-cols-[180px_minmax(0,1fr)] md:gap-6 md:px-5"
              >
                <div className="space-y-0.5">
                  <p className="text-sm font-bold text-neutral-900">
                    {level.name}
                  </p>
                  <p className="text-xs text-neutral-500">{level.size}</p>
                  <p className="text-xs text-neutral-500">
                    Graisse {level.weight}
                  </p>
                </div>
                <div className="min-w-0 space-y-2">
                  <div className="min-w-0 break-words">
                    <Sample level={level} />
                  </div>
                  <code className="block break-words font-mono text-[11px] leading-5 text-neutral-500">
                    {level.classes}
                  </code>
                  <p className="text-xs text-neutral-400">{level.where}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </GuideSubsection>
    </GuideSection>
  );
}
