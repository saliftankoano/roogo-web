"use client";

import Image from "next/image";
import { Button } from "./ui/Button";
import Link from "next/link";
import { motion } from "framer-motion";

export function InfoCards() {
  const cards = [
    {
      title: "Louer un logement",
      description:
        "Trouvez votre chez-vous idéal avec une expérience photo immersive et le plus grand choix de locations.",
      image: "/rent.png",
      action: "Voir les logements",
      href: "/rent/residential",
      offset: true, // Flag to push image down
    },
    {
      title: "Louer un local commercial",
      description:
        "Des bureaux aux entrepôts, trouvez l'espace parfait pour faire grandir votre entreprise.",
      image: "/commercial.png",
      action: "Voir les locaux",
      href: "/rent/commercial",
      offset: false,
    },
    {
      title: "Propriétaires",
      description:
        "Mettez votre bien en location en toute simplicité. Nous vous aidons à trouver des locataires fiables.",
      image: "/owners.png",
      action: "Publier une annonce",
      href: "/list-property",
      offset: true, // Flag to push image down
      extraOffset: true, // New flag for extra offset
    },
  ];

  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.2,
      },
    },
  };

  const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 },
  };

  return (
    <section className="py-16 bg-neutral-50">
      <div className="container mx-auto px-4">
        <motion.div
          className="grid grid-cols-1 md:grid-cols-3 gap-8"
          variants={container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-50px" }}
        >
          {cards.map((card, index) => (
            <motion.div
              key={index}
              className="bg-white p-8 rounded-2xl shadow-sm hover:shadow-md transition-shadow flex flex-col items-center text-center"
              variants={item}
            >
              <div
                className={`relative w-32 h-32 mb-6 flex items-end justify-center ${
                  card.offset ? "translate-y-4" : ""
                } ${card.extraOffset ? "translate-y-6" : ""}`}
              >
                <Image
                  src={card.image}
                  alt={card.title}
                  width={128}
                  height={128}
                  className="object-contain"
                />
              </div>
              <h3 className="text-2xl font-bold text-neutral-900 mb-4 pt-4">
                {card.title}
              </h3>
              <p className="text-neutral-600 mb-8 flex-grow">
                {card.description}
              </p>
              <Link href={card.href}>
                <Button variant="outline" size="md">
                  {card.action}
                </Button>
              </Link>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
