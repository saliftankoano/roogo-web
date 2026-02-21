"use client";

import { useState, useMemo, useEffect } from "react";
import {
  UserIcon,
  PhoneIcon,
  EnvelopeIcon,
  MagnifyingGlassIcon,
  XIcon,
  MapPinIcon,
  CalendarIcon,
  CaretLeftIcon,
  CaretRightIcon,
  WhatsappLogoIcon,
  GlobeIcon,
  BriefcaseIcon,
  BuildingsIcon,
  IdentificationCardIcon,
} from "@phosphor-icons/react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths, getDay, isToday } from "date-fns";
import { fr } from "date-fns/locale";

interface UserProfile {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  user_type: string;
  company_name: string | null;
  professional_link: string | null;
  whatsapp: string | null;
  preferred_city: string | null;
  budget_max: number | null;
  service_areas: string[] | null;
  portfolio_size: string | null;
  referral_source: string | null;
  preferences: Record<string, unknown>;
  created_at: string;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [userTypeFilter, setUserTypeFilter] = useState<string>("all");

  useEffect(() => {
    async function loadUsers() {
      try {
        const response = await fetch("/api/users/all");
        if (response.ok) {
          const data = await response.json();
          setUsers(data.users);
        } else {
          console.error("Failed to load users:", response.status, await response.text());
        }
      } catch (error) {
        console.error("Error loading users:", error);
      } finally {
        setLoading(false);
      }
    }
    loadUsers();
  }, []);

  const filteredUsers = useMemo(() => {
    return users.filter((user) => {
      const matchesSearch = 
        (user.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false) ||
        (user.email?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false) ||
        (user.phone?.includes(searchQuery) ?? false);
      
      const matchesType = userTypeFilter === "all" || user.user_type === userTypeFilter;
      
      const matchesDay = !selectedDay || isSameDay(new Date(user.created_at), selectedDay);

      return matchesSearch && matchesType && matchesDay;
    });
  }, [users, searchQuery, userTypeFilter, selectedDay]);

  // Calendar logic
  const daysInMonth = useMemo(() => {
    return eachDayOfInterval({
      start: startOfMonth(currentMonth),
      end: endOfMonth(currentMonth),
    });
  }, [currentMonth]);

