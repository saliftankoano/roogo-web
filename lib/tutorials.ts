export const TUTORIAL_PLAYLIST_URL =
  "https://www.youtube.com/playlist?list=PLLC-6vtmXv9g";

export type TutorialTopic = "owner-registration" | "property-sale";
export type TutorialFormat = "horizontal" | "vertical";
export type TutorialVoice = "Alimata" | "Rapoko" | "Jérôme";

export type YouTubeVideo = {
  id: string;
  title: string;
  url: string;
  format: TutorialFormat;
  voice: TutorialVoice;
  uploadDate?: string;
};

export type TutorialStep = {
  name: string;
  text: string;
};

export type TutorialFaq = {
  question: string;
  answer: string;
};

export type Tutorial = {
  slug: string;
  topic: TutorialTopic;
  title: string;
  eyebrow: string;
  summary: string;
  description: string;
  metaTitle: string;
  metaDescription: string;
  prerequisites: string[];
  steps: TutorialStep[];
  guidance: {
    title: string;
    paragraphs: string[];
    items?: string[];
  };
  troubleshooting: TutorialFaq[];
  faqs: TutorialFaq[];
  cta: {
    href: string;
    label: string;
    description: string;
  };
  videos: {
    horizontal: {
      alimata: YouTubeVideo;
      jerome: YouTubeVideo;
    };
    vertical: {
      rapoko: YouTubeVideo;
      jerome: YouTubeVideo;
    };
  };
};

