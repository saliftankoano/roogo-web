"use client";

import { useState, useEffect, useMemo } from "react";
import {
  MagnifyingGlassIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  BuildingsIcon,
  ChartBarIcon,
  TrendUpIcon,
  CreditCardIcon,
  CameraIcon,
  LightningIcon,
  RowsIcon,
  InfoIcon, HandCoinsIcon,

  UserCircleIcon,
  MapPinIcon,
  VideoCameraIcon,
  UsersIcon,
  CubeIcon,
  CalendarIcon,
} from "@phosphor-icons/react";
import { getAdminTransactions, ExtendedTransaction } from "./actions";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Pie,
  Cell,
  PieChart,
  Label,
} from "recharts";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

interface TransactionAddOn {
  id: string;
  name: string;
  price: number;
}

interface TransactionMetadata {
  tier?: {
    id: string;
    name: string;
    base_fee: number;
  };
  commission?: number;
  add_ons?: TransactionAddOn[];
  total?: number;
}

const ADD_ON_ICONS: Record<string, React.ElementType> = {
  video: VideoCameraIcon,
  extra_slots: UsersIcon,
  "3d_env": CubeIcon,
  extra_photos: CameraIcon,
  boost: LightningIcon,
  open_house: CalendarIcon,
};

const ADD_ON_LABELS: Record<string, string> = {
  video: "Vidéo",
  extra_slots: "Slots",
  "3d_env": "3D",
  extra_photos: "Photos",
  boost: "Boost",
  open_house: "Visite",
};

