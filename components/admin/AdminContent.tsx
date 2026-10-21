"use client";

import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * The admin page container. Studio pages start close under the floating
 * navbar (design 2026-10-13: no 160 px dead space above the Studio header):
 * the bar is fixed at top-4 and 64 px tall (bottom at 80 px) on every width,
 * so pt-[6.5rem] leaves 24 px on a phone and md:pt-[7.5rem] 40 px from
 * tablets up (design canvas 2026-10-21). Every other admin page keeps its
 * usual spacing.
 */
export function AdminContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  const studio = pathname === "/admin/studio" || pathname.startsWith("/admin/studio/");
  return <div className={cn("grow container mx-auto px-6 pb-12", studio ? "pt-[6.5rem] md:pt-[7.5rem]" : "pt-40")}>{children}</div>;
}
