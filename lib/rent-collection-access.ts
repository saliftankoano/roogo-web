import {
  canPayRentScheduleThroughRoogo,
  firstUnpaidRentScheduleId,
} from "@/lib/rent-collection";
import { supabaseAdmin } from "@/lib/supabase-admin";

type AgreementCollectionState = {
  id: string;
  rent_collection_enabled?: boolean;
};

export type RentCollectionScheduleRow = {
  id: string;
  agreement_id: string;
  property_id: string;
  owner_id: string;
  due_date: string;
  status: string;
  agreement:
    | AgreementCollectionState
    | AgreementCollectionState[]
    | null;
  [key: string]: unknown;
};

function agreementFor(schedule: RentCollectionScheduleRow) {
  return Array.isArray(schedule.agreement)
    ? schedule.agreement[0]
    : schedule.agreement;
}

function feeKey(propertyId: string, ownerId: string) {
  return `${propertyId}:${ownerId}`;
}

export async function addRentCollectionAvailability(
  schedules: RentCollectionScheduleRow[],
) {
  const disabledSchedules = schedules.filter(
    (schedule) => agreementFor(schedule)?.rent_collection_enabled === false,
  );
  if (disabledSchedules.length === 0) {
    return schedules.map((schedule) => ({
      ...schedule,
      collection_available: true,
    }));
  }

  const propertyIds = [
    ...new Set(disabledSchedules.map((schedule) => schedule.property_id)),
  ];
  const { data: pendingFees, error: feeError } = await supabaseAdmin
    .from("property_listing_fees")
    .select("property_id, owner_id")
    .in("property_id", propertyIds)
    .eq("fee_type", "success_fee")
    .eq("status", "pending");

  if (feeError) throw feeError;

  const pendingFeeKeys = new Set(
    (pendingFees || []).map((fee) => feeKey(fee.property_id, fee.owner_id)),
  );
  const firstUnpaidByAgreement = new Map<string, string | null>();

  for (const schedule of disabledSchedules) {
    if (firstUnpaidByAgreement.has(schedule.agreement_id)) continue;
    const agreementSchedules = schedules.filter(
      (candidate) => candidate.agreement_id === schedule.agreement_id,
    );
    firstUnpaidByAgreement.set(
      schedule.agreement_id,
      firstUnpaidRentScheduleId(agreementSchedules),
    );
  }

  return schedules.map((schedule) => {
    const agreement = agreementFor(schedule);
    const rentCollectionEnabled =
      agreement?.rent_collection_enabled !== false;
    const hasPendingSuccessFee = pendingFeeKeys.has(
      feeKey(schedule.property_id, schedule.owner_id),
    );

    return {
      ...schedule,
      collection_available: canPayRentScheduleThroughRoogo({
        rentCollectionEnabled,
        hasPendingSuccessFee,
        scheduleId: schedule.id,
        firstUnpaidScheduleId:
          firstUnpaidByAgreement.get(schedule.agreement_id) ?? null,
      }),
    };
  });
}
