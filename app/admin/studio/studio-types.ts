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
  updatedAt: string;
  author: string | null;
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

export type Estimate = {
  spokenCharacters: number;
  maxCharacters: number;
  tooLong: boolean;
  estimateUsd: number;
  capUsd: number;
  usedUsd: number;
  remainingUsd: number;
  fcfaPerUsd: number;
};

export const FIRST_DRAFT_REQUEST = "Écris un script de voix off pour ce bien.";
