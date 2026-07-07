"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { PlusIcon } from "@phosphor-icons/react";
import {
  DarkSection,
  Reveal,
  SectionHeader,
} from "@/components/marketing/MarketingPrimitives";
import { PRICE_PER_ROOM, formatFCFA } from "@/lib/visites-3d";

export const visitesFaqItems = [
  {
    question: "Combien de temps dure un scan sur place ?",
    answer:
      "Environ 2 heures pour un bien de taille standard. Les grandes propriétés peuvent prendre un peu plus de temps — nous vous le confirmons au moment de la réservation.",
  },
  {
    question: "Comment est calculé le tarif ?",
    answer: `${formatFCFA(PRICE_PER_ROOM)} par pièce. Une pièce = un espace à capturer : chambre, salon, salle à manger, cuisine, cour, etc. Le total est calculé selon le nombre de pièces que vous saisissez à la réservation et débité par Mobile Money au moment de confirmer le créneau.`,
  },
  {
    question: "Dans quelle zone intervenez-vous ?",
    answer:
      "Pour le moment, uniquement à Ouagadougou. Roogo étendra le service à d'autres villes dans les prochains mois.",
  },
  {
    question: "Quel matériel utilisez-vous ?",
    answer:
      "Des caméras 360° professionnelles, calibrées pour un rendu net et fidèle. Notre équipe est formée pour capturer chaque pièce sous le meilleur angle.",
  },
  {
    question: "Quand reçois-je le lien de la visite ?",
    answer:
      "Sous 72h après le passage de notre équipe. Le lien est accessible sur tous les appareils et partageable sans limite.",
  },
  {
    question: "Comment se passe le paiement ?",
    answer:
      "Paiement par Mobile Money (Orange Money ou Moov Money) au moment de la réservation. Le créneau n'est bloqué qu'une fois le paiement confirmé — vous recevrez un SMS de confirmation.",
  },
  {
    question: "La visite 3D reste-t-elle en ligne combien de temps ?",
    answer:
      "Sans limite de durée tant que votre annonce est active. Vous pouvez aussi nous demander de la retirer à tout moment.",
  },
  {
    question: "Puis-je annuler ou reporter ma réservation ?",
    answer:
      "Oui. Contactez Roogo au moins 24h avant le rendez-vous pour un report sans frais.",
  },
];

export function FAQ() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <DarkSection className="py-20 md:py-28">
      <div className="grid gap-10 lg:grid-cols-[0.86fr_1.14fr] lg:items-start">
        <SectionHeader
          dark
          kicker="Questions fréquentes"
          title="Vos questions, nos réponses."
          description="Tout ce qu'il faut savoir avant de réserver votre scan 3D avec Roogo."
        />

        <Reveal>
          <div className="grid gap-3">
            {visitesFaqItems.map((item, index) => {
              const isOpen = open === index;
              return (
                <div
                  key={item.question}
                  className="overflow-hidden rounded-[24px] border border-white/10 bg-white/[0.06] transition-colors hover:border-white/20"
                >
                  <button
                    type="button"
                    onClick={() => setOpen(isOpen ? null : index)}
                    aria-expanded={isOpen}
                    className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left"
                  >
                    <span className="font-black text-white">
                      {item.question}
                    </span>
                    <motion.span
                      animate={{ rotate: isOpen ? 45 : 0 }}
                      transition={{ duration: 0.18 }}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary"
                    >
                      <PlusIcon size={16} weight="bold" />
                    </motion.span>
                  </button>
                  <div
                    className={`grid transition-[grid-template-rows] duration-200 ease-out ${
                      isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                    }`}
                  >
                    <div className="overflow-hidden">
                      <p className="px-6 pb-6 text-sm font-medium leading-7 text-white/60">
                        {item.answer}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Reveal>
      </div>
    </DarkSection>
  );
}
