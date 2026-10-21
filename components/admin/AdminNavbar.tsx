"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CaretDownIcon, ListIcon, XIcon } from "@phosphor-icons/react";
import { UserButton, useUser } from "@clerk/nextjs";
import Image from "next/image";
import { cn } from "../../lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  getAdminNavItems,
  studioNavItem,
  todayNavItem,
  type AdminNavEntry,
  type AdminNavItem,
} from "../../lib/navigation/adminNav";
import { roogoMotion } from "@/lib/motion";
import { TEAM_TASKS_CHANGED } from "./team/events";
import { useStaffAccess } from "@/components/admin/StaffAccessProvider";
import { useStudioApprovals } from "./useStudioApprovals";

// The one staff bar (2026-10-20). The admin layout renders it, and the public
// Navbar renders it too for a signed-in staff member or founder, so the bar
// never changes when someone moves between the site and the back office.

/** Founder only: posts waiting for validation, on the Studio item. */
function ApprovalBadge({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span
      aria-label={`${count} publication${count > 1 ? "s" : ""} à valider`}
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#E9A23B] px-1.5 text-[11px] font-bold leading-none text-[#1F1A16]",
        className,
      )}
    >
      {count > 9 ? "9+" : count}
    </span>
  );
}

function isLinkActive(pathname: string, href: string) {
  // "/admin" is the briefing: exact, plus the pages opened from it (team
  // board, goals and their levers, call notes).
  if (href === todayNavItem.href) {
    return pathname === href || ["/admin/equipe", "/admin/objectifs", "/admin/notes-appels"].some(
      (page) => pathname === page || pathname.startsWith(`${page}/`),
    );
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Open tasks for today plus unread answers on demandes, on the "Accueil" item; refreshed when tasks change. */
function useTodayCount(enabled: boolean) {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const load = async () => {
      try {
        const response = await fetch("/api/admin/team-tasks?view=count");
        if (!response.ok) return;
        const body = (await response.json()) as { open?: number; unread?: number };
        if (alive && typeof body.open === "number") setCount(body.open + (typeof body.unread === "number" ? body.unread : 0));
      } catch {
        // The badge is a convenience; the briefing page shows the real list.
      }
    };
    load();
    window.addEventListener(TEAM_TASKS_CHANGED, load);
    return () => {
      alive = false;
      window.removeEventListener(TEAM_TASKS_CHANGED, load);
    };
  }, [enabled]);
  return count;
}