const ownerRegistration: Tutorial = {
  slug: "comment-s-inscrire-roogo-proprietaire",
  topic: "owner-registration",
  eyebrow: "Compte propriétaire",
  title: "Comment créer un compte propriétaire Roogo avec Google",
  summary:
    "Créez votre compte depuis votre téléphone, choisissez le profil propriétaire et terminez la configuration de votre profil.",
  description:
    "Ce tutoriel vous accompagne de l'ouverture de Roogo à la finalisation de votre profil propriétaire. Vous pourrez ensuite proposer et suivre vos biens immobiliers depuis l'application.",
  metaTitle: "Créer un compte propriétaire Roogo avec Google",
  metaDescription:
    "Tutoriel en français pour créer un compte propriétaire Roogo avec Google, compléter son profil et commencer à proposer un bien au Burkina Faso.",
  prerequisites: [
    "Un téléphone connecté à Internet avec l'application Roogo installée.",
    "Un compte Google auquel vous pouvez vous connecter.",
    "Un numéro de téléphone et un numéro WhatsApp sur lesquels l'équipe Roogo peut vous joindre.",
    "Votre ville et une première idée du type de bien que vous souhaitez proposer.",
  ],
  steps: [
    {
      name: "Ouvrir Roogo et démarrer l'inscription",
      text: "Ouvrez l'application Roogo, puis choisissez l'option de création de compte. L'inscription est gratuite et le tutoriel n'est jamais obligatoire pour continuer.",
    },
    {
      name: "Continuer avec Google",
      text: "Touchez le bouton Google et sélectionnez le compte que vous souhaitez associer à Roogo. Vérifiez que le nom affiché correspond bien à la personne qui gérera les biens.",
    },
    {
      name: "Choisir le profil propriétaire",
      text: "Lorsque Roogo vous demande comment vous utiliserez l'application, choisissez Propriétaire. Ce choix ouvre les outils qui permettent d'ajouter et de suivre vos annonces.",
    },
    {
      name: "Renseigner vos coordonnées",
      text: "Ajoutez votre téléphone, votre WhatsApp et votre ville. Utilisez des coordonnées actives : elles servent à coordonner la mise en ligne, les échanges et les visites.",
    },
    {
      name: "Préciser votre situation",
      text: "Indiquez si vous avez déjà un bien disponible et comment vous avez découvert Roogo. Ces réponses aident l'équipe à adapter l'accompagnement ; elles ne publient aucun bien automatiquement.",
    },
    {
      name: "Terminer et accéder à votre espace",
      text: "Relisez les informations, terminez la configuration et ouvrez votre espace propriétaire. Vous pouvez maintenant commencer une annonce ou revenir plus tard sans perdre l'accès à votre compte.",
    },
  ],
  guidance: {
    title: "Bien préparer votre profil propriétaire",
    paragraphs: [
      "Le compte Google simplifie la connexion, mais vos informations Roogo restent importantes. Un téléphone joignable et une ville exacte permettent à l'équipe de vous accompagner au bon moment.",
      "La création du compte ne met pas encore un logement, un terrain ou un local en ligne. La publication commence seulement lorsque vous lancez l'ajout d'un bien et envoyez les informations demandées.",
    ],
    items: [
      "Utilisez votre nom réel ou celui de la personne autorisée à gérer le bien.",
      "Vérifiez les chiffres de votre numéro WhatsApp avant de valider.",
      "Ne communiquez jamais votre mot de passe Google à un tiers, y compris à l'équipe Roogo.",
    ],
  },
  troubleshooting: [
    {
      question: "Le bouton Google ne répond pas",
      answer:
        "Vérifiez la connexion Internet, fermez puis rouvrez Roogo et recommencez. Si la fenêtre Google s'ouvre, terminez ou annulez-la avant de toucher de nouveau le bouton.",
    },
    {
      question: "Je ne vois pas le bon compte Google",
      answer:
        "Dans la fenêtre Google, choisissez l'option permettant d'utiliser un autre compte, puis connectez-vous avec l'adresse voulue.",
    },
    {
      question: "J'ai choisi le mauvais profil",
      answer:
        "N'ajoutez pas un second compte. Contactez l'assistance Roogo afin que l'équipe vérifie votre profil et vous indique la correction adaptée.",
    },
  ],
  faqs: [
    {
      question: "L'inscription propriétaire est-elle payante ?",
      answer:
        "La création du compte est gratuite. Les éventuels services associés à une annonce sont présentés séparément avant leur utilisation.",
    },
    {
      question: "Puis-je regarder la vidéo après mon inscription ?",
      answer:
        "Oui. Le centre Tutoriels reste public et vous pouvez rouvrir cette page ou la playlist Roogo à tout moment.",
    },
    {
      question: "Dois-je regarder toute la vidéo pour m'inscrire ?",
      answer:
        "Non. La vidéo est une aide facultative. Elle ne bloque ni ne valide votre inscription.",
    },
  ],
  cta: {
    href: "/inscription",
    label: "Créer mon compte propriétaire",
    description: "Prêt à commencer ? Ouvrez l'inscription Roogo.",
  },
  videos: {
    horizontal: {
      alimata: {
        id: "eQwtzc6O2to",
        title:
          "Comment s'inscrire sur Roogo Burkina | Compte propriétaire Google | Voix Alimata",
        url: "https://youtu.be/eQwtzc6O2to",
        format: "horizontal",
        voice: "Alimata",
        uploadDate: "2026-08-27T20:15:18-07:00",
      },
      jerome: {
        id: "WntrazGVxDA",
        title:
          "Comment s'inscrire sur Roogo Burkina | Compte propriétaire Google | Voix Jérôme",
        url: "https://youtu.be/WntrazGVxDA",
        format: "horizontal",
        voice: "Jérôme",
        uploadDate: "2026-08-27T20:21:34-07:00",
      },
    },
    vertical: {
      rapoko: {
        id: "sL4J8PaY_Jo",
        title:
          "Comment s'inscrire sur Roogo Burkina | Compte propriétaire Google | Voix Rapoko | Short",
        url: "https://youtube.com/shorts/sL4J8PaY_Jo",
        format: "vertical",
        voice: "Rapoko",
      },
      jerome: {
        id: "aH7R0cMflxE",
        title:
          "Comment s'inscrire sur Roogo Burkina | Compte propriétaire Google | Voix Jérôme | Short",
        url: "https://youtube.com/shorts/aH7R0cMflxE",
        format: "vertical",
        voice: "Jérôme",
      },
    },
  },
};

