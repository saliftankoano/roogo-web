"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircleIcon, XCircleIcon } from "@phosphor-icons/react";
import { getListingIndexCheck } from "@/app/admin/annonces/[id]/actions";
import { checkListingQuality } from "@/lib/listing-quality";
import {
  INDEX_HEALTH_LABELS,
  coverageStateLabel,
  indexHealth,
} from "@/lib/listing-index";
import { cn } from "@/lib/utils";

type IndexCheck = Awaited<ReturnType<typeof getListingIndexCheck>>;

// Sidebar card on the admin listing page: the quality minimum checked by the
// status route before publishing, and, once live, Google's latest answer.
export function ListingReadinessCard({
  propertyId,
  description,
  photoCount,
  isLive,
  isTest,
}: {
  propertyId: string;
  description: string;
  photoCount: number;
  isLive: boolean;
  isTest: boolean;
}) {
  const [indexCheck, setIndexCheck] = useState<IndexCheck>(null);

  useEffect(() => {
    if (!isLive) return;
    let cancelled = false;
    getListingIndexCheck(propertyId)
      .then((check) => {
        if (!cancelled) setIndexCheck(check);
      })
      .catch((error) => {
        console.error("[listing-index] card load failed", {
          propertyId,
          message: (error as Error).message,
        });
      });
    return () => {
      cancelled = true;
    };
  }, [propertyId, isLive]);

  const checks = checkListingQuality({ description, photoCount });
  const ready = checks.every((check) => check.ok);
  const health = indexHealth(indexCheck, new Date());

  return (
    <section className="bg-white p-6 rounded-[32px] border border-neutral-100 shadow-sm space-y-4">
      <div>
        <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">
          {isLive ? "Qualité de l'annonce" : "Prêt pour la mise en ligne"}
        </p>
        <p className="mt-1 text-sm font-bold text-neutral-900">
          {ready
            ? "Annonce complète"
            : isTest
              ? "Incomplète (annonce test, publication autorisée)"
              : isLive
                ? "En ligne mais incomplète : à compléter"
                : "À compléter avant la mise en ligne"}
        </p>
      </div>
      <ul className="space-y-2">
        {checks.map((check) => (
          <li key={check.id} className="flex items-center gap-2 text-sm">
            {check.ok ? (
              <CheckCircleIcon size={18} weight="fill" className="shrink-0 text-green-600" />
            ) : (
              <XCircleIcon size={18} weight="fill" className="shrink-0 text-red-500" />
            )}
            <span className={cn("font-medium", check.ok ? "text-neutral-600" : "text-neutral-900")}>
              {check.label}
            </span>
            <span className="ml-auto text-xs font-bold text-neutral-400">
              {check.current} / {check.required}
            </span>
          </li>
        ))}
      </ul>
      {isLive && (
        <div className="border-t border-neutral-100 pt-4">
          <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Google</p>
          <p className="mt-1 text-sm font-bold text-neutral-900">{INDEX_HEALTH_LABELS[health]}</p>
          {indexCheck?.coverage_state && (
            <p className="mt-1 text-xs text-neutral-500">
              {coverageStateLabel(indexCheck.coverage_state)}, vérifié le{" "}
              {new Date(indexCheck.checked_at).toLocaleDateString("fr-FR", {
                day: "numeric",
                month: "short",
              })}
            </p>
          )}
          <Link
            href="/admin/annonces/google"
            className="mt-2 inline-block text-xs font-bold text-primary hover:underline"
          >
            Toutes les annonces sur Google
          </Link>
        </div>
      )}
    </section>
  );
}
