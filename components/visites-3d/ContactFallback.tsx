"use client";

import { motion, useReducedMotion } from "framer-motion";
import { PhoneCallIcon, WhatsappLogoIcon } from "@phosphor-icons/react";

type Line = {
  carrier: string;
  badge: string;
  badgeCls: string;
  display: string;
  tel: string;
  wa: string;
};

// Canonical Roogo lines — keep in sync with components/Footer.tsx and
// app/nous-contacter/page.tsx.
const LINES: Line[] = [
  {
    carrier: "Moov",
    badge: "MM",
    badgeCls: "bg-blue-100 text-blue-600",
    display: "+226 53 11 11 19",
    tel: "tel:+22653111119",
    wa: "https://wa.me/22653111119",
  },
  {
    carrier: "Orange",
    badge: "OM",
    badgeCls: "bg-orange-100 text-orange-600",
    display: "+226 67 00 61 16",
    tel: "tel:+22667006116",
    wa: "https://wa.me/22667006116",
  },
];

export function ContactFallback() {
  const reduce = useReducedMotion();

  return (
    <section className="border-y border-neutral-200 bg-white py-16">
      <div className="mx-auto w-full max-w-7xl px-6">
        <motion.div
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 0.3 }}
          className="mx-auto max-w-3xl text-center"
        >
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-primary">
            Besoin d&apos;un conseil ?
          </p>
          <h3 className="mt-2 text-2xl font-black tracking-tight text-neutral-950 md:text-3xl">
            Pas sûr ? Parlez à un conseiller.
          </h3>
          <p className="mx-auto mt-2 max-w-xl text-sm text-neutral-600">
            Hors de Ouagadougou ou besoin d&apos;un devis sur mesure ? Deux
            lignes, une par réseau — appelez celle de votre opérateur pour
            éviter les frais inter-réseaux. WhatsApp fonctionne sur les deux.
          </p>

          <div className="mx-auto mt-7 grid max-w-xl grid-cols-1 gap-3 sm:grid-cols-2">
            {LINES.map(({ carrier, badge, badgeCls, display, tel, wa }) => (
              <div
                key={display}
                className="rounded-[20px] border border-neutral-200 bg-white p-5 text-left"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl font-extrabold ${badgeCls}`}
                  >
                    {badge}
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-neutral-500">
                      Réseau {carrier}
                    </p>
                    <p className="text-base font-extrabold text-neutral-950">
                      {display}
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex gap-2">
                  <a
                    href={tel}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full border border-neutral-200 px-3 py-2 text-sm font-bold transition-colors hover:border-primary hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <PhoneCallIcon className="h-3.5 w-3.5 text-primary" />
                    Appeler
                  </a>
                  <a
                    href={wa}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full border border-neutral-200 px-3 py-2 text-sm font-bold transition-colors hover:border-[#25D366] hover:bg-[#25D366]/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#25D366]"
                  >
                    <WhatsappLogoIcon className="h-3.5 w-3.5 text-[#25D366]" />
                    WhatsApp
                  </a>
                </div>
              </div>
            ))}
          </div>

          <p className="mt-5 text-xs text-neutral-500">
            Ou par email :{" "}
            <a
              href="mailto:bonjour@roogobf.com"
              className="font-bold text-primary hover:underline"
            >
              bonjour@roogobf.com
            </a>
          </p>
        </motion.div>
      </div>
    </section>
  );
}
