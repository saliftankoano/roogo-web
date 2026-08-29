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
  PencilSimpleLineIcon,
} from "@phosphor-icons/react";

export type AdminNavItem = {
  type: "link";
  label: string;
  href: string;
  id: string;
  icon: typeof BuildingsIcon;
};

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
    href: "/admin/sale-chat",
    id: "admin-nav-sale-chat",
    icon: HandshakeIcon,
  },
  {
    type: "link",
    label: "Support",
    href: "/admin/support",
    id: "admin-nav-support",
    icon: ChatCircleTextIcon,
  },
];

const operationsNavItems: AdminNavItem[] = [
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
    href: "/admin/ownership-verifications",
    id: "admin-nav-ownership-verifications",
    icon: HouseLineIcon,
  },
  {
    type: "link",
    label: "RCCM hôtels",
    href: "/admin/hotel-verifications",
    id: "admin-nav-hotel-verifications",
    icon: BuildingsIcon,
  },
  {
    type: "link",
    label: "Événements hôtels",
    href: "/admin/hotel-events",
    id: "admin-nav-hotel-events",
    icon: CalendarCheckIcon,
  },
  {
    type: "link",
    label: "Visites",
    href: "/admin/visit-requests",
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
