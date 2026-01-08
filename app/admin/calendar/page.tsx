"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CalendarBlank,
  ClockIcon,
  MapPinIcon,
  UsersIcon,
  PlusIcon,
  CaretLeftIcon,
  CaretRightIcon,
  XIcon,
  TrashIcon,
  CaretDownIcon,
  CheckIcon,
  CalendarIcon,
} from "@phosphor-icons/react";
import { supabase } from "@/lib/supabase";
import { fetchProperties, Property } from "@/lib/data";
import { TimeInput24h } from "@/components/ui/TimeInput24h";

interface OpenHouseSlot {
  id: string;
  property_id: string;
  date: string;
  start_time: string;
  end_time: string;
  capacity: number;
  property: {
    title: string;
    quartier: string;
  };
  bookings: { count: number }[];
}

export default function AdminCalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [slots, setSlots] = useState<OpenHouseSlot[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  // Form state
  const [selectedPropertyId, setSelectedPropertyId] = useState("");
  const [slotDate, setSlotDate] = useState("");
  const [startTime, setStartTime] = useState("10:00");
  const [endTime, setEndTime] = useState("12:00");
  const [capacity, setCapacity] = useState(10);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);

  // Custom select state
  const [isPropSelectOpen, setIsPropSelectOpen] = useState(false);
  const propSelectRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        propSelectRef.current &&
        !propSelectRef.current.contains(event.target as Node)
      ) {
        setIsPropSelectOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Month navigation
  const nextMonth = () => {
    setCurrentDate(
      new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1)
    );
    setSelectedDay(null);
  };

  const prevMonth = () => {
    setCurrentDate(
      new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1)
    );
    setSelectedDay(null);
  };

  const monthYearString = currentDate.toLocaleString("fr-FR", {
    month: "long",
    year: "numeric",
  });

  // Calendar logic
  const startOfMonth = new Date(
    currentDate.getFullYear(),
    currentDate.getMonth(),
    1
  );
  const endOfMonth = new Date(
    currentDate.getFullYear(),
    currentDate.getMonth() + 1,
    0
  );

  let firstDayOfWeek = startOfMonth.getDay();
  firstDayOfWeek = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;

  const daysInMonth = endOfMonth.getDate();
  const calendarDays = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const paddingDays = Array.from({ length: firstDayOfWeek }, () => null);

  const loadProperties = useCallback(async () => {
    const data = await fetchProperties();
    setProperties(data);
  }, []);

  const fetchSlots = useCallback(async () => {
    setLoading(true);
    try {
      const firstDay = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth(),
        1
      ).toISOString();
      const lastDay = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth() + 1,
        0
      ).toISOString();

      const { data, error } = await supabase
        .from("open_house_slots")
        .select(
          `
          *,
          property:properties(title, quartier),
          bookings:open_house_bookings(count)
        `
        )
        .gte("date", firstDay.split("T")[0])
        .lte("date", lastDay.split("T")[0]);

      if (error) throw error;
      setSlots(data || []);
    } catch (error) {
      console.error("Error fetching slots:", error);
    } finally {
      setLoading(false);
    }
  }, [currentDate]);

  useEffect(() => {
    fetchSlots();
    loadProperties();
  }, [fetchSlots, loadProperties]);

  const handleAddSlot = async () => {
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/admin/open-house-slots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          property_id: selectedPropertyId,
          date: slotDate,
          start_time: startTime,
          end_time: endTime,
          capacity,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create slot");
      }

      setIsModalOpen(false);
      setShowConfirmation(false);
      fetchSlots();
      // Reset form
      setSelectedPropertyId("");
      setSlotDate("");
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

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPropertyId || !slotDate) return;
    setShowConfirmation(true);
  };

  const openAddModal = (day?: number) => {
    if (day) {
      const date = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth(),
        day
      );
      setSlotDate(date.toISOString().split("T")[0]);
    }
    setIsModalOpen(true);
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

  const upcomingSlots = slots
    .filter((slot) => new Date(slot.date) >= new Date())
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(0, 3);

  const selectedDaySlots = selectedDay
    ? slots.filter((s) => {
        const d = new Date(s.date);
        return (
          d.getDate() === selectedDay &&
          d.getMonth() === currentDate.getMonth() &&
          d.getFullYear() === currentDate.getFullYear()
        );
      })
    : [];

  const containerVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.6,
        staggerChildren: 0.05,
      },
    },
  };

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={containerVariants}
      className="space-y-10 max-w-7xl mx-auto pb-20"
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-extrabold text-neutral-900 tracking-tight">
            Calendrier Open House
          </h1>
          <p className="text-neutral-500 font-medium mt-1">
            Gérez les créneaux de visite et les séances photo professionnelles.
          </p>
        </div>

        <button
          onClick={() => openAddModal()}
          className="flex items-center justify-center gap-2 bg-primary text-white px-8 py-4 rounded-2xl font-bold shadow-lg shadow-primary/20 hover:scale-105 transition-all active:scale-95 text-sm uppercase tracking-wider"
        >
          <PlusIcon size={20} weight="bold" />
          Nouveau Créneau
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
        {/* Calendar View */}
        <div className="xl:col-span-8 bg-white rounded-[40px] border border-neutral-100 shadow-sm p-8 sm:p-10">
          <div className="flex items-center justify-between mb-10">
            <h2 className="text-2xl font-extrabold text-neutral-900 capitalize">
              {monthYearString}
            </h2>
            <div className="flex gap-3">
              <button
                onClick={prevMonth}
                className="p-3.5 hover:bg-neutral-50 rounded-2xl border border-neutral-100 transition-all text-neutral-500 shadow-sm"
              >
                <CaretLeftIcon size={20} weight="bold" />
              </button>
              <button
                onClick={nextMonth}
                className="p-3.5 hover:bg-neutral-50 rounded-2xl border border-neutral-100 transition-all text-neutral-500 shadow-sm"
              >
                <CaretRightIcon size={20} weight="bold" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-4 mb-6">
            {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((day) => (
              <div
                key={day}
                className="text-center text-[11px] font-bold text-neutral-400 uppercase tracking-widest"
              >
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-4">
            {paddingDays.map((_, i) => (
              <div key={`padding-${i}`} className="aspect-square" />
            ))}
            {calendarDays.map((day) => {
              const dateStr = `${currentDate.getFullYear()}-${String(
                currentDate.getMonth() + 1
              ).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const daySlots = slots.filter((s) => s.date === dateStr);
              const isToday =
                new Date().toDateString() ===
                new Date(
                  currentDate.getFullYear(),
                  currentDate.getMonth(),
                  day
                ).toDateString();
              const hasEvent = daySlots.length > 0;
              const isSelected = selectedDay === day;

              return (
                <div
                  key={`${monthYearString}-${day}`}
                  onClick={() => setSelectedDay(day)}
                  className={`aspect-square rounded-[24px] border flex flex-col items-center justify-center gap-1 transition-all cursor-pointer relative
                    ${
                      isSelected
                        ? "border-primary ring-4 ring-primary/10 bg-primary/5"
                        : isToday
                        ? "bg-primary text-white border-primary shadow-lg shadow-primary/20 scale-105 z-10"
                        : "bg-neutral-50/30 border-neutral-50 hover:bg-white hover:border-neutral-200"
                    }
                  `}
                >
                  <span
                    className={`text-sm font-extrabold ${
                      isToday ? "text-white" : "text-neutral-900"
                    }`}
                  >
                    {day}
                  </span>
                  {hasEvent && !isToday && (
                    <div className="w-1.5 h-1.5 bg-primary rounded-full absolute bottom-5" />
                  )}
                </div>
              );
            })}
          </div>

          {/* Selected Day Details */}
          <AnimatePresence>
            {selectedDay && (
              <motion.div
                initial={{ opacity: 0, height: 0, marginTop: 0 }}
                animate={{ opacity: 1, height: "auto", marginTop: 40 }}
                exit={{ opacity: 0, height: 0, marginTop: 0 }}
                transition={{ duration: 0.4, ease: "circOut" }}
                className="pt-10 border-t border-neutral-100 overflow-hidden"
              >
                <div className="flex items-center justify-between mb-8">
                  <h3 className="text-xl font-bold text-neutral-900">
                    Créneaux du {selectedDay} {monthYearString}
                  </h3>
                  <button
                    onClick={() => openAddModal(selectedDay)}
                    className="flex items-center gap-2 text-primary font-bold text-sm bg-primary/5 px-4 py-2 rounded-full hover:bg-primary/10 transition-colors"
                  >
                    <PlusIcon size={16} weight="bold" />
                    Ajouter un créneau
                  </button>
                </div>

                {selectedDaySlots.length === 0 ? (
                  <div className="py-12 text-center bg-neutral-50/50 rounded-[32px] border border-dashed border-neutral-200">
                    <p className="text-neutral-400 italic text-sm">
                      Aucun créneau programmé pour ce jour.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {selectedDaySlots.map((slot) => (
                      <motion.div
                        layout
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        key={slot.id}
                        className="p-5 rounded-[32px] border border-neutral-100 bg-neutral-50/50 flex justify-between items-start group hover:border-primary/20 transition-all"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-neutral-900 mb-2 truncate text-base">
                            {slot.property.title}
                          </p>
                          <div className="flex flex-wrap items-center gap-4 text-xs text-neutral-500 font-bold uppercase tracking-tight">
                            <span className="flex items-center gap-1.5 bg-white px-3 py-1.5 rounded-full shadow-sm">
                              <ClockIcon
                                size={14}
                                weight="bold"
                                className="text-primary"
                              />
                              {slot.start_time.slice(0, 5)} -{" "}
                              {slot.end_time.slice(0, 5)}
                            </span>
                            <span className="flex items-center gap-1.5 bg-white px-3 py-1.5 rounded-full shadow-sm">
                              <UsersIcon size={14} weight="bold" />
                              {slot.bookings?.[0]?.count || 0} / {slot.capacity}
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={() => handleDeleteSlot(slot.id)}
                          className="p-2.5 text-neutral-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                        >
                          <TrashIcon size={20} weight="bold" />
                        </button>
                      </motion.div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Sidebar: Upcoming Events */}
        <div className="xl:col-span-4 space-y-8">
          <h2 className="text-xl font-bold text-neutral-900 px-2 tracking-tight flex items-center gap-3">
            <CalendarBlank size={24} weight="bold" className="text-primary" />
            Prochainement
          </h2>
          <div className="space-y-5">
            {loading ? (
              <div className="text-center py-20 text-neutral-400 font-medium italic">
                Chargement des créneaux...
              </div>
            ) : upcomingSlots.length === 0 ? (
              <div className="text-center py-20 text-neutral-400 font-medium bg-neutral-50 rounded-[40px] border border-dashed border-neutral-200 px-10">
                <p className="text-xs uppercase tracking-widest leading-relaxed">
                  Aucun créneau prévu pour les prochains jours
                </p>
              </div>
            ) : (
              upcomingSlots.map((slot, index) => (
                <motion.div
                  key={slot.id}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="bg-white p-6 rounded-[40px] border border-neutral-100 shadow-sm hover:shadow-md hover:border-primary/20 transition-all group cursor-pointer"
                >
                  <div className="flex items-center justify-between mb-5">
                    <span className="text-[10px] font-extrabold px-3 py-1 rounded-full uppercase tracking-wider bg-green-50 text-green-600 border border-green-100">
                      Confirmé
                    </span>
                    <span className="text-[11px] font-bold text-neutral-400 uppercase tracking-tight bg-neutral-50 px-3 py-1 rounded-full">
                      {new Date(slot.date).toLocaleDateString("fr-FR", {
                        day: "numeric",
                        month: "short",
                      })}
                    </span>
                  </div>

                  <h3 className="font-bold text-neutral-900 text-base mb-5 line-clamp-1 group-hover:text-primary transition-colors">
                    {slot.property.title}
                  </h3>

                  <div className="space-y-3">
                    <div className="flex items-center gap-3.5 text-neutral-500">
                      <div className="w-9 h-9 rounded-2xl bg-neutral-50 flex items-center justify-center shrink-0 group-hover:bg-primary/5 transition-colors">
                        <ClockIcon
                          size={18}
                          weight="bold"
                          className="group-hover:text-primary transition-colors"
                        />
                      </div>
                      <span className="text-xs font-bold text-neutral-700">
                        {slot.start_time.slice(0, 5)} -{" "}
                        {slot.end_time.slice(0, 5)}
                      </span>
                    </div>
                    <div className="flex items-center gap-3.5 text-neutral-500">
                      <div className="w-9 h-9 rounded-2xl bg-neutral-50 flex items-center justify-center shrink-0">
                        <MapPinIcon size={18} weight="bold" />
                      </div>
                      <span className="text-xs font-bold text-neutral-700 truncate">
                        {slot.property.quartier}
                      </span>
                    </div>
                    <div className="flex items-center gap-3.5 text-neutral-500">
                      <div className="w-9 h-9 rounded-2xl bg-neutral-50 flex items-center justify-center shrink-0">
                        <UsersIcon size={18} weight="bold" />
                      </div>
                      <span className="text-xs font-bold text-neutral-700">
                        {slot.bookings?.[0]?.count || 0} / {slot.capacity}{" "}
                        Participants
                      </span>
                    </div>
                  </div>
                </motion.div>
              ))
            )}
          </div>

          <button className="w-full py-5 bg-white border border-neutral-100 text-neutral-600 rounded-[24px] text-xs font-bold uppercase tracking-widest hover:bg-neutral-50 hover:text-primary transition-all shadow-sm hover:shadow-md">
            Voir tout le planning
          </button>
        </div>
      </div>

      {/* Add Slot Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="bg-white rounded-[32px] w-full max-w-md overflow-hidden shadow-2xl"
            >
              <div className="p-8 border-b border-neutral-100 flex items-center justify-between">
                <h2 className="text-2xl font-bold text-neutral-900">
                  Nouveau Créneau
                </h2>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="p-2 hover:bg-neutral-50 rounded-full transition-colors"
                >
                  <XIcon size={24} weight="bold" />
                </button>
              </div>

              <form onSubmit={handleFormSubmit} className="p-8 space-y-6">
                <div className="space-y-3" ref={propSelectRef}>
                  <label className="text-xs font-bold text-neutral-900 ml-4 uppercase tracking-widest opacity-60">
                    Propriété
                  </label>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setIsPropSelectOpen(!isPropSelectOpen)}
                      className={`w-full flex items-center justify-between pl-6 pr-5 py-4 bg-neutral-50/50 rounded-full border transition-all text-sm font-bold text-left ${
                        isPropSelectOpen
                          ? "bg-white ring-4 ring-primary/5 border-primary/20 text-primary"
                          : "border-neutral-100 text-neutral-900 hover:border-neutral-200"
                      }`}
                    >
                      <span className="truncate">
                        {selectedPropertyId
                          ? properties.find((p) => p.id === selectedPropertyId)
                              ?.title
                          : "Sélectionner une propriété"}
                      </span>
                      <CaretDownIcon
                        size={20}
                        weight="bold"
                        className={`transition-transform duration-300 ${
                          isPropSelectOpen
                            ? "rotate-180 text-primary"
                            : "text-neutral-300"
                        }`}
                      />
                    </button>

                    <AnimatePresence>
                      {isPropSelectOpen && (
                        <motion.div
                          initial={{ opacity: 0, y: 10, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 10, scale: 0.95 }}
                          className="absolute top-full left-0 right-0 mt-3 bg-white rounded-[24px] p-2 shadow-2xl border border-neutral-100 z-50 max-h-[240px] overflow-y-auto"
                        >
                          {properties.map((p) => (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => {
                                setSelectedPropertyId(p.id);
                                setIsPropSelectOpen(false);
                              }}
                              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-left transition-all ${
                                selectedPropertyId === p.id
                                  ? "bg-primary/10 text-primary"
                                  : "text-neutral-600 hover:bg-neutral-50"
                              }`}
                            >
                              <div className="flex flex-col truncate w-full pr-4">
                                <span className="text-sm font-bold truncate">
                                  {p.title}
                                </span>
                                <span className="text-[11px] opacity-60 truncate">
                                  {p.location}
                                </span>
                              </div>
                              {selectedPropertyId === p.id && (
                                <CheckIcon size={16} weight="bold" />
                              )}
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest ml-4">
                    Date
                  </label>
                  <div className="relative group">
                    <input
                      type="date"
                      required
                      value={slotDate}
                      onChange={(e) => setSlotDate(e.target.value)}
                      className="w-full pl-12 pr-6 py-4 bg-neutral-50/50 rounded-full border border-neutral-100 focus:bg-white focus:ring-4 focus:ring-primary/5 focus:border-primary/20 transition-all text-sm font-bold appearance-none cursor-pointer"
                    />
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-300 group-focus-within:text-primary transition-colors">
                      <CalendarIcon size={20} weight="bold" />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest ml-4">
                      Début
                    </label>
                    <TimeInput24h
                      value={startTime}
                      onChange={setStartTime}
                      icon={<ClockIcon size={20} weight="bold" />}
                      className="bg-neutral-50/50"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest ml-4">
                      Fin
                    </label>
                    <TimeInput24h
                      value={endTime}
                      onChange={setEndTime}
                      icon={<ClockIcon size={20} weight="bold" />}
                      className="bg-neutral-50/50"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest ml-4">
                    Capacité (visiteurs)
                  </label>
                  <div className="relative group">
                    <input
                      type="number"
                      required
                      min="1"
                      value={capacity || ""}
                      onChange={(e) =>
                        setCapacity(
                          e.target.value ? parseInt(e.target.value) : 0
                        )
                      }
                      className="w-full pl-12 pr-6 py-4 bg-neutral-50/50 rounded-full border border-neutral-100 focus:bg-white focus:ring-4 focus:ring-primary/5 focus:border-primary/20 transition-all text-sm font-bold"
                    />
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-300 group-focus-within:text-primary transition-colors">
                      <UsersIcon size={20} weight="bold" />
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-primary text-white py-4 rounded-2xl font-bold shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:hover:scale-100 uppercase tracking-widest text-sm"
                >
                  {isSubmitting ? "Création..." : "Créer le créneau"}
                </button>
              </form>
            </motion.div>
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
            className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md"
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
                Voulez-vous vraiment créer ce créneau de visite pour{" "}
                <span className="text-neutral-900 font-bold">
                  {properties.find((p) => p.id === selectedPropertyId)?.title}
                </span>{" "}
                le{" "}
                <span className="text-neutral-900 font-bold">
                  {new Date(slotDate).toLocaleDateString("fr-FR", {
                    day: "numeric",
                    month: "long",
                  })}
                </span>{" "}
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
    </motion.div>
  );
}
