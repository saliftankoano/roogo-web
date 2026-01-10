import { notifyUser } from "./push-notifications";

export const LOCK_NOTIFICATIONS = {
  DAY_0: {
    OWNER: {
      title: "🎉 Bien réservé !",
      body: (address: string) =>
        `Votre bien situé à ${address} a été réservé via Early Bird. Nous organiserons la visite avec le locataire potentiel et vous tiendrons informé.`,
    },
    RENTER: {
      title: "🔒 Réservation confirmée !",
      body: (address: string) =>
        `Vous avez sécurisé le bien à ${address}. Notre équipe vous contactera sous peu pour planifier votre visite.`,
    },
  },
  DAY_3: {
    OWNER: {
      title: "📅 Mise à jour Réservation",
      body: (address: string) =>
        `La visite pour votre bien à ${address} est en cours d'organisation. Nous vous tiendrons informé du résultat.`,
    },
    RENTER: {
      title: "📅 Rappel : 4 jours restants",
      body: (address: string) =>
        `Avez-vous pu planifier votre visite pour le bien à ${address} ? Contactez-nous si vous avez des questions.`,
    },
  },
  DAY_5: {
    OWNER: {
      title: "⏰ 2 jours restants",
      body: (address: string) =>
        `La période de réservation pour votre bien à ${address} se termine bientôt. Nous vous informerons du résultat final.`,
    },
    RENTER: {
      title: "⏰ Plus que 2 jours !",
      body: (address: string) =>
        `Votre réservation pour le bien à ${address} expire bientôt. Assurez-vous de compléter votre visite.`,
    },
  },
  DAY_7: {
    OWNER: {
      title: "🔓 Réservation terminée",
      body: (address: string) =>
        `Le locataire n'a pas finalisé pour votre bien à ${address}. Il est de nouveau ouvert aux candidatures.`,
    },
    RENTER: {
      title: "🔓 Réservation expirée",
      body: (address: string) =>
        `Votre réservation pour le bien à ${address} a expiré. Il est maintenant disponible pour d'autres candidats.`,
    },
  },
  FINALIZED: {
    OWNER: {
      title: "✅ Bien Loué !",
      body: (address: string) =>
        `Félicitations ! Votre bien à ${address} a été officiellement loué.`,
    },
    RENTER: {
      title: "🎉 Félicitations !",
      body: (address: string) =>
        `Vous êtes officiellement le nouveau locataire du bien à ${address}. Bienvenue chez vous !`,
    },
  },
  REOPENED: {
    OWNER: {
      title: "🔓 Bien remis en ligne",
      body: (address: string) =>
        `La réservation pour votre bien à ${address} a été annulée. Il est de nouveau visible sur la plateforme.`,
    },
    RENTER: {
      title: "🔓 Réservation annulée",
      body: (address: string) =>
        `Votre réservation pour le bien à ${address} a été annulée par l'administration.`,
    },
  },
};

/**
 * Helper to notify both parties for a lock event
 */
export async function notifyLockParties(
  event: keyof typeof LOCK_NOTIFICATIONS,
  ownerId: string,
  renterId: string,
  address: string,
  propertyId: string
) {
  const templates = LOCK_NOTIFICATIONS[event];

  // Notify Owner
  await notifyUser(
    ownerId,
    templates.OWNER.title,
    templates.OWNER.body(address),
    { propertyId, type: "lock_update", event }
  );

  // Notify Renter
  await notifyUser(
    renterId,
    templates.RENTER.title,
    templates.RENTER.body(address),
    { propertyId, type: "lock_update", event }
  );
}
