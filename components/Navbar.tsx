"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { UserButton, useUser } from "@clerk/nextjs";
import { usePathname } from "next/navigation";
import { ListIcon, XIcon, CaretDownIcon, HouseLineIcon, ChatCircleIcon,
  BuildingsIcon, HouseIcon, HandshakeIcon, CubeFocusIcon } from "@phosphor-icons/react";
import { cn } from "../lib/utils";
import { getAdminNavItems, type AdminNavEntry } from "../lib/navigation/adminNav";

function isLinkActive(pathname: string, href: string) {
  return pathname === href || (href !== "/" && pathname.startsWith(href + "/"));
}

function navigationFor(isSignedIn: boolean | undefined, userType?: string): AdminNavEntry[] {
  if (isSignedIn && (userType === "staff" || userType === "founder")) return getAdminNavItems(userType === "founder");
  const owner = isSignedIn && (userType === "owner" || userType === "agent");
  return [
    { type: "link", label: "Accueil", href: "/", icon: HouseLineIcon, id: "nav-accueil" },
    { type: "link", label: "Propriétés", href: "/proprietes", icon: BuildingsIcon, id: "nav-proprietes" },
    owner
      ? { type: "link", label: "Mes biens", href: "/mes-proprietes", icon: HouseIcon, id: "nav-mes-biens" }
      : { type: "link", label: "Visites 3D", href: "/visites-3d", icon: CubeFocusIcon, id: "nav-visites-3d" },
    isSignedIn
      ? { type: "link", label: "Parrainage", href: "/parrainage", icon: HandshakeIcon, id: "nav-parrainage" }
      : { type: "link", label: "À propos", href: "/a-propos", icon: HandshakeIcon, id: "nav-a-propos" },
    { type: "link", label: "Contact", href: "/nous-contacter", icon: ChatCircleIcon, id: "nav-contact" },
  ];
}

export function Navbar() {
  const { isSignedIn, isLoaded, user } = useUser();
  return <NavbarView isSignedIn={isSignedIn} isLoaded={isLoaded}
    userType={(user?.publicMetadata?.userType || user?.publicMetadata?.user_type) as string | undefined}
    fullName={user?.fullName} accountButton={<UserButton afterSignOutUrl="/" appearance={{ elements: {
      userButtonAvatarBox: "w-10 h-10 border-2 border-primary/20",
    } }} />} />;
}

