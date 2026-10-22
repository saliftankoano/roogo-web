import { StaffRouteGuard } from "@/components/admin/StaffRouteGuard";

export default function Layout({ children }: { children: React.ReactNode }) {
  return <StaffRouteGuard capability="ownership.status">{children}</StaffRouteGuard>;
}
