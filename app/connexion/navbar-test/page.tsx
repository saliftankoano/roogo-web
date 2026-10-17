import { notFound } from "next/navigation";
import { NavbarBrowserFixture } from "../../../components/NavbarBrowserFixture";

export default function NavbarTestPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <NavbarBrowserFixture />;
}
