export type PropertySummary = {
  id: string;
  title: string;
  offer: string;
  place: string;
  price: string;
  image: string | null;
  photos: string[];
  live: boolean;
};

export type ConversationItem = {
  id: string;
  title: string;
  propertyId: string | null;
  voiceKey: string | null;
  createdAt: string;
  updatedAt: string;
  /** Who started the project. */
  author: string | null;
  isMine: boolean;
  /** "video" arrives with the template render. */
  kind: "chat" | "visual" | "video";
  /** Every filter the project matches (a property project can hold visuals too). */
  contains: Array<"chat" | "visual" | "video">;
  /** The latest result, for the history line ("Script v3", "Voix off (Sandrine) prête"). */
  summary: string | null;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt?: string;
};

export type Artifact = {
  id: string;
  kind: "script" | "voiceover" | "image" | "captions";
  title: string;
  text: string;
  voiceKey: string | null;
  pinned: boolean;
  createdAt: string;
  meta: Record<string, unknown>;
  url: string | null;
  downloadUrl: string | null;
};

export type JobTool = "poster" | "greeting" | "cutout" | "captions";

export type RunningJob = { id: string; tool: JobTool | null };

export type PosterCheckField = {
  key: "price" | "phone" | "place" | "line";
  label: string;
  expected: string;
  found: boolean;
};

export type ConversationDetail = {
  conversation: {
    id: string;
    title: string;
    propertyId: string | null;
    voiceKey: string | null;
    isMine: boolean;
  };
  property: PropertySummary | null;
  messages: ChatMessage[];
  artifacts: Artifact[];
  jobs: RunningJob[];
};

export type SpeechReplacement = { term: string; spoken: string; count: number };

export type Budget = {
  capUsd: number;
  usedUsd: number;
  remainingUsd: number;
  fcfaPerUsd: number;
};

export type Estimate = {
  spokenCharacters: number;
  /** Exactly what is sent to the voice, after the glossary. */
  spokenText: string;
  replacements: SpeechReplacement[];
  maxCharacters: number;
  tooLong: boolean;
  estimateUsd: number;
  capUsd: number;
  usedUsd: number;
  remainingUsd: number;
  fcfaPerUsd: number;
};

export const FIRST_DRAFT_REQUEST = "Écris un script de voix off pour ce bien.";
