"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { CalendarBlankIcon, ChartBarIcon, ChatsCircleIcon, FolderSimpleIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { useStudioApprovals } from "@/components/admin/useStudioApprovals";
import { useSocialInboxCount, type SocialInboxCount } from "@/components/admin/useSocialInboxCount";
import { InboxBadge } from "@/components/admin/InboxBadge";
import { useStaffAccess } from "@/components/admin/StaffAccessProvider";

export const CALENDAR_HREF = "/admin/studio/calendrier";
export const STATS_HREF = "/admin/studio/statistiques";
export const INBOX_HREF = "/admin/studio/reseaux";

/**
 * Studio sections (navigation approved 2026-10-13): Projets | Calendrier, plus
 * Statistiques (Facebook and Instagram numbers, 2026-10-19) and Réseaux
 * (comments and direct messages to answer, 2026-10-21, Conseiller and above).
 * The project tools stay inside a project. The founder sees how many posts
 * wait for validation on Calendrier; Réseaux shows how many comments and
 * messages wait for a reply.
 *
 * On a phone only the current tab keeps its label, so four tabs fit in 358 px.
 * `inboxCount` lets the Réseaux page pass the count it already knows (total
 * and overdue: the badge turns red when a reply is late).
 */
export function StudioSwitch({ className, inboxCount }: { className?: string; inboxCount?: SocialInboxCount }) {
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

  const item = (active: boolean) =>
    cn(
      "inline-flex h-10 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-sm font-semibold transition-colors sm:px-3.5 md:h-9",
      active ? "bg-[rgba(201,106,46,0.12)] text-[#A8521D]" : "text-neutral-600 hover:bg-white/80 hover:text-neutral-900",
    );
  // Phone: icon only for the tabs you are not on.
  const label = (active: boolean) => (active ? undefined : "sr-only sm:not-sr-only");

  return (
    <nav aria-label="Studio" className={cn("inline-flex max-w-full shrink-0 items-center gap-0.5 rounded-full bg-[rgba(255,255,255,0.7)] p-1 shadow-[0_6px_18px_-14px_rgba(90,50,26,0.5)]", className)}>
      <Link href="/admin/studio" aria-current={onProjects ? "page" : undefined} className={item(onProjects)}>
        <FolderSimpleIcon size={16} weight={onProjects ? "fill" : "bold"} className="size-4 shrink-0" />
        <span className={label(onProjects)}>Projets</span>
      </Link>
      <Link href={CALENDAR_HREF} aria-current={onCalendar ? "page" : undefined} className={item(onCalendar)}>
        <CalendarBlankIcon size={16} weight={onCalendar ? "fill" : "bold"} className="size-4 shrink-0" />
        <span className={label(onCalendar)}>Calendrier</span>
        {waiting > 0 && (
          <span
            aria-label={`${waiting} à valider`}
            className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#E9A23B] px-1.5 text-[11px] font-bold leading-none text-[#1F1A16]"
          >
            {waiting > 9 ? "9+" : waiting}
          </span>
        )}
      </Link>
      <Link href={STATS_HREF} aria-current={onStats ? "page" : undefined} className={item(onStats)}>
        <ChartBarIcon size={16} weight={onStats ? "fill" : "bold"} className="size-4 shrink-0" />
        <span className={label(onStats)}>Statistiques</span>
      </Link>
      {canInbox && (
        <Link href={INBOX_HREF} aria-current={onInbox ? "page" : undefined} className={item(onInbox)}>
          <ChatsCircleIcon size={16} weight={onInbox ? "fill" : "bold"} className="size-4 shrink-0" />
          <span className={label(onInbox)}>Réseaux</span>
          {toAnswer.total > 0 && <InboxBadge count={toAnswer.total} overdue={toAnswer.overdue} />}
        </Link>
      )}
    </nav>
  );
}
