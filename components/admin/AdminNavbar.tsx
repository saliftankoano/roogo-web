"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CaretDownIcon, ListIcon, XIcon } from "@phosphor-icons/react";
import { UserButton, useUser } from "@clerk/nextjs";
import Image from "next/image";
import { cn } from "../../lib/utils";
import {
  motion,
  AnimatePresence,
} from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
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

function getActiveEntryId(pathname: string, navItems: AdminNavEntry[]) {
  return navItems.find((item) => isEntryActive(pathname, item))?.id ?? null;
}

function getActiveGroupId(pathname: string, navItems: AdminNavEntry[]) {
  return (
    navItems.find(
      (item) =>
        item.type === "group" &&
        item.children.some((child) => isLinkActive(pathname, child.href)),
    )?.id ?? null
  );
}

// Desktop bar: icons only from lg (1024 px) to xl (1280 px), icons and
// labels from xl. A label never wraps or truncates: below xl it is a
// screen-reader label plus this tooltip on hover and keyboard focus.
const desktopItemClass =
  "group/nav relative flex items-center rounded-full px-3 py-2 text-sm font-bold outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-primary/40";

function NavTooltip({ label, hidden }: { label: string; hidden?: boolean }) {
  if (hidden) return null;
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-neutral-900 px-2 py-1 text-xs font-semibold text-white opacity-0 shadow-md transition-opacity duration-150 group-hover/nav:opacity-100 group-focus-visible/nav:opacity-100 xl:hidden"
    >
      {label}
    </span>
  );
}

/** Children of a group, with a small heading where a new section starts. */
function GroupLinks({
  items,
  pathname,
  onNavigate,
  size,
}: {
  items: AdminNavItem[];
  pathname: string;
  onNavigate: () => void;
  size: "desktop" | "mobile";
}) {
  return (
    <>
      {items.map((child, index) => {
        const childActive = isLinkActive(pathname, child.href);
        const ChildIcon = child.icon;
        const heading = child.section && child.section !== items[index - 1]?.section ? child.section : null;
        return (
          <div key={child.id} role="none">
            {heading && (
              <p
                role="presentation"
                className={cn(
                  "px-4 pb-1 text-[11px] font-extrabold uppercase tracking-[0.06em] text-neutral-400",
                  index > 0 && "mt-2 border-t border-neutral-100 pt-3",
                )}
              >
                {heading}
              </p>
            )}
            <Link
              href={child.href}
              data-id={child.id}
              role={size === "desktop" ? "menuitem" : undefined}
              aria-current={childActive ? "page" : undefined}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-bold transition-colors",
                childActive
                  ? "bg-primary/10 text-primary"
                  : "text-neutral-600 hover:bg-neutral-50 hover:text-neutral-950",
              )}
            >
              <ChildIcon size={20} weight={childActive ? "fill" : "bold"} className="shrink-0" />
              <span className="whitespace-nowrap">{child.label}</span>
            </Link>
          </div>
        );
      })}
    </>
  );
}

function DesktopNavLink({
  item,
  isActive,
  badge,
}: {
  item: AdminNavItem;
  isActive: boolean;
  badge?: React.ReactNode;
}) {
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      data-id={item.id}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        desktopItemClass,
        isActive ? "text-primary" : "text-neutral-500 hover:text-neutral-900",
      )}
    >
      {isActive && (
        <motion.div
          layoutId="admin-nav-active-pill"
          className="absolute inset-0 bg-white rounded-full shadow-sm"
          transition={roogoMotion.spring}
        />
      )}
      <span className="relative z-10 flex items-center gap-1.5">
        <Icon size={18} weight={isActive ? "fill" : "bold"} className="shrink-0" />
        <span className="sr-only whitespace-nowrap xl:not-sr-only">{item.label}</span>
        {badge}
      </span>
      <NavTooltip label={item.label} />
    </Link>
  );
}

