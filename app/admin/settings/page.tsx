"use client";

import { MIN_DEPOSIT_AMOUNT } from "@/lib/payment-limits";
import { useState, useEffect } from "react";
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import {
  CurrencyCircleDollarIcon,
  FloppyDiskIcon,
  SpinnerGapIcon,
  CheckCircleIcon,
  WarningCircleIcon,
  InfoIcon,
  XIcon,
} from "@phosphor-icons/react";

interface Tier {
  id: string;
  name: string;
  photo_limit: number;
  slot_limit: number;
  video_included: boolean;
  open_house_limit: number;
  has_badge: boolean;
  min_price: number;
  created_at: string;
}

interface Addon {
  id: string;
  name: string;
  description: string;
  price: number;
  icon: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export default function AdminSettingsPage() {
  const { user, isLoaded } = useUser();
  const router = useRouter();
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [addons, setAddons] = useState<Addon[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [showInfoModal, setShowInfoModal] = useState(false);

  // Redirect if not founder
  useEffect(() => {
    if (isLoaded && user?.publicMetadata?.userType !== "founder") {
      router.push("/admin");
    }
  }, [isLoaded, user, router]);

  // Load pricing data
  useEffect(() => {
    async function loadPricing() {
      try {
        const response = await fetch("/api/admin/pricing");
        if (!response.ok) throw new Error("Failed to load pricing");
        const data = await response.json();
        setTiers(data.tiers || []);
        setAddons(data.addons || []);
      } catch (error) {
        console.error("Error loading pricing:", error);
        setMessage({
          type: "error",
          text: "Erreur lors du chargement des prix",
        });
      }
      setLoading(false);
    }
    if (isLoaded && user?.publicMetadata?.userType === "founder") {
      loadPricing();
    }
  }, [isLoaded, user]);

  const handleTierPriceChange = (tierId: string, newPrice: string) => {
    const price = parseFloat(newPrice);
    if (isNaN(price) || price < 0) return;

    setTiers(
      tiers.map((tier) =>
        tier.id === tierId ? { ...tier, min_price: price } : tier
      )
    );
  };

  const handleAddonPriceChange = (addonId: string, newPrice: string) => {
    const price = parseFloat(newPrice);
    if (isNaN(price) || price < 0) return;

    setAddons(
      addons.map((addon) =>
        addon.id === addonId ? { ...addon, price } : addon
      )
    );
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);

    try {
      const response = await fetch("/api/admin/pricing", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tiers: tiers.map((t) => ({ id: t.id, min_price: t.min_price })),
          addons: addons.map((a) => ({ id: a.id, price: a.price })),
        }),
      });

      if (!response.ok) throw new Error("Failed to save pricing");

      const result = await response.json();

