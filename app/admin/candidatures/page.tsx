"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import {
  UsersIcon,
  HouseLineIcon,
  MagnifyingGlassIcon,
  ClockIcon,
  CheckCircleIcon,
  XCircleIcon,
  CreditCardIcon,
  UserCircleIcon,
  FunnelIcon,
} from "@phosphor-icons/react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

interface ApplicationRow {
  id: string;
  status: string;
  created_at: string;
  property_id: string;
  user_id: string;
  properties: { id: string; title: string; quartier: string | null; city: string | null } | null;
  users: { full_name: string | null; phone: string | null } | null;
}

interface LockRow {
  id: string;
  amount: number;
  currency: string;
  status: string;
  provider: string;
  payer_phone: string;
  created_at: string;
  property_id: string | null;
  user_id: string | null;
  properties: { id: string; title: string; quartier: string | null; city: string | null } | null;
  users: { full_name: string | null; phone: string | null } | null;
}

const getAppStatusConfig = (status: string) => {
  switch (status) {
    case "approved": return { label: "Accepte", color: "bg-green-100 text-green-700", Icon: CheckCircleIcon };
    case "rejected": return { label: "Refuse", color: "bg-red-100 text-red-600", Icon: XCircleIcon };
    default: return { label: "En attente", color: "bg-yellow-100 text-yellow-700", Icon: ClockIcon };
  }
};

const getTxStatusConfig = (status: string) => {
  switch (status) {
    case "completed": return { label: "Confirme", color: "bg-green-100 text-green-700" };
    case "failed": return { label: "Echoue", color: "bg-red-100 text-red-600" };
    case "pending": return { label: "En attente", color: "bg-yellow-100 text-yellow-700" };
    default: return { label: status, color: "bg-neutral-100 text-neutral-500" };
  }
};

const formatDate = (d: string) => new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });

