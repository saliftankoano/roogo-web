# Domain

This document defines the project-specific language a teammate or agent needs
before interpreting requirements, product behavior, or implementation choices.
Use these terms consistently. See [SYSTEM.md](./SYSTEM.md) for how the system
works, [DECISIONS.md](./DECISIONS.md) for why trade-offs were made,
[ROADMAP.md](./ROADMAP.md) for unfinished commitments, and
[CHANGELOG.md](./CHANGELOG.md) for shipped changes.

## Domain map

- **What this product serves:** Roogo organizes property rental, sale, hotel
  stays, and coordinated travel in Burkina Faso, from listing or hotel intake
  through review, booking, payment, stay operations, and payout. Roogo Mebo adds
  a host-specific advertising marketplace on the same platform.
- **Primary actors:** visitors, renters, travelers, owners, agents, hotel admins,
  reception staff, event organizers, advertisers, Roogo staff, and founders.
- **Core property workflow:** an owner, agent, or staff member prepares a
  listing; staff reviews it; the listing goes online after its applicable gates
  pass; renters or buyers then work through Roogo's visit, chat, agreement, and
  payment flows.
- **Core hotel workflow:** a hotel team publishes room types and count-based
  inventory; a traveler requests dates directly or through an event code; the
  hotel confirms, the traveler pays, reception operates the stay, and Roogo
  records the fee, hotel net, receipt, and payout state.
- **Core advertising workflow:** an eligible user prepares an advertiser
  profile and business proof, submits it for review, and only proceeds through
  later Mebo campaign workflows after the applicable advertiser gates pass.
- **External records and rails:** identity, ownership, RCCM business evidence,
  contracts, and Mobile Money records are kept as distinct evidence; government
  per-diem ceilings constrain eligible event rates.

## Listings and property review

### Annonce

**Meaning:** The Roogo listing for one property. It can remain private and
pending (`en_attente`) or be publicly available (`en_ligne`).

**Origin:** Established marketplace language, narrowed by Roogo's listing
lifecycle.

**Why it matters for building:** Creating a database property is not the same as
publishing it. Review and sale-specific gates can keep an annonce private.

### Type d'annonce

**Meaning:** Whether an annonce is offered for rent (`louer`) or for sale
(`vendre`). It is distinct from the property's physical type, such as villa or
terrain, and from its Residential or Business category.

**Origin:** Established real-estate marketplace language, represented locally by
`properties.listing_type`.

**Why it matters for building:** Rental/sale filters, price units, forms, and
publication gates must read listing intent directly. A sale remains a sale even
when a legacy row still contains a monthly period, caution, or advance-rent
default. Inferring intent from those fields, a price label, or property shape
creates incorrect results.

