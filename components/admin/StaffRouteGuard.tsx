import Link from "next/link";
import { LockKeyIcon } from "@phosphor-icons/react/dist/ssr";
import { currentUser } from "@clerk/nextjs/server";
import {
  STAFF_LEVEL_LABELS,
  type StaffCapability,
  staffLevelCan,
} from "@/lib/staff-access";
import { staffLevelFromMetadata } from "@/lib/staff-access-server";

/**
 * Server-side page guard. Wrap a route's layout children with it so a person
 * whose level lacks the capability never gets the page, instead of getting a
 * page full of failed requests. The API routes still enforce the same rule.
 */
export async function StaffRouteGuard({
  capability,
  anyOf,
  children,
}: {
  capability?: StaffCapability;
  anyOf?: readonly StaffCapability[];
  children: React.ReactNode;
}) {
  const user = await currentUser();
  const level = staffLevelFromMetadata(user?.publicMetadata);
  const needed = anyOf ?? (capability ? [capability] : []);
  const allowed = needed.some((c) => staffLevelCan(level, c));
  if (allowed) return <>{children}</>;

  const label =
    level && level !== "legacy" ? STAFF_LEVEL_LABELS[level] : "Équipe Roogo";
  return (
    <div className="mx-auto max-w-xl rounded-2xl border border-neutral-200 bg-white p-8 text-center shadow-sm">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100 text-neutral-500">
        <LockKeyIcon size={24} weight="bold" />
      </div>
      <h1 className="text-xl font-bold text-neutral-900">
        Cette page n&apos;est pas dans votre accès
      </h1>
      <p className="mt-2 text-sm text-neutral-600">
        Votre niveau actuel est « {label} ». Si vous en avez besoin pour votre
        travail, demandez-le à un directeur ou au fondateur.
      </p>
      <Link
        href="/admin/annonces"
        className="mt-6 inline-flex rounded-full bg-neutral-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-neutral-800"
      >
        Retour aux annonces
      </Link>
    </div>
  );
}