export default function AdminFinancesPage() {
  const [transactions, setTransactions] = useState<ExtendedTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    async function loadTransactions() {
      try {
        const data = await getAdminTransactions();
        setTransactions(data);
      } catch (error) {
        console.error("Error loading transactions:", error);
      }
      setLoading(false);
    }
    loadTransactions();
  }, []);

  const filteredTransactions = useMemo(() => {
    return transactions.filter((tx) => {
      const matchesSearch =
        tx.deposit_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        tx.payer_phone.includes(searchQuery) ||
        tx.user_name?.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus =
        statusFilter === "all" || tx.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [transactions, searchQuery, statusFilter]);

  const stats = useMemo(() => {
    const completed = transactions.filter((t) => t.status === "completed");
    const totalAmount = completed.reduce((sum, t) => sum + t.amount, 0);

    let totalCommission = 0;
    const byTypeDetail = {
      premium: 0,
      standard: 0,
      basic: 0,
      add_ons: 0,
      photography: 0,
      boost: 0,
      other: 0,
    };

    completed.forEach((t) => {
      const metadata = t.metadata as TransactionMetadata;
      if (metadata?.commission) {
        totalCommission += metadata.commission;
      }

      if (t.type === "listing_submission") {
        const tierName = metadata?.tier?.name?.toLowerCase();
        if (tierName?.includes("premium")) byTypeDetail.premium += metadata?.tier?.base_fee || 0;
        else if (tierName?.includes("standard")) byTypeDetail.standard += metadata?.tier?.base_fee || 0;
        else if (tierName?.includes("basic")) byTypeDetail.basic += metadata?.tier?.base_fee || 0;
        
        if (metadata?.add_ons) {
          metadata.add_ons.forEach(addon => {
            byTypeDetail.add_ons += addon.price;
          });
        }
      } else if (t.type === "photography") {
        byTypeDetail.photography += t.amount;
      } else if (t.type === "boost") {
        byTypeDetail.boost += t.amount;
      } else {
        byTypeDetail.other += t.amount;
      }
    });

    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      return d.toISOString().split("T")[0];
    });

    const dailyRevenue = last7Days.map((day) => {
      const dayTxs = completed.filter((t) => t.created_at.startsWith(day));
      const breakdown = { premium: 0, standard: 0, basic: 0, add_ons: 0, photography: 0, boost: 0, other: 0 };

      dayTxs.forEach(t => {
        const metadata = t.metadata as TransactionMetadata;
        if (t.type === "listing_submission") {
          const tierName = metadata?.tier?.name?.toLowerCase();
          if (tierName?.includes("premium")) breakdown.premium += metadata?.tier?.base_fee || 0;
          else if (tierName?.includes("standard")) breakdown.standard += metadata?.tier?.base_fee || 0;
          else if (tierName?.includes("basic")) breakdown.basic += metadata?.tier?.base_fee || 0;
          if (metadata?.add_ons) metadata.add_ons.forEach(a => breakdown.add_ons += a.price);
        } else if (t.type === "photography") breakdown.photography += t.amount;
        else if (t.type === "boost") breakdown.boost += t.amount;
        else breakdown.other += t.amount;
      });

      const date = new Date(day);
      return { 
        day: date.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }), 
        ...breakdown,
        total: dayTxs.reduce((sum, t) => sum + t.amount, 0)
      };
    });

    return {
      total: transactions.length,
      successCount: completed.length,
      revenue: totalAmount,
      commission: totalCommission,
      byTypeDetail,
      dailyRevenue,
    };
  }, [transactions]);

  const chartConfig = {
    premium: { label: "Tier Premium", color: "#c96a2e" },
    standard: { label: "Tier Standard", color: "#e68a4d" },
    basic: { label: "Tier Basique", color: "#f5b792" },
    add_ons: { label: "Options", color: "#fbbf24" },
    photography: { label: "Photographie", color: "#8a4924" },
    boost: { label: "Boosts", color: "#3fa6d9" },
  } satisfies ChartConfig;

  const typeData = [
    { type: "premium", amount: stats.byTypeDetail.premium, fill: "var(--color-premium)" },
    { type: "standard", amount: stats.byTypeDetail.standard, fill: "var(--color-standard)" },
    { type: "basic", amount: stats.byTypeDetail.basic, fill: "var(--color-basic)" },
    { type: "add_ons", amount: stats.byTypeDetail.add_ons, fill: "var(--color-add_ons)" },
    { type: "photography", amount: stats.byTypeDetail.photography, fill: "var(--color-photography)" },
    { type: "boost", amount: stats.byTypeDetail.boost, fill: "var(--color-boost)" },
  ].filter((d) => d.amount > 0);

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900 tracking-tight">Gestion Financière</h1>
          <p className="text-neutral-500 font-medium mt-1">Analyse des revenus de Roogo.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="bg-green-50 px-4 py-2 rounded-2xl border border-green-100 flex items-center gap-2">
            <TrendUpIcon size={20} weight="bold" className="text-green-600" />
            <span className="text-sm font-bold text-green-700">+12% ce mois</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          { label: "Revenu Global", value: stats.revenue, icon: CreditCardIcon, sub: "Transactions finalisées", color: "green" },
          { label: "Frais de Service", value: stats.commission, icon: HandCoinsIcon, sub: "Commission Roogo", color: "primary" },
          { label: "Conversion", value: stats.total > 0 ? Math.round((stats.successCount / stats.total) * 100) : 0, icon: ChartBarIcon, sub: `Sur ${stats.total} tentatives`, suffix: "%", color: "neutral" }
        ].map((s, idx) => (
          <div key={idx} className="bg-white p-8 rounded-[40px] border border-neutral-100 shadow-sm relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
              <s.icon size={80} weight="fill" className="text-primary" />
            </div>
            <p className="text-[11px] font-bold text-neutral-400 uppercase tracking-widest mb-2">{s.label}</p>
            <p className="text-4xl font-black text-neutral-900">{s.value.toLocaleString()}{s.suffix || " FCFA"}</p>
            <p className={cn("text-xs font-bold mt-2 flex items-center gap-1", s.color === "green" ? "text-green-600" : s.color === "primary" ? "text-primary" : "text-neutral-400")}>
              {s.color === "green" && <CheckCircleIcon size={14} weight="fill" />} {s.sub}
            </p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white p-8 rounded-[40px] border border-neutral-100 shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-xl font-bold text-neutral-900">Activité Récente</h3>
            <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center text-primary"><TrendUpIcon size={24} weight="bold" /></div>
          </div>
          <div className="h-[280px] w-full">
            <ChartContainer config={chartConfig}>
              <BarChart data={stats.dailyRevenue}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 11, fontWeight: 700 }} dy={10} />
                <YAxis hide />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="premium" stackId="a" fill="var(--color-premium)" radius={[0, 0, 0, 0]} barSize={40} />
                <Bar dataKey="standard" stackId="a" fill="var(--color-standard)" radius={[0, 0, 0, 0]} barSize={40} />
                <Bar dataKey="basic" stackId="a" fill="var(--color-basic)" radius={[0, 0, 0, 0]} barSize={40} />
                <Bar dataKey="add_ons" stackId="a" fill="var(--color-add_ons)" radius={[0, 0, 0, 0]} barSize={40} />
                <Bar dataKey="photography" stackId="a" fill="var(--color-photography)" radius={[0, 0, 0, 0]} barSize={40} />
                <Bar dataKey="boost" stackId="a" fill="var(--color-boost)" radius={[4, 4, 0, 0]} barSize={40} />
              </BarChart>
            </ChartContainer>
          </div>
        </div>

        <div className="bg-white p-8 rounded-[40px] border border-neutral-100 shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-xl font-bold text-neutral-900">Répartition</h3>
            <div className="w-10 h-10 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-500"><RowsIcon size={24} weight="bold" /></div>
          </div>
          <div className="grow flex items-center justify-center h-[280px]">
            <ChartContainer config={chartConfig} className="w-full h-full max-w-[280px]">
              <PieChart>
                <ChartTooltip cursor={false} content={<ChartTooltipContent nameKey="type" hideLabel />} />
                <Pie data={typeData} dataKey="amount" nameKey="type" innerRadius={60} strokeWidth={5}>
                  {typeData.map((e, i) => <Cell key={`c-${i}`} fill={e.fill} />)}
                  <Label content={({ viewBox }) => viewBox && "cx" in viewBox && "cy" in viewBox && (
                    <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                      <tspan x={viewBox.cx} y={viewBox.cy} className="fill-neutral-900 text-2xl font-black">{stats.revenue.toLocaleString()}</tspan>
                      <tspan x={viewBox.cx} y={(viewBox.cy || 0) + 18} className="fill-neutral-400 text-[10px] font-bold uppercase">Total FCFA</tspan>
                    </text>
                  )} />
                </Pie>
              </PieChart>
            </ChartContainer>
          </div>
          <div className="mt-6 pt-6 border-t border-neutral-50 grid grid-cols-3 gap-4">
            {typeData.map((it) => (
              <div key={it.type} className="flex flex-col">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: it.fill }} />
                  <span className="text-[9px] font-black text-neutral-400 uppercase truncate">{chartConfig[it.type as keyof typeof chartConfig].label}</span>
                </div>
                <span className="text-sm font-black text-neutral-900">{stats.revenue > 0 ? Math.round((it.amount / stats.revenue) * 100) : 0}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative grow">
            <MagnifyingGlassIcon className="absolute left-5 top-1/2 -translate-y-1/2 text-neutral-400" size={20} weight="bold" />
            <input type="text" placeholder="Rechercher par ID, Téléphone ou Client..." className="w-full pl-12 pr-6 py-4 bg-white rounded-full border border-neutral-100 shadow-sm focus:ring-4 focus:ring-primary/5 focus:border-primary/20 outline-none transition-all text-[15px] font-medium" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          </div>
          <select className="px-6 py-4 bg-white rounded-full border border-neutral-100 shadow-sm text-[15px] font-bold text-neutral-600 outline-none cursor-pointer hover:border-primary/20 transition-all" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">Tous les statuts</option>
            <option value="completed">Réussis</option>
            <option value="pending">En attente</option>
            <option value="failed">Échoués</option>
          </select>
        </div>

        <div className="bg-transparent space-y-4 max-h-[600px] overflow-y-auto pr-2 pb-20 scrollbar-hide">
          {loading ? (
             <div className="py-20 text-center"><LightningIcon size={32} className="animate-spin text-neutral-300 mx-auto" /></div>
          ) : filteredTransactions.map((tx) => {
            const metadata = tx.metadata as TransactionMetadata;
            return (
              <div key={tx.id} className="bg-white rounded-[24px] p-6 border border-neutral-100 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                  {/* Service Info - 40% */}
                  <div className="flex items-start gap-4 flex-2 grow-2">
                    <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-sm", tx.type === "listing_submission" ? "bg-orange-50 text-orange-600" : tx.type === "photography" ? "bg-brown-50 text-amber-900" : "bg-blue-50 text-blue-600")}>
                      {tx.type === "listing_submission" ? <BuildingsIcon size={24} weight="fill" /> : tx.type === "photography" ? <CameraIcon size={24} weight="fill" /> : <LightningIcon size={24} weight="fill" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-base font-black text-neutral-900 leading-none">
                           {tx.type === "listing_submission" ? "Publication" : tx.type === "photography" ? "Photographie" : "Boost Visibilité"}
                        </p>
                        {metadata?.tier && <span className="text-[9px] bg-neutral-900 text-white px-2 py-0.5 rounded-full font-bold uppercase tracking-wide">{metadata.tier.name}</span>}
                      </div>
                      
                      <p className="text-[10px] text-neutral-300 font-bold mt-2 uppercase tracking-widest flex items-center gap-1">
                         ID: <span className="font-mono text-neutral-400">{tx.deposit_id.split("-")[0]}</span>
                      </p>
                    </div>
                  </div>

                  {/* Client & Property - 30% */}
                  <div className="flex flex-col gap-3 flex-1 border-l border-neutral-50 pl-6">
                    <div className="flex items-center gap-3">
                       <div className="w-8 h-8 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-400">
                          <UserCircleIcon size={20} weight="fill" />
                       </div>
                       <div>
                          <p className="text-sm font-bold text-neutral-900 leading-tight">{tx.user_name}</p>
                          <p className="text-[11px] text-neutral-400 font-medium">{tx.payer_phone}</p>
                       </div>
                    </div>
                    {tx.property_id && (
                       <Link href={`/admin/listings/${tx.property_id}`} className="flex items-center gap-2 group/link">
                          <div className="w-8 h-8 rounded-full bg-neutral-50 flex items-center justify-center text-neutral-400 group-hover/link:bg-primary/10 group-hover/link:text-primary transition-colors">
                             <MapPinIcon size={16} weight="bold" />
                          </div>
                          <span className="text-xs font-bold text-neutral-600 group-hover/link:text-primary transition-colors truncate max-w-[150px]">{tx.property_title}</span>
                       </Link>
                    )}
                  </div>

                  {/* Amount & Breakdown - 30% */}
                  <div className="flex flex-col items-end gap-3 flex-1 text-right pl-6 border-l border-neutral-50 min-w-[220px]">
                     {/* Detailed breakdown list */}
                     <div className="w-full space-y-1.5">
                        {metadata?.tier && (
                           <div className="flex items-center justify-between text-[10px] font-bold">
                             <div className="flex items-center gap-1.5 text-neutral-400 uppercase tracking-wider">
                               <BuildingsIcon size={12} />
                               <span>Publication ({metadata.tier.name})</span>
                             </div>
                             <span className="text-neutral-900">{metadata.tier.base_fee.toLocaleString()} F</span>
                           </div>
                        )}
                        {metadata?.add_ons?.map((a) => {
                           const Icon = ADD_ON_ICONS[a.id] || InfoIcon;
                           const label = ADD_ON_LABELS[a.id] || a.name;
                           return (
                             <div key={a.id} className="flex items-center justify-between text-[10px] font-bold">
                               <div className="flex items-center gap-1.5 text-neutral-400 uppercase tracking-wider">
                                 <Icon size={12} />
                                 <span>{label}</span>
                               </div>
                               <span className="text-neutral-900">{a.price.toLocaleString()} F</span>
                             </div>
                           );
                        })}
                        {metadata?.commission && (
                           <div className="flex items-center justify-between text-[10px] font-bold">
                             <div className="flex items-center gap-1.5 text-neutral-400 uppercase tracking-wider">
                               <HandCoinsIcon size={12} />
                               <span>Frais Service</span>
                             </div>
                             <span className="text-neutral-900">{metadata.commission.toLocaleString()} F</span>
                           </div>
                        )}
                     </div>

                     {/* Total Highlight */}
                     <div className="w-full pt-2 border-t border-neutral-100 flex items-baseline justify-between gap-4">
                        <span className="text-[10px] font-black text-neutral-400 uppercase tracking-[0.2em]">Total</span>
                        <p className="text-2xl font-black text-neutral-900 tracking-tight">
                           {tx.amount.toLocaleString()} <span className="text-[10px] text-neutral-400 font-bold uppercase">FCFA</span>
                        </p>
                     </div>

                     {/* Status & Provider */}
                     <div className="flex flex-col items-end gap-2 mt-1">
                        <div className="flex items-center gap-2">
                           <span className="text-[9px] font-bold text-neutral-300 uppercase tracking-widest">{tx.provider}</span>
                           <div className={cn("inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wide", tx.status === "completed" ? "bg-green-50 text-green-700 border border-green-100" : tx.status === "failed" ? "bg-red-50 text-red-700 border border-red-100" : "bg-orange-50 text-orange-700 border border-orange-100")}>
                              {tx.status === "completed" ? <CheckCircleIcon size={12} weight="fill" /> : tx.status === "failed" ? <XCircleIcon size={12} weight="fill" /> : <ClockIcon size={12} weight="fill" />}
                              {tx.status === "completed" ? "Paiement Réussi" : tx.status === "failed" ? "Échec" : "En Attente"}
                           </div>
                        </div>
                        <p className="text-[9px] text-neutral-300 font-bold">
                           {new Date(tx.created_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })} à {new Date(tx.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                        </p>
                     </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
