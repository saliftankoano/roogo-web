"use client";

import { Footer } from "../../components/Footer";
import { motion } from "framer-motion";
import { Button } from "../../components/ui/Button";
import {
  EnvelopeSimpleIcon,
  PhoneIcon,
  MapPinIcon,
  WhatsappLogoIcon,
  PaperPlaneTiltIcon,
} from "@phosphor-icons/react";
import { useState } from "react";

export default function ContactPage() {
  const [formState, setFormState] = useState({
    name: "",
    email: "",
    subject: "",
    message: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Logic to handle form submission would go here
    console.log("Form submitted:", formState);
    alert("Merci pour votre message ! Notre équipe vous contactera bientôt.");
    setFormState({ name: "", email: "", subject: "", message: "" });
  };

  const contactInfo = [
    {
      icon: PhoneIcon,
      label: "Téléphone",
      value: "+226 25 30 00 00",
      subValue: "Lun - Ven, 8h - 18h",
    },
    {
      icon: EnvelopeSimpleIcon,
      label: "Email",
      value: "contact@roogo.bf",
      subValue: "Réponse sous 24h",
    },
    {
      icon: MapPinIcon,
      label: "Adresse",
      value: "Ouaga 2000, Secteur 15",
      subValue: "Ouagadougou, Burkina Faso",
    },
    {
      icon: WhatsappLogoIcon,
      label: "WhatsApp",
      value: "+226 70 00 00 00",
      subValue: "Assistance rapide",
    },
  ];

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <main className="flex-grow pt-40 pb-16">
        <div className="container mx-auto px-4 max-w-7xl">
          {/* Header */}
          <motion.div
            className="text-center max-w-2xl mx-auto mb-16"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <h1 className="text-4xl md:text-5xl font-bold text-neutral-900 mb-6">
              Contactez-nous
            </h1>
            <p className="text-lg text-neutral-600">
              Vous avez des questions ou besoin d&apos;assistance ? Notre équipe
              est là pour vous accompagner dans tous vos projets immobiliers.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
            {/* Contact Info Grid */}
            <div className="lg:col-span-1 space-y-6">
              {contactInfo.map((info, index) => (
                <motion.div
                  key={index}
                  className="bg-neutral-50 p-6 rounded-3xl border border-neutral-100 flex items-start gap-5 hover:bg-white hover:shadow-md transition-all duration-300"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                >
                  <div className="bg-primary/10 p-3 rounded-2xl text-primary">
                    <info.icon size={28} weight="duotone" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-neutral-400 uppercase tracking-wider mb-1">
                      {info.label}
                    </p>
                    <p className="text-lg font-bold text-neutral-900 mb-1">
                      {info.value}
                    </p>
                    <p className="text-sm text-neutral-500 font-medium">
                      {info.subValue}
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Contact Form Card */}
            <motion.div
              className="lg:col-span-2 bg-white p-8 md:p-12 rounded-[40px] border border-neutral-100 shadow-xl shadow-black/5"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <h2 className="text-2xl font-bold text-neutral-900 mb-8">
                Envoyez-nous un message
              </h2>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-neutral-900 ml-4">
                      Nom complet
                    </label>
                    <input
                      required
                      type="text"
                      placeholder="Jean Dupont"
                      className="w-full px-6 py-4 bg-neutral-50 rounded-full border border-neutral-100 focus:bg-white focus:ring-4 focus:ring-primary/5 focus:border-primary/20 transition-all text-sm font-medium"
                      value={formState.name}
                      onChange={(e) =>
                        setFormState({ ...formState, name: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-neutral-900 ml-4">
                      Email
                    </label>
                    <input
                      required
                      type="email"
                      placeholder="jean@example.com"
                      className="w-full px-6 py-4 bg-neutral-50 rounded-full border border-neutral-100 focus:bg-white focus:ring-4 focus:ring-primary/5 focus:border-primary/20 transition-all text-sm font-medium"
                      value={formState.email}
                      onChange={(e) =>
                        setFormState({ ...formState, email: e.target.value })
                      }
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold text-neutral-900 ml-4">
                    Sujet
                  </label>
                  <input
                    required
                    type="text"
                    placeholder="Comment pouvons-nous vous aider ?"
                    className="w-full px-6 py-4 bg-neutral-50 rounded-full border border-neutral-100 focus:bg-white focus:ring-4 focus:ring-primary/5 focus:border-primary/20 transition-all text-sm font-medium"
                    value={formState.subject}
                    onChange={(e) =>
                      setFormState({ ...formState, subject: e.target.value })
                    }
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold text-neutral-900 ml-4">
                    Message
                  </label>
                  <textarea
                    required
                    rows={5}
                    placeholder="Écrivez votre message ici..."
                    className="w-full px-6 py-5 bg-neutral-50 rounded-[32px] border border-neutral-100 focus:bg-white focus:ring-4 focus:ring-primary/5 focus:border-primary/20 transition-all text-sm font-medium resize-none"
                    value={formState.message}
                    onChange={(e) =>
                      setFormState({ ...formState, message: e.target.value })
                    }
                  />
                </div>

                <Button
                  variant="primary"
                  size="lg"
                  fullWidth
                  className="rounded-full py-4 font-bold text-base shadow-lg shadow-primary/20 flex items-center justify-center gap-2"
                >
                  <PaperPlaneTiltIcon size={22} weight="bold" />
                  Envoyer le message
                </Button>
              </form>
            </motion.div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
