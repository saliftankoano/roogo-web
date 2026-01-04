"use client";

import { usePathname } from "next/navigation";
import { Navbar } from "./Navbar";

export function NavHandler() {
  const pathname = usePathname();

  // Don't show the main Navbar on auth pages or admin pages
  const isAuthPage =
    pathname.startsWith("/sign-in") || pathname.startsWith("/sign-up");
  const isAdminPage = pathname.startsWith("/admin");

  if (isAuthPage || isAdminPage) {
    return null;
  }

  return <Navbar />;
}
