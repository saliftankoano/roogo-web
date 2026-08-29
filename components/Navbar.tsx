"use client";

import Link from "next/link";
import Image from "next/image";
import { Button } from "./ui/Button";
import {
  motion,
  AnimatePresence,
} from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ListIcon,
  XIcon,
  CaretDownIcon,
  HouseLineIcon,
  BriefcaseIcon,
  ChatCircleIcon,
  BuildingsIcon,
  HouseIcon,
  HandshakeIcon,
  CubeFocusIcon,
} from "@phosphor-icons/react";
import { UserButton, useUser } from "@clerk/nextjs";
import { usePathname } from "next/navigation";
import { cn } from "../lib/utils";
import { AnimatedBackground } from "./motion-primitives/animated-background";
import {
  getAdminNavItems,
  type AdminNavEntry,
  type AdminNavItem,
} from "../lib/navigation/adminNav";
import { roogoMotion } from "@/lib/motion";

function isLinkActive(pathname: string, href: string) {
  return pathname === href || (href !== "/" && pathname.startsWith(href));
}

function isAdminEntryActive(pathname: string, item: AdminNavEntry) {
  if (item.type === "group") {
    return item.children.some((child) => isLinkActive(pathname, child.href));
  }

  return isLinkActive(pathname, item.href);
}

function StaffDesktopNavLink({
  item,
  isActive,
}: {
  item: AdminNavItem;
  isActive: boolean;
}) {
  const Icon = item.icon;

  return (
    <motion.div whileTap={{ scale: 0.985 }}>
      <Link
        href={item.href}
        data-id={item.id}
        className={cn(
          "flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold outline-none transition-colors duration-200",
          isActive ? "text-primary" : "text-neutral-500 hover:text-neutral-900",
        )}
      >
        <Icon size={18} weight={isActive ? "fill" : "bold"} />
        <span className="whitespace-nowrap">{item.label}</span>
      </Link>
    </motion.div>
  );
}

