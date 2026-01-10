"use client";

import Link from "next/link";
import Image from "next/image";
import { Button } from "./ui/Button";
import {
  motion,
  useScroll,
  useMotionValueEvent,
  AnimatePresence,
} from "framer-motion";
import { useState } from "react";
import {
  ListIcon,
  XIcon,
  HouseLineIcon,
  BriefcaseIcon,
  ChatCircleIcon,
  BuildingsIcon,
  GearSixIcon,
  CaretDownIcon,
  UsersIcon,
  ReceiptIcon,
} from "@phosphor-icons/react";
import { UserButton, useUser } from "@clerk/nextjs";
import { usePathname } from "next/navigation";
import { cn } from "../lib/utils";
import { AnimatedBackground } from "./motion-primitives/animated-background";
import { useRef, useEffect } from "react";

export function Navbar() {
  const { scrollY } = useScroll();
  const [hidden, setHidden] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [staffMenuOpen, setStaffMenuOpen] = useState(false);
  const staffMenuRef = useRef<HTMLDivElement>(null);
  const { isSignedIn, isLoaded, user } = useUser();
  const pathname = usePathname();

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        staffMenuRef.current &&
        !staffMenuRef.current.contains(event.target as Node)
      ) {
        setStaffMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useMotionValueEvent(scrollY, "change", (latest) => {
    const previous = scrollY.getPrevious() || 0;
    if (latest > previous && latest > 150) {
      setHidden(true);
      setStaffMenuOpen(false);
    } else {
      setHidden(false);
    }
    setIsScrolled(latest > 20);
  });

  const navItems = [
    { name: "Accueil", href: "/", icon: HouseLineIcon },
    { name: "Location", href: "/location", icon: BuildingsIcon },
    { name: "Carrières", href: "/carrieres", icon: BriefcaseIcon },
    { name: "Contact", href: "/contact", icon: ChatCircleIcon },
  ];

  const isStaff =
    user?.publicMetadata?.role === "admin" ||
    user?.publicMetadata?.role === "staff" ||
    user?.unsafeMetadata?.userType === "staff" ||
    user?.emailAddresses.some((email) =>
      email.emailAddress.endsWith("@roogobf.com")
    );

  const staffMenuItems = [
    { name: "Propriétés", href: "/admin/listings", icon: BuildingsIcon },
    { name: "Transactions", href: "/admin/transactions", icon: ReceiptIcon },
    { name: "Agents", href: "/admin/agents", icon: UsersIcon },
  ];

  return (
    <>
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
            isScrolled ? "h-16" : "h-20"
          )}
        >
          {/* Logo */}
          <Link href="/" className="flex items-center shrink-0 group">
            <div className="bg-primary/10 p-2 rounded-2xl mr-3 group-hover:scale-110 transition-transform duration-300">
              <Image
                src="/logo.png"
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

          {/* Center Navigation - Pill style */}
          <div className="hidden md:flex items-center bg-neutral-100/50 p-1 rounded-full border border-neutral-200/30">
            <AnimatedBackground
              defaultValue={pathname}
              className="bg-white rounded-full shadow-sm"
              transition={{
                type: "spring",
                stiffness: 400,
                damping: 30,
              }}
            >
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  data-id={item.href}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold outline-none transition-colors duration-200",
                    pathname === item.href
                      ? "text-primary"
                      : "text-neutral-500 hover:text-neutral-900"
                  )}
                >
                  <item.icon
                    size={18}
                    weight={pathname === item.href ? "fill" : "bold"}
                  />
                  <span className="whitespace-nowrap">{item.name}</span>
                </Link>
              ))}

              {isStaff && (
                <div className="relative" ref={staffMenuRef}>
                  <button
                    onClick={() => setStaffMenuOpen(!staffMenuOpen)}
                    data-id="staff-menu"
                    className={cn(
                      "flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold outline-none transition-all duration-200",
                      pathname.startsWith("/admin") || staffMenuOpen
                        ? "text-primary"
                        : "text-neutral-500 hover:text-neutral-900"
                    )}
                  >
                    <GearSixIcon
                      size={18}
                      weight={pathname.startsWith("/admin") ? "fill" : "bold"}
                    />
                    <span>Staff</span>
                    <CaretDownIcon
                      size={14}
                      weight="bold"
                      className={cn(
                        "transition-transform duration-200",
                        staffMenuOpen ? "rotate-180" : ""
                      )}
                    />
                  </button>

                  <AnimatePresence>
                    {staffMenuOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        className="absolute top-full right-0 mt-3 w-56 bg-white rounded-[24px] p-2 shadow-2xl border border-neutral-100 z-50 overflow-hidden"
                      >
                        <div className="px-3 py-2 mb-1">
                          <p className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider">
                            Administration
                          </p>
                        </div>
                        {staffMenuItems.map((item) => (
                          <Link
                            key={item.href}
                            href={item.href}
                            onClick={() => setStaffMenuOpen(false)}
                            className={cn(
                              "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold transition-all",
                              pathname === item.href
                                ? "bg-primary/10 text-primary"
                                : "text-neutral-600 hover:bg-neutral-50"
                            )}
                          >
                            <item.icon
                              size={18}
                              weight={pathname === item.href ? "fill" : "bold"}
                            />
                            {item.name}
                          </Link>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </AnimatedBackground>
          </div>

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
                <Link href="/sign-in" className="hidden sm:block">
                  <Button
                    variant="ghost"
                    size="md"
                    className="font-bold text-neutral-600"
                  >
                    Connexion
                  </Button>
                </Link>
                <Link href="/sign-up">
                  <Button
                    variant="primary"
                    size="md"
                    className="rounded-full px-6 font-bold shadow-md hover:shadow-lg hover:scale-105 transition-all"
                  >
                    Rejoindre
                  </Button>
                </Link>
              </div>
            )}

            {/* Mobile Menu Toggle */}
            <button
              className="md:hidden p-2 text-neutral-600 hover:text-primary bg-neutral-100 rounded-full transition-all ml-1"
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

        {/* Mobile Menu */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.95 }}
              className="md:hidden absolute top-full left-0 right-0 mt-4 bg-white/95 backdrop-blur-xl rounded-[32px] p-6 shadow-2xl border border-white/50 flex flex-col gap-2"
            >
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    "flex items-center gap-4 p-4 rounded-2xl text-base font-bold transition-all",
                    pathname === item.href
                      ? "bg-primary/10 text-primary"
                      : "text-neutral-600 hover:bg-neutral-50"
                  )}
                >
                  <item.icon
                    size={24}
                    weight={pathname === item.href ? "fill" : "bold"}
                  />
                  {item.name}
                </Link>
              ))}

              {isStaff && (
                <div className="flex flex-col gap-1 border-t border-neutral-100 pt-2 mt-2">
                  <div className="px-4 py-2">
                    <p className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider">
                      Staff Menu
                    </p>
                  </div>
                  {staffMenuItems.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className={cn(
                        "flex items-center gap-4 p-4 rounded-2xl text-base font-bold transition-all",
                        pathname === item.href
                          ? "bg-primary/10 text-primary"
                          : "text-neutral-600 hover:bg-neutral-50"
                      )}
                    >
                      <item.icon
                        size={24}
                        weight={pathname === item.href ? "fill" : "bold"}
                      />
                      {item.name}
                    </Link>
                  ))}
                </div>
              )}

              <div className="h-px bg-neutral-100 my-2 mx-4" />

              {!isSignedIn && (
                <div className="grid grid-cols-2 gap-3 mt-2">
                  <Link
                    href="/sign-in"
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
                    href="/sign-up"
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
      </motion.header>
    </>
  );
}
