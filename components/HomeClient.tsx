"use client";

import { Hero } from "./Hero";
import { InfoCards } from "./InfoCards";
import { PropertyCard } from "./PropertyCard";
import { Footer } from "./Footer";
import { Property } from "../lib/data";
import { Button } from "./ui/Button";
import { motion } from "framer-motion";
import Link from "next/link";

interface HomeClientProps {
  featuredProperties: Property[];
}

export default function HomeClient({ featuredProperties }: HomeClientProps) {
  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  };

  const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 },
  };

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <main className="grow">
        <Hero />

        <InfoCards />

        <section className="py-16 container mx-auto px-4">
          <div className="flex justify-between items-end mb-8">
            <div>
              <h2 className="text-3xl font-bold text-neutral-900 mb-2">
                Annonces en vedette
              </h2>
              <p className="text-neutral-500">
                Explorez notre sélection exclusive de propriétés de qualité.
              </p>
            </div>
            <Link href="/location">
              <Button variant="ghost" className="hidden sm:inline-flex">
                Voir toutes les propriétés
              </Button>
            </Link>
          </div>

          <motion.div
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6"
            variants={container}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-50px" }}
          >
            {featuredProperties.map((property) => (
              <motion.div key={property.id} variants={item}>
                <PropertyCard property={property} />
              </motion.div>
            ))}
          </motion.div>

          <div className="mt-8 text-center sm:hidden">
            <Link href="/location">
              <Button variant="outline" fullWidth>
                Voir toutes les propriétés
              </Button>
            </Link>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
