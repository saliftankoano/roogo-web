import {
  BuildingsIcon,
  ReceiptIcon,
  ChartLineUpIcon,
  GearIcon,
  ClipboardTextIcon,
  HandshakeIcon,
  IdentificationCardIcon,
} from "@phosphor-icons/react";

export type AdminNavItem = {
  label: string;
  href: string;
  id: string;
  icon: typeof BuildingsIcon;
};

const baseAdminNavItems: AdminNavItem[] = [
  {
    label: "Analyses",
    href: "/admin/utilisateurs",
    id: "admin-nav-analyses",
    icon: ChartLineUpIcon,
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
    label: "Vérifications",
    href: "/admin/verifications",
    id: "admin-nav-verifications",
    icon: IdentificationCardIcon,
  },
  {
    label: "Parrainage",
    href: "/admin/parrainage",
    id: "admin-nav-parrainage",
    icon: HandshakeIcon,
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
