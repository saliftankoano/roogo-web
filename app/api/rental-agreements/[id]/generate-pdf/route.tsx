import { NextResponse } from "next/server";
import { verifyToken } from "@clerk/backend";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { getUserByClerkId } from "@/lib/user-sync";
import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
  Font,
  pdf,
  type DocumentProps,
} from "@react-pdf/renderer";
import fs from "fs";
import path from "path";
import React from "react";

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

// ─── Interdictions lookup (mirrors mobile utils/interdictions.ts) ─────────────
const INTERDICTIONS: Record<string, string> = {
  no_animaux: "Pas d'animaux",
  no_fumeurs: "Pas de fumeurs",
  no_etudiants: "Pas d'étudiants",
  no_colocation: "Pas de colocation",
};

function resolveInterdiction(value: string): string {
  return INTERDICTIONS[value] ?? value;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatFCFA(amount: number): string {
  return amount.toLocaleString("fr-FR") + " FCFA";
}

function formatDate(str: string | null | undefined): string {
  if (!str) return "—";
  return new Date(str).toLocaleDateString("fr-FR");
}

// ─── PDF Styles ───────────────────────────────────────────────────────────────

const BRAND = "#C96A2E";
const INK = "#1A1A1A";
const MUTED = "#666666";
const SURFACE = "#FDF7F4";
const BORDER_SOFT = "#F0E0D8";
const RED_SURFACE = "#FFF5F5";
const RED_BORDER = "#EF4444";
const GREEN = "#16A34A";
const RULE_SURFACE = "#FAFAFA";

Font.register({
  family: "Helvetica",
  fonts: [],
});

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 10,
    color: INK,
    paddingTop: 40,
    paddingBottom: 48,
    paddingHorizontal: 44,
    lineHeight: 1.55,
  },
  // ── Header ──────────────────────────────────────────────────────────────────
  header: {
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: BRAND,
    paddingBottom: 14,
    marginBottom: 22,
  },
  headerTitle: {
    fontSize: 20,
    color: BRAND,
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  headerSub: { fontSize: 8.5, color: MUTED },
  // ── Section ─────────────────────────────────────────────────────────────────
  section: { marginBottom: 18 },
  sectionTitle: {
    fontSize: 9,
    color: BRAND,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    borderBottomWidth: 0.5,
    borderBottomColor: BORDER_SOFT,
    paddingBottom: 4,
    marginBottom: 10,
  },
  // ── Parties grid ─────────────────────────────────────────────────────────────
  partiesRow: { flexDirection: "row", gap: 12 },
  partyBox: {
    flex: 1,
    backgroundColor: SURFACE,
    borderWidth: 0.5,
    borderColor: BORDER_SOFT,
    borderRadius: 6,
    padding: 10,
  },
  partyLabel: {
    fontSize: 8,
    color: BRAND,
    textTransform: "uppercase",
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  // ── Key-value row ────────────────────────────────────────────────────────────
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 5,
  },
  rowLabel: { color: MUTED },
  rowValue: { fontFamily: "Helvetica-Bold" },
  // ── Financial table ──────────────────────────────────────────────────────────
  tableRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: "#F5F5F5",
  },
  tableRowTotal: { backgroundColor: SURFACE },
  tableLabel: { color: MUTED },
  tableValue: { fontFamily: "Helvetica-Bold" },
  // ── Rules list ───────────────────────────────────────────────────────────────
  ruleItem: {
    paddingVertical: 5,
    paddingHorizontal: 8,
    backgroundColor: RULE_SURFACE,
    borderLeftWidth: 2.5,
    borderLeftColor: BRAND,
    marginBottom: 5,
    borderRadius: 2,
  },
  intItem: {
    paddingVertical: 5,
    paddingHorizontal: 8,
    backgroundColor: RED_SURFACE,
    borderLeftWidth: 2.5,
    borderLeftColor: RED_BORDER,
    marginBottom: 5,
    borderRadius: 2,
  },
  // ── Terms ────────────────────────────────────────────────────────────────────
  termsBox: {
    backgroundColor: RULE_SURFACE,
    borderWidth: 0.5,
    borderColor: "#E5E5E5",
    borderRadius: 6,
    padding: 12,
    fontSize: 9,
    color: "#555",
    lineHeight: 1.65,
  },
  // ── Signatures ───────────────────────────────────────────────────────────────
  sigRow: { flexDirection: "row", gap: 24, marginTop: 8 },
  sigBox: { flex: 1, alignItems: "center" },
  sigName: { fontFamily: "Helvetica-Bold", marginBottom: 6 },
  sigLine: {
    borderBottomWidth: 0.5,
    borderBottomColor: "#CCC",
    width: "100%",
    marginBottom: 6,
    height: 40,
  },
  sigLabel: { fontSize: 9, color: "#888" },
  sigDone: {
    color: GREEN,
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
    textAlign: "center",
    backgroundColor: "#F0FDF4",
    borderRadius: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    width: "100%",
    marginTop: 4,
  },
  // ── Footer ───────────────────────────────────────────────────────────────────
  footer: {
    textAlign: "center",
    borderTopWidth: 0.5,
    borderTopColor: "#EEE",
    paddingTop: 10,
    marginTop: 32,
    fontSize: 9,
    color: "#AAA",
  },
});

