import { redirect } from "next/navigation";
import { currentAdmin } from "@/lib/server/admin-auth";
import AdminDashboard from "@/components/admin-dashboard";

export const dynamic = "force-dynamic";
export default async function AdminPage() {
  const admin = await currentAdmin().catch(() => null);
  if (!admin) redirect("/admin/login");
  return <AdminDashboard login={admin.login}/>;
}
