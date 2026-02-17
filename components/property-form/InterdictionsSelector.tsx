"use client";

import React from "react";
import { INTERDICTIONS } from "@/lib/validations";
import { 
  Ban,
  CigaretteOff,
  UserX,
  Users
} from "lucide-react";

interface InterdictionsSelectorProps {
  selected: string[];
  onChange: (selected: string[]) => void;
}

const getIcon = (id: string) => {
  switch (id) {
    case "no_animaux": return <Ban className="w-4 h-4" />;
    case "no_fumeurs": return <CigaretteOff className="w-4 h-4" />;
    case "no_etudiants": return <UserX className="w-4 h-4" />;
    case "no_colocation": return <Users className="w-4 h-4" />;
    default: return null;
  }
};

export const InterdictionsSelector: React.FC<InterdictionsSelectorProps> = ({
  selected,
  onChange,
}) => {
  const toggleInterdiction = (id: string) => {
    if (selected.includes(id)) {
      onChange(selected.filter((item) => item !== id));
    } else {
      onChange([...selected, id]);
    }
  };

  return (
    <div className="space-y-3">
      <label className="text-sm font-medium text-gray-700">
        Restrictions & Interdictions
      </label>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {INTERDICTIONS.map((item) => {
          const isSelected = selected.includes(item.id);
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => toggleInterdiction(item.id)}
              className={`flex items-center gap-2 p-3 rounded-xl border-2 transition-all text-sm font-medium ${
                isSelected
                  ? "border-red-500 bg-red-50 text-red-700"
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
