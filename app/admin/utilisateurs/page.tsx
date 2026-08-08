"use client";

import { useState, useMemo, useEffect } from "react";
import { UserGridSkeleton } from "@/components/admin/skeletons";
import { UserSignupMap } from "@/components/admin/UserSignupMap";
import {
  UserIcon,
  PhoneIcon,
  EnvelopeIcon,
  MagnifyingGlassIcon,
  XIcon,
  MapPinIcon,
  CalendarIcon,
  CaretLeftIcon,
  CaretRightIcon,
  CaretDownIcon,
  WhatsappLogoIcon,
  GlobeIcon,
  BriefcaseIcon,
  BuildingsIcon,
  IdentificationCardIcon,
  FunnelIcon,
  HouseIcon,
  ClipboardTextIcon,
  HeartIcon,
  HandshakeIcon,
  DeviceMobileIcon,
  MonitorIcon,
  ClockIcon,
  BellIcon,
  CheckCircleIcon,
  ChairIcon,
  SortAscendingIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/Button";
import ImportExistingLeaseWizard from "@/components/admin/ImportExistingLeaseWizard";
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameDay,
  addMonths,
  subMonths,
  getDay,
  isToday,
} from "date-fns";
import { fr } from "date-fns/locale";
import {
  isOtherReferralSource,
  isSocialReferralSource,
} from "@/lib/acquisition-source";

interface UserProfile {
  id: string;
  clerk_id: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  user_type: string;
  company_name: string | null;
  professional_link: string | null;
  whatsapp: string | null;
  preferred_city: string | null;
  budget_max: number | null;
  service_areas: string[] | null;
  portfolio_size: string | null;
  referral_source: string | null;
  preferences: Record<string, unknown>;
  created_at: string;
  // Signup geo (write-once, sourced from Clerk session geoIP)
  signup_city: string | null;
  signup_country: string | null;
  signup_ip: string | null;
  signup_captured_at: string | null;
  signup_device_type: string | null;
  signup_device_is_mobile: boolean | null;
  signup_browser_name: string | null;
  signup_browser_version: string | null;
  // Activity counts
  properties_count: number;
  applications_count: number;
  agreements_renter_count: number;
  agreements_owner_count: number;
  favorites_count: number;
  // Clerk metadata
  signup_platform: string | null;
  signup_device_label: string;
  has_completed_mobile_onboarding: boolean;
  has_completed_web_onboarding: boolean;
  has_completed_onboarding: boolean;
  web_onboarding_step: number | null;
  onboarding_source: string | null;
  owner_followup_reasons: string[];
  // Renter onboarding
  onboarding_rooms: string | null;
  onboarding_budget: number | null;
  onboarding_furnished: string | null;
  onboarding_move_in_urgency: string | null;
  onboarding_property_types: string[];
  onboarding_location: string | null;
  onboarding_notifications_new_listings: boolean | null;
  // Owner onboarding
  onboarding_property_city: string | null;
  onboarding_property_available: string | null;
  onboarding_notifications_messages: boolean | null;
  onboarding_notifications_payments: boolean | null;
  onboarding_notifications_viewing_requests: boolean | null;
  // Agent onboarding (inside mobileOnboardingData)
  onboarding_service_areas: string[];
  onboarding_portfolio_size: string | null;
  onboarding_referral_source: string | null;
  onboarding_social_platform: string | null;
  onboarding_referral_source_detail: string | null;
  // Agent top-level Clerk private metadata
  clerk_company_name: string | null;
  clerk_professional_link: string | null;
}

// ─── Engagement status ────────────────────────────────────────────────────────

type EngagementStatus = "nouveau" | "inactif" | "actif" | "accord";
type PriorityLevel = "urgent" | "watch" | "normal";

const STATUS_CONFIG: Record<
  EngagementStatus,
  { label: string; badge: string; dot: string }
> = {
  nouveau: {
    label: "Nouveau",
    badge: "bg-blue-100 text-blue-700 border-blue-200",
    dot: "bg-blue-400",
  },
  actif: {
    label: "Actif",
    badge: "bg-green-100 text-green-700 border-green-200",
    dot: "bg-green-400",
  },
  inactif: {
    label: "Inactif",
    badge: "bg-neutral-100 text-neutral-500 border-neutral-200",
    dot: "bg-neutral-300",
  },
  accord: {
    label: "Accord",
    badge: "bg-purple-100 text-purple-700 border-purple-200",
    dot: "bg-purple-400",
  },
};

const PRIORITY_CONFIG: Record<
  PriorityLevel,
  {
    label: string;
    icon: "warning" | "clock" | "check";
    marker: string;
    card: string;
    chip: string;
    callout: string;
    iconText: string;
    intentBorder: string;
  }
> = {
  urgent: {
    label: "À relancer",
    icon: "warning",
    marker: "bg-rose-500",
    card: "border-rose-200 hover:border-rose-300 hover:shadow-rose-100/70",
    chip: "bg-rose-50 border-rose-100 text-rose-700",
    callout: "bg-rose-50 border-rose-100 text-rose-700",
    iconText: "text-rose-500",
    intentBorder: "border-rose-200",
  },
  watch: {
    label: "À suivre",
    icon: "clock",
    marker: "bg-amber-400",
    card: "border-amber-200 hover:border-amber-300 hover:shadow-amber-100/60",
    chip: "bg-amber-50 border-amber-100 text-amber-700",
    callout: "bg-amber-50 border-amber-100 text-amber-800",
    iconText: "text-amber-500",
    intentBorder: "border-amber-200",
  },
  normal: {
    label: "Stable",
    icon: "check",
    marker: "bg-neutral-300",
    card: "border-neutral-100 hover:border-neutral-200",
    chip: "bg-neutral-50 border-neutral-100 text-neutral-600",
    callout: "bg-neutral-50 border-neutral-100 text-neutral-600",
    iconText: "text-neutral-400",
    intentBorder: "border-neutral-200",
  },
};

const INTENT_STYLE = {
  bg: "bg-white",
  border: "border-neutral-200",
  label: "text-neutral-400",
  text: "text-neutral-900",
  leftBorder: "border-neutral-200",
};

function getIntentStyle() {
  return INTENT_STYLE;
}

const URGENCY_FR: Record<string, string> = {
  "Just browsing": "Je regarde seulement",
  "This month": "Ce mois-ci",
  "Immediately": "Immédiatement",
  "In 2-3 months": "Dans 2-3 mois",
  "In 3-6 months": "Dans 3-6 mois",
  "Next month": "Le mois prochain",
};

const FURNISHED_FR: Record<string, string> = {
  "No preference": "Aucune préférence",
  "Furnished": "Meublé",
  "Unfurnished": "Non meublé",
  "Semi-furnished": "Semi-meublé",
};

const REGION_NAMES_FR = new Intl.DisplayNames(["fr"], { type: "region" });

function formatSignupLocation(u: {
  signup_city: string | null;
  signup_country: string | null;
}): string | null {
  if (!u.signup_city && !u.signup_country) return null;
  let country: string | null = null;
  if (u.signup_country) {
    try {
      country = REGION_NAMES_FR.of(u.signup_country) ?? u.signup_country;
    } catch {
      country = u.signup_country;
    }
  }
  return [u.signup_city, country].filter(Boolean).join(", ");
}

function getEffectiveReferralSource(user: UserProfile) {
  return user.onboarding_referral_source || user.referral_source || null;
}

function getReferralSourceDisplay(user: UserProfile) {
  const source = getEffectiveReferralSource(user);
  if (!source) return null;
  const detail = isSocialReferralSource(source)
    ? user.onboarding_social_platform
    : isOtherReferralSource(source)
      ? user.onboarding_referral_source_detail
      : null;
  return detail ? `${source} · ${detail}` : source;
}

function getEngagementStatus(user: UserProfile): EngagementStatus {
  if ((user.agreements_renter_count ?? 0) + (user.agreements_owner_count ?? 0) > 0)
    return "accord";
  const hasActivity =
    (user.applications_count ?? 0) > 0 ||
    (user.properties_count ?? 0) > 0 ||
    (user.favorites_count ?? 0) > 0;
  if (hasActivity) return "actif";
  const daysSince = Math.floor(
    (Date.now() - new Date(user.created_at).getTime()) / 86400000
  );
  return daysSince <= 7 ? "nouveau" : "inactif";
}

function getIntentSummary(user: UserProfile): string {
  const parts: string[] = [];
  const shortCity = (c: string | null | undefined) =>
    c ? (c === "Ouagadougou" ? "Ouaga" : c) : null;

  if (user.user_type === "renter") {
    const types = user.onboarding_property_types ?? [];
    parts.push(types.length > 0 ? `Cherche ${types.slice(0, 2).join(" / ")}` : "Cherche un bien");
    const city = shortCity(user.onboarding_location || user.preferred_city);
    if (city) parts.push(city);
    const budget = user.onboarding_budget ?? user.budget_max;
    if (budget) parts.push(`${budget.toLocaleString()} F/mois`);
    if (user.onboarding_move_in_urgency) parts.push(user.onboarding_move_in_urgency);
    if (user.onboarding_rooms) parts.push(`${user.onboarding_rooms} pièces`);
    return parts.join(" · ");
  }

  if (user.user_type === "owner") {
    parts.push("Propriétaire");
    const city = shortCity(user.onboarding_property_city || user.preferred_city);
    if (city) parts.push(city);
    if (user.properties_count > 0) {
      parts.push(`${user.properties_count} bien${user.properties_count > 1 ? "s" : ""} publié${user.properties_count > 1 ? "s" : ""}`);
    } else {
      parts.push("aucun bien publié");
    }
    if (user.onboarding_property_available) parts.push(`Dispo: ${user.onboarding_property_available}`);
    return parts.join(" · ");
  }

  if (user.user_type === "agent") {
    const company = user.clerk_company_name || user.company_name;
    parts.push(company || "Agent indépendant");
    const areas = user.onboarding_service_areas?.length > 0
      ? user.onboarding_service_areas
      : user.service_areas ?? [];
    if (areas.length > 0) parts.push(`Zone: ${areas.slice(0, 2).join(", ")}`);
    if (user.properties_count > 0) {
      parts.push(`${user.properties_count} bien${user.properties_count > 1 ? "s" : ""}`);
    } else {
      parts.push("aucun bien publié");
    }
    const portfolio = user.onboarding_portfolio_size || user.portfolio_size;
    if (portfolio) parts.push(`Portfolio: ${portfolio}`);
    return parts.join(" · ");
  }

  return "Profil en cours de configuration";
}

