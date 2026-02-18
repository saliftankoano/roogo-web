## Cinematic Onboarding Kit (Template)

This directory is a **copyable onboarding flow template** based on the StartBlock admin onboarding implementation.
It’s intended for reuse in **any app** (different domain, different auth, different steps) while preserving the same UX patterns:

- Smooth, “cinematic” step transitions (Framer Motion)
- A clear multi-step journey (step indicator)
- Persistent progress across reloads (including OAuth redirects)
- Support for **mandatory steps** + **auto-advance** when prerequisites are already satisfied

---

## What’s in here

### Components (copied from StartBlock)

- components/OnboardingLayout.tsx  
  The animated shell: background glow, step transition animation, step indicator.

- components/steps/1-WelcomeStep.tsx  
- components/steps/2-ConnectGitHubStep.tsx  
- components/steps/3-InstallExtensionStep.tsx  
- components/steps/4-InstallMCPStep.tsx  
- components/steps/5-CreateAgentStep.tsx  
- components/steps/6-CompletionStep.tsx  
  The step UIs used in StartBlock. These are **examples**—for another app you’ll replace the step content and wire in your own APIs.

### Example controller

- WelcomePage.example.tsx  
  A reference “wizard controller” showing:
  - how steps are selected
  - how step index is persisted in localStorage
  - how to compute a stable per-user/per-workspace key

---

## Dependencies

You can use this template in any React app, but the StartBlock version assumes:

- **React** (client components)
- **Framer Motion** (`framer-motion`)
- **Tailwind CSS**
- Optional icon libs:
  - `lucide-react`
  - `@phosphor-icons/react` (used for Apple/Windows logos)

---

## How to adapt this for a different app

### 1) Decide what a “workspace identifier” is

StartBlock stores onboarding completion/progress with a stable ID so it works for:

- org/team workspaces (like `org_123`)
- personal workspaces (like `personal_userId`)

In your app, pick something stable such as:

- `orgId || userId`
- `accountId`
- `tenantId`

You’ll use it to scope localStorage keys:

- `yourapp_onboarding_step_${workspaceId}`
- `yourapp_onboarding_completed_${workspaceId}`

### 2) Define your steps + which are mandatory

Typical pattern:

- Step 1: Welcome (skippable)
- Step 2: OAuth / integration (often **mandatory**)
- Step 3+: Install tooling (may be skippable)
- Last: Completion

If a step is mandatory, don’t render a “Skip” affordance.

### 3) Persist progress across redirects / reloads

When you start an OAuth flow, the browser **reloads** when it returns.
Persisting the step index avoids the user being kicked back to step 1.

Implementation approach:

- Initialize step from localStorage
- Save step to localStorage on change
- On finish: mark completed, remove step key

### 4) Auto-advance steps when already satisfied

For integrations, it’s common that users return from OAuth already connected.
On step mount:

- check “connected?” condition
- if true, call `onNext()` after a short delay (lets UI feel responsive)

### 5) Gate the app so first-time users land in onboarding

In your “dashboard” entry page:

- compute the same `workspaceId`
- check completion flag in localStorage
- if missing → redirect to onboarding route

This prevents users from landing on pages that require setup.

---

## Minimal wiring example

1. Create a route (e.g. `/app/onboarding`) that renders the controller component.
2. Copy components/OnboardingLayout.tsx and your steps into your app.
3. Replace step content with your app’s requirements.
4. Ensure the dashboard route redirects first-time users to onboarding.

---

## Notes / gotchas

- localStorage is only available in the browser: guard with `typeof window !== "undefined"`.
- For OAuth: always persist the current step **before** sending the user away.
- Keep animations consistent: prefer one shell layout that animates step content changes (as in OnboardingLayout).

