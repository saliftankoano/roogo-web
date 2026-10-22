"use client";

import { StaffNavbarView } from "@/components/admin/AdminNavbar";
import { StudioHeader } from "@/app/admin/studio/StudioHeader";
import { Avatar, SectionLabel, ViewSwitch } from "@/components/admin/team/ui";
import { urbanist } from "@/components/admin/team/font";
import { getAdminNavItems } from "@/lib/navigation/adminNav";
import { staffLevelCan, type StaffCapability } from "@/lib/staff-access";
import { cn } from "@/lib/utils";
import { GuideSection, GuideSubsection, Mono, Specimen } from "./primitives";

const founderItems = getAdminNavItems(() => true);
const internItems = getAdminNavItems((capabilities: readonly StaffCapability[]) =>
  capabilities.some((capability) => staffLevelCan("intern", capability)),
);

/**
 * The real staff bar, rendered from main's StaffNavbarView with fixture data.
 * The bar is `position: fixed`; the transform on the frame makes the frame its
 * containing block, so the bar sits inside the example instead of the page top.
 */
function NavbarFrame({
  items,
  pathname,
  counts,
  initials,
}: {
  items: ReturnType<typeof getAdminNavItems>;
  pathname: string;
  counts: { today: number | null; approvals: number; inbox: number; overdue: number };
  initials: string;
}) {
  return (
    <div className="relative h-24 rounded-2xl bg-[#EEE8E0] [transform:translateZ(0)]">
      <StaffNavbarView
        pathname={pathname}
        navItems={items}
        todayCount={counts.today}
        waitingApprovals={counts.approvals}
        inboxToAnswer={counts.inbox}
        inboxOverdue={counts.overdue}
        account={<Avatar initials={initials} tone="clay" />}
        accountTitle="Exemple"
      />
    </div>
  );
}

export function NavigationSection() {
  return (
    <GuideSection
      id="navigation"
      number="02"
      title="Navigation et en-têtes"
      intro="Une seule barre pour l'équipe, sur l'admin comme sur le site public: Accueil, Annonces, Messages, Studio, Plus. Chaque niveau ne voit que ce qu'il peut ouvrir. Sous la barre, une page s'ouvre sur un surtitre, un titre et une phrase; le Studio a son propre en-tête à onglets."
    >
      <GuideSubsection
        title="Barre de l'équipe"
        note="StaffNavbarView (components/admin/AdminNavbar.tsx), les entrées de lib/navigation/adminNav.ts. Pilule blanche flottante, 64 px de haut, à 16 px du haut de l'écran."
      >
        <div className="space-y-4">
          <Specimen label="Fondateur, sur cette page (Plus actif)" previewClassName="p-0">
            <NavbarFrame
              items={founderItems}
              pathname="/admin/style-guide"
              counts={{ today: 4, approvals: 2, inbox: 3, overdue: 1 }}
              initials="SF"
            />
          </Specimen>
          <Specimen label="Stagiaire, sur Accueil" previewClassName="p-0">
            <NavbarFrame
              items={internItems}
              pathname="/admin"
              counts={{ today: 2, approvals: 0, inbox: 0, overdue: 0 }}
              initials="AZ"
            />
          </Specimen>
        </div>
        <ul className="space-y-1.5 text-sm leading-relaxed text-ink-body">
          <li>
            Cinq entrées au plus. Ce qui ne sert pas tous les jours va dans{" "}
            <Mono>Plus</Mono>, rangé sous Opérations, Pilotage et Développement.
          </li>
          <li>
            Entrée active: pilule blanche qui glisse (<Mono>layoutId</Mono>),
            texte terracotta, icône pleine. Les autres: gris, icône{" "}
            <Mono>bold</Mono>.
          </li>
          <li>
            Compteurs: terracotta sur Accueil (tâches et réponses du jour), ambre
            sur Studio (à valider, fondateur), terracotta puis rouge pour Réseaux
            (à répondre, en retard).
          </li>
          <li>
            Sous 1024 px, le menu passe dans le bouton liste; le Studio garde son
            raccourci à côté de l&apos;avatar.
          </li>
        </ul>
      </GuideSubsection>

      <GuideSubsection
        title="En-tête de page"
        note="Accueil (components/admin/team/BriefingView.tsx): surtitre argile, titre de 28 à 34 px, une phrase, la progression à droite."
      >
        <Specimen previewClassName="bg-cream">
          <div className={cn(urbanist.className, "flex flex-wrap items-end gap-x-6 gap-y-3 text-ink")}>
            <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-1.5">
              <span className="text-xs font-extrabold uppercase tracking-[0.08em] text-[#8A4924] lg:text-[13px]">
                Jeudi 22 octobre · Conseiller
              </span>
              <p className="m-0 text-[28px] font-extrabold tracking-[-0.01em] lg:text-[34px]">
                Bonjour Awa
              </p>
              <p className="m-0 max-w-[720px] text-[15px] leading-[1.45] text-ink-body lg:text-[17px]">
                Trois appels et une visite aujourd&apos;hui. Commencez par la
                visite de 10 h à Balkuy.
              </p>
            </div>
            <div className="flex w-full flex-[0_1_280px] items-center gap-2.5">
              <div aria-hidden="true" className="h-2 flex-1 overflow-hidden rounded-full bg-[#E9DFD2] lg:h-2.5">
                <div className="h-full w-2/5 rounded-full bg-primary" />
              </div>
              <span className="whitespace-nowrap text-[13px] font-extrabold lg:text-sm">2 sur 5</span>
            </div>
          </div>
        </Specimen>
        <p className="text-xs leading-relaxed text-ink-muted">
          Le titre est le seul <Mono>h1</Mono> de la page. La crème de fond (
          <Mono>CreamBackdrop</Mono>) est propre à Accueil et L&apos;équipe; les
          autres pages gardent le fond clair de l&apos;admin.
        </p>
      </GuideSubsection>

      <GuideSubsection
        title="Bascule de vue et titres de section"
        note="<ViewSwitch> pour passer de Mon briefing à L'équipe, <SectionLabel> au-dessus de chaque bloc."
      >
        <Specimen previewClassName="bg-cream">
          <div className={cn(urbanist.className, "flex flex-col gap-4")}>
            <ViewSwitch active="briefing" />
            <SectionLabel as="span">Fait cette semaine</SectionLabel>
          </div>
        </Specimen>
      </GuideSubsection>

      <GuideSubsection
        title="En-tête du Studio"
        note="StudioHeader (app/admin/studio/StudioHeader.tsx), rendu ici en direct: titre « Studio » et quatre onglets texte sur un filet, sans pilule ni fond. Sur téléphone, le titre est masqué et les onglets défilent de côté."
      >
        <Specimen>
          <StudioHeader />
        </Specimen>
      </GuideSubsection>

      <GuideSubsection title="Espace sous la barre" note="AdminContent (components/admin/AdminContent.tsx).">
        <ul className="space-y-1.5 text-sm leading-relaxed text-ink-body">
          <li>
            Pages admin: <Mono>container mx-auto px-6 pt-40 pb-12</Mono>.
          </li>
          <li>
            Studio: <Mono>pt-[6.5rem] md:pt-[7.5rem]</Mono>, soit 24 px sous la
            barre sur téléphone et 40 px à partir de la tablette.
          </li>
          <li>
            Une page plein écran sur téléphone (la fiche de visite) pose{" "}
            <Mono>data-staff-fullscreen</Mono> et la barre s&apos;efface.
          </li>
        </ul>
      </GuideSubsection>
    </GuideSection>
  );
}
