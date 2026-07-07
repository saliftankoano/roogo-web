"use client";

import { motion, useReducedMotion } from "framer-motion";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import Link from "next/link";

const BRAND = "#c96a2e";

export function SuccessState({ date, slot }: { date: string; slot: string }) {
  const reduce = useReducedMotion();

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="rounded-[28px] border border-neutral-200 bg-white p-10 text-center shadow-[0_18px_40px_-24px_rgba(23,18,15,0.25)]"
    >
      <motion.svg
        viewBox="0 0 64 64"
        width={80}
        height={80}
        className="mx-auto mb-6"
      >
        <motion.circle
          cx="32"
          cy="32"
          r="28"
          fill="none"
          stroke={BRAND}
          strokeWidth={3}
          initial={reduce ? { pathLength: 1 } : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />
        <motion.path
          d="M20 33 L29 42 L46 24"
          fill="none"
          stroke={BRAND}
          strokeWidth={4}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={reduce ? { pathLength: 1 } : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.5, delay: 0.45, ease: "easeOut" }}
        />
      </motion.svg>

      <h3 className="mb-2 text-2xl font-extrabold tracking-tight text-neutral-950">
        Votre créneau est réservé
      </h3>
      <p className="mx-auto max-w-md text-neutral-600">
        Visite programmée le{" "}
        <span className="font-semibold">
          {format(parseISO(date), "EEEE d MMMM yyyy", { locale: fr })}
        </span>{" "}
        de <span className="font-semibold">{slot.replace("-", " à ")}</span>.
        Vous allez recevoir un SMS de confirmation sur votre téléphone. Nous
        vous appellerons la veille pour finaliser l&apos;accès au bien.
      </p>

      <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
        <Link
          href="/"
          className="inline-flex items-center justify-center rounded-full border border-neutral-200 px-6 py-3 font-bold text-neutral-900 transition-colors hover:bg-neutral-100"
        >
          Retour à l&apos;accueil
        </Link>
        <a
          href="https://wa.me/22667006116"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center rounded-full bg-primary px-6 py-3 font-bold text-white transition-colors hover:bg-primary-hover"
        >
          Nous écrire sur WhatsApp
        </a>
      </div>
    </motion.div>
  );
}
