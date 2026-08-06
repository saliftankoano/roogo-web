"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  CaretDownIcon,
  CaretLeftIcon,
  CaretRightIcon,
  CaretUpIcon,
  CheckCircleIcon,
  HouseIcon,
  InfoIcon,
  MagnifyingGlassIcon,
  MapPinIcon,
  PlusCircleIcon,
  UploadSimpleIcon,
  XCircleIcon,
  WhatsappLogoIcon,
} from "@phosphor-icons/react";
import { Loader2 } from "lucide-react";
import { useAuth } from "@clerk/nextjs";
import {
  listingBaseSchema,
  listingSchema,
  requireListingFieldsByType,
  PROPERTY_TYPES,
  CITY_OPTIONS,
  type CityId,
} from "@/lib/validations";
import type { PropertyTypeId } from "@/lib/constants";
import { normalizeKuulaVirtualTourUrl } from "@/lib/virtual-tour";
import { LocationPicker } from "./LocationPicker";
import { EquipementsSelector } from "./EquipementsSelector";
import { InterdictionsSelector } from "./InterdictionsSelector";
import { PhotoUploader } from "./PhotoUploader";
import { useExpandableScreen } from "@/components/ui/expandable-screen";
import { savePendingPhotos, savePendingVideo } from "@/lib/clientPendingPhotos";
import {
  compressPropertyPhotoFiles,
  uploadPropertyPhotoFiles,
  uploadPropertyVideoFile,
} from "@/lib/clientPropertyPhotoUpload";
import {
  getMockPropertyData,
  getMockPropertyPhotos,
  isDevelopment,
} from "@/lib/mockData";
import { getMoveInPaymentBreakdown } from "@/lib/move-in-payment";
import { PhoneNumberInput } from "@/components/ui/PhoneNumberInput";
import { normalizePhone } from "@/lib/phone";

const DAILY_LISTING_PUBLICATION_FEE = 0;
const MONTHLY_FREE_SUCCESS_FEE_RATE_BPS = 5000;

interface PropertyFormModalProps {
  userType: string;
  onSuccess?: () => void;
}

interface OwnersAgentsUser {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  user_type: string;
}

interface PricingAddon {
  id: string;
  name: string;
  price: number;
  description?: string | null;
}

interface PricingTier {
  id: string;
  photo_limit: number;
  slot_limit: number;
  video_included: boolean;
  open_house_limit: number;
  has_badge?: boolean;
  base_fee: number;
}

type ReferralQuote = {
  code: string;
  referrerName: string | null;
  originalAmount: number;
  discountAmount: number;
  paidAmount: number;
};

type RentalFrequency = "mensuel" | "journalier";
type CautionType = "aucune" | "pourcentage" | "fixe";

interface PropertyFormData {
  listing_type: "louer" | "vendre";
  type: PropertyTypeId;
  frequence: RentalFrequency;
  prixMensuel: string;
  quartier: string;
  ville: CityId;
  latitude: number | undefined;
  longitude: number | undefined;
  description: string;
  chambres: string;
  sdb: string;
  superficie: string;
  vehicules: string;
  cautionMois: string;
  loyerAvanceMois: string;
  cautionType: CautionType;
  cautionValeur: string;
  sejour_minimum: string;
  capacite_max: string;
  equipements: string[];
  interdictions: string[];
  dosAndDonts: string[];
  virtualTourUrl: string;
}

const DEFAULT_FORM_DATA: PropertyFormData = {
  listing_type: "louer",
  type: "villa",
  frequence: "mensuel",
  prixMensuel: "",
  quartier: "",
  ville: "ouaga",
  latitude: undefined,
  longitude: undefined,
  description: "",
  chambres: "",
  sdb: "",
  superficie: "",
  vehicules: "",
  cautionMois: "3",
  loyerAvanceMois: "1",
  cautionType: "aucune",
  cautionValeur: "",
  sejour_minimum: "1",
  capacite_max: "2",
  equipements: [],
  interdictions: [],
  dosAndDonts: [],
  virtualTourUrl: "",
};

const FREE_LISTING_DEFAULT_TIER_ID = "premium";

const STEPS = [
  { id: 1, label: "Le bien" },
  { id: 2, label: "Photos & Détails" },
  { id: 3, label: "Publication" },
];

function formatAmount(amount: number) {
  return `${Math.round(amount).toLocaleString("fr-FR")} F`;
}

