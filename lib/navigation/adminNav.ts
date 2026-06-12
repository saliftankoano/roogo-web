import {
  BuildingsIcon,
  ReceiptIcon,
  ChartLineUpIcon,
  GearIcon,
  ClipboardTextIcon,
  HandshakeIcon,
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

const demandesNavItems: AdminNavItem[] = [
  {
    type: "link",
    label: "Talent",
    href: "/admin/talent",
    id: "admin-nav-talent",
    icon: ClipboardTextIcon,
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
    label: "Vérifications",
    href: "/admin/verifications",
    id: "admin-nav-verifications",
    icon: IdentificationCardIcon,
  },
  {
    type: "link",
    label: "Parrainage",
    href: "/admin/parrainage",
    id: "admin-nav-parrainage",
    icon: HandshakeIcon,
  },
];

const baseAdminNavItems: AdminNavEntry[] = [
  {
    type: "link",
    label: "Analyses",
    href: "/admin/utilisateurs",
    id: "admin-nav-analyses",
    icon: ChartLineUpIcon,
  },
  {
    type: "link",
    label: "Annonces",
    href: "/admin/annonces",
    id: "admin-nav-annonces",
    icon: BuildingsIcon,
  },
  {
    type: "link",
    label: "Modifications",
    href: "/admin/modifications",
    id: "admin-nav-modifications",
    icon: PencilSimpleLineIcon,
  },
  {
    type: "group",
    label: "Demandes",
    id: "admin-nav-demandes",
    icon: ClipboardTextIcon,
    children: demandesNavItems,
  },
];

const founderOnlyAdminNavItems: AdminNavEntry[] = [
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
  if (isFounder) {
    return [...baseAdminNavItems, ...founderOnlyAdminNavItems];
  }

  return baseAdminNavItems;
}