function CountBadge({ count, active }: { count: number | null; active: boolean }) {
  if (!count) return null;
  return (
    <span
      aria-label={`${count} ${count > 1 ? "éléments" : "élément"} à voir aujourd’hui (tâches et réponses)`}
      className={cn(
        "inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[11px] font-extrabold",
        active ? "bg-primary text-white" : "bg-primary/90 text-white",
      )}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

function isEntryActive(pathname: string, item: AdminNavEntry) {
  if (item.type === "group") {
    return item.children.some((child) => isLinkActive(pathname, child.href));
  }
  return isLinkActive(pathname, item.href);
}

/** Children split by their section heading, in order. */
function sectionsOf(items: AdminNavItem[]) {
  const sections: { heading: string | null; items: AdminNavItem[] }[] = [];
  for (const item of items) {
    const heading = item.section ?? null;
    const last = sections[sections.length - 1];
    if (last && last.heading === heading) last.items.push(item);
    else sections.push({ heading, items: [item] });
  }
  return sections;
}

function SectionHeading({ children, first }: { children: ReactNode; first: boolean }) {
  return (
    <p
      role="presentation"
      className={cn(
        "px-3 pb-1 text-[11px] font-extrabold uppercase tracking-[0.06em] text-neutral-400",
        first ? "pt-1" : "mt-2 border-t border-neutral-100 pt-3",
      )}
    >
      {children}
    </p>
  );
}

function GroupLink({
  item,
  pathname,
  onNavigate,
  size,
}: {
  item: AdminNavItem;
  pathname: string;
  onNavigate: () => void;
  size: "desktop" | "mobile";
}) {
  const active = isLinkActive(pathname, item.href);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      data-id={item.id}
      role={size === "desktop" ? "menuitem" : undefined}
      aria-current={active ? "page" : undefined}
      onClick={onNavigate}
      className={cn(
        "flex items-center gap-3 rounded-2xl text-sm font-bold transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        size === "desktop" ? "px-3 py-2.5" : "px-4 py-3",
        active ? "bg-primary/10 text-primary" : "text-neutral-600 hover:bg-neutral-50 hover:text-neutral-950",
      )}
    >
      <Icon size={size === "desktop" ? 18 : 20} weight={active ? "fill" : "bold"} className="shrink-0" />
      <span className="whitespace-nowrap">{item.label}</span>
    </Link>
  );
}

/** A section list (heading, then its links). */
function SectionList({
  sections,
  pathname,
  onNavigate,
  size,
}: {
  sections: ReturnType<typeof sectionsOf>;
  pathname: string;
  onNavigate: () => void;
  size: "desktop" | "mobile";
}) {
  return (
    <>
      {sections.map((section, index) => (
        <div key={`${section.heading ?? "items"}-${index}`} role="none" className="flex flex-col gap-0.5">
          {section.heading && <SectionHeading first={index === 0}>{section.heading}</SectionHeading>}
          {section.items.map((child) => (
            <GroupLink key={child.id} item={child} pathname={pathname} onNavigate={onNavigate} size={size} />
          ))}
        </div>
      ))}
    </>
  );
}

/**
 * Desktop menu of a group. With several sections (« Plus »), the first one
 * (Opérations) gets its own column and the others share the second, so the
 * menu stays short enough for a laptop screen.
 */
function DesktopGroupMenu({
  item,
  pathname,
  onNavigate,
  alignRight,
}: {
  item: Extract<AdminNavEntry, { type: "group" }>;
  pathname: string;
  onNavigate: () => void;
  alignRight: boolean;
}) {
  const sections = sectionsOf(item.children);
  // A second column only when it has enough to hold (founder, Directeur);
  // a short one (Accès alone) stays under Opérations.
  const twoColumns = sections.length > 1 && sections.slice(1).reduce((n, s) => n + s.items.length, 0) >= 3;
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 4 }}
      transition={roogoMotion.quick}
      role="menu"
      aria-label={item.label}
      data-id={`${item.id}-menu`}
      className={cn(
        "absolute top-full z-30 mt-3 max-h-[calc(100dvh-7rem)] overflow-y-auto rounded-[24px] border border-neutral-200/70 bg-white p-2 shadow-2xl",
        twoColumns ? "grid w-[30rem] grid-cols-2 gap-x-2" : "w-60",
        alignRight ? "right-0" : "left-0",
      )}
    >
      {twoColumns ? (
        <>
          <div role="none" className="flex flex-col">
            <SectionList sections={sections.slice(0, 1)} pathname={pathname} onNavigate={onNavigate} size="desktop" />
          </div>
          <div role="none" className="flex flex-col border-l border-neutral-100 pl-2">
            <SectionList sections={sections.slice(1)} pathname={pathname} onNavigate={onNavigate} size="desktop" />
          </div>
        </>
      ) : (
        <SectionList sections={sections} pathname={pathname} onNavigate={onNavigate} size="desktop" />
      )}
    </motion.div>
  );
}

const desktopItemClass =
  "relative flex items-center rounded-full px-3 py-2 text-sm font-bold outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-primary/40";

function ActivePill() {
  return (
    <motion.div
      layoutId="admin-nav-active-pill"
      className="absolute inset-0 rounded-full bg-white shadow-sm"
      transition={roogoMotion.spring}
    />
  );
}

export type StaffNavbarViewProps = {
  pathname: string;
  navItems: AdminNavEntry[];
  todayCount: number | null;
  waitingApprovals: number;
  /** The Clerk avatar button, or null while Clerk loads. */
  account: ReactNode | null;
  /** Name and email, shown as the avatar tooltip. */
  accountTitle?: string;
};

