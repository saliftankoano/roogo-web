"use client";

import { useState, useEffect } from "react";
import {
  LockIcon,
  UserIcon,
  MapPinIcon,
  CalendarIcon,
  ClockIcon,
  CheckCircleIcon,
  ArrowClockwiseIcon,
  PhoneIcon,
} from "@phosphor-icons/react";
import { supabase } from "@/lib/supabase";
import Image from "next/image";
import { formatPrice } from "@/lib/utils";

interface LockedProperty {
  id: string;
  locked_at: string;
  expires_at: string;
  status: string;
  lock_fee: number;
  renter: {
    id: string;
    full_name: string;
    email: string;
    phone: string;
  };
  property: {
    id: string;
    address: string;
    price: number;
    images: Array<{ url: string; is_primary: boolean }>;
  };
}

export default function AdminLocksPage() {
  const [locks, setLocks] = useState<LockedProperty[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    fetchLocks();
  }, []);

  async function fetchLocks() {
    try {
      setLoading(true);

      const { data, error } = await supabase
        .from("property_locks")
        .select(
          `
          *,
          renter:users (
            id,
            full_name,
            email,
            phone
          ),
          property:properties (
            id,
            address,
            price,
            images:property_images (
              url,
              is_primary
            )
          )
        `
        )
        .eq("status", "active")
        .order("locked_at", { ascending: false });

      if (error) {
        throw error;
      }
      setLocks(data || []);
    } catch (error) {
      console.error("Error fetching locks:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleFinalize(lockId: string) {
    if (
      !confirm(
        "Voulez-vous marquer ce bien comme LOUÉ ? Cette action informera les deux parties."
      )
    )
      return;

    try {
      setProcessingId(lockId);
      const response = await fetch(`/api/admin/locks/${lockId}/finalize`, {
        method: "POST",
      });
      if (!response.ok) throw new Error("Failed to finalize");

      await fetchLocks();
    } catch (error) {
      console.error("Finalize error:", error);
      alert("Une erreur est survenue lors de la finalisation.");
    } finally {
      setProcessingId(null);
    }
  }

  async function handleReopen(lockId: string) {
    if (
      !confirm(
        "Voulez-vous réouvrir ce bien aux candidatures ? La réservation actuelle sera annulée."
      )
    )
      return;

    try {
      setProcessingId(lockId);
      const response = await fetch(`/api/admin/locks/${lockId}/reopen`, {
        method: "POST",
      });
      if (!response.ok) throw new Error("Failed to reopen");

      await fetchLocks();
    } catch (error) {
      console.error("Reopen error:", error);
      alert("Une erreur est survenue lors de la réouverture.");
    } finally {
      setProcessingId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900 tracking-tight">
            Réservations Early Bird
          </h1>
          <p className="text-neutral-500 mt-2 font-medium">
            Gérez les propriétés actuellement verrouillées par les locataires.
          </p>
        </div>
        <div className="bg-primary/10 px-4 py-2 rounded-full border border-primary/20">
          <span className="text-primary font-bold text-sm">
            {locks.length} Réservations actives
          </span>
        </div>
      </div>

      {locks.length === 0 ? (
        <div className="bg-white rounded-[40px] p-20 border border-neutral-100 shadow-sm text-center">
          <div className="w-20 h-20 bg-neutral-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <LockIcon size={40} className="text-neutral-300" />
          </div>
          <h3 className="text-xl font-bold text-neutral-900 mb-2">
            Aucune réservation active
          </h3>
          <p className="text-neutral-500 max-w-sm mx-auto">
            Toutes les réservations ont été traitées ou sont expirées.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {locks.map((lock) => {
            const lockedAt = new Date(lock.locked_at);
            const expiresAt = new Date(lock.expires_at);
            const now = new Date();
            const daysLeft = Math.ceil(
              (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
            );

            return (
              <div
                key={lock.id}
                className="bg-white rounded-[32px] border border-neutral-100 shadow-sm overflow-hidden flex flex-col md:flex-row"
              >
                {/* Property Thumbnail */}
                <div className="w-full md:w-64 h-48 md:h-auto relative">
                  <Image
                    src={
                      lock.property.images?.find((img) => img.is_primary)
                        ?.url ||
                      lock.property.images?.[0]?.url ||
                      "/buy.png"
                    }
                    alt={lock.property.address}
                    fill
                    className="object-cover"
                  />
                  <div className="absolute top-4 left-4 bg-primary px-3 py-1 rounded-full shadow-lg">
                    <span className="text-white font-bold text-[10px] uppercase tracking-wider">
                      Locked
                    </span>
                  </div>
                </div>

                {/* Details */}
                <div className="flex-1 p-8 flex flex-col justify-between">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Property & Renter Info */}
                    <div className="space-y-6">
                      <div>
                        <div className="flex items-center gap-2 text-primary font-bold text-xs uppercase tracking-widest mb-2">
                          <MapPinIcon size={14} />
                          <span>Propriété</span>
                        </div>
                        <h3 className="text-xl font-bold text-neutral-900">
                          {lock.property.address}
                        </h3>
                        <p className="text-neutral-500 font-medium">
                          {formatPrice(lock.property.price)} XOF / mois
                        </p>
                      </div>

                      <div className="bg-neutral-50 rounded-2xl p-4 flex items-center gap-4 border border-neutral-100">
                        <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center border border-neutral-100">
                          <UserIcon size={20} className="text-neutral-400" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-neutral-400 uppercase tracking-tighter">
                            Locataire
                          </p>
                          <p className="text-neutral-900 font-bold">
                            {lock.renter.full_name}
                          </p>
                          <div className="flex items-center gap-3 mt-1">
                            <a
                              href={`tel:${lock.renter.phone}`}
                              className="text-primary flex items-center gap-1 text-sm font-bold hover:underline"
                            >
                              <PhoneIcon size={12} />
                              {lock.renter.phone}
                            </a>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Timeline & Status */}
                    <div className="space-y-6">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-neutral-50 rounded-2xl p-4 border border-neutral-100">
                          <div className="flex items-center gap-2 text-neutral-400 mb-1">
                            <CalendarIcon size={14} />
                            <span className="text-[10px] font-bold uppercase tracking-widest">
                              Le
                            </span>
                          </div>
                          <p className="text-neutral-900 font-bold">
                            {lockedAt.toLocaleDateString()}
                          </p>
                        </div>
                        <div
                          className={`rounded-2xl p-4 border ${
                            daysLeft <= 2
                              ? "bg-red-50 border-red-100"
                              : "bg-green-50 border-green-100"
                          }`}
                        >
                          <div
                            className={`flex items-center gap-2 mb-1 ${
                              daysLeft <= 2 ? "text-red-400" : "text-green-400"
                            }`}
                          >
                            <ClockIcon size={14} />
                            <span className="text-[10px] font-bold uppercase tracking-widest">
                              Expire dans
                            </span>
                          </div>
                          <p
                            className={`font-bold ${
                              daysLeft <= 2 ? "text-red-600" : "text-green-600"
                            }`}
                          >
                            {daysLeft} jours
                          </p>
                        </div>
                      </div>

                      <div className="bg-primary/5 rounded-2xl p-4 border border-primary/10">
                        <p className="text-[10px] font-bold text-primary uppercase tracking-widest mb-1">
                          Frais de réservation
                        </p>
                        <p className="text-2xl font-black text-primary">
                          {formatPrice(lock.lock_fee)} XOF
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col sm:flex-row gap-4 mt-8 pt-8 border-t border-neutral-100">
                    <button
                      onClick={() => handleFinalize(lock.id)}
                      disabled={!!processingId}
                      className="flex-1 bg-primary text-white py-4 px-6 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 disabled:opacity-50"
                    >
                      {processingId === lock.id ? (
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                      ) : (
                        <>
                          <CheckCircleIcon size={20} />
                          <span>Marquer comme Loué</span>
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => handleReopen(lock.id)}
                      disabled={!!processingId}
                      className="flex-1 bg-neutral-100 text-neutral-600 py-4 px-6 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-neutral-200 transition-all disabled:opacity-50"
                    >
                      {processingId === lock.id ? (
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-neutral-400"></div>
                      ) : (
                        <>
                          <ArrowClockwiseIcon size={20} />
                          <span>Réouvrir aux candidatures</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
