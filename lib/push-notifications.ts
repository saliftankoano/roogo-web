import { getSupabaseClient } from "./user-sync";
import { clerkClient } from "@clerk/nextjs/server";

export interface PushNotificationPayload {
  to: string | string[];
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: "default" | null;
  priority?: "default" | "normal" | "high";
  badge?: number;
}

export type NotificationType = "viewingRequests" | "messages" | "payments";

interface OnboardingData {
  notifications?: Partial<Record<NotificationType, boolean>>;
}

/**
 * Sends a push notification to specific Expo push tokens
 */
export async function sendExpoPushNotifications(
  payloads: PushNotificationPayload | PushNotificationPayload[],
) {
  const finalPayloads = Array.isArray(payloads) ? payloads : [payloads];

  try {
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(finalPayloads),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Expo Push API error: ${response.status}`, errorText);
      return false;
    }

    const result = await response.json();
    console.log("Expo Push API response:", JSON.stringify(result, null, 2));
    return true;
  } catch (error) {
    console.error("Failed to send Expo push notifications:", error);
    return false;
  }
}

/**
 * Checks if user has enabled notifications for a specific type
 */
async function checkNotificationPreference(
  clerkId: string,
  notificationType: NotificationType,
): Promise<boolean> {
  try {
    const client = await clerkClient();
    const user = await client.users.getUser(clerkId);

    const onboardingData = user.publicMetadata?.onboardingData as
      | OnboardingData
      | undefined;
    const preferences = onboardingData?.notifications;

    // If no preferences set, default to enabled (opt-out model)
    if (!preferences || typeof preferences !== "object") {
      return true;
    }

    // Check specific notification type preference
    const isEnabled = preferences[notificationType];
    return isEnabled !== false; // Default to true if not explicitly set to false
  } catch (error) {
    console.error("Error checking notification preference:", error);
    // On error, default to sending notification (fail-open)
    return true;
  }
}

/**
 * Sends a notification to all registered tokens for a specific user
 * Checks user's notification preferences before sending
 */
export async function notifyUser(
  userId: string,
  notificationType: NotificationType,
  title: string,
  body: string,
  data?: Record<string, unknown>,
) {
  const supabase = getSupabaseClient();

  // 1. Get user's Clerk ID from Supabase
  const { data: userRecord, error: userError } = await supabase
    .from("users")
    .select("clerk_id")
    .eq("id", userId)
    .single();

  if (userError || !userRecord?.clerk_id) {
    console.error("Error fetching user clerk_id:", userError);
    return false;
  }

  // 2. Check notification preferences
  const isEnabled = await checkNotificationPreference(
    userRecord.clerk_id,
    notificationType,
  );

  if (!isEnabled) {
    console.log(
      `Notification skipped for user ${userId}: ${notificationType} disabled in preferences`,
    );
    return false;
  }

  // 3. Get tokens for user
  const { data: tokens, error } = await supabase
    .from("user_push_tokens")
    .select("expo_push_token")
    .eq("user_id", userId);

  if (error || !tokens || tokens.length === 0) {
    if (error) console.error("Error fetching user tokens:", error);
    return false;
  }

  // 4. Prepare payloads
  const pushTokens = tokens.map((t) => t.expo_push_token);

  // Expo allows multiple tokens in one payload if the content is the same
  const payload: PushNotificationPayload = {
    to: pushTokens,
    title,
    body,
    data,
    sound: "default",
  };

  // 5. Send
  return sendExpoPushNotifications(payload);
}
