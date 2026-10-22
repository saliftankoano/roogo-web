import type { TikTokPublishInfo } from "@/lib/social/tiktok-publish";
import type {
  CadenceStep,
  MediaType,
  Network,
  PublicationResults,
  PublicationStatus,
  Role,
} from "@/lib/studio/publishing";

export type Post = {
  id: string;
  propertyId: string | null;
  property: { title: string; place: string; image: string | null } | null;
  artifactId: string | null;
  artifact: { kind: string; title: string; url: string | null } | null;
  title: string;
  cadenceStep: CadenceStep | null;
  visitDate: string | null;
  mediaType: MediaType;
  photoUrls: string[];
  caption: string;
  notes: string;
  networks: Network[];
  scheduledAt: string;
  assigneeId: string | null;
  assigneeName: string | null;
  status: PublicationStatus;
  approvedByName: string | null;
  approvedAt: string | null;
  publishing: boolean;
  publishedAt: string | null;
  results: PublicationResults;
  lastError: string | null;
  createdById: string | null;
  hashtags: string[];
  captionModel: string | null;
  captionGeneratedAt: string | null;
  captionEditedByName: string | null;
  submittedByName: string | null;
  submittedAt: string | null;
  returnedAt: string | null;
  returnedByName: string | null;
  reviewComment: string | null;
  reviewTags: string[];
};

export type TeamMember = { id: string; name: string; role: Role };

export type CalendarData = {
  week: string;
  posts: Post[];
  slots: string[];
  meta: { facebook: boolean; instagram: boolean; missing: string[] };
  /** TikTok publishing (feature flag, lib/social/tiktok-token-server.ts). */
  tiktok?: TikTokPublishInfo | null;
  me: { id: string; role: Role };
  team: TeamMember[];
  /** Founder only: every post waiting for validation, whatever the week. */
  waiting: Post[];
};

/** Design tones (2026-10-13) for the calendar cards and the Studio pill. */
export const TONE = {
  grey: { bg: "#EEEBE7", fg: "#4A4540", border: "#DCD5CD" },
  amber: { bg: "#FCEFD4", fg: "#6E4300", border: "#E9A23B" },
  blue: { bg: "#E1EFF8", fg: "#1F5F80", border: "#B9D8EC" },
  green: { bg: "#E3F1E6", fg: "#245C33", border: "#B7DABF" },
  red: { bg: "#FBE3DF", fg: "#8E2A1E", border: "#F0B8AE" },
} as const;

/** How a post reads on the calendar: "À valider", "Validé, part seul"... */
export function calendarStatus(post: Pick<Post, "status" | "returnedAt" | "publishing">): { label: string; tone: (typeof TONE)[keyof typeof TONE] } {
  if (post.publishing) return { label: "Publication…", tone: TONE.blue };
  switch (post.status) {
    case "a_faire":
      return post.returnedAt ? { label: "À corriger", tone: TONE.red } : { label: "À faire", tone: TONE.grey };
    case "a_valider":
      return { label: "À valider", tone: TONE.amber };
    case "valide":
      return { label: "Validé, part seul", tone: TONE.blue };
    case "publie":
      return { label: "Publié", tone: TONE.green };
    case "echec":
      return { label: "Échec", tone: TONE.red };
  }
}

export type MediaOptions = {
  artifacts: Array<{ id: string; kind: string; title: string; createdAt: string; url: string | null }>;
  photos: string[];
};

/** Status chip colours: light, readable, one hue per step. */
export const STATUS_TONE: Record<PublicationStatus, string> = {
  a_faire: "bg-neutral-100 text-neutral-700 ring-neutral-200",
  a_valider: "bg-amber-50 text-amber-800 ring-amber-200",
  valide: "bg-sky-50 text-sky-800 ring-sky-200",
  publie: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  echec: "bg-red-50 text-red-700 ring-red-200",
};

export async function readError(res: Response): Promise<string> {
  const data = (await res.json().catch(() => null)) as { error?: string } | null;
  return data?.error ?? `Erreur ${res.status}`;
}
