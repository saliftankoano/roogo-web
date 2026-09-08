# ROO-20 — Property requests

Logbook: [Decisions](./DECISIONS.md) · [System](./SYSTEM.md) · [Changelog](./CHANGELOG.md) · [Domain](./DOMAIN.md) · [Roadmap](./ROADMAP.md)

Issue: https://linear.app/roogo-burkina/issue/ROO-20/roogo-call-for-properties-with-agents-and-web-dashboard-improvement

Mobile counterpart: `roogo`, branch `feat/roo-20-property-requests`.

## Operations workflow

Open **Opérations → Appels à biens** (`/admin/property-requests`). Create a draft with the customer's criteria, budget, location and contact. The client name, contact and internal notes are restricted to staff/founders. Enter the agent commission percentage and payment conditions explicitly; no rate is assumed. The commission basis is the final sale price for purchases or one month of rent for monthly rentals.

Publish the call by selecting **Ouvert**. Owners and agents can respond from the mobile **Demandes** tab. Each account can submit one property per call. A retry returns that original submission, including after closure, without overwriting its details. Responses contain price, area, bedrooms, bathrooms, precise location, a contact number, available land-document types and optional private photos/PDFs. Unavailable documents can be declared honestly; declaring or uploading a document does not verify ownership or publish a property.

Review all respondents from the call, call or contact them through the displayed profile links, and record internal follow-up notes. **Retenue** confirms an agent's original commission conditions on behalf of Roogo. The confirmed commitment can be printed/saved as PDF; the agent can see and share the saved terms in mobile. Owner responses do not receive an agent commission. This records a commission commitment, not an executed payment or electronic signature.

Select an existing announcement belonging to the respondent to connect the response to the listing workflow. **Bien publié** requires a live announcement matching the response’s saved transaction basis; daily rentals cannot fulfill monthly requests. Draft follow-up edits survive saves, filters, and refreshes. Conflicting staff updates return 409 so the operator can inspect the saved version before keeping their draft. Listing creation and ownership verification continue through the existing announcement tools. Close the call when no further proposals are needed; existing respondents retain their submission and follow-up status.

When a call changes during editing, the editor retrieves the latest version and preserves the local draft. Unrelated staff changes (including closure) are retained. If both people edited the same field, the operator must choose the saved value or their draft before saving. Refreshing repeatedly does not dismiss unresolved conflicts, and a failed reload preserves the draft for retry. Each open editor has its own session identity. Opening another editor is disabled while saving; browsing calls remains available, and save completion preserves the current browsing selection. Failed saves retain the draft and release the controls for retry. Reopening the same call or clicking Modifier again does not let an earlier completion reset the active draft.

## Release order

1. Apply `supabase/migrations/068_property_requests.sql` and then `069_property_request_deletion_safety.sql` to the target Supabase database through the normal migration process. These create private request/response tables, a service-role-only submission function, the private `property-request-files` storage bucket, and deletion-safe references with a private-file cleanup queue.
2. Deploy this web/backend branch.
3. Release the mobile counterpart. No new environment variables are required.
4. Staff must set the actual approved commission rate and payment terms before publishing each call.

Both migrations have been executed against an isolated PostgreSQL-compatible PGlite test database. They have **not** been applied to a shared/staging/production database by this task.

Deleting a linked listing returns a published response to **Retenue**, records the deletion, and preserves its confirmed commission. Deleting a respondent account clears contact details, precise addresses, freeform submission/follow-up text and attachments; the remaining economics are archived without a user reference. Deleting a staff creator or confirmer no longer blocks account deletion. Removed private files are queued transactionally and retried by the existing hourly `/api/cron/property-storage-cleanup` job. Signed links expire after ten minutes. Listing media cleanup only starts after a successful database deletion.

Uploads accept JPG, PNG, WebP and PDF, up to 10 MB per file and 10 attachments per submission. View URLs expire after 10 minutes; refresh the call to renew them. Upload slots are scoped to the authenticated respondent and call; the API checks uploaded objects before accepting attachments. Interrupted/abandoned uploads can leave unreferenced objects; storage cleanup should only remove old objects not referenced by responses.

## Validation

- `npm test`: 70 tests passed, including API access/privacy, rental frequency, saved transaction basis, stale staff edits, deletion ordering, signed receipts, cleanup retries, field-level conflict merging and microsecond version ordering.
- `npm run test:property-requests:db`: migration, role privileges, current-terms acknowledgement, immutable commission snapshots, duplicate retries, closed/draft rejection, owner commission, private bucket, linked-listing deletion, cascading account deletion, anonymized response archives, preserved commission records, and private-file cleanup permissions.
- `npx tsc --noEmit --incremental false`, focused ESLint and `npm run motion:audit` passed.
- `npm run build`: production Turbopack build passed.
- Interactive browser preview with test data: desktop and 390px layouts, respondent/contact display, follow-up save and request creation/publishing form. Preview uses mocked API responses; it does not validate a live Supabase deployment.
- Browser regression checks confirm sibling drafts survive save/filter/refresh, and concurrent staff conflicts preserve edits until reviewed. New edits also survive a refresh while an earlier save is in flight.
- Mobile counterpart: 14 tests passed; React Native Web previews exercised feed/search/filter and complete property submission/receipt. The iOS development bundle loaded on iPhone 17 Pro and the signed-in renter was correctly denied access to the new feed. Native agent/owner submission and real storage uploads still require a deployed test backend and an appropriate signed-in account.

Run the repeatable call-editor browser checks with `npm run test:property-requests:browser` after installing Chromium via `npx playwright install chromium`. Alternatively set `CHROME_EXECUTABLE` to an installed Chrome binary. The tests bundle the actual dashboard, use a temporary local server with mocked APIs, and clean up after completion. They cover conflict recovery, repeated and failed refreshes, preserving other staff edits, ordinary creation/publishing, delayed saves, browsing during a save, failure/retry behavior, and reopening the same call.
