import { StaffRouteGuard } from "@/components/admin/StaffRouteGuard";

export default function Layout({ children }: { children: React.ReactNode }) {
  return <StaffRouteGuard capability="disputes.view">{children}</StaffRouteGuard>;
}
