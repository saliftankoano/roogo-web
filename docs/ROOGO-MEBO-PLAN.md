# Roogo Mêbo — Product and Implementation Plan

**Status:** Product definition settled; implementation not started
**Last updated:** 2026-08-25
**Product:** Roogo Mêbo
**Candidate domain:** `roogomebo.com`
**Parent ecosystem:** Roogo

## 1. Executive decision

Roogo should test a web-first marketplace where architects, designers, builders,
and construction companies can present and sell house designs and related
digital assets. The marketplace should live at `roogomebo.com`, but reuse the
existing Roogo Next.js application, Clerk instance, Supabase project, storage,
payment infrastructure, staff operations, and analytics foundations.

Roogo Mêbo must feel like a focused marketplace rather than another section of
the property-search interface:

- `www.roogobf.com` remains Roogo Immobilier: rent, buy, sell, and manage
  existing properties.
- `roogomebo.com` becomes Roogo Mêbo: discover plans, evaluate designs, buy
  packages, request modifications, and engage architects or construction
  companies.
- Both products use one Roogo identity, but maintain separate product profiles,
  onboarding, navigation, permissions, and data models.
- The existing Real Estate `userType` must never be overwritten by a marketplace
  role.
- Every authenticated user can buy. Selling is an additional, verified
  capability attached to an individual or company seller account.
- The marketplace launches on the web first. It should not be added to the
  mobile app until usage demonstrates a recurring mobile need.

The initial marketplace should be moderated, self-service, and video-first.
Roogo's launch target is 10 identity-verified sellers, each independently
creating a storefront and submitting at least three plans, for 30 reviewed plans
at launch. The first commercial release supports instant purchases only. Custom
briefs, private quotations, held funds, revisions, and service delivery follow
as the second marketplace phase after seller and buyer feedback.

## 2. Product thesis

People encountering house plans on Facebook are usually responding first to a
vision of the finished home, not to a technical drawing. Sellers use animated
3D walkthroughs, exterior renders, interior views, and camera movement to make
the design understandable before discussing price privately.

Roogo Mêbo should improve this informal behavior by making the offer explicit,
comparable, trustworthy, and purchasable:

- rich video and render-led discovery;
- clear prices or starting prices;
- clear descriptions of what is included;
- verified architects and companies;
- structured customization requests;
- protected delivery of purchased files;
- visible licensing and usage terms;
- assisted dispute resolution and fulfillment tracking.

The longer-term opportunity is larger than downloadable plans. A buyer may
start with a design, then need modification, site adaptation, engineering,
construction estimates, and a contractor. Roogo Mêbo can become the trusted
entry point into that chain without attempting to deliver every service in the
first release.

### Proposed positioning

> Découvrez une maison que vous pouvez louer, acheter ou construire.

Roogo Mêbo's focused promise should be:

> Découvrez des plans de maisons, visualisez-les en 3D et travaillez avec des
> professionnels vérifiés pour construire votre projet.

## 3. Brand and domain

### Working brand

**Roogo Mêbo** is memorable, locally meaningful, and broad enough to include
plans, architects, customization, engineering, estimates, and construction
services. Public-facing digital addresses should omit the accent:
`roogomebo.com`.

### Naming risk

The name is intentionally adjacent to the nationally recognized Faso Mêbo
name. This creates recognition, but also a material risk that customers infer a
government partnership, endorsement, or ownership. The risk is heightened
because the official Faso Mêbo scope includes infrastructure, urban development,
and housing.

Before public launch, Roogo must:

1. Validate the phrase with several fluent Mooré speakers.
2. Commission identical and similarity searches for the trademark and
   commercial name through OAPI.
3. Obtain advice from a Burkinabè intellectual-property lawyer on government
   affiliation and unfair-association risk.
4. Consider requesting written non-objection from the Faso Mêbo agency or
   exploring a genuine partnership.
5. Register the brand and relevant classes before significant public marketing.

The visual identity must not imitate government colors, logos, uniforms,
insignia, slogans, or terms such as “initiative” and “agence.” Roogo Mêbo should
consistently say **“Une plateforme Roogo”** and identify itself as a private
marketplace connecting customers with independent professionals.

Useful references:

- [Official description of the Faso Mêbo initiative](https://www.presidencedufaso.bf/wp-content/uploads/2024/10/CONSEIL-DES-MINISTRES-N%C2%B0033-DU-16-OCTOBRE-2024.pdf)
- [January 2026 government communiqué concerning the Faso Mêbo agency](https://www.sig.gov.bf/fileadmin/user_upload/CONSEIL_DES_MINISTRES_N__002_DU_22_JANVIER_2026.pdf)
- [OAPI prior-art/name search guidance](https://oapi.int/proteger-la-pi/recherche-danteriorite/)

### Domain decision

`roogomebo.com` is the preferred public domain because it is memorable, can be
registered through ordinary `.com` registrars, and creates a focused storefront.
It does not require a separate application.

`roogo.bf` remains a possible future master-brand domain, but Cloudflare and
Hostinger do not register `.bf`. A `.bf` domain must be acquired through an
ARCEP-accredited registrar. It should not delay the marketplace.

Recommended redirects and cross-links:

- `www.roogobf.com/mebo` → `https://roogomebo.com`
- `www.roogobf.com/plans` → `https://roogomebo.com`
- The Roogo Immobilier navigation includes “Construire” or “Roogo Mêbo.”
- Roogo Mêbo includes a product switcher back to Roogo Immobilier.

## 4. Scope

### Marketplace customers

- People exploring house designs without an account
- Existing Roogo renters, owners, agents, and hotel operators
- New users who discover Roogo through a plan or social video
- Buyers looking for a ready-made design
- Buyers seeking design modification or site adaptation
- Buyers requesting a construction quotation

### Marketplace sellers

- Independent architects
- Independent designers or 3D visualization professionals, subject to accurate
  credential representation
- Architecture firms
- Construction companies
- Engineering or design-build firms in later phases

### Marketplace assets

- 3D walkthrough videos
- Exterior and interior renders
- Simplified floor-plan previews
- Concept design packages
- Architectural drawing packages
- Construction-document packages
- Structural, electrical, or plumbing packages when supplied by appropriately
  qualified professionals
- Optional customization or site-adaptation services
- Optional construction quotation requests

### Explicit non-goals for the first release

- A separate mobile application
- Unmoderated or staff-created listings
- Custom-service checkout, quotations, milestones, or held funds; these are the
  immediate second marketplace phase
- Full project-management software for construction sites
- Automated assurance that every plan is buildable on every parcel
- Escrow for complete construction contracts
- Financing, insurance, or material procurement
- A generic marketplace for unrelated digital assets

## 5. Experience principles

1. **Video first.** The walkthrough or primary render sells the vision; technical
   details support the decision.
2. **Browse before registration.** Public discovery and plan pages remain
   accessible anonymously.
3. **Buying is universal.** Users are not forced to declare themselves buyers.
4. **Selling is earned.** Publishing and payouts require seller onboarding and
   approval.
5. **Prices are explicit.** Every instant-purchase listing shows a seller-selected
   price. Roogo may suggest a range but does not impose a commercial minimum.
6. **Deliverables are unambiguous.** Every listing states exactly what files,
   drawings, revisions, and services the buyer receives.
7. **Concept is not construction approval.** The product clearly distinguishes
   attractive renders from site-specific, engineering-ready documents.
8. **Mobile-friendly sharing.** Every plan page produces a strong social preview
   and loads efficiently on constrained connections.
9. **Roogo trust is visible.** Seller verification, moderation, fulfillment
   status, and dispute handling are prominent.
10. **Self-service proves the operating model.** Launch sellers use the same
    onboarding and listing tools intended for future sellers; staff reviews and
    supports them but does not create their profiles or plans for them.
11. **French first.** The launch marketplace, transactional notices, policies,
    moderation, and support operate in French. Additional languages follow only
    when expansion or observed buyer demand justifies them.
12. **Visual before verbose.** The landing page should let visitors feel the
    quality and variety of the marketplace before asking them to read a long
    explanation. Every major section needs a meaningful visual anchor: an
    architectural render, a short walkthrough, a real plan excerpt, a seller at
    work, or a product interaction—not decorative filler.

## 6. Identity, profiles, and account behavior

### 6.1 One identity, multiple product contexts

Clerk remains the authentication authority. A Clerk user represents a person,
not a marketplace role. Supabase continues to hold product-specific records.

The existing Real Estate `users.user_type` and Clerk `publicMetadata.userType`
remain dedicated to the existing Roogo roles:

- `renter`
- `owner`
- `agent`
- `hotel`
- `staff`
- `founder`

Do not add `mebo_buyer`, `mebo_seller`, `architect`, or `company` to that field.
The current web and mobile code uses it for navigation, authorization,
onboarding, and property behavior; changing it would cause cross-product
regressions.

### 6.2 Buyer behavior

Every person is buyer-capable by default:

- anonymous users browse;
- signed-in users can favorite, inquire, and purchase;
- sellers can also make personal purchases;
- a lightweight Mêbo customer profile is created lazily when needed.

Do not show a mandatory “buyer or seller?” choice on first visit. The marketplace
homepage should instead include a visible **“Vendre mes plans”** action.

### 6.3 Seller behavior

Selecting “Vendre mes plans” starts a separate onboarding flow:

1. Choose **Independent professional** or **Company/firm**.
2. Provide public identity and contact information.
3. Provide professional credentials and legal/business evidence appropriate to
   the chosen type.
4. Configure payout details.
5. Accept seller, licensing, and content warranties.
6. Submit for Roogo review.
7. Create listings only after approval, or save drafts while review is pending.

A seller account is an entity distinct from its owner. A person may buy
personally while managing plans for a company.

### 6.4 Company membership

Company seller accounts should support multiple members:

- `owner`: legal/control owner; manages payouts and closure;
- `admin`: manages members, profile, and listings;
- `designer`: creates and edits drafts;
- `sales`: handles inquiries and orders;
- `viewer`: read-only access.

Clerk Organizations can support invitations and active organization context.
Supabase must still store the marketplace seller account, verification state,
public storefront, payout state, and membership mapping. An optional
`clerk_organization_id` connects the two systems.

For the initial self-service launch, a company begins with one owner account.
Multi-member invitations and organization switching arrive in Phase 4.

### 6.5 Product-specific onboarding

Roogo Immobilier and Roogo Mêbo must not share a single completion gate.

- Existing Real Estate users visiting Mêbo enter immediately as buyers.
- A new user registering on Mêbo is not forced to choose a Real Estate type.
- A Mêbo-only user who later visits Roogo Immobilier completes the existing
  Real Estate onboarding at that time.
- A seller returning to Roogo Immobilier retains the original Real Estate role
  and experience.
- Staff and founder authority remains global, with marketplace-specific staff
  permissions enforced server-side.

Recommended product-membership state:

```text
product_memberships
  user_id
  product                 real_estate | mebo
  first_seen_at
  onboarding_status
  onboarding_completed_at
```

Seller onboarding belongs to the seller account, not to the general buyer
membership.

## 7. Core user journeys

### 7.1 Anonymous discovery

1. Visitor arrives from Facebook, WhatsApp, search, or a direct link.
2. The plan page opens without authentication.
3. Video, renders, essential specifications, seller, price model, and package
   contents are immediately visible.
4. Visitor may share or continue browsing.
5. Sign-in is requested only for favorites, inquiries, checkout, or seller
   onboarding.

### 7.2 Existing Roogo user buys a plan

1. User follows a Roogo Mêbo link.
2. Clerk satellite-domain authentication recognizes or synchronizes the existing
   Roogo account.
3. No Real Estate onboarding or role-selection screen appears.
4. User selects a package, accepts the license, and pays.
5. Order status and deliverables appear under **Mes achats**.
6. Returning to `roogobf.com` restores the existing Real Estate experience
   without any role mutation.

### 7.3 Buyer requests customization (Phase 2)

1. Buyer chooses **Adapter ce plan**.
2. A structured request captures plot dimensions, desired changes, location,
   budget range, timeline, and optional files.
3. The brief contains marketplace-standard questions plus questions configured
   by that seller; the seller responds with scope, price, revision count, and
   delivery estimate.
4. Buyer accepts and pays a deposit or full amount according to the configured
   service terms.
5. Messages, revisions, files, and completion status remain attached to the
   request.

### 7.4 Independent seller joins

1. User clicks **Vendre mes plans**.
2. Chooses an individual seller account.
3. Completes professional verification, public profile, payout setup, and terms.
4. Roogo reviews the submission.
5. Seller creates a draft and uploads previews while pending.
6. Approved seller submits listings for content review and publication.

### 7.5 Company joins and invites a team

1. Founder creates a company seller account.
2. Provides business registration and representative evidence.
3. Roogo verifies the company and payout owner.
4. Owner invites designers or sales members.
5. Members act on behalf of the company according to their permissions.
6. Plans, orders, reviews, and payouts remain owned by the seller account even
   when membership changes.

## 8. Marketplace information architecture

### Public storefront

- Homepage
- Browse all plans
- Categories/styles
- Plan detail
- Seller storefront
- Seller directory
- How purchasing works
- How selling works
- Licensing and buyer guidance
- Safety, verification, and dispute policy

### Buyer area

- Favorites
- Purchases
- Downloads/deliverables
- Customization requests
- Construction quote requests
- Messages
- Reviews
- Account and billing details

### Seller area

- Overview/dashboard
- Storefront profile
- Plans and drafts
- Media manager
- Packages and pricing
- Orders and fulfillment
- Customization requests
- Messages
- Team members
- Verification
- Payouts
- Performance analytics

### Staff area

- Seller applications
- Credential and business review
- Plan moderation
- Orders and fulfillment exceptions
- Disputes/refunds
- Payout review
- License/package configuration visibility
- Marketplace reporting

## 9. Plan listing model

Each published plan should include:

- title and stable slug;
- seller account and verification badge;
- primary video;
- exterior and interior renders;
- preview floor plans with watermarks;
- architectural style;
- house type and number of floors;
- bedrooms and bathrooms;
- approximate total area;
- minimum or recommended plot dimensions;
- parking capacity;
- accessibility or climate features when applicable;
- supported location/region assumptions;
- estimated construction-cost range with date and assumptions;
- delivery time;
- included package and file format;
- whether future customization will be available in Phase 2;
- license type and number of permitted builds;
- explicit exclusions;
- moderation and last-updated state.

Launch categories cover residential homes, duplexes, apartment/rental compounds,
commercial buildings, farms/agricultural facilities, and other entrepreneurial
premises. Launch filters include category/use, bedrooms, bathrooms, floors,
approximate area, recommended plot width and length, price, architectural style,
verified-professional status, package level, license mode, and sort by newest or
popularity. Filters that do not apply to a commercial/agricultural category are
hidden rather than filled with fictional bedroom values.

### Package taxonomy

The MVP uses one required deliverable format: a consolidated PDF. A listing may
be presented as a base or premium architectural package, but its PDF must meet
the same minimum completeness standard.

**Required generic architectural PDF:**

1. Cover page with plan name, seller, version/date, and package classification.
2. Summary of rooms, floors, approximate total area, and recommended minimum
   plot dimensions.
3. Furnished and dimensioned plan for every floor.
4. Roof plan.
5. Four exterior elevations.
6. At least two building sections.
7. Room names, principal measurements, scale, symbols, and drawing legend.
8. Approximate area schedule.
9. License and exclusions page explaining that site implantation, soil,
   foundations/structure, sanitation, and permits are not automatically
   included.

The marketplace distinguishes:

1. **Dossier architectural générique** — the required dimensioned PDF, sold by
   any identity-approved seller and not represented as site-approved.
2. **Plan d'un professionnel vérifié** — the same product, visibly associated
   with credentials verified by Roogo.
3. **Package premium** — the generic PDF plus the listing's high-resolution 3D
   renders and/or walkthrough assets.
4. **Expérience 3D interactive** — a future paid add-on retained inside the
   buyer's Roogo Mêbo account.
5. **Adaptation au terrain et au permis** — a Phase 2 custom engagement using
   the buyer's actual parcel dimensions, location, desired changes, and
   available land/soil documents. Only appropriately qualified professionals
   may claim to provide regulated architectural, structural, sanitation, or
   permit deliverables.

Editable source formats such as DWG, DXF, SketchUp, or Revit are excluded from
the first release. They may later be disclosed and sold separately without
changing the required PDF baseline.

## 10. Media strategy

### Video-first presentation

The primary media position should favor short 3D walkthrough video. Plan cards
may autoplay muted previews only where performance permits; the default should
avoid downloading large videos before user intent is clear.

Requirements:

- mobile-optimized poster image;
- adaptive or multiple video sizes when possible;
- muted inline playback with an explicit sound control;
- duration and file-size limits;
- transcoding/normalization before publication;
- clear indication when footage is a render rather than a completed building;
- no seller contact information embedded in previews if Roogo intends to keep
  inquiries and transactions on-platform;
- watermarked public floor plans and downloadable previews;
- private storage and time-limited URLs for purchased source files.

A PDF alone is never sufficient for publication. Every listing requires a cover
render, a useful gallery of watermarked images, and a walkthrough or equivalent
3D presentation that makes the design commercially understandable. Public pages
show selected watermarked excerpts; remaining preview positions may appear
blurred/locked, but the real protected PDF is never sent to the browser before
purchase. CSS blur or disabled right-click controls are not treated as content
security.

The MVP can begin with uploaded MP4/WebM video and optimized poster images. A
specialized video service can be introduced when volume justifies transcoding,
adaptive streaming, and delivery analytics.

### Landing-page visual system and reusable ImageGen template

The Roogo Mêbo landing page must not become a text-heavy software landing page.
Its first viewport should use one cinematic architectural image or render as the
dominant surface, with concise real HTML copy, marketplace search or discovery
controls, and a direct route into the catalogue. Subsequent sections should
alternate between real marketplace media and focused explanations rather than
stacking paragraphs on a plain background.

The existing Roogo home imagery establishes the visual lineage: grounded modern
homes, warm clay and stone materials, golden-hour or dusk lighting, restrained
landscaping, dark editorial overlays, and wide compositions that leave room for
interface copy. Roogo Mêbo should preserve that familiarity while making the
architecture and the design asset—not the rental journey—the subject.

#### How the ImageGen template works

The personal ImageGen template **Roogo Mêbo Architectural Marketplace** stores a
canonical PNG reference, its gallery preview, and instructions that tell
ImageGen which visual language to preserve. It is reusable art direction, not a
finished image and not a substitute for a precise prompt. The template supplies
the recurring palette, materials, lighting, photographic finish, and editorial
character; each request must still state the subject, asset type, crop, intended
placement, and required negative space.

The generated template tag is:

`$artifact-template-roogo-mebo-architectural-marketplace`

It can be used in either of two ways:

1. Add `$imagegen` to a Codex prompt and select **Roogo Mêbo Architectural
   Marketplace** from the Template Gallery.
2. Tag `$artifact-template-roogo-mebo-architectural-marketplace` directly and
   follow it with the requested asset brief.

Example hero request:

```text
Use $artifact-template-roogo-mebo-architectural-marketplace to create a wide
landing-page hero for Roogo Mêbo: a buildable contemporary courtyard home suited
to Ouagadougou, seen at blue hour, with honest clay, concrete, stone and shaded
outdoor materials. Keep the building as the focus and reserve clean negative
space for HTML headline and search controls. Photorealistic architectural
visualization; no text, logo, watermark, people or implausible structural forms.
```

Every generation brief should follow the same order:

- asset type and intended page location;
- scene and main architectural subject;
- materials, climate, and local context;
- framing, crop, and required negative space;
- lighting and mood;
- invariants and exclusions, especially no generated text, logos, watermarks,
  fake technical annotations, or implausible construction details.

#### Initial landing-page asset set

| Placement | Visual role | Preferred source | Direction |
|---|---|---|---|
| Hero | Establish desire and marketplace quality | ImageGen template, then replace or rotate with exceptional licensed seller renders where permitted | Wide cinematic exterior or courtyard, strong architectural focal point, copy-safe negative space |
| Featured plans | Prove that real designs are available | Real seller cover renders and short walkthrough posters | Product cards lead with imagery; title, price, package, and seller remain HTML |
| Browse by need | Make discovery tangible | Real listing covers, supplemented by clearly editorial ImageGen imagery before catalogue depth exists | Visual groups such as compact plots, family homes, duplexes, and commercial plans |
| What the buyer receives | Explain deliverables | Real watermarked plan excerpts, sample sheet thumbnails, and package UI | Never synthesize technical drawings and present them as purchasable documents |
| Meet the creators | Build seller trust | Real approved seller portraits, studio footage, and work-in-progress media | Show architects and companies as people with attributable profiles |
| Final call to action | Restore emotional momentum | ImageGen template or licensed seller render | Warm evening architecture with clear space for one short CTA |

Generated visuals are allowed for brand atmosphere, editorial transitions,
campaigns, empty states, and pre-launch placeholders. They must never be passed
off as a seller's work, a completed Burkina Faso project, a technically approved
plan, or an item the buyer will receive. Real listing pages always use seller-
supplied and moderated media, with render/visualization labels where applicable.

#### Production workflow

1. Begin with the saved template, then write a purpose-specific prompt rather
   than asking for a generic “beautiful African house.”
2. Generate crops deliberately for desktop hero, mobile hero, section panel,
   and social preview instead of relying on one uncontrolled crop everywhere.
3. Keep all wording, prices, badges, buttons, and brand marks in accessible HTML;
   generated imagery contains no baked-in interface copy.
4. Visually inspect geometry, doors, stairs, roofs, shadows, vegetation, and
   cultural/contextual plausibility before an asset is accepted.
5. Optimize accepted assets for the web, define responsive sizes and meaningful
   alt text, and provide a lightweight poster or fallback for slow connections.
6. Record the prompt, template tag, generation date, intended placement, and
   approval status so later generations can stay consistent without relying on
   memory.

Before launch, the minimum visual pack is one desktop hero, one mobile-safe hero
crop, four discovery/category panels, one creator/editorial image, one final CTA
image, and a social-sharing crop. These support the page structure; they do not
replace the real seller renders, plan excerpts, and videos needed to make the
catalogue credible.

## 11. Commerce, delivery, and licensing

### Transaction modes

The first release supports one transaction mode: **fixed-price instant
purchase**. The buyer creates or signs into a lightweight Roogo account, pays,
and receives the reviewed PDF package in their purchase library.

Phase 2 adds custom services. A buyer submits a structured brief, including
standard marketplace fields and questions configured by the seller. The seller
returns a private quotation, deliverables, revision count, and deadline. Payment
starts a custom contract; the seller receives the money only after delivery,
the buyer's review window, and any dispute resolution.

Marketplace chat allows free communication and does not automatically block
phone numbers, emails, or WhatsApp details. Every conversation and relevant
action must warn that Roogo cannot protect or resolve transactions completed
outside the platform.

### License terms

Every order must snapshot the license and deliverable description accepted at
purchase time. At minimum, terms state:

- the buyer may use and modify the plan for their project;
- resale, redistribution, sublicensing, and false claims of authorship are
  prohibited;
- whether the license is ordinary, future-exclusive, or never-sold exclusive;
- whether the license permits one build or a stated number of builds;
- geographic or regulatory limitations;
- seller responsibility for authorship and third-party rights;
- buyer responsibility for site-specific professional review;
- refund eligibility before and after digital delivery;
- revision and support period.

### Fulfillment

- Store preview assets separately from protected purchased files.
- Grant downloads through authenticated, expiring signed URLs.
- Record each delivery and download event.
- Preserve the exact package manifest attached to the order.
- Preserve lifetime library access and allow repeated authorized downloads even
  if the seller later unpublishes the plan or deletes their account.
- Generate a buyer-specific PDF copy with the buyer's name on every page to make
  redistributed copies attributable without obscuring the drawings.
- Archive an immutable delivery copy for existing buyers when a listing is
  unpublished; remove the listing from public discovery and prevent new sales.
- Keep staff access auditable.

### Pricing guidance

Sellers choose their own price and Roogo imposes no commercial minimum. The
system must still reject zero, negative, or provider-unpayable amounts and any
price that would produce an invalid settlement.

Roogo displays a non-binding suggested range based on building category,
bedrooms, bathrooms, floors, approximate area, media/package contents,
professional credentials, and license type. Before Roogo has sufficient sales
data, this is a transparent rule-based recommendation rather than a claimed
market valuation. Completed marketplace transactions should later calibrate the
model.

Preliminary discovery suggests broad bands of approximately 35,000–100,000 FCFA
for a generic architectural PDF and 75,000–200,000 FCFA for a package with 3D
assets, but the first 10 sellers must validate these bands before they become
product copy.

### Exclusivity

An ordinary license allows continued sales. Two premium mechanisms are possible:

- **Retrait exclusif à compter de l'achat:** the exact number of previous Roogo
  purchases is disclosed, the plan is permanently removed from future sale
  after payment, and previous buyers keep their licenses.
- **Exclusivité totale — jamais vendu:** available only when Roogo records no
  previous order and the seller contractually declares no prior sale elsewhere;
  the plan is removed permanently after the first purchase.

Roogo shows exact historical purchase counts only in an exclusivity purchase
flow. Ordinary discovery uses softer social proof such as “Nouveau,” “Populaire,”
“5+ ventes,” or “10+ ventes” so new designs are not structurally disadvantaged.

The seller sets the exclusive price. Roogo may suggest roughly 1.5–3× the normal
price for future withdrawal and 3–5× for never-sold exclusivity; a 25–50%
premium is presented only as a low-end seller choice, not as the default value of
surrendering all future sales.

### Commission, dispute window, and payout

- Roogo commission: 10% of the plan sale price.
- Instant-purchase dispute window: 48 hours from confirmed delivery.
- Normal payout initiation: within 24 hours after the dispute window closes.
- Launch payout rails: Orange Money and Moov Money.
- Payout destination: the Orange/Moov number configured and OTP-confirmed on the
  seller account. Payout-number changes after sales begin require re-verification,
  a notification, and a fraud-control delay or staff review.
- Recommended fee allocation: deduct seller payout-transfer fees from the
  seller's proceeds and disclose the estimate before confirmation; do not add an
  unexpected fee to the buyer after the displayed checkout price.
- Legitimate, cleared earnings remain payable after account suspension. Only
  funds tied to a dispute, chargeback, suspected fraud, copied content, or a
  lawful hold may be restricted while investigated.

### Refunds and custom-order disputes

An instant digital purchase is normally non-refundable after authorized
download. Refunds remain possible when the PDF is corrupted, inaccessible,
missing required contents, or materially different from the reviewed listing.
The buyer may request review directly from the order page; any authorized Roogo
staff member can decide using a recorded checklist and audit trail.

For Phase 2 custom orders, the frozen brief, accepted quotation, promised files,
revision count, deadline, accepted extensions, message history, drafts, and final
delivery form the dispute record. A missed deadline gives the buyer the option
to cancel for a refund unless the buyer previously accepted an extension. The
buyer has 48 hours to accept or dispute delivery; subjective change of mind is
not enough when the agreed deliverables are complete.

### Reviews

Verified buyers may review immediately after delivery and edit the review during
the 48-hour dispute window. Instant-plan reviews rate plan quality, description
accuracy, and file completeness. Phase 2 custom-service reviews additionally
rate communication, responsiveness, and deadline performance. Written feedback
and a one-to-five-star summary appear on seller profiles; irrelevant service
dimensions are not imposed on instant purchases.

## 12. Proposed data model

Names are provisional and should be validated against the existing Supabase
schema before migrations are written.

```text
product_memberships
  id
  user_id
  product
  onboarding_status
  first_seen_at
  onboarding_completed_at

mebo_customer_profiles
  user_id
  preferred_language
  country
  city
  created_at

mebo_seller_accounts
  id
  account_type             individual | company
  owner_user_id
  clerk_organization_id
  slug
  display_name
  description
  logo_url
  verification_status      draft | submitted | approved | rejected | suspended
  payout_status
  payout_network           orange | moov
  payout_phone
  created_at
  updated_at

mebo_seller_members
  seller_account_id
  user_id
  role                     owner | admin | designer | sales | viewer
  status
  created_at

mebo_seller_verifications
  id
  seller_account_id
  submission_type
  status
  document_manifest
  reviewed_by
  reviewed_at
  rejection_reason

mebo_plans
  id
  seller_account_id
  slug
  title
  description
  status                   draft | review | published | rejected | archived
  license_mode             ordinary | future_exclusive | never_sold_exclusive
  exclusive_price
  authorship_attestation_version
  authorship_attested_at
  specifications_json
  primary_media_id
  published_at
  created_at
  updated_at

mebo_plan_media
  id
  plan_id
  media_type               image | video | floor_plan | document_preview
  visibility               public | protected
  storage_path
  poster_path
  sort_order
  moderation_status

mebo_plan_packages
  id
  plan_id
  package_type             architectural | premium
  name
  price
  currency
  delivery_mode            instant
  deliverable_manifest
  license_template_id
  active

mebo_license_templates
  id
  name
  version
  terms
  build_limit
  editable_files_included
  active

mebo_orders
  id
  buyer_user_id
  seller_account_id
  plan_id
  package_id
  status
  amount
  currency
  commission_amount
  seller_net_amount
  package_snapshot
  license_snapshot
  prior_purchase_count_snapshot
  dispute_deadline
  payout_eligible_at
  payment_transaction_id
  created_at

mebo_order_deliveries
  id
  order_id
  delivery_manifest
  personalized_pdf_path
  buyer_name_applied_at
  delivered_by
  delivered_at
  accepted_at

mebo_customization_requests
  id
  buyer_user_id
  seller_account_id
  plan_id
  brief
  attachment_manifest
  status
  quote_amount
  delivery_days

mebo_custom_questions
  id
  seller_account_id
  prompt
  field_type
  required
  sort_order

mebo_custom_quotes
  id
  request_id
  seller_account_id
  deliverable_manifest
  revision_count
  amount
  deadline
  status

mebo_construction_quote_requests
  id
  buyer_user_id
  plan_id
  location
  plot_details
  budget_range
  status

mebo_reviews
  id
  order_id
  buyer_user_id
  seller_account_id
  rating
  quality_rating
  accuracy_rating
  completeness_rating
  communication_rating
  responsiveness_rating
  deadline_rating
  body
  moderation_status

mebo_copyright_notices
  id
  plan_id
  claimant_contact
  evidence_manifest
  status
  seller_response_deadline
  reviewed_by
  resolution

mebo_disputes
  id
  order_id
  opened_by
  reason
  status
  resolution
```

All seller, order, delivery, payout, and moderation policies require Supabase RLS
and server-side authorization. Seller approval must be read from the database,
not trusted from client UI or user-editable Clerk metadata.

## 13. Technical architecture

### 13.1 One Next.js application

Attach `roogomebo.com` to the existing deployment. Host-aware middleware maps
marketplace requests into an internal route tree while preserving clean public
URLs.

```text
www.roogobf.com/*
  → existing Roogo Immobilier routes and layout

roogomebo.com/*
  → internal /mebo/* route tree
  → marketplace layout, navigation, metadata, and onboarding

Both
  → existing API deployment
  → Clerk
  → Supabase/Postgres and Storage
  → PawaPay/payment adapters
  → PostHog and server telemetry
```

Marketplace pages can live under `app/mebo/` internally:

```text
app/mebo/
  page.tsx
  plans/
  vendeurs/
  favoris/
  achats/
  demandes/
  vendre/
  tableau-de-bord/
```

Middleware must exclude static assets, Clerk frontend API traffic, and API routes
from accidental marketplace page rewriting.

### 13.2 Layout and site context

The current root layout assumes one Roogo Immobilier identity. Introduce a
server-derived site context based on the validated request host:

- brand and logo;
- navigation and footer;
- metadata base and canonical host;
- analytics product properties;
- onboarding gates;
- authentication redirect targets;
- support and legal links.

Avoid trusting arbitrary `Host` headers when generating security-sensitive
redirects. Compare against an explicit allowlist.

### 13.3 Clerk multi-domain setup

- Keep `www.roogobf.com` as the primary Clerk domain.
- Add `roogomebo.com` as a satellite domain in the same Clerk instance.
- Use the same publishable and secret keys.
- Configure allowed redirect origins and marketplace return URLs.
- Configure `ClerkProvider` and `clerkMiddleware` dynamically from the validated
  hostname.
- Decide whether `satelliteAutoSync` is worth the first-visit redirect cost.
- Confirm that the active Clerk plan supports production satellite domains.

Authentication and sign-up should remain hosted by the primary Roogo domain;
after completion, users return to the intended marketplace URL.

Reference: [Clerk authentication across different domains](https://clerk.com/docs/guides/dashboard/dns-domains/satellite-domains)

### 13.4 Existing code that requires domain awareness

The implementation audit must cover:

- global onboarding behavior in `middleware.ts`;
- `ClerkProvider`, metadata, navigation, and global gates in `app/layout.tsx`;
- hardcoded `https://www.roogobf.com` metadata and canonical URLs;
- sitemap and robots generation;
- JSON-LD site identity;
- payment return and callback URLs;
- social sharing URLs;
- email links and notifications;
- PostHog product attribution;
- CORS and allowed origins;
- Clerk webhook behavior;
- rate-limit keys and audit attribution.

PawaPay webhooks may continue to use one stable backend callback. The order or
transaction record should determine whether the customer returns to Roogo
Immobilier or Roogo Mêbo.

### 13.5 Storage boundaries

Use dedicated prefixes or buckets for:

- seller verification documents — private;
- public plan previews — public/CDN-compatible;
- video source uploads — private during processing;
- published optimized videos/posters — public;
- purchased plan packages — private;
- customization attachments and deliveries — private.

File validation must include MIME allowlists, size limits, extension checks,
malware scanning where practical, and image/video normalization. Purchased files
must not use permanently public URLs.

## 14. Moderation, trust, and safety

### Public seller profiles

An individual storefront publicly shows the chosen display/professional name,
profile image, city/country, biography, claimed specialties, years of experience
if supplied, verified credential badges, published plans, rating summary, review
text, and coarse sales/social-proof bands. The legal name, identity documents,
phone, email, payout details, and exact revenue remain private.

A company storefront publicly shows its trading/legal display name, logo,
city/country, description, specialties, optionally disclosed founding year or
team-size range, verified-company badge, verified professional credentials,
published plans, ratings, and reviews. Registration documents and numbers,
representative identity, member list, payout details, exact sales, and revenue
remain private unless disclosure is legally required or deliberately made public
by an authorized company administrator.

### Seller verification

Verification should match the seller type and claims:

- identity of the responsible person;
- professional title or credential evidence where claimed;
- company registration and representative authority;
- payout ownership;
- contact verification;
- portfolio or prior work;
- agreement to originality and licensing warranties.

The launch identity flow collects the front and back of a national identity
document. A professional badge requires the relevant license, diploma, or
certificate plus the named issuing institution. A company badge requires legal
registration evidence and proof that the applicant may represent it. Public
badges describe exactly what Roogo checked; identity verification alone never
becomes an “architecte vérifié” badge.

Roogo should not label every 3D designer an architect. Public credentials must
reflect what was actually verified.

### Listing moderation

Before publication, staff verifies:

- the required PDF sections are present and readable;
- dimensions, page labels, plan facts, preview facts, and package description do
  not visibly contradict one another;
- the cover render, gallery, and walkthrough/3D presentation meet the minimum
  media requirements;
- previews match the submitted product and are properly watermarked;
- the seller signed the plan-specific authorship and licensing declaration;
- video contains no misleading completed-building claim;
- the fixed price, PDF contents, exclusions, and license mode are clear;
- license is attached;
- professional/technical claims are supported;
- prohibited content or obvious impersonation is absent.

Staff moderation is a marketplace completeness and fraud screen, not an
engineering certification. A construction-trained staff member may identify
obvious inconsistencies, but publication never represents that Roogo approved
structural safety, code compliance, soil suitability, or permit eligibility.
The staff review form must say this explicitly so internal checkboxes do not
gradually become an implied technical warranty.

Roogo promises a 48-hour target for identity and plan review. The product should
describe this as a normal target rather than an unconditional guarantee when
queues, resubmissions, or external credential verification require more time.

### Authorship and copied-design complaints

Each listing submission records a versioned declaration that the seller owns or
has authority to license the plan and will indemnify/assist Roogo regarding
false claims. That declaration is evidence and a contractual allocation of
responsibility; it does not make Roogo immune from credible infringement notices.

Architectural works, plans, sketches, and related three-dimensional works receive
copyright protection under Burkina Faso/OAPI rules, with protection arising from
creation. Roogo therefore needs a documented notice process:

1. Receive a complaint with claimant identity, the challenged plan, claimed
   original work, and supporting evidence.
2. Preserve the listing, orders, seller declaration, uploads, timestamps, and
   relevant messages.
3. Temporarily pause new sales when the claim is facially credible or urgent.
4. Notify the seller and collect a response/evidence by a defined deadline.
5. Restore, remove, or keep restricted according to the available evidence and
   legal advice; Roogo need not make a final judicial determination of authorship.
6. Restrict only affected unsettled funds unless the broader account presents a
   documented fraud risk.
7. Disclose private seller data only with seller consent or a valid request from
   a legally authorized authority, and record every disclosure.

Useful references:

- [Burkina Faso copyright law — BBDA](https://bbda.bf/wp-content/uploads/2022/08/LOI.pdf)
- [OAPI Bangui Agreement](https://oapi.int/cadre-juridique/accord-de-bangui/)
- [Burkina Faso personal-data laws — CIL](https://cil.bf/?page_id=1017)

### Legal-document acceptance

Launch requires canonical French web versions of the marketplace terms, privacy
policy, seller agreement, buyer license, refund/dispute policy, and authorship
declaration, with downloadable PDF copies for reference. Phase 2 adds custom
service terms. Registration, seller submission, and checkout capture an explicit
checkbox plus user, document type, immutable version, timestamp, IP/request
context, and relevant order/listing identifier. A generic account checkbox does
not replace plan-specific license acceptance at checkout or authorship acceptance
for each listing.

### Buyer protection

- Snapshot terms, packages, and licenses at order time.
- Explain digital-delivery refund limitations before payment.
- Provide a dispute window for missing, corrupt, or materially misdescribed
  deliverables.
- Record delivery and download activity.
- Suspend sellers without deleting audit and order history.
- Keep staff actions and file access auditable.
- Preserve purchased files for lifetime account access even after seller
  unpublishing, suspension, or deletion, subject to a lawful removal order.
- Make the account-deletion flow explain which seller/order records and buyer
  deliverables must be retained for contractual, fraud-prevention, and legal
  purposes.

## 15. SEO, acquisition, and analytics

### SEO

- Each plan receives one immutable descriptive slug.
- Each seller receives a stable storefront slug.
- Plan pages include video/image Open Graph previews.
- Structured data should describe products, offers, sellers, and reviews where
  supported and truthful.
- `roogomebo.com` receives its own sitemap and robots rules.
- Canonicals never alternate between `roogobf.com/mebo` and `roogomebo.com`.
- Cross-domain redirects use permanent status only after the canonical strategy
  is settled.

### Social acquisition

- Generate vertical and square video cuts for Facebook, Instagram, TikTok, and
  WhatsApp sharing.
- Link every post directly to the relevant plan rather than the homepage.
- Show price/starting price and seller verification in social preview copy.
- Give sellers trackable share links and storefront links.

### Advertising inventory

Reuse Roogo's advertising foundation with product-level targeting so an
advertiser may choose Roogo Immobilier, Roogo Mêbo, or both. Marketplace slots
remain clearly separated from organic plans:

- one labeled sponsor banner below the homepage hero/search, never before the
  product's value and primary search action;
- a desktop right-rail placement on search results;
- a mobile inline equivalent after approximately 8–12 organic results;
- one contextual sponsor module near the bottom of a plan page;
- no advertisement between package price and checkout;
- no paid plan disguised as an organic result.

### Core events

- `mebo_marketplace_viewed`
- `mebo_plan_viewed`
- `mebo_video_started`
- `mebo_video_completed`
- `mebo_plan_favorited`
- `mebo_seller_onboarding_started`
- `mebo_seller_application_submitted`
- `mebo_customization_requested`
- `mebo_checkout_started`
- `mebo_order_paid`
- `mebo_order_delivered`
- `mebo_order_accepted`
- `mebo_dispute_opened`

Every event should include plan, seller, package, acquisition source, product
domain, and authenticated/anonymous state where appropriate and privacy-safe.

## 16. Rollout plan

### Phase 0 — Validation and clearance

**Goal:** Confirm demand, supply, naming safety, and commercial assumptions before
building full commerce.

Actions:

- secure `roogomebo.com` and relevant social handles;
- complete linguistic, OAPI, and legal name review;
- interview 10–15 architects/construction companies;
- collect representative videos, packages, and pricing practices;
- interview prospective buyers who discovered plans through social media;
- define the initial license templates and seller agreement;
- recruit 10 launch sellers who each commit to self-onboarding and submitting at
  least three plans;
- validate package completeness and suggested pricing bands with those sellers;
- finalize the 10% commission, 48-hour dispute window, and Orange/Moov payout
  process.

Exit criteria:

- brand can proceed or a replacement is selected;
- at least 10 credible sellers agree to participate;
- at least 30 candidate designs have seller attestations and the required PDF and
  media assets;
- the pilot license, refund, and seller terms have legal review;
- marketplace economics are approved.

### Phase 1 — Domain and platform foundation

**Goal:** Make both domains coexist safely without changing existing Roogo flows.

Actions:

- attach and verify `roogomebo.com` on the existing deployment;
- implement host-aware routing and an explicit host allowlist;
- build marketplace layout and navigation;
- configure Clerk primary/satellite behavior;
- scope the existing onboarding gate to Roogo Immobilier;
- add product-specific membership state;
- make metadata, canonicals, analytics, and redirect URLs domain-aware;
- introduce base marketplace schema and RLS;
- add a product switcher between Roogo experiences.

Exit criteria:

- existing renters, owners, agents, hotel users, staff, and founders experience no
  changed navigation or authorization on `roogobf.com`;
- a new Mêbo user is not forced into Real Estate onboarding;
- the same account can move between domains securely;
- automated tests cover both host contexts.

### Phase 2 — Self-service instant-purchase MVP

**Goal:** Validate that sellers can independently publish reviewed products and
that buyers will complete paid digital-plan transactions.

Actions:

- lightweight buyer account creation;
- individual and company seller onboarding, identity evidence, credential
  badges, payout configuration, and 48-hour staff review target;
- seller-created storefronts, listing drafts, required PDF/media upload,
  authorship declaration, and plan review queue;
- fixed seller pricing plus non-binding Roogo suggested ranges;
- video-led discovery, categories, filters, search, favorites, and public seller
  profiles;
- ordinary and exclusive license modes;
- PawaPay checkout and idempotent marketplace order ledger;
- personalized protected PDF delivery, lifetime library, repeated downloads, and
  delivery audit;
- 10% commission, 48-hour dispute window, Orange/Moov seller payout within the
  following 24 hours;
- order-page refund request and staff resolution;
- verified reviews and seller rating summaries;
- email notifications for review decisions, purchases, disputes, and payouts;
- social metadata, marketplace analytics, and labeled advertising slots.

Exit criteria:

- 10 sellers have self-onboarded and at least 30 reviewed plans are live;
- plan pages perform acceptably on representative mobile connections;
- successful end-to-end sandbox and controlled live orders prove that duplicate
  callbacks cannot duplicate orders, balances, deliveries, or exclusivity;
- protected source PDFs are never publicly accessible before purchase;
- refund, dispute, commission, and payout states reconcile financially;
- existing buyers retain access after seller unpublishing or account deletion;
- Roogo completes at least 10 paid sales within the first three months after
  commercial launch.

### Phase 3 — Custom briefs and service contracts

**Goal:** Add Fiverr-like custom work only after instant purchases and seller
operations are stable.

Actions:

- standard buyer brief plus seller-defined questions;
- attachment upload and marketplace chat;
- private quotation with deliverables, revisions, deadline, and price;
- buyer acceptance and payment;
- held seller funds, delivery submission, 48-hour review, deadline extension,
  cancellation, dispute, and payout flows;
- service-specific ratings for quality, communication, responsiveness, and
  deadlines;
- initial adaptation-to-land offerings from appropriately qualified sellers.

Exit criteria:

- accepted quotes create immutable, auditable contracts;
- funds cannot release before successful delivery/review or dispute resolution;
- late cancellation and accepted extensions behave deterministically;
- off-platform warnings are visible in chat and contract surfaces;
- seller and buyer feedback confirms that configured questions improve briefs.

### Phase 4 — Company teams and marketplace scale

**Goal:** Add multi-member operations and reduce review/support cost without
weakening trust.

Actions:

- company invitations and owner/admin/designer/sales/viewer permissions;
- optional Clerk Organizations integration;
- seller analytics and improved data-driven pricing guidance;
- review SLA and moderation-throughput tooling;
- copyright notice/counter-notice operations;
- advertising reporting and product-level campaign selection;
- video transcoding/adaptive delivery if volume justifies it.

Exit criteria:

- unauthorized members cannot edit, publish, view private orders, or manage
  payouts;
- moderation throughput, rejection reasons, copyright notices, and seller
  support volume are measurable;
- suggested pricing uses sufficient transaction evidence and communicates its
  uncertainty.

### Phase 5 — Broader service expansion

Potential additions only after transaction and fulfillment quality is proven:

- expanded site adaptation and engineering packages;
- bill-of-quantities or cost-estimate services;
- contractor quotations;
- milestone payments for larger professional services;
- land-to-plan matching;
- bank payouts and additional countries/currencies;
- optional mobile-app discovery surfaces.

## 17. Success metrics

### Supply

- approved sellers;
- activated sellers with at least one published plan;
- published plans;
- percentage with video and complete package descriptions;
- time from seller submission to approval;
- active sellers publishing again within 60 days.

### Demand

- unique plan viewers;
- video start and completion rates;
- favorite rate;
- qualified inquiry/customization-request rate;
- checkout-start and paid-order conversion;
- repeat buyer rate;
- acquisition source by completed order.

### Marketplace health

- gross marketplace value;
- average order value;
- Roogo net revenue;
- seller response and delivery time;
- order completion rate;
- refund and dispute rate;
- content rejection and intellectual-property complaint rate;
- buyer rating and seller rating distribution.

### Pilot decision signals

The first explicit commercial milestone is **10 completed paid plan sales within
the first three months after launch**. This validates transaction behavior, not
profitability. At an illustrative 75,000 FCFA average order, it represents
750,000 FCFA GMV and 75,000 FCFA gross commission before payment, payout,
storage, moderation, support, refund, and tax costs.

Before expanding scope, Roogo should see evidence that:

- moderated self-service supply generates repeated qualified demand;
- buyers understand what each package includes;
- sellers respond and deliver reliably;
- revenue or strategic lead value justifies moderation and support cost;
- video-led pages outperform image-only or generic inquiry pages;
- disputes remain low enough for the proposed economics.

## 18. Testing and release gates

### Cross-product regression matrix

Test at least these identities on both domains:

- anonymous visitor;
- new Mêbo-only user;
- renter;
- owner;
- agent;
- hotel operator;
- individual seller;
- company owner;
- company member with limited permissions;
- staff;
- founder;
- suspended seller.

For each identity, verify:

- correct navigation and homepage;
- correct onboarding behavior;
- correct product switch destination;
- authentication persistence/handshake;
- no Real Estate `userType` mutation;
- route and API authorization;
- correct canonical and social URL;
- correct post-payment return domain.

### Commerce gates

- idempotent payment initiation and callbacks;
- immutable price, package, and license snapshots;
- no delivery before confirmed payment;
- no duplicate seller earnings;
- signed URLs expire and are order-authorized;
- payout cannot precede the configured hold/dispute window;
- refunds and reversals reconcile with seller balance;
- staff actions are logged.

### Media gates

- MIME and size validation;
- no public access to private source packages;
- poster fallback for unsupported/slow video;
- acceptable page weight on mobile;
- watermark visibility on public plans;
- explicit render/visualization labeling;
- removed metadata where it would expose private seller or project information.

## 19. Key decisions still open

These choices require explicit product, legal, or commercial approval:

1. Final authorization to use **Roogo Mêbo** after clearance.
2. Confirmation that `roogomebo.com` has been registered and controlled by Roogo.
3. Exact provider charges and technical/legal feasibility for collecting buyer
   funds, delaying seller settlement, deducting 10%, and paying Orange/Moov
   recipients.
4. Tax, invoice, and withholding responsibilities for Roogo and sellers.
5. Whether an ordinary buyer license permits one build or another explicit build
   limit.
6. Final legal wording for ordinary, future-exclusive, and never-sold-exclusive
   licenses.
7. Final rule-based suggested price bands after interviewing the first 10
   sellers; no recommendation should be presented as market-derived before then.
8. Video duration/file limits and whether the MVP uses existing storage or a
   specialized transcoding provider.
9. Interactive 3D viewer technology, supported model format, hosting cost, and
   add-on price.
10. Whether Phase 4 company teams use Clerk Organizations or Supabase membership
    alone.
11. Data-retention periods, CIL formalities, and the lawful request process for
    seller identity/order disclosure.
12. Final lawyer review of marketplace terms, privacy policy, seller agreement,
    buyer licenses, refund/dispute policy, custom-service terms, copyright notice
    process, and the use of “funds held” versus regulated escrow terminology.
13. Named staff ownership and escalation coverage for the promised 48-hour
    identity, plan, refund, and copyright review targets.

## 20. Recommended immediate next actions

1. Register and secure `roogomebo.com`, but do not announce the name until legal
   clearance is satisfactory.
2. Run the naming, OAPI, and government-affiliation review.
3. Interview and recruit the first 10 sellers.
4. Have those sellers test self-service onboarding and submit three candidate
   plans each; audit their actual PDFs and media, not only marketing videos.
5. Validate the required consolidated-PDF checklist and suggested pricing bands
   against those 30 candidate plans.
6. Draft the versioned authorship declaration, standard licenses, seller terms,
   refund/dispute policy, privacy policy, marketplace terms, and copyright notice
   process for local legal review.
7. Produce low-fidelity marketplace flows for discovery, plan detail, seller
   onboarding, listing submission, moderation, checkout, delivery, refund,
   review, exclusivity, and payout. Treat custom requests as Phase 2 of the
   commercial product, not the instant-purchase MVP.
8. Use `$artifact-template-roogo-mebo-architectural-marketplace` to produce and
   approve the initial responsive landing-page visual pack, then combine it with
   real pilot-seller renders, plan excerpts, and videos as those become
   available.
9. Complete a technical spike for host-based routing and Clerk satellite auth
   before marketplace feature development.
10. Confirm PawaPay/provider capabilities and economics for the 10% commission,
   dispute delay, seller payout, idempotency, and refund/reversal flows.
11. Write migrations only after the seller, plan, license, order, dispute,
    delivery, review, exclusivity, and payout state machines are reviewed
    together.
12. Launch the self-service instant-purchase MVP before building custom orders,
    interactive 3D, company teams, or a mobile implementation.

## 21. Definition of a successful first launch

The first Roogo Mêbo launch is successful when a customer can discover a design
through video, understand exactly what is offered, trust the seller's represented
identity, submit a structured request or complete an approved purchase, and
receive the promised deliverables—without changing or damaging their Roogo
Immobilier profile.

The marketplace should earn the right to expand through evidence. More seller
tools, technical packages, construction services, and mobile surfaces follow
only after Roogo demonstrates reliable supply, buyer understanding, successful
fulfillment, and manageable disputes.
