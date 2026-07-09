# The Roogo UX Coran

A living reference of psychology-backed design principles for building trust and
an exceptional experience at Roogo. It grows over time: every principle we adopt
gets a chapter with the psychology, the rule, where Roogo already applies it,
and where we should next. **Consult it before designing any screen that asks the
user to decide, pay, sign up, or trust us.**

Why this matters more for Roogo than for most products: our market runs on a
trust deficit. Burkinabè renters and owners have been burned by *arnaques*; every
screen either deposits into the trust account or withdraws from it. These
principles are levers — and levers can manipulate. **House rule: we use them to
make honest things feel as good as they are, never to make dishonest things feel
honest.** If a technique only works because the user misunderstood, it's out.

How to extend this doc: add a chapter per principle (psychology → rule → at
Roogo today → do next → anti-patterns). Date significant additions. When a
principle ships in a real screen, note it here so the doc stays a record of
practice, not theory.

---

## 1. Smart defaults — decide for the user when you already know the answer

**The psychology.** Every empty field is a decision, and decisions stack into
fatigue: the famous Columbia jam study found 24 options converted at 3%, six
options at 30%. More choice reads as harder, not better. Meanwhile 70–90% of
users never change a default — not from laziness, but because a default reads
as a *recommendation*: "this is what most people pick."

**The rule.** Pre-select the most common choice for every field. Turn "fill this
out from scratch" into "scan and adjust what doesn't fit." Where possible, make
the CTA carry information ("Voir 12 propriétés" beats "Rechercher").

**At Roogo today.**
- Listing wizard defaults: `mensuel` frequency, `louer` intent, chambres/sdb
  pre-set to 1 (or 0 for terrain/commercial — the default itself is type-aware).
- Ville pre-selected to Ouagadougou on new listings (shipped 2026-07-08).
- Visites 3D payment modal pre-fills the Mobile Money number from the contact
  phone.

**Do next.**
- Search/browse: default city to Ouagadougou (or the user's last city), and put
  live result counts on filter CTAs.
- Any new form: before shipping, ask "which of these fields could we have
  answered for the user?" — GPS for quartier, profile for contact fields,
  previous listings for property type.

**Anti-patterns.** Blank forms with five empty required fields; "Sélectionnez…"
placeholders where 80% of users pick the same value; defaults chosen for our
benefit rather than the user's (that's a dark pattern and a trust withdrawal).

---

## 2. The goal gradient — never start anyone at zero

**The psychology.** In the car-wash loyalty study, a 10-stamp card with 2 stamps
pre-filled was completed at nearly *double* the rate of an 8-stamp empty card —
identical effort, different feeling. The closer people feel to a finish line,
the harder they pull toward it. And crucially: **you choose where the starting
line is.**

**The rule.** Find something the user has already done and count it. Progress
bars never start at 0%. Reframe account creation as "step 1 — done" instead of
a gate before the journey begins.

**At Roogo today.**
- Listing wizard stepper opens with "Votre compte ✓" as a pre-completed step 0
  on new listings — nobody starts at zero — and the disabled next button reads
  "Plus que N champs" (progress framing) instead of "Compléter N champs requis"
  (debt framing). Shipped 2026-07-08.

**Do next.**
- Draft restore: surface earned progress explicitly ("Vous êtes à 60%").
- Owner profile: a LinkedIn-style "annonce strength" meter that never reads 0%
  (photos added, GPS pinned, identity badge — each one visible progress toward
  "annonce prête à publier").
- Sale flow: the seller journey (docs → mandate → photos → live) is a natural
  progress track; show it, with submission itself already checked.

**Anti-patterns.** "0% complet" anywhere; onboarding that hides how many steps
remain; progress that visibly *resets* (a trust withdrawal).

---

## 3. Reciprocity — give something real before asking for anything

**The psychology.** Cialdini ranked reciprocity the single most powerful driver
of persuasion: receiving something first creates an unconscious debt. Free
samples lift purchases up to 2,000% — not because the sample is great, but
because it obligates. The inverse — demanding signup before delivering any
value — reads as holding results hostage, and users walk.

**The rule.** Deliver genuine value first; ask afterwards, and frame the ask as
*saving/extending* what they already got, not unlocking it.

**At Roogo today.**
- Browsing is free and public — full listings, photos, shareable `/p/` links,
  no account wall. This is our biggest reciprocity asset; defend it.
- Visites 3D: the live Kuula demo on the marketing page gives the experience
  away before asking for a booking.

**Do next.**
- Owners: a free, instant "what could your property earn?" estimate before any
  signup — value first, listing second.
- Roogo Sell: the price proposal conversation is the gift; make sure nothing of
  it sits behind a wall it doesn't need to.
- Never blur results. If we compute something for a user (search matches,
  estimates, reports), show a genuinely useful portion, then offer to save or
  complete it.

**Anti-patterns.** "Créez un compte pour voir" before we've given anything;
gating contact with an owner behind signup *without* first showing the user the
property is real (photos, 3D visit, verified badge).

---

