# Navigation regression checks (ROO-19)

Run `npm test` for role rendering and Escape/focus regression tests.

For browser checks, run the development server and open
`/connexion/navbar-test`. This route returns not-found outside development.
It renders the same `NavbarView` used by the Clerk-connected navbar, with a
state selector and a fixed-size test avatar. It does not authenticate users,
grant roles, or change sessions.

At viewport widths 320, 768, 1280, and 1512, select loading → guest → renter →
owner → agent → staff → founder → guest. Compare `getBoundingClientRect()` for
`header`, `[data-nav-auth-slot]`, `nav[aria-label="Navigation principale"]`,
`[data-layout-anchor]` before and after every transition.
Expected: identical container rectangles at each fixed viewport width. Links
intentionally differ by role, using five equal-width desktop slots. Loading
shows placeholders instead of visitor links. Accueil and Propriétés retain
their first two positions for visitor, renter, owner, and agent roles.

Also verify:

- Owner primary navigation contains Mes biens and Parrainage.
- Staff navigation contains Annonces plus four collapsed groups.
- Founder Pilotage includes Finances and Paramètres; staff Pilotage does not.
- Escape from a grouped link closes its group and focuses the summary.
- Escape from a mobile link closes its menu and focuses the mobile toggle.
- Mobile staff groups expand inline, with only one group open at a time.

Verified in Chrome on 2026-09-07: all 32 state/viewport combinations retained
identical measured container geometry. Desktop grouped-menu dismissal and
mobile accordion/Escape focus checks passed; long desktop group labels fit.
Unit suite:
45 tests passed. Targeted ESLint and TypeScript checks passed.

These checks validate React state transitions and actual browser layout, not
Clerk's external login service or a production Lighthouse/CLS score.
