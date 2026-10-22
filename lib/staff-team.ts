// Rules for giving access to the team (invitations and the journal).
// Pure helpers: the routes in app/api/admin/team and app/api/personnel call them.

import { createHash, randomBytes } from "node:crypto";
import type { AssignableStaffLevel } from "./staff-access.ts";

export const INVITATION_VALID_DAYS = 7;

/**
 * Monthly Studio caps per level, approved by Salif on 2026-10-11 and to be
 * reviewed on 2026-12-01. `video` is the video pot, `other` the pot for
 * visuals, voices, sounds and music. Amounts in USD.
 */
export const STUDIO_CAPS_BY_LEVEL: Record<
  AssignableStaffLevel,
  { video: number; other: number }
> = {
  director: { video: 3, other: 10 },
  advisor: { video: 3, other: 8 },
  assistant: { video: 1, other: 4 },
  intern: { video: 0.5, other: 2 },
};

export function normalizeInvitationEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (email.length < 3 || email.length > 254) return null;
  // One @, something on each side, a dot in the domain, no spaces.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

export function normalizeReason(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const reason = value.trim().replace(/\s+/g, " ");
  if (!reason) return null;
  return reason.slice(0, 300);
}

/** The token goes in the link; only its hash is stored. */
export function newInvitationToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("hex");
  return { token, tokenHash: hashInvitationToken(token) };
}

export function hashInvitationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function invitationExpiresAt(
  now: Date = new Date(),
  days: number = INVITATION_VALID_DAYS,
): Date {
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
}

export type InvitationState =
  | "open"
  | "accepted"
  | "revoked"
  | "expired";

export function invitationState(
  invitation: {
    accepted_at?: string | null;
    revoked_at?: string | null;
    expires_at: string;
  },
  now: Date = new Date(),
): InvitationState {
  if (invitation.accepted_at) return "accepted";
  if (invitation.revoked_at) return "revoked";
  if (new Date(invitation.expires_at).getTime() <= now.getTime()) return "expired";
  return "open";
}

export function emailMatchesInvitation(
  invitationEmail: string,
  accountEmails: readonly string[],
): boolean {
  const wanted = invitationEmail.trim().toLowerCase();
  return accountEmails.some((email) => email.trim().toLowerCase() === wanted);
}

export type StaffAccessLogAction =
  | "invite"
  | "invite_revoked"
  | "accepted"
  | "level_set"
  | "access_removed";
