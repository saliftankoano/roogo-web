"use client";

import { motion } from "framer-motion";

export function Stats() {
  const stats = [
    { value: "500+", label: "Propriétés listées" },
    { value: "2k+", label: "Utilisateurs actifs" },
    { value: "98%", label: "Taux de satisfaction" },
    { value: "24h", label: "Temps moyen de location" },
  ];

  return (
    <section className="py-12 bg-white border-b border-neutral-100">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-y-8 gap-x-4 text-center">
          {stats.map((stat, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1, duration: 0.5 }}
              className="flex flex-col items-center"
            >
              <div className="text-4xl md:text-5xl font-black text-primary mb-2 tracking-tight">{stat.value}</div>
              <div className="text-neutral-500 font-medium text-base">{stat.label}</div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
