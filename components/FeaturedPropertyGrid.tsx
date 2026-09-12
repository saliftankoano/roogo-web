"use client";

import { motion } from "framer-motion";
import type { Property } from "@/lib/data";
import { PropertyCard } from "./PropertyCard";

const gridClassName =
  "mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4";

export function FeaturedPropertiesSkeleton() {
  return (
    <div role="status" aria-label="Chargement des annonces en vedette">
      <div className={gridClassName} aria-hidden="true">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="min-h-[400px] rounded-[32px] border border-neutral-100 bg-white p-4">
            <div className="aspect-4/3 rounded-[24px] bg-neutral-100" />
            <div className="mt-6 h-5 w-2/3 rounded bg-neutral-100" />
            <div className="mt-3 h-4 w-1/2 rounded bg-neutral-100" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function FeaturedPropertyGrid({ properties }: { properties: Property[] }) {
  if (properties.length === 0) {
    return (
      <p className="mt-12 text-neutral-600">
        Aucun bien en vedette pour le moment. Consultez toutes les propriétés pour
        poursuivre votre recherche.
      </p>
    );
  }

  return (
    <motion.div
      className={gridClassName}
      variants={{ hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.11 } } }}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-80px" }}
    >
      {properties.map((property) => (
        <motion.div key={property.id} variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } }}>
            <PropertyCard
              property={property}
              // max-w-7xl, px-6, gap-6, and the card's padding/border.
              imageSizes="(max-width: 639px) calc(100vw - 82px), (max-width: 1023px) calc(50vw - 70px), (max-width: 1279px) calc(25vw - 64px), 256px"
            />
        </motion.div>
      ))}
    </motion.div>
  );
}
