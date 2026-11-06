import { requirePermission } from "@/lib/auth/context";
import { AdminTabs } from "./admin-tabs";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requirePermission("admin.members");
  return (
    <div className="anim-rise">
      <AdminTabs />
      {children}
    </div>
  );
}
