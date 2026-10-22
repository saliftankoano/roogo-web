"use client";

import { useEffect, useState } from "react";
import { ClockIcon, LockSimpleIcon } from "@phosphor-icons/react";
import {
  APPLICATIONS_CLOSED_MESSAGE,
  formatTimeLeft,
  getJobRole,
  timeLeft,
} from "@/lib/job-applications";

/**
 * The current time, ticking every 30 s. The first render uses the server's
 * time so the HTML matches on hydration; the real clock takes over right after.
 */
export function useNow(renderedAt: string): Date {
  const [now, setNow] = useState(() => new Date(renderedAt));
  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

export function JobDeadlineBadge({ slug, renderedAt }: { slug: string; renderedAt: string }) {
  const role = getJobRole(slug);
  const now = useNow(renderedAt);
  if (!role) return null;
  const left = timeLeft(role, now);

  if (left.closed) {
    return (
      <p className="mt-5 inline-flex items-center gap-2 rounded-full bg-neutral-200 px-4 py-2 text-sm font-bold text-neutral-700">
        <LockSimpleIcon size={16} weight="bold" />
        {APPLICATIONS_CLOSED_MESSAGE}
      </p>
    );
  }

  return (
    <div className="mt-5">
      <p className="text-sm font-semibold text-neutral-800">
        Candidatures ouvertes jusqu&apos;au {role.deadlineLabel}
      </p>
      <p
        className="mt-2 inline-flex items-center gap-2 rounded-full bg-[#c96a2e]/10 px-3.5 py-1.5 text-sm font-bold text-[#8a4924]"
        aria-live="polite"
      >
        <ClockIcon size={16} weight="bold" />
        {formatTimeLeft(left)}
      </p>
    </div>
  );
}
