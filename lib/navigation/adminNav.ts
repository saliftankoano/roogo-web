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
  ListChecksIcon,
  MicrophoneIcon,
  PencilSimpleLineIcon,
  UsersThreeIcon,
} from "@phosphor-icons/react";

// Top-level (not inside a group) and pinned in the mobile header too, so the
// Studio stays within the three-click budget.
export const studioNavItem: AdminNavItemLink = {
  type: "link",
  label: "Studio",
  href: "/admin/studio",
  id: "admin-nav-studio",
  icon: MicrophoneIcon,
  needs: ["studio.use"],
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
  /** Shown when the person holds at least one of these. Absent: shown to all staff. */
  needs?: readonly StaffCapability[];
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

const operationsNavItems: AdminNavItem[] = [
  {
    type: "link",
    label: "Appels à biens",
    href: "/admin/demandes-de-biens",
    id: "admin-nav-property-requests",
    icon: HouseLineIcon,
    needs: ["listings.view"],
  },
  {
    type: "link",
    label: "Modifications",
    href: "/admin/modifications",
    id: "admin-nav-modifications",
    icon: PencilSimpleLineIcon,
    needs: ["pendingEdits.view"],
  },
  {
    type: "link",
    label: "Candidatures",
    href: "/admin/candidatures",
    id: "admin-nav-candidatures",
    icon: ClipboardTextIcon,
    needs: ["applications.view"],
  },
  {
    type: "link",
    label: "Identités",
    href: "/admin/verifications",
    id: "admin-nav-verifications",
    icon: IdentificationCardIcon,
    needs: ["identity.status"],
  },
  {
    type: "link",
    label: "Documents propriété",
    href: "/admin/verifications-propriete",
    id: "admin-nav-ownership-verifications",
    icon: HouseLineIcon,
    needs: ["ownership.status"],
  },
  {
    type: "link",
    label: "RCCM hôtels",
    href: "/admin/verifications-hotels",
    id: "admin-nav-hotel-verifications",
    icon: BuildingsIcon,
    needs: ["identity.status"],
  },
  {
    type: "link",
    label: "Événements hôtels",
    href: "/admin/evenements-hotels",
    id: "admin-nav-hotel-events",
    icon: CalendarCheckIcon,
    needs: ["listings.view"],
  },
  {
    type: "link",
    label: "Visites",
    href: "/admin/demandes-de-visite",
    id: "admin-nav-visit-requests",
    icon: CalendarCheckIcon,
    needs: ["applications.view"],
  },
];

const developmentNavItems: AdminNavItem[] = [
  {
    type: "link",
    label: "Talent",
    href: "/admin/talent",
    id: "admin-nav-talent",
    icon: ClipboardTextIcon,
    needs: ["talent.manage"],
  },
  {
    type: "link",
    label: "Parrainage",
    href: "/admin/parrainage",
    id: "admin-nav-parrainage",
    icon: HandshakeIcon,
    needs: ["referrals.validate"],
  },
];

const pilotageNavItems: AdminNavItem[] = [
  {
    type: "link",
    label: "Analyses",
    href: "/admin/utilisateurs",
    id: "admin-nav-analyses",
    icon: ChartLineUpIcon,
    needs: ["users.listAll", "users.listOwnersAgents"],
  },
];

const founderPilotageNavItems: AdminNavItem[] = [
  {
    type: "link",
    label: "Finances",
    href: "/admin/finances",
    id: "admin-nav-finances",
    icon: ReceiptIcon,
    needs: ["finances.view"],
  },
  {
    type: "link",
    label: "Paramètres",
    href: "/admin/parametres",
    id: "admin-nav-parametres",
    icon: GearIcon,
    needs: ["settings.manage"],
  },
  {
    type: "link",
    label: "Accès",
    href: "/admin/acces",
    id: "admin-nav-access",
    icon: UsersThreeIcon,
    needs: ["team.manage"],
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
    {
      type: "link",
      label: "Annonces",
      href: "/admin/annonces",
      id: "admin-nav-annonces",
      icon: BuildingsIcon,
      needs: ["listings.view"],
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
      children: [...pilotageNavItems, ...founderPilotageNavItems],
    },
  ];

  // Hide what the person cannot open, and any group left empty.
  return entries.flatMap((entry): AdminNavEntry[] => {
    if (entry.type === "link") return visible(entry, canAny) ? [entry] : [];
    const children = entry.children.filter((child) => visible(child, canAny));
    return children.length > 0 ? [{ ...entry, children }] : [];
  });
}
