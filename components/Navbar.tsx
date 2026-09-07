"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { UserButton, useUser } from "@clerk/nextjs";
import { usePathname } from "next/navigation";
import {
  ListIcon, XIcon, CaretDownIcon, HouseLineIcon, BriefcaseIcon,
  ChatCircleIcon, BuildingsIcon, HouseIcon, HandshakeIcon, CubeFocusIcon,
} from "@phosphor-icons/react";
import { cn } from "../lib/utils";
import { getAdminNavItems } from "../lib/navigation/adminNav";

// Public destinations stay in the same order through auth loading/sign-in/out.
const primaryItems = [
  { name: "Accueil", href: "/", icon: HouseLineIcon, id: "nav-accueil" },
  { name: "Propriétés", href: "/proprietes", icon: BuildingsIcon, id: "nav-proprietes" },
  { name: "Visites 3D", href: "/visites-3d", icon: CubeFocusIcon, id: "nav-visites-3d" },
  { name: "À propos", href: "/a-propos", icon: HandshakeIcon, id: "nav-a-propos" },
  { name: "Carrières", href: "/carrieres", icon: BriefcaseIcon, id: "nav-carrieres" },
  { name: "Contact", href: "/nous-contacter", icon: ChatCircleIcon, id: "nav-contact" },
];

function isLinkActive(pathname: string, href: string) {
  return pathname === href || (href !== "/" && pathname.startsWith(href + "/"));
}

export function Navbar() {
  const { isSignedIn, isLoaded, user } = useUser();
  return <NavbarView isSignedIn={isSignedIn} isLoaded={isLoaded}
    userType={(user?.publicMetadata?.userType || user?.publicMetadata?.user_type) as string | undefined}
    fullName={user?.fullName} accountButton={<UserButton afterSignOutUrl="/" appearance={{ elements: {
      userButtonAvatarBox: "w-10 h-10 border-2 border-primary/20",
    } }} />} />;
}

