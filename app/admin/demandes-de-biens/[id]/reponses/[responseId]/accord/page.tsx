import { notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { getOrSyncUserByClerkId } from "@/lib/user-sync";
import { isStaffOrFounder } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  commissionEstimate,
  type PropertyResponse,
} from "@/lib/property-requests";
import { PrintPropertyAgreement } from "@/components/admin/PrintPropertyAgreement";

export default async function AgreementPage({
  params,
}: {
  params: Promise<{ id: string; responseId: string }>;
}) {
  const { userId } = await auth();
  if (!userId || !isStaffOrFounder(await getOrSyncUserByClerkId(userId)))
    notFound();
  const { id, responseId } = await params;
  if (
    !z.uuid().safeParse(id).success ||
    !z.uuid().safeParse(responseId).success
  )
    notFound();
  const { data, error } = await supabaseAdmin
    .from("property_request_responses")
    .select(
      "*, respondent:users!respondent_id(id,full_name,phone,whatsapp,email,company_name)",
    )
    .eq("id", responseId)
    .eq("request_id", id)
    .maybeSingle();
  if (error) throw error;
  const response = data as PropertyResponse | null;
  if (
    !response ||
    response.respondent_role !== "agent" ||
    !response.commission_confirmed_at
  )
    notFound();
  const money = (value: number) => `${value.toLocaleString("fr-FR")} FCFA`;
  return (
    <article className="mx-auto max-w-3xl space-y-6 rounded-3xl border bg-white p-8 print:border-0">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-bold text-primary">Roogo</p>
          <h1 className="text-3xl font-black">Engagement de commission</h1>
        </div>
        <PrintPropertyAgreement />
      </div>
      <p className="break-all text-sm text-neutral-500">
        Référence : {response.id}
      </p>
      <p>
        Apporteur :{" "}
        <strong>
          {response.respondent_deleted_at
            ? "Compte supprimé · archive anonymisée"
            : response.respondent?.full_name || "Agent Roogo"}
        </strong>
        <br />
        Contact : {response.contact_phone}
      </p>
      <p>
        Bien proposé : {response.property_type}, {response.city},{" "}
        {response.neighborhood}.<br />
        {response.address}
        <br />
        Surface : {response.area} m² · {response.bedrooms} chambres ·{" "}
        {response.bathrooms} salles d’eau.
      </p>
      <div className="rounded-2xl bg-orange-50 p-5">
        <p className="text-xl font-bold">
          Commission : {response.commission_rate}%
        </p>
        <p>
          Base :{" "}
          {response.commission_basis === "sale_price"
            ? "prix de vente final"
            : "un mois de loyer"}
          .
        </p>
        <p>
          Estimation sur le prix proposé de {money(response.asking_price)} :{" "}
          {money(
            commissionEstimate(response.asking_price, response.commission_rate),
          )}
          .
        </p>
      </div>
      <div>
        <h2 className="font-bold">Conditions de paiement</h2>
        <p className="mt-2 whitespace-pre-wrap">{response.commission_terms}</p>
      </div>
      <p className="text-sm">
        Conditions acceptées dans l’application le{" "}
        {new Date(response.terms_accepted_at).toLocaleString("fr-FR")}.<br />
        Engagement confirmé par l’équipe Roogo le{" "}
        {new Date(response.commission_confirmed_at).toLocaleString("fr-FR")}.
      </p>
      <p className="text-sm text-neutral-600">
        Le montant définitif dépend du prix conclu et des conditions ci-dessus.
        Ce document conserve les conditions de cette proposition ; il ne
        constitue pas un reçu de paiement.
      </p>
    </article>
  );
}
