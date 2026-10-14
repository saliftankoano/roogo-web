"use client";

import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * The admin page container. Studio pages start right under the floating
 * navbar (design 2026-10-13: no 160 px dead space above the Projets |
 * Calendrier switch); every other admin page keeps its usual spacing.
 */
export function AdminContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  const studio = pathname === "/admin/studio" || pathname.startsWith("/admin/studio/");
  return <div className={cn("grow container mx-auto px-6 pb-12", studio ? "pt-24" : "pt-40")}>{children}</div>;
}
