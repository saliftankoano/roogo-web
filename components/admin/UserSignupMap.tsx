"use client";

import { useMemo, useState } from "react";
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
  normalizeCountry,
} from "@/lib/countries";

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

const COUNTRY_COORDS: Record<string, [number, number]> = {
  BF: [-1.56, 12.24],
  CI: [-5.55, 7.54],
  ML: [-3.99, 17.57],
  NE: [9.08, 17.61],
  GH: [-1.02, 7.95],
  TG: [0.82, 8.62],
  BJ: [2.31, 9.31],
  SN: [-14.45, 14.5],
  GN: [-10.94, 10.44],
  NG: [8.68, 9.08],
  US: [-98.58, 39.83],
  CA: [-106.35, 56.13],
  BR: [-51.93, -14.24],
  FR: [2.21, 46.23],
  BE: [4.47, 50.5],
  CH: [8.23, 46.82],
  DE: [10.45, 51.17],
  IT: [12.57, 41.87],
  ES: [-3.75, 40.46],
  GB: [-3.44, 55.38],
  NL: [5.29, 52.13],
  SE: [18.64, 60.13],
  NO: [8.47, 60.47],
  PT: [-8.22, 39.4],
  MA: [-7.09, 31.79],
  TN: [9.54, 33.89],
  DZ: [1.66, 28.03],
  CM: [12.35, 7.37],
  GA: [11.61, -0.8],
  CG: [15.83, -0.23],
  CD: [21.76, -4.04],
  AE: [53.85, 23.42],
  SA: [45.08, 23.89],
  CN: [104.2, 35.86],
  JP: [138.25, 36.2],
  IN: [78.96, 20.59],
  AU: [133.78, -25.27],
};

const WORLD_REGIONS = [
  "M150 180 C105 155 62 190 72 242 C82 304 140 315 184 285 C232 253 218 202 150 180Z",
  "M206 326 C184 360 204 410 246 424 C280 436 312 406 304 362 C296 320 234 290 206 326Z",
  "M374 146 C318 154 285 196 302 236 C318 274 382 270 424 252 C470 232 462 158 374 146Z",
  "M420 250 C382 286 386 348 424 386 C456 418 492 394 494 346 C496 294 464 248 420 250Z",
  "M508 162 C464 184 472 228 518 246 C574 268 646 248 684 210 C644 166 566 132 508 162Z",
  "M612 286 C570 304 570 354 618 372 C664 390 712 356 704 314 C696 278 652 268 612 286Z",
  "M658 382 C626 394 620 426 648 440 C682 458 736 440 748 410 C724 382 690 370 658 382Z",
];

function projectWorld([lng, lat]: [number, number]): [number, number] {
  return [((lng + 180) / 360) * 800, ((85 - lat) / 170) * 450];
}

function projectBurkina([lng, lat]: [number, number]): [number, number] {
  const minLng = -5.7;
  const maxLng = 2.6;
  const minLat = 9.2;
  const maxLat = 15.4;
  return [
    ((lng - minLng) / (maxLng - minLng)) * 620 + 90,
    ((maxLat - lat) / (maxLat - minLat)) * 300 + 78,
  ];
}

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

function formatCityName(cityKey: string): string {
  return cityKey
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
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

  const countryBubbles = useMemo(() => {
    return Object.entries(countByAlpha2)
      .map(([alpha2, count]) => ({
        alpha2,
        count,
        coords: COUNTRY_COORDS[alpha2],
        name: ALPHA2_TO_FR[alpha2] ?? alpha2,
      }))
      .filter(
        (entry): entry is {
          alpha2: string;
          count: number;
          coords: [number, number];
          name: string;
        } => Boolean(entry.coords),
      );
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
            <svg
              viewBox="0 0 800 450"
              role="img"
              aria-label={
                view === "world"
                  ? "Carte des inscriptions par pays"
                  : "Carte des inscriptions au Burkina Faso par ville"
              }
              className="h-full w-full"
            >
              <rect width="800" height="450" fill="#FBFAF8" />
              {view === "world" ? (
                <>
                  {WORLD_REGIONS.map((path, index) => (
                    <path
                      key={index}
                      d={path}
                      fill="#EFE8E0"
                      stroke="#FFFFFF"
                      strokeWidth="2"
                    />
                  ))}
                  {countryBubbles.map(({ alpha2, count, coords, name }) => {
                    const [x, y] = projectWorld(coords);
                    const t =
                      maxCountryCount > 0 ? count / maxCountryCount : 0;
                    const radius = 6 + Math.sqrt(t) * 22;
                    return (
                      <g key={alpha2}>
                        <circle
                          cx={x}
                          cy={y}
                          r={radius}
                          fill={colorForCount(count, maxCountryCount)}
                          fillOpacity="0.88"
                          stroke="#FFFFFF"
                          strokeWidth="2"
                          className="cursor-pointer transition-opacity hover:opacity-80"
                          onMouseEnter={(e) =>
                            setTooltip({
                              x: e.clientX,
                              y: e.clientY,
                              title: name,
                              value: count,
                            })
                          }
                          onMouseMove={(e) =>
                            setTooltip((t) =>
                              t ? { ...t, x: e.clientX, y: e.clientY } : t,
                            )
                          }
                          onMouseLeave={() => setTooltip(null)}
                          onClick={() => {
                            if (alpha2 === "BF") setView("burkina");
                          }}
                        />
                        {count > 0 && (
                          <text
                            x={x}
                            y={y + 3}
                            textAnchor="middle"
                            className="pointer-events-none fill-neutral-900 text-[10px] font-black"
                          >
                            {alpha2}
                          </text>
                        )}
                      </g>
                    );
                  })}
                </>
              ) : (
                <>
                  <path
                    d="M135 132 C205 70 322 82 405 118 C492 154 638 124 684 202 C732 286 638 358 516 372 C388 388 302 366 202 326 C112 290 78 196 135 132Z"
                    fill="#FBE8DE"
                    stroke="#F4B28E"
                    strokeWidth="3"
                  />
                  {Object.entries(bfCityCounts).map(([cityKey, count]) => {
                    const coords = BF_CITY_COORDS[cityKey];
                    if (!coords) return null;
                    const [x, y] = projectBurkina(coords);
                    const t = maxCityCount > 0 ? count / maxCityCount : 0;
                    const radius = 5 + Math.sqrt(t) * 16;
                    return (
                      <circle
                        key={cityKey}
                        cx={x}
                        cy={y}
                        r={radius}
                        fill="#D86F45"
                        fillOpacity="0.85"
                        stroke="#FFFFFF"
                        strokeWidth="2"
                        className="cursor-pointer transition-opacity hover:opacity-80"
                        onMouseEnter={(e) =>
                          setTooltip({
                            x: e.clientX,
                            y: e.clientY,
                            title: formatCityName(cityKey),
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
                    );
                  })}
                </>
              )}
            </svg>
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
