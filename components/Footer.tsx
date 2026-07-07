"use client";

import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import {
  EnvelopeSimple,
  FacebookLogo,
  InstagramLogo,
  LinkedinLogo,
  MapPin,
  Phone,
  XLogo,
} from "@phosphor-icons/react";
import { TrustpilotReviewCollector } from "./TrustpilotReviewCollector";
import { OFFICE_MAPS_URL } from "@/lib/office";

export function Footer() {
  return (
    <footer className="border-t border-white/10 bg-[#17120f] pt-16 text-white">
      <div className="mx-auto max-w-7xl px-6">
        <div className="grid gap-12 border-b border-white/10 pb-14 lg:grid-cols-[1.15fr_0.8fr_0.8fr_1fr]">
          <div>
            <Link href="/" className="inline-flex items-center gap-3">
              <span className="rounded-2xl bg-white p-2">
                <Image
                  src="/logo.png?v=2"
                  alt="Logo Roogo"
                  width={34}
                  height={34}
                  className="object-contain"
                />
              </span>
              <span className="text-2xl font-black tracking-tight">Roogo</span>
            </Link>
            <p className="mt-6 max-w-sm text-sm font-medium leading-7 text-white/60">
              La location immobilière au Burkina Faso, structurée autour
              d&apos;annonces plus lisibles, de visites mieux coordonnées et
              d&apos;un suivi plus clair.
            </p>
            <div className="mt-7 flex gap-3">
              {[
                { icon: FacebookLogo, label: "Facebook" },
                { icon: InstagramLogo, label: "Instagram" },
                { icon: XLogo, label: "X" },
                { icon: LinkedinLogo, label: "LinkedIn" },
              ].map((item) => (
                <motion.a
                  key={item.label}
                  href="#"
                  aria-label={item.label}
                  whileHover={{ y: -3, scale: 1.04 }}
                  whileTap={{ scale: 0.94 }}
                  className="flex size-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/60 transition-colors hover:bg-primary hover:text-white"
                >
                  <item.icon size={20} weight="fill" />
                </motion.a>
              ))}
            </div>
          </div>

          <div>
            <h4 className="text-sm font-black uppercase tracking-[0.16em] text-white/40">
              Immobilier
            </h4>
            <ul className="mt-6 space-y-4 text-sm font-bold text-white/70">
              <li>
                <Link href="/proprietes" className="hover:text-white">
                  Louer un logement
                </Link>
              </li>
              <li>
                <Link href="/proprietes?category=Business" className="hover:text-white">
                  Louer un local
                </Link>
              </li>
              <li>
                <Link href="/proprietes" className="hover:text-white">
                  Publier une annonce
                </Link>
              </li>
              <li>
                <Link href="/visites-3d" className="hover:text-white">
                  Visites 3D
                </Link>
              </li>
              <li>
                <Link href="/mes-proprietes" className="hover:text-white">
                  Mes biens
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-sm font-black uppercase tracking-[0.16em] text-white/40">
              Roogo
            </h4>
            <ul className="mt-6 space-y-4 text-sm font-bold text-white/70">
              <li>
                <Link href="/a-propos" className="hover:text-white">
                  À propos
                </Link>
              </li>
              <li>
                <Link href="/carrieres" className="hover:text-white">
                  Carrières
                </Link>
              </li>
              <li>
                <Link href="/nous-contacter" className="hover:text-white">
                  Contact
                </Link>
              </li>
              <li>
                <Link href="/parrainage" className="hover:text-white">
                  Parrainage
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-sm font-black uppercase tracking-[0.16em] text-white/40">
              Contact
            </h4>
            <ul className="mt-6 space-y-5 text-sm font-semibold leading-7 text-white/70">
              <li className="flex items-start gap-3">
                <MapPin size={20} className="mt-1 shrink-0 text-primary" />
                <a
                  href={OFFICE_MAPS_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-white"
                >
                  Karpala, 3ème boutique après le groupe l&apos;académie,
                  Ouagadougou
                </a>
              </li>
              <li className="flex items-center gap-3">
                <Phone size={20} className="shrink-0 text-primary" />
                <span>+226 53 11 11 19 / 67 00 61 16</span>
              </li>
              <li className="flex items-center gap-3">
                <EnvelopeSimple size={20} className="shrink-0 text-primary" />
                <span>bonjour@roogobf.com</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-b border-white/10 py-10">
          <TrustpilotReviewCollector />
        </div>

        <div className="flex flex-col gap-4 py-8 text-sm font-semibold text-white/40 md:flex-row md:items-center md:justify-between">
          <p>© {new Date().getFullYear()} Roogo. Tous droits réservés.</p>
          <div className="flex flex-wrap gap-5">
            <Link href="/confidentialite" className="hover:text-white">
              Confidentialité
            </Link>
            <Link href="/conditions-utilisation" className="hover:text-white">
              Conditions
            </Link>
            <Link href="/plan-du-site" className="hover:text-white">
              Plan du site
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
