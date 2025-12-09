"use client";

import Link from "next/link";
import Image from "next/image";
import { Button } from "./ui/Button";
import { motion, useScroll, useMotionValueEvent } from "framer-motion";
import { useState } from "react";
import { ListIcon, XIcon } from "@phosphor-icons/react";
import { UserButton, useUser } from "@clerk/nextjs";

export function Navbar() {
  const { scrollY } = useScroll();
  const [hidden, setHidden] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { isSignedIn, isLoaded, user } = useUser();

  useMotionValueEvent(scrollY, "change", (latest) => {
    const previous = scrollY.getPrevious() || 0;
    if (latest > previous && latest > 150) {
      setHidden(true);
    } else {
      setHidden(false);
    }
    setIsScrolled(latest > 20);
  });

  return (
    <>
      <motion.header
        variants={{
          visible: { y: 0, opacity: 1 },
          hidden: { y: "-100%", opacity: 0 },
        }}
        animate={hidden ? "hidden" : "visible"}
        transition={{ duration: 0.35, ease: "easeInOut" }}
        className="fixed top-4 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-screen-xl mx-auto z-50"
      >
        <nav
          className={`flex items-center justify-between px-8 rounded-full h-20 transition-all duration-300 ${
            isScrolled
              ? "bg-white/70 backdrop-blur-xl shadow-lg border border-white/30"
              : "bg-white shadow-sm border border-neutral-100"
          }`}
        >
          {/* Logo */}
          <Link href="/" className="flex items-center shrink-0">
            <Image
              src="/logo.png"
              alt="Roogo Logo"
              width={120}
              height={40}
              className="object-contain h-10 w-auto"
              priority
            />
          </Link>

          {/* Desktop Navigation - Centered */}
          <div className="hidden md:flex items-center justify-center gap-8 absolute left-1/2 -translate-x-1/2">
            <Link
              href="/carrieres"
              className="text-sm font-medium text-neutral-600 hover:text-primary transition-colors relative group whitespace-nowrap"
            >
              Carrières
              <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-primary transition-all duration-300 group-hover:w-full" />
            </Link>
            <Link
              href="/contact"
              className="text-sm font-medium text-neutral-600 hover:text-primary transition-colors relative group whitespace-nowrap"
            >
              Nous contacter
              <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-primary transition-all duration-300 group-hover:w-full" />
            </Link>
          </div>

          {/* Desktop Actions */}
          <div className="hidden md:flex items-center gap-4 shrink-0">
            {!isLoaded ? (
              <div className="w-24 h-10" /> // Placeholder to prevent layout shift
            ) : isSignedIn ? (
              <>
                {(user?.publicMetadata?.role === "admin" ||
                  user?.publicMetadata?.role === "staff" ||
                  user?.emailAddresses.some((email) =>
                    email.emailAddress.endsWith("@roogobf.com")
                  )) && (
                  <Link href="/admin">
                    <Button variant="ghost" size="md">
                      Gestion
                    </Button>
                  </Link>
                )}
                <Link href="/location">
                  <Button variant="ghost" size="md">
                    Mes biens
                  </Button>
                </Link>
                <UserButton afterSignOutUrl="/" />
              </>
            ) : (
              <>
                <Link
                  href="/sign-in"
                  className="text-sm font-medium text-neutral-600 hover:text-primary transition-colors whitespace-nowrap"
                >
                  Se connecter
                </Link>
                <Link href="/sign-up">
                  <Button
                    variant="primary"
                    size="md"
                    className="rounded-full shadow-md hover:shadow-lg transition-all duration-300"
                  >
                    Rejoindre
                  </Button>
                </Link>
              </>
            )}
          </div>

          {/* Mobile Menu Button */}
          <button
            className="md:hidden p-2 text-neutral-600 hover:text-primary transition-colors"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <XIcon size={24} /> : <ListIcon size={24} />}
          </button>
        </nav>

        {/* Mobile Menu */}
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{
            opacity: mobileMenuOpen ? 1 : 0,
            height: mobileMenuOpen ? "auto" : 0,
          }}
          className="md:hidden overflow-hidden bg-white rounded-2xl mt-2 shadow-xl border border-neutral-100"
        >
          <div className="flex flex-col p-4 gap-4">
            <Link
              href="/carrieres"
              className="text-neutral-600 font-medium hover:text-primary py-2 px-4 rounded-lg hover:bg-neutral-50"
              onClick={() => setMobileMenuOpen(false)}
            >
              Carrières
            </Link>
            <Link
              href="/contact"
              className="text-neutral-600 font-medium hover:text-primary py-2 px-4 rounded-lg hover:bg-neutral-50"
              onClick={() => setMobileMenuOpen(false)}
            >
              Nous contacter
            </Link>
            <div className="h-px bg-neutral-100 my-2" />
            {!isLoaded ? null : isSignedIn ? (
              <>
                {(user?.publicMetadata?.role === "admin" ||
                  user?.publicMetadata?.role === "staff" ||
                  user?.emailAddresses.some((email) =>
                    email.emailAddress.endsWith("@roogobf.com")
                  )) && (
                  <Link
                    href="/admin"
                    className="text-neutral-600 font-medium hover:text-primary py-2 px-4 rounded-lg hover:bg-neutral-50"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Gestion
                  </Link>
                )}
                <Link
                  href="/location"
                  className="text-neutral-600 font-medium hover:text-primary py-2 px-4 rounded-lg hover:bg-neutral-50"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Mes biens
                </Link>
                <div className="flex items-center justify-center py-2">
                  <UserButton afterSignOutUrl="/" />
                </div>
              </>
            ) : (
              <>
                <Link
                  href="/sign-in"
                  className="text-neutral-600 font-medium hover:text-primary py-2 px-4 rounded-lg hover:bg-neutral-50"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Se connecter
                </Link>
                <Link href="/sign-up">
                  <Button
                    variant="primary"
                    fullWidth
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Rejoindre
                  </Button>
                </Link>
              </>
            )}
          </div>
        </motion.div>
      </motion.header>
    </>
  );
}
