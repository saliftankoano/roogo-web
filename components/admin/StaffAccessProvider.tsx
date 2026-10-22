"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useUser } from "@clerk/nextjs";
import {
  type EffectiveStaffLevel,
  type StaffCapability,
  capabilitiesForLevel,
  resolveStaffLevel,
} from "@/lib/staff-access";

export type StaffAccess = {
  level: EffectiveStaffLevel | null;
  can: (capability: StaffCapability) => boolean;
  canAny: (capabilities: readonly StaffCapability[]) => boolean;
};

function buildAccess(level: EffectiveStaffLevel | null): StaffAccess {
  const held = new Set(capabilitiesForLevel(level));
  return {
    level,
    can: (capability) => held.has(capability),
    canAny: (capabilities) => capabilities.some((c) => held.has(c)),
  };
}

const StaffAccessContext = createContext<StaffAccess | null>(null);

/**
 * The admin layout works the level out on the server (where the rollout switch
 * lives) and hands it down, so the navigation and buttons never disagree with
 * what the API routes will allow.
 */
export function StaffAccessProvider({
  level,
  children,
}: {
  level: EffectiveStaffLevel | null;
  children: ReactNode;
}) {
  const access = useMemo(() => buildAccess(level), [level]);
  return (
    <StaffAccessContext.Provider value={access}>
      {children}
    </StaffAccessContext.Provider>
  );
}

/**
 * Outside the admin layout (the public navbar shown to a signed-in staff
 * member) there is no server answer, so fall back to the Clerk metadata with
 * the rollout switch off. The API routes still enforce the real level.
 */
export function useStaffAccess(): StaffAccess {
  const provided = useContext(StaffAccessContext);
  const { user } = useUser();
  const metadata = user?.publicMetadata;
  const fallbackLevel = useMemo(
    () =>
      resolveStaffLevel(
        {
          userType: String(metadata?.userType ?? metadata?.user_type ?? ""),
          staffLevel: String(metadata?.staffLevel ?? ""),
        },
        { enforced: false },
      ),
    [metadata?.userType, metadata?.user_type, metadata?.staffLevel],
  );
  const fallback = useMemo(() => buildAccess(fallbackLevel), [fallbackLevel]);
  return provided ?? fallback;
}
