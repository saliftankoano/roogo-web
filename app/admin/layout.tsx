import { Metadata } from "next";
import { Navbar } from "../../components/Navbar";
import { Footer } from "../../components/Footer";
import { auth } from "@clerk/nextjs/server";
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

  // Ideally, we would check if the user has 'staff' or 'admin' role here.
  // For now, we'll assume any logged-in user can access (as per prototyping)
  // or you can implement a role check:
  /*
  const user = await currentUser();
  const userRole = user?.publicMetadata?.role;
  if (userRole !== 'staff' && userRole !== 'admin') {
    redirect('/');
  }
  */

  return (
    <div className="min-h-screen flex flex-col bg-neutral-50">
      <Navbar />
      <div className="flex-grow container mx-auto px-4 pt-28 pb-12">
        {children}
      </div>
      <Footer />
    </div>
  );
}
