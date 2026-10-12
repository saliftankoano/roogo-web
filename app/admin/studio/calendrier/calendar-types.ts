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
};

export type TeamMember = { id: string; name: string; role: Role };

export type CalendarData = {
  week: string;
  posts: Post[];
  slots: string[];
  meta: { facebook: boolean; instagram: boolean; missing: string[] };
  me: { id: string; role: Role };
  team: TeamMember[];
};

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
