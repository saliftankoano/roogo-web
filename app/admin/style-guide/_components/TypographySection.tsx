import { Alert } from "@/components/ui/alert";
import { urbanist } from "@/components/admin/team/font";
import { cn } from "@/lib/utils";
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

// Relevé sur main le 2026-10-22: Accueil (BriefingView), Studio (StudioHeader),
// pastilles et titres de section (components/admin/team/ui.tsx).
const levels: TypeLevel[] = [
  {
    name: "Titre de page",
    tag: "p",
    classes: "text-[28px] font-extrabold tracking-[-0.01em] text-ink lg:text-[34px]",
    size: "28 px, 34 px sur ordinateur",
    weight: "800",
    sample: "Bonjour Awa",
    where: "Le h1 d'Accueil et de L'équipe. Un seul h1 par page.",
  },
  {
    name: "Titre du Studio",
    tag: "p",
    classes: "text-[26px] font-extrabold leading-none tracking-[-0.015em] text-[#1A1A1A]",
    size: "26 px",
    weight: "800",
    sample: "Studio",
    where: "Le h1 « Studio » de l'en-tête; masqué (sr-only) sur téléphone.",
  },
  {
    name: "Surtitre",
    tag: "span",
    classes: "text-xs font-extrabold uppercase tracking-[0.08em] text-[#8A4924] lg:text-[13px]",
    size: "12 px, 13 px sur ordinateur",
    weight: "800, capitales, +0,08 em",
    sample: "Jeudi 22 octobre · Conseiller",
    where: "Au-dessus du titre de page: date, niveau, contexte.",
  },
  {
    name: "Phrase d'accroche",
    tag: "p",
    classes: "text-[15px] leading-[1.45] text-ink-body lg:text-[17px]",
    size: "15 px, 17 px sur ordinateur",
    weight: "400",
    sample: "Trois appels et une visite aujourd'hui. Commencez par Mme Ouédraogo à 10 h.",
    where: "Sous le titre de page: ce qui compte maintenant, en une phrase.",
  },
  {
    name: "Titre de section",
    tag: "h3",
    classes: "text-[13px] font-extrabold uppercase tracking-[0.06em] text-ink-muted",
    size: "13 px",
    weight: "800, capitales, +0,06 em",
    sample: "Fait cette semaine",
    where: "<SectionLabel> de components/admin/team/ui.tsx: chaque bloc d'une page.",
  },
  {
    name: "Titre de panneau",
    tag: "h4",
    classes: "text-lg font-extrabold text-ink",
    size: "18 px / 28 px",
    weight: "800",
    sample: "Notes de l'appel",
    where: "Panneau latéral, dialogue, carte importante.",
  },
  {
    name: "Intertitre",
    tag: "h5",
    classes: "text-base font-bold text-ink",
    size: "16 px / 24 px",
    weight: "700",
    sample: "Villa 4 pièces à Ouaga 2000",
    where: "Ligne de tâche, carte d'annonce.",
  },
  {
    name: "Corps",
    tag: "p",
    classes: "text-[15px] leading-relaxed text-ink-body",
    size: "15 px / 24 px",
    weight: "400",
    sample:
      "Le propriétaire reçoit le loyer sur son compte mobile money le jour même, sans frais cachés.",
    where: "Paragraphes, descriptions.",
  },
  {
    name: "Petit texte",
    tag: "p",
    classes: "text-sm text-ink-muted",
    size: "14 px / 20 px",
    weight: "400",
    sample: "Dernière mise à jour il y a 3 heures.",
    where: "Sous-lignes, aide, cellules secondaires.",
  },
  {
    name: "Libellé de champ",
    tag: "span",
    classes: "text-xs font-extrabold uppercase tracking-[0.06em] text-ink-muted",
    size: "12 px / 16 px",
    weight: "800, capitales, +0,06 em",
    sample: "Numéro WhatsApp",
    where: "Au-dessus de chaque champ de formulaire.",
  },
  {
    name: "Code et identifiants",
    tag: "code",
    classes: "font-mono text-sm text-ink-body",
    size: "14 px / 20 px",
    weight: "400, Geist Mono",
    sample: "VEN-023",
    where: "Références d'annonce, codes, valeurs techniques.",
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
      number="03"
      title="Typographie"
      intro="Deux familles aujourd'hui. Urbanist, la police de l'application mobile, habille les pages refaites depuis le 14 octobre: Accueil, L'équipe, Accès, la fiche de visite, Statistiques et Réseaux du Studio (components/admin/team/font.ts). Les autres pages et le site rendent Geist Sans, chargée dans app/layout.tsx, avec Geist Mono pour le code. Le contraste vient des graisses: 800 pour les titres, 400 pour la lecture, capitales espacées pour les surtitres."
    >
      <Alert tone="warning" title="Écart à trancher">
        Le CLAUDE.md du dépôt cite Urbanist comme police principale, mais
        seules les pages refaites la chargent; Annonces, Projets et Calendrier
        du Studio et les pages plus anciennes restent en Geist. Les exemples de l&apos;échelle
        ci-dessous sont rendus en Urbanist. Étendre Urbanist à tout l&apos;admin
        reste à décider.
      </Alert>

      <GuideSubsection title="Familles">
        <div className="grid gap-4 md:grid-cols-3">
          <Specimen label="Urbanist" code="urbanist.className (components/admin/team/font.ts)">
            <p className={cn(urbanist.className, "text-3xl font-extrabold tracking-tight text-ink")}>
              Aa Bb Cc 0123
            </p>
            <p className="mt-1 text-sm text-ink-muted">
              Pages de l&apos;équipe, application mobile.
            </p>
          </Specimen>
          <Specimen
            label="Geist Sans"
            code='font-sans (body) via --font-geist-sans'
          >
            <p className="text-3xl font-extrabold tracking-tight text-ink">
              Aa Bb Cc 0123
            </p>
            <p className="mt-1 text-sm text-ink-muted">
              Interface, titres, corps. Chiffres alignés avec{" "}
              <Mono>tabular-nums</Mono> dans les tableaux.
            </p>
          </Specimen>
          <Specimen label="Geist Mono" code="font-mono via --font-geist-mono">
            <p className="font-mono text-3xl font-bold text-ink">
              Aa Bb Cc 0123
            </p>
            <p className="mt-1 text-sm text-ink-muted">
              Codes, références, classes Tailwind dans ce guide.
            </p>
          </Specimen>
        </div>
      </GuideSubsection>

      <GuideSubsection
        title="Échelle"
        note="Relevée dans Accueil, L'équipe et le Studio. Copier les classes telles quelles."
      >
        <div className="overflow-hidden rounded-2xl border border-line bg-white">
          <ul className="divide-y divide-line-soft">
            {levels.map((level) => (
              <li
                key={level.name}
                className="grid gap-3 px-4 py-4 md:grid-cols-[180px_minmax(0,1fr)] md:gap-6 md:px-5"
              >
                <div className="space-y-0.5">
                  <p className="text-sm font-bold text-ink">
                    {level.name}
                  </p>
                  <p className="text-xs text-ink-muted">{level.size}</p>
                  <p className="text-xs text-ink-muted">
                    Graisse {level.weight}
                  </p>
                </div>
                <div className="min-w-0 space-y-2">
                  <div className={cn(urbanist.className, "min-w-0 break-words")}>
                    <Sample level={level} />
                  </div>
                  <code className="block break-words font-mono text-[11px] leading-5 text-ink-muted">
                    {level.classes}
                  </code>
                  <p className="text-xs text-[#8F867E]">{level.where}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </GuideSubsection>
    </GuideSection>
  );
}