export function AdminNavbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openGroupId, setOpenGroupId] = useState<string | null>(null);
  const [mobileOpenGroupId, setMobileOpenGroupId] = useState<string | null>(
    null,
  );
  const desktopNavRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const { isLoaded, user } = useUser();

  const { canAny, level } = useStaffAccess();

  const isFounder = level === "founder";
  const navItems = useMemo(
    () => [todayNavItem, ...getAdminNavItems(canAny)],
    [canAny],
  );
  const todayCount = useTodayCount(isLoaded && !!user);
  const waitingApprovals = useStudioApprovals(isFounder);
  const activeEntryId = useMemo(
    () => getActiveEntryId(pathname, navItems),
    [navItems, pathname],
  );
  const activeGroupId = useMemo(
    () => getActiveGroupId(pathname, navItems),
    [navItems, pathname],
  );

  useEffect(() => {
    setOpenGroupId(null);
  }, [pathname]);

  useEffect(() => {
    if (mobileMenuOpen && activeGroupId) {
      setMobileOpenGroupId(activeGroupId);
    }
  }, [activeGroupId, mobileMenuOpen]);

  useEffect(() => {
    if (!openGroupId) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (
        desktopNavRef.current &&
        !desktopNavRef.current.contains(event.target as Node)
      ) {
        setOpenGroupId(null);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenGroupId(null);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [openGroupId]);

  return (
    <header
      className="fixed top-4 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-7xl mx-auto z-50"
    >
      <div
        className="flex h-16 items-center justify-between gap-3 rounded-full border border-white/40 bg-white/85 px-3 py-2 shadow-lg backdrop-blur-xl sm:px-4"
      >
        <Link href="/" className="flex items-center shrink-0 group">
          <div className="mr-3 rounded-2xl bg-primary/10 p-2 transition-colors duration-200 group-hover:bg-primary/15">
            <Image
              src="/logo.png?v=2"
              alt="Roogo Logo"
              width={28}
              height={28}
              className="object-contain"
            />
          </div>
          <span className="font-bold text-xl tracking-tight text-neutral-900 hidden lg:block">
            Roogo
          </span>
        </Link>

        <div
          ref={desktopNavRef}
          data-id="staff-menu"
          className="hidden lg:flex items-center gap-0.5 bg-neutral-100/50 p-1 rounded-full border border-neutral-200/30"
        >
          {navItems.map((item, index) => {
            const isActive = activeEntryId === item.id;

            if (item.type === "link") {
              return (
                <DesktopNavLink
                  key={item.id}
                  item={item}
                  isActive={isActive}
                  badge={
                    item.id === todayNavItem.id ? (
                      <CountBadge count={todayCount} active={isActive} />
                    ) : item.id === studioNavItem.id ? (
                      <ApprovalBadge count={waitingApprovals} />
                    ) : undefined
                  }
                />
              );
            }

            const Icon = item.icon;
            const isOpen = openGroupId === item.id;

            return (
              <div key={item.id} className="relative">
                <button
                  type="button"
                  data-id={item.id}
                  aria-haspopup="menu"
                  aria-expanded={isOpen}
                  onClick={() =>
                    setOpenGroupId((current) =>
                      current === item.id ? null : item.id,
                    )
                  }
                  className={cn(
                    desktopItemClass,
                    isActive
                      ? "text-primary"
                      : "text-neutral-500 hover:text-neutral-900",
                  )}
                >
                  {isActive && (
                    <motion.div
                      layoutId="admin-nav-active-pill"
                      className="absolute inset-0 bg-white rounded-full shadow-sm"
                      transition={roogoMotion.spring}
                    />
                  )}
                  <span className="relative z-10 flex items-center gap-1.5">
                    <Icon size={18} weight={isActive ? "fill" : "bold"} className="shrink-0" />
                    <span className="sr-only whitespace-nowrap xl:not-sr-only">{item.label}</span>
                    <CaretDownIcon
                      size={12}
                      weight="bold"
                      className={cn(
                        "shrink-0 transition-transform duration-200",
                        isOpen && "rotate-180",
                      )}
                    />
                  </span>
                  <NavTooltip label={item.label} hidden={isOpen} />
                </button>

                <AnimatePresence>
                  {isOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 4 }}
                      transition={roogoMotion.quick}
                      role="menu"
                      aria-label={item.label}
                      className={cn(
                        "absolute top-full mt-3 w-64 overflow-hidden rounded-[24px] border border-neutral-200/70 bg-white p-2 shadow-2xl",
                        // The last groups sit near the avatar: open them leftwards so they stay on screen.
                        index >= navItems.length - 2 ? "right-0" : "left-0",
                      )}
                    >
                      <GroupLinks
                        items={item.children}
                        pathname={pathname}
                        onNavigate={() => setOpenGroupId(null)}
                        size="desktop"
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          {!isLoaded ? (
            <div className="w-10 h-10 rounded-full bg-neutral-100 animate-pulse" />
          ) : (
            // Avatar only: the name and email are in its menu (and in the
            // tooltip), so the bar never crops them.
            <div
              className="flex shrink-0 items-center"
              title={[user?.fullName, user?.primaryEmailAddress?.emailAddress].filter(Boolean).join(" · ") || undefined}
            >
              <UserButton
                afterSignOutUrl="/"
                appearance={{
                  elements: {
                    userButtonAvatarBox:
                      "w-10 h-10 border-2 border-primary/20 hover:border-primary/50 transition-all duration-300 shadow-sm",
                  },
                }}
              />
            </div>
          )}

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

          <button
            className="rounded-full bg-neutral-100 p-2 text-neutral-600 transition-colors hover:text-primary lg:hidden"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label={mobileMenuOpen ? "Fermer le menu" : "Ouvrir le menu"}
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? (
              <XIcon size={22} weight="bold" />
            ) : (
              <ListIcon size={22} weight="bold" />
            )}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={roogoMotion.standard}
            data-id="staff-menu"
            className="lg:hidden absolute top-full left-0 right-0 mt-4 max-h-[calc(100dvh-7rem)] overflow-y-auto overscroll-contain bg-white/95 backdrop-blur-xl rounded-[32px] p-6 shadow-2xl border border-white/50 flex flex-col gap-2"
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
                      onClick={() =>
                        setMobileOpenGroupId((current) =>
                          current === item.id ? null : item.id,
                        )
                      }
                      className={cn(
                        "flex w-full items-center gap-4 p-4 rounded-2xl text-base font-bold transition-all",
                        isActive
                          ? "bg-primary/10 text-primary"
                          : "text-neutral-600 hover:bg-neutral-50",
                      )}
                    >
                      <Icon size={24} weight={isActive ? "fill" : "bold"} />
                      <span className="flex-1 text-left">{item.label}</span>
                      <CaretDownIcon
                        size={16}
                        weight="bold"
                        className={cn(
                          "transition-transform duration-200",
                          isOpen && "rotate-180",
                        )}
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
                            <GroupLinks
                              items={item.children}
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
                  key={item.label}
                  href={item.href}
                  data-id={item.id}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    "flex items-center gap-4 p-4 rounded-2xl text-base font-bold transition-all",
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-neutral-600 hover:bg-neutral-50",
                  )}
                >
                  <Icon size={24} weight={isActive ? "fill" : "bold"} />
                  {item.label}
                  {item.id === studioNavItem.id && <ApprovalBadge count={waitingApprovals} />}
                  {item.id === todayNavItem.id && (
                    <CountBadge count={todayCount} active={isActive} />
                  )}
                </Link>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