function getSuggestedAction(
  user: UserProfile,
  status: EngagementStatus
): { text: string; urgent: boolean } {
  const hasUrgentTimeline = (s: string | null | undefined) =>
    !!(
      s &&
      (s.toLowerCase().includes("immédiat") ||
        s.toLowerCase().includes("1 mois") ||
        s.toLowerCase().includes("urgent"))
    );

  if (user.user_type === "renter") {
    if (status === "accord") return { text: "Locataire confirmé", urgent: false };
    if (status === "actif") return { text: "Candidature(s) en cours — suivre", urgent: false };
    if (status === "inactif") return { text: "Relancer — n'a pas encore candidaté", urgent: false };
    if (hasUrgentTimeline(user.onboarding_move_in_urgency))
      return { text: "Contacter maintenant — délai court", urgent: true };
    return { text: "Prendre contact pour qualifier", urgent: false };
  }

  if (user.user_type === "owner") {
    if (status === "accord") return { text: "Bail actif", urgent: false };
    if (status === "actif" && user.agreements_owner_count === 0)
      return { text: "Proposer des mises en relation", urgent: false };
    if (status === "inactif") return { text: "Relancer — bien non mis en avant", urgent: false };
    if (user.properties_count === 0)
      return { text: "Accompagner à publier son bien", urgent: true };
    return { text: "Partenaire propriétaire actif", urgent: false };
  }

  if (user.user_type === "agent") {
    if (status === "accord") return { text: "Agent confirmé", urgent: false };
    if (status === "actif") return { text: "Partenaire actif", urgent: false };
    if (status === "inactif") return { text: "Relancer l'agent", urgent: false };
    if (user.properties_count === 0)
      return { text: "Onboarder — aucun bien publié", urgent: true };
    return { text: "Prendre contact pour qualifier", urgent: false };
  }

  return { text: "Profil à compléter", urgent: false };
}

