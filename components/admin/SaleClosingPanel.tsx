"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CircleNotchIcon, SealCheckIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/Button";
import {
  bypassFee,
  settle,
  type SaleEconomicsSnapshot,
  type SalePriceLadder,
} from "@/lib/sale-economics";
import { formatSalePct } from "@/lib/sale";

// Roogo Sell v3 closing panel (staff). The server recomputes and enforces every
// number; this panel only previews them. Contains buyer PII: never log it.

type ClosingRow = {
  id: string;
  status: "draft" | "approved" | "notarized" | "settled" | "cancelled";
  final_price: number;
  buyer_user_id: string | null;
  buyer_name: string | null;
  buyer_phone: string | null;
  buyer_referred: boolean;
  seller_referred: boolean;
  buyer_referrer_label: string | null;
  seller_referrer_label: string | null;
  notary_fee: number;
  buyer_referral_fee: number;
  seller_referral_fee: number;
  bypass_fee: number | null;
  roogo_margin: number;
  is_bypass: boolean;
  below_team_floor: boolean;
  approved_at: string | null;
  sold_at: string;
  notary_signed_at: string | null;
  roogo_paid_at: string | null;
  notes: string | null;
};

type ClosingPayload = {
  mandate: {
    id: string;
    sellerNetPrice: number;
    signedAt: string;
    snapshot: SaleEconomicsSnapshot;
    bypassUntil: string;
  } | null;
  ladder: SalePriceLadder | null;
  closing: ClosingRow | null;
  introducedBuyers: {
    id: string;
    fullName: string | null;
    phone: string | null;
    introducedAt: string;
  }[];
  isFounder: boolean;
};

const STATUS_LABELS: Record<ClosingRow["status"], string> = {
  draft: "Brouillon",
  approved: "Approuvée",
  notarized: "Acte signé chez le notaire",
  settled: "Soldée",
  cancelled: "Annulée",
};

const ERROR_LABELS: Record<string, string> = {
  no_signed_v3_mandate: "Aucun mandat v3 signé pour ce bien.",
  invalid_price: "Saisissez un prix de vente valide.",
  below_hard_floor:
    "Prix refusé : il est sous le plancher absolu (net + 10 %).",
  negative_margin: "Prix refusé : les frais dépassent la marge.",
  bypass_requires_buyer:
    "Un contournement exige un acheteur présenté par Roogo (compte).",
  buyer_not_introduced:
    "Cet acheteur n'a aucune demande de visite pour ce bien : Roogo ne l'a pas présenté.",
  bypass_window_expired: "La vente est hors de la période de la clause.",
  sold_before_mandate: "La date de vente précède la signature du mandat.",
  closing_locked: "Cette clôture est verrouillée (acte signé ou soldée).",
  founder_approval_required:
    "Sous le plancher équipe (net + 15 %), seul le fondateur peut approuver.",
  invalid_transition: "Action impossible dans l'état actuel.",
  not_paid: "Enregistrez d'abord le paiement de Roogo.",
  stale_closing: "La clôture a changé entre-temps. Rechargez la page.",
};

function fcfa(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "-";
  return `${Math.round(n).toLocaleString("fr-FR")} FCFA`;
}

function errorLabel(code: unknown, fallback: string) {
  return typeof code === "string" && ERROR_LABELS[code]
    ? ERROR_LABELS[code]
    : fallback;
}