// Keep the layout independently testable; authentication still comes only from Clerk above.
export function NavbarView({ isSignedIn, isLoaded, userType, fullName, accountButton }: {
  isSignedIn: boolean | undefined;
  isLoaded: boolean;
  userType?: string;
  fullName?: string | null;
  accountButton: ReactNode;
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null);
  const mobileMenuRef = useRef<HTMLElement>(null);
  const accountRef = useRef<HTMLDetailsElement>(null);
  const pathname = usePathname();
  const isStaff = userType === "staff" || userType === "founder";

  const accountItems = useMemo(() => {
    if (isStaff) {
      return getAdminNavItems(userType === "founder").flatMap((entry) =>
        entry.type === "group"
          ? entry.children.map((child) => ({
              ...child, name: entry.label + " · " + child.label,
            }))
          : [{ ...entry, name: entry.label }],
      );
    }
    return [
      ...(userType === "agent" || userType === "owner"
        ? [{ name: "Mes Biens", href: "/mes-proprietes", icon: HouseIcon, id: "nav-mes-biens" }]
        : []),
      { name: "Parrainage", href: "/parrainage", icon: HandshakeIcon, id: "nav-parrainage" },
    ];
  }, [isStaff, userType]);

  useEffect(() => {
    setMobileMenuOpen(false);
    if (accountRef.current) accountRef.current.open = false;
  }, [pathname, isSignedIn]);

  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (accountRef.current && !accountRef.current.contains(event.target as Node)) {
        accountRef.current.open = false;
      }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (mobileMenuRef.current?.contains(document.activeElement)) {
        mobileMenuButtonRef.current?.focus();
      }
      setMobileMenuOpen(false);
      if (accountRef.current?.open) {
        accountRef.current.open = false;
        accountRef.current.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, []);

  const closeMenus = () => {
    setMobileMenuOpen(false);
    if (accountRef.current) accountRef.current.open = false;
  };

  return (
    <header className="fixed left-1/2 top-4 z-50 mx-auto w-[calc(100%-2rem)] max-w-7xl -translate-x-1/2">
      <div className="flex h-16 items-center justify-between gap-2 rounded-full border border-white/50 bg-white/90 px-4 py-2 shadow-xl shadow-[#5a321a]/10 backdrop-blur-xl sm:px-5">
        <Link href="/" aria-label="Roogo — Accueil" className="group flex shrink-0 items-center">
          <div className="rounded-2xl bg-primary/10 p-2 transition-colors group-hover:bg-primary/15">
            <Image src="/logo.png?v=2" alt="" width={28} height={28} className="object-contain" />
          </div>
          <span className="ml-3 hidden text-xl font-black tracking-tight text-neutral-950 sm:block">Roogo</span>
        </Link>

        <nav aria-label="Navigation principale" className="hidden shrink-0 items-center rounded-full border border-neutral-200/60 bg-[#f5efe6]/80 p-1 xl:flex">
          {primaryItems.map((item) => (
            <Link key={item.id} href={item.href} data-id={item.id}
              aria-current={isLinkActive(pathname, item.href) ? "page" : undefined}
              className={cn(
                "flex items-center gap-2 rounded-full px-3 py-2 text-sm font-black transition-colors",
                isLinkActive(pathname, item.href)
                  ? "bg-white text-primary shadow-sm"
                  : "text-neutral-500 hover:text-neutral-950",
              )}>
              <item.icon size={18} weight={isLinkActive(pathname, item.href) ? "fill" : "bold"} />
              <span className="whitespace-nowrap">{item.name}</span>
            </Link>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          {/* Every auth state occupies exactly this slot; long identity text is truncated. */}
          <div data-nav-auth-slot className="flex h-10 w-36 shrink-0 items-center justify-end sm:w-60" aria-busy={!isLoaded}>
            {!isLoaded ? (
              <div role="status" className="flex w-full items-center justify-end gap-3">
                <span className="sr-only">Chargement du compte</span>
                <span aria-hidden="true" className="h-4 w-24 rounded bg-neutral-100" />
                <span aria-hidden="true" className="h-10 w-10 rounded-full bg-neutral-100" />
              </div>
            ) : isSignedIn ? (
              <div className="flex w-full min-w-0 items-center gap-2">
                <details ref={accountRef} className="group min-w-0 flex-1"
                  onToggle={(event) => { if (event.currentTarget.open) setMobileMenuOpen(false); }}>
                  <summary className="flex h-10 cursor-pointer list-none items-center justify-end gap-1 rounded-full px-2 text-sm font-bold text-neutral-900 hover:bg-neutral-100 focus-visible:outline focus-visible:outline-primary [&::-webkit-details-marker]:hidden">
                    <span className="truncate">{isStaff ? "Administration" : "Mon espace"}</span>
                    <CaretDownIcon size={14} className="shrink-0 group-open:rotate-180" />
                  </summary>
                  <div className="absolute right-0 top-full mt-3 max-h-[calc(100dvh-7rem)] w-72 max-w-full overflow-y-auto rounded-3xl border border-neutral-200 bg-white p-3 shadow-xl">
                    <p className="truncate px-3 py-2 text-sm font-bold">{fullName || "Mon compte"}</p>
                    <nav aria-label="Navigation du compte">
                      {accountItems.map((item) => (
                        <Link key={item.id} href={item.href} data-id={item.id} onClick={closeMenus}
                          aria-current={isLinkActive(pathname, item.href) ? "page" : undefined}
                          className="flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-bold text-neutral-700 hover:bg-neutral-100 focus-visible:outline focus-visible:outline-primary">
                          <item.icon size={20} className="shrink-0" />
                          {item.name}
                        </Link>
                      ))}
                    </nav>
                  </div>
                </details>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center">
                  {accountButton}
                </div>
              </div>
            ) : (
              <div className="flex w-full items-center justify-end gap-2">
                <Link href="/connexion" className="hidden h-10 items-center rounded-full px-3 text-sm font-black text-neutral-600 hover:bg-neutral-100 sm:inline-flex">Connexion</Link>
                <Link href="/inscription" className="inline-flex h-10 items-center rounded-full bg-primary px-4 text-sm font-black text-white hover:bg-primary-hover">Rejoindre</Link>
              </div>
            )}
          </div>
          <button ref={mobileMenuButtonRef} type="button" className="rounded-full bg-neutral-100 p-2 text-neutral-600 hover:text-primary xl:hidden"
            onClick={() => { if (accountRef.current) accountRef.current.open = false; setMobileMenuOpen(!mobileMenuOpen); }}
            aria-label={mobileMenuOpen ? "Fermer le menu" : "Ouvrir le menu"}
            aria-expanded={mobileMenuOpen} aria-controls="mobile-primary-navigation">
            {mobileMenuOpen ? <XIcon size={22} weight="bold" /> : <ListIcon size={22} weight="bold" />}
          </button>
        </div>
      </div>

      {mobileMenuOpen && (
        <nav ref={mobileMenuRef} id="mobile-primary-navigation" aria-label="Navigation mobile"
          className="absolute left-0 right-0 top-full mt-4 flex max-h-[calc(100dvh-7rem)] flex-col gap-1 overflow-y-auto rounded-[32px] border border-white/50 bg-white/95 p-4 shadow-2xl backdrop-blur-xl xl:hidden">
          {primaryItems.map((item) => (
            <Link key={item.id} href={item.href} data-id={item.id} onClick={closeMenus}
              aria-current={isLinkActive(pathname, item.href) ? "page" : undefined}
              className={cn("flex items-center gap-3 rounded-2xl p-3 text-base font-bold",
                isLinkActive(pathname, item.href) ? "bg-primary/10 text-primary" : "text-neutral-600 hover:bg-neutral-50")}>
              <item.icon size={24} />
              {item.name}
            </Link>
          ))}
          {isLoaded && !isSignedIn && (
            <Link href="/connexion" onClick={closeMenus} className="rounded-2xl p-3 font-bold text-primary">Connexion</Link>
          )}
        </nav>
      )}
    </header>
  );
}
