"use client";

import { Skeleton } from "@/components/ui/skeleton";

// ─── Utilisateurs ─────────────────────────────────────────────────────────────

export function KpiStripSkeleton() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-24 rounded-2xl" />
      ))}
    </div>
  );
}

export function UserCardSkeleton() {
  return (
    <div className="bg-white p-4 rounded-2xl border border-neutral-100 flex flex-col gap-3">
      {/* Avatar + name + type pill */}
      <div className="flex items-center gap-3">
        <Skeleton className="w-12 h-12 rounded-full shrink-0" />
        <div className="flex-1 flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-32 rounded-md" />
            <Skeleton className="h-4 w-16 rounded-md" />
          </div>
          <Skeleton className="h-3 w-44 rounded-md" />
        </div>
      </div>
      {/* Meta chips: city + source */}
      <div className="flex gap-1.5">
        <Skeleton className="h-5 w-24 rounded-md" />
        <Skeleton className="h-5 w-20 rounded-md" />
      </div>
      {/* Intent strip */}
      <div className="border-l-[3px] border-neutral-100 pl-3 flex flex-col gap-1.5">
        <Skeleton className="h-2.5 w-20 rounded-sm" />
        <Skeleton className="h-4 w-full rounded-md" />
        <Skeleton className="h-4 w-4/5 rounded-md" />
      </div>
      {/* Footer */}
      <div className="border-t border-neutral-50 pt-2.5 flex flex-col gap-2">
        <Skeleton className="h-8 w-full rounded-lg" />
        <div className="flex gap-1.5">
          <Skeleton className="flex-1 h-7 rounded-lg" />
          <Skeleton className="w-8 h-7 rounded-lg" />
          <Skeleton className="w-8 h-7 rounded-lg" />
        </div>
      </div>
    </div>
  );
}

