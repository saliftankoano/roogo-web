# Hotel CVP verification record

Last updated: 2026-08-29.

## Production schema

The configured production Supabase REST endpoint (`txbxvpyftgpebgnuazaf`) was
queried with the server's service-role credentials. No credentials or customer
rows were printed. The following migration effects returned HTTP 200:

- 051: `users.user_type` accepts and stores the hotel user type.
- 052: `hotels`, `hotel_members`, `hotel_invites`, and `properties.hotel_id`.
- 053: `room_types` and its nightly-rate fields.
- 054: `listing_config.hotel_owner_commission_percentage` and
  `daily_booking_requests.booking_code`.
- 055: `events`, `event_room_blocks`, negotiated event rates, and
  `daily_booking_requests.event_id`.

The locally authenticated Supabase CLI account does not list this project, so
`supabase migration list` cannot be used for its migration ledger. The live
schema contract above is the deployment evidence available from this checkout.

## Automated coverage

Run `npm test` for booking/invite-code normalization and generation, reception
desk paid-state handling, and the guest/room/payment payload used by the mobile
desk. Run `npm run lint`, `npx tsc --noEmit`, and `npm run build` before release.

## Device end-to-end release gate

Record the build number, device, tester, and timestamp when completing this
checklist. Use separate hotel-admin, receptionist, and traveler accounts.

- Admin creates a hotel, adds a hotel listing, and creates at least two room types.
- Admin generates an invite; receptionist joins; admin revokes/removes access.
- Traveler selects a room type and dates, submits a booking request, and pays.
- Admin approves/declines requests; receptionist cannot approve or decline.
- Receptionist finds the paid booking by code and phone, then checks in/out.
- Traveler opens and shares the receipt containing hotel, room, dates and code.
- Hotel earnings show the 7% fee and become withdrawable at the configured time.
- Empty, offline, expired-code, unavailable-room, and failed-payment states are checked.

Do not mark a release accepted until the completed record (screenshots or screen
capture plus this checklist) is attached to the release or PR.
