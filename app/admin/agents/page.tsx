"use client";

import { useState, useMemo, useEffect } from "react";
import {
  UserIcon,
  UsersIcon,
  PhoneIcon,
  EnvelopeIcon,
  DotsThreeVerticalIcon,
  MagnifyingGlassIcon,
  XIcon,
  MapPinIcon,
  CalendarIcon,
  BuildingsIcon,
} from "@phosphor-icons/react";
import Image from "next/image";
import { Property, fetchProperties } from "@/lib/data";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/Button";
import Link from "next/link";

interface Agent {
  full_name: string;
  phone: string;
  avatar_url: string;
  propertiesCount: number;
  properties: Property[];
}

export default function AdminAgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);

  useEffect(() => {
    async function loadAgents() {
      const properties = await fetchProperties();

      // Extract unique agents from properties
      const agentMap = new Map<string, Agent>();

      properties.forEach((p) => {
        if (p.agent) {
          const name = p.agent.full_name;
          if (agentMap.has(name)) {
            const existing = agentMap.get(name)!;
            existing.propertiesCount += 1;
            existing.properties.push(p);
          } else {
            agentMap.set(name, {
              full_name: name,
              phone: p.agent.phone,
              avatar_url: p.agent.avatar_url,
              propertiesCount: 1,
              properties: [p],
            });
          }
        }
      });

      setAgents(Array.from(agentMap.values()));
      setLoading(false);
    }
    loadAgents();
  }, []);

  const filteredAgents = useMemo(() => {
    return agents.filter(
      (agent) =>
        agent.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        agent.phone.includes(searchQuery)
    );
  }, [agents, searchQuery]);

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900 tracking-tight">
            Gestion des Agents
          </h1>
          <p className="text-neutral-500 font-medium mt-1">
            Consultez et gérez les agents actifs sur la plateforme.
          </p>
        </div>

        <div className="relative w-full md:w-80">
          <MagnifyingGlassIcon
            className="absolute left-5 top-1/2 -translate-y-1/2 text-neutral-400"
            size={20}
            weight="bold"
          />
          <input
            type="text"
            placeholder="Rechercher un agent..."
            className="w-full pl-12 pr-6 py-4 bg-white rounded-full border border-neutral-100 shadow-sm focus:ring-4 focus:ring-primary/5 focus:border-primary/20 outline-none transition-all text-[15px] font-medium"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-32 space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          <p className="text-neutral-400 font-medium">
            Chargement des agents...
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {filteredAgents.map((agent, index) => (
            <div
              key={index}
              className="bg-white p-8 rounded-[40px] border border-neutral-100 shadow-sm hover:shadow-xl transition-all group relative overflow-hidden"
            >
              <div className="flex items-start justify-between mb-8">
                <div className="relative">
                  <div className="w-24 h-24 rounded-3xl bg-neutral-50 overflow-hidden border-2 border-white shadow-md group-hover:scale-105 transition-transform duration-500">
                    {agent.avatar_url ? (
                      <Image
                        src={agent.avatar_url}
                        alt={agent.full_name}
                        width={96}
                        height={96}
                        className="object-cover w-full h-full"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-primary bg-primary/5 font-bold text-3xl">
                        {agent.full_name.charAt(0)}
                      </div>
                    )}
                  </div>
                  <div className="absolute -bottom-2 -right-2 bg-primary text-white text-[11px] font-bold px-3 py-1.5 rounded-xl border-2 border-white shadow-lg uppercase tracking-wider">
                    {agent.propertiesCount} Biens
                  </div>
                </div>
                <button className="p-2.5 hover:bg-neutral-50 rounded-full transition-colors border border-neutral-100 shadow-sm opacity-0 group-hover:opacity-100 duration-300">
                  <DotsThreeVerticalIcon
                    size={24}
                    weight="bold"
                    className="text-neutral-400"
                  />
                </button>
              </div>

              <div className="space-y-6">
                <div>
                  <h3 className="text-xl font-bold text-neutral-900 tracking-tight group-hover:text-primary transition-colors">
                    {agent.full_name}
                  </h3>
                  <p className="text-[11px] text-neutral-400 font-bold uppercase tracking-widest mt-1">
                    Partenaire Vérifié
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-4 text-neutral-600">
                    <div className="w-10 h-10 rounded-full bg-neutral-50 flex items-center justify-center shrink-0 border border-neutral-100 group-hover:bg-primary/5 transition-colors">
                      <PhoneIcon
                        size={18}
                        weight="bold"
                        className="group-hover:text-primary transition-colors"
                      />
                    </div>
                    <span className="text-[15px] font-bold">
                      {agent.phone || "Non renseigné"}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-neutral-600">
                    <div className="w-10 h-10 rounded-full bg-neutral-50 flex items-center justify-center shrink-0 border border-neutral-100 group-hover:bg-primary/5 transition-colors">
                      <EnvelopeIcon
                        size={18}
                        weight="bold"
                        className="group-hover:text-primary transition-colors"
                      />
                    </div>
                    <span className="text-[15px] font-bold truncate">
                      contact@roogo.com
                    </span>
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    onClick={() => setSelectedAgent(agent)}
                    className="w-full py-4 bg-neutral-900 text-white hover:bg-primary rounded-2xl text-sm font-bold transition-all shadow-lg shadow-black/5 active:scale-95 uppercase tracking-wider"
                  >
                    Voir Détails Agent
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Agent Detail Modal */}
      <AnimatePresence>
        {selectedAgent && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white w-full max-w-4xl max-h-[90vh] rounded-[40px] shadow-2xl border border-neutral-200 overflow-hidden flex flex-col"
            >
              {/* Modal Header */}
              <div className="p-8 sm:p-10 border-b border-neutral-100 flex items-start justify-between bg-neutral-50/30">
                <div className="flex items-center gap-6">
                  <div className="w-20 h-20 rounded-3xl overflow-hidden border-2 border-white shadow-xl">
                    {selectedAgent.avatar_url ? (
                      <Image
                        src={selectedAgent.avatar_url}
                        alt=""
                        width={80}
                        height={80}
                        className="object-cover w-full h-full"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-primary text-white font-bold text-3xl">
                        {selectedAgent.full_name.charAt(0)}
                      </div>
                    )}
                  </div>
                  <div>
                    <h2 className="text-3xl font-bold text-neutral-900 tracking-tight">
                      {selectedAgent.full_name}
                    </h2>
                    <div className="flex items-center gap-4 mt-2">
                      <span className="text-sm font-bold text-neutral-500 flex items-center gap-1.5">
                        <PhoneIcon
                          size={16}
                          weight="bold"
                          className="text-primary"
                        />
                        {selectedAgent.phone}
                      </span>
                      <span className="text-sm font-bold text-neutral-500 flex items-center gap-1.5">
                        <MapPinIcon
                          size={16}
                          weight="bold"
                          className="text-primary"
                        />
                        Ouagadougou, BF
                      </span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedAgent(null)}
                  className="p-3 hover:bg-white hover:shadow-md rounded-full transition-all border border-transparent hover:border-neutral-100 text-neutral-400 hover:text-neutral-900"
                >
                  <XIcon size={24} weight="bold" />
                </button>
              </div>

              {/* Modal Content */}
              <div className="flex-1 overflow-y-auto p-8 sm:p-10 space-y-10 custom-scrollbar">
                {/* Stats Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                  <div className="bg-neutral-50 p-6 rounded-[28px] border border-neutral-100">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                        <BuildingsIcon size={20} weight="bold" />
                      </div>
                      <span className="text-[11px] font-bold text-neutral-400 uppercase tracking-widest">
                        Biens Gérés
                      </span>
                    </div>
                    <p className="text-3xl font-bold text-neutral-900">
                      {selectedAgent.propertiesCount}
                    </p>
                  </div>
                  <div className="bg-neutral-50 p-6 rounded-[28px] border border-neutral-100">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center text-green-600">
                        <CalendarIcon size={20} weight="bold" />
                      </div>
                      <span className="text-[11px] font-bold text-neutral-400 uppercase tracking-widest">
                        Expérience
                      </span>
                    </div>
                    <p className="text-3xl font-bold text-neutral-900">
                      2+ ans
                    </p>
                  </div>
                  <div className="bg-neutral-50 p-6 rounded-[28px] border border-neutral-100">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center text-orange-500">
                        <UsersIcon size={20} weight="bold" />
                      </div>
                      <span className="text-[11px] font-bold text-neutral-400 uppercase tracking-widest">
                        Satisfaction
                      </span>
                    </div>
                    <p className="text-3xl font-bold text-neutral-900">4.8/5</p>
                  </div>
                </div>

                {/* Properties List */}
                <div className="space-y-6">
                  <h3 className="text-xl font-bold text-neutral-900 tracking-tight">
                    Liste des Biens
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {selectedAgent.properties.map((property) => (
                      <Link
                        key={property.id}
                        href={`/admin/listings/${property.id}`}
                        className="flex items-center gap-4 p-4 rounded-2xl border border-neutral-100 hover:border-primary/20 hover:bg-neutral-50/50 transition-all group"
                      >
                        <div className="w-20 h-20 rounded-xl overflow-hidden border border-neutral-100 shrink-0">
                          <Image
                            src={property.image}
                            alt=""
                            width={80}
                            height={80}
                            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                          />
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-sm font-bold text-neutral-900 truncate group-hover:text-primary transition-colors">
                            {property.title}
                          </h4>
                          <p className="text-xs text-neutral-500 font-medium mt-1 truncate">
                            {property.location}
                          </p>
                          <p className="text-sm font-bold text-primary mt-2">
                            {parseInt(property.price).toLocaleString()} F
                          </p>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="p-8 sm:p-10 border-t border-neutral-100 flex gap-4">
                <Button className="flex-1 h-14 rounded-2xl bg-neutral-900 font-bold uppercase tracking-wider text-xs">
                  Modifier l&apos;Agent
                </Button>
                <Button
                  variant="ghost"
                  className="flex-1 h-14 rounded-2xl border border-neutral-100 font-bold uppercase tracking-wider text-xs text-red-500 hover:bg-red-50 hover:border-red-100"
                >
                  Désactiver l&apos;Accès
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {!loading && filteredAgents.length === 0 && (
        <div className="bg-white rounded-[40px] p-20 text-center border border-neutral-100 shadow-sm">
          <div className="w-20 h-20 bg-neutral-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <UserIcon size={40} className="text-neutral-300" />
          </div>
          <h3 className="text-xl font-bold text-neutral-900 mb-2">
            Aucun agent trouvé
          </h3>
          <p className="text-neutral-500 max-w-sm mx-auto font-medium">
            Nous n&apos;avons trouvé aucun agent correspondant à votre
            recherche.
          </p>
        </div>
      )}
    </div>
  );
}