export function UserGridSkeleton() {
  return (
    <div className="space-y-8">
      <KpiStripSkeleton />
      {/* Calendar placeholder */}
      <Skeleton className="h-64 rounded-[40px]" />
      {/* Card grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <UserCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

// ─── Annonces (property list) ─────────────────────────────────────────────────

export function PropertyCardSkeleton() {
  return (
    <div className="bg-white rounded-[32px] border border-neutral-100 overflow-hidden">
      <Skeleton className="aspect-[4/3] w-full" style={{ borderRadius: 0 }} />
      <div className="p-5 flex flex-col gap-3">
        <Skeleton className="h-4 w-28 rounded-md" />
        <Skeleton className="h-5 w-3/4 rounded-md" />
        <Skeleton className="h-3 w-full rounded-md" />
        <Skeleton className="h-3 w-2/3 rounded-md" />
        <div className="flex gap-4 mt-1">
          <Skeleton className="h-3 w-12 rounded-md" />
          <Skeleton className="h-3 w-12 rounded-md" />
          <Skeleton className="h-3 w-12 rounded-md" />
        </div>
      </div>
    </div>
  );
}

export function PropertyGridSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
      {Array.from({ length: 6 }).map((_, i) => (
        <PropertyCardSkeleton key={i} />
      ))}
    </div>
  );
}

// ─── Candidatures (application rows) ─────────────────────────────────────────

export function ApplicationRowSkeleton() {
  return (
    <div className="flex items-center gap-4 p-5">
      <Skeleton className="w-10 h-10 rounded-xl shrink-0" />
      <div className="flex-1 flex flex-col gap-1.5">
        <Skeleton className="h-4 w-32 rounded-md" />
        <Skeleton className="h-3 w-24 rounded-md" />
      </div>
      <div className="hidden sm:flex flex-1 flex-col gap-1.5">
        <Skeleton className="h-4 w-36 rounded-md" />
        <Skeleton className="h-3 w-24 rounded-md" />
      </div>
      <Skeleton className="hidden md:block h-3 w-20 rounded-md" />
      <Skeleton className="h-7 w-24 rounded-xl shrink-0" />
    </div>
  );
}

export function ApplicationListSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="bg-white rounded-[32px] border border-neutral-100 divide-y divide-neutral-50 overflow-hidden">
      {Array.from({ length: count }).map((_, i) => (
        <ApplicationRowSkeleton key={i} />
      ))}
    </div>
  );
}

// ─── Analytiques ──────────────────────────────────────────────────────────────

function StatTileSkeleton() {
  return (
    <div className="bg-white p-8 rounded-[40px] border border-neutral-100 flex flex-col gap-3">
      <Skeleton className="h-3 w-24 rounded-md" />
      <Skeleton className="h-10 w-20 rounded-md" />
      <Skeleton className="h-3 w-32 rounded-md" />
    </div>
  );
}

function ListRowSkeleton({ wide }: { wide?: boolean }) {
  return (
    <div className="flex items-center gap-4 p-4">
      {wide && <Skeleton className="w-16 h-16 rounded-xl shrink-0" />}
      {!wide && <Skeleton className="w-8 h-8 rounded-full shrink-0" />}
      <div className="flex-1 flex flex-col gap-1.5">
        <Skeleton className="h-4 w-40 rounded-md" />
        <Skeleton className="h-3 w-24 rounded-md" />
      </div>
      <Skeleton className="h-4 w-16 rounded-md shrink-0" />
    </div>
  );
}

export function AnalyticsSkeleton() {
  return (
    <div className="space-y-8">
      {/* 3 stat tiles */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {Array.from({ length: 3 }).map((_, i) => <StatTileSkeleton key={i} />)}
      </div>
      {/* Trending + cities */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white p-8 rounded-[40px] border border-neutral-100">
          <Skeleton className="h-4 w-32 rounded-md mb-6" />
          {Array.from({ length: 5 }).map((_, i) => <ListRowSkeleton key={i} wide />)}
        </div>
        <div className="bg-white p-8 rounded-[40px] border border-neutral-100">
          <Skeleton className="h-4 w-32 rounded-md mb-6" />
          {Array.from({ length: 5 }).map((_, i) => <ListRowSkeleton key={i} />)}
        </div>
      </div>
      {/* Platform tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white p-6 rounded-2xl border border-neutral-100 flex flex-col gap-2">
            <Skeleton className="h-8 w-16 rounded-md" />
            <Skeleton className="h-3 w-20 rounded-md" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Finances ─────────────────────────────────────────────────────────────────

function TransactionCardSkeleton() {
  return (
    <div className="bg-white rounded-[24px] p-6 border border-neutral-100 flex flex-col md:flex-row items-start gap-6">
      <div className="flex items-center gap-4 flex-1">
        <Skeleton className="w-12 h-12 rounded-2xl shrink-0" />
        <div className="flex flex-col gap-1.5 flex-1">
          <Skeleton className="h-4 w-32 rounded-md" />
          <Skeleton className="h-3 w-24 rounded-md" />
          <Skeleton className="h-3 w-40 rounded-md" />
        </div>
      </div>
      <div className="flex flex-col gap-1.5 flex-1">
        <Skeleton className="h-4 w-28 rounded-md" />
        <Skeleton className="h-3 w-20 rounded-md" />
      </div>
      <div className="flex flex-col gap-1.5 items-end shrink-0">
        <Skeleton className="h-6 w-28 rounded-md" />
        <Skeleton className="h-3 w-20 rounded-md" />
        <Skeleton className="h-5 w-16 rounded-xl" />
      </div>
    </div>
  );
}

export function FinanceSkeleton() {
  return (
    <div className="space-y-8">
      {/* 3 stat tiles */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {Array.from({ length: 3 }).map((_, i) => <StatTileSkeleton key={i} />)}
      </div>
      {/* Chart area */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Skeleton className="h-72 rounded-[40px]" />
        <Skeleton className="h-72 rounded-[40px]" />
      </div>
      {/* Transaction list */}
      <div className="space-y-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <TransactionCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

// ─── Annonces detail ──────────────────────────────────────────────────────────

export function PropertyDetailSkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
      {/* Left: main content */}
      <div className="lg:col-span-2 space-y-6">
        {/* Photo grid */}
        <div className="bg-white p-8 rounded-[32px] border border-neutral-100">
          <Skeleton className="h-5 w-32 rounded-md mb-6" />
          <div className="grid grid-cols-3 gap-3">
            <Skeleton className="aspect-square rounded-xl col-span-2 row-span-2" />
            <Skeleton className="aspect-square rounded-xl" />
            <Skeleton className="aspect-square rounded-xl" />
          </div>
        </div>
        {/* Info block */}
        <div className="bg-white p-8 rounded-[32px] border border-neutral-100 flex flex-col gap-5">
          <Skeleton className="h-5 w-48 rounded-md" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-2xl" />
            ))}
          </div>
          <Skeleton className="h-3 w-full rounded-md" />
          <Skeleton className="h-3 w-5/6 rounded-md" />
          <Skeleton className="h-3 w-4/6 rounded-md" />
          <div className="flex flex-wrap gap-2 mt-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-7 w-20 rounded-full" />
            ))}
          </div>
        </div>
        {/* Open house block */}
        <Skeleton className="h-48 rounded-[32px]" />
      </div>
      {/* Right: sidebar */}
      <div className="space-y-6">
        <div className="bg-white p-8 rounded-[32px] border border-neutral-100 flex flex-col gap-3">
          <Skeleton className="h-3 w-16 rounded-md" />
          <Skeleton className="h-10 w-40 rounded-md" />
          <Skeleton className="h-3 w-24 rounded-md" />
        </div>
        <div className="bg-white rounded-[32px] border border-neutral-100 overflow-hidden">
          <Skeleton className="h-32 w-full" style={{ borderRadius: 0 }} />
          <div className="p-6 flex flex-col gap-3">
            <Skeleton className="h-5 w-36 rounded-md" />
            <Skeleton className="h-3 w-28 rounded-md" />
            <Skeleton className="h-3 w-32 rounded-md" />
            <Skeleton className="h-3 w-24 rounded-md" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Generic section blocks ───────────────────────────────────────────────────

export function SectionBlocksSkeleton({ count = 3, height = "h-40" }: { count?: number; height?: string }) {
  return (
    <div className="space-y-6">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className={`${height} rounded-[40px]`} />
      ))}
    </div>
  );
}
