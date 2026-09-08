"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  HouseLineIcon,
  PlusIcon,
  ArrowClockwiseIcon,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/Button";
import {
  isNewerRequestVersion,
  mergeRequestDraft,
  toRequestDraft,
  REQUEST_FIELD_LABELS,
  type RequestField,
} from "@/lib/property-request-drafts";
import {
  PROPERTY_REQUEST_TYPES,
  RESPONSE_LABELS,
  RESPONSE_STATUSES,
  commissionEstimate,
  type PropertyRequest,
  type PropertyRequestInput,
  type PropertyResponse,
} from "@/lib/property-requests";

const money = (n: number) => `${n.toLocaleString("fr-FR")} FCFA`;
const statusLabels = { draft: "Brouillon", open: "Ouvert", closed: "Fermé" };
const fieldClass =
  "mt-1 w-full rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm font-medium outline-none focus:border-primary focus:ring-1 focus:ring-primary";
const panelClass = "rounded-3xl border border-neutral-200 bg-white p-5 md:p-6";

class RequestApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok)
    throw new RequestApiError(
      data?.error || "Opération impossible.",
      res.status,
    );
  if (!data)
    throw new Error("Réponse du serveur invalide. Veuillez réessayer.");
  return data as T;
}

function RequestForm({
  request,
  latest,
  onSaved,
  onCancel,
  onSavingChange,
}: {
  request: PropertyRequest | null;
  latest: PropertyRequest | null;
  onSaved: (request: PropertyRequest) => void;
  onCancel: () => void;
  onSavingChange: (saving: boolean) => void;
}) {
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [error, setError] = useState("");
  const [model, setModel] = useState(() => ({
    base: request,
    draft: toRequestDraft(request),
    conflicts: [] as RequestField[],
  }));
  const [notice, setNotice] = useState("");
  const listingType = model.draft.listing_type;
  const receiveLatest = useCallback((incoming: PropertyRequest) => {
    setModel((current) => {
      if (
        !current.base ||
        incoming.id !== current.base.id ||
        !isNewerRequestVersion(incoming.updated_at, current.base.updated_at)
      )
        return current;
      return {
        base: incoming,
        ...mergeRequestDraft(
          toRequestDraft(current.base),
          current.draft,
          toRequestDraft(incoming),
          current.conflicts,
        ),
      };
    });
  }, []);
  useEffect(() => {
    if (
      latest &&
      model.base &&
      latest.id === model.base.id &&
      isNewerRequestVersion(latest.updated_at, model.base.updated_at)
    ) {
      receiveLatest(latest);
      setError("");
    }
  }, [latest, model.base, receiveLatest]);
  const edit = (field: RequestField, value: string) =>
    setModel((current) => ({
      ...current,
      draft: { ...current.draft, [field]: value },
    }));
  const resolve = (field: RequestField, useSaved: boolean) =>
    setModel((current) => ({
      ...current,
      draft: {
        ...current.draft,
        [field]: useSaved
          ? toRequestDraft(current.base)[field]
          : current.draft[field],
      },
      conflicts: current.conflicts.filter((key) => key !== field),
    }));
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingRef.current || model.conflicts.length) return;
    const value = (key: RequestField) => model.draft[key];
    const optionalNumber = (key: RequestField) =>
      value(key) === "" ? null : Number(value(key));
    const input = {
      title: value("title"),
      description: value("description"),
      listing_type: listingType,
      property_type: value("property_type"),
      city: value("city"),
      neighborhood: value("neighborhood"),
      budget_min: optionalNumber("budget_min"),
      budget_max: Number(value("budget_max")),
      min_area: optionalNumber("min_area"),
      min_bedrooms: optionalNumber("min_bedrooms"),
      commission_rate: Number(value("commission_rate")),
      commission_terms: value("commission_terms"),
      customer_name: value("customer_name"),
      customer_contact: value("customer_contact"),
      internal_notes: value("internal_notes"),
      status: value("status"),
      ...(model.base ? { updated_at: model.base.updated_at } : {}),
    };
    savingRef.current = true;
    setSaving(true);
    onSavingChange(true);
    setError("");
    setNotice("");
    try {
      const result = await api<{ request: PropertyRequest }>(
        `/api/property-requests${request ? `/${request.id}` : ""}`,
        { method: request ? "PUT" : "POST", body: JSON.stringify(input) },
      );
      onSaved(result.request);
    } catch (e) {
      if (e instanceof RequestApiError && e.status === 409 && request) {
        try {
          const data = await api<{ request: PropertyRequest }>(
            `/api/property-requests/${request.id}`,
          );
          receiveLatest(data.request);
          setNotice(
            "L’appel a été actualisé. Vos modifications sont conservées. Vérifiez les éventuels conflits avant d’enregistrer à nouveau.",
          );
          return;
        } catch {
          setError(
            "Impossible d’actualiser l’appel. Votre brouillon est conservé ; utilisez Actualiser puis réessayez.",
          );
          return;
        }
      }
      setError(e instanceof Error ? e.message : "Enregistrement impossible.");
    } finally {
      savingRef.current = false;
      setSaving(false);
      onSavingChange(false);
    }
  }
  const textField = (
    key: keyof PropertyRequestInput,
    label: string,
    required = false,
    type = "text",
    maxLength = 160,
  ) => (
    <label className="text-sm font-bold" key={key}>
      {label}
      <input
        name={key}
        type={type}
        required={required}
        maxLength={maxLength}
        min={type === "number" ? (key === "min_bedrooms" ? 0 : 1) : undefined}
        step={key === "min_area" ? "any" : 1}
        value={model.draft[key]}
        onChange={(e) => edit(key, e.target.value)}
        className={fieldClass}
      />
    </label>
  );
  return (
    <form onSubmit={submit} className={panelClass}>
      <h2 className="mb-5 text-xl font-black">
        {request ? "Modifier l’appel" : "Nouvel appel à biens"}
      </h2>
      <fieldset disabled={saving} className="grid gap-4 md:grid-cols-2">
        {textField("title", "Titre de l’appel *", true)}
        <label className="text-sm font-bold">
          Transaction
          <select
            name="listing_type"
            value={listingType}
            onChange={(e) => edit("listing_type", e.target.value)}
            className={fieldClass}
          >
            <option value="vendre">Achat</option>
            <option value="louer">Location mensuelle</option>
          </select>
        </label>
        <label className="text-sm font-bold">
          Type de bien
          <select
            name="property_type"
            value={model.draft.property_type}
            onChange={(e) => edit("property_type", e.target.value)}
            className={fieldClass}
          >
            {PROPERTY_REQUEST_TYPES.map((type) => (
              <option key={type}>{type}</option>
            ))}
          </select>
        </label>
        {textField("city", "Ville *", true, "text", 100)}
        {textField("neighborhood", "Quartier souhaité")}
        {textField("budget_min", "Budget minimum (FCFA)", false, "number")}
        {textField(
          "budget_max",
          `Budget maximum (FCFA${listingType === "louer" ? "/mois" : ""}) *`,
          true,
          "number",
        )}
        {textField("min_area", "Surface minimum (m²)", false, "number")}
        {textField("min_bedrooms", "Chambres minimum", false, "number")}
        <label className="text-sm font-bold">
          Description publique *
          <textarea
            name="description"
            required
            minLength={10}
            maxLength={4000}
            value={model.draft.description}
            onChange={(e) => edit("description", e.target.value)}
            rows={3}
            className={fieldClass}
          />
        </label>
        <div className="rounded-2xl bg-orange-50 p-4 md:col-span-2">
          <h3 className="font-bold">Rémunération des agents</h3>
          <p className="mt-1 text-sm text-neutral-600">
            Le taux porte sur{" "}
            {listingType === "vendre"
              ? "le prix de vente final"
              : "un mois de loyer"}
            . Précisez les conditions de paiement. Les propriétaires ne touchent
            pas de commission d’apport.
          </p>
          <label className="mt-3 block text-sm font-bold">
            Commission (%) *
            <input
              name="commission_rate"
              type="number"
              required
              min="0.01"
              max="100"
              step="0.01"
              value={model.draft.commission_rate}
              onChange={(e) => edit("commission_rate", e.target.value)}
              className={fieldClass}
            />
          </label>
          <label className="mt-3 block text-sm font-bold">
            Conditions de commission *
            <textarea
              name="commission_terms"
              required
              minLength={20}
              maxLength={3000}
              rows={3}
              value={model.draft.commission_terms}
              onChange={(e) => edit("commission_terms", e.target.value)}
              placeholder="Indiquez les conditions, le déclencheur et le délai de paiement de la commission."
              className={fieldClass}
            />
          </label>
          <p className="mt-2 text-xs text-neutral-600">
            Les réponses déjà reçues conservent leur taux et leurs conditions
            d’origine.
          </p>
        </div>
        <div className="grid gap-4 rounded-2xl bg-neutral-50 p-4 md:col-span-2 md:grid-cols-2">
          <h3 className="font-bold md:col-span-2">
            Client · visible uniquement par l’équipe
          </h3>
          {textField("customer_name", "Nom du client *", true)}
          {textField(
            "customer_contact",
            "Téléphone ou e-mail du client *",
            true,
            "text",
            200,
          )}
          <label className="text-sm font-bold md:col-span-2">
            Notes internes
            <textarea
              name="internal_notes"
              maxLength={4000}
              value={model.draft.internal_notes}
              onChange={(e) => edit("internal_notes", e.target.value)}
              rows={2}
              className={fieldClass}
            />
          </label>
        </div>
        <label className="text-sm font-bold">
          Publication
          <select
            name="status"
            value={model.draft.status}
            onChange={(e) => edit("status", e.target.value)}
            className={fieldClass}
          >
            {Object.entries(statusLabels).map(([key, label]) => (
              <option value={key} key={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {error && (
          <p role="alert" className="text-sm text-red-700 md:col-span-2">
            {error}
          </p>
        )}
        {(notice || model.base?.updated_at !== request?.updated_at) && (
          <p role="status" className="text-sm md:col-span-2">
            {notice ||
              "L’appel a été actualisé. Vos modifications sont conservées ; vérifiez les champs avant d’enregistrer."}
          </p>
        )}
        {model.conflicts.length > 0 && (
          <div
            role="alert"
            className="space-y-3 rounded-2xl bg-orange-50 p-4 md:col-span-2"
          >
            <p className="font-bold">
              Cet appel a été modifié par un autre membre de l’équipe.
              Choisissez la valeur à conserver pour chaque conflit.
            </p>
            {model.conflicts.map((field) => (
              <div
                key={field}
                className="space-y-2 border-t border-orange-200 pt-3"
              >
                <p className="font-bold">{REQUEST_FIELD_LABELS[field]}</p>
                <p className="whitespace-pre-wrap break-words text-sm">
                  Version enregistrée :{" "}
                  {toRequestDraft(model.base)[field] || "Vide"}
                </p>
                <p className="whitespace-pre-wrap break-words text-sm">
                  Mon brouillon : {model.draft[field] || "Vide"}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => resolve(field, false)}
                  >
                    Garder mon brouillon · {REQUEST_FIELD_LABELS[field]}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => resolve(field, true)}
                  >
                    Utiliser la version enregistrée ·{" "}
                    {REQUEST_FIELD_LABELS[field]}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-3 md:col-span-2">
          <Button type="submit" disabled={saving || model.conflicts.length > 0}>
            {saving ? "Enregistrement…" : "Enregistrer"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={saving}
          >
            Annuler
          </Button>
        </div>
      </fieldset>
    </form>
  );
}

type ResponseDraft = {
  status: PropertyResponse["status"];
  notes: string;
  propertyId: string;
  updated_at: string;
};

function ResponseCard({
  response,
  onUpdated,
  draft,
  onDraft,
}: {
  response: PropertyResponse;
  onUpdated: (response: PropertyResponse) => void;
  draft?: ResponseDraft;
  onDraft: (draft: ResponseDraft) => void;
}) {
  const current = draft || {
    status: response.status,
    notes: response.staff_notes || "",
    propertyId: response.property_id || "",
    updated_at: response.updated_at,
  };
  const { status, notes, propertyId } = current;
  const edit = (changes: Partial<ResponseDraft>) =>
    onDraft({ ...current, ...changes });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const person = response.respondent;
  const whatsapp = person?.whatsapp?.replace(/\D/g, "");
  async function save() {
    setSaving(true);
    setError("");
    try {
      const data = await api<{ response: PropertyResponse }>(
        `/api/property-requests/${response.request_id}/responses/${response.id}`,
        {
          method: "PUT",
          body: JSON.stringify({
            status,
            staff_notes: notes,
            property_id: propertyId.trim() || null,
            updated_at: current.updated_at,
          }),
        },
      );
      onUpdated(data.response);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Enregistrement impossible.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <article className={panelClass}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-black">
            {response.respondent_deleted_at
              ? "Compte supprimé · archive"
              : person?.full_name || "Utilisateur"}
          </h3>
          <p className="text-sm text-neutral-500">
            {response.respondent_role === "agent" ? "Agent" : "Propriétaire"}
            {person?.company_name ? ` · ${person.company_name}` : ""} ·{" "}
            {new Date(response.created_at).toLocaleDateString("fr-FR")}
          </p>
        </div>
        <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-bold">
          {RESPONSE_LABELS[response.status]}
        </span>
      </div>
      <div className="my-4 flex flex-wrap gap-2 text-sm font-bold text-primary">
        {response.contact_phone && (
          <a
            className="rounded-xl border px-3 py-2"
            href={`tel:${response.contact_phone.replace(/[^+\d]/g, "")}`}
          >
            Appeler · {response.contact_phone}
          </a>
        )}
        {whatsapp && (
          <a
            className="rounded-xl border px-3 py-2"
            href={`https://wa.me/${whatsapp}`}
            target="_blank"
            rel="noreferrer"
          >
            WhatsApp
          </a>
        )}
        {person?.email && (
          <a
            className="rounded-xl border px-3 py-2"
            href={`mailto:${person.email}`}
          >
            {person.email}
          </a>
        )}
      </div>
      {person?.phone && person.phone !== response.contact_phone && (
        <p className="mb-3 text-sm text-neutral-500">
          Téléphone du profil : {person.phone}
        </p>
      )}
      <p className="text-xl font-black">
        {money(response.asking_price)}
        {response.commission_basis === "monthly_rent" ? " / mois" : ""}
      </p>
      <p className="mt-1 font-bold">
        {response.property_type} · {response.area} m² · {response.bedrooms}{" "}
        chambres · {response.bathrooms} salles d’eau
      </p>
      <p className="mt-1 text-sm text-neutral-600">
        {response.city}, {response.neighborhood} · {response.address}
      </p>
      <p className="mt-3 whitespace-pre-wrap text-sm">{response.description}</p>
      <div className="mt-4 rounded-2xl bg-neutral-50 p-4">
        <p className="text-sm font-bold">Documents déclarés</p>
        <p className="mt-1 text-sm">{response.document_types.join(" · ")}</p>
        {response.document_notes && (
          <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-600">
            {response.document_notes}
          </p>
        )}
      </div>
      {!!response.attachments.length && (
        <div className="mt-3 flex flex-wrap gap-2">
          {response.attachments.map((file) =>
            file.url ? (
              <a
                key={file.path}
                href={file.url}
                target="_blank"
                rel="noreferrer"
                className="rounded-xl border px-3 py-2 text-sm text-primary"
              >
                {file.kind === "photo" ? "Photo" : "Document"} · {file.name}
              </a>
            ) : (
              <span key={file.path} className="text-sm text-red-700">
                {file.name} · lien indisponible, actualisez
              </span>
            ),
          )}
        </div>
      )}
      {response.respondent_role === "agent" && (
        <div className="mt-4 rounded-2xl bg-orange-50 p-4">
          <p className="font-bold">
            Commission : {response.commission_rate}% · estimation{" "}
            {money(
              commissionEstimate(
                response.asking_price,
                response.commission_rate,
              ),
            )}
          </p>
          <p className="mt-1 text-xs text-neutral-600">
            Base :{" "}
            {response.commission_basis === "sale_price"
              ? "prix de vente final"
              : "un mois de loyer"}
            . Estimation sur le prix proposé.
          </p>
          <p className="mt-2 whitespace-pre-wrap text-sm">
            {response.commission_terms}
          </p>
          <p className="mt-2 text-xs">
            Conditions acceptées le{" "}
            {new Date(response.terms_accepted_at).toLocaleString("fr-FR")}.
          </p>
          {response.commission_confirmed_at ? (
            <a
              href={`/admin/property-requests/${response.request_id}/responses/${response.id}/agreement`}
              className="mt-3 inline-block text-sm font-bold text-primary"
              target="_blank"
              rel="noreferrer"
            >
              Voir / imprimer l’engagement de commission
            </a>
          ) : (
            <p className="mt-2 text-xs font-bold">
              Passer à « Retenue » confirme ces conditions au nom de Roogo.
            </p>
          )}
        </div>
      )}
      {response.property_deleted_at && (
        <p className="mt-4 text-sm text-neutral-600">
          L’annonce liée a été supprimée. Les conditions de commission sont
          conservées.
        </p>
      )}
      <fieldset
        disabled={saving || !!response.respondent_deleted_at}
        className="mt-4 grid gap-3"
      >
        <label className="text-sm font-bold">
          Suivi
          <select
            value={status}
            onChange={(e) =>
              edit({ status: e.target.value as PropertyResponse["status"] })
            }
            className={fieldClass}
          >
            {RESPONSE_STATUSES.map((s) => (
              <option value={s} key={s}>
                {RESPONSE_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-bold">
          Annonce liée
          <select
            value={propertyId}
            onChange={(e) => edit({ propertyId: e.target.value })}
            className={fieldClass}
          >
            <option value="">Choisir une annonce de cet utilisateur</option>
            {response.properties?.map((property) => (
              <option key={property.id} value={property.id}>
                {property.title} · {property.city}
              </option>
            ))}
          </select>
        </label>
        {!response.properties?.length && (
          <p className="text-sm text-neutral-500">
            Aucune annonce de ce type pour cet utilisateur.{" "}
            <Link href="/admin/annonces" className="font-bold text-primary">
              Ouvrir la gestion des annonces
            </Link>
          </p>
        )}
        {response.property_id && (
          <a
            href={`/admin/annonces/${response.property_id}`}
            className="text-sm font-bold text-primary"
          >
            Ouvrir l’annonce liée
          </a>
        )}
        <label className="text-sm font-bold">
          Notes de suivi internes
          <textarea
            value={notes}
            onChange={(e) => edit({ notes: e.target.value })}
            maxLength={4000}
            rows={2}
            className={fieldClass}
          />
        </label>
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
        {draft && draft.updated_at !== response.updated_at && (
          <div className="text-sm text-orange-800">
            Ce suivi a été modifié. Notes enregistrées :{" "}
            {response.staff_notes || "Aucune"}. Statut :{" "}
            {RESPONSE_LABELS[response.status]}.
            <button
              type="button"
              className="ml-2 underline"
              onClick={() => edit({ updated_at: response.updated_at })}
            >
              Conserver mon brouillon sur cette version
            </button>
          </div>
        )}
        <Button onClick={save} disabled={saving}>
          {saving ? "Enregistrement…" : "Enregistrer le suivi"}
        </Button>
      </fieldset>
    </article>
  );
}

type EditorSession = {
  id: number;
  request: PropertyRequest | null;
  saving: boolean;
};

export default function PropertyRequestsPage() {
  const [requests, setRequests] = useState<PropertyRequest[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{
    request: PropertyRequest;
    responses: PropertyResponse[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");
  const [editor, setEditor] = useState<EditorSession | null>(null);
  const activeEditor = useRef<EditorSession | null>(null);
  const editorSequence = useRef(0);
  const openEditor = (request: PropertyRequest | null) => {
    const current = activeEditor.current;
    if (current?.saving || (current && current.request?.id === request?.id))
      return;
    const next = { id: ++editorSequence.current, request, saving: false };
    activeEditor.current = next;
    setEditor(next);
  };
  const closeEditor = (sessionId: number) => {
    if (activeEditor.current?.id !== sessionId) return false;
    activeEditor.current = null;
    setEditor(null);
    return true;
  };
  const setEditorSaving = (sessionId: number, saving: boolean) => {
    if (activeEditor.current?.id !== sessionId) return;
    const next = { ...activeEditor.current, saving };
    activeEditor.current = next;
    setEditor(next);
  };
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [responseFilter, setResponseFilter] = useState("all");
  const [revision, setRevision] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, ResponseDraft>>({});
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api<{ requests: PropertyRequest[] }>(
        "/api/property-requests",
      );
      setRequests(data.requests);
      setSelectedId((id) => id || data.requests[0]?.id || null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chargement impossible.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    setDetail(null);
    if (!selectedId) return;
    const controller = new AbortController();
    setDetailLoading(true);
    api<{ request: PropertyRequest; responses: PropertyResponse[] }>(
      `/api/property-requests/${selectedId}`,
      { signal: controller.signal },
    )
      .then((data) => {
        if (!controller.signal.aborted) setDetail(data);
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : "Chargement impossible.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setDetailLoading(false);
      });
    return () => controller.abort();
  }, [selectedId, revision]);
  const refresh = () => {
    void load();
    setRevision((n) => n + 1);
  };
  const visible = requests.filter(
    (r) =>
      (filter === "all" || r.status === filter) &&
      `${r.title} ${r.city} ${r.neighborhood} ${r.customer_name}`
        .toLocaleLowerCase()
        .includes(search.toLocaleLowerCase()),
  );
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <HouseLineIcon size={32} className="text-primary" />
          <div>
            <h1 className="text-3xl font-black">Appels à biens</h1>
            <p className="mt-1 text-sm text-neutral-500">
              Un besoin client, les bons apporteurs, tout le suivi au même
              endroit.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={refresh}
            disabled={loading}
            aria-label="Actualiser"
          >
            <ArrowClockwiseIcon size={20} />
          </Button>
          <Button onClick={() => openEditor(null)} disabled={editor?.saving}>
            <PlusIcon size={18} className="mr-2" />
            Nouvel appel
          </Button>
        </div>
      </header>
      {error && (
        <div role="alert" className="rounded-2xl bg-red-50 p-4 text-red-700">
          {error}{" "}
          <button onClick={refresh} className="ml-2 underline">
            Réessayer
          </button>
        </div>
      )}
      <div className="grid grid-cols-3 gap-3">
        {[
          [
            requests.filter((r) => r.status === "open").length,
            "Appels ouverts",
          ],
          [
            requests.reduce((n, r) => n + (r.response_count || 0), 0),
            "Réponses reçues",
          ],
          [requests.filter((r) => r.status === "draft").length, "Brouillons"],
        ].map(([count, label]) => (
          <div key={label} className={panelClass}>
            <p className="text-2xl font-black">{count}</p>
            <p className="text-xs text-neutral-500">{label}</p>
          </div>
        ))}
      </div>
      {editor && (
        <RequestForm
          key={editor.id}
          request={editor.request}
          latest={
            !editor.request
              ? null
              : requests.find((request) => request.id === editor.request?.id) ||
                editor.request
          }
          onCancel={() => {
            if (!activeEditor.current?.saving) closeEditor(editor.id);
          }}
          onSavingChange={(saving) => setEditorSaving(editor.id, saving)}
          onSaved={(request) => {
            // Completion belongs to this editor session, including when the same call is reopened.
            if (closeEditor(editor.id)) {
              setSelectedId((current) =>
                current === selectedId ? request.id : current,
              );
            }
            refresh();
          }}
        />
      )}
      <div className="grid items-start gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className={panelClass}>
          <label className="text-sm font-bold">
            Rechercher
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Ville, besoin ou client"
              className={fieldClass}
            />
          </label>
          <label className="mt-3 block text-sm font-bold">
            État
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className={fieldClass}
            >
              <option value="all">Tous les appels</option>
              {Object.entries(statusLabels).map(([key, label]) => (
                <option value={key} key={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <div className="mt-4 space-y-2">
            {loading && (
              <p role="status" className="text-sm text-neutral-500">
                Chargement…
              </p>
            )}
            {!loading && !visible.length && (
              <p className="py-6 text-sm text-neutral-500">
                Aucun appel pour le moment.
              </p>
            )}
            {visible.map((request) => (
              <button
                key={request.id}
                onClick={() => {
                  setSelectedId(request.id);
                  setResponseFilter("all");
                }}
                aria-pressed={selectedId === request.id}
                className={`w-full rounded-2xl border p-4 text-left ${selectedId === request.id ? "border-primary bg-orange-50" : "border-neutral-200 hover:bg-neutral-50"}`}
              >
                <span className="text-xs font-bold text-primary">
                  {statusLabels[request.status]} · {request.response_count || 0}{" "}
                  réponse(s)
                </span>
                <span className="mt-1 block font-bold">{request.title}</span>
                <span className="mt-1 block text-sm text-neutral-500">
                  {request.city} · {money(request.budget_max)}
                  {request.listing_type === "louer" ? "/mois" : ""}
                </span>
              </button>
            ))}
          </div>
        </aside>
        <section className="min-w-0 space-y-4">
          {detailLoading && (
            <p role="status" className={panelClass}>
              Chargement des réponses…
            </p>
          )}
          {!selectedId && !loading && (
            <p className={panelClass}>
              Créez un appel pour recueillir les propositions des agents et
              propriétaires.
            </p>
          )}
          {detail && (
            <>
              <div className={panelClass}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-primary">
                      {statusLabels[detail.request.status]} ·{" "}
                      {detail.request.listing_type === "vendre"
                        ? "Achat"
                        : "Location mensuelle"}
                    </p>
                    <h2 className="mt-1 text-2xl font-black">
                      {detail.request.title}
                    </h2>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openEditor(detail.request)}
                    disabled={editor?.saving}
                  >
                    Modifier
                  </Button>
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm">
                  {detail.request.description}
                </p>
                <p className="mt-3 text-sm font-bold">
                  {detail.request.property_type} · {detail.request.city}{" "}
                  {detail.request.neighborhood} ·{" "}
                  {detail.request.budget_min
                    ? `${money(detail.request.budget_min)} – `
                    : "Jusqu’à "}
                  {money(detail.request.budget_max)}
                </p>
                <p className="mt-1 text-sm text-neutral-500">
                  {detail.request.min_area !== null
                    ? `${detail.request.min_area} m² minimum`
                    : "Surface libre"}{" "}
                  ·{" "}
                  {detail.request.min_bedrooms !== null
                    ? `${detail.request.min_bedrooms} chambres minimum`
                    : "Chambres libres"}
                </p>
                <div className="mt-4 rounded-2xl bg-neutral-50 p-4 text-sm">
                  <p className="font-bold">Client · réservé à l’équipe</p>
                  <p>
                    {detail.request.customer_name} ·{" "}
                    {detail.request.customer_contact}
                  </p>
                  <p className="mt-2 whitespace-pre-wrap text-neutral-600">
                    {detail.request.internal_notes}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-xl font-black">
                  {detail.responses.length} réponse(s)
                </h2>
                <select
                  aria-label="Filtrer les réponses"
                  value={responseFilter}
                  onChange={(e) => setResponseFilter(e.target.value)}
                  className="rounded-xl border bg-white px-3 py-2 text-sm"
                >
                  <option value="all">Tous les suivis</option>
                  {RESPONSE_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {RESPONSE_LABELS[status]}
                    </option>
                  ))}
                </select>
              </div>
              {!detail.responses.length && (
                <p className={panelClass}>
                  {detail.request.status === "draft"
                    ? "Publiez cet appel pour le rendre visible dans l’application."
                    : "Les propositions apparaîtront ici dès qu’un agent ou propriétaire répondra."}
                </p>
              )}
              {detail.responses
                .filter(
                  (r) =>
                    responseFilter === "all" || r.status === responseFilter,
                )
                .map((response) => (
                  <ResponseCard
                    key={response.id}
                    response={response}
                    draft={drafts[response.id]}
                    onDraft={(draft) =>
                      setDrafts((previous) => ({
                        ...previous,
                        [response.id]: draft,
                      }))
                    }
                    onUpdated={(saved) => {
                      setDrafts((previous) => {
                        // A refresh can remount the card while its save is in flight.
                        // Keep any newer edits made since that save started.
                        if (previous[saved.id] !== drafts[saved.id])
                          return previous;
                        const next = { ...previous };
                        delete next[saved.id];
                        return next;
                      });
                      setDetail(
                        (previous) =>
                          previous && {
                            ...previous,
                            responses: previous.responses.map((row) =>
                              row.id === saved.id
                                ? {
                                    ...row,
                                    ...saved,
                                    attachments: row.attachments,
                                  }
                                : row,
                            ),
                          },
                      );
                    }}
                  />
                ))}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