// ─── PDF Document Component ───────────────────────────────────────────────────

interface AgreementData {
  id: string;
  monthly_rent: number;
  caution_mois: number;
  loyer_avance_mois?: number;
  property_frequence?: string | null;
  start_date: string | null;
  end_date: string | null;
  dos_and_donts: string[];
  interdictions: string[];
  terms_text: string | null;
  owner_signed_at: string | null;
  renter_signed_at: string | null;
  payment_metadata?: Record<string, unknown> | null;
  property?: {
    address?: string;
    quartier?: string;
    city?: string;
    price?: number;
  } | null;
  owner?: {
    full_name?: string;
    phone?: string;
    email?: string;
  } | null;
  renter?: {
    full_name?: string;
    phone?: string;
    email?: string;
  } | null;
}

/** Supabase embeds the FK as `properties`; mobile uses `property`. Normalize here. */
function normalizeAgreementForPdf(raw: Record<string, unknown>): AgreementData {
  const prop =
    (raw.property as AgreementData["property"] | undefined) ??
    (raw.properties as AgreementData["property"] | undefined);
  return {
    ...(raw as unknown as AgreementData),
    property: prop ?? null,
    dos_and_donts: Array.isArray(raw.dos_and_donts)
      ? (raw.dos_and_donts as string[])
      : [],
    interdictions: Array.isArray(raw.interdictions)
      ? (raw.interdictions as string[])
      : [],
  };
}

