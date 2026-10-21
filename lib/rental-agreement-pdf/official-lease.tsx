// Monthly rental agreement rendered on the official Burkina Faso lease
// template (docs/contrat-de-bail-modele.pdf). Legal wording follows the
// template article by article; only obvious typos are corrected (listed in the
// PR that introduced this file). Blanks Roogo has no data for are printed as
// dotted lines so the parties can complete them by hand.

import React from "react";
import {
  Document,
  Font,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import type { AgreementPdfData } from "./types";
import {
  buildOfficialLeaseFields,
  type LeaseBlank,
  type LeasePartyFields,
} from "./official-lease-fields";

const BRAND = "#C96A2E";
const INK = "#1A1A1A";
const MUTED = "#6B6B6B";
const DOTS = "#8A8A8A";
const BODY_SIZE = 9.5;
// Leading is set per text style (with its own fontSize, which react-pdf needs
// to resolve a unitless lineHeight), never on the Page: an inherited page
// lineHeight makes react-pdf drop the fixed footer's page-number render prop.
const LEADING = 1.45;

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: BODY_SIZE,
    color: INK,
    paddingTop: 34,
    paddingBottom: 46,
    paddingHorizontal: 50,
  },
  brandBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: BRAND,
    paddingBottom: 6,
    marginBottom: 16,
  },
  brandLeft: { flexDirection: "row", alignItems: "center" },
  brandLogo: { width: 16, height: 16, marginRight: 5 },
  brandText: { fontSize: 7.5, color: MUTED },
  title: {
    fontFamily: "Helvetica-Bold",
    fontSize: 15,
    textAlign: "center",
    letterSpacing: 1.2,
    marginBottom: 12,
  },
  intro: { fontFamily: "Helvetica-Bold", marginBottom: 8 },
  row: { flexDirection: "row", alignItems: "flex-start", marginBottom: 5.5 },
  // Top-aligned so a long value wraps downward under its own dotted line.
  field: { flexDirection: "row", alignItems: "flex-start" },
  label: { flexShrink: 0, marginRight: 3 },
  blank: {
    // Basis 0 so the value takes only the space left after its label and
    // wraps inside it instead of pushing the label out.
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    borderBottomWidth: 0.8,
    borderBottomStyle: "dotted",
    borderBottomColor: DOTS,
    minHeight: 12,
    paddingHorizontal: 2,
  },
  value: { fontFamily: "Helvetica-Bold" },
  partyClose: { marginTop: 2, marginBottom: 10 },
  et: {
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
    marginBottom: 8,
  },
  convenu: {
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
    marginTop: 4,
    marginBottom: 12,
  },
  articleTitle: {
    fontFamily: "Helvetica-Bold",
    marginTop: 8,
    marginBottom: 5,
  },
  subTitle: {
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
    marginTop: 4,
    marginBottom: 4,
  },
  paragraph: {
    marginBottom: 5,
    textAlign: "justify",
    fontSize: BODY_SIZE,
    lineHeight: LEADING,
  },
  indented: {
    marginBottom: 5,
    textAlign: "justify",
    textIndent: 24,
    fontSize: BODY_SIZE,
    lineHeight: LEADING,
  },
  listItem: { flexDirection: "row", marginBottom: 3, paddingLeft: 14 },
  listMarker: { width: 16 },
  listText: {
    flex: 1,
    textAlign: "justify",
    fontSize: BODY_SIZE,
    lineHeight: LEADING,
  },
  checkRow: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  checkLabel: { width: 230 },
  checkBox: {
    width: 9,
    height: 9,
    borderWidth: 0.8,
    borderColor: INK,
    marginLeft: 4,
    marginRight: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  checkMark: { fontFamily: "Helvetica-Bold", fontSize: 7, lineHeight: 1 },
  footnote: {
    fontSize: 8,
    color: MUTED,
    textAlign: "center",
    marginTop: 4,
    marginBottom: 4,
  },
  signatureBlock: { marginTop: 14 },
  faitEn: { textAlign: "right", marginBottom: 3 },
  faitA: { flexDirection: "row", justifyContent: "flex-end", marginBottom: 14 },
  sigRow: { flexDirection: "row", justifyContent: "space-between" },
  sigCol: { width: "44%", alignItems: "center" },
  sigTitle: { fontFamily: "Helvetica-Bold", marginBottom: 2 },
  sigHint: { fontSize: 8, color: MUTED, textAlign: "center" },
  sigName: { fontFamily: "Helvetica-Bold", marginTop: 6, textAlign: "center" },
  sigSpace: {
    height: 52,
    width: "100%",
    borderBottomWidth: 0.8,
    borderBottomStyle: "dotted",
    borderBottomColor: DOTS,
  },
  sigDone: {
    marginTop: 8,
    fontSize: 8.5,
    textAlign: "center",
    color: "#166534",
  },
  footer: {
    position: "absolute",
    bottom: 22,
    left: 50,
    right: 50,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7.5,
    color: MUTED,
  },
});