export function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openGroupId, setOpenGroupId] = useState<string | null>(null);
  const [mobileOpenGroupId, setMobileOpenGroupId] = useState<string | null>(
    null,
  );
  const staffNavRef = useRef<HTMLDivElement>(null);
  const { isSignedIn, isLoaded, user } = useUser();
  const pathname = usePathname();

  const userType = (user?.publicMetadata?.userType ||
    user?.publicMetadata?.user_type) as string | undefined;
  const isStaff = userType === "staff" || userType === "founder";
  const isFounder = userType === "founder";
  const isAgentOrOwner = userType === "agent" || userType === "owner";
  const staffNavEntries = useMemo(
    () => getAdminNavItems(isFounder),
    [isFounder],
  );

  const publicNavItems = [
    { name: "Accueil", href: "/", icon: HouseLineIcon, id: "nav-accueil" },
    {
      name: "Propriétés",
      href: "/proprietes",
      icon: BuildingsIcon,
      id: "nav-proprietes",
    },
    {
      name: "Visites 3D",
      href: "/visites-3d",
      icon: CubeFocusIcon,
      id: "nav-visites-3d",
    },
    {
      name: "À propos",
      href: "/a-propos",
      icon: HandshakeIcon,
      id: "nav-a-propos",
    },
    {
      name: "Carrières",
      href: "/carrieres",
      icon: BriefcaseIcon,
      id: "nav-carrieres",
    },
    {
      name: "Contact",
      href: "/nous-contacter",
      icon: ChatCircleIcon,
      id: "nav-contact",
    },
  ];

  const renterNavItems = [
    { name: "Accueil", href: "/", icon: HouseLineIcon, id: "nav-accueil" },
    {
      name: "Propriétés",
      href: "/proprietes",
      icon: BuildingsIcon,
      id: "nav-proprietes",
    },
    {
      name: "Parrainage",
      href: "/parrainage",
      icon: HandshakeIcon,
      id: "nav-parrainage",
    },
    {
      name: "Contact",
      href: "/nous-contacter",
      icon: ChatCircleIcon,
      id: "nav-contact",
    },
  ];

  const agentOwnerNavItems = [
    { name: "Accueil", href: "/", icon: HouseLineIcon, id: "nav-accueil" },
    {
      name: "Mes Biens",
      href: "/mes-proprietes",
      icon: HouseIcon,
      id: "nav-mes-biens",
    },
    {
      name: "Propriétés",
      href: "/proprietes",
      icon: BuildingsIcon,
      id: "nav-proprietes",
    },
    {
      name: "Parrainage",
      href: "/parrainage",
      icon: HandshakeIcon,
      id: "nav-parrainage",
    },
    {
      name: "Contact",
      href: "/nous-contacter",
      icon: ChatCircleIcon,
      id: "nav-contact",
    },
  ];

  // Determine navigation items based on user type
  const navItems = isStaff
    ? []
    : isAgentOrOwner
      ? agentOwnerNavItems
      : isSignedIn
        ? renterNavItems
        : publicNavItems;

  useEffect(() => {
    setOpenGroupId(null);
  }, [pathname]);

  useEffect(() => {
    if (!mobileMenuOpen || !isStaff) return;

    const activeGroupId =
      staffNavEntries.find(
        (item) => item.type === "group" && isAdminEntryActive(pathname, item),
      )?.id ?? null;
    setMobileOpenGroupId(activeGroupId);
  }, [isStaff, mobileMenuOpen, pathname, staffNavEntries]);

  useEffect(() => {
    if (!openGroupId) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (
        staffNavRef.current &&
        !staffNavRef.current.contains(event.target as Node)
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
    <>
      <header
        className="fixed left-1/2 top-4 z-50 mx-auto w-[calc(100%-2rem)] max-w-7xl -translate-x-1/2"
      >
        <div className="flex h-16 items-center justify-between rounded-full border border-white/50 bg-white/90 px-4 py-2 shadow-xl shadow-[#5a321a]/10 backdrop-blur-xl sm:px-5">
          {/* Logo */}
          <Link href="/" className="flex items-center shrink-0 group">
            <div className="mr-3 rounded-2xl bg-primary/10 p-2 transition-colors duration-200 group-hover:bg-primary/15">
              <Image
                src="/logo.png?v=2"
                alt="Logo Roogo"
                width={28}
                height={28}
                className="object-contain"
              />
            </div>
            <span className="hidden text-xl font-black tracking-tight text-neutral-950 lg:block">
              Roogo
            </span>
          </Link>

          {/* Center Navigation - Pill style */}
          {isStaff ? (
            <div
              ref={staffNavRef}
              className="hidden items-center rounded-full border border-neutral-200/60 bg-[#f5efe6]/80 p-1 md:flex"
            >
              {staffNavEntries.map((item) => {
                const isActive = isAdminEntryActive(pathname, item);

                if (item.type === "link") {
                  return (
                    <StaffDesktopNavLink
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
                    <motion.button
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
                        "flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold outline-none transition-colors duration-200",
                        isActive
                          ? "text-primary bg-white shadow-sm"
                          : "text-neutral-500 hover:text-neutral-900",
                      )}
                      whileTap={{ scale: 0.985 }}
                    >
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
                    </motion.button>

                    <AnimatePresence>
                      {isOpen && (
                        <motion.div
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 4 }}
                          transition={roogoMotion.quick}
                          role="menu"
                          className="absolute left-0 top-full mt-3 w-64 overflow-hidden rounded-[24px] border border-neutral-200/70 bg-white p-2 shadow-2xl"
                        >
                          {item.children.map((child) => {
                            const childActive = isLinkActive(
                              pathname,
                              child.href,
                            );
                            const ChildIcon = child.icon;

                            return (
                                <motion.div key={child.id} whileTap={{ scale: 0.99 }}>
                                  <Link
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
                                </motion.div>
                            );
                          })}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="hidden items-center rounded-full border border-neutral-200/60 bg-[#f5efe6]/80 p-1 md:flex">
              <AnimatedBackground
                defaultValue={pathname}
                className="rounded-full bg-white shadow-sm"
                transition={roogoMotion.spring}
              >
                {navItems.map((item) => (
                  <motion.div
                    key={item.href}
                    data-id={item.href}
                    whileTap={{ scale: 0.985 }}
                  >
                    <Link
                      href={item.href}
                      data-id={item.id}
                      className={cn(
                        "flex items-center gap-2 rounded-full px-4 py-2 text-sm font-black outline-none transition-colors duration-200",
                        isLinkActive(pathname, item.href)
                          ? "text-primary"
                          : "text-neutral-500 hover:text-neutral-950",
                      )}
                    >
                      <item.icon
                        size={18}
                        weight={
                          isLinkActive(pathname, item.href) ? "fill" : "bold"
                        }
                      />
                      <span className="whitespace-nowrap">{item.name}</span>
                    </Link>
                  </motion.div>
                ))}
              </AnimatedBackground>
            </div>
          )}

          {/* Right Actions */}
          <div className="flex items-center gap-2 sm:gap-4 shrink-0">
            {!isLoaded ? (
              <div className="w-10 h-10 rounded-full bg-neutral-100 animate-pulse" />
            ) : isSignedIn ? (
              <div className="flex items-center gap-3">
                <div className="hidden lg:flex flex-col items-end leading-tight">
                  <span className="text-sm font-bold text-neutral-900 line-clamp-1">
                    {user.fullName || "Utilisateur"}
                  </span>
                  <span className="text-[11px] text-neutral-500 font-medium line-clamp-1 opacity-70">
                    {user.primaryEmailAddress?.emailAddress}
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
            ) : (
              <div className="flex items-center gap-2">
                <motion.div
                  className="hidden sm:block"
                  whileTap={{ scale: 0.985 }}
                >
                  <Link href="/connexion">
                    <Button
                      variant="ghost"
                      size="md"
                      className="font-black text-neutral-600"
                    >
                      Connexion
                    </Button>
                  </Link>
                </motion.div>
                <motion.div whileTap={{ scale: 0.985 }}>
                  <Link href="/inscription">
                    <Button
                      variant="primary"
                      size="md"
                      className="rounded-full px-6 font-black shadow-md transition-shadow hover:shadow-lg"
                    >
                      Rejoindre
                    </Button>
                  </Link>
                </motion.div>
              </div>
            )}

            {/* Mobile Menu Toggle */}
            <motion.button
              className="ml-1 rounded-full bg-neutral-100 p-2 text-neutral-600 transition-colors hover:text-primary md:hidden"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              whileTap={{ scale: 0.985 }}
              aria-label={mobileMenuOpen ? "Fermer le menu" : "Ouvrir le menu"}
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? (
                <XIcon size={22} weight="bold" />
              ) : (
                <ListIcon size={22} weight="bold" />
              )}
            </motion.button>
          </div>
        </div>

        {/* Mobile Menu */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              transition={roogoMotion.standard}
              className="md:hidden absolute top-full left-0 right-0 mt-4 bg-white/95 backdrop-blur-xl rounded-[32px] p-6 shadow-2xl border border-white/50 flex flex-col gap-2"
            >
              {isStaff
                ? staffNavEntries.map((item) => {
                    const isActive = isAdminEntryActive(pathname, item);
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
                            <span className="flex-1 text-left">
                              {item.label}
                            </span>
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
                                        onClick={() =>
                                          setMobileMenuOpen(false)
                                        }
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
                        key={item.id}
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
                  })
                : navItems.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      data-id={item.id}
                      onClick={() => setMobileMenuOpen(false)}
                      className={cn(
                        "flex items-center gap-4 p-4 rounded-2xl text-base font-bold transition-all",
                        isLinkActive(pathname, item.href)
                          ? "bg-primary/10 text-primary"
                          : "text-neutral-600 hover:bg-neutral-50",
                      )}
                    >
                      <item.icon
                        size={24}
                        weight={isLinkActive(pathname, item.href) ? "fill" : "bold"}
                      />
                      {item.name}
                    </Link>
                  ))}

              <div className="h-px bg-neutral-100 my-2 mx-4" />

              {!isSignedIn && (
                <div className="grid grid-cols-2 gap-3 mt-2">
                  <Link
                    href="/connexion"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <Button
                      variant="ghost"
                      fullWidth
                      className="rounded-2xl font-bold py-4"
                    >
                      Connexion
                    </Button>
                  </Link>
                  <Link
                    href="/inscription"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <Button
                      variant="primary"
                      fullWidth
                      className="rounded-2xl font-bold py-4"
                    >
                      Rejoindre
                    </Button>
                  </Link>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </header>
    </>
  );
}
