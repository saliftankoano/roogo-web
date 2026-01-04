"use client";

import { useState, useMemo, useEffect } from "react";
import { UserIcon, PhoneIcon, EnvelopeIcon, DotsThreeVertical, MagnifyingGlassIcon } from "@phosphor-icons/react";
import Image from "next/image";
import { Property, fetchProperties } from "@/lib/data";

interface Agent {
  full_name: string;
  phone: string;
  avatar_url: string;
  propertiesCount: number;
}

export default function AdminAgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    async function loadAgents() {
      const properties = await fetchProperties();
      
      // Extract unique agents from properties
      const agentMap = new Map<string, Agent>();
      
      properties.forEach(p => {
        if (p.agent) {
          const name = p.agent.full_name;
          if (agentMap.has(name)) {
            const existing = agentMap.get(name)!;
            existing.propertiesCount += 1;
          } else {
            agentMap.set(name, {
              full_name: name,
              phone: p.agent.phone,
              avatar_url: p.agent.avatar_url,
              propertiesCount: 1
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
    return agents.filter(agent => 
      agent.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      agent.phone.includes(searchQuery)
    );
  }, [agents, searchQuery]);

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900">Gestion des Agents</h1>
          <p className="text-neutral-500 mt-1">Gérez vos agents immobiliers et leurs performances.</p>
        </div>
        
        <div className="relative w-full md:w-80">
          <MagnifyingGlassIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400" size={20} />
          <input
            type="text"
            placeholder="Rechercher un agent..."
            className="w-full pl-12 pr-4 py-3 bg-white rounded-[20px] border border-neutral-100 shadow-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all text-sm"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredAgents.map((agent, index) => (
            <div key={index} className="bg-white p-6 rounded-[32px] border border-neutral-100 shadow-sm hover:shadow-md transition-all group">
              <div className="flex items-start justify-between mb-6">
                <div className="relative">
                  <div className="w-20 h-20 rounded-2xl bg-primary/5 overflow-hidden border-2 border-white shadow-sm">
                    {agent.avatar_url ? (
                      <Image 
                        src={agent.avatar_url} 
                        alt={agent.full_name} 
                        width={80} 
                        height={80} 
                        className="object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-primary font-bold text-2xl">
                        {agent.full_name.charAt(0)}
                      </div>
                    )}
                  </div>
                  <div className="absolute -bottom-2 -right-2 bg-primary text-white text-[10px] font-bold px-2 py-1 rounded-lg border-2 border-white shadow-sm">
                    {agent.propertiesCount} Biens
                  </div>
                </div>
                <button className="p-2 hover:bg-neutral-50 rounded-full transition-colors opacity-0 group-hover:opacity-100">
                  <DotsThreeVertical size={24} weight="bold" className="text-neutral-400" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-bold text-neutral-900 leading-tight">{agent.full_name}</h3>
                  <p className="text-sm text-neutral-400 font-medium">Agent Immobilier</p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-3 text-neutral-600">
                    <div className="w-8 h-8 rounded-full bg-neutral-50 flex items-center justify-center shrink-0">
                      <PhoneIcon size={16} />
                    </div>
                    <span className="text-sm font-medium">{agent.phone || "Non renseigné"}</span>
                  </div>
                  <div className="flex items-center gap-3 text-neutral-600">
                    <div className="w-8 h-8 rounded-full bg-neutral-50 flex items-center justify-center shrink-0">
                      <EnvelopeIcon size={16} />
                    </div>
                    <span className="text-sm font-medium">contact@roogo.com</span>
                  </div>
                </div>

                <div className="pt-2">
                  <button className="w-full py-3 bg-neutral-50 hover:bg-primary/5 hover:text-primary rounded-xl text-sm font-bold transition-all">
                    Voir Profil Complet
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && filteredAgents.length === 0 && (
        <div className="bg-white rounded-[32px] p-20 text-center border border-dashed border-neutral-200">
          <div className="w-16 h-16 bg-neutral-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <UserIcon size={32} className="text-neutral-300" />
          </div>
          <h3 className="text-lg font-bold text-neutral-900">Aucun agent trouvé</h3>
          <p className="text-neutral-500 max-w-xs mx-auto mt-2">Nous n'avons trouvé aucun agent correspondant à votre recherche.</p>
        </div>
      )}
    </div>
  );
}

