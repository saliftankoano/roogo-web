export type SupportedNotificationLocale = "fr" | "en";

export type NotificationCopyKey =
  | "agreements.activeOwner"
  | "agreements.activeRenter"
  | "agreements.declined"
  | "agreements.ownerPropertySecured"
  | "agreements.ownerStayConfirmed"
  | "agreements.readyToSign"
  | "agreements.renterDraftCreated"
  | "agreements.renterSigned"
  | "applications.approved"
  | "applications.newViewingRequest"
  | "applications.rejected"
  | "applications.rejectedOtherSelected"
  | "applications.tenantAttributed"
  | "deposits.autoRefunded"
  | "deposits.claimFiled"
  | "deposits.deadlineReminder24h"
  | "deposits.deadlineReminder6h"
  | "deposits.refundApproved"
  | "deposits.resolvedOwnerCredited"
  | "deposits.resolvedOwnerRenterRefunded"
  | "deposits.resolvedRenterRefunded"
  | "deposits.resolvedRenterOwnerKept"
  | "payments.genericCompleted"
  | "payments.renterRentPaid"
  | "payments.ownerRentReceived"
  | "payments.boostActivated"
  | "payments.listingSubmitted"
  | "payments.listingPublished"
  | "payments.propertyReserved"
  | "payments.stayReserved"
  | "payments.stayPaymentNeedsSupport"
  | "dailyBookings.latePaymentConflictStaff"
  | "dailyBookings.requestSubmittedOwner"
  | "dailyBookings.requestSubmittedRenter"
  | "dailyBookings.requestApprovedRenter"
  | "dailyBookings.requestApprovedRenterHotel"
  | "dailyBookings.requestApprovedOwner"
  | "dailyBookings.requestDeclinedRenter"
  | "dailyBookings.requestExpiredRenter"
  | "dailyBookings.paymentExpiredRenter"
  | "dailyBookings.paymentConfirmedRenter"
  | "dailyBookings.paymentConfirmedRenterHotel"
  | "dailyBookings.paymentConfirmedOwner"
  | "dailyBookings.checkinReminderRenter"
  | "dailyBookings.checkinConfirmedOwner"
  | "dailyBookings.checkinIssueOwner"
  | "dailyBookings.checkoutReminderRenter"
  | "dailyBookings.checkoutReportedOwner"
  | "dailyBookings.issueOpened"
  | "dailyBookings.completedRenter"
  | "dailyBookings.payoutAvailable"
  | "identityVerification.urgentReviewRequested"
  | "ownershipVerification.reviewRequested"
  | "ownershipVerification.approved"
  | "ownershipVerification.rejected"
  | "properties.newMatch"
  | "properties.submittedForReview"
  | "properties.editApproved"
  | "properties.editRejected";

type NotificationCopyTemplate = {
  title: string;
  body: string;
};

type NotificationCopyParams = Record<
  string,
  string | number | null | undefined
>;

const notificationCopy: Record<
  NotificationCopyKey,
  Record<SupportedNotificationLocale, NotificationCopyTemplate>
