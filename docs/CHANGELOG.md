# Changelog

What shipped, when. One line each, newest first. The *why* lives in
[`DECISIONS.md`](./DECISIONS.md); the *how it works* lives in
[`CONCEPTS.md`](./CONCEPTS.md).

## 2026-07-06

- Identity (KYC) verification is no longer required to post a listing — owners/agents can create rentals **and** sales without it; it's now surfaced as an optional, dismissible "get the badge" nudge in the add-property wizard. Staff still moderate every listing before it goes live. ([why](./DECISIONS.md#identity-kyc-becomes-optional--2026-07-06))
- **Roogo Sell** shipped as a broker/mandate model: seller↔Roogo and buyer↔Roogo per-property chat (no buyer↔seller contact), two-price spread instead of a 10% commission, in-app signed mandate + exclusivity, notary-meeting scheduling, and a `/admin/sale-chat` staff console. ([why](./DECISIONS.md#roogo-sell--broker-model-not-marketplace--2026-07-06), [how](./CONCEPTS.md#how-does-roogo-sell-the-broker-model-work))
