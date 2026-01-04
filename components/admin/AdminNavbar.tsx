"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  GridFourIcon,
  UsersIcon,
  BuildingsIcon,
  CalendarBlankIcon,
  NoteIcon,
  ChatCircleDotsIcon,
  BellIcon,
} from "@phosphor-icons/react";
import { useUser } from "@clerk/nextjs";
import Image from "next/image";
import { cn } from "../../lib/utils";
import { AnimatedBackground } from "../motion-primitives/animated-background";

export function AdminNavbar() {
  const pathname = usePathname();
  const { user } = useUser();

  const navItems = [
    { label: "Dashboard", icon: GridFourIcon, href: "/admin" },
    { label: "Agents", icon: UsersIcon, href: "/admin/agents" },
    { label: "Property", icon: BuildingsIcon, href: "/admin/listings" },
    { label: "Calendar", icon: CalendarBlankIcon, href: "/admin/calendar" },
    { label: "Content", icon: NoteIcon, href: "/admin/content" },
  ];

  return (
    <header className="fixed top-4 left-1/2 -translate-x-1/2 w-[calc(100%-3rem)] max-w-7xl z-50">
      <div className="flex items-center justify-between bg-white/80 backdrop-blur-xl px-8 py-4 rounded-[40px] border border-neutral-100 shadow-sm">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 group">
          <div className="flex flex-wrap w-8 h-8 gap-0.5 transition-transform group-hover:rotate-12">
            <div className="w-[15px] h-[15px] bg-[#86BC25] rounded-tl-lg rounded-br-lg" />
            <div className="w-[15px] h-[15px] bg-[#E1E1E1] rounded-tr-lg rounded-bl-lg" />
            <div className="w-[15px] h-[15px] bg-[#7552CC] rounded-bl-lg rounded-tr-lg opacity-40" />
            <div className="w-[15px] h-[15px] bg-[#3FA6D9] rounded-br-lg rounded-tl-lg opacity-40" />
          </div>
          <span className="text-2xl font-bold tracking-tight text-neutral-900">
            Roogo
          </span>
        </Link>

        {/* Center Navigation */}
        <div className="hidden lg:flex items-center bg-neutral-50/50 p-1.5 rounded-full border border-neutral-100/50">
          <AnimatedBackground
            defaultValue={pathname}
            className="bg-white rounded-full shadow-sm border border-neutral-100"
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
                    "flex items-center gap-2 px-6 py-2.5 rounded-full transition-colors duration-200 outline-none",
                    isActive
                      ? "text-neutral-900"
                      : "text-neutral-500 hover:text-neutral-900"
                  )}
                >
                  <Icon size={20} weight={isActive ? "fill" : "regular"} />
                  <span className="text-sm font-bold tracking-tight">
                    {item.label}
                  </span>
                </Link>
              );
            })}
          </AnimatedBackground>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-3">
          <div className="hidden md:flex items-center gap-2 mr-2">
            <IconButton icon={ChatCircleDotsIcon} />
            <IconButton icon={BellIcon} dot />
          </div>

          <div className="flex items-center gap-3 pl-3 border-l border-neutral-100">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-bold text-neutral-900 leading-none mb-0.5">
                {user?.fullName || "Admin User"}
              </p>
              <p className="text-[11px] text-neutral-400 font-medium">
                {user?.primaryEmailAddress?.emailAddress || "admin@roogo.com"}
              </p>
            </div>
            <div className="relative group cursor-pointer">
              <div className="w-11 h-11 rounded-2xl bg-primary/10 overflow-hidden border-2 border-white shadow-sm transition-transform active:scale-95">
                {user?.imageUrl ? (
                  <Image
                    src={user.imageUrl}
                    alt="Avatar"
                    width={44}
                    height={44}
                    className="object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-primary text-white font-bold text-lg">
                    {user?.firstName?.charAt(0) || "A"}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

function IconButton({
  icon: Icon,
  dot = false,
}: {
  icon: React.ElementType;
  dot?: boolean;
}) {
  return (
    <button className="relative w-11 h-11 flex items-center justify-center rounded-2xl bg-white border border-neutral-100 text-neutral-400 hover:text-neutral-900 hover:bg-neutral-50 transition-all shadow-sm">
      <Icon size={22} weight="regular" />
      {dot && (
        <span className="absolute top-3 right-3 w-2 h-2 bg-red-500 rounded-full border-2 border-white" />
      )}
    </button>
  );
}
