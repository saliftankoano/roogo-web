// Server side of job applications (see lib/job-applications.ts). Service role
// only: the table and the bucket have no anon or authenticated access.

import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  getPropertyHeadline,
  getPropertyPath,
  getPropertyPriceLabel,
} from "@/lib/property-url";
import type { Property } from "@/lib/data";

import type { VideoTestListing } from "@/lib/job-applications";

export type { VideoTestListing };

export const JOB_APPLICATIONS_BUCKET = "candidatures";

export function toVideoTestListing(property: Property): VideoTestListing {
  return {
    id: property.id,
    reference: property.reference ?? null,
    headline: getPropertyHeadline(property),
    quartier: property.quartier || property.location,
    priceLabel: getPropertyPriceLabel(property),
    image: property.image,
    path: getPropertyPath(property),
  };
}

/** Whether an object exists in the private bucket (the candidate's PUT went through). */
export async function storageObjectExists(path: string): Promise<boolean> {
  const slash = path.lastIndexOf("/");
  const dir = path.slice(0, slash);
  const name = path.slice(slash + 1);
  const { data, error } = await supabaseAdmin.storage
    .from(JOB_APPLICATIONS_BUCKET)
    .list(dir, { search: name, limit: 5 });
  if (error) {
    console.error("job applications: storage list failed", error.message);
    return false;
  }
  return (data ?? []).some((item) => item.name === name);
}

/** Short-lived read link for the staff review (10 minutes). */
export async function signedReadUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await supabaseAdmin.storage
    .from(JOB_APPLICATIONS_BUCKET)
    .createSignedUrl(path, 600);
  if (error || !data) {
    console.error("job applications: signed read url failed", error?.message);
    return null;
  }
  return data.signedUrl;
}
