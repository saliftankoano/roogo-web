"use client";

import { useState } from "react";
import { NavbarView } from "./Navbar";
import { StaffNavbarView } from "./admin/AdminNavbar";
import { getAdminNavItems } from "@/lib/navigation/adminNav";
import { capabilitiesForLevel } from "@/lib/staff-access";

const testAccount = <button aria-label="Test account" className="h-10 w-10 rounded-full bg-neutral-200">R</button>;
const staffItems = (level: "founder" | "legacy") => {
  const held = new Set(capabilitiesForLevel(level));
  return getAdminNavItems((caps) => caps.some((c) => held.has(c)));
};

// Development-only route: /connexion/navbar-test. No auth/session mutations.
export function NavbarBrowserFixture() {
  const [state, setState] = useState("loading");
  return <>
    {state === "staff" || state === "founder" ? <StaffNavbarView pathname="/proprietes"
      navItems={staffItems(state === "founder" ? "founder" : "legacy")} todayCount={3} waitingApprovals={0}
      account={testAccount} /> : <NavbarView isLoaded={state !== "loading"}
      isSignedIn={state === "loading" ? undefined : state !== "guest"}
      userType={state} fullName={"Long test identity ".repeat(20)}
      accountButton={testAccount} />}
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