function AgreementPdf({
  data,
  logoDataUri,
}: {
  data: AgreementData;
  logoDataUri: string;
}) {
  const isDaily = data.property_frequence === "journalier";

  const ownerName = data.owner?.full_name || "—";
  const ownerPhone = data.owner?.phone || "—";
  const renterName = data.renter?.full_name || "—";
  const renterPhone = data.renter?.phone || "—";
  const propertyAddress =
    [
      ...new Set(
        [
          data.property?.quartier,
          data.property?.address,
          data.property?.city,
        ].filter(Boolean),
      ),
    ].join(", ") || "—";

  const depositAmount = data.monthly_rent * data.caution_mois;
  const advanceRentMonths = data.loyer_avance_mois ?? 1;
  const paymentMeta = data.payment_metadata || {};
  const metaNumber = (key: string, fallback = 0) => {
    const value = paymentMeta[key];
    return typeof value === "number" && Number.isFinite(value)
      ? value
      : fallback;
  };

  // Daily: calculate stay duration in nights; no advance rent applies
  let nightCount = 0;
  if (isDaily && data.start_date && data.end_date) {
    const start = new Date(data.start_date);
    const end = new Date(data.end_date);
    nightCount = Math.max(
      0,
      Math.round((end.getTime() - start.getTime()) / 86_400_000),
    );
  }
  const stayAmount = data.monthly_rent * nightCount;
  const dailyStayAmount = metaNumber("stayAmount", stayAmount);
  const dailyCautionAmount = metaNumber("cautionAmount", depositAmount);
  const dailyServiceFee = metaNumber("renterServiceFeeAmount", 0);
  const dailyOwnerCommission = metaNumber("ownerCommissionAmount", 0);
  const dailyOwnerNet = metaNumber("ownerNetAmount", dailyStayAmount);
  const dailyTotalCollected = metaNumber(
    "totalCollectedAmount",
    dailyStayAmount + dailyCautionAmount + dailyServiceFee,
  );
  const advanceRentAmount = isDaily ? 0 : data.monthly_rent * advanceRentMonths;
  const moveInTotal = isDaily
    ? dailyTotalCollected
    : depositAmount + advanceRentAmount;

  const ref = data.id.substring(0, 8).toUpperCase();
  const title = isDaily
    ? "CONTRAT DE LOCATION COURTE DURÉE"
    : "CONTRAT DE BAIL";

  const defaultTerms = isDaily
    ? "Le présent contrat de location courte durée est établi pour la période indiquée ci-dessus. Le locataire s'engage à libérer le logement à la date de départ convenue, à maintenir le bien en bon état et à respecter le règlement intérieur. La caution éventuelle sera restituée dans un délai de 48h après l'état des lieux de sortie, sous réserve de l'absence de dommages. Tout litige sera réglé à l'amiable, puis devant les juridictions compétentes de Ouagadougou."
    : "Le présent contrat est soumis aux dispositions légales en vigueur au Burkina Faso régissant les baux d'habitation. Le locataire s'engage à maintenir le bien en bon état et à s'acquitter du loyer à la date convenue. Tout litige sera réglé à l'amiable dans un premier temps, puis devant les juridictions compétentes de Ouagadougou.";
  const rentCollectionTerms = isDaily
    ? ""
    : "Les loyers suivants sont encaissés par Roogo par défaut. Roogo retient 7% sur chaque loyer effectivement encaissé via la plateforme. Le propriétaire peut désactiver cette collecte pour les échéances futures non payées depuis le bail dans l'application; le premier loyer reste toutefois payable via Roogo lorsqu'un frais de succès de publication est encore dû.";
  const renderedTerms = [data.terms_text || defaultTerms, rentCollectionTerms]
    .filter(Boolean)
    .join("\n\n");

  return (
    <Document title={`${title} — ${ref}`} author="Roogo">
      <Page size="A4" style={styles.page}>
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <View style={styles.header}>
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          <Image
            src={logoDataUri}
            style={{ height: 36, alignSelf: "center", marginBottom: 8 }}
          />
          <Text style={styles.headerTitle}>{title}</Text>
          <Text style={styles.headerSub}>
            Généré par Roogo — Marketplace Immobilière du Burkina Faso
          </Text>
          <Text style={[styles.headerSub, { marginTop: 2 }]}>Réf : {ref}</Text>
        </View>

        {/* ── Parties ─────────────────────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Parties au contrat</Text>
          <View style={styles.partiesRow}>
            <View style={styles.partyBox}>
              <Text style={styles.partyLabel}>Propriétaire / Bailleur</Text>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Nom</Text>
                <Text style={styles.rowValue}>{ownerName}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Téléphone</Text>
                <Text style={styles.rowValue}>{ownerPhone}</Text>
              </View>
            </View>
            <View style={styles.partyBox}>
              <Text style={styles.partyLabel}>
                {isDaily ? "Voyageur / Hôte" : "Locataire / Preneur"}
              </Text>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Nom</Text>
                <Text style={styles.rowValue}>{renterName}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Téléphone</Text>
                <Text style={styles.rowValue}>{renterPhone}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* ── Property ─────────────────────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Bien loué</Text>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Adresse</Text>
            <Text style={styles.rowValue}>{propertyAddress}</Text>
          </View>
        </View>

        {/* ── Financial ────────────────────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Conditions financières</Text>
          {isDaily ? (
            <>
              <View style={styles.tableRow}>
                <Text style={styles.tableLabel}>Tarif par nuit</Text>
                <Text style={styles.tableValue}>
                  {formatFCFA(data.monthly_rent)}
                </Text>
              </View>
              <View style={styles.tableRow}>
                <Text style={styles.tableLabel}>
                  {`Durée du séjour (${nightCount} nuit${nightCount > 1 ? "s" : ""})`}
                </Text>
                <Text style={styles.tableValue}>
                  {formatFCFA(dailyStayAmount)}
                </Text>
              </View>
              {dailyServiceFee > 0 ? (
                <View style={styles.tableRow}>
                  <Text style={styles.tableLabel}>
                    Frais de service Roogo (10%)
                  </Text>
                  <Text style={styles.tableValue}>
                    {formatFCFA(dailyServiceFee)}
                  </Text>
                </View>
              ) : null}
              {dailyCautionAmount > 0 ? (
                <View style={styles.tableRow}>
                  <Text style={styles.tableLabel}>Caution remboursable</Text>
                  <Text style={styles.tableValue}>
                    {formatFCFA(dailyCautionAmount)}
                  </Text>
                </View>
              ) : null}
              {dailyOwnerCommission > 0 ? (
                <>
                  <View style={styles.tableRow}>
                    <Text style={styles.tableLabel}>
                      Commission propriétaire Roogo (10%)
                    </Text>
                    <Text style={styles.tableValue}>
                      {formatFCFA(dailyOwnerCommission)}
                    </Text>
                  </View>
                  <View style={styles.tableRow}>
                    <Text style={styles.tableLabel}>
                      Montant net propriétaire
                    </Text>
                    <Text style={styles.tableValue}>
                      {formatFCFA(dailyOwnerNet)}
                    </Text>
                  </View>
                </>
              ) : null}
              {data.start_date ? (
                <View style={styles.tableRow}>
                  <Text style={styles.tableLabel}>{"Date d'arrivée"}</Text>
                  <Text style={styles.tableValue}>
                    {formatDate(data.start_date)}
                  </Text>
                </View>
              ) : null}
              {data.end_date ? (
                <View style={styles.tableRow}>
                  <Text style={styles.tableLabel}>Date de départ</Text>
                  <Text style={styles.tableValue}>
                    {formatDate(data.end_date)}
                  </Text>
                </View>
              ) : null}
              <View style={[styles.tableRow, styles.tableRowTotal]}>
                <Text style={styles.tableLabel}>Total payé sur Roogo</Text>
                <Text style={styles.tableValue}>{formatFCFA(moveInTotal)}</Text>
              </View>
            </>
          ) : (
            <>
              <View style={styles.tableRow}>
                <Text style={styles.tableLabel}>Loyer mensuel</Text>
                <Text style={styles.tableValue}>
                  {formatFCFA(data.monthly_rent)}
                </Text>
              </View>
              <View style={styles.tableRow}>
                <Text style={styles.tableLabel}>
                  {`Caution remboursable (${data.caution_mois} mois)`}
                </Text>
                <Text style={styles.tableValue}>
                  {formatFCFA(depositAmount)}
                </Text>
              </View>
              <View style={styles.tableRow}>
                <Text style={styles.tableLabel}>
                  {`Loyer d'avance (${advanceRentMonths} mois)`}
                </Text>
                <Text style={styles.tableValue}>
                  {formatFCFA(advanceRentAmount)}
                </Text>
              </View>
              {data.start_date ? (
                <View style={styles.tableRow}>
                  <Text style={styles.tableLabel}>{"Date d'entrée"}</Text>
                  <Text style={styles.tableValue}>
                    {formatDate(data.start_date)}
                  </Text>
                </View>
              ) : null}
              {data.end_date ? (
                <View style={styles.tableRow}>
                  <Text style={styles.tableLabel}>Fin du bail</Text>
                  <Text style={styles.tableValue}>
                    {formatDate(data.end_date)}
                  </Text>
                </View>
              ) : null}
              <View style={[styles.tableRow, styles.tableRowTotal]}>
                <Text style={styles.tableLabel}>
                  Total à régler à la signature
                </Text>
                <Text style={styles.tableValue}>{formatFCFA(moveInTotal)}</Text>
              </View>
            </>
          )}
        </View>

        {/* ── Rules ────────────────────────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Règles du propriétaire</Text>
          {data.dos_and_donts.length > 0 ? (
            data.dos_and_donts.map((rule, i) => (
              <View key={i} style={styles.ruleItem}>
                <Text>
                  {i + 1}. {rule}
                </Text>
              </View>
            ))
          ) : (
            <View style={styles.ruleItem}>
              <Text>Aucune règle spécifique</Text>
            </View>
          )}
        </View>

        {/* ── Interdictions ─────────────────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Non autorisé</Text>
          {data.interdictions.length > 0 ? (
            data.interdictions.map((item, i) => (
              <View key={i} style={styles.intItem}>
                <Text>• {resolveInterdiction(item)}</Text>
              </View>
            ))
          ) : (
            <View style={styles.intItem}>
              <Text>Aucune interdiction spécifique</Text>
            </View>
          )}
        </View>

        {/* ── Terms ────────────────────────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Termes généraux</Text>
          <View style={styles.termsBox}>
            <Text>{renderedTerms}</Text>
          </View>
        </View>

        {/* ── Signatures ───────────────────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Signatures</Text>
          <Text style={{ fontSize: 9, color: MUTED, marginBottom: 12 }}>
            En signant, les deux parties déclarent avoir lu et accepté
            l&apos;intégralité du présent contrat.
          </Text>
          <View style={styles.sigRow}>
            <View style={styles.sigBox}>
              <Text style={styles.sigName}>{ownerName}</Text>
              {data.owner_signed_at ? (
                <Text style={styles.sigDone}>
                  ✓ Signé le {formatDate(data.owner_signed_at)}
                </Text>
              ) : (
                <>
                  <View style={styles.sigLine} />
                  <Text style={styles.sigLabel}>Signature du propriétaire</Text>
                </>
              )}
            </View>
            <View style={styles.sigBox}>
              <Text style={styles.sigName}>{renterName}</Text>
              {data.renter_signed_at ? (
                <Text style={styles.sigDone}>
                  ✓ Signé le {formatDate(data.renter_signed_at)}
                </Text>
              ) : (
                <>
                  <View style={styles.sigLine} />
                  <Text style={styles.sigLabel}>
                    {isDaily
                      ? "Signature du voyageur"
                      : "Signature du locataire"}
                  </Text>
                </>
              )}
            </View>
          </View>
        </View>

        {/* ── Footer ───────────────────────────────────────────────────────── */}
        <Text style={styles.footer}>
          Roogo — roogo.app • Document généré le{" "}
          {formatDate(new Date().toISOString())}
        </Text>
      </Page>
    </Document>
  );
}