**Evidence:** See
[how listing intent composes](./SYSTEM.md#how-do-listing-intent-and-admin-filters-compose).

### Soumission de documents de propriété

**Meaning:** The private evidence bundle attached to a sale listing for staff to
approve or reject. It can contain ownership documents such as a plan cadastral,
attestation, PUH, or titre foncier, supplied by the seller or appended by staff.

**Origin:** Roogo's implementation of the real-estate ownership review process.

**Why it matters for building:** It is an auditable review object, not a public
property gallery. Files stay in private storage, and approval gates publication
of a sale listing.

**Evidence:** See
[how staff-added ownership evidence works](./SYSTEM.md#how-does-staff-add-ownership-evidence-to-a-review).

### Mandat de vente

**Meaning:** The seller's signed authorization for Roogo to broker a sale under
the agreed commercial terms.

**Origin:** Established real-estate brokerage practice.

**Why it matters for building:** Ownership approval and mandate signature are
separate sale-publication gates. Passing one never implies the other.

## Hotel booking and coordinated travel

### Hotel membership

**Meaning:** The Supabase relationship connecting a Roogo user to one hotel as
either `admin` or `staff`. Admin means the hotel manager capability set; staff
means reception and stay-operation access.

**Origin:** Coined for Roogo's hotel organization model; it deliberately replaces
the earlier Clerk Organizations proposal.

**Why it matters for building:** Clerk authenticates the person, but
`hotel_members` is the authorization source of truth. A `hotel` user type alone
never grants access to an arbitrary hotel or to admin-only actions.

**Evidence:** See [how the hotel program works](./SYSTEM.md#how-does-the-roogo-hotel-program-work).

### RCCM hotel verification

**Meaning:** Roogo's private review of a hotel's legal identity, RCCM number,
optional tax number, and supporting business document.

**Origin:** Established business-registration evidence used in Burkina Faso;
Roogo applies it as a hotel business-trust workflow distinct from personal KYC.

**Why it matters for building:** The evidence is private and staff-reviewed, and
its lifecycle must resist duplicate pending submissions and stale decisions.
Personal identity verification never substitutes for hotel authorization or
business approval.

**Evidence:** See [how hotel trust fits the program](./SYSTEM.md#how-does-the-roogo-hotel-program-work).

### Event room block (pledge)

**Meaning:** A hotel's commitment of a count of one room type for each night of
an event window, optionally at a negotiated event rate.

**Origin:** Established group-travel and hotel-allotment practice, represented in
Roogo by `event_room_blocks`.

**Why it matters for building:** Availability is per night and count-based. A
booking must recheck the remaining pledge atomically; a total-room count or one
blocked date cannot safely represent the commitment.

**Evidence:** See the [hotel product-boundary decision](./DECISIONS.md#hotels-use-roogo-as-a-booking-and-payment-rail-not-as-a-pms--2026-08-30).

### Negotiated event rate and per diem

**Meaning:** The event-specific nightly price offered by a hotel, bounded by the
maximum daily lodging allowance recorded for that event.

**Origin:** Negotiated hotel pricing and government per-diem practice, adapted to
Roogo's event-code flow.

**Why it matters for building:** The server, not the displayed client quote,
selects and revalidates the price against event dates, city, rate ceiling, and
pledged capacity before creating a booking.

**Evidence:** See [how an event booking is handed off](./SYSTEM.md#how-does-the-roogo-hotel-program-work).

### Hotel group

**Meaning:** A create-or-join-by-code roster of multiple Roogo hotels.

**Origin:** Coined for Roogo's lightweight multi-hotel coordination capability.

**Why it matters for building:** Group membership helps hotels discover one
another but does not merge their listings, staff permissions, bookings, wallets,
or event pledges.

**Evidence:** Backend [PR #22](https://github.com/saliftankoano/roogo-web/pull/22).

## Advertising marketplace

### Roogo Mebo

**Meaning:** Roogo's advertising-marketplace surface for businesses and local
sellers. It shares the Roogo platform and accounts but has its own host, product
shell, and advertiser onboarding context.

**Origin:** Coined for this project as the Mebo product line.

**Why it matters for building:** A Mebo request must not inherit immobilier
navigation, onboarding gates, or identity metadata merely because both products
run in the same Next.js application.

**Evidence:** See
[how Mebo shares Roogo Web](./SYSTEM.md#how-does-mebo-share-roogo-web-without-becoming-the-immobilier-site)
and the [site-context decision](./DECISIONS.md#mebo-is-a-host-aware-roogo-surface-with-gated-advertiser-onboarding--2026-08-29).

### Advertiser profile

**Meaning:** The reviewed business identity and campaign-intent record used to
qualify a person or organization for Mebo advertising. It is separate from the
shared Roogo user account and carries its own draft, pending, approved, rejected,
changes-requested, or suspended state.

**Origin:** Established advertising-platform onboarding language, implemented
for Mebo.

**Why it matters for building:** A valid Roogo login does not automatically make
someone an approved advertiser. Business proof, completeness, feature access,
and review state independently govern what the user may submit or edit.
