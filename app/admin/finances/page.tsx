"use client";

import { useState, useEffect, useMemo } from "react";
import {
  ReceiptIcon,
  MagnifyingGlassIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  ArrowUpRightIcon,
  PhoneIcon,
  BuildingsIcon,
  ChartBarIcon,
  TrendUpIcon,
  CreditCardIcon,
  CameraIcon,
  LightningIcon,
  RowsIcon,
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

    // Revenue by type
    const byType = completed.reduce((acc, t) => {
      acc[t.type] = (acc[t.type] || 0) + t.amount;
      return acc;
    }, {} as Record<string, number>);

    // Revenue by day (last 7 days)
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      return d.toISOString().split("T")[0];
    });

    const dailyRevenue = last7Days.map((day) => {
      const amount = completed
        .filter((t) => t.created_at.startsWith(day))
        .reduce((sum, t) => sum + t.amount, 0);

      const date = new Date(day);
      const label = date.toLocaleDateString("fr-FR", {
        day: "2-digit",
        month: "short",
      });

      return { day: label, revenue: amount };
    });

    return {
      total: transactions.length,
      successCount: completed.length,
      revenue: totalAmount,
      byType,
      dailyRevenue,
    };
  }, [transactions]);

  const chartConfig = {
    revenue: {
      label: "Revenu",
      color: "#c96a2e",
    },
    listing_submission: {
      label: "Publications",
      color: "#c96a2e",
    },
    photography: {
      label: "Photos",
      color: "#8a4924",
    },
    boost: {
      label: "Boosts",
      color: "#3fa6d9",
    },
  } satisfies ChartConfig;

  const typeData = [
    {
      type: "listing_submission",
      amount: stats.byType.listing_submission || 0,
      fill: "var(--color-listing_submission)",
    },
    {
      type: "photography",
      amount: stats.byType.photography || 0,
      fill: "var(--color-photography)",
    },
    {
      type: "boost",
      amount: stats.byType.boost || 0,
      fill: "var(--color-boost)",
    },
  ].filter((d) => d.amount > 0);

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900 tracking-tight">
            Gestion Financière
          </h1>
          <p className="text-neutral-500 font-medium mt-1">
            Analyse des revenus et flux de trésorerie de Roogo.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="bg-green-50 px-4 py-2 rounded-2xl border border-green-100 flex items-center gap-2">
            <TrendUpIcon size={20} weight="bold" className="text-green-600" />
            <span className="text-sm font-bold text-green-700">
              +12% ce mois
            </span>
          </div>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-8 rounded-[40px] border border-neutral-100 shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
            <CreditCardIcon size={80} weight="fill" className="text-primary" />
          </div>
          <p className="text-[11px] font-bold text-neutral-400 uppercase tracking-widest mb-2">
            Revenu Global
          </p>
          <p className="text-4xl font-black text-neutral-900">
            {stats.revenue.toLocaleString()} F
          </p>
          <p className="text-xs text-green-600 font-bold mt-2 flex items-center gap-1">
            <CheckCircleIcon size={14} weight="fill" />
            Transactions finalisées
          </p>
        </div>

        <div className="bg-white p-8 rounded-[40px] border border-neutral-100 shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
            <ChartBarIcon size={80} weight="fill" className="text-primary" />
          </div>
          <p className="text-[11px] font-bold text-neutral-400 uppercase tracking-widest mb-2">
            Taux de Conversion
          </p>
          <p className="text-4xl font-black text-neutral-900">
            {stats.total > 0
              ? Math.round((stats.successCount / stats.total) * 100)
              : 0}
            %
          </p>
          <p className="text-xs text-neutral-400 font-bold mt-2">
            Sur {stats.total} tentatives
          </p>
        </div>

        <div className="bg-white p-8 rounded-[40px] border border-neutral-100 shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
            <LightningIcon size={80} weight="fill" className="text-primary" />
          </div>
          <p className="text-[11px] font-bold text-neutral-400 uppercase tracking-widest mb-2">
            Services Boost
          </p>
          <p className="text-4xl font-black text-neutral-900">
            {(stats.byType.boost || 0).toLocaleString()} F
          </p>
          <p className="text-xs text-primary font-bold mt-2">
            Nouveau levier de croissance
          </p>
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Daily Revenue Bar Chart */}
        <div className="bg-white p-8 rounded-[40px] border border-neutral-100 shadow-sm">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h3 className="text-xl font-bold text-neutral-900">
                Activité Récente
              </h3>
              <p className="text-xs text-neutral-400 font-bold uppercase tracking-widest mt-1">
                Revenu des 7 derniers jours
              </p>
            </div>
            <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
              <TrendUpIcon size={24} weight="bold" />
            </div>
          </div>

          <div className="h-[300px] w-full">
            <ChartContainer config={chartConfig}>
              <BarChart data={stats.dailyRevenue}>
                <CartesianGrid
                  vertical={false}
                  strokeDasharray="3 3"
                  stroke="#f0f0f0"
                />
                <XAxis
                  dataKey="day"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#94a3b8", fontSize: 12, fontWeight: 600 }}
                  dy={10}
                />
                <YAxis hide />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar
                  dataKey="revenue"
                  fill="var(--color-primary)"
                  radius={[10, 10, 0, 0]}
                  barSize={40}
                />
              </BarChart>
            </ChartContainer>
          </div>
        </div>

        {/* Revenue Breakdown Pie Chart */}
        <div className="bg-white p-8 rounded-[40px] border border-neutral-100 shadow-sm">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h3 className="text-xl font-bold text-neutral-900">
                Répartition
              </h3>
              <p className="text-xs text-neutral-400 font-bold uppercase tracking-widest mt-1">
                Par type de service
              </p>
            </div>
            <div className="w-10 h-10 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-500">
              <RowsIcon size={24} weight="bold" />
            </div>
          </div>

          <div className="h-[300px] w-full">
            <ChartContainer config={chartConfig} className="w-full h-full">
              <PieChart>
                <ChartTooltip
                  cursor={false}
                  content={<ChartTooltipContent nameKey="type" hideLabel />}
                />
                <Pie
                  data={typeData}
                  dataKey="amount"
                  nameKey="type"
                  innerRadius={60}
                  strokeWidth={5}
                >
                  {typeData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                  <Label
                    content={({ viewBox }) => {
                      if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                        return (
                          <text
                            x={viewBox.cx}
                            y={viewBox.cy}
                            textAnchor="middle"
                            dominantBaseline="middle"
                          >
                            <tspan
                              x={viewBox.cx}
                              y={viewBox.cy}
                              className="fill-neutral-900 text-2xl font-black"
                            >
                              {stats.revenue.toLocaleString()}
                            </tspan>
                            <tspan
                              x={viewBox.cx}
                              y={(viewBox.cy || 0) + 20}
                              className="fill-neutral-400 text-[10px] font-bold uppercase tracking-widest"
                            >
                              Total XOF
                            </tspan>
                          </text>
                        );
                      }
                    }}
                  />
                </Pie>
              </PieChart>
            </ChartContainer>
          </div>

          <div className="grid grid-cols-3 gap-4 mt-6">
            {typeData.map((item) => (
              <div key={item.type} className="flex flex-col items-center">
                <div className="flex items-center gap-2 mb-1">
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: item.fill }}
                  />
                  <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">
                    {chartConfig[item.type as keyof typeof chartConfig].label}
                  </span>
                </div>
                <span className="text-sm font-bold text-neutral-900">
                  {stats.revenue > 0
                    ? Math.round((item.amount / stats.revenue) * 100)
                    : 0}
                  %
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Filters & Table */}
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative grow">
            <MagnifyingGlassIcon
              className="absolute left-5 top-1/2 -translate-y-1/2 text-neutral-400"
              size={20}
              weight="bold"
            />
            <input
              type="text"
              placeholder="Rechercher par ID, Téléphone ou Client..."
              className="w-full pl-12 pr-6 py-4 bg-white rounded-full border border-neutral-100 shadow-sm focus:ring-4 focus:ring-primary/5 focus:border-primary/20 outline-none transition-all text-[15px] font-medium"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <select
            className="px-6 py-4 bg-white rounded-full border border-neutral-100 shadow-sm text-[15px] font-bold text-neutral-600 outline-none cursor-pointer hover:border-primary/20 transition-all"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">Tous les statuts</option>
            <option value="completed">Réussis</option>
            <option value="pending">En attente</option>
            <option value="failed">Échoués</option>
          </select>
        </div>

        <div className="bg-white rounded-[40px] border border-neutral-100 shadow-sm overflow-hidden overflow-x-auto">
          <table className="w-full text-left min-w-[1000px]">
            <thead className="bg-neutral-50/50 border-b border-neutral-100">
              <tr>
                <th className="px-8 py-6 text-xs font-bold text-neutral-400 uppercase tracking-widest">
                  Service
                </th>
                <th className="px-8 py-6 text-xs font-bold text-neutral-400 uppercase tracking-widest">
                  Client
                </th>
                <th className="px-8 py-6 text-xs font-bold text-neutral-400 uppercase tracking-widest">
                  Bien
                </th>
                <th className="px-8 py-6 text-xs font-bold text-neutral-400 uppercase tracking-widest">
                  Montant
                </th>
                <th className="px-8 py-6 text-xs font-bold text-neutral-400 uppercase tracking-widest">
                  Statut
                </th>
                <th className="px-8 py-6 text-xs font-bold text-neutral-400 uppercase tracking-widest text-right">
                  Date
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-50">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-8 py-20 text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                  </td>
                </tr>
              ) : filteredTransactions.length > 0 ? (
                filteredTransactions.map((tx) => (
                  <tr
                    key={tx.id}
                    className="hover:bg-neutral-50/30 transition-colors group"
                  >
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-3">
                        <div
                          className={cn(
                            "w-10 h-10 rounded-xl flex items-center justify-center transition-all",
                            tx.type === "listing_submission"
                              ? "bg-orange-50 text-orange-600"
                              : tx.type === "photography"
                              ? "bg-brown-50 text-amber-900"
                              : "bg-blue-50 text-blue-600"
                          )}
                        >
                          {tx.type === "listing_submission" ? (
                            <BuildingsIcon size={20} weight="bold" />
                          ) : tx.type === "photography" ? (
                            <CameraIcon size={20} weight="bold" />
                          ) : (
                            <LightningIcon size={20} weight="bold" />
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-neutral-900 leading-tight">
                            {tx.type === "listing_submission"
                              ? "Publication"
                              : tx.type === "photography"
                              ? "Photographie"
                              : "Boost"}
                          </p>
                          <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider mt-1 font-mono">
                            ID: {tx.deposit_id.split("-")[0]}...
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <div>
                        <p className="text-sm font-bold text-neutral-900 leading-tight">
                          {tx.user_name}
                        </p>
                        <p className="text-xs text-neutral-500 flex items-center gap-1 mt-1 font-medium">
                          <PhoneIcon
                            size={12}
                            weight="bold"
                            className="text-neutral-300"
                          />
                          {tx.payer_phone}
                        </p>
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      {tx.property_id ? (
                        <Link
                          href={`/admin/listings/${tx.property_id}`}
                          className="flex items-center gap-2 text-sm font-bold text-primary hover:underline group/link"
                        >
                          <BuildingsIcon size={16} weight="bold" />
                          <span className="truncate max-w-[150px]">
                            {tx.property_title}
                          </span>
                          <ArrowUpRightIcon
                            size={14}
                            weight="bold"
                            className="opacity-0 group-hover/link:opacity-100 transition-opacity"
                          />
                        </Link>
                      ) : (
                        <span className="text-xs font-bold text-neutral-300 uppercase tracking-widest">
                          Non lié
                        </span>
                      )}
                    </td>
                    <td className="px-8 py-6">
                      <p className="text-sm font-bold text-neutral-900">
                        {tx.amount.toLocaleString()} {tx.currency}
                      </p>
                      <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider">
                        {tx.provider}
                      </p>
                    </td>
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-2">
                        {tx.status === "completed" ? (
                          <CheckCircleIcon
                            size={18}
                            weight="fill"
                            className="text-green-500"
                          />
                        ) : tx.status === "failed" ? (
                          <XCircleIcon
                            size={18}
                            weight="fill"
                            className="text-red-500"
                          />
                        ) : (
                          <ClockIcon
                            size={18}
                            weight="fill"
                            className="text-orange-400"
                          />
                        )}
                        <span
                          className={cn(
                            "text-[10px] font-bold uppercase tracking-widest",
                            tx.status === "completed"
                              ? "text-green-600"
                              : tx.status === "failed"
                              ? "text-red-600"
                              : "text-orange-600"
                          )}
                        >
                          {tx.status === "completed"
                            ? "Réussi"
                            : tx.status === "failed"
                            ? "Échoué"
                            : "En attente"}
                        </span>
                      </div>
                    </td>
                    <td className="px-8 py-6 text-right">
                      <p className="text-sm font-bold text-neutral-900">
                        {new Date(tx.created_at).toLocaleDateString("fr-FR", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </p>
                      <p className="text-xs text-neutral-400 font-medium">
                        {new Date(tx.created_at).toLocaleTimeString("fr-FR", {
                          hour: "2-digit",
                          minute: "2-digit",
                          hour12: false,
                        })}
                      </p>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-8 py-32 text-center">
                    <div className="w-20 h-20 bg-neutral-50 rounded-full flex items-center justify-center mx-auto mb-6">
                      <ReceiptIcon size={40} className="text-neutral-300" />
                    </div>
                    <h3 className="text-xl font-bold text-neutral-900 mb-2">
                      Aucune transaction trouvée
                    </h3>
                    <p className="text-neutral-500 max-w-sm mx-auto font-medium">
                      Ajustez vos filtres ou effectuez une nouvelle recherche.
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
