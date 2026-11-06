import { requirePermission } from "@/lib/auth/context";
import { Card, PageHeader, Notice } from "@/components/ui/card";
import { Flash } from "@/components/ui/flash";
import { SkillForm } from "../skill-form";
import { createSkillAction } from "../../knowledge/actions";

export const dynamic = "force-dynamic";

export default async function NewSkillPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  await requirePermission("skill.edit");
  const sp = await searchParams;
  return (
    <div className="anim-rise">
      <PageHeader eyebrow="Skills" title="New skill" description="Instruction-only skills shape how an employee works in conversation. Executable skills are linked to a workflow in code by an engineer." />
      <Flash ok={sp.ok} error={sp.error} />
      <div className="mb-4"><Notice tone="neutral">A new skill starts as a draft. An admin approves it before employees include it in their instructions.</Notice></div>
      <Card><SkillForm skill={null} version={null} action={createSkillAction} submitLabel="Create draft skill" /></Card>
    </div>
  );
}