// ─── Route handler ────────────────────────────────────────────────────────────

/**
 * POST /api/rental-agreements/:id/generate-pdf
 * Generates a PDF for a rental agreement, uploads it to Supabase Storage,
 * persists the URL on the agreement record, and returns { pdfUrl }.
 * Accessible by either the owner or the renter of the agreement.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: agreementId } = await params;

    const token = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) return errorResponse("Unauthorized", 401, req);

    let clerkUserId: string;
    try {
      const { sub } = await verifyToken(token, {
        secretKey: process.env.CLERK_SECRET_KEY!,
      });
      clerkUserId = sub;
    } catch {
      return errorResponse("Invalid token", 401, req);
    }

    const user = await getUserByClerkId(clerkUserId);
    if (!user) return errorResponse("User not found", 404, req);

    // ── Fetch agreement with all joined data ──────────────────────────────
    const { data: agreement, error } = await supabaseAdmin
      .from("rental_agreements")
      .select(
        `
        *,
        property_frequence,
        properties(id, address, price, quartier, city),
        owner:users!rental_agreements_owner_id_fkey(id, full_name, phone, email),
        renter:users!rental_agreements_renter_id_fkey(id, full_name, phone, email)
      `,
      )
      .eq("id", agreementId)
      .single();

    if (error || !agreement) {
      return errorResponse("Agreement not found", 404, req);
    }

    // ── Access control: owner or renter only ──────────────────────────────
    if (agreement.owner_id !== user.id && agreement.renter_id !== user.id) {
      return errorResponse("Forbidden", 403, req);
    }

    let paymentMetadata: Record<string, unknown> | null = null;
    if (agreement.transaction_id) {
      const { data: transaction } = await supabaseAdmin
        .from("transactions")
        .select("metadata")
        .eq("id", agreement.transaction_id)
        .maybeSingle();
      paymentMetadata =
        (transaction?.metadata as Record<string, unknown> | null) || null;
    }

    // ── Generate PDF buffer ───────────────────────────────────────────────
    const pdfData = normalizeAgreementForPdf({
      ...(agreement as unknown as Record<string, unknown>),
      payment_metadata: paymentMetadata,
    });
    const logoBase64 = fs
      .readFileSync(path.join(process.cwd(), "public", "logo.png"))
      .toString("base64");
    const logoDataUri = `data:image/png;base64,${logoBase64}`;
    const element = (
      <AgreementPdf data={pdfData} logoDataUri={logoDataUri} />
    ) as React.ReactElement<DocumentProps>;
    const buffer = await pdf(element).toBuffer();

    // ── Upload to Supabase Storage (reuse the existing "listing" bucket) ──
    const fileName = `agreements/${agreementId}.pdf`;
    const { error: uploadError } = await supabaseAdmin.storage
      .from("listing")
      .upload(fileName, buffer, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadError) {
      console.error("Storage upload error:", uploadError);
      return errorResponse("Failed to store PDF", 500, req);
    }

    const {
      data: { publicUrl },
    } = supabaseAdmin.storage.from("listing").getPublicUrl(fileName);

    // ── Persist pdf_url on the agreement row ─────────────────────────────
    await supabaseAdmin
      .from("rental_agreements")
      .update({ pdf_url: publicUrl })
      .eq("id", agreementId);

    return cors(NextResponse.json({ pdfUrl: publicUrl }), req);
  } catch (err) {
    console.error(
      "Error in POST /api/rental-agreements/[id]/generate-pdf:",
      err,
    );
    return errorResponse("Internal server error", 500, req);
  }
}
