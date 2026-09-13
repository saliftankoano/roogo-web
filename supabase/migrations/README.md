# Database migration execution ledger

This directory owns the backend's numbered SQL migrations. An executed database prerequisite is **not** a released API or mobile feature. Product behavior and remaining release gates live in [SYSTEM](../../docs/SYSTEM.md#how-do-failed-and-uncertain-customer-payments-recover) and [ROADMAP](../../docs/ROADMAP.md#now).

## Current Roogo execution record — 2026-09-13 UTC

Salif explicitly confirmed in this conversation: **all migrations 001–073 have run on Roogo**. He separately reported running 073 before merging the image PRs. All 73 files therefore end in `_executed.sql`. This is an operator-confirmed record; this documentation task did not independently query the database, execute SQL or change migration history. The verified 070–072 evidence from 2026-09-09 remains below.

Renames retain numeric versions and every SQL byte, including historical header comments. Repository links/tests use the new filenames; the names/SQL recorded in database history remain unchanged. The suffix means executed on Roogo, not executed in every environment. It is not a CLI history baseline or permission to replay these files. Future schema changes require a new version, initially without the suffix; add `_executed` after recording confirmed execution.

### Confirmed files

- [x] [001_consolidated_schema_updates_executed.sql](./001_consolidated_schema_updates_executed.sql) — operator-confirmed 2026-09-13.
- [x] [002_create_listing_config_executed.sql](./002_create_listing_config_executed.sql) — operator-confirmed 2026-09-13.
- [x] [003_open_house_directions_executed.sql](./003_open_house_directions_executed.sql) — operator-confirmed 2026-09-13.
- [x] [004_spontaneous_applications_executed.sql](./004_spontaneous_applications_executed.sql) — operator-confirmed 2026-09-13.
- [x] [005_career_applications_rename_executed.sql](./005_career_applications_rename_executed.sql) — operator-confirmed 2026-09-13.
- [x] [006_rental_lifecycle_executed.sql](./006_rental_lifecycle_executed.sql) — operator-confirmed 2026-09-13.
- [x] [007_is_test_on_properties_executed.sql](./007_is_test_on_properties_executed.sql) — operator-confirmed 2026-09-13.
- [x] [008_celibatorium_property_type_executed.sql](./008_celibatorium_property_type_executed.sql) — operator-confirmed 2026-09-13.
- [x] [009_property_details_view_refresh_executed.sql](./009_property_details_view_refresh_executed.sql) — operator-confirmed 2026-09-13.
- [x] [010_property_cascade_deletes_executed.sql](./010_property_cascade_deletes_executed.sql) — operator-confirmed 2026-09-13.
- [x] [011_remove_property_title_executed.sql](./011_remove_property_title_executed.sql) — operator-confirmed 2026-09-13.
- [x] [012_daily_rental_availability_executed.sql](./012_daily_rental_availability_executed.sql) — operator-confirmed 2026-09-13.
- [x] [013_property_view_tracking_executed.sql](./013_property_view_tracking_executed.sql) — operator-confirmed 2026-09-13.
- [x] [014_user_property_cascade_cleanup_executed.sql](./014_user_property_cascade_cleanup_executed.sql) — operator-confirmed 2026-09-13.
- [x] [015_upfront_rent_months_executed.sql](./015_upfront_rent_months_executed.sql) — operator-confirmed 2026-09-13.
- [x] [016_owner_wallet_payouts_executed.sql](./016_owner_wallet_payouts_executed.sql) — operator-confirmed 2026-09-13.
- [x] [017_daily_deposit_escrow_executed.sql](./017_daily_deposit_escrow_executed.sql) — operator-confirmed 2026-09-13.
- [x] [018_add_rent_payment_transaction_type_executed.sql](./018_add_rent_payment_transaction_type_executed.sql) — operator-confirmed 2026-09-13.
- [x] [019_add_property_virtual_tour_executed.sql](./019_add_property_virtual_tour_executed.sql) — operator-confirmed 2026-09-13.
- [x] [020_rls_security_hardening_executed.sql](./020_rls_security_hardening_executed.sql) — operator-confirmed 2026-09-13.
- [x] [021_daily_booking_monetization_executed.sql](./021_daily_booking_monetization_executed.sql) — operator-confirmed 2026-09-13.
- [x] [022_daily_owner_commission_config_executed.sql](./022_daily_owner_commission_config_executed.sql) — operator-confirmed 2026-09-13.
- [x] [023_user_signup_location_executed.sql](./023_user_signup_location_executed.sql) — operator-confirmed 2026-09-13.
- [x] [024_referral_program_executed.sql](./024_referral_program_executed.sql) — operator-confirmed 2026-09-13.
- [x] [025_identity_verifications_executed.sql](./025_identity_verifications_executed.sql) — operator-confirmed 2026-09-13.
- [x] [026_notification_deliveries_executed.sql](./026_notification_deliveries_executed.sql) — operator-confirmed 2026-09-13.
- [x] [027_user_signup_device_snapshot_executed.sql](./027_user_signup_device_snapshot_executed.sql) — operator-confirmed 2026-09-13.
- [x] [028_daily_property_metadata_executed.sql](./028_daily_property_metadata_executed.sql) — operator-confirmed 2026-09-13.
- [x] [029_property_translations_executed.sql](./029_property_translations_executed.sql) — operator-confirmed 2026-09-13.
- [x] [030_talent_mvp_executed.sql](./030_talent_mvp_executed.sql) — operator-confirmed 2026-09-13.
- [x] [031_property_pending_edits_executed.sql](./031_property_pending_edits_executed.sql) — operator-confirmed 2026-09-13.
- [x] [032_unescape_html_entities_in_text_fields_executed.sql](./032_unescape_html_entities_in_text_fields_executed.sql) — operator-confirmed 2026-09-13.
- [x] [033_pending_edits_fixes_executed.sql](./033_pending_edits_fixes_executed.sql) — operator-confirmed 2026-09-13.
- [x] [034_monthly_free_listing_success_fee_executed.sql](./034_monthly_free_listing_success_fee_executed.sql) — operator-confirmed 2026-09-13.
- [x] [035_property_videos_executed.sql](./035_property_videos_executed.sql) — operator-confirmed 2026-09-13.
- [x] [036_support_chat_executed.sql](./036_support_chat_executed.sql) — operator-confirmed 2026-09-13.
- [x] [037_premium_photo_limit_20_executed.sql](./037_premium_photo_limit_20_executed.sql) — operator-confirmed 2026-09-13.
- [x] [038_daily_request_to_book_executed.sql](./038_daily_request_to_book_executed.sql) — operator-confirmed 2026-09-13.
- [x] [039_sale_listings_executed.sql](./039_sale_listings_executed.sql) — operator-confirmed 2026-09-13.
- [x] [040_sale_chat_executed.sql](./040_sale_chat_executed.sql) — operator-confirmed 2026-09-13.
- [x] [041_sale_visit_requests_executed.sql](./041_sale_visit_requests_executed.sql) — operator-confirmed 2026-09-13.
- [x] [042_property_mandates_executed.sql](./042_property_mandates_executed.sql) — operator-confirmed 2026-09-13.
- [x] [043_notary_meetings_executed.sql](./043_notary_meetings_executed.sql) — operator-confirmed 2026-09-13.
- [x] [044_reconcile_sale_broker_executed.sql](./044_reconcile_sale_broker_executed.sql) — operator-confirmed 2026-09-13.
- [x] [045_visites_3d_bookings_executed.sql](./045_visites_3d_bookings_executed.sql) — operator-confirmed 2026-09-13.
- [x] [046_sale_frequence_nullable_executed.sql](./046_sale_frequence_nullable_executed.sql) — operator-confirmed 2026-09-13.
- [x] [047_sale_chat_voice_executed.sql](./047_sale_chat_voice_executed.sql) — operator-confirmed 2026-09-13.
- [x] [048_sale_chat_documents_executed.sql](./048_sale_chat_documents_executed.sql) — operator-confirmed 2026-09-13.
- [x] [049_sale_chat_attachment_mimes_executed.sql](./049_sale_chat_attachment_mimes_executed.sql) — operator-confirmed 2026-09-13.
- [x] [050_sale_commission_model_executed.sql](./050_sale_commission_model_executed.sql) — operator-confirmed 2026-09-13.
- [x] [051_hotel_user_type_executed.sql](./051_hotel_user_type_executed.sql) — operator-confirmed 2026-09-13.
- [x] [052_hotels_and_members_executed.sql](./052_hotels_and_members_executed.sql) — operator-confirmed 2026-09-13.
- [x] [053_room_types_executed.sql](./053_room_types_executed.sql) — operator-confirmed 2026-09-13.
- [x] [054_hotel_commission_and_booking_code_executed.sql](./054_hotel_commission_and_booking_code_executed.sql) — operator-confirmed 2026-09-13.
- [x] [055_events_prep_executed.sql](./055_events_prep_executed.sql) — operator-confirmed 2026-09-13.
- [x] [056_property_slugs_executed.sql](./056_property_slugs_executed.sql) — operator-confirmed 2026-09-13.
- [x] [057_clean_quartiers_reslug_executed.sql](./057_clean_quartiers_reslug_executed.sql) — operator-confirmed 2026-09-13.
- [x] [058_direct_sale_intakes_executed.sql](./058_direct_sale_intakes_executed.sql) — operator-confirmed 2026-09-13.
- [x] [059_offline_rental_imports_executed.sql](./059_offline_rental_imports_executed.sql) — operator-confirmed 2026-09-13.
- [x] [060_ownership_document_upload_formats_executed.sql](./060_ownership_document_upload_formats_executed.sql) — operator-confirmed 2026-09-13.
- [x] [061_advertiser_profiles_executed.sql](./061_advertiser_profiles_executed.sql) — operator-confirmed 2026-09-13.
- [x] [062_remove_direct_advertising_staff_writes_executed.sql](./062_remove_direct_advertising_staff_writes_executed.sql) — operator-confirmed 2026-09-13.
- [x] [063_hotel_operations_executed.sql](./063_hotel_operations_executed.sql) — operator-confirmed 2026-09-13.
- [x] [064_hotel_chat_and_rccm_verification_executed.sql](./064_hotel_chat_and_rccm_verification_executed.sql) — operator-confirmed 2026-09-13.
- [x] [065_hotel_events_and_groups_executed.sql](./065_hotel_events_and_groups_executed.sql) — operator-confirmed 2026-09-13.
- [x] [066_waive_success_fee_for_owner_sourced_renters_executed.sql](./066_waive_success_fee_for_owner_sourced_renters_executed.sql) — operator-confirmed 2026-09-13.
- [x] [067_default_on_rent_collection_executed.sql](./067_default_on_rent_collection_executed.sql) — operator-confirmed 2026-09-13.
- [x] [068_property_requests_executed.sql](./068_property_requests_executed.sql) — operator-confirmed 2026-09-13.
- [x] [069_property_request_deletion_safety_executed.sql](./069_property_request_deletion_safety_executed.sql) — operator-confirmed 2026-09-13.
- [x] [070_payment_failure_notifications_executed.sql](./070_payment_failure_notifications_executed.sql) — independently verified 2026-09-09.
- [x] [071_atomic_property_lock_payments_executed.sql](./071_atomic_property_lock_payments_executed.sql) — independently verified 2026-09-09.
- [x] [072_atomic_listing_payments_executed.sql](./072_atomic_listing_payments_executed.sql) — independently verified 2026-09-09.
- [x] [073_unique_content_addressed_listing_photos_executed.sql](./073_unique_content_addressed_listing_photos_executed.sql) — operator-confirmed 2026-09-13.

