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
  ListChecksIcon,
  MicrophoneIcon,
  PencilSimpleLineIcon,
  ShieldCheckIcon,
} from "@phosphor-icons/react";

// Top-level (not inside a group) and pinned in the mobile header too, so the
// Studio stays within the three-click budget.
export const studioNavItem: AdminNavItemLink = {
  type: "link",
  label: "Studio",
  href: "/admin/studio",
  id: "admin-nav-studio",
  icon: MicrophoneIcon,
};

// "Mon briefing": first item of the admin navbar only (the public Navbar keeps
// its own list). It is active on /admin itself and on /admin/equipe.
export const todayNavItem: AdminNavItemLink = {
  type: "link",
  label: "Aujourd’hui",
  href: "/admin",
  id: "admin-nav-today",
  icon: ListChecksIcon,
};

export type AdminNavItem = {
  type: "link";
  label: string;
  href: string;
  id: string;
  icon: typeof BuildingsIcon;
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
  },
  {
    type: "link",
    label: "Support",
    href: "/admin/assistance",
    id: "admin-nav-support",
    icon: ChatCircleTextIcon,
  },
];

const operationsNavItems: AdminNavItem[] = [
  {
    type: "link",
    label: "Appels à biens",
    href: "/admin/demandes-de-biens",
    id: "admin-nav-property-requests",
    icon: HouseLineIcon,
  },
  {
    type: "link",
    label: "Modifications",
    href: "/admin/modifications",
    id: "admin-nav-modifications",
    icon: PencilSimpleLineIcon,
  },
  {
    type: "link",
    label: "Candidatures",
    href: "/admin/candidatures",
    id: "admin-nav-candidatures",
    icon: ClipboardTextIcon,
  },
  {
    type: "link",
    label: "Identités",
    href: "/admin/verifications",
    id: "admin-nav-verifications",
    icon: IdentificationCardIcon,
  },
  {
    type: "link",
    label: "Documents propriété",
    href: "/admin/verifications-propriete",
    id: "admin-nav-ownership-verifications",
    icon: HouseLineIcon,
  },
  {
    type: "link",
    label: "RCCM hôtels",
    href: "/admin/verifications-hotels",
    id: "admin-nav-hotel-verifications",
    icon: BuildingsIcon,
  },
  {
    type: "link",
    label: "Événements hôtels",
    href: "/admin/evenements-hotels",
    id: "admin-nav-hotel-events",
    icon: CalendarCheckIcon,
  },
  {
    type: "link",
    label: "Visites",
    href: "/admin/demandes-de-visite",
    id: "admin-nav-visit-requests",
    icon: CalendarCheckIcon,
  },
];

const developmentNavItems: AdminNavItem[] = [
  {
    type: "link",
    label: "Talent",
    href: "/admin/talent",
    id: "admin-nav-talent",
    icon: ClipboardTextIcon,
  },
  {
    type: "link",
    label: "Parrainage",
    href: "/admin/parrainage",
    id: "admin-nav-parrainage",
    icon: HandshakeIcon,
  },
];

const pilotageNavItems: AdminNavItem[] = [
  {
    type: "link",
    label: "Analyses",
    href: "/admin/utilisateurs",
    id: "admin-nav-analyses",
    icon: ChartLineUpIcon,
  },
  // Documentation of the access levels, readable by every staff member.
  {
    type: "link",
    label: "Qui peut faire quoi",
    href: "/admin/acces",
    id: "admin-nav-access",
    icon: ShieldCheckIcon,
  },
];

const founderPilotageNavItems: AdminNavItem[] = [
  {
    type: "link",
    label: "Finances",
    href: "/admin/finances",
    id: "admin-nav-finances",
    icon: ReceiptIcon,
  },
  {
    type: "link",
    label: "Paramètres",
    href: "/admin/parametres",
    id: "admin-nav-parametres",
    icon: GearIcon,
  },
];

export function getAdminNavItems(isFounder: boolean): AdminNavEntry[] {
  return [
    {
      type: "link",
      label: "Annonces",
      href: "/admin/annonces",
      id: "admin-nav-annonces",
      icon: BuildingsIcon,
    },
    studioNavItem,
    {
      type: "group",
      label: "Messages",
      id: "admin-nav-messages",
      icon: ChatCircleTextIcon,
      children: messageNavItems,
    },
    {
      type: "group",
      label: "Opérations",
      id: "admin-nav-operations",
      icon: ClipboardTextIcon,
      children: operationsNavItems,
    },
    {
      type: "group",
      label: "Développement",
      id: "admin-nav-development",
      icon: HandshakeIcon,
      children: developmentNavItems,
    },
    {
      type: "group",
      label: "Pilotage",
      id: "admin-nav-pilotage",
      icon: ChartLineUpIcon,
      children: isFounder
        ? [...pilotageNavItems, ...founderPilotageNavItems]
        : pilotageNavItems,
    },
  ];
}
