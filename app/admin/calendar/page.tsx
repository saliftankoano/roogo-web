"use client";

import { CalendarBlankIcon, ClockIcon, MapPinIcon, UsersIcon, PlusIcon } from "@phosphor-icons/react";

export default function AdminCalendarPage() {
  const upcomingSlots = [
    {
      id: 1,
      title: "Visite: Villa Moderne Lakeshore",
      location: "Koulouba",
      date: "Aujourd'hui",
      time: "14:00 - 15:00",
      attendees: 3,
      status: "Confirmé"
    },
    {
      id: 2,
      title: "Visite: Villa de Luxe Zone A",
      location: "Ouaga 2000",
      date: "Demain",
      time: "10:00 - 11:00",
      attendees: 1,
      status: "En attente"
    },
    {
      id: 3,
      title: "Shooting Photo: Espace Commercial",
      location: "Somgandé",
      date: "Mercredi, 07 Jan",
      time: "09:30 - 11:30",
      attendees: 2,
      status: "Confirmé"
    }
  ];

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900">Calendrier Open House</h1>
          <p className="text-neutral-500 mt-1">Gérez les créneaux de visite et les séances photo.</p>
        </div>
        
        <button className="flex items-center justify-center gap-2 bg-primary text-white px-6 py-3 rounded-2xl font-bold shadow-lg shadow-primary/20 hover:scale-105 transition-all active:scale-95">
          <PlusIcon size={20} weight="bold" />
          Nouveau Créneau
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Calendar View Placeholder */}
        <div className="lg:col-span-2 bg-white rounded-[40px] border border-neutral-100 shadow-sm p-8">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-xl font-bold text-neutral-900">Janvier 2026</h2>
            <div className="flex gap-2">
              <button className="p-2 hover:bg-neutral-50 rounded-xl border border-neutral-100 transition-all font-bold text-sm">Précédent</button>
              <button className="p-2 hover:bg-neutral-50 rounded-xl border border-neutral-100 transition-all font-bold text-sm">Suivant</button>
            </div>
          </div>
          
          <div className="grid grid-cols-7 gap-4 mb-4">
            {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map(day => (
              <div key={day} className="text-center text-[11px] font-bold text-neutral-400 uppercase tracking-widest">{day}</div>
            ))}
          </div>
          
          <div className="grid grid-cols-7 gap-4">
            {Array.from({ length: 31 }).map((_, i) => {
              const day = i + 1;
              const isToday = day === 4;
              const hasEvent = day === 4 || day === 5 || day === 7;
              
              return (
                <div 
                  key={i} 
                  className={`aspect-square rounded-2xl border flex flex-col items-center justify-center gap-1 transition-all cursor-pointer relative
                    ${isToday ? 'bg-primary text-white border-primary shadow-lg shadow-primary/20' : 'bg-neutral-50/30 border-neutral-50 hover:bg-white hover:border-neutral-200'}
                  `}
                >
                  <span className={`text-sm font-bold ${isToday ? 'text-white' : 'text-neutral-900'}`}>{day}</span>
                  {hasEvent && !isToday && <div className="w-1.5 h-1.5 bg-primary rounded-full" />}
                </div>
              );
            })}
          </div>
        </div>

        {/* Sidebar: Upcoming Events */}
        <div className="space-y-6">
          <h2 className="text-xl font-bold text-neutral-900 px-2">Prochainement</h2>
          <div className="space-y-4">
            {upcomingSlots.map(slot => (
              <div key={slot.id} className="bg-white p-5 rounded-[28px] border border-neutral-100 shadow-sm hover:border-primary/20 transition-all">
                <div className="flex items-center justify-between mb-3">
                  <span className={`text-[10px] font-bold px-2.5 py-1 rounded-lg uppercase tracking-wider
                    ${slot.status === 'Confirmé' ? 'bg-green-50 text-green-600' : 'bg-orange-50 text-orange-600'}
                  `}>
                    {slot.status}
                  </span>
                  <span className="text-[11px] font-bold text-neutral-400 uppercase">{slot.date}</span>
                </div>
                
                <h3 className="font-bold text-neutral-900 mb-4 line-clamp-1">{slot.title}</h3>
                
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-neutral-500">
                    <ClockIcon size={16} />
                    <span className="text-xs font-medium">{slot.time}</span>
                  </div>
                  <div className="flex items-center gap-2 text-neutral-500">
                    <MapPinIcon size={16} />
                    <span className="text-xs font-medium">{slot.location}</span>
                  </div>
                  <div className="flex items-center gap-2 text-neutral-500">
                    <UsersIcon size={16} />
                    <span className="text-xs font-medium">{slot.attendees} Participants</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          
          <button className="w-full py-4 bg-white border border-neutral-100 text-neutral-600 rounded-2xl text-sm font-bold hover:bg-neutral-50 transition-all">
            Voir tous les créneaux
          </button>
        </div>
      </div>
    </div>
  );
}

