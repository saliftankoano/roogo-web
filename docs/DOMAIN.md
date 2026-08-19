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
  payment follow-up.
- **Primary actors:** visitors, renters, owners, agents, Roogo staff, and
  founders.
- **Core workflow:** an owner, agent, or staff member prepares a listing; staff
  reviews it; the listing goes online after its applicable gates pass; renters
  or buyers then work through Roogo's visit, chat, agreement, and payment
  flows.
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