> = {
  "agreements.activeOwner": {
    fr: {
      title: "Contrat de location activé",
      body: "Le contrat pour le bien au {location} est signé par les deux parties et maintenant actif.",
    },
    en: {
      title: "Rental agreement active",
      body: "The agreement for {location} is signed by both parties and is now active.",
    },
  },
  "agreements.activeRenter": {
    fr: {
      title: "Contrat de location activé",
      body: "Votre contrat pour le bien au {location} est maintenant actif. Vos paiements mensuels sont programmés.",
    },
    en: {
      title: "Rental agreement active",
      body: "Your agreement for {location} is now active. Your monthly payments are scheduled.",
    },
  },
  "agreements.declined": {
    fr: {
      title: "Contrat décliné",
      body: "Le locataire a décliné le contrat pour le bien au {location}. Contactez-le pour résoudre le problème.",
    },
    en: {
      title: "Agreement declined",
      body: "The renter declined the agreement for {location}. Contact them to resolve the issue.",
    },
  },
  "agreements.ownerPropertySecured": {
    fr: {
      title: "Propriété sécurisée !",
      body: "Un locataire a sécurisé votre bien au {location}. Préparez le contrat de bail.",
    },
    en: {
      title: "Property secured",
      body: "A renter secured your property in {location}. Prepare the rental agreement.",
    },
  },
  "agreements.ownerStayConfirmed": {
    fr: {
      title: "Séjour confirmé !",
      body: "Le séjour réservé pour {location} est confirmé et le contrat est déjà signé.",
    },
    en: {
      title: "Stay confirmed",
      body: "The stay booked for {location} is confirmed and the agreement is already signed.",
    },
  },
  "agreements.readyToSign": {
    fr: {
      title: "Votre contrat de bail est prêt",
      body: "Le propriétaire a préparé le contrat pour le bien au {location}. Consultez-le et signez.",
    },
    en: {
      title: "Your rental agreement is ready",
      body: "The owner prepared the agreement for {location}. Review and sign it.",
    },
  },
  "agreements.renterDraftCreated": {
    fr: {
      title: "Nouveau contrat de bail",
      body: "Un contrat de bail a été créé pour votre bien au {location}. Veuillez le consulter et signer.",
    },
    en: {
      title: "New rental agreement",
      body: "A rental agreement was created for your property in {location}. Please review and sign it.",
    },
  },
  "agreements.renterSigned": {
    fr: {
      title: "Le locataire a signé",
      body: "Le locataire a signé le contrat pour le bien au {location}. À vous de signer pour l'activer.",
    },
    en: {
      title: "The renter signed",
      body: "The renter signed the agreement for {location}. Sign it to activate the rental.",
    },
  },
  "applications.approved": {
    fr: {
      title: "Demande de visite acceptée",
      body: "Votre demande pour le bien au {location} a été acceptée.",
    },
    en: {
      title: "Viewing request approved",
      body: "Your request for {location} was approved.",
    },
  },
  "applications.newViewingRequest": {
    fr: {
      title: "Nouvelle demande de visite",
      body: "{applicantName} souhaite visiter votre bien au {location}",
    },
    en: {
      title: "New viewing request",
      body: "{applicantName} wants to visit your property in {location}",
    },
  },
  "applications.rejected": {
    fr: {
      title: "Demande de visite refusée",
      body: "Votre demande pour le bien au {location} a été refusée. {reason}",
    },
    en: {
      title: "Viewing request declined",
      body: "Your request for {location} was declined. {reason}",
    },
  },
  "applications.rejectedOtherSelected": {
    fr: {
      title: "Demande de visite refusée",
      body: "Un autre locataire a été sélectionné pour le bien au {location}.",
    },
    en: {
      title: "Viewing request declined",
      body: "Another renter was selected for the property in {location}.",
    },
  },
  "applications.tenantAttributed": {
    fr: {
      title: "Félicitations ! Vous avez été sélectionné",
      body: "Vous avez été sélectionné pour le bien au {location}. Le propriétaire va vous envoyer le contrat.",
    },
    en: {
      title: "You were selected",
      body: "You were selected for the property in {location}. The owner will send you the agreement.",
    },
  },
  "deposits.autoRefunded": {
    fr: {
      title: "Caution remboursée",
      body: "Aucune réclamation n'a été déposée. Votre caution a été renvoyée sur Mobile Money.",
    },
    en: {
      title: "Deposit refunded",
      body: "No claim was filed. Your deposit was sent back to Mobile Money.",
    },
  },
  "deposits.claimFiled": {
    fr: {
      title: "Litige sur votre caution",
      body: "Le propriétaire a déposé une réclamation. Roogo examine les preuves et vous notifiera de la décision.",
    },
    en: {
      title: "Deposit dispute",
      body: "The owner filed a claim. Roogo is reviewing the evidence and will notify you of the decision.",
    },
  },
  "deposits.deadlineReminder24h": {
    fr: {
      title: "Caution: 24h pour décider",
      body: "Confirmez que tout va bien ou déclarez un dommage avant l'échéance.",
    },
    en: {
      title: "Deposit: 24h to decide",
      body: "Confirm everything is fine or report damage before the deadline.",
    },
  },
  "deposits.deadlineReminder6h": {
    fr: {
      title: "Caution: 6h avant remboursement auto",
      body: "Sans action de votre part, la caution sera rendue au locataire.",
    },
    en: {
      title: "Deposit: 6h before auto-refund",
      body: "Without action from you, the deposit will be returned to the renter.",
    },
  },
  "deposits.refundApproved": {
    fr: {
      title: "Caution remboursée",
      body: "Le propriétaire a validé votre séjour. Votre caution est en route vers Mobile Money.",
    },
    en: {
      title: "Deposit refunded",
      body: "The owner validated your stay. Your deposit is on its way to Mobile Money.",
    },
  },
  "deposits.resolvedOwnerCredited": {
    fr: {
      title: "Litige résolu",
      body: "Roogo vous a crédité {amount} sur votre portefeuille.",
    },
    en: {
      title: "Dispute resolved",
      body: "Roogo credited {amount} to your wallet.",
    },
  },
  "deposits.resolvedOwnerRenterRefunded": {
    fr: {
      title: "Litige résolu",
      body: "Roogo a remboursé la totalité de la caution au locataire.",
    },
    en: {
      title: "Dispute resolved",
      body: "Roogo refunded the full deposit to the renter.",
    },
  },
  "deposits.resolvedRenterRefunded": {
    fr: {
      title: "Décision sur votre caution",
      body: "Roogo vous rembourse {amount} sur Mobile Money.",
    },
    en: {
      title: "Deposit decision",
      body: "Roogo is refunding {amount} to your Mobile Money.",
    },
  },
  "deposits.resolvedRenterOwnerKept": {
    fr: {
      title: "Décision sur votre caution",
      body: "Roogo a attribué la totalité de la caution au propriétaire.",
    },
    en: {
      title: "Deposit decision",
      body: "Roogo awarded the full deposit to the owner.",
    },
  },
  "payments.genericCompleted": {
    fr: {
      title: "Paiement confirmé",
      body: "Votre paiement a été traité avec succès",
    },
    en: {
      title: "Payment confirmed",
      body: "Your payment was processed successfully",
    },
  },
  "payments.renterRentPaid": {
    fr: {
      title: "Loyer payé",
      body: "Votre paiement de loyer a été confirmé",
    },
    en: {
      title: "Rent paid",
      body: "Your rent payment has been confirmed",
    },
  },
  "payments.ownerRentReceived": {
    fr: {
      title: "Loyer reçu",
      body: "Vous avez reçu {amount} pour {propertyLabel}.",
    },
    en: {
      title: "Rent received",
      body: "You received {amount} for {propertyLabel}.",
    },
  },
  "payments.boostActivated": {
    fr: {
      title: "Boost activé",
      body: "{propertyLabel} est maintenant en avant pour 7 jours",
    },
    en: {
      title: "Boost activated",
      body: "{propertyLabel} is now promoted for 7 days",
    },
  },
  "payments.listingSubmitted": {
    fr: {
      title: "Annonce soumise",
      body: "Votre paiement est confirmé. L'annonce est en cours de vérification.",
    },
    en: {
      title: "Listing submitted",
      body: "Your payment is confirmed. Your listing is under review.",
    },
  },
  "payments.listingPublished": {
    fr: {
      title: "Annonce publiée",
      body: "Votre annonce est maintenant en ligne",
    },
    en: {
      title: "Listing published",
      body: "Your listing is now online",
    },
  },
  "payments.propertyReserved": {
    fr: {
      title: "Bien réservé avec succès",
      body: "Votre réservation pour {propertyLabel} est confirmée",
    },
    en: {
      title: "Property reserved",
      body: "Your reservation for {propertyLabel} is confirmed",
    },
  },
  "payments.stayReserved": {
    fr: {
      title: "Séjour réservé avec succès",
      body: "Votre réservation de séjour pour {propertyLabel} est confirmée",
    },
    en: {
      title: "Stay reserved",
      body: "Your stay reservation for {propertyLabel} is confirmed",
    },
  },
  "dailyBookings.requestSubmittedOwner": {
    fr: {
      title: "Nouvelle demande de séjour",
      body: "{renterName} veut réserver {propertyLabel} du {startDate} au {endDate}.",
    },
    en: {
      title: "New stay request",
      body: "{renterName} wants to book {propertyLabel} from {startDate} to {endDate}.",
    },
  },
  "dailyBookings.requestSubmittedRenter": {
    fr: {
      title: "Demande envoyée",
      body: "Le propriétaire a jusqu'à {deadline} pour confirmer {propertyLabel}.",
    },
    en: {
      title: "Request sent",
      body: "The owner has until {deadline} to confirm {propertyLabel}.",
    },
  },
  "dailyBookings.requestApprovedRenter": {
    fr: {
      title: "Séjour approuvé",
      body: "Payez avant {deadline} pour confirmer votre séjour à {propertyLabel}.",
    },
    en: {
      title: "Stay approved",
      body: "Pay by {deadline} to confirm your stay at {propertyLabel}.",
    },
  },
  "dailyBookings.requestApprovedRenterHotel": {
    fr: {
      title: "Disponibilité confirmée",
      body: "L'hôtel a confirmé votre chambre à {propertyLabel}. Payez avant {deadline} pour confirmer la réservation.",
    },
    en: {
      title: "Availability confirmed",
      body: "The hotel confirmed your room at {propertyLabel}. Pay by {deadline} to confirm the booking.",
    },
  },
  "dailyBookings.requestApprovedOwner": {
    fr: {
      title: "Approbation envoyée",
      body: "Le séjour à {propertyLabel} sera confirmé quand le locataire paie avant {deadline}.",
    },
    en: {
      title: "Approval sent",
      body: "The stay at {propertyLabel} is confirmed once the renter pays by {deadline}.",
    },
  },
  "dailyBookings.requestDeclinedRenter": {
    fr: {
      title: "Demande refusée",
      body: "Le propriétaire n'a pas pu accepter votre demande pour {propertyLabel}. Aucun paiement n'a été fait.",
    },
    en: {
      title: "Request declined",
      body: "The owner could not accept your request for {propertyLabel}. No payment was made.",
    },
  },
  "dailyBookings.requestExpiredRenter": {
    fr: {
      title: "Demande expirée",
      body: "Le propriétaire n'a pas répondu à temps pour {propertyLabel}. Aucun paiement n'a été fait.",
    },
    en: {
      title: "Request expired",
      body: "The owner did not respond in time for {propertyLabel}. No payment was made.",
    },
  },
  "dailyBookings.paymentExpiredRenter": {
    fr: {
      title: "Paiement expiré",
      body: "Le délai de paiement pour {propertyLabel} est passé. Faites une nouvelle demande si besoin.",
    },
    en: {
      title: "Payment expired",
      body: "The payment window for {propertyLabel} passed. Request again if needed.",
    },
  },
  "dailyBookings.paymentConfirmedRenter": {
    fr: {
      title: "Séjour confirmé",
      body: "Votre paiement est confirmé pour {propertyLabel}.",
    },
    en: {
      title: "Stay confirmed",
      body: "Your payment is confirmed for {propertyLabel}.",
    },
  },
  "payments.stayPaymentNeedsSupport": {
    fr: {
      title: "Paiement reçu, séjour à confirmer",
      body: "Votre paiement pour {propertyLabel} est arrivé après le délai et les dates ne sont plus libres. Le support Roogo vous contacte pour un remboursement ou de nouvelles dates.",
    },
    en: {
      title: "Payment received, stay to confirm",
      body: "Your payment for {propertyLabel} arrived after the deadline and the dates are no longer free. Roogo support will contact you about a refund or new dates.",
    },
  },
  "dailyBookings.latePaymentConflictStaff": {
    fr: {
      title: "Action requise: paiement en conflit",
      body: "Un paiement pour {propertyLabel} est arrivé après le délai et la réservation ne peut pas être confirmée. Ouvrez le dossier et contactez le client pour un remboursement.",
    },
    en: {
      title: "Action required: payment conflict",
      body: "A payment for {propertyLabel} arrived after the deadline and the booking cannot be confirmed. Open the case and contact the guest about a refund.",
    },
  },
  "dailyBookings.paymentConfirmedRenterHotel": {
    fr: {
      title: "Réservation confirmée",
      body: "Votre paiement est confirmé pour {propertyLabel}. Code de réservation: {bookingCode}. Présentez-le à la réception.",
    },
    en: {
      title: "Booking confirmed",
      body: "Your payment is confirmed for {propertyLabel}. Booking code: {bookingCode}. Show it at the front desk.",
    },
  },
  "dailyBookings.paymentConfirmedOwner": {
    fr: {
      title: "Séjour confirmé",
      body: "Le paiement pour {propertyLabel} est reçu et restera en attente jusqu'après le départ.",
    },
    en: {
      title: "Stay confirmed",
      body: "Payment for {propertyLabel} was received and stays pending until after checkout.",
    },
  },
  "dailyBookings.checkinReminderRenter": {
    fr: {
      title: "Arrivée aujourd'hui",
      body: "Votre séjour à {propertyLabel} commence à {time}. Confirmez l'accès à votre arrivée.",
    },
    en: {
      title: "Check-in today",
      body: "Your stay at {propertyLabel} starts at {time}. Confirm access when you arrive.",
    },
  },
  "dailyBookings.checkinConfirmedOwner": {
    fr: {
      title: "Arrivée confirmée",
      body: "Le locataire a confirmé l'accès à {propertyLabel}.",
    },
    en: {
      title: "Check-in confirmed",
      body: "The renter confirmed access to {propertyLabel}.",
    },
  },
  "dailyBookings.checkinIssueOwner": {
    fr: {
      title: "Aide nécessaire",
      body: "Le locataire a besoin d'aide pour accéder à {propertyLabel}. Répondez maintenant.",
    },
    en: {
      title: "Help needed",
      body: "The renter needs help accessing {propertyLabel}. Please respond now.",
    },
  },
  "dailyBookings.checkoutReminderRenter": {
    fr: {
      title: "Départ aujourd'hui",
      body: "Votre départ de {propertyLabel} est prévu à {time}. Confirmez après votre sortie.",
    },
    en: {
      title: "Checkout today",
      body: "Your checkout from {propertyLabel} is scheduled for {time}. Confirm after leaving.",
    },
  },
  "dailyBookings.checkoutReportedOwner": {
    fr: {
      title: "Départ signalé",
      body: "Le locataire a signalé son départ de {propertyLabel}. Signalez un problème avant {deadline} si besoin.",
    },
    en: {
      title: "Checkout reported",
      body: "The renter reported checkout from {propertyLabel}. Report a problem by {deadline} if needed.",
    },
  },
  "dailyBookings.issueOpened": {
    fr: {
      title: "Problème signalé",
      body: "Un problème a été signalé pour {propertyLabel}. Le paiement propriétaire reste en attente.",
    },
    en: {
      title: "Problem reported",
      body: "A problem was reported for {propertyLabel}. Owner payout remains pending.",
    },
  },
  "dailyBookings.completedRenter": {
    fr: {
      title: "Séjour terminé",
      body: "Votre séjour à {propertyLabel} est terminé. Votre reçu est disponible dans Roogo.",
    },
    en: {
      title: "Stay completed",
      body: "Your stay at {propertyLabel} is completed. Your receipt is available in Roogo.",
    },
  },
  "dailyBookings.payoutAvailable": {
    fr: {
      title: "Paiement disponible",
      body: "Votre paiement pour {propertyLabel} est maintenant disponible.",
    },
    en: {
      title: "Payout available",
      body: "Your payout for {propertyLabel} is now available.",
    },
  },
  "identityVerification.urgentReviewRequested": {
    fr: {
      title: "URGENT: identité à vérifier",
      body: "{userLabel} attend une vérification d'identité. Traitez ce dossier rapidement pour débloquer sa publication.",
    },
    en: {
      title: "URGENT: identity review needed",
      body: "{userLabel} is waiting for identity verification. Review this quickly so their listing can be unlocked.",
    },
  },
  "ownershipVerification.reviewRequested": {
    fr: {
      title: "Documents de propriété à vérifier",
      body: "{userLabel} a soumis des documents pour une annonce à vendre. Vérifiez-les pour débloquer la mise en ligne.",
    },
    en: {
      title: "Ownership documents to review",
      body: "{userLabel} submitted documents for a sale listing. Review them to unlock publishing.",
    },
  },
  "ownershipVerification.approved": {
    fr: {
      title: "Documents approuvés ✅",
      body: "Vos documents de propriété sont vérifiés. Votre annonce à vendre peut maintenant être mise en ligne.",
    },
    en: {
      title: "Documents approved ✅",
      body: "Your ownership documents are verified. Your sale listing can now go live.",
    },
  },
  "ownershipVerification.rejected": {
    fr: {
      title: "Documents à revoir",
      body: "Vos documents de propriété n'ont pas été validés. Ouvrez l'app pour voir la raison et renvoyer.",
    },
    en: {
      title: "Documents need changes",
      body: "Your ownership documents were not approved. Open the app to see why and resubmit.",
    },
  },
  "properties.newMatch": {
    fr: {
      title: "Nouveau bien disponible",
      body: "{type} à {location} correspond à votre recherche.",
    },
    en: {
      title: "New property available",
      body: "{type} in {location} matches your search.",
    },
  },
  "properties.submittedForReview": {
    fr: {
      title: "Nouvelle annonce à vérifier",
      body: "{propertyLabel} attend une validation.",
    },
    en: {
      title: "New listing to review",
      body: "{propertyLabel} is waiting for approval.",
    },
  },
  "properties.editApproved": {
    fr: {
      title: "Modifications approuvées",
      body: "Vos modifications pour {propertyLabel} ont été approuvées.",
    },
    en: {
      title: "Edits approved",
      body: "Your edits to {propertyLabel} have been approved.",
    },
  },
  "properties.editRejected": {
    fr: {
      title: "Modifications refusées",
      body: "Vos modifications pour {propertyLabel} ont été refusées. {reviewNote}",
    },
    en: {
      title: "Edits rejected",
      body: "Your edits to {propertyLabel} were not approved. {reviewNote}",
    },
  },
};