export default function SaleClosingPanel({ propertyId }: { propertyId: string }) {
  const [data, setData] = useState<ClosingPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [finalPrice, setFinalPrice] = useState("");
  const [isBypass, setIsBypass] = useState(false);
  const [buyerUserId, setBuyerUserId] = useState("");
  const [buyerName, setBuyerName] = useState("");
  const [buyerPhone, setBuyerPhone] = useState("");
  const [buyerReferred, setBuyerReferred] = useState(false);
  const [buyerReferrerLabel, setBuyerReferrerLabel] = useState("");
  const [sellerReferred, setSellerReferred] = useState(false);
  const [sellerReferrerLabel, setSellerReferrerLabel] = useState("");
  const [soldAt, setSoldAt] = useState("");
  const [notes, setNotes] = useState("");

  const url = `/api/admin/sales/${propertyId}/closing`;

  const hydrate = useCallback((payload: ClosingPayload) => {
    setData(payload);
    const c = payload.closing;
    setFinalPrice(c ? String(Math.round(Number(c.final_price))) : "");
    setIsBypass(Boolean(c?.is_bypass));
    setBuyerUserId(c?.buyer_user_id ?? "");
    setBuyerName(c?.buyer_name ?? "");
    setBuyerPhone(c?.buyer_phone ?? "");
    setBuyerReferred(Boolean(c?.buyer_referred));
    setBuyerReferrerLabel(c?.buyer_referrer_label ?? "");
    setSellerReferred(Boolean(c?.seller_referred));
    setSellerReferrerLabel(c?.seller_referrer_label ?? "");
    setSoldAt(c?.sold_at ? c.sold_at.slice(0, 10) : "");
    setNotes(c?.notes ?? "");
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(url);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(`Chargement impossible (HTTP ${res.status}).`);
      }
      hydrate(body as ClosingPayload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chargement impossible.");
    } finally {
      setLoading(false);
    }
  }, [url, hydrate]);

  useEffect(() => {
    load();
  }, [load]);

  const mandate = data?.mandate ?? null;
  const locked =
    data?.closing != null &&
    (data.closing.status === "notarized" || data.closing.status === "settled");

  const preview = useMemo(() => {
    const price = Number(finalPrice);
    if (!mandate || !(price > 0)) return null;
    if (isBypass) {
      return { kind: "bypass" as const, fee: bypassFee(price, mandate.snapshot) };
    }
    return {
      kind: "sale" as const,
      split: settle(price, mandate.sellerNetPrice, mandate.snapshot, {
        buyerReferred,
        sellerReferred,
      }),
    };
  }, [finalPrice, mandate, isBypass, buyerReferred, sellerReferred]);

  const blocked =
    preview?.kind === "sale" &&
    (preview.split.belowHardFloor || preview.split.negativeMargin);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          finalPrice: Number(finalPrice),
          isBypass,
          buyerUserId: buyerUserId || null,
          buyerName: buyerName || null,
          buyerPhone: buyerPhone || null,
          buyerReferred,
          buyerReferrerLabel: buyerReferrerLabel || null,
          sellerReferred,
          sellerReferrerLabel: sellerReferrerLabel || null,
          soldAt: soldAt ? new Date(`${soldAt}T12:00:00Z`).toISOString() : null,
          notes: notes || null,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          errorLabel(body.error, `Enregistrement impossible (HTTP ${res.status}).`),
        );
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Enregistrement impossible.");
    } finally {
      setBusy(false);
    }
  };

  const act = async (action: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          errorLabel(body.error, `Action impossible (HTTP ${res.status}).`),
        );
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action impossible.");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <section className="rounded-[32px] border border-neutral-100 bg-white p-6 text-sm text-neutral-500">
        Chargement de la clôture…
      </section>
    );
  }

  const closing = data?.closing ?? null;

  return (
    <section className="rounded-[32px] border border-neutral-100 bg-white p-6 shadow-sm space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="inline-flex rounded-full bg-[#C96A2E]/10 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-[#C96A2E]">
            Vente v3
          </span>
          <h3 className="mt-3 text-lg font-black text-neutral-950">
            Clôture de la vente
          </h3>
        </div>
        {closing && (
          <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-bold text-neutral-700">
            {STATUS_LABELS[closing.status]}
          </span>
        )}
      </div>

      {!mandate ? (
        <p className="text-sm text-neutral-600">
          Aucun mandat v3 signé pour ce bien. La clôture s&apos;active après la
          signature d&apos;un mandat au prix net garanti.
        </p>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <dt className="text-neutral-500">Net vendeur garanti</dt>
            <dd className="text-right font-bold">{fcfa(mandate.sellerNetPrice)}</dd>
            {data?.ladder && (
              <>
                <dt className="text-neutral-500">Prix affiché</dt>
                <dd className="text-right">{fcfa(data.ladder.display.listing)}</dd>
                <dt className="text-neutral-500">Cible</dt>
                <dd className="text-right">{fcfa(data.ladder.display.target)}</dd>
                <dt className="text-neutral-500">Plancher équipe</dt>
                <dd className="text-right">{fcfa(data.ladder.exact.teamFloor)}</dd>
                <dt className="text-neutral-500">Plancher absolu</dt>
                <dd className="text-right">{fcfa(data.ladder.exact.hardFloor)}</dd>
              </>
            )}
            <dt className="text-neutral-500">Clause de contournement</dt>
            <dd className="text-right">
              {formatSalePct(mandate.snapshot.bypassFeePct)} jusqu&apos;au{" "}
              {new Date(mandate.bypassUntil).toLocaleDateString("fr-FR")}
            </dd>
          </dl>

          <fieldset disabled={locked || busy} className="space-y-3">
            <PanelInput
              label="Prix de vente final (FCFA)"
              value={finalPrice}
              onChange={setFinalPrice}
              inputMode="numeric"
            />
            <PanelCheck
              label="Vente hors Roogo à un acheteur présenté par Roogo (contournement)"
              checked={isBypass}
              onChange={setIsBypass}
            />
            <label className="block text-xs font-bold text-neutral-600">
              Acheteur présenté par Roogo
              <select
                value={buyerUserId}
                onChange={(e) => setBuyerUserId(e.target.value)}
                className="mt-1 h-11 w-full rounded-xl border border-neutral-200 bg-white px-3 text-sm"
              >
                <option value="">Aucun ou acheteur sans compte</option>
                {data?.introducedBuyers.map((buyer) => (
                  <option key={buyer.id} value={buyer.id}>
                    {(buyer.fullName || "Acheteur") +
                      (buyer.phone ? ` · ${buyer.phone}` : "") +
                      ` · visite demandée le ${new Date(buyer.introducedAt).toLocaleDateString("fr-FR")}`}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <PanelInput label="Nom de l'acheteur" value={buyerName} onChange={setBuyerName} />
              <PanelInput
                label="Téléphone de l'acheteur"
                value={buyerPhone}
                onChange={setBuyerPhone}
                inputMode="tel"
              />
            </div>
            {!isBypass && (
              <>
                <PanelCheck
                  label="Un apporteur a amené l'acheteur"
                  checked={buyerReferred}
                  onChange={setBuyerReferred}
                />
                {buyerReferred && (
                  <PanelInput
                    label="Apporteur acheteur (nom, téléphone)"
                    value={buyerReferrerLabel}
                    onChange={setBuyerReferrerLabel}
                  />
                )}
                <PanelCheck
                  label="Un apporteur a recommandé le vendeur"
                  checked={sellerReferred}
                  onChange={setSellerReferred}
                />
                {sellerReferred && (
                  <PanelInput
                    label="Apporteur vendeur (nom, téléphone)"
                    value={sellerReferrerLabel}
                    onChange={setSellerReferrerLabel}
                  />
                )}
              </>
            )}
            <PanelInput
              label="Date de la vente"
              value={soldAt}
              onChange={setSoldAt}
              type="date"
            />
            <PanelInput label="Notes internes" value={notes} onChange={setNotes} />
          </fieldset>

          {preview && (
            <div className="rounded-2xl border border-[#C96A2E]/20 bg-[#C96A2E]/5 p-4 text-sm text-neutral-700">
              {preview.kind === "bypass" ? (
                <p>
                  Frais de contournement dus à Roogo :{" "}
                  <strong>{fcfa(preview.fee)}</strong>
                </p>
              ) : (
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
                  <dt>Vendeur (net garanti)</dt>
                  <dd className="text-right">{fcfa(preview.split.sellerNetPrice)}</dd>
                  <dt>Notaire</dt>
                  <dd className="text-right">{fcfa(preview.split.notaryFee)}</dd>
                  <dt>Apporteur acheteur</dt>
                  <dd className="text-right">{fcfa(preview.split.buyerReferralFee)}</dd>
                  <dt>Apporteur vendeur</dt>
                  <dd className="text-right">{fcfa(preview.split.sellerReferralFee)}</dd>
                  <dt className="font-bold text-neutral-900">Marge Roogo</dt>
                  <dd className="text-right font-bold text-neutral-900">
                    {fcfa(preview.split.roogoMargin)}
                  </dd>
                </dl>
              )}
              {preview.kind === "sale" && preview.split.belowHardFloor && (
                <p className="mt-2 font-semibold text-red-700">
                  Sous le plancher absolu : cette vente est refusée.
                </p>
              )}
              {preview.kind === "sale" &&
                !preview.split.belowHardFloor &&
                preview.split.belowTeamFloor && (
                  <p className="mt-2 font-semibold text-amber-700">
                    Sous le plancher équipe : l&apos;approbation du fondateur est
                    requise.
                  </p>
                )}
            </div>
          )}

          {error && (
            <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              {error}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            {!locked && (
              <Button
                type="button"
                onClick={save}
                disabled={busy || blocked || !(Number(finalPrice) > 0)}
                className="gap-2"
              >
                {busy && <CircleNotchIcon size={16} className="animate-spin" />}
                {closing ? "Mettre à jour" : "Enregistrer le brouillon"}
              </Button>
            )}
            {closing?.status === "draft" && (
              <Button
                type="button"
                variant="outline"
                onClick={() => act("approve")}
                disabled={
                  busy ||
                  (closing.below_team_floor && !closing.is_bypass && !data?.isFounder)
                }
                className="gap-2"
              >
                <SealCheckIcon size={16} weight="bold" />
                {closing.below_team_floor && !closing.is_bypass
                  ? "Approbation fondateur"
                  : "Approuver"}
              </Button>
            )}
            {closing?.status === "approved" && (
              <Button type="button" variant="outline" onClick={() => act("notarize")} disabled={busy}>
                Acte signé chez le notaire
              </Button>
            )}
            {closing?.status === "notarized" && !closing.roogo_paid_at && (
              <Button type="button" variant="outline" onClick={() => act("mark_paid")} disabled={busy}>
                Paiement Roogo reçu
              </Button>
            )}
            {closing?.status === "notarized" && closing.roogo_paid_at && (
              <Button type="button" variant="outline" onClick={() => act("settle")} disabled={busy}>
                Solder la vente
              </Button>
            )}
            {closing && closing.status !== "settled" && (
              <Button type="button" variant="ghost" onClick={() => act("cancel")} disabled={busy}>
                Annuler la clôture
              </Button>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function PanelInput({
  label,
  value,
  onChange,
  type = "text",
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  inputMode?: "numeric" | "tel" | "text";
}) {
  return (
    <label className="block text-xs font-bold text-neutral-600">
      {label}
      <input
        type={type}
        inputMode={inputMode}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 h-11 w-full rounded-xl border border-neutral-200 bg-white px-3 text-sm font-semibold text-neutral-900 outline-none focus:border-[#C96A2E]"
      />
    </label>
  );
}

function PanelCheck({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm font-semibold text-neutral-700">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-[#C96A2E]"
      />
      {label}
    </label>
  );
}
