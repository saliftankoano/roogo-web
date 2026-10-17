import { StaffRouteGuard } from "@/components/admin/StaffRouteGuard";

export const metadata = { title: "Accès" };

// Access levels, invitations and the access journal (founder and directors).
export default function Layout({ children }: { children: React.ReactNode }) {
  return <StaffRouteGuard capability="team.manage">{children}</StaffRouteGuard>;
}
