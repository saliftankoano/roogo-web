"use client";

import { useState, useEffect, useCallback } from "react";
import { Calendar } from "@/components/ui/calendar";
import { motion, AnimatePresence } from "framer-motion";
import {
  ClockIcon,
  UsersIcon,
  PlusIcon,
  TrashIcon,
  CalendarBlank,
  NavigationArrowIcon,
} from "@phosphor-icons/react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { TimeInput24h } from "@/components/ui/TimeInput24h";

interface OpenHouseSlot {
  id: string;
  property_id: string;
  date: string;
  start_time: string;
  end_time: string;
  capacity: number;
  directions?: string;
  latitude?: number;
  longitude?: number;
  bookings: { count: number }[];
}

interface PropertyOpenHouseManagerProps {
  propertyId: string;
  className?: string;
}

export default function PropertyOpenHouseManager({
  propertyId,
  className,
}: PropertyOpenHouseManagerProps) {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(
    new Date()
  );
  const [slots, setSlots] = useState<OpenHouseSlot[]>([]);
  const [isAdding, setIsAdding] = useState(false);

  // Form state
  const [startTime, setStartTime] = useState("10:00");
  const [endTime, setEndTime] = useState("12:00");
  const [capacity, setCapacity] = useState(10);
  const [directions, setDirections] = useState("");
  const [latitude, setLatitude] = useState<string>("");
  const [longitude, setLongitude] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [expandedSlots, setExpandedSlots] = useState<Record<string, boolean>>({});

  const bumpEndTime = (newStart: string) => {
    const [h, m] = newStart.split(":").map(Number);
    const endH = Math.min(h + 1, 23);
    const endStr = `${String(endH).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    const [curEndH, curEndM] = endTime.split(":").map(Number);
    if (h > curEndH || (h === curEndH && m >= curEndM)) {
      setEndTime(endStr);
    }
  };

  const fetchSlots = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("open_house_slots")
        .select(
          `
          *,
          bookings:open_house_bookings(count)
        `
        )
        .eq("property_id", propertyId);

      if (error) throw error;
      setSlots(data || []);
    } catch (error) {
      console.error("Error fetching property slots:", error);
    }
  }, [propertyId]);

  useEffect(() => {
    fetchSlots();
  }, [fetchSlots]);

  const handleAddSlot = async () => {
    setIsSubmitting(true);
    try {
      const dateStr = selectedDate!.toISOString().split("T")[0];
      const response = await fetch("/api/admin/open-house-slots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          property_id: propertyId,
          date: dateStr,
          start_time: startTime,
          end_time: endTime,
          capacity,
          directions,
          latitude: parseFloat(latitude),
          longitude: parseFloat(longitude),
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create slot");
      }

      setIsAdding(false);
      setShowConfirmation(false);
      fetchSlots();
    } catch (error) {
      console.error("Error adding slot:", error);
      alert("Erreur lors de l'ajout du créneau");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmAdd = () => {
    if (!selectedDate || !directions.trim() || !latitude || !longitude) return;
    setShowConfirmation(true);
  };

  const handleDeleteSlot = async (id: string) => {
    if (!confirm("Êtes-vous sûr de vouloir supprimer ce créneau ?")) return;

    try {
      const response = await fetch(`/api/admin/open-house-slots?id=${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to delete slot");
      }

      fetchSlots();
    } catch (error) {
      console.error("Error deleting slot:", error);
      alert("Erreur lors de la suppression du créneau");
    }
  };

  const dateStr = selectedDate?.toISOString().split("T")[0];
  const daySlots = slots.filter((s) => s.date === dateStr);

  return (
    <div className={cn("grid grid-cols-1 lg:grid-cols-12 gap-10", className)}>
      {/* Calendar Side — hidden while adding */}
      <div className={cn("transition-all duration-300", isAdding ? "hidden" : "lg:col-span-7 xl:col-span-8")}>
        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={setSelectedDate}
          className="w-full"
          modifiers={{
            hasEvent: (date) =>
              slots.some((s) => s.date === date.toISOString().split("T")[0]),
          }}
          modifiersClassNames={{
            hasEvent:
              "after:content-[''] after:absolute after:bottom-4 after:left-1/2 after:-translate-x-1/2 after:w-1.5 after:h-1.5 after:bg-primary after:rounded-full after:shadow-sm after:shadow-primary/30",
          }}
        />
      </div>

      {/* Details Side — expands full width when adding */}
      <div className={cn("space-y-6 transition-all duration-300", isAdding ? "lg:col-span-12" : "lg:col-span-5 xl:col-span-4")}>
        <div className="bg-white p-8 rounded-[40px] border border-neutral-100 shadow-xl shadow-neutral-200/40 min-h-[450px] flex flex-col transition-all relative overflow-hidden">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h3 className="text-2xl font-black text-neutral-900 tracking-tight capitalize">
                {selectedDate?.toLocaleDateString("fr-FR", {
                  day: "numeric",
                  month: "long",
                })}
              </h3>
              <p className="text-[10px] font-black text-primary uppercase tracking-[0.2em] mt-1.5 flex items-center gap-2">
                <span className="w-8 h-px bg-primary/20" />
                Sessions Open House
              </p>
            </div>
            {!isAdding && (
              <button
                onClick={() => setIsAdding(true)}
                className="p-3.5 bg-primary text-white rounded-2xl shadow-xl shadow-primary/30 hover:scale-110 active:scale-95 transition-all group"
              >
                <PlusIcon
                  size={22}
                  weight="bold"
                  className="group-hover:rotate-90 transition-transform duration-300"
                />
              </button>
            )}
          </div>

          <div className="flex-1 space-y-4">
            <AnimatePresence mode="wait">
              {isAdding ? (
                <motion.div
                  key="adding"
                  initial={{ opacity: 0, scale: 0.95, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -10 }}
                  className="space-y-6 bg-neutral-50/50 p-8 rounded-[32px] border border-neutral-100 backdrop-blur-sm"
                >
                  <div className="space-y-6">
                    {/* Row 1: Times */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                      <div className="space-y-2.5">
                        <label className="text-[11px] font-bold text-neutral-500 ml-4 uppercase tracking-widest">
                          Heure de début
                        </label>
                        <TimeInput24h
                          value={startTime}
                          onChange={(v) => { setStartTime(v); bumpEndTime(v); }}
                          maxTime={endTime}
                          icon={<ClockIcon size={20} weight="bold" />}
                        />
                      </div>

                      <div className="space-y-2.5">
                        <label className="text-[11px] font-bold text-neutral-500 ml-4 uppercase tracking-widest">
                          Heure de fin
                        </label>
                        <TimeInput24h
                          value={endTime}
                          onChange={setEndTime}
                          minTime={startTime}
                          icon={<ClockIcon size={20} weight="bold" />}
                        />
                      </div>
                    </div>

                    {/* Row 2: Directions (full width) */}
                    <div className="space-y-2.5">
                      <label className="text-[11px] font-bold text-neutral-500 ml-4 uppercase tracking-widest">
                        Itinéraire / Indications
                      </label>
                      <div className="relative group">
                        <textarea
                          value={directions}
                          onChange={(e) => setDirections(e.target.value)}
                          placeholder="Ex: Après le grand marché Rood Woko, tourner à droite au feu rouge, puis 200m sur la gauche..."
                          rows={4}
                          className="w-full pl-12 pr-6 py-4 bg-white rounded-2xl border border-neutral-100 focus:ring-4 focus:ring-primary/5 focus:border-primary/20 transition-all text-sm font-medium shadow-sm resize-none"
                        />
                        <div className="absolute left-4 top-4 text-neutral-300 group-focus-within:text-primary transition-colors">
                          <NavigationArrowIcon size={20} weight="bold" />
                        </div>
                      </div>
                    </div>

                    {/* Row 3: GPS + Capacity */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                      <div className="space-y-2.5">
                        <label className="text-[11px] font-bold text-neutral-500 ml-4 uppercase tracking-widest">
                          Latitude
                        </label>
                        <div className="relative group">
                          <input
                            type="number"
                            step="any"
                            value={latitude}
                            onChange={(e) => setLatitude(e.target.value)}
                            placeholder="12.3456"
                            className="w-full px-4 py-4 bg-white rounded-2xl border border-neutral-100 focus:ring-4 focus:ring-primary/5 focus:border-primary/20 transition-all text-sm font-bold shadow-sm"
                          />
                        </div>
                      </div>
                      <div className="space-y-2.5">
                        <label className="text-[11px] font-bold text-neutral-500 ml-4 uppercase tracking-widest">
                          Longitude
                        </label>
                        <div className="relative group">
                          <input
                            type="number"
                            step="any"
                            value={longitude}
                            onChange={(e) => setLongitude(e.target.value)}
                            placeholder="-1.5678"
                            className="w-full px-4 py-4 bg-white rounded-2xl border border-neutral-100 focus:ring-4 focus:ring-primary/5 focus:border-primary/20 transition-all text-sm font-bold shadow-sm"
                          />
                        </div>
                      </div>

                      <div className="space-y-2.5">
                        <label className="text-[11px] font-bold text-neutral-500 ml-4 uppercase tracking-widest">
                          Capacité max.
                        </label>
                        <div className="relative group">
                          <input
                            type="number"
                            value={capacity || ""}
                            onChange={(e) =>
                              setCapacity(
                                e.target.value ? parseInt(e.target.value) : 0
                              )
                            }
                            className="w-full pl-12 pr-6 py-4 bg-white rounded-2xl border border-neutral-100 focus:ring-4 focus:ring-primary/5 focus:border-primary/20 transition-all text-sm font-bold shadow-sm"
                          />
                          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-300 group-focus-within:text-primary transition-colors">
                            <UsersIcon size={20} weight="bold" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3 pt-2">
                    <button
                      onClick={() => setIsAdding(false)}
                      className="flex-1 py-4 bg-white border border-neutral-100 text-neutral-500 rounded-2xl font-bold text-xs uppercase tracking-widest hover:bg-neutral-50 transition-all active:scale-95 order-2 sm:order-1 shadow-sm"
                    >
                      Annuler
                    </button>
                    <button
                      onClick={handleConfirmAdd}
                      disabled={isSubmitting || !directions.trim() || !latitude || !longitude}
                      className="flex-1 py-4 bg-primary text-white rounded-2xl font-bold text-xs uppercase tracking-widest shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 order-1 sm:order-2"
                    >
                      {isSubmitting ? "En cours..." : "Confirmer"}
                    </button>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="list"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="space-y-4"
                >
                  {daySlots.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center space-y-5 border-2 border-dashed border-neutral-50 rounded-[40px] bg-neutral-50/20">
                      <div className="w-16 h-16 bg-white rounded-3xl shadow-sm flex items-center justify-center">
                        <CalendarBlank
                          size={32}
                          weight="light"
                          className="text-neutral-200"
                        />
                      </div>
                      <div className="space-y-1 px-8">
                        <p className="text-neutral-400 text-sm font-bold uppercase tracking-wider">
                          Aucun créneau
                        </p>
                        <p className="text-neutral-300 text-xs font-medium">
                          Cliquez sur le bouton + pour en ajouter un.
                        </p>
                      </div>
                    </div>
                  ) : (
                    daySlots.map((slot) => (
                      <div
                        key={slot.id}
                        className="p-6 rounded-[32px] border border-neutral-100 bg-neutral-50/30 flex justify-between items-center group hover:bg-white hover:shadow-xl hover:shadow-neutral-200/40 transition-all duration-500"
                      >
                        <div className="space-y-4">
                          <div className="flex items-center gap-4 text-neutral-900">
                            <div className="w-10 h-10 rounded-2xl bg-white flex items-center justify-center shadow-sm text-primary group-hover:scale-110 transition-transform duration-500">
                              <ClockIcon size={20} weight="bold" />
                            </div>
                            <div className="flex flex-col">
                              <span className="text-sm font-black tracking-tight">
                                {slot.start_time.slice(0, 5)} —{" "}
                                {slot.end_time.slice(0, 5)}
                              </span>
                              <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mt-0.5">
                                Horaire de visite
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-4 text-neutral-500">
                            <div className="w-10 h-10 rounded-2xl bg-white flex items-center justify-center shadow-sm">
                              <UsersIcon size={20} weight="bold" />
                            </div>
                            <div className="flex flex-col">
                              <span className="text-sm font-black text-neutral-700">
                                {slot.bookings?.[0]?.count || 0} /{" "}
                                {slot.capacity}
                              </span>
                              <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mt-0.5">
                                Participants
                              </span>
                            </div>
                          </div>
                          {slot.directions && (
                            <div className="flex items-start gap-4 text-neutral-500 pt-2 border-t border-neutral-100">
                              <div className="w-10 h-10 rounded-2xl bg-white flex items-center justify-center shadow-sm shrink-0">
                                <NavigationArrowIcon size={20} weight="bold" />
                              </div>
                              <div className="flex flex-col gap-1 flex-1">
                                <div className="flex items-start justify-between gap-2">
                                  <span className="text-xs font-medium text-neutral-600 leading-snug flex-1">
                                    {expandedSlots[slot.id] 
                                      ? slot.directions 
                                      : slot.directions.length > 50 
                                        ? `${slot.directions.slice(0, 50)}...` 
                                        : slot.directions}
                                  </span>
                                  {slot.directions.length > 50 && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setExpandedSlots(prev => ({ ...prev, [slot.id]: !prev[slot.id] }));
                                      }}
                                      className="text-[10px] font-bold text-primary hover:text-primary/80 uppercase tracking-widest shrink-0 mt-0.5"
                                    >
                                      {expandedSlots[slot.id] ? "Réduire" : "Voir plus"}
                                    </button>
                                  )}
                                </div>
                                {slot.latitude != null && slot.longitude != null && (
                                  <span className="text-[10px] font-bold text-neutral-400 font-mono">
                                    {slot.latitude}, {slot.longitude}
                                  </span>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => handleDeleteSlot(slot.id)}
                          className="p-3 text-neutral-300 hover:text-red-500 hover:bg-red-50 rounded-2xl transition-all opacity-0 group-hover:opacity-100 shadow-sm hover:shadow-red-100"
                        >
                          <TrashIcon size={22} weight="bold" />
                        </button>
                      </div>
                    ))
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      <AnimatePresence>
        {showConfirmation && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-white rounded-[40px] w-full max-w-sm overflow-hidden shadow-2xl p-10 text-center"
            >
              <div className="w-20 h-20 bg-primary/10 rounded-3xl flex items-center justify-center mx-auto mb-8">
                <CalendarBlank
                  size={40}
                  weight="bold"
                  className="text-primary"
                />
              </div>

              <h3 className="text-2xl font-black text-neutral-900 mb-4 tracking-tight">
                Confirmer la session
              </h3>

              <p className="text-neutral-500 font-medium leading-relaxed mb-10">
                Voulez-vous vraiment programmer cette session de visite pour le{" "}
                <span className="text-neutral-900 font-bold">
                  {selectedDate?.toLocaleDateString("fr-FR", {
                    day: "numeric",
                    month: "long",
                  })}
                </span>{" "}
                de{" "}
                <span className="text-neutral-900 font-bold">{startTime}</span>{" "}
                à <span className="text-neutral-900 font-bold">{endTime}</span>{" "}
                ?
              </p>

              <div className="flex flex-col gap-3">
                <button
                  onClick={handleAddSlot}
                  disabled={isSubmitting}
                  className="w-full bg-primary text-white py-4 rounded-2xl font-bold shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 uppercase tracking-widest text-xs"
                >
                  {isSubmitting ? "Confirmation..." : "Confirmer le créneau"}
                </button>
                <button
                  onClick={() => setShowConfirmation(false)}
                  className="w-full py-4 text-neutral-400 font-bold hover:text-neutral-900 transition-colors uppercase tracking-widest text-[10px]"
                >
                  Annuler
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