export function normalizeNotificationLocale(
  locale: unknown,
): SupportedNotificationLocale {
  if (typeof locale !== "string") return "fr";
  return locale.toLowerCase().startsWith("en") ? "en" : "fr";
}

function interpolate(template: string, params?: NotificationCopyParams) {
  if (!params) return template;

  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = params[key];
    return value === undefined || value === null ? match : String(value);
  });
}

export function renderNotificationCopy(
  key: NotificationCopyKey,
  locale: unknown,
  params?: NotificationCopyParams,
) {
  const normalizedLocale = normalizeNotificationLocale(locale);
  const template =
    notificationCopy[key][normalizedLocale] ?? notificationCopy[key].fr;

  return {
    title: interpolate(template.title, params).trim(),
    body: interpolate(template.body, params).trim(),
  };
}

export function formatXofAmount(
  amount: string | number | null | undefined,
  locale: unknown,
) {
  const numericAmount =
    typeof amount === "number"
      ? amount
      : typeof amount === "string"
        ? Number(amount)
        : NaN;

  if (!Number.isFinite(numericAmount)) {
    return normalizeNotificationLocale(locale) === "en"
      ? "the rent"
      : "le loyer";
  }

  const languageTag =
    normalizeNotificationLocale(locale) === "en" ? "en-US" : "fr-BF";
  return `${new Intl.NumberFormat(languageTag, {
    maximumFractionDigits: 0,
  }).format(numericAmount)} FCFA`;
}