function getUserPriority(
  user: UserProfile,
  status: EngagementStatus,
  action: { text: string; urgent: boolean }
): PriorityLevel {
  if (action.urgent || user.owner_followup_reasons.length > 0) return "urgent";
  if (status === "inactif" || status === "nouveau") return "watch";
  if (
    (user.user_type === "owner" || user.user_type === "agent") &&
    user.properties_count === 0
  ) {
    return "watch";
  }
  if (getProfileCompleteness(user) !== "complete") return "watch";
  return "normal";
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PROPERTY_TYPE_OPTIONS = ["Appartement", "Villa", "Maison", "Terrain", "Célibatorium"];

const userTypeLabels: Record<string, string> = {
  renter: "Locataire",
  owner: "Propriétaire",
  agent: "Agent",
  staff: "Staff",
  founder: "Fondateur",
};

const userTypeColors: Record<string, string> = {
  renter: "bg-sky-50 text-sky-700 border-sky-200",
  owner: "bg-orange-50 text-orange-700 border-orange-200",
  agent: "bg-neutral-50 text-neutral-600 border-neutral-200",
  staff: "bg-neutral-100 text-neutral-700 border-neutral-200",
  founder: "bg-neutral-100 text-neutral-700 border-neutral-200",
};

function getProfileCompleteness(u: UserProfile): "complete" | "partial" | "none" {
  if (u.phone && u.whatsapp && u.has_completed_onboarding) return "complete";
  if (u.phone || u.whatsapp) return "partial";
  return "none";
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function FilterSelect({
  value,
  onChange,
  children,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
  label: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest pl-1">
        {label}
      </span>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full text-sm font-bold bg-white border border-neutral-100 rounded-2xl pl-4 pr-9 py-3 text-neutral-700 focus:outline-none focus:ring-2 focus:ring-primary/10 focus:border-primary/20 appearance-none cursor-pointer shadow-sm"
        >
          {children}
        </select>
        <CaretDownIcon
          className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none"
          size={14}
          weight="bold"
        />
      </div>
    </div>
  );
}

function NotifDot({ on }: { on: boolean | null }) {
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full ${on ? "bg-green-400" : "bg-neutral-200"}`}
    />
  );
}

function PriorityIcon({
  level,
  size = 12,
  className = "",
}: {
  level: PriorityLevel;
  size?: number;
  className?: string;
}) {
  const config = PRIORITY_CONFIG[level];
  if (config.icon === "warning") {
    return <WarningCircleIcon size={size} weight="fill" className={className} />;
  }
  if (config.icon === "clock") {
    return <ClockIcon size={size} weight="bold" className={className} />;
  }
  return <CheckCircleIcon size={size} weight="fill" className={className} />;
}

// ─── Page component ───────────────────────────────────────────────────────────

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [importLeaseUser, setImportLeaseUser] = useState<UserProfile | null>(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [userTypeFilter, setUserTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortOrder, setSortOrder] = useState<"recent" | "urgent" | "inactive">("recent");
  const [ownerFollowupOnly, setOwnerFollowupOnly] = useState(false);
  // Advanced filter states
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [cityFilter, setCityFilter] = useState<string>("all");
  const [referralFilter, setReferralFilter] = useState<string>("all");
  const [platformFilter, setPlatformFilter] = useState<string>("all");
  const [whatsappFilter, setWhatsappFilter] = useState<string>("all");
  const [budgetFilter, setBudgetFilter] = useState<string>("all");
  const [urgencyFilter, setUrgencyFilter] = useState<string>("all");
  const [propertyTypesFilter, setPropertyTypesFilter] = useState<string[]>([]);
  const [hasPropertiesFilter, setHasPropertiesFilter] = useState<string>("all");
  const [copiedUserId, setCopiedUserId] = useState<string | null>(null);

  useEffect(() => {
    async function loadUsers() {
      try {
        const response = await fetch("/api/users/all");
        if (response.ok) {
          const data = await response.json();
          setUsers(data.users);
        } else {
          console.error("Failed to load users:", response.status, await response.text());
        }
      } catch (error) {
        console.error("Error loading users:", error);
      } finally {
        setLoading(false);
      }
    }
    loadUsers();
  }, []);

  const referralSources = useMemo(() => {
    const sources = new Set(
      users.map(getEffectiveReferralSource).filter((s): s is string => !!s)
    );
    return Array.from(sources).sort();
  }, [users]);

  const urgencyValues = useMemo(() => {
    const values = new Set(
      users
        .map((u) => u.onboarding_move_in_urgency || u.onboarding_property_available)
        .filter((v): v is string => !!v)
    );
    return Array.from(values).sort();
  }, [users]);

  const activeFiltersCount = useMemo(() => {
    return [
      cityFilter !== "all",
      referralFilter !== "all",
      platformFilter !== "all",
      whatsappFilter !== "all",
      budgetFilter !== "all",
      urgencyFilter !== "all",
      propertyTypesFilter.length > 0,
      hasPropertiesFilter !== "all",
    ].filter(Boolean).length;
  }, [
    cityFilter,
    referralFilter,
    platformFilter,
    whatsappFilter,
    budgetFilter,
    urgencyFilter,
    propertyTypesFilter,
    hasPropertiesFilter,
  ]);

  const filteredUsers = useMemo(() => {
    return users.filter((user) => {
      const matchesSearch =
        (user.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false) ||
        (user.email?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false) ||
        (user.phone?.includes(searchQuery) ?? false);

      const matchesType = userTypeFilter === "all" || user.user_type === userTypeFilter;
      const matchesOwnerFollowup =
        !ownerFollowupOnly || user.owner_followup_reasons.length > 0;

      const matchesStatus =
        statusFilter === "all" || getEngagementStatus(user) === statusFilter;

      const matchesDay = !selectedDay || isSameDay(new Date(user.created_at), selectedDay);

      const userCity =
        user.preferred_city || user.onboarding_location || user.onboarding_property_city;
      const matchesCity = cityFilter === "all" || userCity === cityFilter;

      const matchesReferral =
        referralFilter === "all" ||
        getEffectiveReferralSource(user) === referralFilter;

      const matchesPlatform =
        platformFilter === "all" || user.signup_platform === platformFilter;

      const matchesWhatsapp =
        whatsappFilter === "all" ||
        (whatsappFilter === "with" && !!user.whatsapp) ||
        (whatsappFilter === "without" && !user.whatsapp);

      const budget = user.onboarding_budget ?? user.budget_max ?? null;
      const matchesBudget =
        budgetFilter === "all" ||
        (budgetFilter === "<50k" && budget !== null && budget < 50000) ||
        (budgetFilter === "50-100k" && budget !== null && budget >= 50000 && budget < 100000) ||
        (budgetFilter === "100-200k" && budget !== null && budget >= 100000 && budget < 200000) ||
        (budgetFilter === "200k+" && budget !== null && budget >= 200000);

      const urgency = user.onboarding_move_in_urgency || user.onboarding_property_available;
      const matchesUrgency = urgencyFilter === "all" || urgency === urgencyFilter;

      const matchesPropertyTypes =
        propertyTypesFilter.length === 0 ||
        propertyTypesFilter.some((t) => user.onboarding_property_types?.includes(t));

      const matchesHasProperties =
        hasPropertiesFilter === "all" ||
        (hasPropertiesFilter === "with" && (user.properties_count ?? 0) > 0) ||
        (hasPropertiesFilter === "without" && (user.properties_count ?? 0) === 0);

      return (
        matchesSearch &&
        matchesType &&
        matchesOwnerFollowup &&
        matchesStatus &&
        matchesDay &&
        matchesCity &&
        matchesReferral &&
        matchesPlatform &&
        matchesWhatsapp &&
        matchesBudget &&
        matchesUrgency &&
        matchesPropertyTypes &&
        matchesHasProperties
      );
    });
  }, [
    users,
    searchQuery,
    userTypeFilter,
    ownerFollowupOnly,
    statusFilter,
    selectedDay,
    cityFilter,
    referralFilter,
    platformFilter,
    whatsappFilter,
    budgetFilter,
    urgencyFilter,
    propertyTypesFilter,
    hasPropertiesFilter,
  ]);

  const sortedUsers = useMemo(() => {
    if (sortOrder === "recent") return filteredUsers;

    if (sortOrder === "urgent") {
      const urgencyScore = (u: UserProfile) => {
        const s = (u.onboarding_move_in_urgency || u.onboarding_property_available || "").toLowerCase();
        if (s.includes("immédiat")) return 3;
        if (s.includes("1 mois")) return 2;
        if (s.includes("3 mois")) return 1;
        return 0;
      };
      return [...filteredUsers].sort((a, b) => urgencyScore(b) - urgencyScore(a));
    }

    if (sortOrder === "inactive") {
      const order: Record<EngagementStatus, number> = { inactif: 0, nouveau: 1, actif: 2, accord: 3 };
      return [...filteredUsers].sort(
        (a, b) => order[getEngagementStatus(a)] - order[getEngagementStatus(b)]
      );
    }

    return filteredUsers;
  }, [filteredUsers, sortOrder]);

  // KPI summary stats (global, not filtered)
  const kpiStats = useMemo(() => {
    const total = users.length;
    const renters = users.filter((u) => u.user_type === "renter").length;
    const owners = users.filter((u) => u.user_type === "owner").length;
    const agents = users.filter((u) => u.user_type === "agent").length;
    const ownerFollowups = users.filter(
      (u) => u.owner_followup_reasons.length > 0
    ).length;
    const active = users.filter((u) => {
      const s = getEngagementStatus(u);
      return s === "actif" || s === "accord";
    }).length;
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    const newThisWeek = users.filter((u) => new Date(u.created_at) >= oneWeekAgo).length;
    return { total, renters, owners, agents, ownerFollowups, active, newThisWeek };
  }, [users]);

  // Calendar logic
  const daysInMonth = useMemo(
    () =>
      eachDayOfInterval({
        start: startOfMonth(currentMonth),
        end: endOfMonth(currentMonth),
      }),
    [currentMonth]
  );

  const signupCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    users.forEach((user) => {
      const dateStr = format(new Date(user.created_at), "yyyy-MM-dd");
      counts[dateStr] = (counts[dateStr] || 0) + 1;
    });
    return counts;
  }, [users]);

  const maxSignups = useMemo(() => {
    const values = Object.values(signupCounts);
    return values.length > 0 ? Math.max(...values) : 0;
  }, [signupCounts]);

  const getIntensity = (date: Date) => {
    const count = signupCounts[format(date, "yyyy-MM-dd")] || 0;
    if (count === 0) return "bg-neutral-50 text-neutral-400";
    if (maxSignups === 0) return "bg-primary/10 text-primary";
    const ratio = count / maxSignups;
    if (ratio <= 0.3) return "bg-primary/10 text-primary";
    if (ratio <= 0.6) return "bg-primary/30 text-primary-dark";
    return "bg-primary text-white";
  };

  async function handleCopyPhone(e: React.MouseEvent, user: UserProfile) {
    e.stopPropagation();
    if (!user.phone) return;
    try {
      await navigator.clipboard.writeText(user.phone);
      setCopiedUserId(user.id);
      setTimeout(() => setCopiedUserId(null), 2000);
    } catch {
      // clipboard API unavailable — silently ignore
    }
  }

  function resetAllFilters() {
    setSearchQuery("");
    setUserTypeFilter("all");
    setStatusFilter("all");
    setOwnerFollowupOnly(false);
    setSortOrder("recent");
    setSelectedDay(null);
    setCityFilter("all");
    setReferralFilter("all");
    setPlatformFilter("all");
    setWhatsappFilter("all");
    setBudgetFilter("all");
    setUrgencyFilter("all");
    setPropertyTypesFilter([]);
    setHasPropertiesFilter("all");
  }

  function togglePropertyType(type: string) {
    setPropertyTypesFilter((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  }

  return (
    <div className="space-y-12 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-4xl font-black text-neutral-900 tracking-tight">
            Analyses
          </h1>
          <p className="text-neutral-500 font-medium mt-2">
            Qui sont vos utilisateurs, d&apos;où viennent-ils, et que faire maintenant.
          </p>
        </div>
        <div className="relative w-full md:w-96">
          <MagnifyingGlassIcon
            className="absolute left-5 top-1/2 -translate-y-1/2 text-neutral-400"
            size={22}
            weight="bold"
          />
          <input
            type="text"
            placeholder="Nom, email ou téléphone..."
            className="w-full pl-14 pr-6 py-5 bg-white rounded-[24px] border border-neutral-100 shadow-sm focus:ring-4 focus:ring-primary/5 focus:border-primary/20 outline-none transition-all text-[16px] font-medium"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Total */}
        <div className="bg-white rounded-2xl p-5 border border-neutral-100 shadow-sm">
          <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-2">
            Utilisateurs
          </p>
          <p className="text-3xl font-black text-neutral-900 tracking-tight leading-none">
            {kpiStats.total}
          </p>
          <p className="text-xs font-bold text-neutral-400 mt-1.5">
            {filteredUsers.length !== kpiStats.total && (
              <span className="text-primary">{filteredUsers.length} filtrés · </span>
            )}
            inscrits au total
          </p>
        </div>

        {/* Type breakdown */}
        <div className="bg-white rounded-2xl p-5 border border-neutral-100 shadow-sm">
          <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-2">
            Profils
          </p>
          <div className="flex items-end gap-1 h-8 mb-2">
            {kpiStats.total > 0 && (
              <>
                <div
                  className="bg-blue-400 rounded-sm transition-all"
                  style={{ width: `${(kpiStats.renters / kpiStats.total) * 100}%`, height: "100%" }}
                  title={`${kpiStats.renters} locataires`}
                />
                <div
                  className="bg-amber-400 rounded-sm transition-all"
                  style={{ width: `${(kpiStats.owners / kpiStats.total) * 100}%`, height: "80%" }}
                  title={`${kpiStats.owners} propriétaires`}
                />
                <div
                  className="bg-emerald-400 rounded-sm transition-all"
                  style={{ width: `${(kpiStats.agents / kpiStats.total) * 100}%`, height: "60%" }}
                  title={`${kpiStats.agents} agents`}
                />
              </>
            )}
          </div>
          <div className="flex items-center gap-3 text-[10px] font-black uppercase tracking-wide">
            <span className="text-blue-500 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 inline-block" />
              {kpiStats.renters} loc.
            </span>
            <span className="text-amber-500 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
              {kpiStats.owners} prop.
            </span>
            <span className="text-emerald-500 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
              {kpiStats.agents} ag.
            </span>
          </div>
        </div>

        {/* Active */}
        <div className="bg-white rounded-2xl p-5 border border-neutral-100 shadow-sm">
          <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-2">
            Engagés
          </p>
          <p className="text-3xl font-black text-neutral-900 tracking-tight leading-none">
            {kpiStats.active}
          </p>
          <div className="flex items-center gap-2 mt-1.5">
            <div className="flex-1 h-1.5 rounded-full bg-neutral-100 overflow-hidden">
              <div
                className="h-full bg-green-400 rounded-full transition-all"
                style={{ width: kpiStats.total > 0 ? `${(kpiStats.active / kpiStats.total) * 100}%` : "0%" }}
              />
            </div>
            <span className="text-[10px] font-black text-neutral-400">
              {kpiStats.total > 0 ? Math.round((kpiStats.active / kpiStats.total) * 100) : 0}%
            </span>
          </div>
        </div>

        {/* Owner follow-up */}
        <button
          type="button"
          onClick={() => {
            setOwnerFollowupOnly((value) => !value);
            setUserTypeFilter("all");
          }}
          className={`text-left rounded-2xl p-5 border shadow-sm transition-all ${
            ownerFollowupOnly
              ? "bg-rose-50 border-rose-200 ring-2 ring-rose-200"
              : "bg-white border-neutral-100 hover:border-rose-200"
          }`}
        >
          <p className="text-[10px] font-black text-rose-600 uppercase tracking-widest mb-2">
            Propriétaires à relancer
          </p>
          <p className="text-3xl font-black text-rose-700 tracking-tight leading-none">
            {kpiStats.ownerFollowups}
          </p>
          <p className="text-xs font-bold text-neutral-400 mt-1.5">
            onboarding ou contact incomplet
          </p>
        </button>

        {/* New this week */}
        <div className="bg-white rounded-2xl p-5 border border-neutral-100 shadow-sm">
          <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-2">
            Cette semaine
          </p>
          <p className="text-3xl font-black text-primary tracking-tight leading-none">
            +{kpiStats.newThisWeek}
          </p>
          <p className="text-xs font-bold text-neutral-400 mt-1.5">
            nouveaux inscrits
          </p>
        </div>
      </div>

      {/* Calendar Heatmap */}
      <div className="bg-white p-8 rounded-[40px] border border-neutral-100 shadow-sm">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
              <CalendarIcon size={24} weight="bold" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-neutral-900 capitalize">
                {format(currentMonth, "MMMM yyyy", { locale: fr })}
              </h2>
              <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest">
                Calendrier des inscriptions
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
              className="p-3 hover:bg-neutral-50 rounded-xl transition-colors border border-neutral-100"
            >
              <CaretLeftIcon size={20} weight="bold" />
            </button>
            <button
              onClick={() => setCurrentMonth(new Date())}
              className="px-4 py-2 text-sm font-bold text-neutral-600 hover:bg-neutral-50 rounded-xl transition-colors"
            >
              Aujourd&apos;hui
            </button>
            <button
              onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
              className="p-3 hover:bg-neutral-50 rounded-xl transition-colors border border-neutral-100"
            >
              <CaretRightIcon size={20} weight="bold" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-2">
          {["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"].map((day) => (
            <div
              key={day}
              className="text-center text-[11px] font-black text-neutral-400 uppercase tracking-widest mb-2"
            >
              {day}
            </div>
          ))}
          {Array.from({ length: getDay(startOfMonth(currentMonth)) }).map((_, i) => (
            <div key={`empty-${i}`} />
          ))}
          {daysInMonth.map((day) => {
            const dateStr = format(day, "yyyy-MM-dd");
            const count = signupCounts[dateStr] || 0;
            const isSelected = selectedDay && isSameDay(day, selectedDay);
            return (
              <button
                key={dateStr}
                onClick={() => setSelectedDay(isSelected ? null : day)}
                className={`
                  relative h-14 sm:h-20 rounded-2xl flex flex-col items-center justify-center transition-all group
                  ${getIntensity(day)}
                  ${isSelected ? "ring-4 ring-primary/20 scale-95 z-10" : "hover:scale-105"}
                  ${isToday(day) ? "border-2 border-primary/30" : "border border-transparent"}
                `}
              >
                <span className="text-sm font-bold">{format(day, "d")}</span>
                {count > 0 && (
                  <span
                    className={`text-[10px] font-black mt-1 ${count > maxSignups * 0.6 ? "text-white/80" : "text-primary/60"}`}
                  >
                    {count}
                  </span>
                )}
                {isToday(day) && (
                  <div className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-primary" />
                )}
              </button>
            );
          })}
        </div>

        {selectedDay && (
          <div className="mt-6 flex items-center justify-between p-4 bg-primary/5 rounded-2xl border border-primary/10">
            <p className="text-sm font-bold text-primary">
              Filtré par date : {format(selectedDay, "d MMMM yyyy", { locale: fr })}
            </p>
            <button
              onClick={() => setSelectedDay(null)}
              className="text-xs font-black text-primary uppercase tracking-wider hover:underline"
            >
              Effacer le filtre
            </button>
          </div>
        )}
      </div>

      {/* Signup geography map */}
      <UserSignupMap users={users} />

      {/* Filters & Stats */}
      <div className="space-y-4">
        {/* Type pills */}
        <div className="flex flex-wrap gap-2">
          {["all", "renter", "owner", "agent", "staff"].map((type) => (
            <button
              key={type}
              onClick={() => setUserTypeFilter(type)}
              className={`
                px-6 py-3 rounded-full text-sm font-bold transition-all border
                ${
                  userTypeFilter === type
                    ? "bg-neutral-900 text-white border-neutral-900 shadow-lg shadow-black/10"
                    : "bg-white text-neutral-500 border-neutral-100 hover:border-neutral-200"
                }
              `}
            >
              {type === "all" ? "Tous" : userTypeLabels[type] || type}
            </button>
          ))}
        </div>

        {/* Status pills */}
        <div className="flex flex-wrap gap-2 items-center">
          {(["all", "nouveau", "actif", "inactif", "accord"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`
                px-5 py-2 rounded-full text-xs font-black uppercase tracking-wider transition-all border
                ${
                  statusFilter === s
                    ? s === "all"
                      ? "bg-neutral-900 text-white border-neutral-900"
                      : `${STATUS_CONFIG[s].badge} border font-black`
                    : "bg-white text-neutral-400 border-neutral-100 hover:border-neutral-200"
                }
                ${statusFilter === s && s !== "all" ? "ring-2 ring-offset-1 ring-current/30" : ""}
              `}
            >
              {s === "all" ? "Tous les statuts" : STATUS_CONFIG[s].label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setOwnerFollowupOnly((value) => !value)}
            className={`px-5 py-2 rounded-full text-xs font-black uppercase tracking-wider transition-all border flex items-center gap-1.5 ${
              ownerFollowupOnly
                ? "bg-rose-50 text-rose-700 border-rose-200 ring-2 ring-rose-100"
                : "bg-white text-neutral-400 border-neutral-100 hover:border-rose-200 hover:text-rose-600"
            }`}
          >
            <WarningCircleIcon size={13} weight="fill" />
            Propriétaires à relancer
          </button>
        </div>

        {/* Sort + advanced filter toggle + counts */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {/* Sort control */}
            <div className="relative flex items-center gap-2">
              <SortAscendingIcon size={16} weight="bold" className="text-neutral-400" />
              <div className="relative">
                <select
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value as typeof sortOrder)}
                  className="text-sm font-bold bg-white border border-neutral-100 rounded-2xl pl-4 pr-9 py-3 text-neutral-700 focus:outline-none focus:ring-2 focus:ring-primary/10 appearance-none cursor-pointer shadow-sm"
                >
                  <option value="recent">Plus récents</option>
                  <option value="urgent">Plus urgents</option>
                  <option value="inactive">Sans activité en premier</option>
                </select>
                <CaretDownIcon
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none"
                  size={14}
                  weight="bold"
                />
              </div>
            </div>

            <button
              onClick={() => setFiltersOpen((o) => !o)}
              className={`
                flex items-center gap-2.5 px-5 py-3 rounded-2xl text-sm font-bold transition-all border relative
                ${
                  filtersOpen || activeFiltersCount > 0
                    ? "bg-neutral-900 text-white border-neutral-900 shadow-lg shadow-black/10"
                    : "bg-white text-neutral-600 border-neutral-100 hover:border-neutral-200"
                }
              `}
            >
              <FunnelIcon size={18} weight="bold" />
              Filtres avancés
              {activeFiltersCount > 0 && (
                <span className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-primary text-white text-[10px] font-black flex items-center justify-center border-2 border-white">
                  {activeFiltersCount}
                </span>
              )}
            </button>
          </div>

          <div className="flex items-center gap-6 text-sm font-bold">
            <div className="flex flex-col items-end">
              <span className="text-neutral-400 uppercase tracking-widest text-[10px]">Total</span>
              <span className="text-neutral-900 text-lg">{users.length}</span>
            </div>
            <div className="w-px h-8 bg-neutral-100" />
            <div className="flex flex-col items-end">
              <span className="text-neutral-400 uppercase tracking-widest text-[10px]">Filtré</span>
              <span className="text-primary text-lg">{sortedUsers.length}</span>
            </div>
          </div>
        </div>

        {/* Advanced filter panel */}
        <AnimatePresence>
          {filtersOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="bg-white rounded-[32px] border border-neutral-100 shadow-sm p-8 space-y-8">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                  <FilterSelect value={cityFilter} onChange={setCityFilter} label="Ville">
                    <option value="all">Toutes les villes</option>
                    <option value="Ouagadougou">Ouagadougou</option>
                    <option value="Bobo-Dioulasso">Bobo-Dioulasso</option>
                  </FilterSelect>

                  <FilterSelect
                    value={referralFilter}
                    onChange={setReferralFilter}
                    label={"Source d'acquisition"}
                  >
                    <option value="all">Toutes les sources</option>
                    {referralSources.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </FilterSelect>

                  <FilterSelect value={platformFilter} onChange={setPlatformFilter} label="Plateforme">
                    <option value="all">Toutes les plateformes</option>
                    <option value="mobile">Mobile</option>
                    <option value="web">Web</option>
                  </FilterSelect>

                  <FilterSelect value={whatsappFilter} onChange={setWhatsappFilter} label="WhatsApp">
                    <option value="all">Tous</option>
                    <option value="with">Avec WhatsApp</option>
                    <option value="without">Sans WhatsApp</option>
                  </FilterSelect>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                  <FilterSelect
                    value={budgetFilter}
                    onChange={setBudgetFilter}
                    label="Budget locataire"
                  >
                    <option value="all">Tous les budgets</option>
                    <option value="<50k">Moins de 50 000 F</option>
                    <option value="50-100k">50 000 – 100 000 F</option>
                    <option value="100-200k">100 000 – 200 000 F</option>
                    <option value="200k+">Plus de 200 000 F</option>
                  </FilterSelect>

                  <FilterSelect
                    value={urgencyFilter}
                    onChange={setUrgencyFilter}
                    label="Urgence / Disponibilité"
                  >
                    <option value="all">Toutes les urgences</option>
                    {urgencyValues.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </FilterSelect>

                  <FilterSelect
                    value={hasPropertiesFilter}
                    onChange={setHasPropertiesFilter}
                    label="Biens publiés"
                  >
                    <option value="all">Tous</option>
                    <option value="with">Avec propriétés</option>
                    <option value="without">Sans propriétés</option>
                  </FilterSelect>
                </div>

                <div>
                  <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-3 block">
                    Types de biens recherchés
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {PROPERTY_TYPE_OPTIONS.map((type) => (
                      <button
                        key={type}
                        onClick={() => togglePropertyType(type)}
                        className={`
                          px-4 py-2 rounded-xl text-sm font-bold transition-all border
                          ${
                            propertyTypesFilter.includes(type)
                              ? "bg-neutral-900 text-white border-neutral-900"
                              : "bg-neutral-50 text-neutral-500 border-neutral-100 hover:border-neutral-200"
                          }
                        `}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                </div>

                {activeFiltersCount > 0 && (
                  <div className="flex justify-end pt-2 border-t border-neutral-50">
                    <button
                      onClick={() => {
                        setCityFilter("all");
                        setReferralFilter("all");
                        setPlatformFilter("all");
                        setWhatsappFilter("all");
                        setBudgetFilter("all");
                        setUrgencyFilter("all");
                        setPropertyTypesFilter([]);
                        setHasPropertiesFilter("all");
                      }}
                      className="text-xs font-black text-neutral-400 uppercase tracking-widest hover:text-primary transition-colors"
                    >
                      Effacer les filtres avancés ({activeFiltersCount})
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* User Grid */}
      {loading ? (
        <UserGridSkeleton />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {sortedUsers.map((user, index) => {
            const completeness = getProfileCompleteness(user);
            const completenessColor =
              completeness === "complete"
                ? "bg-green-400"
                : completeness === "partial"
                  ? "bg-amber-400"
                  : "bg-neutral-200";
            const status = getEngagementStatus(user);
            const statusConf = STATUS_CONFIG[status];
            const intentSummary = getIntentSummary(user);
            const action = getSuggestedAction(user, status);
            const priorityLevel = getUserPriority(user, status, action);
            const priority = PRIORITY_CONFIG[priorityLevel];
            const signupLocation = formatSignupLocation(user);

            const isValidMeta = (v: unknown): v is string =>
              typeof v === "string" && v !== "Inconnu" && v !== "Unknown" && v.trim() !== "";
            const isRenter = user.user_type === "renter";
            const isOwner = user.user_type === "owner";

            const headerGradient =
              priorityLevel === "urgent"
                ? "from-rose-500 to-rose-600"
                : priorityLevel === "watch"
                  ? "from-[#c96a2e] to-[#a85424]"
                  : "from-slate-600 to-slate-700";

            const sharedMotionProps = {
              layout: true as const,
              initial: { opacity: 0, y: 16 },
              animate: { opacity: 1, y: 0 },
              transition: { duration: 0.3, delay: Math.min(index * 0.04, 0.6), ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
              onClick: () => setSelectedUser(user),
            };

            // ── Shared sub-components ────────────────────────────────────────
            const cardHeader = (typeLabel: string) => (
              <div className={`bg-gradient-to-br ${headerGradient} px-4 pt-4 pb-5`}>
                <div className="flex items-start gap-3">
                  {/* Avatar */}
                  <div className="relative shrink-0">
                    <div className="w-11 h-11 rounded-xl overflow-hidden ring-2 ring-white/25 shadow-md group-hover:ring-white/40 transition-all shrink-0">
                      {user.avatar_url ? (
                        <Image src={user.avatar_url} alt={user.full_name || ""} width={44} height={44} className="object-cover w-full h-full" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-white/20 text-white font-bold text-base">
                          {user.full_name?.charAt(0) || user.email?.charAt(0)}
                        </div>
                      )}
                    </div>
                    <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${completenessColor}`} />
                  </div>
                  {/* Identity */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-sm font-bold text-white truncate leading-tight tracking-tight">
                        {user.full_name || "Sans nom"}
                      </h3>
                      <span className="shrink-0 px-2 py-0.5 rounded-lg bg-white/20 border border-white/20 text-white text-[10px] font-black uppercase tracking-widest">
                        {typeLabel}
                      </span>
                    </div>
                    <p className="text-[11px] text-white/60 font-medium mt-0.5 truncate max-w-[175px]">
                      {user.email || "Email non renseigné"}
                    </p>
                    <div className="mt-1.5 flex items-center gap-2 text-[10px] text-white/70 font-semibold flex-wrap">
                      <span className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-white/50" />
                        {statusConf.label}
                      </span>
                      {user.signup_device_label && user.signup_device_label.trim() !== "" && (
                        <>
                          <span className="text-white/30">·</span>
                          <span className="flex items-center gap-0.5">
                            {user.signup_device_label.toLowerCase().includes("mobile")
                              ? <DeviceMobileIcon size={9} weight="bold" />
                              : <MonitorIcon size={9} weight="bold" />}
                            {user.signup_device_label}
                          </span>
                        </>
                      )}
                      {isValidMeta(signupLocation) && (
                        <>
                          <span className="text-white/30">·</span>
                          <span>{signupLocation}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );

            const cardFooter = (
              <div className="px-4 pb-4 pt-3 flex items-center gap-2">
                <button
                  onClick={(e) => { e.stopPropagation(); setSelectedUser(user); }}
                  className="flex-1 h-9 rounded-xl bg-neutral-900 text-white text-xs font-bold hover:bg-neutral-800 active:bg-neutral-950 transition-colors"
                >
                  Profil
                </button>
                <button
                  onClick={(e) => handleCopyPhone(e, user)}
                  disabled={!user.phone}
                  title={user.phone ? `Copier ${user.phone}` : "Pas de numéro"}
                  className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${
                    !user.phone
                      ? "bg-neutral-100 text-neutral-300 cursor-not-allowed"
                      : copiedUserId === user.id
                        ? "bg-green-500 text-white"
                        : "bg-neutral-100 text-neutral-600 hover:bg-neutral-900 hover:text-white"
                  }`}
                >
                  {copiedUserId === user.id
                    ? <CheckCircleIcon size={14} weight="fill" />
                    : <PhoneIcon size={14} weight="bold" />}
                </button>
                {user.whatsapp && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      window.open(`https://wa.me/${user.whatsapp?.replace(/\D/g, "")}`, "_blank");
                    }}
                    className="w-9 h-9 rounded-xl bg-[#25D366] text-white flex items-center justify-center hover:bg-[#1fbb57] active:bg-[#1aa04a] transition-colors"
                  >
                    <WhatsappLogoIcon size={14} weight="bold" />
                  </button>
                )}
              </div>
            );

            const calloutRow = (
              <div className={`mx-4 flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border text-[11px] font-semibold ${priority.callout}`}>
                <span className="flex items-center gap-1.5 truncate">
                  <PriorityIcon level={priorityLevel} size={12} className={`${priority.iconText} shrink-0`} />
                  <span className="truncate">{action.text}</span>
                </span>
                <span className={`shrink-0 text-[9px] font-black uppercase tracking-[0.1em] ${priority.iconText}`}>
                  {priority.label}
                </span>
              </div>
            );

            // ── RENTER CARD ───────────────────────────────────────────────────
            if (isRenter) {
              return (
                <motion.div
                  key={user.id}
                  {...sharedMotionProps}
                  className="rounded-2xl overflow-hidden cursor-pointer shadow-[0_2px_8px_rgba(0,0,0,0.07),0_8px_24px_rgba(0,0,0,0.05)] hover:shadow-[0_8px_32px_rgba(0,0,0,0.12),0_20px_48px_rgba(0,0,0,0.08)] hover:-translate-y-1 transition-all duration-200 group flex flex-col"
                >
                  {cardHeader("Locataire")}

                  <div className="bg-white px-4 pt-4 flex flex-col gap-3 flex-1">
                    {/* Search brief */}
                    <div className="bg-neutral-50 rounded-xl p-3.5">
                      <p className="text-[15px] font-extrabold text-neutral-900 leading-tight tracking-tight">
                        {(user.onboarding_property_types?.length ?? 0) > 0
                          ? user.onboarding_property_types.slice(0, 2).join(" · ")
                          : "Type non renseigné"}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-medium text-neutral-500">
                        {isValidMeta(user.onboarding_location || user.preferred_city) && (
                          <span className="flex items-center gap-1 text-neutral-600 font-semibold">
                            <MapPinIcon size={10} weight="bold" className="text-neutral-400" />
                            {user.onboarding_location || user.preferred_city}
                          </span>
                        )}
                        {(user.onboarding_budget || user.budget_max) && (
                          <span className="font-extrabold text-neutral-800">
                            {(user.onboarding_budget ?? user.budget_max)!.toLocaleString("fr-FR")} F/mois
                          </span>
                        )}
                        {isValidMeta(user.onboarding_move_in_urgency) && (
                          <span className={`font-semibold ${
                            (URGENCY_FR[user.onboarding_move_in_urgency!] ?? user.onboarding_move_in_urgency!).toLowerCase().includes("immédiat") ||
                            user.onboarding_move_in_urgency!.toLowerCase().includes("immediately") ||
                            user.onboarding_move_in_urgency!.toLowerCase().includes("urgent")
                              ? "text-rose-600 font-bold" : ""
                          }`}>
                            {URGENCY_FR[user.onboarding_move_in_urgency!] ?? user.onboarding_move_in_urgency}
                          </span>
                        )}
                        {isValidMeta(user.onboarding_rooms) && <span>{user.onboarding_rooms} pièces</span>}
                        {isValidMeta(user.onboarding_furnished) && (
                          <span>{FURNISHED_FR[user.onboarding_furnished!] ?? user.onboarding_furnished}</span>
                        )}
                      </div>
                    </div>

                    {/* Activity counts */}
                    {(user.applications_count > 0 || user.favorites_count > 0 || user.agreements_renter_count > 0) && (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {user.applications_count > 0 && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-neutral-100 text-[10px] font-bold text-neutral-600">
                            <ClipboardTextIcon size={10} weight="bold" />
                            {user.applications_count} candidature{user.applications_count > 1 ? "s" : ""}
                          </span>
                        )}
                        {user.favorites_count > 0 && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-neutral-100 text-[10px] font-bold text-neutral-600">
                            <HeartIcon size={10} weight="bold" />
                            {user.favorites_count}
                          </span>
                        )}
                        {user.agreements_renter_count > 0 && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-neutral-100 text-[10px] font-bold text-neutral-600">
                            <HandshakeIcon size={10} weight="bold" />
                            {user.agreements_renter_count} accord{user.agreements_renter_count > 1 ? "s" : ""}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Spacer so callout always sits near footer */}
                    <div className="flex-1" />
                    {calloutRow}
                  </div>

                  {cardFooter}
                </motion.div>
              );
            }

            // ── OWNER CARD ────────────────────────────────────────────────────
            if (isOwner) {
              return (
                <motion.div
                  key={user.id}
                  {...sharedMotionProps}
                  className="rounded-2xl overflow-hidden cursor-pointer shadow-[0_2px_8px_rgba(0,0,0,0.07),0_8px_24px_rgba(0,0,0,0.05)] hover:shadow-[0_8px_32px_rgba(0,0,0,0.12),0_20px_48px_rgba(0,0,0,0.08)] hover:-translate-y-1 transition-all duration-200 group flex flex-col"
                >
                  {cardHeader("Propriétaire")}

                  <div className="bg-white px-4 pt-4 flex flex-col gap-3 flex-1">
                    {/* Metric grid */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-neutral-50 rounded-xl p-3 text-center">
                        <div className="text-[2rem] font-black text-neutral-900 leading-none tabular-nums">
                          {user.properties_count}
                        </div>
                        <div className="text-[9px] font-black uppercase tracking-[0.12em] text-neutral-400 mt-1.5">
                          {user.properties_count === 1 ? "Bien" : "Biens"}
                        </div>
                      </div>
                      <div className="bg-neutral-50 rounded-xl p-3 text-center">
                        <div className="text-[2rem] font-black text-neutral-900 leading-none tabular-nums">
                          {user.applications_count}
                        </div>
                        <div className="text-[9px] font-black uppercase tracking-[0.12em] text-neutral-400 mt-1.5">
                          Candidatures
                        </div>
                      </div>
                      {user.agreements_owner_count > 0 && (
                        <div className="col-span-2 bg-neutral-50 rounded-xl p-3 text-center">
                          <div className="text-[2rem] font-black text-neutral-900 leading-none tabular-nums">
                            {user.agreements_owner_count}
                          </div>
                          <div className="text-[9px] font-black uppercase tracking-[0.12em] text-neutral-400 mt-1.5">
                            Accords
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Onboarding warning */}
                    {!user.has_completed_onboarding && (
                      <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-amber-50 border border-amber-200">
                        <WarningCircleIcon size={14} weight="fill" className="text-amber-500 shrink-0" />
                        <span className="text-[11px] font-bold text-amber-700">
                          Onboarding incomplet{user.web_onboarding_step ? ` — étape ${user.web_onboarding_step}` : ""}
                        </span>
                      </div>
                    )}

                    {/* Follow-up reasons — all of them */}
                    {user.owner_followup_reasons.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {user.owner_followup_reasons.map((reason) => (
                          <span
                            key={reason}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[10px] font-bold ${priority.chip}`}
                          >
                            <PriorityIcon level={priorityLevel} size={10} className={priority.iconText} />
                            {reason}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* City */}
                    {isValidMeta(user.onboarding_property_city || user.preferred_city) && (
                      <span className="self-start inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-neutral-100 text-[10px] font-bold text-neutral-600">
                        <MapPinIcon size={9} weight="bold" className="text-neutral-400" />
                        {user.onboarding_property_city || user.preferred_city}
                      </span>
                    )}

                    <div className="flex-1" />
                    {calloutRow}
                  </div>

                  {cardFooter}
                </motion.div>
              );
            }

            // ── FALLBACK: agent / staff / founder ─────────────────────────────
            return (
              <motion.div
                key={user.id}
                {...sharedMotionProps}
                className="rounded-2xl overflow-hidden cursor-pointer shadow-[0_2px_8px_rgba(0,0,0,0.07),0_8px_24px_rgba(0,0,0,0.05)] hover:shadow-[0_8px_32px_rgba(0,0,0,0.12),0_20px_48px_rgba(0,0,0,0.08)] hover:-translate-y-1 transition-all duration-200 group flex flex-col"
              >
                {cardHeader(userTypeLabels[user.user_type] || user.user_type)}

                <div className="bg-white px-4 pt-4 flex flex-col gap-3 flex-1">
                  <div className="bg-neutral-50 rounded-xl p-3.5">
                    <p className="text-[11px] font-black uppercase tracking-widest text-neutral-400 mb-1.5">
                      Pourquoi ils sont là
                    </p>
                    <p className="text-sm font-semibold text-neutral-900 leading-snug">{intentSummary}</p>
                  </div>

                  <div className="flex-1" />
                  {calloutRow}
                </div>

                {cardFooter}
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Empty State */}
      {!loading && sortedUsers.length === 0 && (
        <div className="bg-white rounded-[40px] p-20 text-center border border-neutral-100 shadow-sm">
          <div className="w-24 h-24 bg-neutral-50 rounded-[32px] flex items-center justify-center mx-auto mb-6">
            <UserIcon size={48} weight="bold" className="text-neutral-200" />
          </div>
          <h3 className="text-2xl font-bold text-neutral-900 mb-2">Aucun utilisateur trouvé</h3>
          <p className="text-neutral-500 max-w-sm mx-auto font-medium">
            Ajustez vos filtres ou votre recherche pour trouver ce que vous cherchez.
          </p>
          <Button onClick={resetAllFilters} className="mt-8 rounded-2xl px-8">
            Réinitialiser les filtres
          </Button>
        </div>
      )}

      {/* User Detail Modal */}
      <AnimatePresence>
        {selectedUser && (() => {
          const status = getEngagementStatus(selectedUser);
          const statusConf = STATUS_CONFIG[status];
          const intentSummary = getIntentSummary(selectedUser);
          const action = getSuggestedAction(selectedUser, status);
          const priorityLevel = getUserPriority(selectedUser, status, action);
          const priority = PRIORITY_CONFIG[priorityLevel];
          const intentStyle = getIntentStyle();

          return (
            <div className="fixed inset-0 z-100 flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm">
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="bg-white w-full max-w-3xl max-h-[90vh] rounded-[40px] shadow-2xl border border-neutral-200 overflow-hidden flex flex-col"
              >
                {/* Modal Header */}
                <div className="p-8 border-b border-neutral-100 flex items-start justify-between bg-white">
                  <div className="flex items-center gap-6">
                    <div className="w-20 h-20 rounded-[28px] overflow-hidden border-4 border-white shadow-xl relative shrink-0">
                      {selectedUser.avatar_url ? (
                        <Image
                          src={selectedUser.avatar_url}
                          alt=""
                          width={80}
                          height={80}
                          className="object-cover w-full h-full"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-neutral-900 text-white font-bold text-3xl">
                          {selectedUser.full_name?.charAt(0) || selectedUser.email?.charAt(0)}
                        </div>
                      )}
                      {selectedUser.has_completed_onboarding && (
                        <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-green-400 border-2 border-white flex items-center justify-center">
                          <CheckCircleIcon size={12} weight="fill" className="text-white" />
                        </div>
                      )}
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2 mb-1.5">
                        <h2 className="text-2xl font-black text-neutral-900 tracking-tight">
                          {selectedUser.full_name || "Sans nom"}
                        </h2>
                        <span
                          className={`px-3 py-1 rounded-lg border text-[10px] font-black uppercase tracking-widest ${userTypeColors[selectedUser.user_type] || "bg-neutral-50 text-neutral-500 border-neutral-100"}`}
                        >
                          {userTypeLabels[selectedUser.user_type] || selectedUser.user_type}
                        </span>
                        <span
                          className={`px-3 py-1 rounded-lg border text-[10px] font-black uppercase tracking-widest ${statusConf.badge}`}
                        >
                          {statusConf.label}
                        </span>
                        <span className={`flex items-center gap-1.5 px-3 py-1 rounded-lg border text-[10px] font-black uppercase tracking-widest ${priority.chip}`}>
                          <PriorityIcon level={priorityLevel} size={11} className={priority.iconText} />
                          {priority.label}
                        </span>
                        {selectedUser.signup_device_label && (
                          <span className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-neutral-100 text-[10px] font-black text-neutral-500 uppercase tracking-widest">
                            {selectedUser.signup_device_label.includes("Mobile") ? (
                              <DeviceMobileIcon size={11} weight="bold" />
                            ) : (
                              <MonitorIcon size={11} weight="bold" />
                            )}
                            {selectedUser.signup_device_label}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-4">
                        <span className="text-sm font-bold text-neutral-500 flex items-center gap-2">
                          <EnvelopeIcon size={16} weight="bold" className="text-neutral-400" />
                          {selectedUser.email}
                        </span>
                        <span className="text-sm font-bold text-neutral-500 flex items-center gap-2">
                          <PhoneIcon size={16} weight="bold" className="text-neutral-400" />
                          {selectedUser.phone || "Non renseigné"}
                        </span>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedUser(null)}
                    className="p-3 hover:bg-white hover:shadow-md rounded-2xl transition-all border border-transparent hover:border-neutral-100 text-neutral-400 hover:text-neutral-900 shrink-0"
                  >
                    <XIcon size={22} weight="bold" />
                  </button>
                </div>

                {/* Modal Content */}
                <div className="flex-1 overflow-y-auto p-8 custom-scrollbar space-y-8">

                  {/* SECTION 1: Intent hero — why they're here */}
                  <section>
                    <div className={`relative overflow-hidden rounded-3xl p-6 border ${intentStyle.bg} ${priority.intentBorder} space-y-5`}>
                      <div className={`absolute inset-y-0 left-0 w-1 ${priority.marker}`} />
                      <div className="flex items-start justify-between gap-4 pl-2">
                        <div className="flex-1">
                          <p className={`text-[10px] font-black uppercase tracking-widest mb-2 ${intentStyle.label}`}>
                            Pourquoi ils sont là
                          </p>
                          <p className={`text-xl font-black leading-snug ${intentStyle.text}`}>
                            {intentSummary}
                          </p>
                        </div>
                        <div className={`flex items-center gap-1.5 px-4 py-2 rounded-2xl border text-[10px] font-black uppercase tracking-widest shrink-0 ${priority.chip}`}>
                          <PriorityIcon level={priorityLevel} size={12} className={priority.iconText} />
                          {priority.label}
                        </div>
                      </div>

                      {/* Renter onboarding detail */}
                      {selectedUser.user_type === "renter" && (
                        <div className="pt-4 border-t border-current/10 space-y-3">
                          <div className="grid grid-cols-2 gap-x-8 gap-y-3">
                            {selectedUser.onboarding_rooms && (
                              <div className="flex items-center justify-between">
                                <span className={`text-[10px] font-black uppercase tracking-widest ${intentStyle.label}`}>
                                  Pièces
                                </span>
                                <span className="text-xs font-bold text-neutral-900">
                                  {selectedUser.onboarding_rooms}
                                </span>
                              </div>
                            )}
                            {(selectedUser.onboarding_budget || selectedUser.budget_max) && (
                              <div className="flex items-center justify-between">
                                <span className={`text-[10px] font-black uppercase tracking-widest ${intentStyle.label}`}>
                                  Budget
                                </span>
                                <span className="text-xs font-bold text-neutral-900">
                                  {(selectedUser.onboarding_budget ?? selectedUser.budget_max ?? 0).toLocaleString()} F
                                </span>
                              </div>
                            )}
                            {selectedUser.onboarding_furnished && (
                              <div className="flex items-center justify-between">
                                <span className={`text-[10px] font-black uppercase tracking-widest flex items-center gap-1 ${intentStyle.label}`}>
                                  <ChairIcon size={10} weight="bold" />
                                  Meublé
                                </span>
                                <span className="text-xs font-bold text-neutral-900">
                                  {selectedUser.onboarding_furnished}
                                </span>
                              </div>
                            )}
                            {selectedUser.onboarding_move_in_urgency && (
                              <div className="flex items-center justify-between">
                                <span className={`text-[10px] font-black uppercase tracking-widest flex items-center gap-1 ${intentStyle.label}`}>
                                  <ClockIcon size={10} weight="bold" />
                                  Emménagement
                                </span>
                                <span className="text-xs font-bold text-neutral-900">
                                  {selectedUser.onboarding_move_in_urgency}
                                </span>
                              </div>
                            )}
                          </div>
                          {selectedUser.onboarding_property_types.length > 0 && (
                            <div>
                              <span className={`text-[10px] font-black uppercase tracking-widest block mb-2 ${intentStyle.label}`}>
                                Types recherchés
                              </span>
                              <div className="flex flex-wrap gap-1.5">
                                {selectedUser.onboarding_property_types.map((t) => (
                                  <span key={t} className="px-2.5 py-1 bg-neutral-100 rounded-lg text-[11px] font-bold text-neutral-700">
                                    {t}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                          {selectedUser.onboarding_notifications_new_listings !== null && (
                            <div className="flex items-center justify-between pt-2 border-t border-current/10">
                              <span className={`text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 ${intentStyle.label}`}>
                                <BellIcon size={10} weight="bold" />
                                Notifs nouvelles annonces
                              </span>
                              <NotifDot on={selectedUser.onboarding_notifications_new_listings} />
                            </div>
                          )}
                        </div>
                      )}

                      {/* Owner onboarding detail */}
                      {selectedUser.user_type === "owner" && (
                        <div className="pt-4 border-t border-current/10 space-y-3">
                          <div className="grid grid-cols-2 gap-x-8 gap-y-3">
                            {selectedUser.onboarding_property_city && (
                              <div className="flex items-center justify-between">
                                <span className={`text-[10px] font-black uppercase tracking-widest ${intentStyle.label}`}>
                                  Ville du bien
                                </span>
                                <span className="text-xs font-bold text-neutral-900">
                                  {selectedUser.onboarding_property_city}
                                </span>
                              </div>
                            )}
                            {selectedUser.onboarding_property_available && (
                              <div className="flex items-center justify-between">
                                <span className={`text-[10px] font-black uppercase tracking-widest flex items-center gap-1 ${intentStyle.label}`}>
                                  <ClockIcon size={10} weight="bold" />
                                  Disponibilité
                                </span>
                                <span className="text-xs font-bold text-neutral-900">
                                  {selectedUser.onboarding_property_available}
                                </span>
                              </div>
                            )}
                          </div>
                          {(selectedUser.onboarding_notifications_messages !== null ||
                            selectedUser.onboarding_notifications_payments !== null ||
                            selectedUser.onboarding_notifications_viewing_requests !== null) && (
                            <div className="pt-3 border-t border-current/10">
                              <span className={`text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 mb-2 ${intentStyle.label}`}>
                                <BellIcon size={10} weight="bold" />
                                Notifications
                              </span>
                              <div className="flex items-center gap-6">
                                <span className="flex items-center gap-1.5 text-[11px] font-bold text-neutral-600">
                                  <NotifDot on={selectedUser.onboarding_notifications_messages} />
                                  Messages
                                </span>
                                <span className="flex items-center gap-1.5 text-[11px] font-bold text-neutral-600">
                                  <NotifDot on={selectedUser.onboarding_notifications_payments} />
                                  Paiements
                                </span>
                                <span className="flex items-center gap-1.5 text-[11px] font-bold text-neutral-600">
                                  <NotifDot on={selectedUser.onboarding_notifications_viewing_requests} />
                                  Visites
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Agent onboarding detail */}
                      {selectedUser.user_type === "agent" && (
                        <div className="pt-4 border-t border-current/10 space-y-3">
                          <div className="grid grid-cols-2 gap-x-8 gap-y-3">
                            {(selectedUser.clerk_company_name || selectedUser.company_name) && (
                              <div className="flex items-center justify-between">
                                <span className={`text-[10px] font-black uppercase tracking-widest ${intentStyle.label}`}>
                                  Agence
                                </span>
                                <span className="text-xs font-bold text-neutral-900 text-right max-w-[120px] truncate">
                                  {selectedUser.clerk_company_name || selectedUser.company_name}
                                </span>
                              </div>
                            )}
                            {(selectedUser.onboarding_portfolio_size || selectedUser.portfolio_size) && (
                              <div className="flex items-center justify-between">
                                <span className={`text-[10px] font-black uppercase tracking-widest ${intentStyle.label}`}>
                                  Portfolio
                                </span>
                                <span className="text-xs font-bold text-neutral-900">
                                  {selectedUser.onboarding_portfolio_size || selectedUser.portfolio_size}
                                </span>
                              </div>
                            )}
                            {getEffectiveReferralSource(selectedUser) && (
                              <div className="flex items-center justify-between">
                                <span className={`text-[10px] font-black uppercase tracking-widest ${intentStyle.label}`}>
                                  Source
                                </span>
                                <span className="text-xs font-bold text-neutral-900">
                                  {getReferralSourceDisplay(selectedUser)}
                                </span>
                              </div>
                            )}
                          </div>
                          {(selectedUser.onboarding_service_areas.length > 0 ||
                            (selectedUser.service_areas ?? []).length > 0) && (
                            <div>
                              <span className={`text-[10px] font-black uppercase tracking-widest block mb-2 ${intentStyle.label}`}>
                                Zones de service
                              </span>
                              <div className="flex flex-wrap gap-1.5">
                                {(selectedUser.onboarding_service_areas.length > 0
                                  ? selectedUser.onboarding_service_areas
                                  : selectedUser.service_areas ?? []
                                ).map((area, i) => (
                                  <span key={i} className="px-2.5 py-1 bg-neutral-100 rounded-lg text-[11px] font-bold text-neutral-700">
                                    {area}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Suggested action callout */}
                    <div
                      className={`mt-3 flex items-center gap-3 p-4 rounded-2xl border ${priority.callout}`}
                    >
                      <PriorityIcon level={priorityLevel} size={16} className={priority.iconText} />
                      <p className="text-sm font-bold">
                        {action.text}
                      </p>
                    </div>

                    {selectedUser.owner_followup_reasons.length > 0 && (
                      <div className={`mt-3 rounded-2xl border p-4 ${priority.callout}`}>
                        <p className="mb-2 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest">
                          <PriorityIcon level={priorityLevel} size={12} className={priority.iconText} />
                          Raisons de relance
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {selectedUser.owner_followup_reasons.map((reason) => (
                            <span
                              key={reason}
                              className={`rounded-lg bg-white px-2.5 py-1 text-[11px] font-bold border ${priority.chip}`}
                            >
                              {reason}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </section>

                  {/* 2-col grid: Contact + Professional */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* SECTION 2: Contact */}
                    <section>
                      <h3 className="text-xs font-black text-neutral-400 uppercase tracking-[0.2em] mb-4">
                        Contact
                      </h3>
                      <div className="space-y-4">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-2xl bg-green-50 flex items-center justify-center text-green-600 border border-green-100 shrink-0">
                            <WhatsappLogoIcon size={20} weight="bold" />
                          </div>
                          <div>
                            <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">
                              WhatsApp
                            </p>
                            <p className="font-bold text-neutral-900 text-sm">
                              {selectedUser.whatsapp || "Non renseigné"}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-2xl bg-neutral-50 flex items-center justify-center text-neutral-500 border border-neutral-100 shrink-0">
                            <MapPinIcon size={20} weight="bold" />
                          </div>
                          <div>
                            <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">
                              Ville
                            </p>
                            <p className="font-bold text-neutral-900 text-sm">
                              {selectedUser.preferred_city ||
                                selectedUser.onboarding_location ||
                                selectedUser.onboarding_property_city ||
                                "Non renseigné"}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-2xl bg-neutral-50 flex items-center justify-center text-neutral-500 border border-neutral-100 shrink-0">
                            <GlobeIcon size={20} weight="bold" />
                          </div>
                          <div>
                            <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">
                              Inscrit depuis
                            </p>
                            <p className="font-bold text-neutral-900 text-sm">
                              {formatSignupLocation(selectedUser) || "Non capturé"}
                            </p>
                            {selectedUser.signup_ip && (
                              <p className="text-[10px] font-medium text-neutral-400 mt-0.5 font-mono">
                                {selectedUser.signup_ip}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-2xl bg-neutral-50 flex items-center justify-center text-neutral-500 border border-neutral-100 shrink-0">
                            {selectedUser.signup_device_label.includes("Mobile") ? (
                              <DeviceMobileIcon size={20} weight="bold" />
                            ) : (
                              <MonitorIcon size={20} weight="bold" />
                            )}
                          </div>
                          <div>
                            <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">
                              Appareil d&apos;inscription
                            </p>
                            <p className="font-bold text-neutral-900 text-sm">
                              {selectedUser.signup_device_label}
                            </p>
                            {(selectedUser.signup_browser_name ||
                              selectedUser.signup_browser_version) && (
                              <p className="text-[10px] font-medium text-neutral-400 mt-0.5">
                                {[selectedUser.signup_browser_name, selectedUser.signup_browser_version]
                                  .filter(Boolean)
                                  .join(" ")}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-2xl bg-neutral-50 flex items-center justify-center text-neutral-500 border border-neutral-100 shrink-0">
                            <IdentificationCardIcon size={20} weight="bold" />
                          </div>
                          <div>
                            <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">
                              Source d&apos;acquisition
                            </p>
                            <p className="font-bold text-neutral-900 text-sm">
                              {getReferralSourceDisplay(selectedUser) || "Non renseigné"}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-2xl bg-neutral-50 flex items-center justify-center text-neutral-500 border border-neutral-100 shrink-0">
                            <CalendarIcon size={20} weight="bold" />
                          </div>
                          <div>
                            <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">
                              Premier contact
                            </p>
                            <p className="font-bold text-neutral-900 text-sm">
                              {format(new Date(selectedUser.created_at), "PPP", { locale: fr })}
                            </p>
                          </div>
                        </div>
                      </div>
                    </section>

                    {/* SECTION 3: Professional profile (owner / agent) */}
                    {(selectedUser.user_type === "agent" || selectedUser.user_type === "owner") && (
                      <section>
                        <h3 className="text-xs font-black text-neutral-400 uppercase tracking-[0.2em] mb-4">
                          Profil Professionnel
                        </h3>
                        <div className="space-y-4">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-2xl bg-neutral-50 flex items-center justify-center text-neutral-500 border border-neutral-100 shrink-0">
                              <BuildingsIcon size={20} weight="bold" />
                            </div>
                            <div>
                              <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">
                                Entreprise
                              </p>
                              <p className="font-bold text-neutral-900 text-sm">
                                {selectedUser.clerk_company_name ||
                                  selectedUser.company_name ||
                                  "Indépendant"}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-2xl bg-neutral-50 flex items-center justify-center text-neutral-900 border border-neutral-100 shrink-0">
                              <GlobeIcon size={20} weight="bold" />
                            </div>
                            <div>
                              <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">
                                Lien professionnel
                              </p>
                              {selectedUser.clerk_professional_link ||
                              selectedUser.professional_link ? (
                                <a
                                  href={
                                    selectedUser.clerk_professional_link ||
                                    selectedUser.professional_link ||
                                    "#"
                                  }
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="font-bold text-primary hover:underline text-sm"
                                >
                                  {selectedUser.clerk_professional_link ||
                                    selectedUser.professional_link}
                                </a>
                              ) : (
                                <p className="font-bold text-neutral-400 text-sm">Non renseigné</p>
                              )}
                            </div>
                          </div>
                          {selectedUser.user_type === "agent" && (
                            <div className="flex items-center gap-4">
                              <div className="w-10 h-10 rounded-2xl bg-neutral-50 flex items-center justify-center text-neutral-900 border border-neutral-100 shrink-0">
                                <BriefcaseIcon size={20} weight="bold" />
                              </div>
                              <div>
                                <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">
                                  Taille du portfolio
                                </p>
                                <p className="font-bold text-neutral-900 text-sm">
                                  {selectedUser.onboarding_portfolio_size ||
                                    selectedUser.portfolio_size ||
                                    "Non renseigné"}
                                </p>
                              </div>
                            </div>
                          )}
                        </div>
                      </section>
                    )}
                  </div>

                  {/* SECTION 4: Activity — compact badges, NOT large stat cards */}
                  <section>
                    <h3 className="text-xs font-black text-neutral-400 uppercase tracking-[0.2em] mb-4">
                      Activité sur la plateforme
                    </h3>
                    <div className="flex flex-wrap gap-3">
                      <div className="flex items-center gap-2 px-4 py-2.5 bg-neutral-50 border border-neutral-100 rounded-2xl">
                        <HouseIcon size={16} weight="bold" className="text-neutral-500" />
                        <span className="text-sm font-black text-neutral-900">
                          {selectedUser.properties_count}
                        </span>
                        <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">
                          biens
                        </span>
                      </div>
                      <div className="flex items-center gap-2 px-4 py-2.5 bg-neutral-50 border border-neutral-100 rounded-2xl">
                        <ClipboardTextIcon size={16} weight="bold" className="text-neutral-500" />
                        <span className="text-sm font-black text-neutral-900">
                          {selectedUser.applications_count}
                        </span>
                        <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">
                          candidatures
                        </span>
                      </div>
                      <div className="flex items-center gap-2 px-4 py-2.5 bg-neutral-50 border border-neutral-100 rounded-2xl">
                        <HeartIcon size={16} weight="bold" className="text-neutral-500" />
                        <span className="text-sm font-black text-neutral-900">
                          {selectedUser.favorites_count}
                        </span>
                        <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">
                          favoris
                        </span>
                      </div>
                      <div className="flex items-center gap-2 px-4 py-2.5 bg-neutral-50 border border-neutral-100 rounded-2xl">
                        <HandshakeIcon size={16} weight="bold" className="text-neutral-500" />
                        <span className="text-sm font-black text-neutral-900">
                          {selectedUser.agreements_renter_count + selectedUser.agreements_owner_count}
                        </span>
                        <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">
                          accords
                        </span>
                      </div>
                    </div>
                  </section>

                  {/* SECTION 5: Metadata */}
                  <section>
                    <h3 className="text-xs font-black text-neutral-400 uppercase tracking-[0.2em] mb-4">
                      Métadonnées
                    </h3>
                    <div className="bg-neutral-50 p-5 rounded-3xl border border-neutral-100 space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">
                          ID Système
                        </span>
                        <span className="text-[10px] font-mono text-neutral-400 truncate max-w-[160px]">
                          {selectedUser.id}
                        </span>
                      </div>
                      {selectedUser.clerk_id && (
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">
                            ID Clerk
                          </span>
                          <span className="text-[10px] font-mono text-neutral-400 truncate max-w-[160px]">
                            {selectedUser.clerk_id}
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">
                          Onboarding complété
                        </span>
                        <span
                          className={`text-xs font-bold ${selectedUser.has_completed_onboarding ? "text-green-600" : "text-neutral-400"}`}
                        >
                          {selectedUser.has_completed_onboarding ? "Oui" : "Non"}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">
                          Source onboarding
                        </span>
                        <span className="text-xs font-bold text-neutral-600 uppercase">
                          {selectedUser.onboarding_source || "Inconnue"}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">
                          Web / mobile
                        </span>
                        <span className="text-xs font-bold text-neutral-600">
                          {selectedUser.has_completed_web_onboarding ? "Web oui" : "Web non"} ·{" "}
                          {selectedUser.has_completed_mobile_onboarding ? "Mobile oui" : "Mobile non"}
                        </span>
                      </div>
                      {selectedUser.web_onboarding_step !== null && (
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">
                            Étape web sauvegardée
                          </span>
                          <span className="text-xs font-bold text-neutral-600">
                            {selectedUser.web_onboarding_step}
                          </span>
                        </div>
                      )}
                    </div>
                  </section>
                </div>

                {/* Modal Footer */}
                <div className="p-8 border-t border-neutral-100 bg-neutral-50/30 flex gap-3">
                  {["owner", "agent", "renter"].includes(selectedUser.user_type) && (
                    <Button
                      className="h-12 rounded-2xl bg-orange-600 px-5 font-bold text-white"
                      onClick={() => setImportLeaseUser(selectedUser)}
                    >
                      <HandshakeIcon size={16} weight="bold" className="mr-2" />
                      Importer un bail
                    </Button>
                  )}
                  <Button
                    className="flex-1 h-12 rounded-2xl bg-neutral-900 font-bold uppercase tracking-wider text-xs shadow-xl shadow-black/10"
                    onClick={() => {
                      if (selectedUser.phone) window.open(`tel:${selectedUser.phone}`);
                    }}
                  >
                    <PhoneIcon size={16} weight="bold" className="mr-2" />
                    Appeler
                  </Button>
                  {selectedUser.whatsapp && (
                    <Button
                      className="h-12 px-6 rounded-2xl bg-green-500 hover:bg-green-600 text-white flex items-center gap-2 shadow-xl shadow-green-500/20 font-bold uppercase tracking-wider text-xs"
                      onClick={() => {
                        const phone = selectedUser.whatsapp?.replace(/\D/g, "");
                        window.open(`https://wa.me/${phone}`, "_blank");
                      }}
                    >
                      <WhatsappLogoIcon size={16} weight="bold" />
                      WhatsApp
                    </Button>
                  )}
                </div>
              </motion.div>
            </div>
          );
        })()}
      </AnimatePresence>

      <ImportExistingLeaseWizard
        open={Boolean(importLeaseUser)}
        onClose={() => setImportLeaseUser(null)}
        preselectedUser={importLeaseUser}
      />

      {/* Copy phone toast */}
      <AnimatePresence>
        {copiedUserId && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[200] flex items-center gap-2.5 px-5 py-3 bg-neutral-900 text-white text-sm font-bold rounded-2xl shadow-2xl pointer-events-none"
          >
            <CheckCircleIcon size={16} weight="fill" className="text-green-400 shrink-0" />
            Numéro copié dans le presse-papiers
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
