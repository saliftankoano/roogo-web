import { PostHog } from "posthog-node";

type PostHogPrimitive = string | number | boolean | null;
type PostHogPropertyValue =
  | PostHogPrimitive
  | PostHogPrimitive[]
  | { [key: string]: PostHogPrimitive | PostHogPrimitive[] };

export type PostHogProperties = Record<string, PostHogPropertyValue>;

let posthogInstance: PostHog | null = null;

function createPostHogClient(): PostHog | null {
  const apiKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;

  if (!apiKey) {
    return null;
  }

  return new PostHog(apiKey, {
    host,
  });
}

export function getPostHogServer(): PostHog | null {
  if (!posthogInstance) {
    posthogInstance = createPostHogClient();
  }

  return posthogInstance;
}

export async function identifyServerUser(
  distinctId: string,
  properties: PostHogProperties,
): Promise<void> {
  const posthog = createPostHogClient();

  if (!posthog) {
    return;
  }

  posthog.identify({
    distinctId,
    properties,
  });

  await posthog.shutdown();
}

export async function captureServerEvent(
  distinctId: string,
  event: string,
  properties?: PostHogProperties,
): Promise<void> {
  const posthog = createPostHogClient();

  if (!posthog) {
    return;
  }

  posthog.capture({
    distinctId,
    event,
    properties,
  });

  await posthog.shutdown();
}
