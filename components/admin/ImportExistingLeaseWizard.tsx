"use client";

import { useAuth } from "@clerk/nextjs";
import { useEffect, useMemo, useState } from "react";
import { XIcon, UploadSimpleIcon, CheckCircleIcon } from "@phosphor-icons/react";

type User = { id: string; full_name: string | null; email: string | null; phone: string | null };
type Property = { id: string; agent_id: string; agent_name?: string; address?: string; quartier?: string; city?: string; price: number; caution_mois?: number };

export default function ImportExistingLeaseWizard({
  open,
  onClose,
  preselectedProperty,
  preselectedUser,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  preselectedProperty?: { id: string } | null;
  preselectedUser?: (User & { user_type?: string }) | null;
  onSuccess?: (agreementId: string) => void;
}) {
  const { getToken } = useAuth();
  const [step, setStep] = useState(1);
  const [properties, setProperties] = useState<Property[]>([]);
  const [propertyId, setPropertyId] = useState(preselectedProperty?.id ?? "");
  const [renter, setRenter] = useState<User | null>(preselectedUser?.user_type === "renter" ? preselectedUser : null);
  const [query, setQuery] = useState("");
  const [renters, setRenters] = useState<User[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ monthly_rent: "", caution_mois: "0", start_date: "", end_date: "", external_signed_at: "", rent_months_paid: "0", caution_amount: "0", payment_date: "", payment_method: "espèces", payment_reference: "", commission_amount: "0", commission_date: "", commission_method: "espèces", commission_reference: "", notes: "" });
  const selectedProperty = useMemo(() => properties.find((p) => p.id === propertyId), [properties, propertyId]);

  async function api(path: string, init?: RequestInit) {
    const token = await getToken();
    const response = await fetch(path, { ...init, headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${token}` } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.code || payload.error || "Une erreur est survenue");
    return payload;
  }

  useEffect(() => {
    if (!open) return;
    const ownerId = preselectedUser && ["owner", "agent"].includes(preselectedUser.user_type ?? "") ? preselectedUser.id : "";
    const params = new URLSearchParams(preselectedProperty?.id ? { property_id: preselectedProperty.id } : ownerId ? { owner_id: ownerId } : {});
    api(`/api/admin/rental-imports?${params}`).then(({ properties }) => {
      setProperties(properties);
      const property = properties.find((p: Property) => p.id === preselectedProperty?.id) ?? properties[0];
      if (property) {
        setPropertyId(property.id);
        setForm((current) => ({ ...current, monthly_rent: String(property.price ?? ""), caution_mois: String(property.caution_mois ?? 0) }));
      }
    }).catch((e) => setError(e.message));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open || renter || query.trim().length < 2) return;
    const timer = setTimeout(() => api(`/api/users/renters?q=${encodeURIComponent(query)}`).then(({ users }) => setRenters(users)).catch(() => setRenters([])), 250);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, open, renter]);

  if (!open) return null;
  const set = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const input = "w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm outline-none focus:border-orange-500";

  async function submit() {
    if (!propertyId || !renter || files.length === 0) return setError("Sélectionnez le bien, le locataire et le bail signé.");
    setBusy(true); setError("");
    try {
      const { uploads } = await api("/api/admin/rental-imports/upload-url", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ property_id: propertyId, mime_types: files.map((file) => file.type) }) });
      await Promise.all(files.map((file, index) => fetch(uploads[index].signed_url, { method: "PUT", headers: { "Content-Type": file.type }, body: file }).then((r) => { if (!r.ok) throw new Error("Échec du téléversement du bail"); })));
      const result = await api("/api/admin/rental-imports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ property_id: propertyId, renter_id: renter.id, ...form, signed_document_paths: uploads.map((u: { path: string }) => u.path) }) });
      onSuccess?.(result.agreement_id); onClose();
    } catch (e) { setError(e instanceof Error ? e.message : "Import impossible"); }
    finally { setBusy(false); }
  }

  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-4" role="dialog" aria-modal="true">
    <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl">
      <div className="flex items-start justify-between"><div><p className="text-xs font-bold uppercase tracking-widest text-orange-600">Étape {step} sur 4</p><h2 className="mt-1 text-2xl font-bold">Importer un bail existant</h2></div><button onClick={onClose} aria-label="Fermer"><XIcon size={24}/></button></div>
      <div className="my-5 grid grid-cols-4 gap-2">{[1,2,3,4].map((n) => <div key={n} className={`h-1.5 rounded-full ${n <= step ? "bg-orange-600" : "bg-neutral-200"}`}/>)}</div>
      {step === 1 && <div className="space-y-4"><label className="block text-sm font-semibold">Bien mensuel<select className={`${input} mt-1`} value={propertyId} onChange={(e) => { setPropertyId(e.target.value); const p=properties.find(x=>x.id===e.target.value); if(p) setForm(f=>({...f,monthly_rent:String(p.price),caution_mois:String(p.caution_mois??0)})); }}><option value="">Choisir…</option>{properties.map((p) => <option key={p.id} value={p.id}>{p.address || p.quartier}, {p.city} — {p.agent_name}</option>)}</select></label><label className="block text-sm font-semibold">Locataire enregistré{renter ? <button type="button" onClick={()=>setRenter(null)} className="mt-1 flex w-full justify-between rounded-xl border border-green-300 bg-green-50 p-3 text-left"><span>{renter.full_name}<small className="block font-normal">{renter.email || renter.phone}</small></span><span>Changer</span></button> : <><input className={`${input} mt-1`} value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Nom, email, téléphone ou WhatsApp"/><div className="mt-2 divide-y rounded-xl border">{renters.map((u)=><button type="button" key={u.id} className="block w-full p-3 text-left hover:bg-neutral-50" onClick={()=>setRenter(u)}>{u.full_name}<small className="block text-neutral-500">{u.email || u.phone}</small></button>)}</div></>}</label></div>}
      {step === 2 && <div className="grid gap-4 sm:grid-cols-2"><Field label="Loyer mensuel (FCFA)" value={form.monthly_rent} onChange={v=>set("monthly_rent",v)} type="number"/><Field label="Caution prévue (mois)" value={form.caution_mois} onChange={v=>set("caution_mois",v)} type="number"/><Field label="Début du bail" value={form.start_date} onChange={v=>set("start_date",v)} type="date"/><Field label="Fin du bail (facultatif)" value={form.end_date} onChange={v=>set("end_date",v)} type="date"/><Field label="Date de signature externe" value={form.external_signed_at} onChange={v=>set("external_signed_at",v)} type="date"/></div>}
      {step === 3 && <div className="grid gap-4 sm:grid-cols-2"><Field label="Mois de loyer déjà payés" value={form.rent_months_paid} onChange={v=>set("rent_months_paid",v)} type="number"/><Field label="Caution payée (FCFA)" value={form.caution_amount} onChange={v=>set("caution_amount",v)} type="number"/><Field label="Date du paiement hors Roogo" value={form.payment_date} onChange={v=>set("payment_date",v)} type="date"/><Field label="Mode de paiement" value={form.payment_method} onChange={v=>set("payment_method",v)}/><Field label="Référence du paiement" value={form.payment_reference} onChange={v=>set("payment_reference",v)}/><Field label="Commission Roogo reçue" value={form.commission_amount} onChange={v=>set("commission_amount",v)} type="number"/><Field label="Date de commission" value={form.commission_date} onChange={v=>set("commission_date",v)} type="date"/><Field label="Mode de commission" value={form.commission_method} onChange={v=>set("commission_method",v)}/><Field label="Référence commission" value={form.commission_reference} onChange={v=>set("commission_reference",v)}/></div>}
      {step === 4 && <div className="space-y-4"><label className="flex cursor-pointer items-center gap-3 rounded-2xl border-2 border-dashed p-5"><UploadSimpleIcon size={30} className="text-orange-600"/><span><strong>Bail signé requis</strong><small className="block text-neutral-500">PDF ou images, 15 Mo maximum par fichier</small></span><input hidden type="file" multiple accept="application/pdf,image/jpeg,image/png,image/webp" onChange={e=>setFiles(Array.from(e.target.files??[]))}/></label>{files.map(file=><div key={file.name} className="flex items-center gap-2 text-sm"><CheckCircleIcon className="text-green-600"/>{file.name}</div>)}<textarea className={`${input} min-h-24`} placeholder="Notes internes (facultatif)" value={form.notes} onChange={e=>set("notes",e.target.value)}/><div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900"><strong>Confirmation financière</strong><p>Les loyers, la caution et la commission saisis sont enregistrés comme payés hors Roogo. Ils ne créditeront jamais le portefeuille retirable du propriétaire. Les prochaines échéances utiliseront le paiement Roogo normal.</p></div><div className="text-sm text-neutral-600">{selectedProperty?.address || selectedProperty?.quartier} · {renter?.full_name}</div></div>}
      {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <div className="mt-6 flex justify-between"><button className="rounded-xl border px-5 py-2.5 font-semibold disabled:opacity-40" disabled={step===1||busy} onClick={()=>setStep(s=>s-1)}>Retour</button>{step<4?<button className="rounded-xl bg-neutral-900 px-5 py-2.5 font-semibold text-white" onClick={()=>setStep(s=>s+1)}>Continuer</button>:<button className="rounded-xl bg-orange-600 px-5 py-2.5 font-semibold text-white disabled:opacity-50" disabled={busy} onClick={submit}>{busy?"Import en cours…":"Confirmer l’import"}</button>}</div>
    </div>
  </div>;
}

function Field({ label, value, onChange, type="text" }: { label:string; value:string; onChange:(value:string)=>void; type?:string }) {
  return <label className="block text-sm font-semibold">{label}<input required className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm outline-none focus:border-orange-500" type={type} value={value} onChange={e=>onChange(e.target.value)}/></label>;
}
