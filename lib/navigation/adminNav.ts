import type { StaffCapability } from "@/lib/staff-access";
import {
  BuildingsIcon,
  CalendarCheckIcon,
  ReceiptIcon,
  ChartLineUpIcon,
  ChatCircleTextIcon,
  GearIcon,
  ClipboardTextIcon,
  HandshakeIcon,
  HouseLineIcon,
  IdentificationCardIcon,
  SquaresFourIcon,
  MicrophoneIcon,
  PencilSimpleLineIcon,
  ShieldCheckIcon,
  FileTextIcon,
  CalendarStarIcon,
  UsersThreeIcon,
  GiftIcon,
  DotsThreeCircleIcon,
  SwatchesIcon,
} from "@phosphor-icons/react";

// One list for the staff bar, on admin pages and on public pages alike
// (components/admin/AdminNavbar.tsx renders it in both places since
// 2026-10-20). Top level: Accueil, Annonces, Messages, Studio, Plus. The daily
// pages stay on the bar; « Plus » holds the rest under small headings.

// Top-level and pinned in the mobile header too, so the Studio stays within
// the three-click budget.
export const studioNavItem: AdminNavItemLink = {
  type: "link",
  label: "Studio",
  href: "/admin/studio",
  id: "admin-nav-studio",
  icon: MicrophoneIcon,
  needs: ["studio.use"],
};

// "Accueil" (named "Mon espace" until 2026-10-18): the staff home, first item
// of the staff bar. It is active on /admin itself (which holds « Nos objectifs »
// since 2026-10-21; /admin/objectifs redirects there) and on /admin/equipe and /admin/notes-appels (opened from it).
export const todayNavItem: AdminNavItemLink = {
  type: "link",
  label: "Accueil",
  href: "/admin",
  id: "admin-nav-today",
  icon: SquaresFourIcon,
};

export type AdminNavItem = {
  type: "link";
  label: string;
  href: string;
  id: string;
  icon: typeof BuildingsIcon;
  /** Shown when the person holds at least one of these. Absent: shown to all staff. */
  needs?: readonly StaffCapability[];
  /** Small heading above this item inside a group menu (starts a new section). */
  section?: string;
};
type AdminNavItemLink = AdminNavItem;

export type AdminNavGroupItem = {
  type: "group";
  label: string;
  id: string;
  icon: typeof BuildingsIcon;
  children: AdminNavItem[];
};

export type AdminNavEntry = AdminNavItem | AdminNavGroupItem;

const messageNavItems: AdminNavItem[] = [
  {
    type: "link",
    label: "Ventes",
    href: "/admin/discussions-vente",
    id: "admin-nav-sale-chat",
    icon: HandshakeIcon,
    needs: ["saleChat.view"],
  },
  {
    type: "link",
    label: "Support",
    href: "/admin/assistance",
    id: "admin-nav-support",
    icon: ChatCircleTextIcon,
    needs: ["support.reply"],
  },
];

// Inside « Plus ». Every item carries its section so a heading survives when
// the first item of a section is hidden for a level.
const OPS = "Opérations";
const PILOT = "Pilotage";
const DEV = "Développement";