/** The bar itself, driven by props so a fixture can render any level. */
export function StaffNavbarView({
  pathname,
  navItems,
  todayCount,
  waitingApprovals,
  account,
  accountTitle,
}: StaffNavbarViewProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openGroupId, setOpenGroupId] = useState<string | null>(null);
  const [mobileOpenGroupId, setMobileOpenGroupId] = useState<string | null>(null);
  const desktopNavRef = useRef<HTMLDivElement>(null);

  const activeEntryId = useMemo(
    () => navItems.find((item) => isEntryActive(pathname, item))?.id ?? null,
    [navItems, pathname],
  );
  const activeGroupId = useMemo(
    () => navItems.find((item) => item.type === "group" && isEntryActive(pathname, item))?.id ?? null,
    [navItems, pathname],
  );
  const showStudio = navItems.some((item) => item.id === studioNavItem.id);

  useEffect(() => {
    setOpenGroupId(null);
    setMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (mobileMenuOpen && activeGroupId) setMobileOpenGroupId(activeGroupId);
  }, [activeGroupId, mobileMenuOpen]);

  useEffect(() => {
    if (!openGroupId) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (desktopNavRef.current && !desktopNavRef.current.contains(event.target as Node)) {
        setOpenGroupId(null);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenGroupId(null);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [openGroupId]);

  const badgeFor = (id: string, active: boolean) =>
    id === todayNavItem.id ? (
      <CountBadge count={todayCount} active={active} />
    ) : id === studioNavItem.id ? (
      <ApprovalBadge count={waitingApprovals} />
    ) : null;

  return (
    <header
      data-staff-navbar
      className="fixed top-4 left-1/2 z-50 mx-auto w-[calc(100%-2rem)] max-w-7xl -translate-x-1/2"
    >
      <div className="flex h-16 items-center justify-between gap-3 rounded-full border border-white/40 bg-white/85 px-3 py-2 shadow-lg backdrop-blur-xl sm:px-4">
        <Link href="/" aria-label="Roogo, site public" className="group flex shrink-0 items-center">
          <div className="rounded-2xl bg-primary/10 p-2 transition-colors duration-200 group-hover:bg-primary/15">
            <Image src="/logo.png?v=2" alt="" width={28} height={28} className="object-contain" />
          </div>
          <span className="ml-3 hidden text-xl font-bold tracking-tight text-neutral-900 sm:block">Roogo</span>
        </Link>

        <nav
          ref={desktopNavRef}
          aria-label="Navigation de l’équipe"
          data-id="staff-menu"
          className="hidden items-center gap-0.5 rounded-full border border-neutral-200/30 bg-neutral-100/50 p-1 lg:flex"
        >
          {navItems.map((item, index) => {
            const isActive = activeEntryId === item.id;
            const Icon = item.icon;

            if (item.type === "link") {
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  data-id={item.id}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(desktopItemClass, isActive ? "text-primary" : "text-neutral-500 hover:text-neutral-900")}
                >
                  {isActive && <ActivePill />}
                  <span className="relative z-10 flex items-center gap-1.5">
                    <Icon size={18} weight={isActive ? "fill" : "bold"} className="shrink-0" />
                    <span className="whitespace-nowrap">{item.label}</span>
                    {badgeFor(item.id, isActive)}
                  </span>
                </Link>
              );
            }

            const isOpen = openGroupId === item.id;
            return (
              <div key={item.id} className="relative">
                <button
                  type="button"
                  data-id={item.id}
                  aria-haspopup="menu"
                  aria-expanded={isOpen}
                  onClick={() => setOpenGroupId((current) => (current === item.id ? null : item.id))}
                  className={cn(desktopItemClass, isActive ? "text-primary" : "text-neutral-500 hover:text-neutral-900")}
                >
                  {isActive && <ActivePill />}
                  <span className="relative z-10 flex items-center gap-1.5">
                    <Icon size={18} weight={isActive ? "fill" : "bold"} className="shrink-0" />
                    <span className="whitespace-nowrap">{item.label}</span>
                    <CaretDownIcon
                      size={12}
                      weight="bold"
                      className={cn("shrink-0 transition-transform duration-200", isOpen && "rotate-180")}
                    />
                  </span>
                </button>
                <AnimatePresence>
                  {isOpen && (
                    <DesktopGroupMenu
                      item={item}
                      pathname={pathname}
                      onNavigate={() => setOpenGroupId(null)}
                      // The last group sits near the avatar: open it leftwards.
                      alignRight={index === navItems.length - 1}
                    />
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </nav>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          {account === null ? (
            <div className="h-10 w-10 animate-pulse rounded-full bg-neutral-100" />
          ) : (
            // Avatar only: the name and email are in its menu (and in the
            // tooltip), so the bar never crops them.
            <div className="flex shrink-0 items-center" title={accountTitle || undefined}>
              {account}
            </div>
          )}

          {showStudio && (
            <Link
              href={studioNavItem.href}
              data-id="admin-nav-studio-mobile"
              aria-label="Studio de contenu"
              aria-current={isLinkActive(pathname, studioNavItem.href) ? "page" : undefined}
              className={cn(
                "relative ml-1 rounded-full p-2 transition-colors lg:hidden",
                isLinkActive(pathname, studioNavItem.href)
                  ? "bg-primary/10 text-primary"
                  : "bg-neutral-100 text-neutral-600 hover:text-primary",
              )}
            >
              <studioNavItem.icon size={22} weight="bold" />
              <ApprovalBadge count={waitingApprovals} className="absolute -right-1 -top-1" />
            </Link>
          )}

          <button
            type="button"
            className="rounded-full bg-neutral-100 p-2 text-neutral-600 transition-colors hover:text-primary lg:hidden"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label={mobileMenuOpen ? "Fermer le menu" : "Ouvrir le menu"}
            aria-expanded={mobileMenuOpen}
            aria-controls="staff-mobile-navigation"
          >
            {mobileMenuOpen ? <XIcon size={22} weight="bold" /> : <ListIcon size={22} weight="bold" />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.nav
            id="staff-mobile-navigation"
            aria-label="Navigation de l’équipe (mobile)"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={roogoMotion.standard}
            data-id="staff-menu-mobile"
            className="absolute top-full left-0 right-0 mt-4 flex max-h-[calc(100dvh-7rem)] flex-col gap-1 overflow-y-auto overscroll-contain rounded-[32px] border border-white/50 bg-white/95 p-4 shadow-2xl backdrop-blur-xl lg:hidden"
          >
            {navItems.map((item) => {
              const isActive = isEntryActive(pathname, item);
              const Icon = item.icon;

              if (item.type === "group") {
                const isOpen = mobileOpenGroupId === item.id;
                return (
                  <div key={item.id} data-id={item.id}>
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      onClick={() => setMobileOpenGroupId((current) => (current === item.id ? null : item.id))}
                      className={cn(
                        "flex w-full items-center gap-4 rounded-2xl p-4 text-base font-bold transition-colors duration-200",
                        isActive ? "bg-primary/10 text-primary" : "text-neutral-600 hover:bg-neutral-50",
                      )}
                    >
                      <Icon size={24} weight={isActive ? "fill" : "bold"} />
                      <span className="flex-1 text-left">{item.label}</span>
                      <CaretDownIcon
                        size={16}
                        weight="bold"
                        className={cn("transition-transform duration-200", isOpen && "rotate-180")}
                      />
                    </button>
                    <AnimatePresence initial={false}>
                      {isOpen && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={roogoMotion.standard}
                          className="overflow-hidden"
                        >
                          <div className="ml-4 mt-1 flex flex-col gap-1 border-l border-neutral-100 pl-3">
                            <SectionList
                              sections={sectionsOf(item.children)}
                              pathname={pathname}
                              onNavigate={() => setMobileMenuOpen(false)}
                              size="mobile"
                            />
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              }

              return (
                <Link
                  key={item.id}
                  href={item.href}
                  data-id={item.id}
                  aria-current={isActive ? "page" : undefined}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    "flex items-center gap-4 rounded-2xl p-4 text-base font-bold transition-colors duration-200",
                    isActive ? "bg-primary/10 text-primary" : "text-neutral-600 hover:bg-neutral-50",
                  )}
                >
                  <Icon size={24} weight={isActive ? "fill" : "bold"} />
                  {item.label}
                  {badgeFor(item.id, isActive)}
                </Link>
              );
            })}
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}

/**
 * The staff bar with live data: level from StaffAccessProvider (admin layout,
 * worked out on the server) or from the Clerk metadata (public pages).
 */
export function AdminNavbar() {
  const pathname = usePathname();
  const { isLoaded, user } = useUser();
  const { canAny, level } = useStaffAccess();
  const navItems = useMemo(() => getAdminNavItems(canAny), [canAny]);
  const todayCount = useTodayCount(isLoaded && !!user);
  const waitingApprovals = useStudioApprovals(level === "founder");

  return (
    <StaffNavbarView
      pathname={pathname}
      navItems={navItems}
      todayCount={todayCount}
      waitingApprovals={waitingApprovals}
      accountTitle={[user?.fullName, user?.primaryEmailAddress?.emailAddress].filter(Boolean).join(" · ")}
      account={
        isLoaded ? (
          <UserButton
            afterSignOutUrl="/"
            appearance={{
              elements: {
                userButtonAvatarBox:
                  "w-10 h-10 border-2 border-primary/20 hover:border-primary/50 transition-all duration-300 shadow-sm",
              },
            }}
          />
        ) : null
      }
    />
  );
}