## 4. The IKEA & endowment effects — let users build something that's theirs

**The psychology.** People value what they helped build far above an identical
thing handed to them (IKEA effect), and merely *feeling* ownership raises value
(endowment effect). Duolingo has you pick a language, set a goal, and finish a
lesson before it ever shows a signup screen — by then, leaving means abandoning
something of yours.

**The rule.** Before asking for commitment (signup, payment), get the user
choosing, naming, and assembling. The CTA after building is "Continuer" — never
"S'inscrire" — because leaving must feel like abandoning their work.

**At Roogo today.**
- Live listing preview (shipped 2026-07-08): step 2 of the wizard opens with a
  compact property card that assembles itself from the owner's inputs — photo,
  "{Villa} à {Koulouba}", live price — under the kicker "Votre annonce prend
  forme". The form stops being a form and becomes their annonce being born.
- Listing draft autosave: an owner's half-built annonce survives interruptions —
  their investment is protected, and returning feels like resuming *their*
  project.
- Renter onboarding picks a profile type before anything else.

**Do next.**
- Let renters build their search identity pre-signup: quartiers, budget, type —
  then "Continuer" creates the account that *saves what they made*.
- Owner onboarding: photos and property basics before the account wall; the
  signup saves the annonce they already started.

**Anti-patterns.** Cold `email + mot de passe` walls with nothing of the user's
on screen; resetting anything a user built because they weren't logged in yet.

---

## 5. Loss aversion — show the cost of inaction, honestly

**The psychology.** Kahneman's Nobel-winning finding: losing something hurts
about twice as much as gaining the same thing pleases. "Upgrade for more
storage" is the weak frame; "these files, by name, get deleted in 7 days" is
the strong one. Status quo bias means people protect what they have — so show
them what they have at stake.

**The rule.** When asking users to act, flip the frame from gain to loss — but
only when the loss is *real*. In a market defined by arnaque-wariness, a
manufactured threat costs more trust than it gains conversion.

**At Roogo today.**
- Visites 3D slot hold: "créneau maintenu 8 minutes" is honest urgency — the
  slot genuinely releases.
- Boost expiry has a real deadline.

**Do next.**
- Owner nudges: frame vacancy as ongoing loss — "Chaque semaine sans locataire ≈
  {loyer/4} FCFA perdus" — because it's true and it motivates completing the
  annonce.
- Expiring states (boost ending, application pending, hold expiring): name the
  concrete thing at stake, with a real countdown.

**Anti-patterns.** Fake scarcity ("3 personnes regardent ce bien" when false),
fake countdowns, guilt-trip dismiss buttons ("Je préfère perdre de l'argent").
Honest loss framing only — one fake threat discovered and our credibility, our
scarcest asset, is gone.

---

## 6. Anchoring & contrast — control the first number

**The psychology.** The brain evaluates every number relative to the one it saw
just before. $50/month alone feels expensive; next to a $1,900 laptop, labeled
"2.6%", it's a rounding error. Restaurants price a $90 steak so the $40 salmon
feels reasonable. The first number becomes the ruler.

**The rule.** Never show a cost in isolation. Deliberately choose what the user
sees first, and express fees as a fraction of the value they're protecting or
receiving.

**At Roogo today.**
- Listing tiers (essentiel / standard / premium) exist but ordering/anchoring
  isn't deliberate yet.

**Do next.**
- Success fee: present it next to the rent it earns — "50% du premier loyer"
  reads far smaller after the user has just seen twelve months of income.
- Visites 3D: anchor 15 000 FCFA/pièce against what it protects (a diaspora
  buyer's flight, weeks of vacancy, wasted visits) — not against zero.
- Boost/premium pricing: show it as a % of monthly rent, after the rent.
- Tier pages: lead with premium so standard reads as the reasonable middle.

**Anti-patterns.** A fee on a screen with no value reference nearby; anchoring
against invented numbers (fake "before" prices — illegal in spirit and a trust
bomb here).

---

## The Roogo trust addendum

Principles above are universal; these are ours, earned locally:

- **Visible humans beat clean minimalism.** Phone numbers on flyers, t-shirts,
  and screens read as *credibility*, not clutter, in Burkina. A reachable human
  is a trust signal no badge replaces.
- **Verification is a product feature.** "Identité vérifiée" / "Documents
  vérifiés" badges, staff moderation before anything goes live, Roogo as the
  counterparty in sales — surface these constantly; they are why we exist.
- **Never spend trust to buy conversion.** Every principle in this doc has a
  manipulative twin. The test: would we be comfortable explaining the mechanism
  to the user, in French, to their face? If yes, ship it.
- **Copy discipline (2026-07-09).** No em dashes between words mid-sentence in
  user-facing copy: restructure into two sentences, or use a comma or colon. No
  emoji in product copy; it reads as cheap. Polished copy is itself a trust
  signal in this market.

---

*Started 2026-07-08 from the six-principle UX psychology breakdown (smart
defaults, goal gradient, reciprocity, IKEA/endowment, loss aversion,
anchoring). Add chapters as we learn.*
