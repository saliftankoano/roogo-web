"use client";

import { useMemo, useState } from "react";
import {
  ComposableMap,
  Geographies,
  Geography,
  Marker,
} from "react-simple-maps";
import { motion, AnimatePresence } from "framer-motion";
import {
  GlobeIcon,
  MapPinIcon,
  CalendarIcon,
  CaretDownIcon,
  XIcon,
} from "@phosphor-icons/react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import { Calendar } from "@/components/ui/calendar";
import {
  ALPHA2_TO_FR,
  BF_CITY_COORDS,
  NUMERIC_TO_ALPHA2,
  normalizeCountry,
} from "@/lib/countries";

const TOPO_URL =
  "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

type MapUser = {
  signup_country: string | null;
  signup_city: string | null;
  created_at: string;
};

type DateRangePreset = "today" | "30d" | "all" | "custom";

type Tooltip = {
  x: number;
  y: number;
  title: string;
  value: number;
} | null;

interface Props {
  users: MapUser[];
}

const PRESETS: { id: DateRangePreset; label: string }[] = [
  { id: "today", label: "Aujourd'hui" },
  { id: "30d", label: "30 derniers jours" },
  { id: "all", label: "Tout" },
  { id: "custom", label: "Personnalisé" },
];

function withinRange(
  createdAt: string,
  preset: DateRangePreset,
  custom?: DateRange,
): boolean {
  if (preset === "all") return true;
  const t = new Date(createdAt).getTime();
  const now = Date.now();
  if (preset === "today") {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    return t >= startOfDay.getTime();
  }
  if (preset === "30d") {
    return t >= now - 30 * 24 * 60 * 60 * 1000;
  }
  if (preset === "custom" && custom?.from) {
    const from = custom.from.getTime();
    const to = (custom.to ?? custom.from).getTime() + 24 * 60 * 60 * 1000 - 1;
    return t >= from && t <= to;
  }
  return true;
}

// Log-scaled lerp from a clearly-visible warm sand to terracotta.
// Logs handle the heavy skew of one dominant country (Burkina) without
// crushing low-count countries to near-white. Zero stays pale clay so
// "has users" is always visually distinct from "no users".
function colorForCount(count: number, max: number): string {
  if (count === 0) return "#F5F1ED"; // pale clay — no users
  if (max <= 0) return "#F5F1ED";
  const t = Math.log(count + 1) / Math.log(max + 1);
  // warm sand (#FACDB0) → terracotta (#D86F45)
  const start = [250, 205, 176];
  const end = [216, 111, 69];
  const r = Math.round(start[0] + (end[0] - start[0]) * t);
  const g = Math.round(start[1] + (end[1] - start[1]) * t);
  const b = Math.round(start[2] + (end[2] - start[2]) * t);
  return `rgb(${r}, ${g}, ${b})`;
}

