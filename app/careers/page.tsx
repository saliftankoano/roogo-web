"use client";

import { Navbar } from "../../components/Navbar";
import { Footer } from "../../components/Footer";
import { motion } from "framer-motion";
import { Button } from "../../components/ui/Button";
import { EnvelopeSimple, Lightbulb, UsersThree } from "@phosphor-icons/react";

export default function CareersPage() {
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

  const teamMembers = [
    {
      name: "Salif Tankoano",
      role: "CEO",
      description: "Visionnaire et moteur de l'innovation chez Roogo.",
    },
    {
      name: "Ablassé Zagre",
      role: "Directeur Marketing & Visuels",
      description:
        "Créateur de l'identité visuelle et de la stratégie de marque.",
    },
    {
      name: "Aroun Zerbo",
      role: "Directeur des Ventes & Engagements",
      description:
        "Responsable de la croissance et des relations partenaires.",
    },
  ];

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <Navbar />

      <main className="flex-grow pt-32 pb-16">
        <div className="container mx-auto px-4">
          {/* Hero Section */}
          <motion.div
            className="text-center max-w-3xl mx-auto mb-20"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <h1 className="text-4xl md:text-5xl font-bold text-neutral-900 mb-6">
              Rejoignez l'aventure Roogo
            </h1>
            <p className="text-xl text-neutral-600 leading-relaxed">
              Nous construisons le futur de l'immobilier au Burkina Faso. Une équipe jeune, dynamique et ambitieuse.
            </p>
          </motion.div>

          {/* Philosophy Section */}
          <motion.section
            className="mb-24"
            variants={container}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true }}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
              <motion.div variants={item}>
                <div className="bg-primary/5 p-8 rounded-3xl">
                  <Lightbulb size={48} className="text-primary mb-6" weight="duotone" />
                  <h2 className="text-3xl font-bold text-neutral-900 mb-4">
                    Notre Philosophie
                  </h2>
                  <p className="text-neutral-600 text-lg leading-relaxed mb-6">
                    Chez Roogo, nous croyons que l'innovation naît de l'initiative. Nous ne cherchons pas simplement des employés, mais des collaborateurs passionnés prêts à bousculer les codes.
                  </p>
                  <p className="text-neutral-600 text-lg leading-relaxed">
                    Si vous avez une idée, une vision et la volonté de la concrétiser, votre place est parmi nous. Montrez-nous votre valeur, votre créativité et votre détermination.
                  </p>
                </div>
              </motion.div>
              <motion.div variants={item} className="space-y-6">
                <div className="bg-neutral-50 p-6 rounded-2xl border border-neutral-100">
                  <h3 className="text-xl font-bold text-neutral-900 mb-2">Initiative</h3>
                  <p className="text-neutral-600">Nous valorisons ceux qui osent proposer et agir sans attendre.</p>
                </div>
                <div className="bg-neutral-50 p-6 rounded-2xl border border-neutral-100">
                  <h3 className="text-xl font-bold text-neutral-900 mb-2">Innovation</h3>
                  <p className="text-neutral-600">Nous cherchons constamment de nouvelles façons de simplifier la vie de nos utilisateurs.</p>
                </div>
                <div className="bg-neutral-50 p-6 rounded-2xl border border-neutral-100">
                  <h3 className="text-xl font-bold text-neutral-900 mb-2">Excellence</h3>
                  <p className="text-neutral-600">Nous visons la précision et la qualité dans tout ce que nous entreprenons.</p>
                </div>
              </motion.div>
            </div>
          </motion.section>

          {/* Team Section */}
          <motion.section
            className="mb-24"
            variants={container}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true }}
          >
            <div className="text-center mb-12">
              <UsersThree size={48} className="text-primary mx-auto mb-4" weight="duotone" />
              <h2 className="text-3xl font-bold text-neutral-900 mb-4">Notre Équipe</h2>
              <p className="text-neutral-600">Les visages derrière Roogo.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {teamMembers.map((member, index) => (
                <motion.div
                  key={index}
                  variants={item}
                  className="bg-white p-8 rounded-2xl shadow-sm border border-neutral-100 text-center hover:shadow-md transition-shadow"
                >
                  <div className="w-24 h-24 bg-neutral-100 rounded-full mx-auto mb-6 flex items-center justify-center text-2xl font-bold text-neutral-400">
                    {member.name.charAt(0)}
                  </div>
                  <h3 className="text-xl font-bold text-neutral-900 mb-2">{member.name}</h3>
                  <p className="text-primary font-medium mb-4">{member.role}</p>
                  <p className="text-neutral-600">{member.description}</p>
                </motion.div>
              ))}
            </div>
          </motion.section>

          {/* CTA Section */}
          <motion.div
            className="text-center bg-primary/5 rounded-3xl p-12"
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
          >
            <h2 className="text-3xl font-bold text-neutral-900 mb-6">
              Prêt à faire la différence ?
            </h2>
            <p className="text-lg text-neutral-600 max-w-2xl mx-auto mb-8">
              Nous n'avons pas de poste ouvert pour le moment, mais nous sommes toujours à l'écoute des talents exceptionnels. Envoyez-nous votre candidature spontanée.
            </p>
            <Button variant="primary" size="lg" className="inline-flex items-center gap-2">
              <EnvelopeSimple size={20} weight="bold" />
              Candidature Spontanée
            </Button>
          </motion.div>
        </div>
      </main>

      <Footer />
    </div>
  );
}

