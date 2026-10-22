// Fired after any task change so the navbar count and other views refresh.
// Kept apart from ui.tsx so the navbar does not pull GSAP into every admin page.
export const TEAM_TASKS_CHANGED = "roogo:team-tasks-changed";

export function announceTasksChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(TEAM_TASKS_CHANGED));
}