  const signupCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    users.forEach((user) => {
      const dateStr = format(new Date(user.created_at), "yyyy-MM-dd");
      counts[dateStr] = (counts[dateStr] || 0) + 1;
    });
    return counts;
  }, [users]);

  const maxSignups = useMemo(() => {
    const values = Object.values(signupCounts);
    return values.length > 0 ? Math.max(...values) : 0;
  }, [signupCounts]);

  const getIntensity = (date: Date) => {
    const count = signupCounts[format(date, "yyyy-MM-dd")] || 0;
    if (count === 0) return "bg-neutral-50 text-neutral-400";
    if (maxSignups === 0) return "bg-primary/10 text-primary";
    
    const ratio = count / maxSignups;
    if (ratio <= 0.3) return "bg-primary/10 text-primary";
    if (ratio <= 0.6) return "bg-primary/30 text-primary-dark";
    return "bg-primary text-white";
  };

  const userTypeLabels: Record<string, string> = {
    renter: "Locataire",
    owner: "Propriétaire",
    agent: "Agent",
    staff: "Staff",
    founder: "Fondateur",
  };

  const userTypeColors: Record<string, string> = {
    renter: "bg-blue-50 text-blue-600 border-blue-100",
    owner: "bg-amber-50 text-amber-600 border-amber-100",
    agent: "bg-primary/10 text-primary border-primary/20",
    staff: "bg-purple-50 text-purple-600 border-purple-100",
    founder: "bg-purple-50 text-purple-600 border-purple-100",
  };

  return (
    <div className="space-y-12 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-4xl font-black text-neutral-900 tracking-tight">
            Gestion des Utilisateurs
          </h1>
          <p className="text-neutral-500 font-medium mt-2">
            Suivez les inscriptions et gérez les profils utilisateurs.
          </p>
        </div>

        <div className="relative w-full md:w-96">
          <MagnifyingGlassIcon
            className="absolute left-5 top-1/2 -translate-y-1/2 text-neutral-400"
            size={22}
            weight="bold"
          />
          <input
            type="text"
            placeholder="Nom, email ou téléphone..."
            className="w-full pl-14 pr-6 py-5 bg-white rounded-[24px] border border-neutral-100 shadow-sm focus:ring-4 focus:ring-primary/5 focus:border-primary/20 outline-none transition-all text-[16px] font-medium"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Calendar Heatmap */}
      <div className="bg-white p-8 rounded-[40px] border border-neutral-100 shadow-sm">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
              <CalendarIcon size={24} weight="bold" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-neutral-900 capitalize">
                {format(currentMonth, "MMMM yyyy", { locale: fr })}
              </h2>
              <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest">
                Calendrier des inscriptions
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
              className="p-3 hover:bg-neutral-50 rounded-xl transition-colors border border-neutral-100"
            >
              <CaretLeftIcon size={20} weight="bold" />
            </button>
            <button
              onClick={() => setCurrentMonth(new Date())}
              className="px-4 py-2 text-sm font-bold text-neutral-600 hover:bg-neutral-50 rounded-xl transition-colors"
            >
              Aujourd&apos;hui
            </button>
            <button
              onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
              className="p-3 hover:bg-neutral-50 rounded-xl transition-colors border border-neutral-100"
            >
              <CaretRightIcon size={20} weight="bold" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-2">
          {["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"].map((day) => (
            <div key={day} className="text-center text-[11px] font-black text-neutral-400 uppercase tracking-widest mb-2">
              {day}
            </div>
          ))}
          {Array.from({ length: getDay(startOfMonth(currentMonth)) }).map((_, i) => (
            <div key={`empty-${i}`} />
          ))}
          {daysInMonth.map((day) => {
            const dateStr = format(day, "yyyy-MM-dd");
            const count = signupCounts[dateStr] || 0;
            const isSelected = selectedDay && isSameDay(day, selectedDay);
            
            return (
              <button
                key={dateStr}
                onClick={() => setSelectedDay(isSelected ? null : day)}
                className={`
                  relative h-14 sm:h-20 rounded-2xl flex flex-col items-center justify-center transition-all group
                  ${getIntensity(day)}
                  ${isSelected ? "ring-4 ring-primary/20 scale-95 z-10" : "hover:scale-105"}
                  ${isToday(day) ? "border-2 border-primary/30" : "border border-transparent"}
                `}
              >
                <span className="text-sm font-bold">{format(day, "d")}</span>
                {count > 0 && (
                  <span className={`text-[10px] font-black mt-1 ${count > maxSignups * 0.6 ? "text-white/80" : "text-primary/60"}`}>
                    {count}
                  </span>
                )}
                {isToday(day) && (
                  <div className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-primary" />
                )}
              </button>
            );
          })}
        </div>
        
        {selectedDay && (
          <div className="mt-6 flex items-center justify-between p-4 bg-primary/5 rounded-2xl border border-primary/10">
            <p className="text-sm font-bold text-primary">
              Filtré par date : {format(selectedDay, "d MMMM yyyy", { locale: fr })}
            </p>
            <button 
              onClick={() => setSelectedDay(null)}
              className="text-xs font-black text-primary uppercase tracking-wider hover:underline"
            >
              Effacer le filtre
            </button>
          </div>
        )}
      </div>

      {/* Filters & Stats */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="flex flex-wrap gap-2">
          {["all", "renter", "owner", "agent", "staff"].map((type) => (
            <button
              key={type}
              onClick={() => setUserTypeFilter(type)}
              className={`
                px-6 py-3 rounded-full text-sm font-bold transition-all border
                ${userTypeFilter === type 
                  ? "bg-neutral-900 text-white border-neutral-900 shadow-lg shadow-black/10" 
                  : "bg-white text-neutral-500 border-neutral-100 hover:border-neutral-200"}
              `}
            >
              {type === "all" ? "Tous" : userTypeLabels[type] || type}
            </button>
          ))}
        </div>
        
        <div className="flex items-center gap-6 text-sm font-bold">
          <div className="flex flex-col items-end">
            <span className="text-neutral-400 uppercase tracking-widest text-[10px]">Total</span>
            <span className="text-neutral-900 text-lg">{users.length}</span>
          </div>
          <div className="w-px h-8 bg-neutral-100" />
          <div className="flex flex-col items-end">
            <span className="text-neutral-400 uppercase tracking-widest text-[10px]">Filtré</span>
            <span className="text-primary text-lg">{filteredUsers.length}</span>
          </div>
        </div>
      </div>

      {/* User Grid */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-32 space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          <p className="text-neutral-400 font-medium">Chargement des utilisateurs...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {filteredUsers.map((user) => (
            <motion.div
              layout
              key={user.id}
              onClick={() => setSelectedUser(user)}
              className="bg-white p-8 rounded-[40px] border border-neutral-100 shadow-sm hover:shadow-xl transition-all group cursor-pointer relative overflow-hidden"
            >
              <div className="flex items-start justify-between mb-6">
                <div className="w-20 h-20 rounded-3xl bg-neutral-50 overflow-hidden border-2 border-white shadow-md group-hover:scale-105 transition-transform duration-500">
                  {user.avatar_url ? (
                    <Image
                      src={user.avatar_url}
                      alt={user.full_name || ""}
                      width={80}
                      height={80}
                      className="object-cover w-full h-full"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-primary bg-primary/5 font-bold text-2xl">
                      {user.full_name?.charAt(0) || user.email?.charAt(0)}
                    </div>
                  )}
                </div>
                <div className={`px-4 py-1.5 rounded-xl border text-[10px] font-black uppercase tracking-widest ${userTypeColors[user.user_type] || "bg-neutral-50 text-neutral-500 border-neutral-100"}`}>
                  {userTypeLabels[user.user_type] || user.user_type}
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <h3 className="text-xl font-bold text-neutral-900 tracking-tight group-hover:text-primary transition-colors truncate">
                    {user.full_name || "Sans nom"}
                  </h3>
                  <p className="text-sm font-medium text-neutral-400 truncate">
                    {user.email}
                  </p>
                </div>

                <div className="space-y-2.5">
                  <div className="flex items-center gap-3 text-neutral-600">
                    <PhoneIcon size={16} weight="bold" className="text-neutral-400" />
                    <span className="text-sm font-bold">{user.phone || "Non renseigné"}</span>
                  </div>
                  {user.whatsapp && (
                    <div className="flex items-center gap-3 text-green-600">
                      <WhatsappLogoIcon size={16} weight="bold" />
                      <span className="text-sm font-bold">{user.whatsapp}</span>
                    </div>
                  )}
                  {user.preferred_city && (
                    <div className="flex items-center gap-3 text-neutral-600">
                      <MapPinIcon size={16} weight="bold" className="text-neutral-400" />
                      <span className="text-sm font-bold">{user.preferred_city}</span>
                    </div>
                  )}
                </div>

                <div className="pt-4 flex items-center justify-between border-t border-neutral-50">
                  <span className="text-[10px] font-black text-neutral-300 uppercase tracking-widest">
                    Inscrit le {format(new Date(user.created_at), "dd/MM/yyyy")}
                  </span>
                  <div className="w-8 h-8 rounded-full bg-neutral-50 flex items-center justify-center text-neutral-400 group-hover:bg-primary group-hover:text-white transition-all">
                    <CaretRightIcon size={16} weight="bold" />
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!loading && filteredUsers.length === 0 && (
        <div className="bg-white rounded-[40px] p-20 text-center border border-neutral-100 shadow-sm">
          <div className="w-24 h-24 bg-neutral-50 rounded-[32px] flex items-center justify-center mx-auto mb-6">
            <UserIcon size={48} weight="bold" className="text-neutral-200" />
          </div>
          <h3 className="text-2xl font-bold text-neutral-900 mb-2">
            Aucun utilisateur trouvé
          </h3>
          <p className="text-neutral-500 max-w-sm mx-auto font-medium">
            Ajustez vos filtres ou votre recherche pour trouver ce que vous cherchez.
          </p>
          <Button 
            onClick={() => {
              setSearchQuery("");
              setUserTypeFilter("all");
              setSelectedDay(null);
            }}
            className="mt-8 rounded-2xl px-8"
          >
            Réinitialiser les filtres
          </Button>
        </div>
      )}

      {/* User Detail Modal */}
      <AnimatePresence>
        {selectedUser && (
          <div className="fixed inset-0 z-100 flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white w-full max-w-4xl max-h-[90vh] rounded-[40px] shadow-2xl border border-neutral-200 overflow-hidden flex flex-col"
            >
              {/* Modal Header */}
              <div className="p-8 sm:p-10 border-b border-neutral-100 flex items-start justify-between bg-neutral-50/30">
                <div className="flex items-center gap-8">
                  <div className="w-24 h-24 rounded-[32px] overflow-hidden border-4 border-white shadow-xl">
                    {selectedUser.avatar_url ? (
                      <Image
                        src={selectedUser.avatar_url}
                        alt=""
                        width={96}
                        height={96}
                        className="object-cover w-full h-full"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-primary text-white font-bold text-4xl">
                        {selectedUser.full_name?.charAt(0) || selectedUser.email?.charAt(0)}
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <h2 className="text-3xl font-black text-neutral-900 tracking-tight">
                        {selectedUser.full_name || "Sans nom"}
                      </h2>
                      <span className={`px-4 py-1.5 rounded-xl border text-[10px] font-black uppercase tracking-widest ${userTypeColors[selectedUser.user_type] || "bg-neutral-50 text-neutral-500 border-neutral-100"}`}>
                        {userTypeLabels[selectedUser.user_type] || selectedUser.user_type}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-6">
                      <span className="text-sm font-bold text-neutral-500 flex items-center gap-2">
                        <EnvelopeIcon size={18} weight="bold" className="text-primary" />
                        {selectedUser.email}
                      </span>
                      <span className="text-sm font-bold text-neutral-500 flex items-center gap-2">
                        <PhoneIcon size={18} weight="bold" className="text-primary" />
                        {selectedUser.phone || "Non renseigné"}
                      </span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedUser(null)}
                  className="p-4 hover:bg-white hover:shadow-md rounded-2xl transition-all border border-transparent hover:border-neutral-100 text-neutral-400 hover:text-neutral-900"
                >
                  <XIcon size={24} weight="bold" />
                </button>
              </div>

              {/* Modal Content */}
              <div className="flex-1 overflow-y-auto p-8 sm:p-10 custom-scrollbar">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                  {/* Left Column - Core Info */}
                  <div className="space-y-10">
                    <section>
                      <h3 className="text-xs font-black text-neutral-400 uppercase tracking-[0.2em] mb-6">
                        Informations de contact
                      </h3>
                      <div className="space-y-6">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-2xl bg-green-50 flex items-center justify-center text-green-600 border border-green-100">
                            <WhatsappLogoIcon size={24} weight="bold" />
                          </div>
                          <div>
                            <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">WhatsApp</p>
                            <p className="font-bold text-neutral-900">{selectedUser.whatsapp || "Non renseigné"}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600 border border-blue-100">
                            <MapPinIcon size={24} weight="bold" />
                          </div>
                          <div>
                            <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Ville préférée</p>
                            <p className="font-bold text-neutral-900">{selectedUser.preferred_city || "Non renseigné"}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-2xl bg-purple-50 flex items-center justify-center text-purple-600 border border-purple-100">
                            <IdentificationCardIcon size={24} weight="bold" />
                          </div>
                          <div>
                            <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Source de parrainage</p>
                            <p className="font-bold text-neutral-900">{selectedUser.referral_source || "Direct"}</p>
                          </div>
                        </div>
                      </div>
                    </section>

                    {selectedUser.user_type === "renter" && (
                      <section>
                        <h3 className="text-xs font-black text-neutral-400 uppercase tracking-[0.2em] mb-6">
                          Budget & Préférences
                        </h3>
                        <div className="bg-neutral-50 p-6 rounded-3xl border border-neutral-100">
                          <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-1">Budget Max</p>
                          <p className="text-2xl font-black text-neutral-900">
                            {selectedUser.budget_max ? `${selectedUser.budget_max.toLocaleString()} F` : "Non défini"}
                          </p>
                        </div>
                      </section>
                    )}
                  </div>

                  {/* Right Column - Professional Info */}
                  <div className="space-y-10">
                    {(selectedUser.user_type === "agent" || selectedUser.user_type === "owner") && (
                      <section>
                        <h3 className="text-xs font-black text-neutral-400 uppercase tracking-[0.2em] mb-6">
                          Profil Professionnel
                        </h3>
                        <div className="space-y-6">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-600 border border-amber-100">
                              <BuildingsIcon size={24} weight="bold" />
                            </div>
                            <div>
                              <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Entreprise</p>
                              <p className="font-bold text-neutral-900">{selectedUser.company_name || "Indépendant"}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-neutral-50 flex items-center justify-center text-neutral-900 border border-neutral-100">
                              <GlobeIcon size={24} weight="bold" />
                            </div>
                            <div>
                              <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Lien professionnel</p>
                              {selectedUser.professional_link ? (
                                <a href={selectedUser.professional_link} target="_blank" rel="noopener noreferrer" className="font-bold text-primary hover:underline">
                                  Voir le site
                                </a>
                              ) : (
                                <p className="font-bold text-neutral-900">Non renseigné</p>
                              )}
                            </div>
                          </div>
                          {selectedUser.user_type === "agent" && (
                            <>
                              <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-2xl bg-neutral-50 flex items-center justify-center text-neutral-900 border border-neutral-100">
                                  <BriefcaseIcon size={24} weight="bold" />
                                </div>
                                <div>
                                  <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Taille du portfolio</p>
                                  <p className="font-bold text-neutral-900">{selectedUser.portfolio_size || "Non renseigné"}</p>
                                </div>
                              </div>
                              <div className="pt-4">
                                <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-3">Zones de service</p>
                                <div className="flex flex-wrap gap-2">
                                  {selectedUser.service_areas && selectedUser.service_areas.length > 0 ? (
                                    selectedUser.service_areas.map((area, i) => (
                                      <span key={i} className="px-3 py-1 bg-neutral-100 rounded-lg text-xs font-bold text-neutral-600">
                                        {area}
                                      </span>
                                    ))
                                  ) : (
                                    <span className="text-sm font-medium text-neutral-400">Aucune zone renseignée</span>
                                  )}
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      </section>
                    )}

                    <section>
                      <h3 className="text-xs font-black text-neutral-400 uppercase tracking-[0.2em] mb-6">
                        Métadonnées
                      </h3>
                      <div className="bg-neutral-50 p-6 rounded-3xl border border-neutral-100 space-y-4">
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">ID Système</span>
                          <span className="text-[10px] font-mono text-neutral-400">{selectedUser.id}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Date d&apos;inscription</span>
                          <span className="text-xs font-bold text-neutral-900">{format(new Date(selectedUser.created_at), "PPP", { locale: fr })}</span>
                        </div>
                      </div>
                    </section>
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="p-8 sm:p-10 border-t border-neutral-100 bg-neutral-50/30 flex gap-4">
                <Button 
                  className="flex-1 h-14 rounded-2xl bg-neutral-900 font-bold uppercase tracking-wider text-xs shadow-xl shadow-black/10"
                  onClick={() => {
                    if (selectedUser.phone) window.open(`tel:${selectedUser.phone}`);
                  }}
                >
                  Appeler l&apos;utilisateur
                </Button>
                {selectedUser.whatsapp && (
                  <Button 
                    className="h-14 w-14 rounded-2xl bg-green-500 hover:bg-green-600 text-white flex items-center justify-center shadow-xl shadow-green-500/20"
                    onClick={() => {
                      const phone = selectedUser.whatsapp?.replace(/\D/g, "");
                      window.open(`https://wa.me/${phone}`, "_blank");
                    }}
                  >
                    <WhatsappLogoIcon size={24} weight="bold" />
                  </Button>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