## Verified Roogo execution: 2026-09-09

Target: **Roogo**, project `txbxvpyftgpebgnuazaf`, production-configured Supabase database in `eu-central-1`. Only the following three migrations were authorized and executed in this task, from backend commit `a0b068249a6147c90c933bdd27aa00a8a8c62fd8`.

- [x] [070_payment_failure_notifications_executed.sql](./070_payment_failure_notifications_executed.sql) — committed and verified at **16:27:33 UTC**.
- [x] [071_atomic_property_lock_payments_executed.sql](./071_atomic_property_lock_payments_executed.sql) — committed and verified at **16:27:53 UTC**.
- [x] [072_atomic_listing_payments_executed.sql](./072_atomic_listing_payments_executed.sql) — committed and verified at **16:28:13 UTC**.

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

Unrelated property-request migrations 068/069 were neither run nor marked executed in this task. Earlier schema already existed, but the database had no migration-history table. At that time, absence of older history was not proof that old SQL was safe to replay or that every old migration ran. The newer operator confirmation above establishes the current reported status, without independently verifying or populating that older history. Do not use unrestricted `supabase db push`, fabricate older applied entries or run the removed review-era files. A full history baseline requires separate schema/data verification.

For another environment, confirm its project and history first, run the [payment preflights](../../docs/SYSTEM.md#how-are-payment-migrations-installed-and-recorded), apply the approved chain only if absent, then verify SQL and effects before checking off execution. If any response is uncertain, inspect history and schema before retrying. Do not reset notification uncertainty or erase listing-consumption history to roll back application code.
