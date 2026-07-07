# Changelog

What shipped, when. One line each, newest first. The *why* lives in
[`DECISIONS.md`](./DECISIONS.md); the *how it works* lives in
[`CONCEPTS.md`](./CONCEPTS.md).

## 2026-07-06

- **Visites 3D hardening** after a multi-agent code review confirmed 7 defects: availability endpoint returned empty for everyone (anon key vs `security_invoker` view — verified against the live DB, switched to service role); payment completion unified into one atomic `finalizeVisit3dCompletion()` (kills double-SMS race, missing analytics, and the instant-COMPLETED no-SMS gap); PawaPay webhook no longer ACKs transient DB errors as "not found" (500 → retry) and can't regress a settled booking on redelivery; calendar can't select dates beyond the fetched availability window; the 15 000 FCFA price now derives from a single constant everywhere. Also fixed: Kuula collection embeds (embed.js doesn't render collections — plain iframe now). ([how](./CONCEPTS.md#how-do-visites-3d-payment-completions-stay-exactly-once))
- **Visites 3D** migrated from the Kazedra site to Roogo: public `/visites-3d` page (marketing + self-serve calendar booking + PawaPay Mobile Money payment + SMS confirmations), new single price of **15 000 FCFA / pièce** (old 10k/7.5k dual pricing retired), booking APIs under `/api/visites-3d/*`, shared PawaPay webhook now routes unknown depositIds to the `bookings` table. Kazedra deleted its 3D content and 308-redirects to us. ([why](./DECISIONS.md#visites-3d-move-under-the-roogo-brand--2026-07-06), how: [visites-3d.md](./visites-3d.md))
- Identity (KYC) verification is no longer required to post a listing — owners/agents can create rentals **and** sales without it; it's now surfaced as an optional, dismissible "get the badge" nudge in the add-property wizard. Staff still moderate every listing before it goes live. ([why](./DECISIONS.md#identity-kyc-becomes-optional--2026-07-06))
- **Roogo Sell** shipped as a broker/mandate model: seller↔Roogo and buyer↔Roogo per-property chat (no buyer↔seller contact), two-price spread instead of a 10% commission, in-app signed mandate + exclusivity, notary-meeting scheduling, and a `/admin/sale-chat` staff console. ([why](./DECISIONS.md#roogo-sell--broker-model-not-marketplace--2026-07-06), [how](./CONCEPTS.md#how-does-roogo-sell-the-broker-model-work))
