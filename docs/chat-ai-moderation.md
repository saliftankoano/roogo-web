# Chat AI Moderation — Design Note (not yet implemented)

**Status:** Idea / parked. Roogo's stance for the sale-chat launch is **freedom over gatekeeping** — we do **not** block users from exchanging phone numbers or moving off-platform. The consent gate (see below) is a nudge + liability shield, not a wall. This document captures everything we'd need *if and when* we decide to add AI moderation, so we can move quickly without re-deciding the design.

## Why we're parking it (and what we want from it later)

- We intentionally give buyers and sellers freedom so they don't perceive Roogo as a gatekeeper.
- We want to **learn how users actually behave** with that freedom before constraining it.
- Moderation, when it comes, should first be **passive/observational** (measure, don't block), and only later — if the data justifies it — become **active** (warn, redact, or escalate).

## Goals

1. **Learn:** quantify how often, how early, and how users attempt to take deals off-platform (number/email/social-handle sharing).
2. **Protect:** detect scam/fraud patterns (advance-fee requests, impersonation, pressure tactics, off-platform payment requests).
3. **Support the 10%:** the chat is our evidence trail that a deal started on Roogo. Moderation signals strengthen that record.

## Phased rollout (when we build it)

### Phase A — Passive detection (measure only)
- Run a classifier over each outgoing message **after** it's sent (async, non-blocking).
- Tag messages with detected signals; **never** alter or block the message.
- Store signals for analytics. No user-visible effect.

**Signals to detect**
- Contact-info sharing: phone numbers (incl. obfuscated — "zero-seven", spaced digits, "07 . 12 . 34"), emails, WhatsApp/Telegram/Facebook handles, "call me", "appelle-moi".
- Off-platform payment requests: "Orange Money", "dépôt", "avance", account numbers.
- Scam/pressure patterns: urgency, "send money first", impersonation of Roogo staff.

**Metrics to track**
- % of conversations with ≥1 contact-share attempt, and at which message index it first occurs.
- Time-to-first-off-platform-attempt.
- Correlation between off-platform attempts and (a) deal completion, (b) disputes, (c) 10% leakage.

### Phase B — Soft nudges (still no hard block)
- When a contact-share is detected, show a gentle in-thread reminder to the *sender* ("Pour votre sécurité, gardez les échanges sur Roogo — nous ne pourrons pas vous aider en cas de problème hors plateforme.").
- Optionally surface a one-tap "Signaler" (report) affordance to the recipient.

### Phase C — Active moderation (only if data justifies)
- Redact/blur detected contact info with an explainer, or hold high-risk messages for staff review.
- Auto-escalate scam-pattern conversations to staff (reuse the "Faire intervenir Roogo" join flow).

## Technical approach

- **Where:** moderation runs server-side on the message-send path (the same backend route that persists a chat message), invoked **asynchronously** so it never adds latency to sending.
- **Model:** start with cheap, deterministic regex/heuristics for phone/email/handle detection (fast, free, explainable); layer an LLM classifier (Claude) for nuanced scam/pressure intent where regex is insufficient. See `claude-api` skill for current model IDs/pricing before implementing.
- **Localization:** detectors must handle **French + local phrasing** and number spelling ("zéro sept ...") and Moore/Dioula transliterations where relevant.
- **Privacy:** moderation reads message bodies — document this in the consent/terms. Never log full message bodies to analytics; log only derived signals + message IDs.

## Data model (when implemented)

A `message_moderation_signals` table (or JSONB column on the messages table):

```
message_moderation_signals
  id                uuid pk
  message_id        uuid fk -> messages
  conversation_id   uuid fk
  signal_type       text   -- 'contact_share' | 'offplatform_payment' | 'scam_pattern' | ...
  confidence        numeric
  detector          text   -- 'regex' | 'llm'
  detector_version  text
  detected_at       timestamptz
  action_taken      text   -- 'none' | 'nudged' | 'redacted' | 'held' | 'escalated'
```

## Open questions to resolve before building

- Do we disclose moderation explicitly in the consent terms? (Likely yes — privacy + trust.)
- Threshold for nudge vs. escalate.
- Whether staff see flagged messages by default or only on report.
- Retention period for moderation signals.

## Dependencies

- Requires the P2P chat substrate (conversations/messages, see "Roogo Sell" Phase 2) to exist first.
- Reuses the staff-join flow ("Faire intervenir Roogo") for escalation.
