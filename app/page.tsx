"use client";

import { Hero } from "../components/Hero";
import { InfoCards } from "../components/InfoCards";
import { PropertyCard } from "../components/PropertyCard";
import { Footer } from "../components/Footer";
import { fetchFeaturedProperties, Property } from "../lib/data";
import { Button } from "../components/ui/Button";
import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import Link from "next/link";

export default function Home() {
  const [featuredProperties, setFeaturedProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadFeatured() {
      const data = await fetchFeaturedProperties(4);
      setFeaturedProperties(data);
      setLoading(false);
    }
    loadFeatured();
  }, []);

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
      <main className="flex-grow">
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

          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="h-[400px] rounded-[32px] bg-neutral-100 animate-pulse"
                />
              ))}
            </div>
          ) : (
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
          )}

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
