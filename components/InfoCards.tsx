"use client";

import Image from "next/image";
import { Button } from "./ui/Button";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRightIcon } from "@phosphor-icons/react";

export function InfoCards() {
  const cards = [
    {
      title: "Louer un logement",
      description:
        "Trouvez votre chez-vous idéal avec une expérience photo immersive et le plus grand choix de locations.",
      image: "/rent.png",
      action: "Voir les logements",
      href: "/location",
      imageScale: 1.2,
      translateY: 48,
    },
    {
      title: "Louer un local commercial",
      description:
        "Des bureaux aux entrepôts, trouvez l'espace parfait pour faire grandir votre entreprise.",
      image: "/commercial.png",
      action: "Voir les locaux",
      href: "/location?type=commercial",
      imageScale: 1.2,
      translateY: 10,
    },
    {
      title: "Propriétaires",
      description:
        "Mettez votre bien en location en toute simplicité. Nous vous aidons à trouver des locataires fiables.",
      image: "/owners.png",
      action: "Publier une annonce",
      href: "/staff/join",
      imageScale: 1.0,
      translateY: 34,
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
    <section className="py-24 bg-neutral-50">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
           <h2 className="text-3xl font-bold text-neutral-900 mb-4">Une solution pour chacun</h2>
           <p className="text-neutral-500 text-lg">Que vous cherchiez ou proposiez un bien, nous avons ce qu'il vous faut.</p>
        </div>

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
              className="group bg-white p-8 rounded-[32px] shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col items-center text-center border border-transparent hover:border-primary/10 relative overflow-hidden"
              variants={item}
              whileHover={{ y: -5 }}
            >
              <div
                className="relative w-full h-56 mb-8 transition-transform duration-500 group-hover:scale-105"
              >
                <Image
                  src={card.image}
                  alt={card.title}
                  fill
                  className="object-contain object-bottom drop-shadow-lg"
                  style={{ 
                    transform: `scale(${card.imageScale || 1}) translateY(${card.translateY || 0}px)`,
                    transformOrigin: 'bottom center',
                  }}
                />
              </div>
              <h3 className="text-2xl font-bold text-neutral-900 mb-4 pt-4 group-hover:text-primary transition-colors">
                {card.title}
              </h3>
              <p className="text-neutral-600 mb-8 flex-grow leading-relaxed">
                {card.description}
              </p>
              <Link href={card.href} className="w-full">
                <Button variant="outline" size="lg" fullWidth className="group/button hover:bg-primary hover:text-white hover:border-primary transition-all rounded-xl">
                  {card.action}
                  <ArrowRightIcon className="ml-2 opacity-0 -translate-x-2 group-hover/button:opacity-100 group-hover/button:translate-x-0 transition-all duration-300" weight="bold" />
                </Button>
              </Link>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
