import type { Metadata } from "next";

import { StyleGuideShell, type GuideTocEntry } from "./_components/StyleGuideShell";
import { ColorsSection } from "./_components/ColorsSection";
import { NavigationSection } from "./_components/NavigationSection";
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
  { id: "navigation", number: "02", label: "Navigation et en-têtes" },
  { id: "typographie", number: "03", label: "Typographie" },
  { id: "mouvement", number: "04", label: "Mouvement" },
  { id: "chiffres", number: "05", label: "Chiffres et formats" },
  { id: "liens", number: "06", label: "Liens et survol" },
  { id: "boutons", number: "07", label: "Boutons" },
  { id: "formulaires", number: "08", label: "Formulaires" },
  { id: "tableaux", number: "09", label: "Tableaux" },
  { id: "badges", number: "10", label: "Badges et statuts" },
  { id: "dialogues", number: "11", label: "Dialogues et retours" },
];

export default function StyleGuidePage() {
  return (
    <div className="space-y-10">
      {/* Same opening as Accueil: clay eyebrow, page title, one sentence. */}
      <header className="max-w-3xl space-y-1.5">
        <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-[#8A4924] lg:text-[13px]">
          Pilotage · mis à jour le 22 octobre 2026
        </p>
        <h1 className="text-[28px] font-extrabold tracking-[-0.01em] text-ink lg:text-[34px]">
          Guide de style
        </h1>
        <p className="text-[15px] leading-[1.45] text-ink-body lg:text-[17px]">
          Les briques réelles de l&apos;admin Roogo, rendues en direct depuis{" "}
          <code className="rounded bg-[#F4EEE6] px-1.5 py-0.5 font-mono text-[13px] text-ink-body">
            components/ui
          </code>{" "}
          et les composants de l&apos;équipe et du Studio. Ce que vous voyez ici
          est ce que l&apos;admin affiche aujourd&apos;hui. Thème clair
          uniquement, copie en français, chiffres au format burkinabè.
        </p>
      </header>

      <StyleGuideShell entries={entries}>
        <ColorsSection />
        <NavigationSection />
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
