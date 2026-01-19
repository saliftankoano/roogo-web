"use client";

import { useState, useEffect } from "react";
import {
  FireIcon,
  EyeIcon,
  MapPinIcon,
  DeviceMobileIcon,
  TrendUpIcon,
} from "@phosphor-icons/react";
import Image from "next/image";
import Link from "next/link";

interface TrendingProperty {
  property_id: string;
  view_count: number;
  unique_viewers: number;
  title: string;
  price: number;
  address: string;
  imageUrl: string | null;
}

interface AnalyticsData {
  trending: TrendingProperty[];
  dailyStats: { view_date: string; total_views: number; unique_viewers: number }[];
  platformBreakdown: Record<string, number>;
  topCities: { city: string; count: number }[];
}

export default function AdminAnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadAnalytics() {
      try {
        const res = await fetch("/api/admin/analytics/views");
        if (!res.ok) throw new Error("Failed to fetch analytics");
        const json = await res.json();
        setData(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
      } finally {
        setLoading(false);
      }
    }
    loadAnalytics();
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 space-y-4">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        <p className="text-neutral-400 font-medium">Chargement des analytics...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-20">
        <p className="text-red-500 font-medium">{error}</p>
      </div>
    );
  }

  const totalViews24h = data?.platformBreakdown
    ? Object.values(data.platformBreakdown).reduce((a, b) => a + b, 0)
    : 0;

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900 tracking-tight">
            Analytics des Vues
          </h1>
          <p className="text-neutral-500 font-medium mt-1">
            Comprendre le comportement des utilisateurs sur Roogo.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="bg-orange-50 px-4 py-2 rounded-2xl border border-orange-100 flex items-center gap-2">
            <EyeIcon size={20} weight="bold" className="text-orange-600" />
            <span className="text-sm font-bold text-orange-700">
              {totalViews24h} vues (24h)
            </span>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-8 rounded-[40px] border border-neutral-100 shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
            <EyeIcon size={80} weight="fill" className="text-primary" />
          </div>
          <p className="text-[11px] font-bold text-neutral-400 uppercase tracking-widest mb-2">
            Vues Aujourd&apos;hui
          </p>
          <p className="text-4xl font-black text-neutral-900">{totalViews24h}</p>
          <p className="text-xs font-bold mt-2 flex items-center gap-1 text-green-600">
            <TrendUpIcon size={14} weight="fill" /> Dernières 24h
          </p>
        </div>

        <div className="bg-white p-8 rounded-[40px] border border-neutral-100 shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
            <FireIcon size={80} weight="fill" className="text-orange-500" />
          </div>
          <p className="text-[11px] font-bold text-neutral-400 uppercase tracking-widest mb-2">
            Proprietes Populaires
          </p>
          <p className="text-4xl font-black text-neutral-900">
            {data?.trending?.length || 0}
          </p>
          <p className="text-xs font-bold mt-2 flex items-center gap-1 text-orange-600">
            En tendance maintenant
          </p>
        </div>

        <div className="bg-white p-8 rounded-[40px] border border-neutral-100 shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
            <MapPinIcon size={80} weight="fill" className="text-blue-500" />
          </div>
          <p className="text-[11px] font-bold text-neutral-400 uppercase tracking-widest mb-2">
            Villes Actives
          </p>
          <p className="text-4xl font-black text-neutral-900">
            {data?.topCities?.length || 0}
          </p>
          <p className="text-xs font-bold mt-2 flex items-center gap-1 text-blue-600">
            Zones geographiques
          </p>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Trending Properties */}
        <div className="bg-white p-8 rounded-[40px] border border-neutral-100 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-bold text-neutral-900">
              Proprietes Populaires
            </h3>
            <div className="w-10 h-10 rounded-2xl bg-orange-50 flex items-center justify-center text-orange-500">
              <FireIcon size={24} weight="fill" />
            </div>
          </div>

          <div className="space-y-4">
            {data?.trending && data.trending.length > 0 ? (
              data.trending.map((prop, idx) => (
                <Link
                  href={`/admin/listings/${prop.property_id}`}
                  key={prop.property_id}
                  className="flex items-center gap-4 p-4 rounded-2xl hover:bg-neutral-50 transition-colors group"
                >
                  <div className="relative w-16 h-16 rounded-xl overflow-hidden bg-neutral-100 shrink-0">
                    {prop.imageUrl ? (
                      <Image
                        src={prop.imageUrl}
                        alt={prop.title}
                        fill
                        className="object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-neutral-300">
                        <EyeIcon size={24} />
                      </div>
                    )}
                    <div className="absolute top-1 left-1 bg-orange-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                      #{idx + 1}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-neutral-900 truncate group-hover:text-primary transition-colors">
                      {prop.title}
                    </p>
                    <p className="text-sm text-neutral-500 truncate">
                      {prop.address}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-bold text-neutral-900">
                      {prop.view_count}
                    </p>
                    <p className="text-[10px] text-neutral-400 uppercase tracking-wider">
                      vues
                    </p>
                  </div>
                </Link>
              ))
            ) : (
              <p className="text-neutral-400 text-center py-8">
                Pas encore de donnees de vues
              </p>
            )}
          </div>
        </div>

        {/* Geographic Breakdown */}
        <div className="bg-white p-8 rounded-[40px] border border-neutral-100 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-bold text-neutral-900">
              Villes les Plus Actives
            </h3>
            <div className="w-10 h-10 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-500">
              <MapPinIcon size={24} weight="fill" />
            </div>
          </div>

          <div className="space-y-4">
            {data?.topCities && data.topCities.length > 0 ? (
              data.topCities.map((city, idx) => (
                <div
                  key={city.city}
                  className="flex items-center justify-between p-4 rounded-2xl bg-neutral-50"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-sm">
                      {idx + 1}
                    </div>
                    <span className="font-bold text-neutral-900">
                      {city.city}
                    </span>
                  </div>
                  <span className="font-bold text-neutral-600">
                    {city.count} vues
                  </span>
                </div>
              ))
            ) : (
              <p className="text-neutral-400 text-center py-8">
                Pas encore de donnees geographiques
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Platform Breakdown */}
      <div className="bg-white p-8 rounded-[40px] border border-neutral-100 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold text-neutral-900">
            Repartition par Plateforme
          </h3>
          <div className="w-10 h-10 rounded-2xl bg-purple-50 flex items-center justify-center text-purple-500">
            <DeviceMobileIcon size={24} weight="fill" />
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {data?.platformBreakdown &&
          Object.keys(data.platformBreakdown).length > 0 ? (
            Object.entries(data.platformBreakdown).map(([platform, count]) => (
              <div
                key={platform}
                className="p-6 rounded-2xl bg-neutral-50 text-center"
              >
                <p className="text-3xl font-black text-neutral-900">{count}</p>
                <p className="text-xs font-bold text-neutral-400 uppercase tracking-wider mt-1">
                  {platform === "ios"
                    ? "iOS"
                    : platform === "android"
                      ? "Android"
                      : platform === "web"
                        ? "Web"
                        : platform}
                </p>
              </div>
            ))
          ) : (
            <p className="text-neutral-400 col-span-4 text-center py-8">
              Pas encore de donnees de plateforme
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
