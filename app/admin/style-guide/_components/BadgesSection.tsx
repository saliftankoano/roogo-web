"use client";

import { Badge } from "@/components/ui/badge";
import { Chip, Flag } from "@/components/admin/team/ui";
import { InboxBadge } from "@/components/admin/InboxBadge";
import type { TaskTone } from "@/lib/team-tasks/core";
import {
  GuideSection,
  GuideSubsection,
  Mono,
  Specimen,
  SpecimenGrid,
} from "./primitives";

const chipTones: { tone: TaskTone; label: string; when: string; classes: string }[] = [
  { tone: "orange", label: "Annonce", when: "Le sujet d'une tâche, la marque", classes: "bg-[#F7E4D3] text-[#8A4924]" },
  { tone: "blue", label: "Appel", when: "Information, type de tâche", classes: "bg-[#E1EFF8] text-[#1F5F80]" },
  { tone: "green", label: "Fait", when: "Terminé, payé, en ligne", classes: "bg-[#E3F1E6] text-[#245C33]" },
  { tone: "red", label: "En retard", when: "Retard, refus, litige", classes: "bg-[#FBE3DF] text-[#8E2A1E]" },
  { tone: "grey", label: "Plus tard", when: "Neutre, sans urgence", classes: "bg-[#EEEBE7] text-[#4A4540]" },
  { tone: "dark", label: "Fondateur", when: "Rôle, étiquette forte", classes: "bg-[#1F1A16] text-white" },
];

const flagTones = [
  { tone: "red", label: "Échéance dépassée" },
  { tone: "amber", label: "À relancer" },
  { tone: "green", label: "Objectif atteint" },
] as const;

const badgeVariants = [
  { variant: "secondary", label: "Secondaire" },
  { variant: "outline", label: "Contour" },
  { variant: "primary", label: "Marque" },
  { variant: "success", label: "Succès" },
  { variant: "warning", label: "Attention" },
  { variant: "danger", label: "Erreur" },
  { variant: "info", label: "Info" },
] as const;

export function BadgesSection() {
  return (
    <GuideSection
      id="badges"
      number="10"
      title="Badges et statuts"
      intro="L'admin d'aujourd'hui étiquette avec les pastilles de l'équipe (Chip et Flag, components/admin/team/ui.tsx) et compte avec les badges ronds de la barre. Une couleur veut dire la même chose partout: vert fait, rouge en retard, ambre à valider, terracotta à traiter."
    >
      <GuideSubsection title="Pastilles" note='<Chip tone="...">: 22 px de haut, 11 px extra gras. Le ton vient de TaskTone (lib/team-tasks/core.ts).'>
        <SpecimenGrid columns={3}>
          {chipTones.map((item) => (
            <Specimen key={item.tone} label={item.label} code={`tone="${item.tone}" (${item.classes})`}>
              <div className="space-y-2">
                <Chip tone={item.tone}>{item.label}</Chip>
                <p className="text-xs text-ink-muted">{item.when}</p>
              </div>
            </Specimen>
          ))}
        </SpecimenGrid>
      </GuideSubsection>

      <GuideSubsection title="Drapeaux" note='<Flag tone="red | amber | green">: 24 px, 12 px. Pour un état qui demande une action.'>
        <Specimen>
          <div className="flex flex-wrap gap-2">
            {flagTones.map((item) => (
              <Flag key={item.tone} tone={item.tone}>
                {item.label}
              </Flag>
            ))}
          </div>
        </Specimen>
      </GuideSubsection>

      <GuideSubsection title="Compteurs" note="Ronds, 18 à 20 px, sur un élément de navigation. Au-delà de 9 ou 99, « 9+ » ou « 99+ ».">
        <SpecimenGrid columns={3}>
          <Specimen label="Accueil: tâches du jour" code="bg-primary text-white, 18 px">
            <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[11px] font-extrabold text-white">
              4
            </span>
          </Specimen>
          <Specimen label="Studio: à valider (fondateur)" code="bg-[#E9A23B] text-[#1F1A16], 20 px">
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#E9A23B] px-1.5 text-[11px] font-bold leading-none text-[#1F1A16]">
              2
            </span>
          </Specimen>
          <Specimen label="Réseaux: à répondre, puis en retard" code="<InboxBadge count overdue />">
            <div className="flex items-center gap-3">
              <InboxBadge count={3} />
              <InboxBadge count={5} overdue={1} />
            </div>
          </Specimen>
        </SpecimenGrid>
      </GuideSubsection>

      <GuideSubsection title="Badge générique" note='<Badge variant="..."> (components/ui/badge.tsx), pour les pages plus anciennes comme Paramètres.'>
        <Specimen>
          <div className="flex flex-wrap gap-2">
            {badgeVariants.map((item) => (
              <Badge key={item.variant} variant={item.variant}>
                {item.label}
              </Badge>
            ))}
          </div>
        </Specimen>
        <p className="text-xs text-ink-muted">
          Pour un nouvel écran, préférer <Mono>Chip</Mono>. Les variantes{" "}
          <Mono>default</Mono> et <Mono>destructive</Mono> restent pour les
          appels existants.
        </p>
      </GuideSubsection>
    </GuideSection>
  );
}
