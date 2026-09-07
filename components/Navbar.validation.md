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
each primary link, and `[data-layout-anchor]` before and after every transition.
Expected: identical rectangles/positions at each fixed viewport width.

Also verify:

- Owner account menu contains Mes Biens and Parrainage.
- Founder menu includes Finances and Paramètres and scrolls on narrow screens.
- Escape from an account link closes its menu and focuses the summary.
- Escape from a mobile link closes its menu and focuses the mobile toggle.
- Opening mobile navigation closes the account menu.

Verified in Chrome on 2026-09-07: all 32 state/viewport combinations retained
identical measured geometry; the interaction checks above passed. Unit suite:
45 tests passed. Targeted ESLint and TypeScript checks passed.

These checks validate React state transitions and actual browser layout, not
Clerk's external login service or a production Lighthouse/CLS score.
