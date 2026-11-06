"use client";

import { usePathname } from "next/navigation";
import { LinkTabs } from "@/components/ui/card";

export function AdminTabs() {
  const pathname = usePathname();
  return (
    <LinkTabs
      tabs={[
        { href: "/admin", label: "Controls" },
        { href: "/admin/members", label: "Members & roles" },
        { href: "/admin/permissions", label: "Employee permissions" },
        { href: "/admin/providers", label: "Model providers" },
        { href: "/admin/usage", label: "Usage & budgets" },
        { href: "/admin/audit", label: "Audit log" },
      ]}
      current={pathname}
    />
  );
}
