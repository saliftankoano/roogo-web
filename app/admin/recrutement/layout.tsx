import { StaffRouteGuard } from "@/components/admin/StaffRouteGuard";

// Recruitment review: Fondateur and Directeur (the API checks it too).
export default function Layout({ children }: { children: React.ReactNode }) {
  return <StaffRouteGuard capability="talent.manage">{children}</StaffRouteGuard>;
}
