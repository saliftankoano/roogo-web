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
  TrendUpIcon,
  GearIcon,
  TagIcon,
  PercentIcon,
  CalculatorIcon,
} from "@phosphor-icons/react";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

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
  const [commissionPercentage, setCommissionPercentage] = useState<number>(0.05);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [sampleRent, setSampleRent] = useState<number>(100000);

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
        if (data.commissionPercentage !== undefined) {
          setCommissionPercentage(data.commissionPercentage);
        }
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

  const handleCommissionChange = (newPercentage: string) => {
    const percentage = parseFloat(newPercentage);
    if (isNaN(percentage) || percentage < 0 || percentage > 100) return;
    setCommissionPercentage(percentage / 100);
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
          commissionPercentage,
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
    <div className="max-w-6xl mx-auto space-y-10 pb-20">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-blue-600 font-semibold text-sm uppercase tracking-wider">
            <GearIcon weight="bold" />
            Administration
          </div>
          <h1 className="text-4xl font-extrabold text-neutral-900 tracking-tight">
            Paramètres de Prix
          </h1>
          <p className="text-neutral-500 text-lg">
            Configurez les forfaits, commissions et options de la plateforme.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowInfoModal(true)}
            className="flex items-center gap-2 px-5 py-2.5 bg-white border border-neutral-200 text-neutral-700 rounded-xl font-medium hover:bg-neutral-50 hover:border-neutral-300 transition-all shadow-sm"
          >
            <InfoIcon className="w-5 h-5 text-neutral-400" />
            <span>Limites</span>
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 bg-neutral-900 text-white rounded-xl font-semibold hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg active:scale-[0.98]"
          >
            {saving ? (
              <>
                <SpinnerGapIcon className="w-5 h-5 animate-spin" />
                <span>Enregistrement...</span>
              </>
            ) : (
              <>
                <FloppyDiskIcon className="w-5 h-5" />
                <span>Enregistrer les modifications</span>
              </>
            )}
          </button>
        </div>
      </div>

      {message && (
        <div
          className={cn(
            "flex items-center gap-4 p-4 rounded-2xl border animate-in fade-in slide-in-from-top-4 duration-300",
            message.type === "success"
              ? "bg-green-50/50 text-green-800 border-green-100"
              : "bg-red-50/50 text-red-800 border-red-100"
          )}
        >
          <div className={cn(
            "p-2 rounded-full",
            message.type === "success" ? "bg-green-100" : "bg-red-100"
          )}>
            {message.type === "success" ? (
              <CheckCircleIcon className="w-5 h-5" weight="fill" />
            ) : (
              <WarningCircleIcon className="w-5 h-5" weight="fill" />
            )}
          </div>
          <span className="font-medium">{message.text}</span>
          <button 
            onClick={() => setMessage(null)}
            className="ml-auto p-1 hover:bg-neutral-200/50 rounded-lg transition-colors"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>
      )}

      <Tabs defaultValue="pricing" className="space-y-8">
        {/* Visual Formula Header */}
        <div className="bg-blue-600 rounded-[2rem] p-8 text-white shadow-xl shadow-blue-200/50 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform duration-500">
            <CalculatorIcon size={120} weight="fill" />
          </div>
          <div className="relative z-10 space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/20 rounded-full text-xs font-bold uppercase tracking-widest backdrop-blur-md">
              <PercentIcon className="w-3 h-3" weight="bold" />
              Formule de Tarification
            </div>
            <div className="flex flex-col md:flex-row md:items-center gap-4 md:gap-12">
              <div className="text-4xl md:text-5xl font-black tracking-tighter">
                Prix Total <span className="text-blue-200">=</span>
              </div>
              <div className="flex flex-wrap items-center gap-3 md:gap-6">
                <div className="bg-white/10 backdrop-blur-md border border-white/20 px-6 py-4 rounded-2xl">
                  <div className="text-[10px] font-bold text-blue-200 uppercase mb-1">Frais Fixes</div>
                  <div className="text-xl md:text-2xl font-bold">Forfait Choisi</div>
                </div>
                <div className="text-3xl font-bold text-blue-200">+</div>
                <div className="bg-white/10 backdrop-blur-md border border-white/20 px-6 py-4 rounded-2xl">
                  <div className="text-[10px] font-bold text-blue-200 uppercase mb-1">Commission</div>
                  <div className="text-xl md:text-2xl font-bold">{(commissionPercentage * 100).toFixed(1)}% du Loyer</div>
                </div>
              </div>
            </div>
            <p className="text-blue-100 text-sm max-w-2xl leading-relaxed">
              Le coût de publication est basé sur un frais fixe par forfait plus une commission sur la valeur du bien pour assurer une différenciation claire des prix.
            </p>
          </div>
        </div>

        <TabsList className="bg-neutral-100/80 p-1 rounded-2xl border border-neutral-200/50 w-full md:w-auto h-auto grid grid-cols-2 md:flex">
          <TabsTrigger 
            value="pricing" 
            className="rounded-xl px-8 py-3 data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-blue-600 transition-all font-semibold"
          >
            <TagIcon className="w-4 h-4 mr-2" weight="bold" />
            Forfaits & Options
          </TabsTrigger>
          <TabsTrigger 
            value="simulation" 
            className="rounded-xl px-8 py-3 data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-blue-600 transition-all font-semibold"
          >
            <CalculatorIcon className="w-4 h-4 mr-2" weight="bold" />
            Simulateur
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pricing" className="space-y-8 animate-in fade-in duration-500">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-8">
              {/* Tier Pricing */}
              <Card className="border-neutral-200/60 shadow-sm overflow-hidden rounded-3xl">
                <CardHeader className="bg-neutral-50/50 border-b border-neutral-100 pb-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
                      <TagIcon className="w-6 h-6" weight="duotone" />
                    </div>
                    <div>
                      <CardTitle className="text-xl">Prix des Forfaits</CardTitle>
                      <CardDescription>Définissez les frais de base pour chaque niveau de service.</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y divide-neutral-100">
                    {tiers.map((tier) => (
                      <div
                        key={tier.id}
                        className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-neutral-50/30 transition-colors"
                      >
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2">
                            <h3 className="font-bold text-neutral-900 text-lg">
                              {tier.name}
                            </h3>
                            {tier.has_badge && (
                              <Badge variant="secondary" className="bg-blue-50 text-blue-700 border-blue-100 text-[10px] uppercase font-bold tracking-wider">
                                Premium
                              </Badge>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-neutral-500">
                            <span className="flex items-center gap-1.5">
                              <div className="w-1 h-1 rounded-full bg-neutral-300" />
                              {tier.photo_limit} photos
                            </span>
                            <span className="flex items-center gap-1.5">
                              <div className="w-1 h-1 rounded-full bg-neutral-300" />
                              {tier.slot_limit} candidats
                            </span>
                            {tier.video_included && (
                              <span className="flex items-center gap-1.5">
                                <div className="w-1 h-1 rounded-full bg-neutral-300" />
                                Vidéo incluse
                              </span>
                            )}
                            <span className="flex items-center gap-1.5">
                              <div className="w-1 h-1 rounded-full bg-neutral-300" />
                              {tier.open_house_limit} visite(s)
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="relative group">
                            <Input
                              type="number"
                              value={tier.min_price}
                              onChange={(e) => handleTierPriceChange(tier.id, e.target.value)}
                              className={cn(
                                "w-40 h-12 pl-4 pr-12 text-right font-bold text-lg rounded-xl transition-all",
                                tier.min_price < MIN_DEPOSIT_AMOUNT
                                  ? "border-amber-300 bg-amber-50/50 focus-visible:ring-amber-400"
                                  : "border-neutral-200 focus-visible:ring-blue-500"
                              )}
                              min="0"
                              step="100"
                            />
                            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-400 font-bold text-xs pointer-events-none">
                              XOF
                            </span>
                          </div>
                          {tier.min_price < MIN_DEPOSIT_AMOUNT && (
                            <div className="group relative">
                              <WarningCircleIcon className="w-5 h-5 text-amber-500" weight="fill" />
                              <div className="absolute bottom-full right-0 mb-2 w-48 p-2 bg-neutral-900 text-white text-[10px] rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 shadow-xl">
                                Attention: Le prix est inférieur au minimum recommandé de 100 XOF pour Moov Money.
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Add-on Pricing */}
              {addons.length > 0 && (
                <Card className="border-neutral-200/60 shadow-sm overflow-hidden rounded-3xl">
                  <CardHeader className="bg-neutral-50/50 border-b border-neutral-100 pb-6">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 bg-purple-50 text-purple-600 rounded-xl">
                        <TrendUpIcon className="w-6 h-6" weight="duotone" />
                      </div>
                      <div>
                        <CardTitle className="text-xl">Options Additionnelles</CardTitle>
                        <CardDescription>Gérez les prix des services optionnels.</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="divide-y divide-neutral-100">
                      {addons.map((addon) => (
                        <div
                          key={addon.id}
                          className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-neutral-50/30 transition-colors"
                        >
                          <div className="space-y-1">
                            <h3 className="font-bold text-neutral-900">
                              {addon.name}
                            </h3>
                            <p className="text-sm text-neutral-500 max-w-md leading-relaxed">
                              {addon.description}
                            </p>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="relative">
                              <Input
                                type="number"
                                value={addon.price}
                                onChange={(e) => handleAddonPriceChange(addon.id, e.target.value)}
                                className={cn(
                                  "w-40 h-12 pl-4 pr-12 text-right font-bold text-lg rounded-xl transition-all",
                                  addon.price < MIN_DEPOSIT_AMOUNT
                                    ? "border-amber-300 bg-amber-50/50 focus-visible:ring-amber-400"
                                    : "border-neutral-200 focus-visible:ring-blue-500"
                                )}
                                min="0"
                                step="100"
                              />
                              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-400 font-bold text-xs pointer-events-none">
                                XOF
                              </span>
                            </div>
                            {addon.price < MIN_DEPOSIT_AMOUNT && (
                              <WarningCircleIcon className="w-5 h-5 text-amber-500 shrink-0" weight="fill" />
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            <div className="space-y-8">
              {/* Commission Percentage */}
              <Card className="border-neutral-200/60 shadow-sm overflow-hidden rounded-3xl bg-neutral-900 text-white border-none">
                <CardHeader className="pb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-white/10 text-white rounded-xl">
                      <PercentIcon className="w-6 h-6" weight="bold" />
                    </div>
                    <div>
                      <CardTitle className="text-xl text-white">Frais de Service</CardTitle>
                      <CardDescription className="text-neutral-400">Commission sur le loyer</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label className="text-neutral-300 font-medium">Pourcentage</Label>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          value={(commissionPercentage * 100).toFixed(1)}
                          onChange={(e) => handleCommissionChange(e.target.value)}
                          className="w-24 h-12 bg-white/5 border-white/10 text-white text-right font-bold text-xl rounded-xl focus-visible:ring-white/20"
                          min="0"
                          max="100"
                          step="0.1"
                        />
                        <span className="text-neutral-400 font-bold text-lg">%</span>
                      </div>
                    </div>
                    <Separator className="bg-white/10" />
                    <p className="text-xs text-neutral-400 leading-relaxed italic">
                      Ce pourcentage est calculé sur la valeur du loyer mensuel et s&apos;ajoute aux frais fixes du forfait choisi lors du paiement de la publication.
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Quick Info Card */}
              <Card className="border-blue-100 bg-blue-50/30 shadow-none rounded-3xl border">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-bold text-blue-900 flex items-center gap-2">
                    <InfoIcon className="w-4 h-4" weight="fill" />
                    Conseil de gestion
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-blue-800 leading-relaxed">
                    Les prix impactent directement l&apos;attractivité de la plateforme. 
                    Utilisez l&apos;onglet <strong>Simulateur</strong> pour visualiser ce que le client final paiera réellement.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="simulation" className="animate-in fade-in duration-500">
          <div className="space-y-8">
            <Card className="border-neutral-200/60 shadow-lg overflow-hidden rounded-3xl">
              <CardHeader className="bg-neutral-50/50 border-b border-neutral-100 p-8">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-neutral-900 text-white rounded-2xl shadow-inner">
                      <CalculatorIcon className="w-8 h-8" weight="duotone" />
                    </div>
                    <div>
                      <CardTitle className="text-2xl">Simulateur de Revenus</CardTitle>
                      <CardDescription className="text-base">Visualisez le coût total pour vos clients en fonction du loyer.</CardDescription>
                    </div>
                  </div>
                  <div className="bg-white p-4 rounded-2xl border border-neutral-200 shadow-sm flex flex-col gap-2 min-w-[240px]">
                    <Label className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Loyer Mensuel de Test</Label>
                    <div className="relative">
                      <Input
                        type="number"
                        value={sampleRent}
                        onChange={(e) => setSampleRent(Number(e.target.value))}
                        className="h-12 pl-4 pr-12 text-xl font-black border-none focus-visible:ring-0 p-0"
                        step="5000"
                      />
                      <span className="absolute right-0 top-1/2 -translate-y-1/2 font-bold text-neutral-400">XOF</span>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-8">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                  {tiers.map((tier) => {
                    const commission = sampleRent * commissionPercentage;
                    const total = tier.min_price + commission;

                    return (
                      <div
                        key={`sim-${tier.id}`}
                        className="group relative bg-white p-8 rounded-[2.5rem] border border-neutral-100 shadow-sm hover:shadow-xl hover:border-blue-100 transition-all duration-300 flex flex-col"
                      >
                        <div className="mb-6 flex items-center justify-between">
                          <div className="space-y-1">
                            <h4 className="font-black text-neutral-900 text-xl tracking-tight">
                              {tier.name}
                            </h4>
                            {tier.has_badge && (
                              <Badge className="bg-blue-600 hover:bg-blue-600 text-[9px] h-5 px-2">PREMIUM</Badge>
                            )}
                          </div>
                          <div className="w-12 h-12 rounded-2xl bg-neutral-50 flex items-center justify-center group-hover:bg-blue-50 transition-colors">
                            <CurrencyCircleDollarIcon className="w-6 h-6 text-neutral-400 group-hover:text-blue-500 transition-colors" />
                          </div>
                        </div>

                        <div className="space-y-4 flex-grow">
                          <div className="flex justify-between items-center text-sm">
                            <span className="text-neutral-500 font-medium">Frais fixes</span>
                            <span className="font-bold text-neutral-900 bg-neutral-50 px-3 py-1 rounded-lg">
                              {tier.min_price.toLocaleString()} XOF
                            </span>
                          </div>
                          <div className="flex justify-between items-center text-sm">
                            <span className="text-neutral-500 font-medium">Commission (${(commissionPercentage * 100).toFixed(1)}%)</span>
                            <span className="font-bold text-neutral-900 bg-neutral-50 px-3 py-1 rounded-lg">
                              {commission.toLocaleString()} XOF
                            </span>
                          </div>
                          
                          <Separator className="my-6 opacity-50" />
                          
                          <div className="space-y-1">
                            <div className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Total Publication</div>
                            <div className="text-3xl font-black text-neutral-900 tracking-tighter">
                              {total.toLocaleString()} <span className="text-sm font-bold text-neutral-400">XOF</span>
                            </div>
                          </div>
                        </div>

                        <div className="mt-8 pt-6 border-t border-neutral-50">
                          <div className="grid grid-cols-2 gap-2">
                            <div className="bg-neutral-50/50 p-3 rounded-2xl text-center">
                              <div className="text-[9px] font-bold text-neutral-400 uppercase mb-1">Photos</div>
                              <div className="font-bold text-neutral-700">{tier.photo_limit}</div>
                            </div>
                            <div className="bg-neutral-50/50 p-3 rounded-2xl text-center">
                              <div className="text-[9px] font-bold text-neutral-400 uppercase mb-1">Candidats</div>
                              <div className="font-bold text-neutral-700">{tier.slot_limit}</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
              <CardFooter className="bg-neutral-50/50 p-6 border-t border-neutral-100">
                <div className="flex items-center gap-3 text-sm text-neutral-500 mx-auto">
                  <InfoIcon className="w-5 h-5 text-blue-500" />
                  <span>
                    Simulation basée sur un loyer de <strong>{sampleRent.toLocaleString()} XOF</strong>. 
                    Le total correspond au montant payé par l&apos;annonceur lors de la publication.
                  </span>
                </div>
              </CardFooter>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Info Modal */}
      {showInfoModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-neutral-950/40 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-white rounded-[2.5rem] shadow-2xl max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-300 border border-neutral-200">
            <div className="p-8 border-b border-neutral-100 flex items-center justify-between bg-neutral-50/50">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-blue-600 text-white rounded-2xl shadow-lg shadow-blue-200">
                  <InfoIcon className="w-6 h-6" weight="fill" />
                </div>
                <h3 className="text-2xl font-black text-neutral-900 tracking-tight">
                  Paiements
                </h3>
              </div>
              <button
                onClick={() => setShowInfoModal(false)}
                className="p-2 hover:bg-neutral-200 rounded-xl transition-colors text-neutral-400 hover:text-neutral-900"
              >
                <XIcon className="w-6 h-6" weight="bold" />
              </button>
            </div>
            <div className="p-8 space-y-6">
              <div className="space-y-4">
                <div className="flex items-start gap-4 p-5 bg-amber-50/50 border border-amber-100 rounded-[1.5rem]">
                  <div className="p-2 bg-amber-100 text-amber-600 rounded-xl shrink-0">
                    <WarningCircleIcon className="w-5 h-5" weight="fill" />
                  </div>
                  <div>
                    <h4 className="font-bold text-amber-900 mb-1">Moov Money</h4>
                    <p className="text-amber-800/80 text-sm leading-relaxed">
                      Requiert un montant minimum de <strong>100 XOF</strong> par transaction.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4 p-5 bg-orange-50/50 border border-orange-100 rounded-[1.5rem]">
                  <div className="p-2 bg-orange-100 text-orange-600 rounded-xl shrink-0">
                    <CheckCircleIcon className="w-5 h-5" weight="fill" />
                  </div>
                  <div>
                    <h4 className="font-bold text-orange-900 mb-1">Orange Money</h4>
                    <p className="text-orange-800/80 text-sm leading-relaxed">
                      Accepte les transactions à partir de <strong>1 XOF</strong>.
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-5 bg-neutral-50 rounded-[1.5rem] border border-neutral-100">
                <p className="text-neutral-600 text-sm leading-relaxed">
                  Pour une compatibilité maximale, nous recommandons de fixer tous les prix à <strong>100 XOF ou plus</strong>.
                </p>
              </div>
            </div>
            <div className="p-6 bg-neutral-50/50 border-t border-neutral-100 flex justify-center">
              <button
                onClick={() => setShowInfoModal(false)}
                className="w-full py-4 bg-neutral-900 text-white font-bold rounded-2xl hover:bg-neutral-800 transition-all shadow-lg active:scale-[0.98]"
              >
                J&apos;ai compris
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
