"use client";

import Image from "next/image";
import Link from "next/link";
import { UserButton, useUser } from "@clerk/nextjs";
import { ArrowUpRightIcon } from "@phosphor-icons/react";

const navItems = [
  { label: "Collections", href: "#collections" },
  { label: "Comment ça marche", href: "#fonctionnement" },
  { label: "Pour les créateurs", href: "#createurs" },
];

export function MeboHeader() {
  const { isLoaded, isSignedIn } = useUser();

  return (
    <header className="absolute inset-x-0 top-0 z-30 px-4 pt-4 sm:px-6 sm:pt-6">
      <div className="mx-auto flex max-w-[1480px] items-center justify-between rounded-full border border-white/15 bg-[#120e0b]/70 px-4 py-3 text-white shadow-2xl shadow-black/20 backdrop-blur-xl sm:px-5">
        <Link href="/" className="flex shrink-0 items-center gap-3" aria-label="Roogo Mêbo — Accueil">
          <span className="grid size-10 place-items-center rounded-full bg-white">
            <Image
              src="/logo.png"
              alt=""
              width={26}
              height={26}
              className="object-contain"
            />
          </span>
          <span className="text-lg font-black tracking-[-0.03em] sm:text-xl">
            Roogo <span className="text-[#e8a36c]">Mêbo</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-7 text-sm font-bold text-white/65 lg:flex" aria-label="Navigation principale">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href} className="transition-colors hover:text-white">
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          {!isLoaded ? (
            <span className="size-10 animate-pulse rounded-full bg-white/10" />
          ) : isSignedIn ? (
            <UserButton
              afterSignOutUrl="/"
              appearance={{
                elements: {
                  userButtonAvatarBox:
                    "size-10 border-2 border-white/20 transition hover:border-[#e8a36c]",
                },
              }}
            />
          ) : (
            <Link
              href="/connexion?redirect_url=/"
              className="hidden rounded-full px-4 py-2 text-sm font-black text-white/75 transition hover:bg-white/10 hover:text-white sm:inline-flex"
            >
              Connexion
            </Link>
          )}
          <Link
            href="#createurs"
            className="inline-flex items-center gap-2 rounded-full bg-[#d7793f] px-4 py-2.5 text-sm font-black text-white shadow-lg shadow-black/20 transition hover:bg-[#e28a50] active:scale-[0.985] sm:px-5"
          >
            <span className="hidden sm:inline">Vendre mes plans</span>
            <span className="sm:hidden">Vendre</span>
            <ArrowUpRightIcon size={17} weight="bold" />
          </Link>
        </div>
      </div>
    </header>
  );
}
