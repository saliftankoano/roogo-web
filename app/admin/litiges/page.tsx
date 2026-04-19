"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import {
  WarningCircleIcon,
  CheckCircleIcon,
  ClockIcon,
  MagnifyingGlassIcon,
  FunnelIcon,
  ScalesIcon,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

interface DisputeRow {
  id: string;
  agreement_id: string;
  amount: number;
  currency: string;
  status: string;
  stay_end_at: string | null;
  review_deadline_at: string | null;
  resolved_owner_amount: number | null;
  resolved_renter_amount: number | null;
  resolved_at: string | null;
  created_at: string;
  properties: {
    id: string;
    quartier: string | null;
    city: string | null;
    address: string | null;
  } | null;
  owner: { id: string; full_name: string | null; phone: string | null } | null;
  renter: { id: string; full_name: string | null; phone: string | null } | null;
  claim:
    | {
        id: string;
        claimed_amount: number;
        description: string;
        status: string;
        created_at: string;
      }[]
    | null;
}

const statusConfig: Record<
  string,
  { label: string; color: string; Icon: typeof WarningCircleIcon }
> = {
  disputed: {
    label: "À traiter",
    color: "bg-amber-100 text-amber-700",
    Icon: WarningCircleIcon,
  },
  resolved_split: {
    label: "Résolu — partagé",
    color: "bg-violet-100 text-violet-700",
    Icon: CheckCircleIcon,
  },
  resolved_owner_full: {
    label: "Résolu — propriétaire",
    color: "bg-violet-100 text-violet-700",
    Icon: CheckCircleIcon,
  },
  resolved_renter_full: {
    label: "Résolu — locataire",
    color: "bg-violet-100 text-violet-700",
    Icon: CheckCircleIcon,
  },
};

const formatDate = (d: string | null) =>
  d
    ? new Date(d).toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "—";

const formatXof = (n: number) => `${n.toLocaleString("fr-FR")} FCFA`;

export default function AdminLitigesPage() {
  const { user, isLoaded } = useUser();
  const router = useRouter();
  const [disputes, setDisputes] = useState<DisputeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const userType = (user?.publicMetadata?.userType ||
    user?.publicMetadata?.user_type) as string | undefined;

  useEffect(() => {
    if (!isLoaded) return;
    if (!["staff", "founder", "admin"].includes(userType || "")) {
      router.push("/");
      return;
    }
    (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/admin/disputes");
        const data = await res.json();
        if (data.success) setDisputes(data.disputes || []);
      } finally {
        setLoading(false);
      }
    })();
  }, [isLoaded, userType, router]);

  const filtered = disputes.filter((d) => {
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      d.owner?.full_name?.toLowerCase().includes(q) ||
      d.renter?.full_name?.toLowerCase().includes(q) ||
      d.properties?.quartier?.toLowerCase().includes(q) ||
      d.properties?.address?.toLowerCase().includes(q);
    const matchStatus =
      statusFilter === "all"
        ? true
        : statusFilter === "resolved"
          ? d.status.startsWith("resolved_")
          : d.status === statusFilter;
    return matchSearch && matchStatus;
  });

  if (!isLoaded) return null;

  const disputedCount = disputes.filter((d) => d.status === "disputed").length;
  const resolvedCount = disputes.filter((d) =>
    d.status.startsWith("resolved_"),
  ).length;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-neutral-900">
            Litiges cautions
          </h1>
          <p className="text-sm text-neutral-400 font-medium mt-1">
            Revue des réclamations sur les cautions journalières.
          </p>
        </div>
        <div className="flex gap-4 text-center">
          <div className="bg-white border border-neutral-100 rounded-2xl px-5 py-3 shadow-sm">
            <p className="text-2xl font-black text-amber-600">
              {disputedCount}
            </p>
            <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider mt-0.5">
              À traiter
            </p>
          </div>
          <div className="bg-white border border-neutral-100 rounded-2xl px-5 py-3 shadow-sm">
            <p className="text-2xl font-black text-violet-600">
              {resolvedCount}
            </p>
            <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider mt-0.5">
              Résolus
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex items-center gap-3 bg-white border border-neutral-100 rounded-2xl px-4 py-3 flex-1 shadow-sm focus-within:border-primary/40 transition-colors">
          <MagnifyingGlassIcon
            size={16}
            className="text-neutral-400 shrink-0"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par propriétaire, locataire ou bien…"
            className="bg-transparent outline-none flex-1 text-sm font-medium text-neutral-700 placeholder:text-neutral-300"
          />
        </div>
        <div className="flex items-center gap-2 bg-white border border-neutral-100 rounded-2xl px-4 py-3 shadow-sm">
          <FunnelIcon size={14} className="text-neutral-400" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-transparent outline-none text-sm font-bold text-neutral-700 cursor-pointer"
          >
            <option value="all">Tous</option>
            <option value="disputed">À traiter</option>
            <option value="resolved">Résolus</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center py-20 gap-3 text-center bg-white rounded-[32px] border border-neutral-100">
          <ClockIcon size={40} className="text-neutral-200" />
          <p className="text-sm font-bold text-neutral-400">Chargement…</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center py-20 gap-3 text-center bg-white rounded-[32px] border border-neutral-100">
          <ScalesIcon size={40} className="text-neutral-200" />
          <p className="text-sm font-bold text-neutral-400">
            Aucun litige trouvé
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-[32px] border border-neutral-100 shadow-sm overflow-hidden">
          <div className="divide-y divide-neutral-50">
            {filtered.map((d) => {
              const cfg = statusConfig[d.status] || statusConfig.disputed;
              const activeClaim = d.claim?.[0];
              return (
                <Link
                  key={d.id}
                  href={`/admin/litiges/${d.id}`}
                  className="flex items-center gap-4 p-5 hover:bg-neutral-50/50 transition-colors"
                >
                  <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center text-sm font-black text-amber-700 shrink-0">
                    {d.owner?.full_name?.charAt(0)?.toUpperCase() || "?"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-neutral-900 truncate">
                      {d.properties?.quartier ||
                        d.properties?.address ||
                        "Bien inconnu"}
                    </p>
                    <p className="text-xs text-neutral-400 truncate">
                      {d.owner?.full_name || "Propriétaire ?"} vs{" "}
                      {d.renter?.full_name || "Locataire ?"}
                    </p>
                  </div>
                  <div className="text-right hidden md:block shrink-0">
                    <p className="text-sm font-black text-neutral-900">
                      {formatXof(d.amount)}
                    </p>
                    {activeClaim ? (
                      <p className="text-xs text-neutral-400">
                        Réclamé: {formatXof(activeClaim.claimed_amount)}
                      </p>
                    ) : null}
                  </div>
                  <div className="text-xs text-neutral-400 shrink-0 hidden md:block">
                    {formatDate(d.created_at)}
                  </div>
                  <div
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold shrink-0",
                      cfg.color,
                    )}
                  >
                    <cfg.Icon size={12} weight="fill" />
                    {cfg.label}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
