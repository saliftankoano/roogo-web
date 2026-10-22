// Short-stay (journalier) agreement PDF. The official Burkina Faso lease
// template is written for monthly leases (monthly rent, deposit in months,
// tacit renewal, registration duties), so daily bookings keep this Roogo
// layout from the original generate-pdf route (only amount and date
// formatting now share the lease helpers).

import React from "react";
import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import type { AgreementPdfData } from "./types";
import { formatAmount, formatLeaseDate } from "./official-lease-fields";

// Plain-space thousands (Helvetica has no U+202F) and Burkina calendar dates.
function formatFCFA(amount: number): string {
  return formatAmount(amount) + " FCFA";
}

function formatDate(str: string | null | undefined): string {
  return formatLeaseDate(str) ?? "—";
}

const BRAND = "#C96A2E";
const INK = "#1A1A1A";
const MUTED = "#666666";
const SURFACE = "#FDF7F4";
const BORDER_SOFT = "#F0E0D8";
const RED_SURFACE = "#FFF5F5";
const RED_BORDER = "#EF4444";
const GREEN = "#16A34A";
const RULE_SURFACE = "#FAFAFA";

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
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 5,
  },
  rowLabel: { color: MUTED },
  rowValue: { fontFamily: "Helvetica-Bold" },
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

export function DailyAgreementPdf({
  data,
  logoDataUri,
}: {
  data: AgreementPdfData;
  logoDataUri: string;
}) {
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

  const depositAmount = data.monthly_rent * (data.caution_mois ?? 0);
  const paymentMeta = data.payment_metadata || {};
  const metaNumber = (key: string, fallback = 0) => {
    const value = paymentMeta[key];
    return typeof value === "number" && Number.isFinite(value)
      ? value
      : fallback;
  };

  // Stay duration in nights; no advance rent applies to daily bookings.
  let nightCount = 0;
  if (data.start_date && data.end_date) {
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

  const ref = data.id.substring(0, 8).toUpperCase();
  const title = "CONTRAT DE LOCATION COURTE DURÉE";
  const defaultTerms =
    "Le présent contrat de location courte durée est établi pour la période indiquée ci-dessus. Le locataire s'engage à libérer le logement à la date de départ convenue, à maintenir le bien en bon état et à respecter le règlement intérieur. La caution éventuelle sera restituée dans un délai de 48h après l'état des lieux de sortie, sous réserve de l'absence de dommages. Tout litige sera réglé à l'amiable, puis devant les juridictions compétentes de Ouagadougou.";
  const renderedTerms = data.terms_text || defaultTerms;

  return (
    <Document title={`${title} — ${ref}`} author="Roogo">
      <Page size="A4" style={styles.page}>
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
              <Text style={styles.partyLabel}>Voyageur / Hôte</Text>
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

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Bien loué</Text>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Adresse</Text>
            <Text style={styles.rowValue}>{propertyAddress}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Conditions financières</Text>
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
            <Text style={styles.tableValue}>{formatFCFA(dailyStayAmount)}</Text>
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
                <Text style={styles.tableLabel}>Montant net propriétaire</Text>
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
              <Text style={styles.tableValue}>{formatDate(data.end_date)}</Text>
            </View>
          ) : null}
          <View style={[styles.tableRow, styles.tableRowTotal]}>
            <Text style={styles.tableLabel}>Total payé sur Roogo</Text>
            <Text style={styles.tableValue}>
              {formatFCFA(dailyTotalCollected)}
            </Text>
          </View>
        </View>

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

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Non autorisé</Text>
          {data.interdictions.length > 0 ? (
            data.interdictions.map((item, i) => (
              <View key={i} style={styles.intItem}>
                <Text>• {item}</Text>
              </View>
            ))
          ) : (
            <View style={styles.intItem}>
              <Text>Aucune interdiction spécifique</Text>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Termes généraux</Text>
          <View style={styles.termsBox}>
            <Text>{renderedTerms}</Text>
          </View>
        </View>

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
                  <Text style={styles.sigLabel}>Signature du voyageur</Text>
                </>
              )}
            </View>
          </View>
        </View>

        <Text style={styles.footer}>
          Roogo — roogo.app • Document généré le{" "}
          {formatDate(new Date().toISOString())}
        </Text>
      </Page>
    </Document>
  );
}
