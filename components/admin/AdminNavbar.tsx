"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CaretDownIcon, ListIcon, XIcon } from "@phosphor-icons/react";
import { UserButton, useUser } from "@clerk/nextjs";
import Image from "next/image";
import { cn } from "../../lib/utils";
import {
  motion,
  useScroll,
  useMotionValueEvent,
  AnimatePresence,
} from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  getAdminNavItems,
  type AdminNavEntry,
  type AdminNavItem,
} from "../../lib/navigation/adminNav";

function isLinkActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
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

function DesktopNavLink({
  item,
  isActive,
}: {
  item: AdminNavItem;
  isActive: boolean;
}) {
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      data-id={item.id}
      className={cn(
        "relative flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold outline-none transition-colors duration-200",
        isActive ? "text-primary" : "text-neutral-500 hover:text-neutral-900",
      )}
    >
      {isActive && (
        <motion.div
          layoutId="admin-nav-active-pill"
          className="absolute inset-0 bg-white rounded-full shadow-sm"
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
        />
      )}
      <span className="relative z-10 flex items-center gap-2">
        <Icon size={18} weight={isActive ? "fill" : "bold"} />
        <span className="whitespace-nowrap">{item.label}</span>
      </span>
    </Link>
  );
}

export function AdminNavbar() {
  const { scrollY } = useScroll();
  const [hidden, setHidden] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openGroupId, setOpenGroupId] = useState<string | null>(null);
  const [mobileOpenGroupId, setMobileOpenGroupId] = useState<string | null>(
    null,
  );
  const desktopNavRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const { isLoaded, user } = useUser();

  useMotionValueEvent(scrollY, "change", (latest) => {
    const previous = scrollY.getPrevious() || 0;
    if (latest > previous && latest > 150) {
      setHidden(true);
    } else {
      setHidden(false);
    }
    setIsScrolled(latest > 20);
  });

  const userType = (user?.publicMetadata?.userType ||
    user?.publicMetadata?.user_type) as string | undefined;
  const isFounder = userType === "founder";

  const navItems = useMemo(() => getAdminNavItems(isFounder), [isFounder]);
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
    <motion.header
      variants={{
        visible: { y: 0, opacity: 1 },
        hidden: { y: "-100%", opacity: 0 },
      }}
      animate={hidden ? "hidden" : "visible"}
      transition={{ duration: 0.35, ease: "easeInOut" }}
      className="fixed top-4 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-7xl mx-auto z-50"
    >
      <div
        className={cn(
          "flex items-center justify-between px-4 sm:px-6 py-2 rounded-full transition-all duration-300 border bg-white/80 backdrop-blur-xl shadow-lg border-white/40",
          isScrolled ? "h-16" : "h-20",
        )}
      >
        <Link href="/" className="flex items-center shrink-0 group">
          <div className="bg-primary/10 p-2 rounded-2xl mr-3 group-hover:scale-110 transition-transform duration-300">
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
          className="hidden lg:flex items-center gap-1 bg-neutral-100/50 p-1 rounded-full border border-neutral-200/30"
        >
          {navItems.map((item) => {
            const isActive = activeEntryId === item.id;

            if (item.type === "link") {
              return (
                <DesktopNavLink
                  key={item.id}
                  item={item}
                  isActive={isActive}
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
                    "relative flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold outline-none transition-colors duration-200",
                    isActive
                      ? "text-primary"
                      : "text-neutral-500 hover:text-neutral-900",
                  )}
                >
                  {isActive && (
                    <motion.div
                      layoutId="admin-nav-active-pill"
                      className="absolute inset-0 bg-white rounded-full shadow-sm"
                      transition={{
                        type: "spring",
                        stiffness: 400,
                        damping: 30,
                      }}
                    />
                  )}
                  <span className="relative z-10 flex items-center gap-2">
                    <Icon size={18} weight={isActive ? "fill" : "bold"} />
                    <span className="whitespace-nowrap">{item.label}</span>
                    <CaretDownIcon
                      size={14}
                      weight="bold"
                      className={cn(
                        "transition-transform duration-200",
                        isOpen && "rotate-180",
                      )}
                    />
                  </span>
                </button>

                <AnimatePresence>
                  {isOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 8, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 8, scale: 0.96 }}
                      transition={{ duration: 0.16, ease: "easeOut" }}
                      role="menu"
                      className="absolute left-0 top-full mt-3 w-64 overflow-hidden rounded-[24px] border border-neutral-200/70 bg-white p-2 shadow-2xl"
                    >
                      {item.children.map((child) => {
                        const childActive = isLinkActive(pathname, child.href);
                        const ChildIcon = child.icon;

                        return (
                          <Link
                            key={child.id}
                            href={child.href}
                            data-id={child.id}
                            role="menuitem"
                            onClick={() => setOpenGroupId(null)}
                            className={cn(
                              "flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-bold transition-colors",
                              childActive
                                ? "bg-primary/10 text-primary"
                                : "text-neutral-600 hover:bg-neutral-50 hover:text-neutral-950",
                            )}
                          >
                            <ChildIcon
                              size={20}
                              weight={childActive ? "fill" : "bold"}
                            />
                            {child.label}
                          </Link>
                        );
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-2 sm:gap-4 shrink-0">
          {!isLoaded ? (
            <div className="w-10 h-10 rounded-full bg-neutral-100 animate-pulse" />
          ) : (
            <div className="flex items-center gap-3">
              <div className="hidden lg:flex flex-col items-end leading-tight">
                <span className="text-sm font-bold text-neutral-900 line-clamp-1">
                  {user?.fullName || "Administrateur"}
                </span>
                <span className="text-[11px] text-neutral-500 font-medium line-clamp-1 opacity-70">
                  {user?.primaryEmailAddress?.emailAddress}
                </span>
              </div>
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

          <button
            className="lg:hidden p-2 text-neutral-600 hover:text-primary bg-neutral-100 rounded-full transition-all ml-1"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
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
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            data-id="staff-menu"
            className="lg:hidden absolute top-full left-0 right-0 mt-4 bg-white/95 backdrop-blur-xl rounded-[32px] p-6 shadow-2xl border border-white/50 flex flex-col gap-2"
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
                          className="overflow-hidden"
                        >
                          <div className="ml-4 mt-1 flex flex-col gap-1 border-l border-neutral-100 pl-3">
                            {item.children.map((child) => {
                              const childActive = isLinkActive(
                                pathname,
                                child.href,
                              );
                              const ChildIcon = child.icon;

                              return (
                                <Link
                                  key={child.id}
                                  href={child.href}
                                  data-id={child.id}
                                  onClick={() => setMobileMenuOpen(false)}
                                  className={cn(
                                    "flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-bold transition-all",
                                    childActive
                                      ? "bg-primary/10 text-primary"
                                      : "text-neutral-600 hover:bg-neutral-50",
                                  )}
                                >
                                  <ChildIcon
                                    size={20}
                                    weight={childActive ? "fill" : "bold"}
                                  />
                                  {child.label}
                                </Link>
                              );
                            })}
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
                </Link>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  );
}
