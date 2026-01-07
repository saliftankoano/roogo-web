"use client";

import React, { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface TimeInput24hProps {
  value: string; // "HH:MM" format
  onChange: (value: string) => void;
  className?: string;
  icon?: React.ReactNode;
}

export function TimeInput24h({
  value,
  onChange,
  className,
  icon,
}: TimeInput24hProps) {
  const [hours, setHours] = useState("10");
  const [minutes, setMinutes] = useState("00");
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (value) {
      const [h, m] = value.split(":");
      setHours(h || "10");
      setMinutes(m || "00");
    }
  }, [value]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleHourChange = (h: string) => {
    setHours(h);
    onChange(`${h}:${minutes}`);
  };

  const handleMinuteChange = (m: string) => {
    setMinutes(m);
    onChange(`${hours}:${m}`);
  };

  const hourOptions = Array.from({ length: 24 }, (_, i) =>
    i.toString().padStart(2, "0")
  );
  const minuteOptions = Array.from({ length: 12 }, (_, i) =>
    (i * 5).toString().padStart(2, "0")
  );

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "w-full flex items-center gap-3 pl-12 pr-6 py-4 bg-white rounded-2xl border border-neutral-100 text-sm font-bold text-left transition-all",
          isOpen
            ? "ring-4 ring-primary/5 border-primary/20"
            : "hover:border-neutral-200",
          className
        )}
      >
        {icon && (
          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-300">
            {icon}
          </div>
        )}
        <span className="tabular-nums">
          {hours}:{minutes}
        </span>
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl border border-neutral-100 shadow-xl z-50 p-3 flex gap-2">
          {/* Hours */}
          <div className="flex-1 max-h-[200px] overflow-y-auto scrollbar-thin">
            <p className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest mb-2 px-2">
              Heure
            </p>
            <div className="space-y-0.5">
              {hourOptions.map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => handleHourChange(h)}
                  className={cn(
                    "w-full py-2 px-3 rounded-xl text-sm font-bold text-left transition-all",
                    hours === h
                      ? "bg-primary text-white"
                      : "text-neutral-600 hover:bg-neutral-50"
                  )}
                >
                  {h}
                </button>
              ))}
            </div>
          </div>

          {/* Minutes */}
          <div className="flex-1 max-h-[200px] overflow-y-auto scrollbar-thin">
            <p className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest mb-2 px-2">
              Min
            </p>
            <div className="space-y-0.5">
              {minuteOptions.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => handleMinuteChange(m)}
                  className={cn(
                    "w-full py-2 px-3 rounded-xl text-sm font-bold text-left transition-all",
                    minutes === m
                      ? "bg-primary text-white"
                      : "text-neutral-600 hover:bg-neutral-50"
                  )}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
