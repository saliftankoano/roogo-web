"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  GridFourIcon,
  UsersIcon,
  BuildingsIcon,
  CalendarBlankIcon,
  NoteIcon,
  ListIcon,
  XIcon,
  ReceiptIcon,
} from "@phosphor-icons/react";
import { UserButton, useUser } from "@clerk/nextjs";
import Image from "next/image";
import { cn } from "../../lib/utils";
import { AnimatedBackground } from "../motion-primitives/animated-background";
import {
  motion,
  useScroll,
  useMotionValueEvent,
  AnimatePresence,
} from "framer-motion";
import { useState } from "react";

export function AdminNavbar() {
  const { scrollY } = useScroll();
  const [hidden, setHidden] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
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

  const navItems = [
    { label: "Tableau de bord", icon: GridFourIcon, href: "/admin" },
    { label: "Agents", icon: UsersIcon, href: "/admin/agents" },
    { label: "Propriétés", icon: BuildingsIcon, href: "/admin/listings" },
    { label: "Transactions", icon: ReceiptIcon, href: "/admin/transactions" },
    { label: "Calendrier", icon: CalendarBlankIcon, href: "/admin/calendar" },
    { label: "Contenu", icon: NoteIcon, href: "/admin/content" },
  ];

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

        {/* Center Navigation */}
        <div className="hidden lg:flex items-center bg-neutral-100/50 p-1 rounded-full border border-neutral-200/30">
          <AnimatedBackground
            defaultValue={pathname}
            className="bg-white rounded-full shadow-sm"
            transition={{
              type: "spring",
              stiffness: 400,
              damping: 30,
            }}
          >
            {navItems.map((item) => {
              const isActive =
                pathname === item.href ||
                (item.href !== "/admin" && pathname.startsWith(item.href));
              const Icon = item.icon;
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  data-id={item.href}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold outline-none transition-colors duration-200",
                    isActive
                      ? "text-primary"
                      : "text-neutral-500 hover:text-neutral-900"
                  )}
                >
                  <Icon size={18} weight={isActive ? "fill" : "bold"} />
                  <span className="whitespace-nowrap">{item.label}</span>
                </Link>
              );
            })}
          </AnimatedBackground>
        </div>

        {/* Right Actions */}
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

          {/* Mobile Menu Toggle */}
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

      {/* Mobile Menu */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className="lg:hidden absolute top-full left-0 right-0 mt-4 bg-white/95 backdrop-blur-xl rounded-[32px] p-6 shadow-2xl border border-white/50 flex flex-col gap-2"
          >
            {navItems.map((item) => {
              const isActive =
                pathname === item.href ||
                (item.href !== "/admin" && pathname.startsWith(item.href));
              const Icon = item.icon;
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    "flex items-center gap-4 p-4 rounded-2xl text-base font-bold transition-all",
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-neutral-600 hover:bg-neutral-50"
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
