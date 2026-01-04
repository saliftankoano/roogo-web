"use client";

import { useState, useEffect, useMemo } from "react";
import { 
  Receipt, 
  MagnifyingGlass, 
  CheckCircle, 
  XCircle, 
  Clock, 
  ArrowUpRight,
  Phone,
  User,
  Buildings
} from "@phosphor-icons/react";
import { supabase } from "@/lib/supabase";
import { Transaction } from "@/lib/data";
import Link from "next/link";
import { cn } from "@/lib/utils";

export default function AdminTransactionsPage() {
  const [transactions, setTransactions] = useState<(Transaction & { user_name?: string, property_title?: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    async function loadTransactions() {
      // Fetch transactions with user and property details for better insights
      const { data, error } = await supabase
        .from("transactions")
        .select(`
          *,
          users:user_id (full_name),
          properties:property_id (title)
        `)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching transactions:", error);
      } else {
        const formattedData = data.map((tx: any) => ({
          ...tx,
          user_name: tx.users?.full_name || "Utilisateur inconnu",
          property_title: tx.properties?.title || "Non lié"
        }));
        setTransactions(formattedData);
      }
      setLoading(false);
    }
    loadTransactions();
  }, []);

  const filteredTransactions = useMemo(() => {
    return transactions.filter(tx => {
      const matchesSearch = 
        tx.deposit_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        tx.payer_phone.includes(searchQuery) ||
        tx.user_name?.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesStatus = statusFilter === "all" || tx.status === statusFilter;
      
      return matchesSearch && matchesStatus;
    });
  }, [transactions, searchQuery, statusFilter]);

  const stats = useMemo(() => {
    const completed = transactions.filter(t => t.status === "completed");
    const totalAmount = completed.reduce((sum, t) => sum + t.amount, 0);
    return {
      total: transactions.length,
      successCount: completed.length,
      revenue: totalAmount
    };
  }, [transactions]);

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900 tracking-tight">Flux Financier</h1>
          <p className="text-neutral-500 font-medium mt-1">Suivez toutes les transactions et revenus de la plateforme.</p>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <div className="bg-white p-8 rounded-[40px] border border-neutral-100 shadow-sm">
          <p className="text-[11px] font-bold text-neutral-400 uppercase tracking-widest mb-2">Revenu Total</p>
          <p className="text-3xl font-bold text-neutral-900">{stats.revenue.toLocaleString()} F</p>
          <p className="text-xs text-green-600 font-bold mt-2">Transactions réussies</p>
        </div>
        <div className="bg-white p-8 rounded-[40px] border border-neutral-100 shadow-sm">
          <p className="text-[11px] font-bold text-neutral-400 uppercase tracking-widest mb-2">Volume Transactions</p>
          <p className="text-3xl font-bold text-neutral-900">{stats.total}</p>
          <p className="text-xs text-neutral-400 font-bold mt-2">Toutes tentatives comprises</p>
        </div>
        <div className="bg-white p-8 rounded-[40px] border border-neutral-100 shadow-sm">
          <p className="text-[11px] font-bold text-neutral-400 uppercase tracking-widest mb-2">Taux de Succès</p>
          <p className="text-3xl font-bold text-neutral-900">
            {stats.total > 0 ? Math.round((stats.successCount / stats.total) * 100) : 0}%
          </p>
          <p className="text-xs text-neutral-400 font-bold mt-2">Global sur la plateforme</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-grow">
          <MagnifyingGlass className="absolute left-5 top-1/2 -translate-y-1/2 text-neutral-400" size={20} weight="bold" />
          <input
            type="text"
            placeholder="Rechercher par ID, Téléphone ou Nom..."
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

      {/* Transactions Table */}
      <div className="bg-white rounded-[40px] border border-neutral-100 shadow-sm overflow-hidden overflow-x-auto">
        <table className="w-full text-left min-w-[1000px]">
          <thead className="bg-neutral-50/50 border-b border-neutral-100">
            <tr>
              <th className="px-8 py-6 text-xs font-bold text-neutral-400 uppercase tracking-widest">Transaction</th>
              <th className="px-8 py-6 text-xs font-bold text-neutral-400 uppercase tracking-widest">Client</th>
              <th className="px-8 py-6 text-xs font-bold text-neutral-400 uppercase tracking-widest">Bien Lié</th>
              <th className="px-8 py-6 text-xs font-bold text-neutral-400 uppercase tracking-widest">Montant</th>
              <th className="px-8 py-6 text-xs font-bold text-neutral-400 uppercase tracking-widest">Statut</th>
              <th className="px-8 py-6 text-xs font-bold text-neutral-400 uppercase tracking-widest text-right">Date</th>
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
                <tr key={tx.id} className="hover:bg-neutral-50/30 transition-colors group">
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-primary/5 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-all">
                        <Receipt size={20} weight="bold" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-neutral-900 leading-tight">
                          {tx.type === 'listing_submission' ? 'Publication' : 'Photographie'}
                        </p>
                        <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider mt-1 font-mono">
                          ID: {tx.deposit_id.split('-')[0]}...
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <div>
                      <p className="text-sm font-bold text-neutral-900 leading-tight">{tx.user_name}</p>
                      <p className="text-xs text-neutral-500 flex items-center gap-1 mt-1 font-medium">
                        <Phone size={12} weight="bold" className="text-neutral-300" />
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
                        <Buildings size={16} weight="bold" />
                        <span className="truncate max-w-[150px]">{tx.property_title}</span>
                        <ArrowUpRight size={14} weight="bold" className="opacity-0 group-hover/link:opacity-100 transition-opacity" />
                      </Link>
                    ) : (
                      <span className="text-xs font-bold text-neutral-300 uppercase tracking-widest">Non lié</span>
                    )}
                  </td>
                  <td className="px-8 py-6">
                    <p className="text-sm font-bold text-neutral-900">{tx.amount.toLocaleString()} {tx.currency}</p>
                    <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider">{tx.provider}</p>
                  </td>
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-2">
                      {tx.status === 'completed' ? (
                        <CheckCircle size={18} weight="fill" className="text-green-500" />
                      ) : tx.status === 'failed' ? (
                        <XCircle size={18} weight="fill" className="text-red-500" />
                      ) : (
                        <Clock size={18} weight="fill" className="text-orange-400" />
                      )}
                      <span className={cn(
                        "text-[10px] font-bold uppercase tracking-widest",
                        tx.status === 'completed' ? "text-green-600" :
                        tx.status === 'failed' ? "text-red-600" : "text-orange-600"
                      )}>
                        {tx.status === 'completed' ? 'Réussi' :
                         tx.status === 'failed' ? 'Échoué' : 'En attente'}
                      </span>
                    </div>
                  </td>
                  <td className="px-8 py-6 text-right">
                    <p className="text-sm font-bold text-neutral-900">
                      {new Date(tx.created_at).toLocaleDateString('fr-FR', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric'
                      })}
                    </p>
                    <p className="text-xs text-neutral-400 font-medium">
                      {new Date(tx.created_at).toLocaleTimeString('fr-FR', {
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </p>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="px-8 py-32 text-center">
                  <div className="w-20 h-20 bg-neutral-50 rounded-full flex items-center justify-center mx-auto mb-6">
                    <Receipt size={40} className="text-neutral-300" />
                  </div>
                  <h3 className="text-xl font-bold text-neutral-900 mb-2">Aucune transaction trouvée</h3>
                  <p className="text-neutral-500 max-w-sm mx-auto font-medium">Ajustez vos filtres ou effectuez une nouvelle recherche.</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