// Authentication remains Clerk-controlled; the view can be exercised independently.
export function NavbarView({ isSignedIn, isLoaded, userType, fullName, accountButton }: {
  isSignedIn: boolean | undefined; isLoaded: boolean; userType?: string;
  fullName?: string | null; accountButton: ReactNode;
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null);
  const mobileMenuRef = useRef<HTMLElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const pathname = usePathname();
  const items = navigationFor(isSignedIn, userType);
  const closeGroups = () => {
    headerRef.current?.querySelectorAll("details[open]").forEach(detail => detail.removeAttribute("open"));
  };
  const closeMenus = () => { setMobileMenuOpen(false); closeGroups(); };

  useEffect(() => {
    setMobileMenuOpen(false);
    headerRef.current?.querySelectorAll("details[open]").forEach(detail => detail.removeAttribute("open"));
  }, [pathname, isSignedIn, isLoaded, userType]);

  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      headerRef.current?.querySelectorAll("details[open]").forEach(detail => {
        if (!detail.contains(event.target as Node)) detail.removeAttribute("open");
      });
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const active = document.activeElement;
      const group = active?.closest("details[open]");
      if (group && headerRef.current?.contains(group)) {
        group.removeAttribute("open");
        group.querySelector("summary")?.focus();
        return;
      }
      if (mobileMenuRef.current?.contains(active)) mobileMenuButtonRef.current?.focus();
      setMobileMenuOpen(false);
      headerRef.current?.querySelectorAll("details[open]").forEach(detail => detail.removeAttribute("open"));
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, []);

  const renderItems = (mobile: boolean) => items.map(item => {
    const active = item.type === "group"
      ? item.children.some(child => isLinkActive(pathname, child.href))
      : isLinkActive(pathname, item.href);
    const style = cn("flex min-w-0 items-center justify-center gap-2 rounded-full px-2 py-2 text-sm font-bold hover:bg-neutral-100 focus-visible:outline focus-visible:outline-primary",
      mobile && "justify-start rounded-2xl p-3", active && "bg-white text-primary shadow-sm");
    if (item.type === "link") return <Link key={item.id} href={item.href} data-id={item.id}
      onClick={closeMenus} aria-current={active ? "page" : undefined} className={style}>
      <item.icon size={18} className="shrink-0" /><span className="truncate">{item.label}</span>
    </Link>;
    return <details key={item.id} className="group relative min-w-0" onToggle={event => {
      const current = event.currentTarget;
      if (current.open) headerRef.current?.querySelectorAll("details[open]").forEach(other => {
        if (other !== current) other.removeAttribute("open");
      });
    }}>
      <summary className={cn(style, "cursor-pointer list-none [&::-webkit-details-marker]:hidden", !mobile && "gap-1 px-1 text-xs")}>
        {mobile && <item.icon size={18} className="shrink-0" />}
        <span className="truncate">{item.label}</span><CaretDownIcon size={12} className="shrink-0 group-open:rotate-180" />
      </summary>
      <div className={mobile ? "ml-4 border-l border-neutral-200 pl-2" : "absolute left-1/2 top-full mt-3 max-h-[calc(100dvh-7rem)] w-64 -translate-x-1/2 overflow-y-auto rounded-3xl border border-neutral-200 bg-white p-2 shadow-xl"}>
        {item.children.map(child => <Link key={child.id} href={child.href} data-id={child.id}
          onClick={closeMenus} aria-current={isLinkActive(pathname, child.href) ? "page" : undefined}
          className="flex items-center gap-2 rounded-2xl p-3 text-sm font-bold hover:bg-neutral-100 focus-visible:outline focus-visible:outline-primary">
          <child.icon size={18} className="shrink-0" />{child.label}
        </Link>)}
      </div>
    </details>;
  });

  return <header ref={headerRef} className="fixed left-1/2 top-4 z-50 mx-auto w-[calc(100%-2rem)] max-w-7xl -translate-x-1/2">
    <div className="flex h-16 items-center justify-between gap-2 rounded-full border border-white/50 bg-white/90 px-4 py-2 shadow-xl backdrop-blur-xl sm:px-5">
      <Link href="/" aria-label="Roogo — Accueil" className="flex shrink-0 items-center">
        <div className="rounded-2xl bg-primary/10 p-2"><Image src="/logo.png?v=2" alt="" width={28} height={28} /></div>
        <span className="ml-3 hidden text-xl font-black sm:block">Roogo</span>
      </Link>
      <nav aria-label="Navigation principale" aria-busy={!isLoaded}
        className="hidden h-12 w-[700px] shrink-0 grid-cols-5 items-center rounded-full border border-neutral-200/60 bg-[#f5efe6]/80 p-1 xl:grid">
        {isLoaded ? renderItems(false) : Array.from({ length: 5 }, (_, index) =>
          <span key={index} aria-hidden="true" className="mx-4 h-4 rounded bg-neutral-200/60" />)}
      </nav>
      <div className="flex shrink-0 items-center gap-2">
        <div data-nav-auth-slot className="flex h-10 w-36 shrink-0 items-center justify-end sm:w-60" aria-busy={!isLoaded}>
          {!isLoaded ? <div role="status" className="flex w-full items-center justify-end gap-3">
            <span className="sr-only">Chargement du compte</span><span aria-hidden="true" className="h-4 w-20 rounded bg-neutral-100" />
            <span aria-hidden="true" className="h-10 w-10 rounded-full bg-neutral-100" />
          </div> : isSignedIn ? <div className="flex w-full min-w-0 items-center justify-end gap-3">
            <span className="hidden min-w-0 truncate text-sm font-bold sm:block">{fullName || "Mon compte"}</span>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center">{accountButton}</div>
          </div> : <div className="flex w-full items-center justify-end gap-2">
            <Link href="/connexion" className="hidden h-10 items-center rounded-full px-3 text-sm font-black hover:bg-neutral-100 sm:inline-flex">Connexion</Link>
            <Link href="/inscription" className="inline-flex h-10 items-center rounded-full bg-primary px-4 text-sm font-black text-white">Rejoindre</Link>
          </div>}
        </div>
        <button ref={mobileMenuButtonRef} type="button" className="rounded-full bg-neutral-100 p-2 xl:hidden"
          onClick={() => { closeGroups(); setMobileMenuOpen(!mobileMenuOpen); }}
          aria-label={mobileMenuOpen ? "Fermer le menu" : "Ouvrir le menu"}
          aria-expanded={mobileMenuOpen} aria-controls="mobile-primary-navigation">
          {mobileMenuOpen ? <XIcon size={22} /> : <ListIcon size={22} />}
        </button>
      </div>
    </div>
    {mobileMenuOpen && <nav ref={mobileMenuRef} id="mobile-primary-navigation" aria-label="Navigation mobile"
      className="absolute left-0 right-0 top-full mt-4 flex max-h-[calc(100dvh-7rem)] flex-col gap-1 overflow-y-auto rounded-[32px] border border-neutral-200 bg-white p-4 shadow-xl xl:hidden">
      {isLoaded ? renderItems(true) : <p role="status" className="p-3">Chargement du menu…</p>}
      {isLoaded && !isSignedIn && <Link href="/connexion" onClick={closeMenus} className="rounded-2xl p-3 font-bold text-primary">Connexion</Link>}
    </nav>}
  </header>;
}