export function UserSignupMap({ users }: Props) {
  const [preset, setPreset] = useState<DateRangePreset>("all");
  const [customRange, setCustomRange] = useState<DateRange | undefined>();
  const [showCalendar, setShowCalendar] = useState(false);
  const [view, setView] = useState<"world" | "burkina">("world");
  const [tooltip, setTooltip] = useState<Tooltip>(null);

  // 1. Filter users by date range
  const filtered = useMemo(
    () => users.filter((u) => withinRange(u.created_at, preset, customRange)),
    [users, preset, customRange],
  );

  // 2. Aggregate counts by country (alpha-2)
  const { countByAlpha2, maxCountryCount, unknownCount } = useMemo(() => {
    const map: Record<string, number> = {};
    let unknown = 0;
    for (const u of filtered) {
      const code = normalizeCountry(u.signup_country);
      if (code) {
        map[code] = (map[code] ?? 0) + 1;
      } else {
        unknown++;
      }
    }
    const max = Math.max(0, ...Object.values(map));
    return { countByAlpha2: map, maxCountryCount: max, unknownCount: unknown };
  }, [filtered]);

  // 3. Aggregate BF users by city (lowercased) for pin rendering
  const { bfCityCounts, maxCityCount, bfTotal, bfUnmapped } = useMemo(() => {
    const counts: Record<string, number> = {};
    let total = 0;
    let unmapped = 0;
    for (const u of filtered) {
      if (normalizeCountry(u.signup_country) !== "BF") continue;
      total++;
      const key = (u.signup_city ?? "").trim().toLowerCase();
      if (key && BF_CITY_COORDS[key]) {
        counts[key] = (counts[key] ?? 0) + 1;
      } else {
        unmapped++;
      }
    }
    const max = Math.max(0, ...Object.values(counts));
    return {
      bfCityCounts: counts,
      maxCityCount: max,
      bfTotal: total,
      bfUnmapped: unmapped,
    };
  }, [filtered]);

  // Top countries chip strip
  const topCountries = useMemo(() => {
    return Object.entries(countByAlpha2)
      .map(([alpha2, count]) => ({
        alpha2,
        name: ALPHA2_TO_FR[alpha2] ?? alpha2,
        count,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }, [countByAlpha2]);

  const totalFiltered = filtered.length;
  const customLabel =
    customRange?.from && customRange?.to
      ? `${format(customRange.from, "d MMM", { locale: fr })} → ${format(customRange.to, "d MMM yyyy", { locale: fr })}`
      : customRange?.from
        ? format(customRange.from, "d MMM yyyy", { locale: fr })
        : "Personnalisé";

  return (
    <section className="relative bg-white rounded-[32px] border border-neutral-100 p-6 md:p-8 overflow-hidden">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl font-black text-neutral-900 tracking-tight">
            Provenance des utilisateurs
          </h2>
          <p className="text-sm text-neutral-500 mt-1">
            {totalFiltered.toLocaleString("fr-FR")} utilisateur
            {totalFiltered === 1 ? "" : "s"} sur la période — d&apos;après
            l&apos;IP de première connexion.
          </p>
        </div>

        {/* View toggle */}
        <div className="flex items-center bg-neutral-100/60 p-1 rounded-full border border-neutral-200/40">
          <button
            type="button"
            onClick={() => setView("world")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${
              view === "world"
                ? "bg-white text-neutral-900 shadow-sm"
                : "text-neutral-500 hover:text-neutral-700"
            }`}
          >
            <GlobeIcon size={14} weight="bold" />
            Monde
          </button>
          <button
            type="button"
            onClick={() => setView("burkina")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${
              view === "burkina"
                ? "bg-white text-neutral-900 shadow-sm"
                : "text-neutral-500 hover:text-neutral-700"
            }`}
          >
            <MapPinIcon size={14} weight="bold" />
            Burkina ({bfTotal})
          </button>
        </div>
      </div>

      {/* Date range pill bar */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        {PRESETS.map((p) => {
          const active = preset === p.id;
          const isCustom = p.id === "custom";
          return (
            <div key={p.id} className="relative">
              <button
                type="button"
                onClick={() => {
                  setPreset(p.id);
                  if (isCustom) setShowCalendar((v) => !v);
                  else setShowCalendar(false);
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-colors border ${
                  active
                    ? "bg-neutral-900 text-white border-neutral-900"
                    : "bg-white text-neutral-600 border-neutral-200 hover:border-neutral-300"
                }`}
              >
                {isCustom && <CalendarIcon size={12} weight="bold" />}
                {isCustom && active ? customLabel : p.label}
                {isCustom && active && <CaretDownIcon size={10} weight="bold" />}
              </button>
              {isCustom && showCalendar && (
                <div className="absolute top-full mt-2 left-0 z-30 bg-white border border-neutral-200 rounded-2xl shadow-xl p-2 max-w-[calc(100vw-2rem)]">
                  <Calendar
                    mode="range"
                    selected={customRange}
                    onSelect={setCustomRange}
                    locale={fr}
                    numberOfMonths={1}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Map area */}
      <div
        className="relative w-full bg-neutral-50/40 rounded-[24px] border border-neutral-100 overflow-hidden"
        onMouseLeave={() => setTooltip(null)}
        style={{ aspectRatio: "16 / 9" }}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={view}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0"
          >
            <ComposableMap
              projectionConfig={
                view === "world"
                  ? { scale: 145, center: [10, 20] }
                  : { scale: 1800, center: [-1.5, 12.3] }
              }
              width={800}
              height={450}
              style={{ width: "100%", height: "100%" }}
              projection="geoMercator"
            >
                <Geographies geography={TOPO_URL}>
                  {({ geographies }) =>
                    geographies.map((geo) => {
                      const id = String(geo.id ?? "").padStart(3, "0");
                      const alpha2 = NUMERIC_TO_ALPHA2[id];
                      const count = alpha2 ? (countByAlpha2[alpha2] ?? 0) : 0;
                      const isBurkina = alpha2 === "BF";
                      const fill =
                        view === "burkina"
                          ? isBurkina
                            ? "#FBE8DE"
                            : "#F7F5F2"
                          : colorForCount(count, maxCountryCount);
                      return (
                        <Geography
                          key={geo.rsmKey}
                          geography={geo}
                          fill={fill}
                          stroke="#FFFFFF"
                          strokeWidth={0.5}
                          onMouseEnter={(e) => {
                            if (view !== "world") return;
                            const name = alpha2
                              ? (ALPHA2_TO_FR[alpha2] ?? alpha2)
                              : ((geo.properties as { name?: string })?.name ??
                                "Inconnu");
                            setTooltip({
                              x: e.clientX,
                              y: e.clientY,
                              title: name,
                              value: count,
                            });
                          }}
                          onMouseMove={(e) =>
                            setTooltip((t) =>
                              t ? { ...t, x: e.clientX, y: e.clientY } : t,
                            )
                          }
                          onMouseLeave={() => setTooltip(null)}
                          style={{
                            default: {
                              outline: "none",
                              transition: "fill 0.2s",
                            },
                            hover: {
                              outline: "none",
                              fill:
                                view === "world" && count > 0
                                  ? "#B45531"
                                  : isBurkina
                                    ? "#F7D2BD"
                                    : "#EDE9E4",
                              cursor:
                                view === "world" && count > 0
                                  ? "pointer"
                                  : "default",
                            },
                            pressed: { outline: "none" },
                          }}
                          onClick={() => {
                            if (view === "world" && isBurkina) {
                              setView("burkina");
                            }
                          }}
                        />
                      );
                    })
                  }
                </Geographies>

                {/* Burkina city pins, only when zoomed in */}
                {view === "burkina" &&
                  Object.entries(bfCityCounts).map(([cityKey, count]) => {
                    const coords = BF_CITY_COORDS[cityKey];
                    if (!coords) return null;
                    const t = maxCityCount > 0 ? count / maxCityCount : 0;
                    const radius = 4 + t * 14;
                    return (
                      <Marker key={cityKey} coordinates={coords}>
                        <circle
                          r={radius}
                          fill="#D86F45"
                          fillOpacity={0.85}
                          stroke="#FFFFFF"
                          strokeWidth={1.5}
                          style={{ cursor: "pointer" }}
                          onMouseEnter={(e) =>
                            setTooltip({
                              x: e.clientX,
                              y: e.clientY,
                              title: cityKey
                                .split(" ")
                                .map(
                                  (w) =>
                                    w.charAt(0).toUpperCase() + w.slice(1),
                                )
                                .join(" "),
                              value: count,
                            })
                          }
                          onMouseMove={(e) =>
                            setTooltip((tt) =>
                              tt ? { ...tt, x: e.clientX, y: e.clientY } : tt,
                            )
                          }
                          onMouseLeave={() => setTooltip(null)}
                        />
                      </Marker>
                    );
                  })}
            </ComposableMap>
          </motion.div>
        </AnimatePresence>

        {/* Burkina view header strip */}
        {view === "burkina" && (
          <div className="absolute top-3 left-3 right-3 flex items-center justify-between bg-white/85 backdrop-blur-sm border border-neutral-100 rounded-full pl-4 pr-2 py-1.5 shadow-sm">
            <p className="text-xs font-bold text-neutral-700">
              Burkina Faso · {bfTotal.toLocaleString("fr-FR")} utilisateur
              {bfTotal === 1 ? "" : "s"}
              {bfUnmapped > 0 && (
                <span className="text-neutral-400 font-medium">
                  {" "}
                  ({bfUnmapped} ville{bfUnmapped === 1 ? "" : "s"} non
                  cartographiée{bfUnmapped === 1 ? "" : "s"})
                </span>
              )}
            </p>
            <button
              type="button"
              onClick={() => setView("world")}
              className="flex items-center gap-1 text-[10px] font-bold text-neutral-500 hover:text-neutral-900 bg-white border border-neutral-200 rounded-full px-2 py-1"
            >
              <XIcon size={10} weight="bold" />
              Retour
            </button>
          </div>
        )}

        {/* Tooltip */}
        {tooltip && (
          <div
            className="pointer-events-none fixed z-40 bg-neutral-900 text-white text-xs font-bold rounded-lg px-3 py-2 shadow-xl"
            style={{
              left: tooltip.x + 12,
              top: tooltip.y + 12,
            }}
          >
            <div className="text-[11px]">{tooltip.title}</div>
            <div className="text-[10px] font-medium text-white/70 mt-0.5">
              {tooltip.value.toLocaleString("fr-FR")} utilisateur
              {tooltip.value === 1 ? "" : "s"}
            </div>
          </div>
        )}
      </div>

      {/* Top countries strip */}
      {topCountries.length > 0 && view === "world" && (
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest mr-1">
            Top pays
          </span>
          {topCountries.map((c) => (
            <span
              key={c.alpha2}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-neutral-50 border border-neutral-100 text-[11px] font-bold text-neutral-700"
            >
              {c.name}
              <span className="text-neutral-400">·</span>
              <span className="text-primary">{c.count}</span>
            </span>
          ))}
          {unknownCount > 0 && (
            <span className="px-2.5 py-1 rounded-full bg-neutral-50 border border-neutral-100 text-[11px] font-bold text-neutral-400">
              Inconnu · {unknownCount}
            </span>
          )}
        </div>
      )}
    </section>
  );
}
