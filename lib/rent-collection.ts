export const RENT_COLLECTION_TERMS_VERSION =
  "monthly-collection-default-on-2026-09-01";

export type UnpaidRentSchedule = {
  id: string;
  due_date: string;
  status: string;
};

export function firstUnpaidRentScheduleId(
  schedules: UnpaidRentSchedule[],
): string | null {
  const first = schedules
    .filter(
      (schedule) =>
        schedule.status === "upcoming" || schedule.status === "overdue",
    )
    .sort(
      (left, right) =>
        left.due_date.localeCompare(right.due_date) ||
        left.id.localeCompare(right.id),
    )[0];

  return first?.id ?? null;
}

export function canPayRentScheduleThroughRoogo(input: {
  rentCollectionEnabled: boolean;
  hasPendingSuccessFee: boolean;
  scheduleId: string;
  firstUnpaidScheduleId: string | null;
}): boolean {
  if (input.rentCollectionEnabled) return true;

  return (
    input.hasPendingSuccessFee &&
    input.firstUnpaidScheduleId === input.scheduleId
  );
}
