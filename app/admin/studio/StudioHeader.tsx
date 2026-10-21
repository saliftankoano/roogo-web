"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { CalendarBlankIcon, ChartBarIcon, ChatsCircleIcon, FolderSimpleIcon, type Icon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { useStudioApprovals } from "@/components/admin/useStudioApprovals";
import { useSocialInboxCount, type SocialInboxCount } from "@/components/admin/useSocialInboxCount";
import { InboxBadge } from "@/components/admin/InboxBadge";
import { useStaffAccess } from "@/components/admin/StaffAccessProvider";

export const CALENDAR_HREF = "/admin/studio/calendrier";
export const STATS_HREF = "/admin/studio/statistiques";
export const INBOX_HREF = "/admin/studio/reseaux";

/**
 * The Studio page header, shared by Projets, Calendrier, Statistiques and
 * Réseaux (design canvas, approved 2026-10-21). It must not read as a second
 * navigation bar under the staff navbar: no pill, no background, just the
 * « Studio » title and four plain text tabs on a thin line.
 *
 * - Desktop (md+): h1 « Studio », then the tabs with a 16 px icon; the active
 *   tab is terracotta, extra bold, with a 2 px underline over the line.
 * - Phone: no title, text labels only (13 px), all four visible at 390 px; the
 *   tab row scrolls sideways if it ever overflows, it never wraps.
 * - `actions` (Actualiser, week navigation...) sits on the same row on the
 *   right, aligned to the bottom; on a phone it goes above the tabs.
 *
 * Badges: the founder sees how many posts wait for validation on Calendrier
 * (amber « à valider »); Réseaux shows the comments and messages waiting for a
 * reply (red when one is late). `inboxCount` lets the Réseaux page pass the
 * count it already knows.
 */
export function StudioHeader({
  className,
  inboxCount,
  actions,
}: {
  className?: string;
  inboxCount?: SocialInboxCount;
  actions?: React.ReactNode;
}) {
  const pathname = usePathname() ?? "";
  const { user } = useUser();
  const { can } = useStaffAccess();
  const userType = (user?.publicMetadata?.userType || user?.publicMetadata?.user_type) as string | undefined;
  const waiting = useStudioApprovals(userType === "founder");
  const canInbox = can("social.inbox");
  const fetchedInbox = useSocialInboxCount(canInbox && inboxCount === undefined);
  const toAnswer = inboxCount ?? fetchedInbox;
  const onCalendar = pathname.startsWith(CALENDAR_HREF);
  const onStats = pathname.startsWith(STATS_HREF);
  const onInbox = pathname.startsWith(INBOX_HREF);
  const onProjects = !onCalendar && !onStats && !onInbox;

  const tab = (href: string, label: string, TabIcon: Icon, active: boolean, badge?: React.ReactNode) => (
    <Link
      key={href}
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex h-11 shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 text-[13px] transition-colors md:h-10 md:text-sm",
        active ? "border-[#C96A2E] font-extrabold text-[#A8521D]" : "border-transparent font-semibold text-[#6A6A6A] hover:text-[#1A1A1A]",
      )}
    >
      <TabIcon size={16} weight={active ? "fill" : "bold"} aria-hidden="true" className="hidden size-4 shrink-0 md:inline" />
      {label}
      {badge}
    </Link>
  );

  return (
    <div className={cn("flex min-w-0 flex-col-reverse gap-y-2 border-b border-[#E3D8CC] md:flex-row md:items-end md:gap-x-4", className)}>
      <div className="flex min-w-0 items-end gap-7">
        <h1 className="hidden pb-2 text-[26px] font-extrabold leading-none tracking-[-0.015em] text-[#1A1A1A] md:block">Studio</h1>
        <nav
          aria-label="Studio"
          className="-mb-px flex min-w-0 items-end gap-4 overflow-x-auto [scrollbar-width:none] md:gap-6 [&::-webkit-scrollbar]:hidden"
        >
          {tab("/admin/studio", "Projets", FolderSimpleIcon, onProjects)}
          {tab(
            CALENDAR_HREF,
            "Calendrier",
            CalendarBlankIcon,
            onCalendar,
            waiting > 0 ? (
              <span
                aria-label={`${waiting} à valider`}
                className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#E9A23B] px-1.5 text-[11px] font-bold leading-none text-[#1F1A16]"
              >
                {waiting > 9 ? "9+" : waiting}
              </span>
            ) : null,
          )}
          {tab(STATS_HREF, "Statistiques", ChartBarIcon, onStats)}
          {canInbox &&
            tab(
              INBOX_HREF,
              "Réseaux",
              ChatsCircleIcon,
              onInbox,
              toAnswer.total > 0 ? <InboxBadge count={toAnswer.total} overdue={toAnswer.overdue} /> : null,
            )}
        </nav>
      </div>
      {actions && <div className="flex min-w-0 items-center justify-end gap-2 md:ml-auto md:pb-2">{actions}</div>}
    </div>
  );
}
