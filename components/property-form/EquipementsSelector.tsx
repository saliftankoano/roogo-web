"use client";

import React from "react";
import { EQUIPEMENTS } from "@/lib/validations";
import { 
  Wifi, 
  ShieldCheck, 
  Trees, 
  Sun, 
  Waves, 
  Armchair 
} from "lucide-react";

interface EquipementsSelectorProps {
  selected: string[];
  onChange: (selected: string[]) => void;
}

const getIcon = (id: string) => {
  switch (id) {
    case "wifi": return <Wifi className="w-4 h-4" />;
    case "securite": return <ShieldCheck className="w-4 h-4" />;
    case "jardin": return <Trees className="w-4 h-4" />;
    case "solaires": return <Sun className="w-4 h-4" />;
    case "piscine": return <Waves className="w-4 h-4" />;
    case "meuble": return <Armchair className="w-4 h-4" />;
    default: return null;
  }
};

export const EquipementsSelector: React.FC<EquipementsSelectorProps> = ({
  selected,
  onChange,
}) => {
  const toggleEquipement = (id: string) => {
    if (selected.includes(id)) {
      onChange(selected.filter((item) => item !== id));
    } else {
      onChange([...selected, id]);
    }
  };

  return (
    <div className="space-y-3">
      <label className="text-sm font-medium text-gray-700">
        Équipements & Commodités
      </label>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {EQUIPEMENTS.map((item) => {
          const isSelected = selected.includes(item.id);
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => toggleEquipement(item.id)}
              className={`flex items-center gap-2 p-3 rounded-xl border-2 transition-all text-sm font-medium ${
                isSelected
                  ? "border-black bg-black text-white"
                  : "border-gray-100 bg-gray-50 text-gray-600 hover:border-gray-200"
              }`}
            >
              {getIcon(item.id)}
              {item.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};
