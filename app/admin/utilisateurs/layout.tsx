import { StaffRouteGuard } from "@/components/admin/StaffRouteGuard";

export default function Layout({ children }: { children: React.ReactNode }) {
  return <StaffRouteGuard anyOf={["users.listAll", "users.listOwnersAgents"]}>{children}</StaffRouteGuard>;
}