const propertySale: Tutorial = {
  slug: "comment-mettre-bien-en-vente-roogo",
  topic: "property-sale",
  eyebrow: "Vendre un bien",
  title: "Comment mettre un bien immobilier en vente sur Roogo",
  summary:
    "Préparez le prix, les caractéristiques et les photos, puis envoyez votre maison, terrain ou appartement à l'équipe Roogo.",
  description:
    "Suivez le parcours mobile Roogo pour proposer un bien à la vente : type de bien, localisation, prix net souhaité, détails, photos et vérification des documents de propriété.",
  metaTitle: "Mettre un bien immobilier en vente sur Roogo",
  metaDescription:
    "Guide en français pour vendre une maison, un terrain ou un appartement sur Roogo : prix, localisation, photos et documents de propriété.",
  prerequisites: [
    "Un compte Roogo configuré comme propriétaire ou agent autorisé.",
    "L'adresse du bien : ville, quartier et indications utiles pour le localiser.",
    "Le prix net que vous souhaitez recevoir et les caractéristiques du bien.",
    "Entre 3 et 20 photos claires prises dans de bonnes conditions de lumière.",
    "Si possible, une photo lisible d'une preuve de propriété pour l'étape de vérification.",
  ],
  steps: [
    {
      name: "Commencer un nouveau bien",
      text: "Dans Roogo, ouvrez l'ajout de propriété puis choisissez À vendre. Ce choix adapte le parcours à la vente et ne change pas vos autres annonces.",
    },
    {
      name: "Choisir le type de propriété",
      text: "Sélectionnez la catégorie qui décrit réellement le bien : maison, appartement, terrain ou autre type proposé dans l'application. Pour un terrain, la superficie fait partie des informations nécessaires.",
    },
    {
      name: "Indiquer la localisation",
      text: "Renseignez la ville, le quartier et les précisions utiles. Une localisation claire aide Roogo à présenter l'annonce aux bons acheteurs et à préparer les visites.",
    },
    {
      name: "Saisir le prix net souhaité",
      text: "Entrez le montant que vous souhaitez recevoir. Vérifiez soigneusement les chiffres et l'unité avant de passer à la suite.",
    },
    {
      name: "Décrire le bien",
      text: "Ajoutez les pièces, salles d'eau, équipements et autres caractéristiques qui s'appliquent à votre type de bien. Rédigez une description fidèle, sans masquer un défaut important.",
    },
    {
      name: "Ajouter les photos",
      text: "Choisissez au moins 3 photos et au maximum 20. Montrez l'extérieur, les pièces principales et les éléments distinctifs ; évitez les images floues, sombres ou répétées.",
    },
    {
      name: "Envoyer l'annonce",
      text: "Relisez le récapitulatif puis envoyez le bien. Une annonce de vente passe ensuite par la vérification des justificatifs de propriété avant sa mise en ligne.",
    },
    {
      name: "Transmettre une preuve de propriété",
      text: "Ajoutez au moins un document si vous choisissez de l'envoyer maintenant. Vous pouvez aussi sélectionner Plus tard : l'équipe Roogo vous le demandera dans votre conversation Ventes.",
    },
  ],
  guidance: {
    title: "Quels documents préparer pour la vérification ?",
    paragraphs: [
      "Roogo suggère en priorité le PUH (Permis Urbain d'Habiter). L'écran accepte aussi un titre foncier, une attestation de possession, un plan cadastral ou un autre document pertinent. Cette liste est une aide de préparation, pas l'affirmation que chaque document est obligatoire pour chaque bien.",
      "Si vous lancez l'envoi de documents, l'application demande au moins un fichier. Vous pouvez toutefois choisir « Plus tard. L'équipe me contactera. » : votre conversation Ventes reste disponible et l'équipe vous indiquera la pièce adaptée à votre situation.",
      "Photographiez le document entier, sans couper les bords, avec un texte lisible. Ne publiez pas ces justificatifs sur les réseaux sociaux ; transmettez-les uniquement dans le parcours sécurisé prévu par Roogo.",
    ],
    items: [
      "PUH (Permis Urbain d'Habiter), document suggéré en priorité dans l'application.",
      "Titre foncier, attestation de possession ou plan cadastral, selon ce que vous détenez.",
      "Autre justificatif pertinent, que l'équipe pourra examiner et compléter si nécessaire.",
    ],
  },
  troubleshooting: [
    {
      question: "Mes photos ne sont pas acceptées",
      answer:
        "Vérifiez que vous avez sélectionné entre 3 et 20 images et que Roogo a l'autorisation d'accéder aux photos du téléphone. Retirez une image illisible puis réessayez si l'envoi reste bloqué.",
    },
    {
      question: "Je ne connais pas encore le prix exact",
      answer:
        "Évitez d'envoyer un montant au hasard. Préparez le prix net souhaité, puis revenez au brouillon avant la soumission de l'annonce.",
    },
    {
      question: "Je n'ai pas le document avec moi",
      answer:
        "Choisissez l'option Plus tard sur l'écran de vérification. L'équipe vous contactera dans la conversation Ventes pour organiser la suite.",
    },
  ],
  faqs: [
    {
      question: "Puis-je vendre un terrain sur Roogo ?",
      answer:
        "Oui. Choisissez le type Terrain et renseignez notamment sa localisation et sa superficie, puis ajoutez les photos et informations disponibles.",
    },
    {
      question: "Tous les documents cités sont-ils obligatoires ?",
      answer:
        "Non. Ce sont les catégories suggérées par l'application. Si vous envoyez maintenant, ajoutez au moins un document ; l'équipe précise ensuite les justificatifs adaptés au bien.",
    },
    {
      question: "L'annonce est-elle publiée immédiatement ?",
      answer:
        "Non. Après l'envoi, l'équipe vérifie les informations et les documents de propriété avant la mise en ligne d'une annonce de vente.",
    },
  ],
  cta: {
    href: "/mes-proprietes",
    label: "Accéder à mes propriétés",
    description: "Retrouvez vos biens et commencez une nouvelle annonce.",
  },
  videos: {
    horizontal: {
      alimata: {
        id: "ISxHKmk1nQw",
        title: "Comment mettre un bien en vente sur Roogo Burkina | Voix Alimata",
        url: "https://youtu.be/ISxHKmk1nQw",
        format: "horizontal",
        voice: "Alimata",
        uploadDate: "2026-08-27T20:16:15-07:00",
      },
      jerome: {
        id: "8Aa-VA6dlas",
        title: "Comment mettre un bien en vente sur Roogo Burkina | Voix Jérôme",
        url: "https://youtu.be/8Aa-VA6dlas",
        format: "horizontal",
        voice: "Jérôme",
        uploadDate: "2026-08-27T20:21:45-07:00",
      },
    },
    vertical: {
      rapoko: {
        id: "sF9Ab_4ottc",
        title: "Comment mettre un bien en vente sur Roogo Burkina | Voix Rapoko | Short",
        url: "https://youtube.com/shorts/sF9Ab_4ottc",
        format: "vertical",
        voice: "Rapoko",
      },
      jerome: {
        id: "iyeErdvzpsc",
        title: "Comment mettre un bien en vente sur Roogo Burkina | Voix Jérôme | Short",
        url: "https://youtube.com/shorts/iyeErdvzpsc",
        format: "vertical",
        voice: "Jérôme",
      },
    },
  },
};

export const tutorials: Tutorial[] = [ownerRegistration, propertySale];

export function getTutorial(slug: string) {
  return tutorials.find((tutorial) => tutorial.slug === slug);
}

export function getTutorialPath(tutorial: Pick<Tutorial, "slug">) {
  return `/tutoriels/${tutorial.slug}`;
}

export function getYouTubeThumbnail(videoId: string) {
  return `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;
}
