import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/context";
import { contentReadiness, isContentEmployee } from "@/lib/services/content";
import { resolveProvider } from "@/lib/providers";
import { newId } from "@/lib/ids";
import { Card, CardTitle, Notice, PageHeader } from "@/components/ui/card";
import { Flash } from "@/components/ui/flash";
import { SubmitButton } from "@/components/ui/button";
import { submitContentBrief } from "../actions";

export const dynamic = "force-dynamic";
export default async function ContentBriefPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const ctx = await requirePermission("task.run_workflow");
  const { id } = await params;
  const ready = contentReadiness(ctx.db, ctx.workspace.id, id);
  if (!isContentEmployee(ready.employee.roleTitle)) notFound();
  const resolved = resolveProvider(ready.employee.modelConfig);
  return <div className="space-y-6">
    <PageHeader eyebrow={<Link href={`/employees/${id}/workspace`}>{ready.employee.name} · content desk</Link>} title="Assign a content brief" description="Brief → source reading → draft → human review. Nothing is published or sent." />
    <Flash error={(await searchParams).error} />
    <Notice tone={resolved.adapter.key === "demo" ? "amber" : "neutral"} title={resolved.adapter.key === "demo" ? "Offline Demo provider" : `Configured provider: ${resolved.adapter.key}`}>
      {resolved.adapter.key === "demo" ? "Drafts use the actual workflow and review queue, with deterministic source excerpts. They are not live AI writing. Configure and qualify a provider before real content work." : "Model output requires human review. Claim checks verify quote presence, not meaning or completeness."}
    </Notice>
    {ready.problems.length > 0 && <Card><CardTitle>Before this employee can run</CardTitle><ul className="list-disc space-y-2 pl-5 text-sm text-ink-2">{ready.problems.map((problem) => <li key={problem}>{problem}</li>)}</ul><div className="mt-4 flex flex-wrap gap-3"><Link className="btn btn-secondary btn-sm" href={`/employees/${id}/edit`}>Employee settings</Link><Link className="btn btn-secondary btn-sm" href={`/employees/${id}/development`}>Prepare / review workflow skill</Link><Link className="btn btn-secondary btn-sm" href="/knowledge">Review sources</Link></div></Card>}
    <Card><CardTitle description="Select only sources the employee is already allowed to use. The selected brand guide is included automatically.">Content brief</CardTitle>
      <form action={submitContentBrief.bind(null, id)} className="space-y-5">
        <input type="hidden" name="submissionKey" value={newId("brief")} />
        <div><label className="label" htmlFor="title">Content title</label><input className="input" id="title" name="title" required minLength={3} maxLength={120} /></div>
        <div><label className="label" htmlFor="brief">Brief and deliverable</label><textarea className="textarea" id="brief" name="brief" required minLength={20} maxLength={6000} placeholder="What should be drafted? Include the approved message and constraints." /></div>
        <div className="grid gap-4 sm:grid-cols-2"><div><label className="label" htmlFor="audience">Audience</label><input className="input" id="audience" name="audience" required minLength={3} maxLength={300} /></div><div><label className="label" htmlFor="channel">Intended content channel</label><input className="input" id="channel" name="channel" required minLength={2} maxLength={100} placeholder="LinkedIn draft, newsletter draft…" /></div></div>
        <div><label className="label" htmlFor="objective">Objective</label><input className="input" id="objective" name="objective" required minLength={3} maxLength={500} /></div>
        <div><label className="label" htmlFor="callToAction">Call to action</label><input className="input" id="callToAction" name="callToAction" required minLength={3} maxLength={300} /></div>
        <div><label className="label" htmlFor="brandGuideId">Approved brand guide</label><select className="select" id="brandGuideId" name="brandGuideId" required defaultValue=""><option value="" disabled>Select the current brand guide…</option>{ready.sources.map((source) => <option key={source.id} value={source.id}>{source.title} · v{source.version}</option>)}</select></div>
        <fieldset><legend className="label">Additional approved evidence</legend><div className="space-y-2">{ready.sources.map((source) => <label key={source.id} className="flex items-center gap-2 text-sm text-ink-2"><input type="checkbox" name="sourceIds" value={source.id} />{source.title} · v{source.version}</label>)}</div></fieldset>
        <SubmitButton disabled={ready.problems.length > 0} pendingText="Queuing brief…">Queue draft and watch in office</SubmitButton>
        <p className="hint">The worker saves source versions, stage history and a review request. Accepting the draft has no external effect. Teams is a later step.</p>
      </form>
    </Card>
  </div>;
}
