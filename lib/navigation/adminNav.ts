import {
  UsersIcon,
  BuildingsIcon,
  ReceiptIcon,
  ChartLineUpIcon,
  GearIcon,
  ClipboardTextIcon,
} from "@phosphor-icons/react";

export type AdminNavItem = {
  label: string;
  href: string;
  id: string;
  icon: typeof UsersIcon;
};

const baseAdminNavItems: AdminNavItem[] = [
  {
    label: "Utilisateurs",
    href: "/admin/utilisateurs",
    id: "admin-nav-utilisateurs",
    icon: UsersIcon,
  },
  {
    label: "Annonces",
    href: "/admin/annonces",
    id: "admin-nav-annonces",
    icon: BuildingsIcon,
  },
  {
    label: "Candidatures",
    href: "/admin/candidatures",
    id: "admin-nav-candidatures",
    icon: ClipboardTextIcon,
  },
  {
    label: "Analytics",
    href: "/admin/analytiques",
    id: "admin-nav-analytiques",
    icon: ChartLineUpIcon,
  },
];

const founderOnlyAdminNavItems: AdminNavItem[] = [
  {
    label: "Finances",
    href: "/admin/finances",
    id: "admin-nav-finances",
    icon: ReceiptIcon,
  },
  {
    label: "Paramètres",
    href: "/admin/parametres",
    id: "admin-nav-parametres",
    icon: GearIcon,
  },
];

export function getAdminNavItems(isFounder: boolean): AdminNavItem[] {
  if (isFounder) {
    return [...baseAdminNavItems, ...founderOnlyAdminNavItems];
  }

  return baseAdminNavItems;
}
