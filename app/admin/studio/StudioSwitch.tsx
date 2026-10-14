"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { CalendarBlankIcon, FolderSimpleIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { useStudioApprovals } from "@/components/admin/useStudioApprovals";

export const CALENDAR_HREF = "/admin/studio/calendrier";

/**
 * Studio sections (navigation approved 2026-10-13): Projets | Calendrier. The
 * project tools stay inside a project. The founder sees how many posts wait
 * for validation on Calendrier.
 */
export function StudioSwitch({ className }: { className?: string }) {
  const pathname = usePathname() ?? "";
  const { user } = useUser();
  const userType = (user?.publicMetadata?.userType || user?.publicMetadata?.user_type) as string | undefined;
  const waiting = useStudioApprovals(userType === "founder");
  const onCalendar = pathname.startsWith(CALENDAR_HREF);

  const item = (active: boolean) =>
    cn(
      "inline-flex h-10 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-sm font-semibold transition-colors md:h-9",
      active ? "bg-[rgba(201,106,46,0.12)] text-[#A8521D]" : "text-neutral-600 hover:bg-white/80 hover:text-neutral-900",
    );

  return (
    <nav aria-label="Studio" className={cn("inline-flex shrink-0 items-center gap-0.5 rounded-full bg-[rgba(255,255,255,0.7)] p-1 shadow-[0_6px_18px_-14px_rgba(90,50,26,0.5)]", className)}>
      <Link href="/admin/studio" aria-current={!onCalendar ? "page" : undefined} className={item(!onCalendar)}>
        <FolderSimpleIcon size={16} weight={!onCalendar ? "fill" : "bold"} className="size-4 shrink-0" />
        Projets
      </Link>
      <Link href={CALENDAR_HREF} aria-current={onCalendar ? "page" : undefined} className={item(onCalendar)}>
        <CalendarBlankIcon size={16} weight={onCalendar ? "fill" : "bold"} className="size-4 shrink-0" />
        Calendrier
        {waiting > 0 && (
          <span
            aria-label={`${waiting} à valider`}
            className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#E9A23B] px-1.5 text-[11px] font-bold leading-none text-[#1F1A16]"
          >
            {waiting > 9 ? "9+" : waiting}
          </span>
        )}
      </Link>
    </nav>
  );
}
