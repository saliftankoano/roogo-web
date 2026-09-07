# ROO-20 — Property requests

Issue: https://linear.app/roogo-burkina/issue/ROO-20/roogo-call-for-properties-with-agents-and-web-dashboard-improvement

Mobile counterpart: `roogo`, branch `feat/roo-20-property-requests`.

## Operations workflow

Open **Opérations → Appels à biens** (`/admin/property-requests`). Create a draft with the customer's criteria, budget, location and contact. The client name, contact and internal notes are restricted to staff/founders. Enter the agent commission percentage and payment conditions explicitly; no rate is assumed. The commission basis is the final sale price for purchases or one month of rent for monthly rentals.

Publish the call by selecting **Ouvert**. Owners and agents can respond from the mobile **Demandes** tab. Each account can submit one property per call. A retry returns that original submission, including after closure, without overwriting its details. Responses contain price, area, bedrooms, bathrooms, precise location, a contact number, available land-document types and optional private photos/PDFs. Unavailable documents can be declared honestly; declaring or uploading a document does not verify ownership or publish a property.

Review all respondents from the call, call or contact them through the displayed profile links, and record internal follow-up notes. **Retenue** confirms an agent's original commission conditions on behalf of Roogo. The confirmed commitment can be printed/saved as PDF; the agent can see and share the saved terms in mobile. Owner responses do not receive an agent commission. This records a commission commitment, not an executed payment or electronic signature.

Select an existing announcement belonging to the respondent to connect the response to the listing workflow. **Bien publié** requires a live announcement with the same transaction type. Listing creation and ownership verification continue through the existing announcement tools. Close the call when no further proposals are needed; existing respondents retain their submission and follow-up status.

## Release order

1. Apply `supabase/migrations/068_property_requests.sql` to the target Supabase database through the normal migration process. It creates two private tables, a service-role-only submission function, and the private `property-request-files` storage bucket.
2. Deploy this web/backend branch.
3. Release the mobile counterpart. No new environment variables are required.
4. Staff must set the actual approved commission rate and payment terms before publishing each call.

The migration has been executed against an isolated PostgreSQL-compatible PGlite test database. It has **not** been applied to a shared/staging/production database by this task.

Uploads accept JPG, PNG, WebP and PDF, up to 10 MB per file and 10 attachments per submission. View URLs expire after 10 minutes; refresh the call to renew them. Upload slots are scoped to the authenticated respondent and call; the API checks uploaded objects before accepting attachments. Interrupted/abandoned uploads can leave unreferenced objects; storage cleanup should only remove old objects not referenced by responses.

## Validation

- `npm test`: 56 tests passed, including schema and API access/privacy tests.
- `npm run test:property-requests:db`: migration, role privileges, current-terms acknowledgement, immutable commission snapshots, duplicate retries, closed/draft rejection, owner commission, private bucket.
- `npx tsc --noEmit --incremental false`, focused ESLint and `npm run motion:audit` passed.
- `npm run build`: production Turbopack build passed.
- Interactive browser preview with test data: desktop and 390px layouts, respondent/contact display, follow-up save and request creation/publishing form. Preview uses mocked API responses; it does not validate a live Supabase deployment.
- Mobile counterpart: 10 tests passed; React Native Web previews exercised feed/search/filter and complete property submission/receipt. The iOS development bundle loaded on iPhone 17 Pro and the signed-in renter was correctly denied access to the new feed. Native agent/owner submission and real storage uploads still require a deployed test backend and an appropriate signed-in account.
