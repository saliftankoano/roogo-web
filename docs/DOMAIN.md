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
- **Public property discovery:** visitors browse public annonces with cached photos; the homepage hero and featured-annonce results have separate loading states. Photo loading does not change publication or private-document gates. See [image behavior](./SYSTEM.md#how-do-public-listing-photos-load-and-recover).
- **Property sourcing (ROO-20, pending release):** staff publish an appel à biens; agents or owners propose properties; staff follow up, confirm agent terms and link eligible live listings.
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
- **Content Studio (staff):** staff turn a live annonce into marketing content in one **projet**: script, voice-over, visuals and a video, each paid from a monthly budget with the price shown before every click.
- **Payment evidence:** collection, reservation fulfillment and notification receipt are distinct. The payment-safety PRs remain pending release; see [payment behavior](./SYSTEM.md#how-do-failed-and-uncertain-customer-payments-recover).

## Staff access

### Niveau d'accès (staff level)

The job title that decides what a staff member can do in the back office: Fondateur, Directeur, Assistant (commercial et administratif), Conseiller (clientèle et réseaux sociaux) or Stagiaire. It is not a user type: a Directeur is a `staff` user whose level is `director`. Do not call a level a "role"; `userType` is the role. Matrix and rules: [SYSTEM](./SYSTEM.md#how-do-staff-access-levels-work).

### Invitation

The only way to become staff: a signed link from the founder or a director, tied to one email address and one level, valid 7 days. It replaces the shared staff code.

## Customer payments

### PawaPay deposit

**Meaning:** One customer-to-Roogo Mobile Money collection attempt, identified by a `depositId`. It can fund rent, a reservation, a listing, a boost or a 3D visit; it does not necessarily mean a rental security deposit (caution).

**Origin:** PawaPay's payment terminology, used locally for customer collections.

**Why it matters for building:** Keep the same reference when reconciling an uncertain attempt. An accepted initiation is not evidence that money was collected, and an HTTP error is not by itself proof of rejection.

**Evidence:** [Payment behavior](./SYSTEM.md#how-do-failed-and-uncertain-customer-payments-recover) and [reconciliation decision](./DECISIONS.md#gateway-errors-preserve-the-original-deposit-for-reconciliation--2026-09-09).

### Payment received, assistance required

**Meaning:** Roogo's `NEEDS_SUPPORT` outcome: payment collection succeeded, but the reservation was not confirmed and needs human resolution. It is neither a failed charge nor proof that the customer can occupy the property.

**Origin:** Roogo's paid-but-unfulfilled reservation state in the payment PRs.

**Why it matters for building:** Keep the paid reference visible and offer support, not another payment or a successful-reservation handoff. Payment status and fulfillment status cannot be collapsed into one success flag.

**Evidence:** [Payment behavior](./SYSTEM.md#how-do-failed-and-uncertain-customer-payments-recover) and [fulfillment decision](./DECISIONS.md#payment-recovery-preserves-historical-fulfillment-and-retries-unresolved-races--2026-09-08).

### Listing-payment consumption

**Meaning:** Permanent evidence that a deposit funded a particular listing. It survives property deletion and cannot be restored as reusable credit by clearing a payment link.

**Origin:** Roogo's single-use paid-listing contract, made durable by migration 072.

**Why it matters for building:** Retrying submission recovers the original property. A lost response, failed link repair or deletion never authorizes funding a replacement listing with the same payment.

**Evidence:** [Consumption decision](./DECISIONS.md#listing-payment-consumption-survives-property-deletion--2026-09-09).

### Notification acceptance and uncertain delivery

**Meaning:** Acceptance means Expo or Africa's Talking accepted a send for processing, not that the customer read or received it. An uncertain outcome means Roogo cannot safely prove whether the provider accepted the send.

**Origin:** Provider delivery semantics applied to Roogo's payment alerts.

**Why it matters for building:** Callback delivered, payment completed and customer notified are different facts. Do not resend automatically after uncertainty, or treat a notification error as a payment failure.

**Evidence:** [Send-boundary decision](./DECISIONS.md#notification-uncertainty-never-authorizes-a-second-send--2026-09-08).

## Listings and property review

### Annonce

**Meaning:** The Roogo listing for one property. It can remain private and
pending (`en_attente`) or be publicly available (`en_ligne`).

**Origin:** Established marketplace language, narrowed by Roogo's listing
lifecycle.

**Why it matters for building:** Creating a database property is not the same as
publishing it. Review and sale-specific gates can keep an annonce private.

### Photo principale

**Meaning:** The first photo in an annonce’s saved gallery, used as its cover and marked Principale in photo management. Its position is independent of professional-photo approval.

**Origin:** Established listing terminology, confirmed by the Roogo photo-management labels and `property_images.is_primary`.

**Why it matters for building:** Moving a photo to the first position changes the cover; both order and cover must persist across refresh. It does not approve professional photos or publish the annonce. See [how it is saved](./SYSTEM.md#how-is-the-principal-photo-saved).

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

### Échelle de prix (sale price ladder)

**Meaning:** The prices above the owner's own price `D` at which Roogo sells:
prix affiché `D` + 30% (published by default), objectif + 20% (owner receives
exactly `D`), repère + 15% (display only) and minimum équipe + 10%.

**Origin:** Salif, 2026-10-11; permissions revised 2026-10-17.

**Why it matters for building:** From + 10% (inclusive) up, "l'équipe décide".
Below + 10% a price needs "l'accord de Salif": recorded by Salif or the Directeur
(who confirms he discussed it with Salif), and below the owner's own price only
with the owner's verbal agreement. Each one is an "accord de prix" in
`sale_price_approvals`. Owners never see these terms, only what they receive at
each final sale price. Applies only to sales; rentals keep their price as set.

## Property requests

### Appel à biens

**Meaning:** A staff-created call for properties matching a customer's criteria, offered for sale or monthly rent. Mobile labels this surface **Demandes / Requests**. It is separate from a renter's application to an existing listing.

**Origin:** Roogo's local product usage established by ROO-20.

**Why it matters for building:** A call describes demand, not a public annonce. Publishing the call does not publish a property or expose private customer contact details.

**Evidence:** [Property-request workflow](./SYSTEM.md#how-do-property-requests-connect-mobile-supply-to-staff-work).

### Proposition / réponse

**Meaning:** One agent or owner's saved property proposal for one appel à biens. Its receipt preserves the submitted details, terms and follow-up status after the call closes.

**Origin:** Roogo's ROO-20 response model and mobile labels.

**Why it matters for building:** A retry retrieves the same proposal instead of replacing it. A response and its linked annonce have separate lifecycles.

**Evidence:** [Property-request workflow](./SYSTEM.md#how-do-property-requests-connect-mobile-supply-to-staff-work).

### Apporteur and commission commitment

**Meaning:** In this flow, an agent supplies a property lead as an apporteur. The commission commitment records the rate and conditions acknowledged on submission and subsequently confirmed by staff; an owner response has no agent commission.

**Origin:** Property brokerage language, narrowed by ROO-20's agent role and saved commitment.

**Why it matters for building:** Agent compensation must remain distinct from Roogo's platform fees and referral rewards. A confirmed commitment records terms; it is not a payment, electronic signature or ownership approval.

**Evidence:** [Property-request workflow](./SYSTEM.md#how-do-property-requests-connect-mobile-supply-to-staff-work).

### Commission basis

**Meaning:** The amount to which the saved agent rate applies: final sale price (`sale_price`) or one month of rent (`monthly_rent`).

**Origin:** ROO-20's explicit commercial terms.

**Why it matters for building:** Later edits to a call do not change a saved response's basis. A daily-rental listing cannot satisfy a monthly-rent response merely because both use the listing type `louer`.

**Evidence:** [Property-request workflow](./SYSTEM.md#how-do-property-requests-connect-mobile-supply-to-staff-work).

### Retenue / Bien publié

**Meaning:** Staff follow-up statuses meaning accepted and linked to a live matching listing, respectively. Retenue confirms the original agent commitment; Bien publié records the listing handoff.

**Origin:** ROO-20's operations labels.

**Why it matters for building:** Neither status replaces the existing ownership review or publication process. Deleting the linked property returns a listed response to accepted and preserves confirmed terms.

**Evidence:** [Property-request workflow](./SYSTEM.md#how-do-property-requests-connect-mobile-supply-to-staff-work).

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

## Content Studio

### Projet (Studio)

**Meaning:** The Studio's unit of work: one property and everything made for it (scripts, voice-overs, visuals, videos). Another property means another project.

**Origin:** Coined for the Studio on 2026-10-10 (Salif).

**Why it matters for building:** Results must never carry over between properties; changing the property of a project that already has results opens a new project.

**Evidence:** [Decision](./DECISIONS.md#a-studio-project-is-one-property-laid-out-as-script-plus-result-tiles--2026-10-10).

### Visite POV

**Meaning:** The first Studio video template: the listing's photos shown as a walkthrough under the voice-over, ending on the Roogo outro with the price and the number to call.

**Origin:** Roogo's point-of-view listing video format, made into a template on 2026-10-10.

**Why it matters for building:** Only the listing's own photos are allowed, and the outro price always comes from the listing.

**Evidence:** [How a video is made](./SYSTEM.md#how-does-a-studio-video-get-made-and-stored).

### Fin seule

**Meaning:** The 6-second Roogo outro on its own, to add at the end of a video the team filmed in person.

**Origin:** Requested by Salif on 2026-10-10.

**Why it matters for building:** It has no voice or watermark, keeps the music up the whole time, and is labelled "Fin de vidéo" when downloaded.

### Voix et images / Vidéos (budgets)

**Meaning:** The two monthly Studio budgets per person. **Voix et images** pays for voice-overs, previews, images, subtitles and music (Cartesia and fal); **Vidéos** pays for HeyGen renders.

**Origin:** Split by Salif on 2026-10-10.

**Why it matters for building:** Every paid action reserves from exactly one pot before calling the provider, and the price is shown on the button.

**Evidence:** `reserve_studio_spend` (migrations 082, 083).

### Glossaire de prononciation / Texte envoyé à la voix

**Meaning:** The team's list of words with how to say them, and the respelled text actually sent to the voice, shown before paying. The visible script keeps normal spelling.

**Origin:** Studio feature; matching made tolerant on 2026-10-10.

**Why it matters for building:** Respellings and numbers are produced by rules, never by a model, so prices and phone numbers cannot change.

**Evidence:** [Pronunciation](./SYSTEM.md#how-does-the-studio-make-the-voice-say-words-correctly).

### Bibliothèque musicale (Studio)

**Meaning:** The team's music for Studio videos: Roogo's own tracks plus instrumentals generated in the Studio, shared by everyone.

**Origin:** 2026-10-11 (Salif).

**Why it matters for building:** Only tracks Roogo has the right to use belong here; commercial artist songs wait for rights confirmation.

**Evidence:** [Decision](./DECISIONS.md#studio-music-roogo-tracks-and-generated-instrumentals-only--2026-10-11).


## Team goals and calls

### Compte rendu (fin de journée)

**Meaning:** The short report a staff member sends at the end of the day from Mon espace: what they did, their actions for tomorrow (each becomes a task), what did not work and how to do better. One per person per day. An **absence** is recorded on the same day row, with a category (maladie, urgence familiale, congé, autre), declared by the person or by the Directeur or the Fondateur.

**Origin:** 2026-10-19 (Salif), after Moubarak’s absence for a family emergency was known only from a phone call.

**Why it matters for building:** The absence note is private to the Directeur, the Fondateur and its own author; never ask for medical details. The weekly x/5 counts Monday to Friday.

**Evidence:** [Decision](./DECISIONS.md#end-of-day-report-and-absences-in-the-app--2026-10-19).

### Vendu

**Meaning:** The listing status of a property whose sale deed has been signed at the notary. It carries the signing date, the price and who marked it.

**Origin:** 2026-10-16 (Salif). Before, « Expirée » was used for both rented and sold listings.

**Why it matters for building:** It is the only source of the sales goal. Only the Directeur or the Fondateur sets it, only on sale listings; « Expirée » now means only that a listing is off.

**Evidence:** [Decision](./DECISIONS.md#sales-come-from-a--vendu--listing-status-follower-counts-are-read-from-meta-every-night--2026-10-16).

### Relevé (automatique, manuel)

**Meaning:** One dated follower count for a social account. « Automatique » is read every night from Meta (Facebook, Instagram); « manuel » is typed in with a screenshot (TikTok, or when Meta fails).

**Origin:** 2026-10-16.

**Why it matters for building:** Goals show the latest relevé and its source, so the team can tell a measured number from a typed one.

**Evidence:** [How it works](./SYSTEM.md#how-do-team-goals-call-notes-and-demande-answers-work).

### Objectif

**Meaning:** A goal the founder sets for the whole team: what we measure, a target and a period (ce mois, chaque mois, ce trimestre, cette année). Everyone sees it on Mon espace.

**Origin:** 2026-10-16 (Salif, design canvas).

**Why it matters for building:** Every number comes from a record or a dated reading with its proof; nothing is typed into the goal itself.

### Levier

**Meaning:** What one person does every week so a goal becomes inevitable (« Qu’est-ce qui doit se passer pour que ce soit inévitable ? »): owner, rhythm, weekly target.

**Origin:** 2026-10-16 (Salif).

**Why it matters for building:** « Ma part cette semaine » is the sum of the viewer's levers, each counted at most its weekly target.

### Tâche d’appel and note d’appel

**Meaning:** A task that is a phone call, and the record of its result (joint, pas de réponse, messagerie, mauvais numéro), notes and next step.

**Origin:** 2026-10-16 (Salif).

**Why it matters for building:** A call task cannot be marked done before its note exists; notes are seen by the caller, the Directeur and the founder only.

### Publication (calendrier du Studio) / Validation

**Meaning:** One planned social post: a Studio video or visual (or listing photos, or text), a caption, one or more networks, a date and a time slot, a responsible person. Its status moves **À faire → À valider → Validé → Publié** (or **Échec**). **Validé** is the founder's written OK; only a founder can give it, and only a validated post is ever sent to Facebook or Instagram.

**Origin:** 2026-10-12, from the field visit sheet rule "nothing is published without Salif's written OK".

**Why it matters for building:** Any edit to what goes out (caption, media, networks, time) sends a validated post back to À valider. Publié and Échec are set only by the publishing cron.

**Evidence:** [How the calendar publishes](./SYSTEM.md#how-does-the-studio-publishing-calendar-post-to-facebook-and-instagram).

### Cadence de visite / Créneau

**Meaning:** The cadence is the five posts that follow a filmed property visit, counted in business days (Monday to Friday): J+1 presentation video, J+2 walkthrough with the team's voice-over, J+4 photo carousel and the 3D tour link under it, J+5 3D ambiance video. A créneau is a posting time of the day, 12:00 and 19:00 Ouagadougou time (UTC) by default.

**Origin:** Field visit sheet; built into "Planifier une visite" on 2026-10-12.

**Why it matters for building:** Public holidays are not skipped yet. Slots come from `STUDIO_PUBLISH_SLOTS`.

**Evidence:** [Decision](./DECISIONS.md#studio-publishing-calendar-founder-approval-and-direct-meta-posting--2026-10-12).
