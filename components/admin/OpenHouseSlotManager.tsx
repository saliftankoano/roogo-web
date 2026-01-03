"use client";

import { useState } from "react";
import { 
  CalendarIcon, 
  ClockIcon, 
  TrashIcon, 
  PlusIcon,
  UsersIcon
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/Button";

interface OpenHouseSlot {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  capacity: number;
  bookings: number;
}

interface OpenHouseSlotManagerProps {
  propertyId: string;
  limit: number;
  existingSlots: OpenHouseSlot[];
}

export default function OpenHouseSlotManager({ propertyId, limit, existingSlots = [] }: OpenHouseSlotManagerProps) {
  const [slots, setSlots] = useState<OpenHouseSlot[]>(existingSlots);
  const [isAdding, setIsAdding] = useState(false);
  
  const [newDate, setNewNewDate] = useState("");
  const [newStart, setNewStartTime] = useState("10:00");
  const [newEnd, setNewEndTime] = useState("12:00");
  const [newCapacity, setNewCapacity] = useState(10);

  const handleAddSlot = () => {
    if (!newDate) return;
    
    const newSlot: OpenHouseSlot = {
      id: Math.random().toString(36).substr(2, 9),
      date: newDate,
      startTime: newStart,
      endTime: newEnd,
      capacity: newCapacity,
      bookings: 0
    };
    
    setSlots([...slots, newSlot]);
    setIsAdding(false);
    setNewNewDate("");
  };

  const removeSlot = (id: string) => {
    setSlots(slots.filter(s => s.id !== id));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <CalendarIcon size={24} weight="duotone" />
          Sessions Open House ({slots.length}/{limit} max)
        </h2>
      </div>

      <div className="space-y-4">
        {slots.map((slot) => (
          <div key={slot.id} className="p-4 border border-neutral-100 rounded-xl bg-neutral-50 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-sm">
                <CalendarIcon size={20} className="text-primary" />
              </div>
              <div>
                <p className="font-bold text-sm">
                  {new Date(slot.date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
                </p>
                <p className="text-xs text-neutral-500">
                  {slot.startTime} - {slot.endTime} • {slot.bookings}/{slot.capacity} réservations
                </p>
              </div>
            </div>
            <Button variant="ghost" size="sm" className="text-red-500 hover:bg-red-50" onClick={() => removeSlot(slot.id)}>
              <TrashIcon size={18} />
            </Button>
          </div>
        ))}

        {isAdding ? (
          <div className="p-6 border-2 border-primary/20 rounded-2xl bg-primary/5 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-neutral-500 uppercase">Date</label>
                <input 
                  type="date" 
                  className="w-full p-2 rounded-lg border border-neutral-200 text-sm" 
                  value={newDate}
                  onChange={(e) => setNewNewDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-neutral-500 uppercase">Capacité</label>
                <input 
                  type="number" 
                  className="w-full p-2 rounded-lg border border-neutral-200 text-sm" 
                  value={newCapacity}
                  onChange={(e) => setNewCapacity(parseInt(e.target.value))}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-neutral-500 uppercase">Heure Début</label>
                <input 
                  type="time" 
                  className="w-full p-2 rounded-lg border border-neutral-200 text-sm" 
                  value={newStart}
                  onChange={(e) => setNewStartTime(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-neutral-500 uppercase">Heure Fin</label>
                <input 
                  type="time" 
                  className="w-full p-2 rounded-lg border border-neutral-200 text-sm" 
                  value={newEnd}
                  onChange={(e) => setNewEndTime(e.target.value)}
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="ghost" size="sm" onClick={() => setIsAdding(false)}>Annuler</Button>
              <Button size="sm" className="bg-primary text-white" onClick={handleAddSlot}>Enregistrer</Button>
            </div>
          </div>
        ) : slots.length < limit ? (
          <Button 
            variant="ghost" 
            className="w-full border-2 border-dashed border-neutral-200 h-14 rounded-xl text-neutral-500 hover:border-primary/50 hover:text-primary transition-all"
            onClick={() => setIsAdding(true)}
          >
            <PlusIcon size={18} className="mr-2" />
            Ajouter une session
          </Button>
        ) : (
          <p className="text-center text-xs text-neutral-400 italic">
            Limite de sessions atteinte pour ce pack
          </p>
        )}
      </div>
    </div>
  );
}
