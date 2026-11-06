import { eq } from "drizzle-orm";
import { requirePermission } from "@/lib/auth/context";
import { departments, users, workspaceMembers } from "@/db/schema";
import { Card, PageHeader, Notice } from "@/components/ui/card";
import { Flash } from "@/components/ui/flash";
import { EmployeeProfileForm } from "../employee-form";
import { createEmployeeAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewEmployeePage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { db, workspace } = await requirePermission("employee.create");
  const sp = await searchParams;
  const depts = db.select().from(departments).where(eq(departments.workspaceId, workspace.id)).all();
  const people = db.select({ user: users }).from(workspaceMembers).innerJoin(users, eq(users.id, workspaceMembers.userId)).where(eq(workspaceMembers.workspaceId, workspace.id)).all().map((r) => r.user);
  return (
    <div className="anim-rise">
      <PageHeader eyebrow="Directory" title="New AI employee" description="Creates a draft profile with least-privilege defaults. An admin widens authority and sets the model separately." />
      <Flash ok={sp.ok} error={sp.error} />
      <div className="mb-4">
        <Notice tone="accent">New employees start as <strong>Draft</strong>, can only request draft reviews, and run on the workspace default model. Activate from the profile page once a human manager is assigned.</Notice>
      </div>
      <Card>
        <EmployeeProfileForm employee={null} departments={depts} people={people} action={createEmployeeAction} submitLabel="Create draft profile" />
      </Card>
    </div>
  );
}
