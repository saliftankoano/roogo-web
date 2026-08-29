"use client";

import { usePathname } from "next/navigation";
import { Navbar } from "./Navbar";
import type { RoogoSite } from "@/lib/site-context";

export function NavHandler({ site = "immobilier" }: { site?: RoogoSite }) {
  const pathname = usePathname();

  // Don't show the main Navbar on auth pages or admin pages
  const isAuthPage =
    pathname.startsWith("/connexion") || pathname.startsWith("/inscription");
  const isAdminPage = pathname.startsWith("/admin");

  if (site === "mebo" || pathname.startsWith("/mebo") || isAuthPage || isAdminPage) {
    return null;
  }

  return <Navbar />;
}
