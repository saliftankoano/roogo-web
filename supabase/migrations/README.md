# Database migration execution ledger

This directory owns the backend's numbered SQL migrations. An executed database prerequisite is **not** a released API or mobile feature. Product behavior and remaining release gates live in [SYSTEM](../../docs/SYSTEM.md#how-do-failed-and-uncertain-customer-payments-recover) and [ROADMAP](../../docs/ROADMAP.md#now).

## Verified Roogo execution: 2026-09-09

Target: **Roogo**, project `txbxvpyftgpebgnuazaf`, production-configured Supabase database in `eu-central-1`. Only the following three migrations were authorized and executed in this task, from backend commit `a0b068249a6147c90c933bdd27aa00a8a8c62fd8`.

- [x] [070_payment_failure_notifications.sql](./070_payment_failure_notifications.sql) — committed and verified at **16:27:33 UTC**.
- [x] [071_atomic_property_lock_payments.sql](./071_atomic_property_lock_payments.sql) — committed and verified at **16:27:53 UTC**.
- [x] [072_atomic_listing_payments.sql](./072_atomic_listing_payments.sql) — committed and verified at **16:28:13 UTC**.

### Evidence

Preflight at 16:26:07 UTC found zero duplicate listing deposits, zero contradictory property/transaction links, no payment-notification records and no new payment schema. Existing tables contained 36 properties and 82 transactions.

Execution used the authenticated Supabase CLI login through the [Management API SQL endpoint](https://supabase.com/docs/reference/api/v1-run-a-query), without printing credentials. Each reviewed SQL file retained its own transaction, with session-local 4-second lock and 30-second statement timeouts. A normal Supabase migration-history table was initialized because none existed. Each version/name/SQL entry was recorded alongside its DDL in the same transaction.

Post-execution verification at **16:30:21 UTC** confirmed:

- Versions/names 070, 071 and 072 are in `supabase_migrations.schema_migrations`.
- Stored SQL matches the files byte-for-byte; an escaping defect in the initial history text was corrected using parameterized updates, without rerunning schema changes.
- All 11 installed function bodies match the reviewed SQL. All use security-definer/search-path restrictions, deny anon/authenticated execution and grant the required service-role RPC access.
- All four new indexes are valid; both listing triggers are enabled.
- Accountless delivery is supported; the consumption ledger has RLS enabled and denies anon/authenticated reads.
- Two consumed listing deposits were backfilled with zero missing or unexpected evidence links.
- Property and transaction counts remained 36 and 82 at verification.

| File | SHA-256 of executed file |
| --- | --- |
| 070 | `b7299f4f25927dcbef3be78310dcd08cdebda82868b46f3688fb1fb89781a96f` |
| 071 | `129f35a828e8fb960d8d35fe24aeae1af09398677b35d521c6c997843bad95d3` |
| 072 | `aab6440341de388445dd974ecfc5578ddaea2db69a9296ddbfd62b8253dc44ed` |

No app deployment, PawaPay collection, push or SMS was performed. No customer records were deleted or manually reconciled. [Database changelog](../../docs/CHANGELOG.md#2026-09-09).

## History and future execution rules

The eight review-era payment files were consolidated **before** their first execution; this does not authorize rewriting applied history now. Keep 070–072 unchanged and introduce a new, uniquely numbered migration for future changes. The SQL header describes the historical consolidation, not current execution status; this ledger and the database history establish execution.

Unrelated property-request migrations 068/069 were neither run nor marked executed in this task. Earlier schema already existed, but the database had no migration-history table. Absence of older history is not proof that old SQL is safe to replay, nor proof that every old migration ran. Do not use unrestricted `supabase db push`, fabricate older applied entries or run the removed review-era files. A full history baseline requires separate schema/data verification.

For another environment, confirm its project and history first, run the [payment preflights](../../docs/SYSTEM.md#how-are-payment-migrations-installed-and-recorded), apply the approved chain only if absent, then verify SQL and effects before checking off execution. If any response is uncertain, inspect history and schema before retrying. Do not reset notification uncertainty or erase listing-consumption history to roll back application code.