function toNumber(value: string, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function optionalNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function cleanRules(rules: string[]) {
  return rules
    .map((rule) => rule.trim())
    .filter(Boolean)
    .slice(0, 20);
}

async function fileToBase64(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function getVirtualTourError(value: string): string | undefined {
  if (!value.trim()) return undefined;

  try {
    normalizeKuulaVirtualTourUrl(value);
    return undefined;
  } catch (error) {
    return error instanceof Error
      ? error.message
      : "Le lien Kuula est invalide.";
  }
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs font-semibold text-red-600">{message}</p>;
}

function SectionTitle({
  icon,
  title,
}: {
  icon?: React.ReactNode;
  title: string;
}) {
  return (
    <div className="flex items-center gap-2">
      {icon}
      <h3 className="text-lg font-extrabold text-neutral-950">{title}</h3>
    </div>
  );
}

function SegmentedButton<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: readonly { id: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => onChange(option.id)}
          className={`rounded-2xl border-2 px-4 py-3 text-sm font-extrabold transition-all ${
            value === option.id
              ? "border-primary bg-primary/10 text-primary"
              : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function CounterField({
  label,
  value,
  min,
  max,
  unit,
  onChange,
}: {
  label: string;
  value: string;
  min: number;
  max: number;
  unit?: string;
  onChange: (value: string) => void;
}) {
  const numeric = toNumber(value, min);
  const setClamped = (next: number) =>
    onChange(String(Math.min(max, Math.max(min, next))));

  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-neutral-200 bg-white p-4">
      <div>
        <p className="text-sm font-extrabold text-neutral-900">{label}</p>
        {unit && (
          <p className="text-xs font-semibold text-neutral-400">{unit}</p>
        )}
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setClamped(numeric - 1)}
          className="grid h-10 w-10 place-items-center rounded-full border border-neutral-200 text-xl font-bold text-neutral-600 hover:bg-neutral-50"
          aria-label={`Réduire ${label}`}
        >
          -
        </button>
        <span className="w-10 text-center text-lg font-extrabold text-neutral-950">
          {numeric}
        </span>
        <button
          type="button"
          onClick={() => setClamped(numeric + 1)}
          className="grid h-10 w-10 place-items-center rounded-full border border-neutral-200 text-xl font-bold text-neutral-600 hover:bg-neutral-50"
          aria-label={`Augmenter ${label}`}
        >
          +
        </button>
      </div>
    </div>
  );
}

function UpsellModal({
  addons,
  selectedTier,
  onCancel,
  onConfirm,
}: {
  addons: PricingAddon[];
  selectedTier: string | null;
  onCancel: () => void;
  onConfirm: (addons: string[]) => void;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const filteredAddons = addons.filter(
    (addon) =>
      addon.id !== "video" ||
      (selectedTier !== "standard" && selectedTier !== "premium"),
  );
  const total = selectedIds.reduce((sum, id) => {
    const addon = filteredAddons.find((item) => item.id === id);
    return sum + (addon?.price ?? 0);
  }, 0);

  const toggle = (id: string) => {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  };

  return (
    <div className="fixed inset-0 z-100 flex items-end justify-center bg-black/40 px-4 py-6 sm:items-center">
      <div className="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-2xl font-extrabold text-neutral-950">
              Booster votre annonce ?
            </h3>
            <p className="mt-1 text-sm font-medium text-neutral-500">
              Ajoutez des options avant de passer au paiement.
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full p-2 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
            aria-label="Fermer"
          >
            <XCircleIcon size={26} weight="fill" />
          </button>
        </div>

        <div className="max-h-[48vh] space-y-3 overflow-y-auto pr-1">
          {filteredAddons.length === 0 ? (
            <div className="rounded-2xl border border-neutral-100 bg-neutral-50 p-5 text-sm font-semibold text-neutral-500">
              Aucune option supplémentaire disponible pour ce pack.
            </div>
          ) : (
            filteredAddons.map((addon) => {
              const selected = selectedIds.includes(addon.id);
              return (
                <button
                  key={addon.id}
                  type="button"
                  onClick={() => toggle(addon.id)}
                  className={`flex w-full items-center justify-between gap-4 rounded-2xl border p-4 text-left transition-all ${
                    selected
                      ? "border-primary bg-primary/5"
                      : "border-neutral-200 bg-white hover:border-neutral-300"
                  }`}
                >
                  <div>
                    <p className="font-extrabold text-neutral-950">
                      {addon.name}
                    </p>
                    {addon.description && (
                      <p className="mt-1 text-sm font-medium text-neutral-500">
                        {addon.description}
                      </p>
                    )}
                    <p className="mt-2 text-sm font-extrabold text-primary">
                      +{formatAmount(addon.price)}
                    </p>
                  </div>
                  <span
                    className={`grid h-7 w-7 place-items-center rounded-full border-2 ${
                      selected
                        ? "border-primary bg-primary text-white"
                        : "border-neutral-200"
                    }`}
                  >
                    {selected && <CheckCircleIcon size={18} weight="fill" />}
                  </span>
                </button>
              );
            })
          )}
        </div>

        <div className="mt-6 flex flex-col gap-3 border-t border-neutral-100 pt-5 sm:flex-row">
          <button
            type="button"
            onClick={() => onConfirm([])}
            className="flex-1 rounded-full bg-neutral-100 px-5 py-4 text-sm font-extrabold text-neutral-700 hover:bg-neutral-200"
          >
            Continuer sans option
          </button>
          <button
            type="button"
            onClick={() => onConfirm(selectedIds)}
            className="flex-1 rounded-full bg-primary px-5 py-4 text-sm font-extrabold text-white shadow-lg"
          >
            Continuer avec options ({formatAmount(total)})
          </button>
        </div>
      </div>
    </div>
  );
}

export const PropertyFormModal: React.FC<PropertyFormModalProps> = ({
  userType,
  onSuccess,
}) => {
  const { getToken } = useAuth();
  const { collapse } = useExpandableScreen();
  const normalizedUserType = userType?.trim().toLowerCase();
  const isStaffOrFounder = ["staff", "founder"].includes(
    normalizedUserType || "",
  );

  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showUpsell, setShowUpsell] = useState(false);
  const [showFullPreview, setShowFullPreview] = useState(false);
  const [selectedTier, setSelectedTier] = useState<string | null>(null);
  const [selectedAddOns, setSelectedAddOns] = useState<string[]>([]);
  const [paymentChoice, setPaymentChoice] = useState<"free" | "pay">("free");
  const [isTestListing, setIsTestListing] = useState(false);
  const [tiersList, setTiersList] = useState<PricingTier[]>([]);
  const [addonsList, setAddonsList] = useState<PricingAddon[]>([]);
  const [commissionRate, setCommissionRate] = useState<number | null>(null);
  const [commissionConfigError, setCommissionConfigError] = useState<
    string | null
  >(null);
  const [referralCode, setReferralCode] = useState("");
  const [referralQuote, setReferralQuote] = useState<ReferralQuote | null>(
    null,
  );
  const [referralError, setReferralError] = useState<string | null>(null);
  const [validatingReferral, setValidatingReferral] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formData, setFormData] = useState<PropertyFormData>(DEFAULT_FORM_DATA);
  const [photos, setPhotos] = useState<File[]>([]);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [showFreeTermsModal, setShowFreeTermsModal] = useState(false);
  const [freeTermsAccepted, setFreeTermsAccepted] = useState(false);

  const [onBehalfOfClient, setOnBehalfOfClient] = useState(false);
  const [ownerEntryMode, setOwnerEntryMode] = useState<"existing" | "direct">(
    "existing",
  );
  const [directOwner, setDirectOwner] = useState({
    firstName: "",
    lastName: "",
    phoneIso: "BF",
    phoneNational: "",
    phoneHasWhatsapp: false,
  });
  const [selectedOwner, setSelectedOwner] = useState<OwnersAgentsUser | null>(
    null,
  );
  const [ownerSearch, setOwnerSearch] = useState("");
  const [ownerResults, setOwnerResults] = useState<OwnersAgentsUser[]>([]);
  const [loadingOwnerSearch, setLoadingOwnerSearch] = useState(false);
  const [ownerSearchError, setOwnerSearchError] = useState<string | null>(null);
  const [showOwnerDropdown, setShowOwnerDropdown] = useState(false);
  const ownerComboboxRef = useRef<HTMLDivElement>(null);
  const selectedOwnerId = selectedOwner?.id ?? null;
  const isSaleListing = formData.listing_type === "vendre";
  const isDailyListing =
    !isSaleListing && formData.frequence === "journalier";

  const isFreeMonthlyListing =
    !isSaleListing && !isDailyListing && paymentChoice === "free";
  const isFurnishedListing = formData.equipements.includes("meuble");

  useEffect(() => {
    if (
      (isDailyListing || isFreeMonthlyListing) &&
      selectedTier !== FREE_LISTING_DEFAULT_TIER_ID
    ) {
      setSelectedTier(FREE_LISTING_DEFAULT_TIER_ID);
    }
  }, [isDailyListing, isFreeMonthlyListing, selectedTier]);

  const rentAmount = parseInt(formData.prixMensuel, 10) || 0;
  const moveInBreakdown = getMoveInPaymentBreakdown({
    monthlyRent: rentAmount,
    cautionMois: formData.cautionMois,
    loyerAvanceMois: formData.loyerAvanceMois,
  });
  const selectedTierConfig = selectedTier
    ? (tiersList.find((tier) => tier.id === selectedTier) ?? null)
    : null;
  const commissionAmount = isFreeMonthlyListing || isDailyListing
    ? 0
    : rentAmount * (commissionRate ?? 0);
  const baseFeeAmount =
    isFreeMonthlyListing
      ? 0
      : formData.frequence === "journalier"
        ? DAILY_LISTING_PUBLICATION_FEE
        : (selectedTierConfig?.base_fee ?? 0);
  const addOnsAmount =
    isFreeMonthlyListing
      ? 0
      : selectedAddOns.reduce((sum, id) => {
          const addon = addonsList.find((item) => item.id === id);
          return sum + (addon?.price || 0);
        }, 0);
  const totalAmount = baseFeeAmount + commissionAmount + addOnsAmount;
  const referralDiscountAmount = referralQuote?.discountAmount ?? 0;
  const payableAmount = Math.max(0, totalAmount - referralDiscountAmount);
  const deferredSuccessFeeAmount = isFreeMonthlyListing
    ? Math.round((rentAmount * MONTHLY_FREE_SUCCESS_FEE_RATE_BPS) / 10000)
    : 0;
  const hasVideoEntitlement =
    selectedTierConfig?.video_included === true || selectedAddOns.includes("video");
  const sortedPaidTiers = useMemo(
    () =>
      [...tiersList].sort((a, b) => {
        const aPrice = a.base_fee + rentAmount * (commissionRate ?? 0);
        const bPrice = b.base_fee + rentAmount * (commissionRate ?? 0);
        return aPrice - bPrice;
      }),
    [commissionRate, rentAmount, tiersList],
  );

  useEffect(() => {
    setReferralQuote(null);
    setReferralError(null);
  }, [
    selectedTier,
    selectedAddOns,
    formData.frequence,
    formData.prixMensuel,
    paymentChoice,
  ]);

  const cityLabel = useMemo(
    () => CITY_OPTIONS.find((city) => city.id === formData.ville)?.label || "",
    [formData.ville],
  );
  const propertyTypeLabel = useMemo(
    () =>
      PROPERTY_TYPES.find((propertyType) => propertyType.id === formData.type)
        ?.label || "",
    [formData.type],
  );

  useEffect(() => {
    const savedDraft = localStorage.getItem("roogo_property_draft");
    if (!savedDraft) return;

    try {
      const draft = JSON.parse(savedDraft) as {
        formData?: Partial<PropertyFormData>;
        currentStep?: number;
        selectedTier?: string | null;
        selectedAddOns?: string[];
        paymentChoice?: "free" | "pay";
        isTestListing?: boolean;
        onBehalfOfClient?: boolean;
        selectedOwner?: OwnersAgentsUser | null;
      };
      setFormData((prev) => ({
        ...prev,
        ...draft.formData,
        frequence: draft.formData?.frequence ?? prev.frequence,
        dosAndDonts: draft.formData?.dosAndDonts ?? prev.dosAndDonts,
        virtualTourUrl: draft.formData?.virtualTourUrl ?? prev.virtualTourUrl,
      }));
      setCurrentStep(Math.min(3, Math.max(1, draft.currentStep || 1)));
      setSelectedTier(draft.selectedTier ?? null);
      setSelectedAddOns(draft.selectedAddOns ?? []);
      setPaymentChoice(draft.paymentChoice ?? "free");
      setIsTestListing(draft.isTestListing ?? false);
      setOnBehalfOfClient(draft.onBehalfOfClient ?? false);
      setSelectedOwner(draft.selectedOwner ?? null);
    } catch (e) {
      console.error("Failed to parse draft", e);
    }
  }, [isStaffOrFounder]);

  useEffect(() => {
    fetch("/api/pricing")
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Failed to load pricing");
        return data;
      })
      .then((data) => {
        if (Array.isArray(data.tiers)) {
          const apiTiers: PricingTier[] = data.tiers
            .filter((tier: { id?: string }) => typeof tier.id === "string")
            .map(
              (tier: {
                id: string;
                photo_limit: number;
                slot_limit: number;
                video_included: boolean;
                open_house_limit: number;
                has_badge: boolean;
                min_price: number;
              }) => ({
                id: tier.id,
                photo_limit: tier.photo_limit,
                slot_limit: tier.slot_limit,
                video_included: tier.video_included,
                open_house_limit: tier.open_house_limit,
                has_badge: tier.has_badge,
                base_fee: tier.min_price,
              }),
            );
          if (apiTiers.length > 0) setTiersList(apiTiers);
        }

        if (Array.isArray(data.addons)) setAddonsList(data.addons);
        if (typeof data.commissionPercentage === "number") {
          setCommissionRate(data.commissionPercentage);
          setCommissionConfigError(null);
        } else {
          setCommissionRate(null);
          setCommissionConfigError(
            "Commission non configurée. Vérifiez les paramètres admin.",
          );
        }
      })
      .catch((err) => {
        console.error("Failed to load pricing", err);
        setCommissionRate(null);
        setCommissionConfigError(
          "Commission non configurée. Vérifiez les paramètres admin.",
        );
      });
  }, []);

  useEffect(() => {
    if (
      !onBehalfOfClient ||
      ownerEntryMode !== "existing" ||
      !isStaffOrFounder ||
      ownerSearch.length < 1
    ) {
      setOwnerResults([]);
      setOwnerSearchError(null);
      setShowOwnerDropdown(false);
      return;
    }

    setLoadingOwnerSearch(true);
    setOwnerSearchError(null);
    const timer = setTimeout(() => {
      getToken()
        .then((token) => {
          if (!token) throw new Error("No token");
          return fetch(
            `/api/users/owners-agents?q=${encodeURIComponent(ownerSearch)}`,
            { headers: { Authorization: `Bearer ${token}` } },
          );
        })
        .then(async (res) => {
          const data = await res.json();
          if (!res.ok) throw new Error(data?.error || "Failed to load users");
          return data;
        })
        .then((data) => {
          setOwnerResults(Array.isArray(data.users) ? data.users : []);
          setShowOwnerDropdown(true);
        })
        .catch((err) => {
          console.error("Owner search failed:", err);
          setOwnerResults([]);
          setOwnerSearchError(
            err instanceof Error ? err.message : "Erreur lors de la recherche",
          );
        })
        .finally(() => setLoadingOwnerSearch(false));
    }, 300);

    return () => clearTimeout(timer);
  }, [
    ownerSearch,
    onBehalfOfClient,
    ownerEntryMode,
    isStaffOrFounder,
    getToken,
  ]);

  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (
        ownerComboboxRef.current &&
        !ownerComboboxRef.current.contains(e.target as Node)
      ) {
        setShowOwnerDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, []);

  const updateField = <K extends keyof PropertyFormData>(
    field: K,
    value: PropertyFormData[K],
  ) => {
    setFormData((current) => ({ ...current, [field]: value }));
    if (field === "equipements") {
      setFreeTermsAccepted(false);
    }
    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const updateFrequency = (frequence: RentalFrequency) => {
    setFormData((current) => ({
      ...current,
      frequence,
      cautionType:
        frequence === "journalier" ? current.cautionType || "aucune" : "aucune",
      cautionValeur: frequence === "journalier" ? current.cautionValeur : "",
      sejour_minimum:
        frequence === "journalier" ? current.sejour_minimum || "1" : "1",
      capacite_max:
        frequence === "journalier" ? current.capacite_max || "2" : "2",
      cautionMois:
        frequence === "mensuel"
          ? current.cautionMois || "3"
          : current.cautionMois,
      loyerAvanceMois:
        frequence === "mensuel" ? current.loyerAvanceMois || "1" : "1",
    }));
  };

  const buildListingData = (
    paymentId?: string,
    addOns = selectedAddOns,
    referralCodeOverride = referralQuote?.code,
  ) => {
    const isDaily = formData.frequence === "journalier";
    const listingPaymentMode = isDaily
      ? "daily_free"
      : paymentChoice === "free"
        ? "free_success_fee"
        : "upfront_package";
    const isFreeMonthly = listingPaymentMode === "free_success_fee";
    return {
      ...formData,
      frequence: isSaleListing ? undefined : formData.frequence,
      prixMensuel: Number(formData.prixMensuel),
      chambres: Number(formData.chambres),
      sdb: Number(formData.sdb),
      superficie: optionalNumber(formData.superficie),
      vehicules: Number(formData.vehicules),
      cautionMois: isDaily ? undefined : Number(formData.cautionMois),
      loyerAvanceMois: isDaily ? 1 : Number(formData.loyerAvanceMois || 1),
      cautionType: isDaily ? formData.cautionType : undefined,
      cautionValeur:
        isDaily && formData.cautionType !== "aucune" && formData.cautionValeur
          ? Number(formData.cautionValeur)
          : undefined,
      sejour_minimum: isDaily
        ? Number(formData.sejour_minimum || 1)
        : undefined,
      capacite_max: isDaily ? Number(formData.capacite_max || 2) : undefined,
      dosAndDonts: cleanRules(formData.dosAndDonts),
      virtualTourUrl: isStaffOrFounder ? formData.virtualTourUrl.trim() : "",
      photos,
      tier_id: isDaily || isFreeMonthly ? FREE_LISTING_DEFAULT_TIER_ID : (selectedTier ?? undefined),
      listing_payment_mode: listingPaymentMode,
      add_ons: isFreeMonthly ? [] : addOns,
      freeSuccessFeeTermsAccepted:
        isFreeMonthly && !formData.equipements.includes("meuble")
          ? freeTermsAccepted
          : undefined,
      referralCode:
        isFreeMonthly && referralCodeOverride
          ? referralCodeOverride
          : undefined,
      payment_id: paymentId,
      on_behalf_of_client: onBehalfOfClient,
      owner_id:
        onBehalfOfClient && ownerEntryMode === "existing"
          ? (selectedOwnerId ?? undefined)
          : undefined,
      direct_owner:
        onBehalfOfClient && ownerEntryMode === "direct"
          ? {
              first_name: directOwner.firstName.trim(),
              last_name: directOwner.lastName.trim(),
              phone:
                normalizePhone(
                  directOwner.phoneNational,
                  directOwner.phoneIso,
                ) ?? directOwner.phoneNational,
              phone_has_whatsapp: directOwner.phoneHasWhatsapp,
            }
          : undefined,
      is_test: isStaffOrFounder ? isTestListing : false,
    };
  };

  const collectErrors = (result: {
    success: boolean;
    error?: { issues: { path: PropertyKey[]; message: string }[] };
  }) => {
    const nextErrors: Record<string, string> = {};
    if (!result.success) {
      result.error?.issues.forEach((issue) => {
        nextErrors[issue.path[0] as string] = issue.message;
      });
    }
    return nextErrors;
  };

  const validateFull = () => {
    const result = listingSchema.safeParse(buildListingData());
    const nextErrors = collectErrors(result);
    if (isStaffOrFounder && isSaleListing && !onBehalfOfClient) {
      nextErrors.owner_id =
        "Indiquez le propriétaire existant ou saisissez un propriétaire sans compte";
    }
    if (videoFile && isFreeMonthlyListing && !hasVideoEntitlement) {
      nextErrors.video = "Choisissez un pack ou une option incluant la vidéo.";
    }
    const virtualTourError = isStaffOrFounder
      ? getVirtualTourError(formData.virtualTourUrl)
      : undefined;
    if (virtualTourError) {
      nextErrors.virtualTourUrl = virtualTourError;
    }
    setErrors(nextErrors);
    return {
      ok:
        result.success &&
        !virtualTourError &&
        !nextErrors.video &&
        !nextErrors.owner_id,
      errors: nextErrors,
    };
  };

  const validateStep = (step: number) => {
    const data = buildListingData();
    const stepFields =
      step === 1
        ? {
            type: data.type,
            frequence: data.frequence,
            prixMensuel: data.prixMensuel,
            quartier: data.quartier,
            ville: data.ville,
          }
        : step === 2
          ? {
              chambres: data.chambres,
              sdb: data.sdb,
              superficie: data.superficie,
              vehicules: data.vehicules,
              description: data.description,
              photos: data.photos,
              dosAndDonts: data.dosAndDonts,
              virtualTourUrl: data.virtualTourUrl,
            }
          : {
              tier_id: data.tier_id,
              on_behalf_of_client: data.on_behalf_of_client,
              owner_id: data.owner_id,
            };

    const schema =
      step === 1
        ? listingBaseSchema.pick({
            type: true,
            frequence: true,
            prixMensuel: true,
            quartier: true,
            ville: true,
          })
        : step === 2
          ? listingBaseSchema.pick({
              chambres: true,
              sdb: true,
              superficie: true,
              vehicules: true,
              description: true,
              photos: true,
              dosAndDonts: true,
              virtualTourUrl: true,
            })
          : listingBaseSchema.pick({
              tier_id: true,
              on_behalf_of_client: true,
              owner_id: true,
            });

    const result = schema.safeParse(stepFields);
    const nextErrors = collectErrors(result);
    if (step === 2) {
      // Field-level floors are 0 (terrain/commercial); the per-type ≥1-room /
      // required-superficie rule must run at step level or an untouched
      // counter ("" → 0) sails through and only errors at publish time.
      const typeIssue = requireListingFieldsByType({
        type: formData.type,
        chambres: Number(formData.chambres),
        sdb: Number(formData.sdb),
        superficie: optionalNumber(formData.superficie),
      });
      if (typeIssue && !nextErrors[typeIssue.path]) {
        nextErrors[typeIssue.path] = typeIssue.message;
      }
    }
    if (step === 2 && isStaffOrFounder) {
      const virtualTourError = getVirtualTourError(formData.virtualTourUrl);
      if (virtualTourError) {
        nextErrors.virtualTourUrl = virtualTourError;
      }
    }
    if (
      step === 3 &&
      onBehalfOfClient &&
      ownerEntryMode === "existing" &&
      !selectedOwnerId
    ) {
      nextErrors.owner_id = "Sélectionnez un propriétaire ou agent";
    }
    if (step === 3 && onBehalfOfClient && ownerEntryMode === "direct") {
      if (!isSaleListing) {
        nextErrors.direct_owner =
          "L'entrée sans compte est réservée aux biens à vendre";
      } else if (!directOwner.firstName.trim()) {
        nextErrors.direct_owner_first_name = "Prénom requis";
      } else if (!directOwner.lastName.trim()) {
        nextErrors.direct_owner_last_name = "Nom requis";
      } else if (
        !normalizePhone(directOwner.phoneNational, directOwner.phoneIso)
      ) {
        nextErrors.direct_owner_phone = "Numéro de téléphone invalide";
      }
    }
    if (
      step === 3 &&
      !isSaleListing &&
      !isDailyListing &&
      paymentChoice === "pay" &&
      !selectedTier
    ) {
      nextErrors.tier_id = "Choisissez un pack";
    }
    setErrors((current) => ({ ...current, ...nextErrors }));
    return Object.keys(nextErrors).length === 0;
  };

  const goNext = () => {
    if (!validateStep(currentStep)) return;
    setErrors({});
    setCurrentStep((step) => Math.min(3, step + 1));
  };

  const goBack = () => {
    setErrors({});
    setCurrentStep((step) => Math.max(1, step - 1));
  };

  const handleSaveDraft = () => {
    const draft = {
      formData,
      currentStep,
      selectedTier,
      selectedAddOns,
      paymentChoice,
      isTestListing,
      onBehalfOfClient,
      selectedOwner,
      updatedAt: new Date().toISOString(),
    };
    localStorage.setItem("roogo_property_draft", JSON.stringify(draft));
    alert(
      "Brouillon enregistré avec succès. Les photos devront être resélectionnées après un rechargement.",
    );
  };

  const handleClearDraft = () => {
    if (confirm("Voulez-vous vraiment effacer le brouillon ?")) {
      localStorage.removeItem("roogo_property_draft");
      window.location.reload();
    }
  };

  const handleAutoFill = async () => {
    const mockData = getMockPropertyData();
    setFormData((current) => ({
      ...current,
      ...mockData,
      type: mockData.type as PropertyTypeId,
      frequence: "mensuel",
      cautionType: "aucune",
      cautionValeur: "",
      sejour_minimum: "1",
      capacite_max: "2",
      dosAndDonts: [
        "Respecter le calme entre 22h et 7h",
        "Signaler toute panne ou dégradation dans les 48h",
      ],
    }));
    setPhotos(await getMockPropertyPhotos());
    setSelectedTier("standard");
    setSelectedAddOns([]);
    setCurrentStep(1);
  };

  const createListingDirectly = async (
    addOns: string[],
    activeReferral?: ReferralQuote | null,
  ) => {
    const token = await getToken();
    if (!token) throw new Error("No token found");

    const response = await fetch("/api/properties", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        listingData: buildListingData(undefined, addOns, activeReferral?.code),
      }),
    });

    const result = await response.json();
    if (!response.ok || !result.success) {
      throw new Error(
        result.error || result.message || "Failed to create property",
      );
    }

    const propertyId = result.propertyId;
    if (photos.length > 0) {
      await uploadPropertyPhotoFiles({
        propertyId,
        token,
        files: photos,
      });
    }
    if (videoFile) {
      await uploadPropertyVideoFile({
        propertyId,
        token,
        file: videoFile,
      });
    }

    localStorage.removeItem("roogo_property_draft");
    alert("Propriété ajoutée avec succès !");
    if (onSuccess) onSuccess();
    else window.location.reload();
    collapse();
  };

  const validateReferralCode = async (addOns = selectedAddOns) => {
    const code = referralCode.trim();
    if (!code) {
      setReferralError("Entrez un code de parrainage.");
      setReferralQuote(null);
      return null;
    }
    if (!selectedTier && !isFreeMonthlyListing) {
      setReferralError("Choisissez un pack avant d'appliquer le code.");
      return null;
    }

    setValidatingReferral(true);
    setReferralError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("No token found");

      const response = await fetch("/api/referrals/validate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          code,
          tierId: isFreeMonthlyListing ? undefined : selectedTier,
          addOns,
          frequence: formData.frequence,
          monthlyRent: rentAmount,
          quoteMode: isFreeMonthlyListing
            ? "free_success_fee"
            : "upfront_package",
        }),
      });
      const data = await response.json();

      if (!response.ok || !data.valid || !data.referral) {
        throw new Error(data.error || "Code invalide");
      }

      const nextQuote: ReferralQuote = {
        code: data.referral.code,
        referrerName: data.referral.referrerName || null,
        originalAmount: Number(data.referral.originalAmount || 0),
        discountAmount: Number(data.referral.discountAmount || 0),
        paidAmount: Number(data.referral.paidAmount || 0),
      };
      setReferralQuote(nextQuote);
      setReferralCode(nextQuote.code);
      return nextQuote;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Code de parrainage invalide";
      setReferralError(message);
      setReferralQuote(null);
      return null;
    } finally {
      setValidatingReferral(false);
    }
  };

  const startHostedPayment = async (addOns: string[]) => {
    const token = await getToken();
    if (!token) throw new Error("No token found");
    if (!isDailyListing && commissionRate === null) {
      throw new Error(
        "Commission non configurée. Vérifiez les paramètres admin.",
      );
    }

    const tier = tiersList.find((item) => item.id === selectedTier);
    if (!tier) throw new Error("Pack invalide. Veuillez recharger la page.");

    const addonsTotal = addOns.reduce((sum, id) => {
      const addon = addonsList.find((item) => item.id === id);
      return sum + (addon?.price || 0);
    }, 0);
    const commission = isDailyListing ? 0 : rentAmount * (commissionRate ?? 0);
    const amount =
      (isDailyListing ? DAILY_LISTING_PUBLICATION_FEE : tier.base_fee) +
      commission +
      addonsTotal;
    const activeReferral =
      referralCode.trim() && amount > 0
        ? await validateReferralCode(addOns)
        : null;
    if (referralCode.trim() && amount > 0 && !activeReferral) {
      throw new Error("Code de parrainage invalide.");
    }
    const payable = activeReferral?.paidAmount ?? amount;
    const paymentDescription = isDailyListing
      ? `Publication journalière${addOns.length > 0 ? " avec Options" : ""}`
      : `Pack ${selectedTier}${addOns.length > 0 ? " avec Options" : ""}`;

    const paymentRes = await fetch("/api/payments/paymentpage", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        amount: payable,
        description: paymentDescription,
        transactionType: "listing_submission",
        tier_id: selectedTier,
        add_ons: addOns,
        referralCode: activeReferral?.code,
        metadata: {
          tier_id: selectedTier,
          add_ons: addOns,
          commission,
          monthlyRent: rentAmount,
          frequence: formData.frequence,
          referralCode: activeReferral?.code,
          add_on_details: addOns.map((id) => {
            const addon = addonsList.find((item) => item.id === id);
            return { id, price: addon?.price || 0 };
          }),
        },
      }),
    });

    const paymentData = await paymentRes.json();
    if (!paymentRes.ok) {
      throw new Error(paymentData.error || "Payment init failed");
    }

    if (
      typeof paymentData?.depositId === "string" &&
      paymentData.depositId.length > 0
    ) {
      sessionStorage.setItem("pendingPaymentDepositId", paymentData.depositId);

      let pendingPhotosStoredInDb = false;
      let pendingPhotosOverflow = false;
      const pendingPhotosCount = photos.length;
      let pendingVideoStoredInDb = false;
      let pendingVideoOverflow = false;

      if (photos.length > 0) {
        try {
          const pendingPhotos = await compressPropertyPhotoFiles(photos);
          pendingPhotosStoredInDb = await savePendingPhotos(
            paymentData.depositId,
            pendingPhotos,
          );
          pendingPhotosOverflow = !pendingPhotosStoredInDb;
        } catch {
          pendingPhotosOverflow = true;
        }
      }

      if (videoFile) {
        try {
          pendingVideoStoredInDb = await savePendingVideo(paymentData.depositId, {
            data: await fileToBase64(videoFile),
            ext: videoFile.name.split(".").pop()?.toLowerCase() || "mp4",
            mimeType: videoFile.type || undefined,
            sizeBytes: videoFile.size,
          });
          pendingVideoOverflow = !pendingVideoStoredInDb;
        } catch {
          pendingVideoOverflow = true;
        }
      }

      sessionStorage.setItem(
        "pendingAdminListing",
        JSON.stringify({
          formData,
          selectedTier,
          selectedAddOns: addOns,
          listingPaymentMode: "upfront_package",
          pendingPhotosOverflow,
          pendingPhotosCount,
          pendingPhotosStoredInDb,
          pendingVideoStoredInDb,
          pendingVideoOverflow,
          onBehalfOfClient,
          selectedOwnerId,
          isTestListing,
          referralCode: activeReferral?.code ?? null,
        }),
      );
    }

    if (paymentData.redirectUrl) {
      window.location.href = paymentData.redirectUrl;
    }
  };

  const handlePublish = async () => {
    const validation = validateFull();
    if (!validation.ok) {
      const firstError = Object.values(validation.errors)[0];
      if (firstError) alert(firstError);
      return;
    }

    if (isSaleListing || isFreeMonthlyListing) {
      if (
        isFreeMonthlyListing &&
        !isFurnishedListing &&
        !freeTermsAccepted
      ) {
        setShowFreeTermsModal(true);
        return;
      }
      setIsSubmitting(true);
      try {
        setSelectedAddOns([]);
        const activeReferral = referralCode.trim()
          ? await validateReferralCode([])
          : null;
        if (referralCode.trim() && !activeReferral) {
          throw new Error("Code de parrainage invalide.");
        }
        await createListingDirectly([], activeReferral);
      } catch (error) {
        console.error("Error creating property:", error);
        alert(
          error instanceof Error
            ? error.message
            : "Erreur lors de la création.",
        );
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    setShowUpsell(true);
  };

  const handleUpsellConfirm = async (addOns: string[]) => {
    setShowUpsell(false);
    setSelectedAddOns(addOns);
    setIsSubmitting(true);
    try {
      if (isDailyListing && addOns.length === 0) {
        await createListingDirectly(addOns);
        return;
      }
      await startHostedPayment(addOns);
    } catch (error) {
      console.error("Error starting payment:", error);
      alert(
        error instanceof Error
          ? error.message
          : "Erreur lors de la préparation du paiement.",
      );
      setIsSubmitting(false);
    }
  };

  const renderStepOne = () => (
    <div className="space-y-8">
      <SectionTitle
        icon={<HouseIcon size={22} className="text-primary" weight="bold" />}
        title="Le bien"
      />

      {isStaffOrFounder && (
        <div className="space-y-3">
          <label className="text-sm font-extrabold text-neutral-800">
            Type d&apos;annonce
          </label>
          <SegmentedButton
            value={formData.listing_type}
            options={[
              { id: "louer", label: "À louer" },
              { id: "vendre", label: "À vendre" },
            ]}
            onChange={(listing_type) => {
              updateField(
                "listing_type",
                listing_type as PropertyFormData["listing_type"],
              );
              if (listing_type !== "vendre" && ownerEntryMode === "direct") {
                setOwnerEntryMode("existing");
              }
            }}
          />
        </div>
      )}

      <div className="space-y-3">
        <label className="text-sm font-extrabold text-neutral-800">
          Type de bien <span className="text-red-500">*</span>
        </label>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {PROPERTY_TYPES.map((propertyType) => (
            <button
              key={propertyType.id}
              type="button"
              onClick={() =>
                updateField("type", propertyType.id as PropertyTypeId)
              }
              className={`rounded-2xl border-2 px-4 py-4 text-left text-sm font-extrabold transition-all ${
                formData.type === propertyType.id
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300"
              }`}
            >
              {propertyType.label}
            </button>
          ))}
        </div>
        <FieldError message={errors.type} />
      </div>

      {!isSaleListing && <div className="space-y-3">
        <label className="text-sm font-extrabold text-neutral-800">
          Fréquence de location <span className="text-red-500">*</span>
        </label>
        <SegmentedButton
          value={formData.frequence}
          options={[
            { id: "mensuel", label: "Mensuel" },
            { id: "journalier", label: "Journalier" },
          ]}
          onChange={updateFrequency}
        />
        <FieldError message={errors.frequence} />
      </div>}

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm font-extrabold text-neutral-800">
            {isSaleListing
              ? "Prix souhaité par le vendeur (FCFA)"
              : formData.frequence === "journalier"
              ? "Prix (FCFA / nuit)"
              : "Prix de location (FCFA / mois)"}{" "}
            <span className="text-red-500">*</span>
          </label>
          <input
            required
            type="number"
            min="100"
            placeholder="150000"
            className={`w-full rounded-2xl border bg-neutral-50 px-5 py-4 outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20 ${
              errors.prixMensuel ? "border-red-500" : "border-neutral-200"
            }`}
            value={formData.prixMensuel}
            onChange={(e) => updateField("prixMensuel", e.target.value)}
          />
          <FieldError message={errors.prixMensuel} />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-extrabold text-neutral-800">
            Quartier <span className="text-red-500">*</span>
          </label>
          <input
            required
            placeholder="Ex: Ouaga 2000"
            className={`w-full rounded-2xl border bg-neutral-50 px-5 py-4 outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20 ${
              errors.quartier ? "border-red-500" : "border-neutral-200"
            }`}
            value={formData.quartier}
            onChange={(e) => updateField("quartier", e.target.value)}
          />
          <FieldError message={errors.quartier} />
        </div>
      </div>

      <div className="space-y-3">
        <label className="text-sm font-extrabold text-neutral-800">
          Ville <span className="text-red-500">*</span>
        </label>
        <SegmentedButton
          value={formData.ville}
          options={CITY_OPTIONS}
          onChange={(value) => updateField("ville", value)}
        />
        <FieldError message={errors.ville} />
      </div>

      <div className="space-y-3">
        <SectionTitle
          icon={<MapPinIcon size={20} className="text-primary" weight="bold" />}
          title="Localisation GPS"
        />
        <LocationPicker
          latitude={formData.latitude}
          longitude={formData.longitude}
          onChange={(lat, lng) => {
            setFormData((current) => ({
              ...current,
              latitude: lat,
              longitude: lng,
            }));
          }}
        />
      </div>
    </div>
  );

  const renderRulesEditor = () => (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h4 className="text-sm font-extrabold text-neutral-900">
            Règles maison
          </h4>
          <p className="text-xs font-semibold text-neutral-500">
            Maximum 20 règles, 200 caractères chacune.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            if (formData.dosAndDonts.length >= 20) return;
            updateField("dosAndDonts", [...formData.dosAndDonts, ""]);
          }}
          className="flex items-center gap-2 rounded-full bg-primary/10 px-4 py-2 text-sm font-extrabold text-primary hover:bg-primary/15"
        >
          <PlusCircleIcon size={18} weight="fill" />
          Ajouter
        </button>
      </div>
      <div className="space-y-2">
        {formData.dosAndDonts.map((rule, index) => (
          <div
            key={index}
            className="flex items-center gap-3 rounded-2xl border border-neutral-200 bg-white px-4 py-3"
          >
            <span className="w-6 text-sm font-extrabold text-neutral-400">
              {index + 1}.
            </span>
            <input
              value={rule}
              maxLength={200}
              placeholder="Ex: Payer avant le 5 du mois"
              className="flex-1 bg-transparent text-sm font-semibold text-neutral-900 outline-none"
              onChange={(e) => {
                const next = [...formData.dosAndDonts];
                next[index] = e.target.value;
                updateField("dosAndDonts", next);
              }}
            />
            <button
              type="button"
              onClick={() =>
                updateField(
                  "dosAndDonts",
                  formData.dosAndDonts.filter(
                    (_, ruleIndex) => ruleIndex !== index,
                  ),
                )
              }
              className="text-neutral-400 hover:text-red-600"
              aria-label="Supprimer la règle"
            >
              <XCircleIcon size={22} weight="fill" />
            </button>
          </div>
        ))}
      </div>
      <FieldError message={errors.dosAndDonts} />
    </div>
  );

  const renderStepTwo = () => (
    <div className="space-y-8">
      <SectionTitle
        icon={<InfoIcon size={22} className="text-primary" weight="bold" />}
        title="Photos & Détails"
      />

      <div>
        <PhotoUploader
          files={photos}
          onChange={setPhotos}
          videoFile={videoFile}
          onVideoChange={(file) => {
            setVideoFile(file);
            setErrors((current) => {
              if (!current.video) return current;
              const next = { ...current };
              delete next.video;
              return next;
            });
          }}
        />
        <FieldError message={errors.photos} />
        <FieldError message={errors.video} />
      </div>

      {isStaffOrFounder && (
        <div className="space-y-2 rounded-3xl border border-neutral-200 bg-neutral-50 p-5">
          <label className="text-sm font-extrabold text-neutral-800">
            Visite virtuelle Kuula
          </label>
          <p className="text-xs font-semibold text-neutral-500">
            Collez le lien de partage Kuula (pas le script d&apos;intégration).
          </p>
          <input
            type="url"
            placeholder="https://kuula.co/share/collection/7MDZD?logo=1&info=1&fs=1&vr=0&thumbs=1&inst=fr"
            className={`w-full rounded-2xl border bg-white px-5 py-4 outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20 ${
              errors.virtualTourUrl ? "border-red-500" : "border-neutral-200"
            }`}
            value={formData.virtualTourUrl}
            onChange={(e) => updateField("virtualTourUrl", e.target.value)}
          />
          <FieldError message={errors.virtualTourUrl} />
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <CounterField
          label="Chambres"
          value={formData.chambres || "1"}
          min={1}
          max={20}
          onChange={(value) => updateField("chambres", value)}
        />
        <CounterField
          label="Douches"
          value={formData.sdb || "1"}
          min={1}
          max={20}
          onChange={(value) => updateField("sdb", value)}
        />
        <div className="space-y-2">
          <label className="text-sm font-extrabold text-neutral-800">
            Superficie (m²)
          </label>
          <input
            type="number"
            min="1"
            placeholder="Ex: 120"
            className={`w-full rounded-2xl border bg-neutral-50 px-5 py-4 outline-none ${
              errors.superficie ? "border-red-500" : "border-neutral-200"
            }`}
            value={formData.superficie}
            onChange={(e) => updateField("superficie", e.target.value)}
          />
          <FieldError message={errors.superficie} />
        </div>
        <CounterField
          label="Parkings"
          value={formData.vehicules || "0"}
          min={0}
          max={20}
          onChange={(value) => updateField("vehicules", value)}
        />
      </div>

      <div className="space-y-2">
        <label className="flex justify-between text-sm font-extrabold text-neutral-800">
          <span>
            Description <span className="text-red-500">*</span>
          </span>
          <span className="text-xs font-semibold text-neutral-400">
            {formData.description.length}/1200
          </span>
        </label>
        <textarea
          required
          minLength={10}
          maxLength={1200}
          rows={5}
          placeholder="Décrivez le bien..."
          className={`w-full resize-none rounded-3xl border bg-neutral-50 px-5 py-4 outline-none ${
            errors.description ? "border-red-500" : "border-neutral-200"
          }`}
          value={formData.description}
          onChange={(e) => updateField("description", e.target.value)}
        />
        <FieldError message={errors.description} />
      </div>

      <EquipementsSelector
        selected={formData.equipements}
        onChange={(value) => updateField("equipements", value)}
      />

      <div className="space-y-4 rounded-3xl border border-neutral-200 bg-neutral-50 p-5">
        <h4 className="text-base font-extrabold text-neutral-950">
          Conditions de location
        </h4>
        {formData.frequence === "journalier" ? (
          <div className="space-y-4">
            <div className="space-y-3">
              <p className="text-sm font-extrabold text-neutral-800">Caution</p>
              <SegmentedButton
                value={formData.cautionType}
                options={[
                  { id: "aucune", label: "Aucune" },
                  { id: "pourcentage", label: "% du séjour" },
                ]}
                onChange={(value) => updateField("cautionType", value)}
              />
              <button
                type="button"
                onClick={() => updateField("cautionType", "fixe")}
                className={`w-full rounded-2xl border-2 px-4 py-3 text-sm font-extrabold transition-all ${
                  formData.cautionType === "fixe"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300"
                }`}
              >
                Montant fixe
              </button>
              {(formData.cautionType === "pourcentage" ||
                formData.cautionType === "fixe") && (
                <input
                  type="number"
                  min="0"
                  max={formData.cautionType === "pourcentage" ? 50 : 50000}
                  placeholder={
                    formData.cautionType === "pourcentage"
                      ? "Max: 50"
                      : "Max: 50000"
                  }
                  className="w-full rounded-2xl border border-neutral-200 bg-white px-5 py-4 outline-none"
                  value={formData.cautionValeur}
                  onChange={(e) => {
                    const raw = Number(e.target.value || 0);
                    const cap =
                      formData.cautionType === "pourcentage" ? 50 : 50000;
                    updateField("cautionValeur", String(Math.min(raw, cap)));
                  }}
                />
              )}
              <p className="text-xs font-semibold text-neutral-500">
                La caution journalière est plafonnée à 50% du séjour, maximum
                50,000 FCFA.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <CounterField
                label="Séjour minimum"
                unit="nuit(s)"
                value={formData.sejour_minimum || "1"}
                min={1}
                max={30}
                onChange={(value) => updateField("sejour_minimum", value)}
              />
              <CounterField
                label="Capacité max."
                unit="personne(s)"
                value={formData.capacite_max || "2"}
                min={1}
                max={20}
                onChange={(value) => updateField("capacite_max", value)}
              />
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <CounterField
                label="Caution remboursable"
                unit="mois de loyer"
                value={formData.cautionMois || "3"}
                min={0}
                max={12}
                onChange={(value) => updateField("cautionMois", value)}
              />
              <CounterField
                label="Loyer d'avance"
                unit="mois de loyer"
                value={formData.loyerAvanceMois || "1"}
                min={1}
                max={12}
                onChange={(value) => updateField("loyerAvanceMois", value)}
              />
            </div>
            <div className="space-y-2 rounded-2xl bg-white p-4 text-sm">
              <div className="flex justify-between text-neutral-600">
                <span>Caution</span>
                <span className="font-extrabold text-neutral-950">
                  {formatAmount(moveInBreakdown.cautionAmount)}
                </span>
              </div>
              <div className="flex justify-between text-neutral-600">
                <span>
                  Loyer d&apos;avance ({moveInBreakdown.loyerAvanceMois} mois)
                </span>
                <span className="font-extrabold text-neutral-950">
                  {formatAmount(moveInBreakdown.advanceRentAmount)}
                </span>
              </div>
              <div className="flex justify-between border-t border-neutral-100 pt-2">
                <span className="font-extrabold text-neutral-950">
                  Total à l&apos;entrée
                </span>
                <span className="font-extrabold text-primary">
                  {formatAmount(moveInBreakdown.totalAmount)}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      <InterdictionsSelector
        selected={formData.interdictions}
        onChange={(value) => updateField("interdictions", value)}
      />

      {renderRulesEditor()}
    </div>
  );

  const renderOwnerSearch = () => (
    <div className="space-y-3">
      <label className="flex cursor-pointer items-center gap-3">
        <input
          type="checkbox"
          checked={onBehalfOfClient}
          onChange={(e) => {
            setOnBehalfOfClient(e.target.checked);
            if (!e.target.checked) {
              setSelectedOwner(null);
              setOwnerSearch("");
              setOwnerResults([]);
            }
          }}
          className="h-5 w-5 rounded border-neutral-300 text-primary"
        />
        <span className="font-extrabold text-neutral-900">
          Annonce pour le compte d&apos;un client
        </span>
      </label>

      {onBehalfOfClient && (
        <div className="space-y-2">
          {isSaleListing && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setOwnerEntryMode("existing")}
                className={`rounded-2xl border px-4 py-3 text-sm font-extrabold ${
                  ownerEntryMode === "existing"
                    ? "border-primary bg-white text-primary"
                    : "border-neutral-200 text-neutral-600"
                }`}
              >
                Propriétaire déjà inscrit
              </button>
              <button
                type="button"
                onClick={() => {
                  setOwnerEntryMode("direct");
                  setSelectedOwner(null);
                }}
                className={`rounded-2xl border px-4 py-3 text-sm font-extrabold ${
                  ownerEntryMode === "direct"
                    ? "border-primary bg-white text-primary"
                    : "border-neutral-200 text-neutral-600"
                }`}
              >
                Propriétaire pas encore inscrit
              </button>
            </div>
          )}
          {ownerEntryMode === "direct" && isSaleListing ? (
            <div className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-extrabold text-neutral-600">
                    Prénom *
                  </label>
                  <input
                    value={directOwner.firstName}
                    onChange={(event) =>
                      setDirectOwner((current) => ({
                        ...current,
                        firstName: event.target.value,
                      }))
                    }
                    className="mt-1 w-full rounded-xl border border-neutral-200 px-4 py-3"
                  />
                  <FieldError message={errors.direct_owner_first_name} />
                </div>
                <div>
                  <label className="text-xs font-extrabold text-neutral-600">
                    Nom *
                  </label>
                  <input
                    value={directOwner.lastName}
                    onChange={(event) =>
                      setDirectOwner((current) => ({
                        ...current,
                        lastName: event.target.value,
                      }))
                    }
                    className="mt-1 w-full rounded-xl border border-neutral-200 px-4 py-3"
                  />
                  <FieldError message={errors.direct_owner_last_name} />
                </div>
              </div>
              <PhoneNumberInput
                iso={directOwner.phoneIso}
                national={directOwner.phoneNational}
                onIsoChange={(phoneIso) =>
                  setDirectOwner((current) => ({ ...current, phoneIso }))
                }
                onNationalChange={(phoneNational) =>
                  setDirectOwner((current) => ({
                    ...current,
                    phoneNational,
                  }))
                }
                label="Téléphone"
                required
                error={errors.direct_owner_phone}
              />
              <label className="flex cursor-pointer items-center gap-3 rounded-xl bg-green-50 px-4 py-3 text-sm font-bold text-green-800">
                <input
                  type="checkbox"
                  checked={directOwner.phoneHasWhatsapp}
                  onChange={(event) =>
                    setDirectOwner((current) => ({
                      ...current,
                      phoneHasWhatsapp: event.target.checked,
                    }))
                  }
                  className="h-5 w-5 rounded border-green-300 text-green-600"
                />
                <WhatsappLogoIcon size={22} weight="fill" />
                Ce numéro est disponible sur WhatsApp
              </label>
              <FieldError message={errors.direct_owner} />
            </div>
          ) : (
            <>
          <label className="text-sm font-extrabold text-neutral-700">
            Propriétaire ou agent <span className="text-red-500">*</span>
          </label>
          <div ref={ownerComboboxRef} className="relative">
            {selectedOwner ? (
              <div
                className={`flex items-center justify-between rounded-2xl border bg-neutral-50 px-5 py-4 ${
                  errors.owner_id ? "border-red-500" : "border-neutral-200"
                }`}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-extrabold text-neutral-950">
                    {selectedOwner.full_name || selectedOwner.email}
                  </p>
                  <p className="truncate text-xs font-semibold text-neutral-500">
                    {selectedOwner.email} · {selectedOwner.user_type}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedOwner(null);
                    setOwnerSearch("");
                    setOwnerResults([]);
                  }}
                  className="ml-3 shrink-0 text-neutral-400 hover:text-neutral-700"
                  aria-label="Effacer la sélection"
                >
                  <XCircleIcon size={22} weight="fill" />
                </button>
              </div>
            ) : (
              <div
                className={`flex items-center gap-3 rounded-2xl border bg-neutral-50 px-5 py-4 ${
                  errors.owner_id ? "border-red-500" : "border-neutral-200"
                }`}
              >
                {loadingOwnerSearch ? (
                  <Loader2
                    className="shrink-0 animate-spin text-neutral-400"
                    size={18}
                  />
                ) : (
                  <MagnifyingGlassIcon
                    size={18}
                    className="shrink-0 text-neutral-400"
                  />
                )}
                <input
                  type="text"
                  value={ownerSearch}
                  onChange={(e) => setOwnerSearch(e.target.value)}
                  onFocus={() =>
                    ownerResults.length > 0 && setShowOwnerDropdown(true)
                  }
                  placeholder="Nom, email, téléphone ou WhatsApp..."
                  className="min-w-0 flex-1 bg-transparent text-sm text-neutral-900 outline-none placeholder:text-neutral-400"
                />
              </div>
            )}
            {showOwnerDropdown && ownerResults.length > 0 && !selectedOwner && (
              <ul className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-2xl border border-neutral-100 bg-white shadow-lg">
                {ownerResults.map((user) => (
                  <li
                    key={user.id}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setSelectedOwner(user);
                      setOwnerSearch("");
                      setOwnerResults([]);
                      setShowOwnerDropdown(false);
                    }}
                    className="flex cursor-pointer items-center justify-between px-5 py-3 transition-colors hover:bg-neutral-50"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-extrabold text-neutral-900">
                        {user.full_name || user.email}
                      </p>
                      <p className="truncate text-xs font-semibold text-neutral-400">
                        {[user.email, user.phone || user.whatsapp]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    <span className="ml-3 shrink-0 rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-bold capitalize text-neutral-600">
                      {user.user_type}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {ownerSearchError && (
            <p className="text-xs font-semibold text-red-600">
              {ownerSearchError}
            </p>
          )}
          <FieldError message={errors.owner_id} />
            </>
          )}
        </div>
      )}
    </div>
  );

  const renderStepThree = () => (
    <div className="space-y-8">
      <SectionTitle
        icon={
          <UploadSimpleIcon size={22} className="text-primary" weight="bold" />
        }
        title="Publication"
      />

      <div className="rounded-3xl border border-neutral-200 bg-white p-5">
        <button
          type="button"
          onClick={() => setShowFullPreview((value) => !value)}
          className="flex w-full items-center justify-between gap-3 text-left"
        >
          <div>
            <p className="text-lg font-extrabold text-neutral-950">
              Aperçu de l&apos;annonce
            </p>
            <p className="text-sm font-semibold text-neutral-500">
              {propertyTypeLabel} · {cityLabel} ·{" "}
              {isSaleListing
                ? "à vendre"
                : formData.frequence === "journalier"
                  ? "par nuit"
                  : "par mois"}
            </p>
          </div>
          {showFullPreview ? (
            <CaretUpIcon size={22} />
          ) : (
            <CaretDownIcon size={22} />
          )}
        </button>

        <div className="mt-4 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
          <div className="rounded-2xl bg-neutral-50 p-3">
            <p className="font-bold text-neutral-400">Prix</p>
            <p className="font-extrabold text-neutral-950">
              {formatAmount(rentAmount)}
            </p>
          </div>
          <div className="rounded-2xl bg-neutral-50 p-3">
            <p className="font-bold text-neutral-400">Chambres</p>
            <p className="font-extrabold text-neutral-950">
              {formData.chambres || "0"}
            </p>
          </div>
          <div className="rounded-2xl bg-neutral-50 p-3">
            <p className="font-bold text-neutral-400">Surface</p>
            <p className="font-extrabold text-neutral-950">
              {formData.superficie ? `${formData.superficie} m²` : "Non renseignée"}
            </p>
          </div>
          <div className="rounded-2xl bg-neutral-50 p-3">
            <p className="font-bold text-neutral-400">Photos</p>
            <p className="font-extrabold text-neutral-950">{photos.length}</p>
          </div>
        </div>

        {showFullPreview && (
          <div className="mt-4 space-y-3 border-t border-neutral-100 pt-4 text-sm">
            <p className="font-semibold text-neutral-600">
              {formData.description || "Aucune description renseignée."}
            </p>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <p>
                <span className="font-extrabold">Quartier:</span>{" "}
                {formData.quartier || "-"}
              </p>
              <p>
                <span className="font-extrabold">Équipements:</span>{" "}
                {formData.equipements.length > 0
                  ? formData.equipements.join(", ")
                  : "Aucun"}
              </p>
              <p>
                <span className="font-extrabold">Interdictions:</span>{" "}
                {formData.interdictions.length > 0
                  ? formData.interdictions.join(", ")
                  : "Aucune"}
              </p>
              <p>
                <span className="font-extrabold">Règles:</span>{" "}
                {cleanRules(formData.dosAndDonts).length || "Aucune"}
              </p>
              {isStaffOrFounder && (
                <p>
                  <span className="font-extrabold">Visite virtuelle:</span>{" "}
                  {formData.virtualTourUrl.trim() || "Aucune"}
                </p>
              )}
              {isSaleListing ? null : formData.frequence === "journalier" ? (
                <>
                  <p>
                    <span className="font-extrabold">Séjour min.:</span>{" "}
                    {formData.sejour_minimum || 1} nuit(s)
                  </p>
                  <p>
                    <span className="font-extrabold">Capacité:</span>{" "}
                    {formData.capacite_max || 2} personne(s)
                  </p>
                </>
              ) : (
                <>
                  <p>
                    <span className="font-extrabold">Loyer d&apos;avance:</span>{" "}
                    {moveInBreakdown.loyerAvanceMois} mois
                  </p>
                  <p>
                    <span className="font-extrabold">
                      Total à l&apos;entrée:
                    </span>{" "}
                    {formatAmount(moveInBreakdown.totalAmount)}
                  </p>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {!isSaleListing && !isDailyListing && (
        <div className="space-y-4 rounded-3xl border border-neutral-200 bg-white p-5">
          <h4 className="text-lg font-extrabold text-neutral-950">
            Mode de publication
          </h4>
          <SegmentedButton
            value={paymentChoice}
            options={[
              { id: "free", label: "Gratuite" },
              { id: "pay", label: "Packs payants" },
            ]}
            onChange={(value) => {
              setPaymentChoice(value);
              setFreeTermsAccepted(false);
              setReferralQuote(null);
              setReferralError(null);
              if (value === "free") {
                setSelectedTier(FREE_LISTING_DEFAULT_TIER_ID);
                setSelectedAddOns([]);
              }
            }}
          />
          <p className="text-sm font-semibold leading-6 text-neutral-500">
            {paymentChoice === "free"
              ? "Publiez sans paiement aujourd'hui. Roogo prélèvera 50% du premier loyer encaissé."
              : "Choisissez un pack maintenant pour payer la publication et éviter le frais de succès au premier loyer."}
          </p>
        </div>
      )}

      {!isSaleListing && <div className="space-y-4">
        <h4 className="text-lg font-extrabold text-neutral-950">
          {isDailyListing
            ? "Publication journalière"
            : isFreeMonthlyListing
              ? "Publication gratuite"
              : "Packs de publication"}{" "}
          {!isFreeMonthlyListing && <span className="text-red-500">*</span>}
        </h4>
        {isDailyListing ? (
          <button
            type="button"
            onClick={() => {
              setSelectedTier(FREE_LISTING_DEFAULT_TIER_ID);
              setErrors((current) => {
                const next = { ...current };
                delete next.tier_id;
                return next;
              });
            }}
            className="w-full rounded-3xl border-2 border-primary bg-primary/5 p-5 text-left transition-all"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-lg font-extrabold text-neutral-950">
                  Publication journalière
                </p>
                <p className="mt-2 max-w-xl text-sm font-semibold leading-6 text-neutral-500">
                  Publication gratuite pour une location journalière. Les
                  options photo, vidéo et visibilité restent disponibles à
                  l&apos;étape suivante.
                </p>
              </div>
              <p className="shrink-0 text-2xl font-black text-neutral-950">
                {paymentChoice === "free"
                  ? formatAmount(0)
                  : formatAmount(DAILY_LISTING_PUBLICATION_FEE)}
              </p>
            </div>
          </button>
        ) : isFreeMonthlyListing ? (
          <button
            type="button"
            onClick={() => {
              setSelectedTier(FREE_LISTING_DEFAULT_TIER_ID);
              setErrors((current) => {
                const next = { ...current };
                delete next.tier_id;
                return next;
              });
            }}
            className="w-full rounded-3xl border-2 border-primary bg-primary/5 p-5 text-left transition-all"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-lg font-extrabold text-neutral-950">
                  Publication gratuite
                </p>
                <p className="mt-2 max-w-xl text-sm font-semibold leading-6 text-neutral-500">
                  Mise en ligne avec les avantages du pack Premium. Aucun
                  paiement aujourd&apos;hui; le frais Roogo sera prélevé sur le
                  premier loyer encaissé.
                </p>
              </div>
              <p className="shrink-0 text-2xl font-black text-neutral-950">
                {formatAmount(0)}
              </p>
            </div>
          </button>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {sortedPaidTiers.map((tier) => {
              const selected = selectedTier === tier.id;
              const price = tier.base_fee + rentAmount * (commissionRate ?? 0);
              return (
                <button
                  key={tier.id}
                  type="button"
                  onClick={() => {
                    setSelectedTier(tier.id);
                    setErrors((current) => {
                      const next = { ...current };
                      delete next.tier_id;
                      return next;
                    });
                  }}
                  className={`rounded-3xl border-2 p-5 text-left transition-all ${
                    selected
                      ? "border-primary bg-primary/5"
                      : "border-neutral-200 bg-white hover:border-neutral-300"
                  }`}
                >
                  <p className="text-lg font-extrabold capitalize text-neutral-950">
                    {tier.id}
                  </p>
                  <p className="mt-2 text-2xl font-black text-neutral-950">
                    {formatAmount(price)}
                  </p>
                  <ul className="mt-4 space-y-2 text-sm font-semibold text-neutral-600">
                    <li>{tier.photo_limit} photos</li>
                    <li>{tier.slot_limit} candidats</li>
                    {tier.video_included && <li>Vidéo incluse</li>}
                  </ul>
                </button>
              );
            })}
          </div>
        )}
        <FieldError message={errors.tier_id} />
        {paymentChoice === "pay" && !isDailyListing && commissionConfigError && (
          <p className="text-xs font-semibold text-red-600">
            {commissionConfigError}
          </p>
        )}
      </div>}

      {isStaffOrFounder && (
        <div className="space-y-5 rounded-3xl border border-primary/20 bg-primary/5 p-5">
          <h4 className="text-lg font-extrabold text-neutral-950">
            Contrôles staff
          </h4>
          {renderOwnerSearch()}
          <label className="flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={isTestListing}
              onChange={(e) => setIsTestListing(e.target.checked)}
              className="h-5 w-5 rounded border-neutral-300 text-primary"
            />
            <span className="font-extrabold text-neutral-900">
              Annonce test
            </span>
          </label>
        </div>
      )}

      {isSaleListing ? (
        <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5">
          <h4 className="text-lg font-extrabold text-amber-950">
            Vente soumise à vérification
          </h4>
          <p className="mt-2 text-sm font-semibold leading-6 text-amber-800">
            L&apos;annonce sera enregistrée en attente. Elle ne pourra être mise
            en ligne qu&apos;après rattachement du propriétaire, vérification
            des documents et signature du mandat.
          </p>
        </div>
      ) : <div className="rounded-3xl border border-neutral-200 bg-neutral-50 p-5">
        <h4 className="text-lg font-extrabold text-neutral-950">
          {isFreeMonthlyListing ? "Récapitulatif" : "Récapitulatif du paiement"}
        </h4>
        <div className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between text-neutral-600">
            <span>Pack choisi</span>
            <span className="font-extrabold text-neutral-950">
              {formatAmount(baseFeeAmount + commissionAmount)}
            </span>
          </div>
          <div className="flex justify-between text-neutral-600">
            <span>Options supplémentaires</span>
            <span className="font-extrabold text-neutral-950">
              {formatAmount(addOnsAmount)}
            </span>
          </div>
          {isFreeMonthlyListing && (
            <div className="flex justify-between text-neutral-600">
              <span>Frais au premier loyer</span>
              <span className="font-extrabold text-neutral-950">
                {formatAmount(deferredSuccessFeeAmount)}
              </span>
            </div>
          )}
          {!isDailyListing &&
            (isFreeMonthlyListing || (paymentChoice === "pay" && selectedTier)) && (
            <div className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-4">
              <label className="text-xs font-extrabold uppercase tracking-wider text-neutral-500">
                Code de parrainage
              </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  value={referralCode}
                  onChange={(event) => {
                    setReferralCode(event.target.value.toUpperCase());
                    setReferralQuote(null);
                    setReferralError(null);
                  }}
                  placeholder="ROOGO-NOM-123"
                  className="min-w-0 flex-1 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm font-bold uppercase outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
                <button
                  type="button"
                  onClick={() => validateReferralCode()}
                  disabled={validatingReferral || !referralCode.trim()}
                  className="rounded-xl bg-neutral-900 px-4 py-3 text-sm font-extrabold text-white disabled:opacity-50"
                >
                  {validatingReferral ? "Validation..." : "Appliquer"}
                </button>
              </div>
              {referralQuote && (
                <p className="text-xs font-semibold text-green-700">
                  Code appliqué
                  {referralQuote.referrerName
                    ? ` (${referralQuote.referrerName})`
                    : ""}{" "}
                  : -{formatAmount(referralQuote.discountAmount)}
                </p>
              )}
              {referralError && (
                <p className="text-xs font-semibold text-red-600">
                  {referralError}
                </p>
              )}
            </div>
          )}
          {referralDiscountAmount > 0 && (
            <div className="flex justify-between text-green-700">
              <span>
                {isFreeMonthlyListing
                  ? "Remise sur frais différé"
                  : "Remise parrainage"}
              </span>
              <span className="font-extrabold">
                -{formatAmount(referralDiscountAmount)}
              </span>
            </div>
          )}
          {isFreeMonthlyListing && referralQuote && (
            <div className="flex justify-between text-neutral-600">
              <span>Frais différé après remise</span>
              <span className="font-extrabold text-neutral-950">
                {formatAmount(referralQuote.paidAmount)}
              </span>
            </div>
          )}
          <div className="flex justify-between border-t border-neutral-200 pt-3 text-base">
            <span className="font-extrabold text-neutral-950">
              {isFreeMonthlyListing ? "À payer aujourd'hui" : "Total à payer"}
            </span>
            <span className="text-xl font-black text-primary">
              {formatAmount(payableAmount)}
            </span>
          </div>
        </div>
      </div>}
    </div>
  );

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 md:px-6 md:py-10">
      <div className="mb-8 flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-3xl font-black text-neutral-950 md:text-4xl">
            Ajouter une propriété
          </h2>
          <p className="mt-2 max-w-2xl text-base font-medium text-neutral-500">
            Publiez votre bien en trois étapes.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isDevelopment() && isStaffOrFounder && (
            <button
              type="button"
              onClick={handleAutoFill}
              className="rounded-full bg-purple-100 px-4 py-2 text-sm font-extrabold text-purple-700 hover:bg-purple-200"
            >
              Remplir auto
            </button>
          )}
          <button
            type="button"
            onClick={handleSaveDraft}
            className="rounded-full bg-blue-50 px-4 py-2 text-sm font-extrabold text-blue-700 hover:bg-blue-100"
          >
            Enregistrer brouillon
          </button>
          <button
            type="button"
            onClick={handleClearDraft}
            className="rounded-full bg-neutral-100 px-4 py-2 text-sm font-extrabold text-neutral-600 hover:bg-neutral-200"
          >
            Effacer
          </button>
        </div>
      </div>

      <div className="mb-8 grid grid-cols-3 gap-2">
        {STEPS.map((step) => {
          const active = currentStep === step.id;
          const completed = currentStep > step.id;
          return (
            <button
              key={step.id}
              type="button"
              onClick={() => {
                if (step.id <= currentStep || validateStep(currentStep)) {
                  setCurrentStep(step.id);
                }
              }}
              className={`rounded-2xl border px-3 py-3 text-center text-xs font-extrabold transition-all md:text-sm ${
                active
                  ? "border-primary bg-primary text-white"
                  : completed
                    ? "border-primary/30 bg-primary/10 text-primary"
                    : "border-neutral-200 bg-white text-neutral-500"
              }`}
            >
              <span className="block text-[11px] uppercase tracking-wider">
                Étape {step.id}
              </span>
              {step.label}
            </button>
          );
        })}
      </div>

      <div className="rounded-[28px] border border-neutral-100 bg-white p-5 shadow-xl md:p-8">
        {currentStep === 1 && renderStepOne()}
        {currentStep === 2 && renderStepTwo()}
        {currentStep === 3 && renderStepThree()}
      </div>

      <div className="sticky bottom-0 z-20 -mx-4 mt-8 border-t border-neutral-100 bg-white/95 px-4 py-4 backdrop-blur md:mx-0 md:rounded-t-3xl md:border md:px-5">
        <div className="mx-auto flex max-w-5xl gap-3">
          <button
            type="button"
            onClick={currentStep === 1 ? collapse : goBack}
            className="flex flex-1 items-center justify-center gap-2 rounded-full bg-neutral-100 px-5 py-4 text-sm font-extrabold text-neutral-700 hover:bg-neutral-200"
          >
            <CaretLeftIcon size={18} weight="bold" />
            {currentStep === 1 ? "Annuler" : "Retour"}
          </button>
          {currentStep < 3 ? (
            <button
              type="button"
              onClick={goNext}
              className="flex flex-2 items-center justify-center gap-2 rounded-full bg-primary px-5 py-4 text-sm font-extrabold text-white shadow-lg disabled:opacity-70"
            >
              Suivant
              <CaretRightIcon size={18} weight="bold" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handlePublish}
              disabled={isSubmitting}
              className="flex flex-2 items-center justify-center gap-2 rounded-full bg-primary px-5 py-4 text-sm font-extrabold text-white shadow-lg disabled:opacity-70"
            >
              {isSubmitting ? (
                <Loader2 className="animate-spin" size={22} />
              ) : (
                <>
                  <UploadSimpleIcon size={20} weight="bold" />
                  Publier
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {showFreeTermsModal && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40 px-4 py-6 sm:items-center">
          <div className="w-full max-w-xl rounded-3xl bg-white p-6 shadow-2xl">
            <h3 className="text-xl font-black text-neutral-950">
              Conditions de publication gratuite
            </h3>
            <p className="mt-4 text-sm font-semibold leading-6 text-neutral-600">
              En publiant sans paiement initial, vous confirmez que Roogo ne
              vous facturera aucun frais tant que nous ne vous apportons pas un
              locataire.
            </p>
            <p className="mt-3 text-sm font-semibold leading-6 text-neutral-600">
              Lorsque le premier loyer sera encaissé, vous acceptez que Roogo
              prélève 50% du premier mois de loyer comme frais de service, dans
              la limite autorisée par la loi au Burkina Faso.
            </p>
            <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
              <input
                type="checkbox"
                checked={freeTermsAccepted}
                onChange={(event) => setFreeTermsAccepted(event.target.checked)}
                className="mt-1 h-5 w-5 accent-primary"
              />
              <span className="text-sm font-extrabold leading-6 text-neutral-950">
                J&apos;ai lu et j&apos;accepte ces conditions.
              </span>
            </label>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => setShowFreeTermsModal(false)}
                className="flex-1 rounded-full bg-neutral-100 px-5 py-3 text-sm font-extrabold text-neutral-700 hover:bg-neutral-200"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={!freeTermsAccepted || isSubmitting}
                onClick={() => {
                  setShowFreeTermsModal(false);
                  handlePublish();
                }}
                className="flex-[1.4] rounded-full bg-primary px-5 py-3 text-sm font-extrabold text-white shadow-lg disabled:opacity-50"
              >
                J&apos;accepte les conditions
              </button>
            </div>
          </div>
        </div>
      )}

      {showUpsell && (
        <UpsellModal
          addons={addonsList}
          selectedTier={selectedTier}
          onCancel={() => setShowUpsell(false)}
          onConfirm={handleUpsellConfirm}
        />
      )}
    </div>
  );
};
