import { currentUser } from "@clerk/nextjs/server";
import { AccessTabs } from "@/components/admin/access/AccessTabs";
import { urbanist } from "@/components/admin/team/font";
import { CreamBackdrop } from "@/components/admin/team/ui";
import { staffLevelCan } from "@/lib/staff-access";
import { staffLevelFromMetadata } from "@/lib/staff-access-server";

export const metadata = { title: "Accès" };

// « Accès »: « Qui peut faire quoi » for every staff member (this route), and
// « Niveaux et invitations » (/admin/acces/niveaux) for team.manage only.
export default async function AccessLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  const canManageLevels = staffLevelCan(staffLevelFromMetadata(user?.publicMetadata), "team.manage");
  return (
    <div className={`${urbanist.className} mx-auto flex w-full max-w-[1200px] flex-col gap-6`}>
      <CreamBackdrop />
      <header className="relative z-10 flex flex-col gap-3 text-[#1F1A16]">
        <h1 className="m-0 text-[28px] font-extrabold leading-tight lg:text-[34px]">Accès</h1>
        <AccessTabs canManageLevels={canManageLevels} />
      </header>
      {children}
    </div>
  );
}
