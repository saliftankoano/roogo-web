# Domain

This document defines the project-specific language a teammate or agent needs
before interpreting requirements, product behavior, or implementation choices.
Use these terms consistently. See [SYSTEM.md](./SYSTEM.md) for how the system
works, [DECISIONS.md](./DECISIONS.md) for why trade-offs were made,
[ROADMAP.md](./ROADMAP.md) for unfinished commitments, and
[CHANGELOG.md](./CHANGELOG.md) for shipped changes.

## Domain map

- **What this product serves:** Roogo organizes property rental and sale in
  Burkina Faso, from listing intake through review, visits, agreements, and
  payment follow-up. Roogo Mebo adds a host-specific advertising marketplace
  for businesses and local sellers on the same platform.
- **Primary actors:** visitors, renters, owners, agents, advertisers, Roogo
  staff, and founders.
- **Core property workflow:** an owner, agent, or staff member prepares a
  listing; staff reviews it; the listing goes online after its applicable gates
  pass; renters or buyers then work through Roogo's visit, chat, agreement, and
  payment flows.
- **Core advertising workflow:** an eligible user prepares an advertiser
  profile and business proof, submits it for review, and only proceeds through
  later Mebo campaign workflows after the applicable advertiser gates pass.
- **External standards:** no governing product standard is identified; identity,
  ownership, contracts, and Mobile Money records are kept as distinct evidence.

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
publication gates must read listing intent directly. Inferring it from a price
label or property shape creates incorrect results.

**Evidence:** See
[how admin listing filters compose](./SYSTEM.md#how-do-admin-listing-filters-compose).

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
