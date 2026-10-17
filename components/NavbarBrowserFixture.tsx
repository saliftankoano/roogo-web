"use client";

import { useState } from "react";
import { NavbarView } from "./Navbar";

// Development-only route: /connexion/navbar-test. No auth/session mutations.
export function NavbarBrowserFixture() {
  const [state, setState] = useState("loading");
  return <>
    <NavbarView isLoaded={state !== "loading"}
      isSignedIn={state === "loading" ? undefined : state !== "guest"}
      userType={state} fullName={"Long test identity ".repeat(20)}
      accountButton={<button aria-label="Test account" className="h-10 w-10 rounded-full bg-neutral-200">R</button>} />
    <main className="p-4 pt-28">
      <h1>Navigation browser regression fixture</h1>
      <label>Auth state <select aria-label="Auth state" value={state}
        onChange={(event) => setState(event.target.value)}>
        {["loading", "guest", "renter", "owner", "agent", "staff", "founder"].map(role =>
          <option key={role} value={role}>{role}</option>)}
      </select></label>
      <p>Current state: {state}</p>
      <p data-layout-anchor>Page content must not move as authentication changes.</p>
    </main>
  </>;
}
