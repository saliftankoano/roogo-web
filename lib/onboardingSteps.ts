import { type DriveStep } from "driver.js";

export const staffOnboardingSteps: DriveStep[] = [
  {
    element: "body",
    popover: {
      title: "Bienvenue",
      description:
        "Bienvenue dans votre espace d'administration Roogo ! Laissez-nous vous montrer les outils à votre disposition.",
      side: "over",
      align: "center",
    },
  },
  {
    element: '[data-id="admin-nav-annonces"]',
    popover: {
      description:
        "Ici, vous pouvez gérer toutes les annonces de la plateforme. Approuvez, modifiez ou supprimez les biens.",
      side: "bottom",
      align: "center",
    },
  },
  {
    element: '[data-id="admin-nav-agents"]',
    popover: {
      description:
        "Gérez les comptes des agents immobiliers et vérifiez leurs informations professionnelles.",
      side: "bottom",
      align: "center",
    },
  },
  {
    element: '[data-id="admin-nav-analytiques"]',
    popover: {
      description:
        "Suivez les performances globales de la plateforme : vues, clics et engagement.",
      side: "bottom",
      align: "center",
    },
  },
  {
    element: '[data-id="staff-menu"]',
    popover: {
      description:
        "Accédez rapidement a vos outils depuis n'importe quelle page via ce menu.",
      side: "bottom",
      align: "center",
    },
  },
];

export const founderOnboardingSteps: DriveStep[] = [
  ...staffOnboardingSteps,
  {
    element: '[data-id="admin-nav-finances"]',
    popover: {
      description:
        "En tant que fondateur, vous avez accès au suivi des transactions et des revenus de la plateforme.",
      side: "bottom",
      align: "center",
    },
  },
  {
    element: '[data-id="admin-nav-paramètres"]',
    popover: {
      description:
        "Configurez les tarifs, les durées de boost et les paramètres globaux de Roogo.",
      side: "bottom",
      align: "center",
    },
  },
];

export const publicOnboardingSteps: DriveStep[] = [
  {
    element: '[data-id="nav-proprietes"]',
    popover: {
      description:
        "Explorez notre catalogue de biens immobiliers avec des filtres avancés.",
      side: "bottom",
      align: "center",
    },
  },
  {
    element: '[data-id="nav-publier"]',
    popover: {
      description:
        "Vous avez un bien à louer ? Publiez votre annonce en quelques minutes.",
      side: "bottom",
      align: "center",
    },
  },
];
