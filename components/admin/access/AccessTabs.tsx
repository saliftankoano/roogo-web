"use client";

// The two tabs of « Accès » (/admin/acces). The second tab is only shown to
// people whose level has team.manage; its page is also guarded on the server
// (app/admin/acces/niveaux/layout.tsx) and its API routes check the same rule.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { KeyIcon, ShieldCheckIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

export const ACCESS_RULES_HREF = "/admin/acces";
export const ACCESS_LEVELS_HREF = "/admin/acces/niveaux";

export function AccessTabs({ canManageLevels }: { canManageLevels: boolean }) {
  const pathname = usePathname();
  const onLevels = pathname === ACCESS_LEVELS_HREF || pathname.startsWith(`${ACCESS_LEVELS_HREF}/`);
  const tabs = [
    { href: ACCESS_RULES_HREF, label: "Qui peut faire quoi", Icon: ShieldCheckIcon, active: !onLevels },
    ...(canManageLevels
      ? [{ href: ACCESS_LEVELS_HREF, label: "Niveaux et invitations", Icon: KeyIcon, active: onLevels }]
      : []),
  ];

  return (
    <nav aria-label="Onglets de la page Accès" className="flex flex-wrap gap-2">
      {tabs.map(({ href, label, Icon, active }) => (
        <Link
          key={href}
          href={href}
          aria-current={active ? "page" : undefined}
          className={cn(
            "inline-flex h-11 items-center gap-1.5 rounded-full border px-4 text-sm font-bold sm:h-9",
            active
              ? "border-[#1F1A16] bg-[#1F1A16] text-white"
              : "border-[#EDE4D8] bg-white text-[#8A4924] hover:text-[#C96A2E]",
          )}
        >
          <Icon size={16} weight={active ? "fill" : "bold"} aria-hidden="true" />
          {label}
        </Link>
      ))}
    </nav>
  );
}
