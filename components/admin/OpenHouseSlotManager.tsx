"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  CalendarIcon,
  TrashIcon,
  PlusIcon,
  ClockIcon,
  UsersIcon,
  CaretDownIcon,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/Button";
import { Calendar } from "@/components/ui/calendar";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/lib/supabase";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

interface OpenHouseSlot {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  capacity: number;
  bookings: { count: number }[];
}

interface OpenHouseSlotManagerProps {
  propertyId: string;
  limit: number;
}

export default function OpenHouseSlotManager({
  propertyId,
  limit,
}: OpenHouseSlotManagerProps) {
  const [slots, setSlots] = useState<OpenHouseSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);

  // Form state
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [startTime, setStartTime] = useState("10:00");
  const [endTime, setEndTime] = useState("12:00");
  const [capacity, setCapacity] = useState(10);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const datePickerRef = useRef<HTMLDivElement>(null);

  const fetchSlots = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("open_house_slots")
        .select(
          `
          *,
          bookings:open_house_bookings(count)
        `
        )
        .eq("property_id", propertyId)
        .order("date", { ascending: true });

      if (error) throw error;
      setSlots(data || []);
    } catch (error) {
      console.error("Error fetching slots:", error);
    } finally {
      setLoading(false);
    }
  }, [propertyId]);

  useEffect(() => {
    fetchSlots();
  }, [fetchSlots]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        datePickerRef.current &&
        !datePickerRef.current.contains(event.target as Node)
      ) {
        setIsDatePickerOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleAddSlot = async () => {
    setIsSubmitting(true);
    try {
      const { error } = await supabase.from("open_house_slots").insert({
        property_id: propertyId,
        date: format(selectedDate!, "yyyy-MM-dd"),
        start_time: startTime,
        end_time: endTime,
        capacity,
      });

      if (error) throw error;

      setIsAdding(false);
      setShowConfirmation(false);
      fetchSlots();
      // Reset form
      setSelectedDate(undefined);
      setStartTime("10:00");
      setEndTime("12:00");
      setCapacity(10);
    } catch (error) {
      console.error("Error adding slot:", error);
      alert("Erreur lors de l'ajout du créneau");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmAdd = () => {
    if (!selectedDate || !propertyId) return;
    setShowConfirmation(true);
  };

  const handleDeleteSlot = async (id: string) => {
    if (!confirm("Êtes-vous sûr de vouloir supprimer ce créneau ?")) return;

    try {
      const { error } = await supabase
        .from("open_house_slots")
        .delete()
        .eq("id", id);
      if (error) throw error;
      fetchSlots();
    } catch (error) {
      console.error("Error deleting slot:", error);
      alert("Erreur lors de la suppression du créneau");
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-neutral-900 flex items-center gap-2">
            <CalendarIcon size={24} weight="duotone" className="text-primary" />
            Sessions Open House
          </h2>
          <p className="text-xs text-neutral-500 font-medium mt-1">
            {slots.length} / {limit} créneaux utilisés pour ce pack
          </p>
        </div>

        {!isAdding && slots.length < limit && (
          <Button
            onClick={() => setIsAdding(true)}
            className="bg-primary text-white text-xs font-bold uppercase tracking-wider px-6 h-11 rounded-xl shadow-lg shadow-primary/20 hover:scale-105 transition-all active:scale-95"
          >
            <PlusIcon size={18} weight="bold" className="mr-2" />
            Nouveau Créneau
          </Button>
        )}
      </div>

      <AnimatePresence mode="wait">
        {isAdding ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="p-8 border-2 border-primary/10 rounded-[32px] bg-primary/5 space-y-6 relative overflow-hidden"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Custom Date Picker Popover */}
              <div className="space-y-2" ref={datePickerRef}>
                <label className="text-[11px] font-bold text-neutral-900 ml-4 uppercase tracking-widest opacity-60">
                  Date de la visite
                </label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setIsDatePickerOpen(!isDatePickerOpen)}
                    className={`w-full flex items-center justify-between pl-6 pr-5 py-4 rounded-full border transition-all text-sm font-bold text-left ${
                      isDatePickerOpen
                        ? "bg-white ring-4 ring-primary/5 border-primary/20 text-primary"
                        : "bg-white border-neutral-100 text-neutral-900 hover:border-neutral-200"
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      <CalendarIcon
                        size={20}
                        weight="bold"
                        className={
                          isDatePickerOpen ? "text-primary" : "text-neutral-300"
                        }
                      />
                      {selectedDate
                        ? format(selectedDate, "PPP", { locale: fr })
                        : "Sélectionner une date"}
                    </span>
                    <CaretDownIcon
                      size={18}
                      weight="bold"
                      className={`transition-transform duration-300 ${
                        isDatePickerOpen
                          ? "rotate-180 text-primary"
                          : "text-neutral-300"
                      }`}
                    />
                  </button>

                  <AnimatePresence>
                    {isDatePickerOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        className="absolute top-full left-0 mt-3 bg-white rounded-[24px] p-4 shadow-2xl border border-neutral-100 z-50"
                      >
                        <Calendar
                          mode="single"
                          selected={selectedDate}
                          onSelect={(date) => {
                            setSelectedDate(date);
                            setIsDatePickerOpen(false);
                          }}
                          initialFocus
                          locale={fr}
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* Capacity */}
              <div className="space-y-2">
                <label className="text-[11px] font-bold text-neutral-900 ml-4 uppercase tracking-widest opacity-60">
                  Capacité (visiteurs)
                </label>
                <div className="relative group">
                  <input
                    type="number"
                    min="1"
                    className="w-full pl-12 pr-6 py-4 bg-white rounded-full border border-neutral-100 focus:ring-4 focus:ring-primary/5 focus:border-primary/20 transition-all text-sm font-bold"
                    value={capacity || ""}
                    onChange={(e) =>
                      setCapacity(e.target.value ? parseInt(e.target.value) : 0)
                    }
                  />
                  <div className="absolute left-5 top-1/2 -translate-y-1/2 text-neutral-300 group-focus-within:text-primary transition-colors">
                    <UsersIcon size={20} weight="bold" />
                  </div>
                </div>
              </div>

              {/* Time Selection */}
              <div className="space-y-2">
                <label className="text-[11px] font-bold text-neutral-900 ml-4 uppercase tracking-widest opacity-60">
                  Heure de début
                </label>
                <div className="relative group">
                  <input
                    type="time"
                    className="w-full pl-12 pr-6 py-4 bg-white rounded-full border border-neutral-100 focus:ring-4 focus:ring-primary/5 focus:border-primary/20 transition-all text-sm font-bold appearance-none cursor-pointer"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                  />
                  <div className="absolute left-5 top-1/2 -translate-y-1/2 text-neutral-300 group-focus-within:text-primary transition-colors">
                    <ClockIcon size={20} weight="bold" />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[11px] font-bold text-neutral-900 ml-4 uppercase tracking-widest opacity-60">
                  Heure de fin
                </label>
                <div className="relative group">
                  <input
                    type="time"
                    className="w-full pl-12 pr-6 py-4 bg-white rounded-full border border-neutral-100 focus:ring-4 focus:ring-primary/5 focus:border-primary/20 transition-all text-sm font-bold appearance-none cursor-pointer"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                  />
                  <div className="absolute left-5 top-1/2 -translate-y-1/2 text-neutral-300 group-focus-within:text-primary transition-colors">
                    <ClockIcon size={20} weight="bold" />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-3 justify-end pt-4">
              <Button
                variant="ghost"
                onClick={() => setIsAdding(false)}
                className="text-neutral-500 hover:bg-white text-xs font-bold uppercase tracking-wider"
              >
                Annuler
              </Button>
              <Button
                disabled={isSubmitting || !selectedDate}
                onClick={handleConfirmAdd}
                className="bg-primary text-white text-xs font-bold uppercase tracking-wider px-8 h-12 rounded-full shadow-lg shadow-primary/20 hover:scale-105 transition-all active:scale-95 disabled:opacity-50"
              >
                {isSubmitting ? "Enregistrement..." : "Enregistrer"}
              </Button>
            </div>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-4"
          >
            {loading ? (
              <div className="flex justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : slots.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {slots.map((slot) => (
                  <motion.div
                    layout
                    key={slot.id}
                    className="p-6 border border-neutral-100 rounded-[32px] bg-neutral-50/50 flex items-center justify-between group hover:border-primary/20 transition-all"
                  >
                    <div className="flex items-center gap-5">
                      <div className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center shadow-sm text-primary group-hover:scale-110 transition-transform">
                        <CalendarIcon size={24} weight="bold" />
                      </div>
                      <div>
                        <p className="font-bold text-neutral-900 text-base">
                          {format(new Date(slot.date), "EEEE d MMMM", {
                            locale: fr,
                          })}
                        </p>
                        <div className="flex items-center gap-4 mt-1">
                          <span className="flex items-center gap-1.5 text-xs text-neutral-500 font-bold uppercase tracking-tight">
                            <ClockIcon
                              size={14}
                              weight="bold"
                              className="text-neutral-300"
                            />
                            {slot.start_time.slice(0, 5)} -{" "}
                            {slot.end_time.slice(0, 5)}
                          </span>
                          <span className="flex items-center gap-1.5 text-xs text-neutral-500 font-bold uppercase tracking-tight">
                            <UsersIcon
                              size={14}
                              weight="bold"
                              className="text-neutral-300"
                            />
                            {slot.bookings?.[0]?.count || 0} / {slot.capacity}
                          </span>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => handleDeleteSlot(slot.id)}
                      className="p-3 text-neutral-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-all opacity-0 group-hover:opacity-100"
                    >
                      <TrashIcon size={20} weight="bold" />
                    </button>
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="py-16 text-center bg-neutral-50/50 rounded-[40px] border border-dashed border-neutral-200">
                <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm">
                  <CalendarIcon
                    size={32}
                    weight="light"
                    className="text-neutral-300"
                  />
                </div>
                <p className="text-sm text-neutral-400 font-bold uppercase tracking-widest">
                  Aucune session programmée
                </p>
                <button
                  onClick={() => setIsAdding(true)}
                  className="mt-4 text-primary font-bold text-sm hover:underline"
                >
                  Programmer la première visite
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Confirmation Modal */}
      <AnimatePresence>
        {showConfirmation && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-100 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-white rounded-[40px] w-full max-w-sm overflow-hidden shadow-2xl p-10 text-center"
            >
              <div className="w-20 h-20 bg-primary/10 rounded-3xl flex items-center justify-center mx-auto mb-8">
                <CalendarIcon
                  size={40}
                  weight="bold"
                  className="text-primary"
                />
              </div>

              <h3 className="text-2xl font-black text-neutral-900 mb-4 tracking-tight">
                Confirmer le créneau
              </h3>

              <p className="text-neutral-500 font-medium leading-relaxed mb-10">
                Voulez-vous vraiment programmer cette visite pour le{" "}
                <span className="text-neutral-900 font-bold">
                  {selectedDate &&
                    format(selectedDate, "d MMMM", { locale: fr })}
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
                  {isSubmitting ? "Confirmation..." : "Confirmer la création"}
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