export default function AdminCandidaturesPage() {
  const { user, isLoaded } = useUser();
  const router = useRouter();

  const [applications, setApplications] = useState<ApplicationRow[]>([]);
  const [lockTransactions, setLockTransactions] = useState<LockRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchApp, setSearchApp] = useState("");
  const [searchLock, setSearchLock] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const userType = (user?.publicMetadata?.userType || user?.publicMetadata?.user_type) as string | undefined;

  useEffect(() => {
    if (!isLoaded) return;
    if (!["staff", "founder", "admin"].includes(userType || "")) {
      router.push("/");
      return;
    }
    loadData();
  }, [isLoaded, userType, router]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [appsRes, txRes] = await Promise.all([
        fetch("/api/admin/candidatures/applications"),
        fetch("/api/admin/candidatures/locks"),
      ]);
      const appsData = await appsRes.json();
      const txData = await txRes.json();
      if (appsData.success) setApplications(appsData.applications || []);
      if (txData.success) setLockTransactions(txData.transactions || []);
    } catch { /* ignore */ } finally { setLoading(false); }
  };

  const filteredApps = applications.filter((a) => {
    const matchSearch = !searchApp ||
      a.users?.full_name?.toLowerCase().includes(searchApp.toLowerCase()) ||
      a.properties?.title?.toLowerCase().includes(searchApp.toLowerCase());
    const matchStatus = statusFilter === "all" || a.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const filteredLocks = lockTransactions.filter((t) => {
    return !searchLock ||
      t.users?.full_name?.toLowerCase().includes(searchLock.toLowerCase()) ||
      t.properties?.title?.toLowerCase().includes(searchLock.toLowerCase());
  });

  if (!isLoaded) return null;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-neutral-900">Candidatures & Locations</h1>
          <p className="text-sm text-neutral-400 font-medium mt-1">
            Toutes les candidatures et locations immediates
          </p>
        </div>
        <div className="flex gap-4 text-center">
          <div className="bg-white border border-neutral-100 rounded-2xl px-5 py-3 shadow-sm">
            <p className="text-2xl font-black text-neutral-900">{applications.length}</p>
            <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider mt-0.5">Candidatures</p>
          </div>
          <div className="bg-white border border-neutral-100 rounded-2xl px-5 py-3 shadow-sm">
            <p className="text-2xl font-black text-primary">{lockTransactions.filter(t => t.status === "completed").length}</p>
            <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider mt-0.5">Locations</p>
          </div>
        </div>
      </div>

      <Tabs defaultValue="candidatures">
        <TabsList className="mb-6">
          <TabsTrigger value="candidatures" className="flex items-center gap-2">
            <UsersIcon size={14} weight="bold" />
            Candidatures
          </TabsTrigger>
          <TabsTrigger value="locations" className="flex items-center gap-2">
            <CreditCardIcon size={14} weight="bold" />
            Locations immediates
          </TabsTrigger>
        </TabsList>

        <TabsContent value="candidatures" className="space-y-6">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex items-center gap-3 bg-white border border-neutral-100 rounded-2xl px-4 py-3 flex-1 shadow-sm focus-within:border-primary/40 transition-colors">
              <MagnifyingGlassIcon size={16} className="text-neutral-400 shrink-0" />
              <input
                type="text"
                value={searchApp}
                onChange={(e) => setSearchApp(e.target.value)}
                placeholder="Rechercher par candidat ou bien..."
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
                <option value="all">Tous les statuts</option>
                <option value="pending">En attente</option>
                <option value="approved">Accepte</option>
                <option value="rejected">Refuse</option>
              </select>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            </div>
          ) : filteredApps.length === 0 ? (
            <div className="flex flex-col items-center py-20 gap-3 text-center bg-white rounded-[32px] border border-neutral-100">
              <UserCircleIcon size={40} className="text-neutral-200" />
              <p className="text-sm font-bold text-neutral-400">Aucune candidature trouvee</p>
            </div>
          ) : (
            <div className="bg-white rounded-[32px] border border-neutral-100 shadow-sm overflow-hidden">
              <div className="divide-y divide-neutral-50">
                {filteredApps.map((app) => {
                  const cfg = getAppStatusConfig(app.status);
                  return (
                    <div key={app.id} className="flex items-center gap-4 p-5 hover:bg-neutral-50/50 transition-colors">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-sm font-black text-primary shrink-0">
                        {app.users?.full_name?.charAt(0)?.toUpperCase() || "?"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-neutral-900 truncate">{app.users?.full_name || "Inconnu"}</p>
                        {app.users?.phone && <p className="text-xs text-neutral-400">{app.users.phone}</p>}
                      </div>
                      <div className="flex-1 min-w-0 hidden sm:block">
                        {app.properties ? (
                          <Link href={"/admin/annonces/" + app.property_id} className="hover:text-primary transition-colors">
                            <p className="text-sm font-bold text-neutral-700 truncate hover:text-primary">{app.properties.title}</p>
                            <p className="text-xs text-neutral-400">{[app.properties.quartier, app.properties.city].filter(Boolean).join(", ")}</p>
                          </Link>
                        ) : (
                          <p className="text-xs text-neutral-300">Bien inconnu</p>
                        )}
                      </div>
                      <div className="text-xs text-neutral-400 shrink-0 hidden md:block">{formatDate(app.created_at)}</div>
                      <div className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold shrink-0", cfg.color)}>
                        <cfg.Icon size={12} weight="fill" />
                        {cfg.label}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="locations" className="space-y-6">
          <div className="flex items-center gap-3 bg-white border border-neutral-100 rounded-2xl px-4 py-3 shadow-sm focus-within:border-primary/40 transition-colors">
            <MagnifyingGlassIcon size={16} className="text-neutral-400 shrink-0" />
            <input
              type="text"
              value={searchLock}
              onChange={(e) => setSearchLock(e.target.value)}
              placeholder="Rechercher par locataire ou bien..."
              className="bg-transparent outline-none flex-1 text-sm font-medium text-neutral-700 placeholder:text-neutral-300"
            />
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            </div>
          ) : filteredLocks.length === 0 ? (
            <div className="flex flex-col items-center py-20 gap-3 text-center bg-white rounded-[32px] border border-neutral-100">
              <HouseLineIcon size={40} className="text-neutral-200" />
              <p className="text-sm font-bold text-neutral-400">Aucune location immediate trouvee</p>
            </div>
          ) : (
            <div className="bg-white rounded-[32px] border border-neutral-100 shadow-sm overflow-hidden">
              <div className="divide-y divide-neutral-50">
                {filteredLocks.map((tx) => {
                  const cfg = getTxStatusConfig(tx.status);
                  const providerLabel = tx.provider === "ORANGE_BFA" ? "Orange Money" : tx.provider === "MOOV_BFA" ? "Moov Money" : tx.provider;
                  return (
                    <div key={tx.id} className="flex items-center gap-4 p-5 hover:bg-neutral-50/50 transition-colors">
                      <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center text-sm font-black text-green-600 shrink-0">
                        {tx.users?.full_name?.charAt(0)?.toUpperCase() || "?"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-neutral-900 truncate">{tx.users?.full_name || "Locataire inconnu"}</p>
                        <p className="text-xs text-neutral-400">{tx.payer_phone} — {providerLabel}</p>
                      </div>
                      <div className="flex-1 min-w-0 hidden sm:block">
                        {tx.properties && tx.property_id ? (
                          <Link href={"/admin/annonces/" + tx.property_id} className="hover:text-primary transition-colors">
                            <p className="text-sm font-bold text-neutral-700 truncate hover:text-primary">{tx.properties.title}</p>
                            <p className="text-xs text-neutral-400">{[tx.properties.quartier, tx.properties.city].filter(Boolean).join(", ")}</p>
                          </Link>
                        ) : (
                          <p className="text-xs text-neutral-300">Bien inconnu</p>
                        )}
                      </div>
                      <div className="text-right hidden md:block shrink-0">
                        <p className="text-sm font-black text-neutral-900">{tx.amount.toLocaleString("fr-FR")} FCFA</p>
                        <p className="text-xs text-neutral-400">{formatDate(tx.created_at)}</p>
                      </div>
                      <span className={cn("px-3 py-1.5 rounded-xl text-xs font-bold shrink-0", cfg.color)}>
                        {cfg.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