      if (result.errors && result.errors.length > 0) {
        setMessage({
          type: "error",
          text: `Certaines mises à jour ont échoué: ${result.errors.length} erreur(s)`,
        });
      } else {
        setMessage({ type: "success", text: "Prix mis à jour avec succès!" });
      }
    } catch (error) {
      console.error("Error saving pricing:", error);
      setMessage({
        type: "error",
        text: "Erreur lors de la sauvegarde des prix",
      });
    }

    setSaving(false);
  };

  if (!isLoaded || loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <SpinnerGapIcon className="w-8 h-8 animate-spin text-neutral-400" />
      </div>
    );
  }

  if (user?.publicMetadata?.userType !== "founder") {
    return null;
  }

  return (
    <div className="space-y-8 relative">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900">
            Paramètres de Prix
          </h1>
          <p className="text-neutral-600 mt-2">
            Gérer les prix des forfaits et des options
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowInfoModal(true)}
            className="flex items-center gap-2 px-4 py-3 bg-white border border-neutral-200 text-neutral-700 rounded-lg hover:bg-neutral-50 transition-colors"
          >
            <InfoIcon className="w-5 h-5" />
            <span className="hidden sm:inline">Info Limites</span>
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? (
              <>
                <SpinnerGapIcon className="w-5 h-5 animate-spin" />
                Sauvegarde...
              </>
            ) : (
              <>
                <FloppyDiskIcon className="w-5 h-5" />
                Enregistrer
              </>
            )}
          </button>
        </div>
      </div>

      {/* Dynamic Pricing Preview */}
      <div className="bg-neutral-50 border border-neutral-200 rounded-2xl p-6 shadow-sm">
        <h3 className="text-lg font-bold text-neutral-900 mb-6 flex items-center gap-2">
          <div className="p-2 bg-white rounded-lg border border-neutral-200 shadow-sm">
            <CurrencyCircleDollarIcon className="w-5 h-5 text-neutral-700" />
          </div>
          Simulation de Prix
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {tiers.map((tier) => {
            const sampleRent = 100000;
            const commission = sampleRent * 0.05;
            const total = tier.min_price + commission;

            return (
              <div
                key={`preview-${tier.id}`}
                className="bg-white p-5 rounded-xl border border-neutral-200 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-neutral-100">
                  <div className="font-bold text-neutral-900 text-lg">
                    {tier.name}
                  </div>
                  {tier.has_badge && (
                    <span className="px-2 py-1 bg-neutral-900 text-white text-[10px] font-bold uppercase tracking-wider rounded-full">
                      Premium
                    </span>
                  )}
                </div>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between text-neutral-600">
                    <span>Frais de base</span>
                    <span className="font-medium text-neutral-900">
                      {tier.min_price.toLocaleString()} XOF
                    </span>
                  </div>
                  <div className="flex justify-between text-neutral-600">
                    <span>Commission (5%)</span>
                    <span className="font-medium text-neutral-900">
                      {commission.toLocaleString()} XOF
                    </span>
                  </div>
                  <div className="flex justify-between text-neutral-400 text-xs pt-1">
                    <span>Base loyer: {sampleRent.toLocaleString()} XOF</span>
                  </div>
                  <div className="flex justify-between items-center pt-3 mt-1 border-t border-neutral-100">
                    <span className="font-semibold text-neutral-700">
                      Total Client
                    </span>
                    <span className="font-bold text-lg text-neutral-900">
                      {total.toLocaleString()} XOF
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-xs text-neutral-500 mt-6 flex items-center gap-2">
          <InfoIcon className="w-4 h-4" />
          La commission est calculée sur la base d&apos;un loyer mensuel de
          100,000 XOF. Le montant final inclut les frais de base + 5% du loyer.
        </p>
      </div>

      {message && (
        <div
          className={`flex items-center gap-3 p-4 rounded-lg ${
            message.type === "success"
              ? "bg-green-50 text-green-800 border border-green-200"
              : "bg-red-50 text-red-800 border border-red-200"
          }`}
        >
          {message.type === "success" ? (
            <CheckCircleIcon className="w-5 h-5" />
          ) : (
            <WarningCircleIcon className="w-5 h-5" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      {/* Tier Pricing */}
      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-neutral-200 bg-neutral-50">
          <h2 className="text-xl font-semibold text-neutral-900 flex items-center gap-2">
            <CurrencyCircleDollarIcon className="w-6 h-6" />
            Prix des Forfaits
          </h2>
        </div>
        <div className="divide-y divide-neutral-200">
          {tiers.map((tier) => (
            <div
              key={tier.id}
              className="px-6 py-4 flex items-center justify-between hover:bg-neutral-50 transition-colors"
            >
              <div className="flex-1">
                <h3 className="font-semibold text-neutral-900 text-lg">
                  {tier.name}
                </h3>
                <div className="text-sm text-neutral-600 mt-1 space-y-1">
                  <p>
                    {tier.photo_limit} photos • {tier.slot_limit} candidats
                  </p>
                  <p>
                    {tier.video_included && "Vidéo incluse • "}
                    {tier.open_house_limit} visite(s) groupée(s)
                    {tier.has_badge && " • Badge premium"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  value={tier.min_price}
                  onChange={(e) =>
                    handleTierPriceChange(tier.id, e.target.value)
                  }
                  className={`w-32 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 text-right ${
                    tier.min_price < MIN_DEPOSIT_AMOUNT
                      ? "border-amber-500 bg-amber-50 focus:ring-amber-500"
                      : "border-neutral-300 focus:ring-blue-500"
                  }`}
                  min="0"
                  step="100"
                />
                <span className="text-neutral-600 font-medium w-16">XOF</span>
                {tier.min_price < MIN_DEPOSIT_AMOUNT && (
                  <span className="text-xs text-amber-600 font-medium">
                    ⚠️ &lt; 100 XOF
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Add-on Pricing */}
      {addons.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-neutral-200 bg-neutral-50">
            <h2 className="text-xl font-semibold text-neutral-900 flex items-center gap-2">
              <CurrencyCircleDollarIcon className="w-6 h-6" />
              Prix des Options
            </h2>
          </div>
          <div className="divide-y divide-neutral-200">
            {addons.map((addon) => (
              <div
                key={addon.id}
                className="px-6 py-4 flex items-center justify-between hover:bg-neutral-50 transition-colors"
              >
                <div className="flex-1">
                  <h3 className="font-semibold text-neutral-900">
                    {addon.name}
                  </h3>
                  <p className="text-sm text-neutral-600 mt-1">
                    {addon.description}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    value={addon.price}
                    onChange={(e) =>
                      handleAddonPriceChange(addon.id, e.target.value)
                    }
                    className={`w-32 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 text-right ${
                      addon.price < MIN_DEPOSIT_AMOUNT
                        ? "border-amber-500 bg-amber-50 focus:ring-amber-500"
                        : "border-neutral-300 focus:ring-blue-500"
                    }`}
                    min="0"
                    step="100"
                  />
                  <span className="text-neutral-600 font-medium w-16">XOF</span>
                  {addon.price < MIN_DEPOSIT_AMOUNT && (
                    <span className="text-xs text-amber-600 font-medium">
                      ⚠️ &lt; 100 XOF
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Info Modal */}
      {showInfoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-neutral-100 flex items-center justify-between">
              <h3 className="text-xl font-bold text-neutral-900 flex items-center gap-2">
                <InfoIcon className="w-6 h-6 text-blue-600" weight="fill" />
                Limites de Paiement
              </h3>
              <button
                onClick={() => setShowInfoModal(false)}
                className="p-2 hover:bg-neutral-100 rounded-full transition-colors text-neutral-500"
              >
                <XIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
                <h4 className="font-semibold text-amber-900 mb-2">
                  Moov Money
                </h4>
                <p className="text-amber-800 text-sm">
                  Requiert un minimum de <strong>100 XOF</strong> par
                  transaction.
                </p>
              </div>

              <div className="bg-orange-50 border border-orange-100 rounded-xl p-4">
                <h4 className="font-semibold text-orange-900 mb-2">
                  Orange Money
                </h4>
                <p className="text-orange-800 text-sm">
                  Accepte les transactions dès <strong>1 XOF</strong>.
                </p>
              </div>

              <div className="text-neutral-600 text-sm leading-relaxed">
                Pour garantir la compatibilité avec tous les fournisseurs (Moov
                et Orange), il est recommandé que tous les prix soient fixés à{" "}
                <strong>100 XOF ou plus</strong>.
              </div>
            </div>
            <div className="p-4 bg-neutral-50 border-t border-neutral-100 flex justify-end">
              <button
                onClick={() => setShowInfoModal(false)}
                className="px-6 py-2 bg-neutral-900 text-white font-medium rounded-lg hover:bg-neutral-800 transition-colors"
              >
                Compris
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