// French legal text must not be split with English hyphenation rules.
Font.registerHyphenationCallback((word) => [word]);

function Field({
  label,
  value,
  flex = 1,
  width,
}: {
  label?: string;
  value: LeaseBlank;
  flex?: number;
  width?: number;
}) {
  return (
    <View style={[styles.field, width ? { width } : { flex }]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={styles.blank}>
        <Text style={styles.value}>{value ?? " "}</Text>
      </View>
    </View>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <View style={styles.row}>{children}</View>;
}

function Gap() {
  return <View style={{ width: 10 }} />;
}

function PartyBlock({
  party,
  withCompany,
  designationLabel,
}: {
  party: LeasePartyFields;
  withCompany: boolean;
  designationLabel: string;
}) {
  return (
    <View>
      <Row>
        <Field label="Nom :" value={party.nom} />
        <Gap />
        <Field label="Prénom :" value={party.prenom} />
      </Row>
      <Row>
        <Field
          label="N° de la pièce d’identité, date et lieu d’établissement :"
          value={party.pieceIdentite}
        />
      </Row>
      {withCompany ? (
        <Row>
          <Field
            label="ou dénomination de la société :"
            value={party.denomination}
          />
        </Row>
      ) : null}
      <Row>
        <Field label="BP :" value={party.bp} />
      </Row>
      <Row>
        <Field label="Lot :" value={party.lot} />
        <Gap />
        <Field label="Parcelles :" value={party.parcelles} />
        <Gap />
        <Field label="Section :" value={party.section} />
        <Gap />
        <Field label="Secteur :" value={party.secteur} />
      </Row>
      <Row>
        <Field label="Adresse : Rue n°" value={party.rue} />
        <Gap />
        <Field label="Porte n°" value={party.porte} />
      </Row>
      <Row>
        <Field label="Profession :" value={party.profession} />
      </Row>
      <Row>
        <Field label={designationLabel} value={party.designation} />
      </Row>
    </View>
  );
}

function CheckBox({ checked }: { checked: boolean }) {
  return (
    <View style={styles.checkBox}>
      {checked ? <Text style={styles.checkMark}>X</Text> : null}
    </View>
  );
}

function YesNo({ label, value }: { label: string; value: boolean | null }) {
  return (
    <View style={styles.checkRow}>
      <Text style={styles.checkLabel}>{label}</Text>
      <Text>OUI</Text>
      <CheckBox checked={value === true} />
      <Text>NON</Text>
      <CheckBox checked={value === false} />
    </View>
  );
}

function ListItem({
  marker,
  children,
}: {
  marker: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.listItem} wrap={false}>
      <Text style={styles.listMarker}>{marker}</Text>
      <Text style={styles.listText}>{children}</Text>
    </View>
  );
}

function Article({ title }: { title: string }) {
  return (
    <Text style={styles.articleTitle} minPresenceAhead={40}>
      {title}
    </Text>
  );
}

function SignatureColumn({
  title,
  name,
  signedOn,
}: {
  title: string;
  name: LeaseBlank;
  signedOn: LeaseBlank;
}) {
  return (
    <View style={styles.sigCol}>
      <Text style={styles.sigTitle}>{title}</Text>
      <Text style={styles.sigHint}>(Signature précédée de la mention</Text>
      <Text style={styles.sigHint}>Lu et approuvé)</Text>
      {signedOn ? (
        <Text style={styles.sigDone}>
          {`Lu et approuvé. Signé électroniquement sur Roogo le ${signedOn}.`}
        </Text>
      ) : (
        <View style={styles.sigSpace} />
      )}
      {name ? <Text style={styles.sigName}>{name}</Text> : null}
    </View>
  );
}

export function OfficialLeasePdf({
  data,
  logoDataUri,
  generatedOn,
}: {
  data: AgreementPdfData;
  logoDataUri: string;
  /** DD/MM/YYYY, passed in so the document stays deterministic in tests. */
  generatedOn: string;
}) {
  const f = buildOfficialLeaseFields(data);

  return (
    <Document title={`Contrat de bail ${f.reference}`} author="Roogo">
      <Page size="A4" style={styles.page}>
        <View style={styles.brandBar} fixed>
          <View style={styles.brandLeft}>
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            <Image src={logoDataUri} style={styles.brandLogo} />
            <Text style={styles.brandText}>Établi via Roogo, roogobf.com</Text>
          </View>
          <Text style={styles.brandText}>{`Réf. ${f.reference}`}</Text>
        </View>

        <View style={styles.footer} fixed>
          <Text>{`Contrat de bail, réf. ${f.reference}. Document généré le ${generatedOn}.`}</Text>
          <Text
            render={({ pageNumber, totalPages }) =>
              `Page ${pageNumber} / ${totalPages}`
            }
          />
        </View>

        <Text style={styles.title}>CONTRAT DE BAIL</Text>

        <Text style={styles.intro}>Entre les soussignés</Text>
        <PartyBlock
          party={f.bailleur}
          withCompany={false}
          designationLabel="Ci-dessus désigné :"
        />
        <Text style={styles.partyClose}>
          Bailleur ou son représentant d’une part.
        </Text>

        <Text style={styles.et}>Et</Text>

        <PartyBlock
          party={f.preneur}
          withCompany
          designationLabel="Ci-dessous désigné :"
        />
        <Text style={styles.partyClose}>
          Preneur ou son représentant d’autre part.
        </Text>

        <Text style={styles.convenu}>Il a été convenu ce qui suit :</Text>

        {/* ── Article 1 ─────────────────────────────────────────────────── */}
        <Article title="ARTICLE 1" />
        <Text style={styles.paragraph}>
          Le bailleur donne en bail à loyer au preneur qui accepte un immeuble à
        </Text>
        <Row>
          <Field label="Usage :" value={f.bien.usage} />
          <Gap />
          <Field label="Sise à" value={f.bien.siseA} />
        </Row>
        <Row>
          <Field label="Commune de :" value={f.bien.commune} />
          <Gap />
          <Field label="Secteur :" value={f.bien.secteur} />
          <Gap />
          <Field label="Quartier :" value={f.bien.quartier} flex={1.6} />
        </Row>
        <Row>
          <Field label="Lot :" value={f.bien.lot} />
          <Gap />
          <Field label="Parcelles :" value={f.bien.parcelles} />
          <Gap />
          <Field label="Section :" value={f.bien.section} />
          <Gap />
          <Field label="Secteur :" value={f.bien.secteurParcellaire} />
        </Row>
        <Row>
          <Field
            label="Titre de propriété :"
            value={f.bien.titrePropriete}
            flex={2}
          />
          <Gap />
          <Field label="du" value={f.bien.titreDate} />
        </Row>
        <Row>
          <Field label="Adresse : Rue n°" value={f.bien.rue} />
          <Gap />
          <Field label="Porte n°" value={f.bien.porte} />
        </Row>
        <Row>
          <Field
            label="d’une superficie totale de"
            value={f.bien.superficie}
            width={250}
          />
          <Text style={{ marginLeft: 3 }}>m2</Text>
        </Row>
        <Text style={[styles.paragraph, { marginBottom: 4 }]}>équipé de :</Text>
        <YesNo
          label="une installation d’eau courante fonctionnelle :"
          value={f.bien.eauCourante}
        />
        <YesNo
          label="une installation électrique fonctionnelle :"
          value={f.bien.electricite}
        />
        <Row>
          <Field
            label="Autres équipements :"
            value={f.bien.autresEquipements}
          />
        </Row>

        {/* ── Article 2 ─────────────────────────────────────────────────── */}
        <Article title="ARTICLE 2 : DATE D’ENTREE EN JOUISSANCE - DUREE" />
        <Row>
          <Field
            label="Le présent bail à loyer est conclu pour une durée de"
            value={f.duree.duree}
          />
        </Row>
        <Row>
          <Field label="Commençant à courir du" value={f.duree.debut} />
          <Gap />
          <Field label="Au" value={f.duree.fin} />
        </Row>
        <Text style={styles.paragraph}>
          et renouvelable par tacite reconduction.
        </Text>

        {/* ── Article 3 ─────────────────────────────────────────────────── */}
        <Article title="ARTICLE 3 : LOYER" />
        <Text style={styles.paragraph}>
          Le bail est consenti par le bailleur et accepté par le preneur,
          moyennant :
        </Text>
        <Row>
          <Field label="1°- Un loyer mensuel de" value={f.loyer.mensuel} />
          <Text style={{ marginLeft: 3 }}>FCFA</Text>
        </Row>
        <Text style={[styles.paragraph, { marginBottom: 4 }]}>
          2°- Et le dépôt préalable entre les mains du bailleur.
        </Text>
        <Row>
          <Field label="D’une somme de" value={f.loyer.depot} />
          <Text style={{ marginLeft: 3 }}>FCFA</Text>
        </Row>
        <Row>
          <Field label="Représentant" value={f.loyer.representant} />
        </Row>

        {/* ── Article 4 ─────────────────────────────────────────────────── */}
        <Article title="ARTICLE 4 : CHARGES ET CONDITIONS" />
        <Text style={styles.subTitle}>I - A la charge du preneur</Text>
        <ListItem marker="1.">
          Le preneur devra occuper ladite maison par lui-même. S’abstenant d’y
          mener des activités proscrites ou incompatibles.
        </ListItem>
        <ListItem marker="2.">
          Entretien et préparation : Le preneur entretiendra les locaux et les
          meubles du bail tel qu’il les aura reçus, conformément à l’état des
          lieux fait en trois exemplaires signés par les deux parties et visés
          par le service ayant compétence pour enregistrer le contrat.
        </ListItem>
        <ListItem marker="3.">
          Règlement urbain : Le preneur satisfera en lieu et place du bailleur,
          toutes les prescriptions de police, de voirie et d’hygiène. Il
          exécutera à ses frais, sans recours contre le bailleur, tous travaux
          qui sont ou seront exigés par les textes et lois sur la santé
          publique.
        </ListItem>
        <ListItem marker="4.">
          Transformation : Le preneur ne pourra faire faire aucune modification
          ni transformation dans l’état ou la disposition des lieux sans
          autorisation préalable et expresse du Bailleur. Tout embellissement,
          toute amélioration ou construction nouvelle appartiendront de plein
          droit au Bailleur en fin de bail, sans aucune indemnité.
        </ListItem>
        <ListItem marker="5.">
          Sous-location cession : Le preneur ne pourra céder son droit au
          présent bail sans le consentement exprès du Bailleur. De même, il ne
          pourra sous-louer tout ou partie des locaux sans le dit consentement.
        </ListItem>

        <Text style={styles.subTitle}>II - A la charge du Bailleur</Text>
        <Text style={styles.paragraph}>
          Le bailleur supportera les grosses réparations qui pourraient devenir
          nécessaires.
        </Text>

        <Text style={styles.subTitle} minPresenceAhead={30}>
          III - Conditions particulières
        </Text>
        {f.conditionsParticulieres.length > 0 ? (
          f.conditionsParticulieres.map((line, i) => (
            <ListItem key={i} marker={`${i + 1}.`}>
              {line}
            </ListItem>
          ))
        ) : (
          <>
            <Row>
              <Field value={null} />
            </Row>
            <Row>
              <Field value={null} />
            </Row>
            <Row>
              <Field value={null} />
            </Row>
          </>
        )}
        <Text style={styles.footnote}>(1) rayer les mentions inutiles</Text>

        {/* ── Article 5 ─────────────────────────────────────────────────── */}
        <Article title="ARTICLE 5 : RESILIATION" />
        <Text style={styles.paragraph}>
          Le présent bail sera résilié à la demande écrite de l’une des parties
          pour les motifs suivants :
        </Text>
        <ListItem marker="a)">
          Le défaut de paiement de deux termes (2 mois) de loyer ;
        </ListItem>
        <ListItem marker="b)">
          L’inexécution par l’une des parties d’une quelconque clause du présent
          bail ;
        </ListItem>
        <ListItem marker="c)">
          La détérioration notable de l’immeuble par le fait du preneur ;
        </ListItem>
        <ListItem marker="d)">
          La reprise de l’immeuble par le propriétaire ;
        </ListItem>
        <ListItem marker="e)">
          La demande expresse du locataire adressée au Bailleur donnant un
          préavis de trois mois pour libérer les lieux ;
        </ListItem>
        <ListItem marker="f)">
          Cas fortuit d’affectation du preneur, expropriation du preneur du
          Bailleur pour cause d’utilité publique etc.
        </ListItem>
        <Text style={[styles.paragraph, { marginTop: 3 }]}>
          Dans tous les cas, les services des impôts du domicile du bailleur
          doivent être informés par écrit de toute demande de résiliation. A
          défaut de règlement à l’amiable, tout litige sera porté devant les
          juridictions compétentes.
        </Text>
        <Text style={styles.paragraph}>
          Le droit proportionnel sur les mutations de jouissance de biens
          immeubles est exigible lors de l’enregistrement de l’acte mais son
          montant peut être fractionné pour le paiement :
        </Text>
        <ListItem marker="a)">
          S’il s’agit d’un bail à durée fixe, en autant de paiements qu’il y a
          de périodes triennales dans la durée du bail ;
        </ListItem>
        <ListItem marker="b)">
          S’il s’agit d’un bail à période, en autant de paiements que le bail
          comporte de périodes.
        </ListItem>
        <Text style={[styles.paragraph, { marginTop: 3 }]}>
          Le droit afférent au bail et à son renouvellement est payé dans le
          mois du commencement de la nouvelle période à la diligence du
          propriétaire ou du locataire. Le défaut d’enregistrement, de
          renouvellement ou de paiement des droits afférents à une période dans
          les délais fixés par les textes en vigueur entraîne à l’encontre des
          parties l’application d’une amende égale au montant des droits dus.
        </Text>

        {/* ── Article 6 ─────────────────────────────────────────────────── */}
        <Article title="ARTICLE 6 : IMPÔTS SUR LES REVENUS FONCIERS" />
        <Text style={styles.paragraph}>
          Conformément aux termes en vigueur, il est fait obligation au bailleur
          d’effectuer la déclaration de ses revenus locatifs auprès du service
          des impôts du lieu de situation géographique de l’immeuble au plus
          tard le 10 du mois suivant celui au titre duquel le loyer est échu, à
          l’aide d’un imprimé fourni par l’administration et d’acquitter l’impôt
          correspondant dans le délai auprès du même service.
        </Text>
        <Text style={styles.indented}>
          Lorsque l’immeuble est situé à l’étranger, la déclaration doit être
          faite au service des impôts du lieu de résidence du bailleur et
          l’impôt correspondant acquitté dans le même délai que ci-dessus.
        </Text>
        <Text style={styles.indented}>
          En cas de résiliation avant terme du contrat de bail, le bailleur doit
          en effectuer la notification au service des impôts dans les 10 jours
          de la rupture du contrat.
        </Text>
        <Text style={styles.paragraph}>
          A défaut, l’impôt est dû, sans préjudice des pénalités prévues dans le
          présent titre.
        </Text>

        {/* ── Article 7 ─────────────────────────────────────────────────── */}
        <Article title="ARTICLE 7 : MODIFICATION" />
        <Text style={styles.paragraph}>
          Les parties peuvent apporter toutes modifications au présent bail dans
          les conditions qu’ils détermineront.
        </Text>
        <Text style={styles.paragraph}>
          Toutefois, ces modifications ne seront opposables à l’administration
          que si cette dernière est informée et que ces dites modifications ne
          soient pas contraires à la loi.
        </Text>

        {/* ── Article 8 + signatures (kept together) ───────────────────── */}
        <View wrap={false}>
          <Article title="ARTICLE 8 : ELECTION DE DOMICILE" />
          <Text style={styles.paragraph}>
            Pour l’exécution des présentes et leurs suites les parties font
            élection de domicile aux lieux ci-après :
          </Text>
          <Row>
            <Field label="Le Bailleur :" value={null} flex={2} />
            <Gap />
            <Field label="Tél. :" value={f.domicile.bailleurTelephone} />
          </Row>
          <Row>
            <Field label="Le Preneur :" value={null} flex={2} />
            <Gap />
            <Field label="Tél. :" value={f.domicile.preneurTelephone} />
          </Row>

          <View style={styles.signatureBlock}>
            <Text style={styles.faitEn}>Fait en quatre (4) exemplaires</Text>
            <View style={styles.faitA}>
              <Field label="A" value={f.faitA} width={150} />
              <Gap />
              <Field label="le" value={f.faitLe} width={110} />
            </View>
            <View style={styles.sigRow}>
              <SignatureColumn
                title="Le Preneur"
                name={f.signatures.preneur.nom}
                signedOn={f.signatures.preneur.signeLe}
              />
              <SignatureColumn
                title="Le Bailleur"
                name={f.signatures.bailleur.nom}
                signedOn={f.signatures.bailleur.signeLe}
              />
            </View>
          </View>
        </View>
      </Page>
    </Document>
  );
}