const moreNavItems: AdminNavItem[] = [
  {
    type: "link",
    label: "Visites",
    section: OPS,
    href: "/admin/demandes-de-visite",
    id: "admin-nav-visit-requests",
    icon: CalendarCheckIcon,
    needs: ["applications.view"],
  },
  {
    type: "link",
    label: "Appels à biens",
    section: OPS,
    href: "/admin/demandes-de-biens",
    id: "admin-nav-property-requests",
    icon: HouseLineIcon,
    needs: ["listings.view"],
  },
  {
    type: "link",
    label: "Candidatures",
    section: OPS,
    href: "/admin/candidatures",
    id: "admin-nav-candidatures",
    icon: ClipboardTextIcon,
    needs: ["applications.view"],
  },
  {
    type: "link",
    label: "Modifications",
    section: OPS,
    href: "/admin/modifications",
    id: "admin-nav-modifications",
    icon: PencilSimpleLineIcon,
    needs: ["pendingEdits.view"],
  },
  {
    type: "link",
    label: "Identités",
    section: OPS,
    href: "/admin/verifications",
    id: "admin-nav-verifications",
    icon: IdentificationCardIcon,
    needs: ["identity.status"],
  },
  {
    type: "link",
    label: "Documents propriété",
    section: OPS,
    href: "/admin/verifications-propriete",
    id: "admin-nav-ownership-verifications",
    icon: FileTextIcon,
    needs: ["ownership.status"],
  },
  {
    type: "link",
    label: "RCCM hôtels",
    section: OPS,
    href: "/admin/verifications-hotels",
    id: "admin-nav-hotel-verifications",
    icon: BuildingsIcon,
    needs: ["identity.status"],
  },
  {
    type: "link",
    label: "Événements hôtels",
    section: OPS,
    href: "/admin/evenements-hotels",
    id: "admin-nav-hotel-events",
    icon: CalendarStarIcon,
    needs: ["listings.view"],
  },
  {
    type: "link",
    label: "Analyses",
    section: PILOT,
    href: "/admin/utilisateurs",
    id: "admin-nav-analyses",
    icon: ChartLineUpIcon,
    needs: ["users.listAll", "users.listOwnersAgents"],
  },
  // « Accès »: who can do what (every staff member), plus the levels and
  // invitations tab for team.manage (app/admin/acces/layout.tsx).
  {
    type: "link",
    label: "Accès",
    section: PILOT,
    href: "/admin/acces",
    id: "admin-nav-access",
    icon: ShieldCheckIcon,
  },
  {
    type: "link",
    label: "Finances",
    section: PILOT,
    href: "/admin/finances",
    id: "admin-nav-finances",
    icon: ReceiptIcon,
    needs: ["finances.view"],
  },
  {
    type: "link",
    label: "Paramètres",
    section: PILOT,
    href: "/admin/parametres",
    id: "admin-nav-parametres",
    icon: GearIcon,
    needs: ["settings.manage"],
  },
  // The admin style guide: founder-only, as when it was added (2026-10-08).
  {
    type: "link",
    label: "Guide de style",
    section: PILOT,
    href: "/admin/style-guide",
    id: "admin-nav-style-guide",
    icon: SwatchesIcon,
    needs: ["settings.manage"],
  },
  {
    type: "link",
    label: "Talent",
    section: DEV,
    href: "/admin/talent",
    id: "admin-nav-talent",
    icon: UsersThreeIcon,
    needs: ["talent.manage"],
  },
  {
    type: "link",
    label: "Parrainage",
    section: DEV,
    href: "/admin/parrainage",
    id: "admin-nav-parrainage",
    icon: GiftIcon,
    needs: ["referrals.validate"],
  },
];

function visible(
  item: AdminNavItem,
  canAny: (capabilities: readonly StaffCapability[]) => boolean,
) {
  return !item.needs || canAny(item.needs);
}

export function getAdminNavItems(
  canAny: (capabilities: readonly StaffCapability[]) => boolean,
): AdminNavEntry[] {
  const entries: AdminNavEntry[] = [
    todayNavItem,
    {
      type: "link",
      label: "Annonces",
      href: "/admin/annonces",
      id: "admin-nav-annonces",
      icon: BuildingsIcon,
      needs: ["listings.view"],
    },
    {
      type: "group",
      label: "Messages",
      id: "admin-nav-messages",
      icon: ChatCircleTextIcon,
      children: messageNavItems,
    },
    studioNavItem,
    // Opérations, Pilotage and Développement live in « Plus » since
    // 2026-10-20 so the bar keeps five entries at most.
    {
      type: "group",
      label: "Plus",
      id: "admin-nav-more",
      icon: DotsThreeCircleIcon,
      children: moreNavItems,
    },
  ];

  // Hide what the person cannot open, and any group left empty.
  return entries.flatMap((entry): AdminNavEntry[] => {
    if (entry.type === "link") return visible(entry, canAny) ? [entry] : [];
    const children = entry.children.filter((child) => visible(child, canAny));
    return children.length > 0 ? [{ ...entry, children }] : [];
  });
}
