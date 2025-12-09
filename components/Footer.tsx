"use client";

import Link from "next/link";
import Image from "next/image";
import {
  FacebookLogo,
  InstagramLogo,
  XLogo,
  LinkedinLogo,
  EnvelopeSimple,
  Phone,
  MapPin,
} from "@phosphor-icons/react";

export function Footer() {
  return (
    <footer className="bg-white border-t border-neutral-200 pt-16 pb-8">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 mb-16">
          {/* Brand Column */}
          <div>
            <div className="flex items-center gap-2 mb-6">
              <Image
                src="/logo.png"
                alt="Roogo Logo"
                width={160}
                height={64}
                className="object-contain h-14 w-auto"
              />
            </div>
            <p className="text-neutral-500 mb-6 leading-relaxed">
              La référence de la location immobilière au Burkina Faso.
            </p>
            <div className="flex gap-4">
              <a
                href="#"
                className="text-neutral-400 hover:text-primary transition-colors"
              >
                <FacebookLogo size={24} weight="fill" />
              </a>
              <a
                href="#"
                className="text-neutral-400 hover:text-primary transition-colors"
              >
                <InstagramLogo size={24} weight="fill" />
              </a>
              <a
                href="#"
                className="text-neutral-400 hover:text-primary transition-colors"
              >
                <XLogo size={24} weight="fill" />
              </a>
              <a
                href="#"
                className="text-neutral-400 hover:text-primary transition-colors"
              >
                <LinkedinLogo size={24} weight="fill" />
              </a>
            </div>
          </div>

          {/* Links Column 1 */}
          <div>
            <h4 className="font-bold text-neutral-900 mb-6">Immobilier</h4>
            <ul className="space-y-4">
              <li>
                <Link
                  href="/rent/residential"
                  className="text-neutral-500 hover:text-primary transition-colors"
                >
                  Louer un logement
                </Link>
              </li>
              <li>
                <Link
                  href="/rent/commercial"
                  className="text-neutral-500 hover:text-primary transition-colors"
                >
                  Louer un local
                </Link>
              </li>
              <li>
                <Link
                  href="/list-property"
                  className="text-neutral-500 hover:text-primary transition-colors"
                >
                  Publier une annonce
                </Link>
              </li>
              <li>
                <Link
                  href="/contact"
                  className="text-neutral-500 hover:text-primary transition-colors"
                >
                  Nous contacter
                </Link>
              </li>
            </ul>
          </div>

          {/* Links Column 2 */}
          <div>
            <h4 className="font-bold text-neutral-900 mb-6">Entreprise</h4>
            <ul className="space-y-4">
              <li>
                <Link
                  href="/about"
                  className="text-neutral-500 hover:text-primary transition-colors"
                >
                  À propos
                </Link>
              </li>
              <li>
                <Link
                  href="/carrieres"
                  className="text-neutral-500 hover:text-primary transition-colors"
                >
                  Carrières
                </Link>
              </li>
              <li>
                <Link
                  href="/contact"
                  className="text-neutral-500 hover:text-primary transition-colors"
                >
                  Contact
                </Link>
              </li>
            </ul>
          </div>

          {/* Contact Column */}
          <div>
            <h4 className="font-bold text-neutral-900 mb-6">Contact</h4>
            <ul className="space-y-4">
              <li className="flex items-center gap-3 text-neutral-500">
                <MapPin size={20} />
                <span>Ouagadougou, Burkina Faso</span>
              </li>
              <li className="flex items-center gap-3 text-neutral-500">
                <Phone size={20} />
                <span>+226 70 00 00 00</span>
              </li>
              <li className="flex items-center gap-3 text-neutral-500">
                <EnvelopeSimple size={20} />
                <span>bonjour@roogobf.com</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-neutral-100 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-neutral-400 text-sm">
            © {new Date().getFullYear()} Roogo. Tous droits réservés.
          </p>
          <div className="flex gap-6 text-sm text-neutral-400">
            <Link href="/privacy" className="hover:text-neutral-600">
              Confidentialité
            </Link>
            <Link href="/terms" className="hover:text-neutral-600">
              Conditions
            </Link>
            <Link href="/sitemap" className="hover:text-neutral-600">
              Plan du site
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
