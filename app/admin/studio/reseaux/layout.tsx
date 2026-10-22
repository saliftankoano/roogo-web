import { StaffRouteGuard } from "@/components/admin/StaffRouteGuard";

// Studio > Réseaux: Conseiller(ère) and above (capability "social.inbox").
// The parent Studio layout already requires "studio.use".
export default function Layout({ children }: { children: React.ReactNode }) {
  return <StaffRouteGuard capability="social.inbox">{children}</StaffRouteGuard>;
}
