import { getSupabaseClient } from "./user-sync";

export interface PushNotificationPayload {
  to: string | string[];
  title: string;
  body: string;
  data?: Record<string, any>;
  sound?: "default" | null;
  priority?: "default" | "normal" | "high";
  badge?: number;
}

/**
 * Sends a push notification to specific Expo push tokens
 */
export async function sendExpoPushNotifications(
  payloads: PushNotificationPayload | PushNotificationPayload[]
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
 * Sends a notification to all registered tokens for a specific user
 */
export async function notifyUser(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, any>
) {
  const supabase = getSupabaseClient();

  // 1. Get tokens for user
  const { data: tokens, error } = await supabase
    .from("user_push_tokens")
    .select("expo_push_token")
    .eq("user_id", userId);

  if (error || !tokens || tokens.length === 0) {
    if (error) console.error("Error fetching user tokens:", error);
    return false;
  }

  // 2. Prepare payloads
  const pushTokens = tokens.map((t) => t.expo_push_token);
  
  // Expo allows multiple tokens in one payload if the content is the same
  const payload: PushNotificationPayload = {
    to: pushTokens,
    title,
    body,
    data,
    sound: "default",
  };

  // 3. Send
  return sendExpoPushNotifications(payload);
}

