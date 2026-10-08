import type { Metadata } from "next";

import { StyleGuideShell, type GuideTocEntry } from "./_components/StyleGuideShell";
import { ColorsSection } from "./_components/ColorsSection";
import { TypographySection } from "./_components/TypographySection";
import { MotionSection } from "./_components/MotionSection";
import { FormatsSection } from "./_components/FormatsSection";
import { LinksSection } from "./_components/LinksSection";
import { ButtonsSection } from "./_components/ButtonsSection";
import { FormsSection } from "./_components/FormsSection";
import { TablesSection } from "./_components/TablesSection";
import { BadgesSection } from "./_components/BadgesSection";
import { FeedbackSection } from "./_components/FeedbackSection";

export const metadata: Metadata = {
  title: "Guide de style",
  description: "Composants, couleurs et formats de l'interface Roogo.",
};

const entries: GuideTocEntry[] = [
  { id: "couleurs", number: "01", label: "Couleurs" },
  { id: "typographie", number: "02", label: "Typographie" },
  { id: "mouvement", number: "03", label: "Mouvement" },
  { id: "chiffres", number: "04", label: "Chiffres et formats" },
  { id: "liens", number: "05", label: "Liens et survol" },
  { id: "boutons", number: "06", label: "Boutons" },
  { id: "formulaires", number: "07", label: "Formulaires" },
  { id: "tableaux", number: "08", label: "Tableaux" },
  { id: "badges", number: "09", label: "Badges et statuts" },
  { id: "dialogues", number: "10", label: "Dialogues et retours" },
];

export default function StyleGuidePage() {
  return (
    <div className="space-y-10">
      <header className="max-w-3xl space-y-3">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-neutral-400">
          Pilotage
        </p>
        <h1 className="text-3xl font-black tracking-tight text-neutral-900">
          Guide de style
        </h1>
        <p className="text-base leading-relaxed text-neutral-500">
          Les briques réelles de l&apos;interface Roogo, rendues en direct depuis{" "}
          <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[13px] text-neutral-700">
            components/ui
          </code>
          . Ce que vous voyez ici est ce qui s&apos;affiche dans l&apos;admin et
          sur le site. Thème clair uniquement, copie en français, chiffres au
          format burkinabè.
        </p>
      </header>

      <StyleGuideShell entries={entries}>
        <ColorsSection />
        <TypographySection />
        <MotionSection />
        <FormatsSection />
        <LinksSection />
        <ButtonsSection />
        <FormsSection />
        <TablesSection />
        <BadgesSection />
        <FeedbackSection />
      </StyleGuideShell>
    </div>
  );
}
