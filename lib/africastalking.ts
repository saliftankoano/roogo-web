// Africa's Talking SMS helper — used by the Visites 3D booking API.
// Docs: https://developers.africastalking.com/docs/sms/sending

import { smsRecipientOutcome } from "@/lib/africastalking-response";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const AfricasTalking = require("africastalking");

type ATClient = {
  SMS: {
    send(opts: {
      to: string | string[];
      message: string;
      from?: string;
    }): Promise<unknown>;
  };
};

let _sms: ATClient["SMS"] | null = null;

function client(): ATClient["SMS"] {
  if (_sms) return _sms;
  const username = process.env.AT_USERNAME;
  const apiKey = process.env.AT_API_KEY;
  if (!username || !apiKey) {
    throw new Error(
      "Africa's Talking env vars manquantes (AT_USERNAME / AT_API_KEY).",
    );
  }

  const isProd = process.env.NODE_ENV === "production";
  const isSandboxUser = username.toLowerCase() === "sandbox";

  // Guard against the two common foot-guns. We warn rather than throw so that
  // staging / preview deployments can still opt into either mode explicitly.
  if (isProd && isSandboxUser) {
    console.warn(
      "[africastalking] NODE_ENV=production mais AT_USERNAME=sandbox — aucun vrai SMS ne sera envoyé.",
    );
  } else if (!isProd && !isSandboxUser) {
    console.warn(
      "[africastalking] NODE_ENV != production mais username live — des SMS RÉELS seront envoyés et facturés.",
    );
  }
  console.info(
    `[africastalking] SMS mode: ${isSandboxUser ? "sandbox" : "live"} (username=${username})`,
  );

  const at = AfricasTalking({ username, apiKey }) as ATClient;
  _sms = at.SMS;
  return _sms;
}

async function send(to: string, message: string): Promise<boolean> {
  return (await sendTransactionalSmsWithResult(to, message)) === "accepted";
}

export async function sendTransactionalSmsWithResult(
  to: string,
  message: string,
): Promise<"accepted" | "rejected" | "unknown"> {
  const from = process.env.AT_SENDER_ID || undefined;
  let sms: ATClient["SMS"];
  try {
    sms = client();
  } catch (err) {
    console.error("[africastalking] client unavailable", err);
    return "rejected"; // No request was sent.
  }
  try {
    const response = await sms.send({ to, message, from });
    const outcome = smsRecipientOutcome(response, to);
    if (outcome !== "accepted") {
      console.error("[africastalking] recipient was not accepted", {
        phoneSuffix: to.replace(/\D/g, "").slice(-4),
      });
    }
    return outcome;
  } catch (err) {
    // We don't want an SMS provider hiccup to fail a booking write — log and continue.
    console.error("[africastalking] send failed", err);
    return "unknown";
  }
}

export async function sendTransactionalSms(
  phone: string,
  message: string,
): Promise<boolean> {
  return send(phone, message);
}

export function customerConfirmationMessage(input: {
  date: string;
  slot: string;
}): string {
  return `Roogo a confirme votre visite 3D le ${input.date} a ${input.slot}. Nous vous appellerons la veille pour finaliser l'acces au bien. Merci !`;
}

export function teamNotificationMessage(input: {
  name: string;
  company?: string | null;
  phone: string;
  date: string;
  slot: string;
  address: string;
  room_count: number;
  total_amount: number;
}): string {
  const who = input.company ? `${input.name} (${input.company})` : input.name;
  const tarif = `${input.total_amount.toLocaleString("fr-FR")} FCFA · ${input.room_count}p`;
  return `Nouvelle reservation 3D: ${who} / ${input.phone} / ${input.date} ${input.slot} / ${input.address} / ${tarif}`;
}

export async function sendCustomerConfirmation(
  phone: string,
  date: string,
  slot: string,
): Promise<boolean> {
  return send(phone, customerConfirmationMessage({ date, slot }));
}

export async function sendTeamNotification(payload: {
  name: string;
  company?: string | null;
  phone: string;
  date: string;
  slot: string;
  address: string;
  room_count: number;
  total_amount: number;
}): Promise<boolean> {
  const to = process.env.TEAM_PHONE;
  if (!to) return false;
  return send(to, teamNotificationMessage(payload));
}
