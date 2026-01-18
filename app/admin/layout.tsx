import { Metadata } from "next";
import { AdminNavbar } from "../../components/admin/AdminNavbar";
import { Footer } from "../../components/Footer";
import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

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
    redirect("/sign-in");
  }

  // Double check user metadata for staff role
  const user = await currentUser();
  const userType = user?.publicMetadata?.userType;

  if (userType !== "staff") {
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
