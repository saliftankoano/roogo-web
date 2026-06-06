import { Metadata } from "next";
import { AdminNavbar } from "../../components/admin/AdminNavbar";
import { Footer } from "../../components/Footer";
import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import {
  getUserTypeFromMetadata,
  isStaffLikeUserType,
} from "@/lib/user-types";

export const metadata: Metadata = {
  title: "Administration | Roogo",
  description: "Tableau de bord administratif Roogo",
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId } = await auth();

  if (!userId) {
    redirect("/connexion");
  }

  // Double check user metadata for staff role
  const user = await currentUser();
  const userType = getUserTypeFromMetadata(user?.publicMetadata);

  if (!isStaffLikeUserType(userType)) {
    redirect("/");
  }

  return (
    <div className="min-h-screen flex flex-col bg-neutral-50/50">
      <AdminNavbar />
      <div className="grow container mx-auto px-6 pt-40 pb-12">
        {children}
      </div>
      <Footer />
    </div>
  );
}
