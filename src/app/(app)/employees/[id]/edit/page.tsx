import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { requirePermission } from "@/lib/auth/context";
import { getEmployee } from "@/lib/services/employees";
import { can } from "@/lib/authz";
import { ACTION_TYPES, PROVIDERS, departments, knowledgeSources, skills, users, workspaceMembers } from "@/db/schema";
import { Card, CardTitle, LinkTabs, PageHeader, Notice } from "@/components/ui/card";
import { Flash } from "@/components/ui/flash";
import { SubmitButton } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmployeeProfileForm } from "../../employee-form";
import { updateAuthorityAction, updateKnowledgeAction, updateModelConfigAction, updateProfileAction, updateSkillsAction } from "../../actions";
import { ACTION_TYPE_LABEL } from "@/lib/format";
import { listProviders } from "@/lib/providers";
import { getOperatingBrief } from "@/lib/services/hq-profile";
import { getProviderCatalog, modelAccess } from "@/lib/services/provider-catalog";
import { saveOperatingBriefAction } from "../setup/actions";

export const dynamic = "force-dynamic";

export default async function EditEmployeePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; ok?: string; error?: string }> }) {
  const { db, workspace, role } = await requirePermission("employee.edit");
  const { id } = await params;
  const sp = await searchParams;
  const e = getEmployee(db, workspace.id, id);
  if (!e) notFound();
  const tab = sp.tab ?? "profile";
  const depts = db.select().from(departments).where(eq(departments.workspaceId, workspace.id)).all();
  const people = db.select({ user: users }).from(workspaceMembers).innerJoin(users, eq(users.id, workspaceMembers.userId)).where(eq(workspaceMembers.workspaceId, workspace.id)).all().map((r) => r.user);
  const allSkills = db.select().from(skills).where(eq(skills.workspaceId, workspace.id)).all();
  const allSources = db.select().from(knowledgeSources).where(eq(knowledgeSources.workspaceId, workspace.id)).all();
  const providers = listProviders();
  const operating = getOperatingBrief(db, workspace.id, id);
  const catalogs = providers.flatMap(p => (getProviderCatalog(db, workspace.id, p.key)?.models ?? []).map(m => ({ ...m, provider: p.key })));
  const access = modelAccess(db, workspace.id, e.modelConfig.provider, e.modelConfig.model);
  const base = `/employees/${e.id}/edit`;
  const tabs = [
    { href: base, label: "Profile & personality" },
    { href: `${base}?tab=operating`, label: "Operating brief" },
    { href: `${base}?tab=skills`, label: "Skills" },
    { href: `${base}?tab=knowledge`, label: "Knowledge" },
    ...(can(role, "employee.authority.edit") ? [{ href: `${base}?tab=authority`, label: "Authority" }] : []),
    ...(can(role, "employee.model.edit") ? [{ href: `${base}?tab=model`, label: "Model & budget" }] : []),
  ];
  const current = tab === "profile" ? base : `${base}?tab=${tab}`;

  return (
    <div className="anim-rise">
      <PageHeader eyebrow={<Link href={`/employees/${e.id}`} className="hover:underline">{e.name}</Link>} title={`Edit ${e.name}`} description="Each section is stored separately. Saving creates a new configuration version and an audit record." />
      <Flash ok={sp.ok} error={sp.error} />
      <LinkTabs tabs={tabs} current={current} />

      {tab === "profile" && (
        <Card>
          <EmployeeProfileForm employee={e} departments={depts} people={people} action={updateProfileAction.bind(null, e.id)} submitLabel="Save profile" />
        </Card>
      )}

      {tab === "operating" && <Card><CardTitle description="Define the role before assigning live models and tools. A new or edited brief stays draft until an owner/admin reviews it.">Operating brief {operating ? `· v${operating.version} · ${operating.status}` : ""}</CardTitle><form action={saveOperatingBriefAction.bind(null, e.id)} className="space-y-5">
        <div><label className="label" htmlFor="mission">Mission</label><textarea className="textarea" id="mission" name="mission" required minLength={10} maxLength={1200} defaultValue={operating?.body.mission ?? ""} placeholder="What should this employee help the team achieve?" /></div>
        {([{ key: "responsibilities", label: "Responsibilities", placeholder: "One responsibility per line" }, { key: "deliverables", label: "Expected deliverables", placeholder: "One output type per line" }, { key: "escalationRules", label: "Escalation rules", placeholder: "When should it stop and ask its human manager? One rule per line." }] as const).map(field => <div key={field.key}><label className="label" htmlFor={field.key}>{field.label}</label><textarea className="textarea" id={field.key} name={field.key} required maxLength={4800} defaultValue={operating?.body[field.key].join("\n") ?? ""} placeholder={field.placeholder} /><p className="hint">1–12 lines, up to 400 characters each.</p></div>)}
        <div><label className="label" htmlFor="qualityBar">Quality and acceptance criteria</label><textarea className="textarea" id="qualityBar" name="qualityBar" required minLength={10} maxLength={1200} defaultValue={operating?.body.qualityBar ?? ""} /></div><Notice tone="neutral">This brief shapes chat instructions only after review. It does not grant tool access or replace approved skills and knowledge.</Notice><SubmitButton>Save draft operating brief</SubmitButton></form></Card>}

      {tab === "skills" && (
        <Card>
          <form action={updateSkillsAction.bind(null, e.id)} className="space-y-4">
            <p className="text-sm text-ink-2">Select the versioned skills this employee may use. Only <strong>approved</strong> skills are included in its instructions.</p>
            <ul className="divide-y divide-line">
              {allSkills.map((s) => (
                <li key={s.id} className="flex items-center gap-3 py-2.5">
                  <input type="checkbox" id={`skill-${s.id}`} name="skillIds" value={s.id} defaultChecked={e.skills.some((x) => x.skillId === s.id)} className="h-4 w-4 accent-[var(--accent)]" />
                  <label htmlFor={`skill-${s.id}`} className="flex-1 text-sm text-ink">
                    {s.name} <span className="text-ink-3">· {s.purpose}</span>
                  </label>
                  <Badge>v{s.currentVersion}</Badge>
                  <Badge tone={s.status === "approved" ? "emerald" : "amber"}>{s.status}</Badge>
                </li>
              ))}
            </ul>
            <div className="flex justify-end"><SubmitButton>Save skills</SubmitButton></div>
          </form>
        </Card>
      )}

      {tab === "knowledge" && (
        <Card>
          <form action={updateKnowledgeAction.bind(null, e.id)} className="space-y-4">
            <p className="text-sm text-ink-2">Grant access to knowledge sources. Retrieval only ever returns <strong>approved</strong> sources from this list — pending or stale sources are never used.</p>
            <ul className="divide-y divide-line">
              {allSources.map((s) => (
                <li key={s.id} className="flex items-center gap-3 py-2.5">
                  <input type="checkbox" id={`src-${s.id}`} name="sourceIds" value={s.id} defaultChecked={e.knowledge.some((x) => x.knowledgeSourceId === s.id)} className="h-4 w-4 accent-[var(--accent)]" />
                  <label htmlFor={`src-${s.id}`} className="flex-1 text-sm text-ink">
                    {s.title} <span className="text-ink-3">· {s.type.replace(/_/g, " ")}</span>
                  </label>
                  <Badge tone={s.reviewStatus === "approved" ? "emerald" : s.reviewStatus === "stale" ? "rose" : "amber"}>{s.reviewStatus}</Badge>
                </li>
              ))}
            </ul>
            <div className="flex justify-end"><SubmitButton>Save knowledge access</SubmitButton></div>
          </form>
        </Card>
      )}

      {tab === "authority" && can(role, "employee.authority.edit") && (
        <Card>
          <form action={updateAuthorityAction.bind(null, e.id)} className="space-y-5">
            <Notice tone="accent">Authority is enforced on the server. Personality, prompts and documents can never widen it. Every allowed action still needs a human approval before execution.</Notice>
            <fieldset>
              <legend className="label">Actions this employee may propose</legend>
              <ul className="space-y-2">
                {ACTION_TYPES.map((a) => (
                  <li key={a} className="flex items-center gap-3">
                    <input type="checkbox" id={`act-${a}`} name="allowedActionTypes" value={a} defaultChecked={e.authority.allowedActionTypes.includes(a)} className="h-4 w-4 accent-[var(--accent)]" />
                    <label htmlFor={`act-${a}`} className="text-sm text-ink">{ACTION_TYPE_LABEL[a]}</label>
                  </li>
                ))}
              </ul>
            </fieldset>
            <div>
              <label className="label" htmlFor="forbiddenActions">Never (one per line)</label>
              <textarea id="forbiddenActions" name="forbiddenActions" defaultValue={e.authority.forbiddenActions.join("\n")} className="textarea" />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="flex items-center gap-3 text-sm">
                <input type="checkbox" name="requireReviewForDrafts" defaultChecked={e.authority.requireReviewForDrafts} className="h-4 w-4 accent-[var(--accent)]" /> Every draft must be reviewed by a human
              </label>
              <div>
                <label className="label" htmlFor="maxActionsPerTask">Max proposed actions per task</label>
                <input id="maxActionsPerTask" name="maxActionsPerTask" type="number" min={1} max={50} defaultValue={e.authority.maxActionsPerTask} className="input" />
              </div>
            </div>
            <div className="flex justify-end"><SubmitButton>Save authority policy</SubmitButton></div>
          </form>
        </Card>
      )}

      {tab === "model" && can(role, "employee.model.edit") && (
        <Card>
          <form action={updateModelConfigAction.bind(null, e.id)} className="space-y-5">
            <Notice tone="neutral">Credentials never live here. Provider keys are read from server environment variables; this form only chooses which configured provider and model the employee uses. Output quality is not guaranteed to be identical across providers.</Notice>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><div><label className="label" htmlFor="openaiApi">OpenAI API mode (also applies to fallback)</label><select className="select" id="openaiApi" name="openaiApi" defaultValue={e.modelConfig.openaiApi ?? "chat_completions"}><option value="chat_completions">Chat Completions · existing behavior</option><option value="responses">Responses · text generation</option></select></div><label className="flex items-center gap-2 text-sm"><input type="checkbox" name="omitTemperature" defaultChecked={e.modelConfig.omitTemperature ?? false} />Omit temperature for models that do not support it</label></div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="provider">Provider</label>
                <select id="provider" name="provider" defaultValue={e.modelConfig.provider} className="select">
                  {PROVIDERS.map((p) => {
                    const info = providers.find((x) => x.key === p);
                    return (
                      <option key={p} value={p}>{info?.displayName ?? p} {info?.configured ? "· configured" : p === "demo" ? "" : "· not configured"}</option>
                    );
                  })}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="model">Model</label>
                <input id="model" name="model" required list="available-model-ids" defaultValue={e.modelConfig.model} className="input" /><datalist id="available-model-ids">{catalogs.map(m => <option key={`${m.provider}:${m.id}`} value={m.id}>{m.provider} · {m.label}</option>)}</datalist><p className="hint">{access.detail}</p><Link className="text-xs text-accent hover:underline" href="/admin/providers">Refresh provider model access</Link>
              </div>
              <div>
                <label className="label" htmlFor="temperature">Temperature (0–1)</label>
                <input id="temperature" name="temperature" type="number" step="0.1" min={0} max={1} defaultValue={e.modelConfig.temperature} className="input" />
              </div>
              <div>
                <label className="label" htmlFor="maxOutputTokens">Max output tokens</label>
                <input id="maxOutputTokens" name="maxOutputTokens" type="number" min={64} max={16000} defaultValue={e.modelConfig.maxOutputTokens} className="input" />
              </div>
              <div>
                <label className="label" htmlFor="fallbackProvider">Fallback provider (optional)</label>
                <select id="fallbackProvider" name="fallbackProvider" defaultValue={e.modelConfig.fallbackProvider ?? ""} className="select">
                  <option value="">None — no alternative live provider</option>
                  {PROVIDERS.filter((p) => p !== "demo").map((p) => (
                    <option key={p} value={p}>{providers.find((x) => x.key === p)?.displayName ?? p}</option>
                  ))}
                </select>
                <p className="hint">Current routing uses this provider when the primary credential is missing. Runtime API errors are surfaced; they do not automatically retry on another provider. Missing credentials can still resolve to labeled Offline Demo.</p>
              </div>
              <div>
                <label className="label" htmlFor="fallbackModel">Fallback model</label>
                <input id="fallbackModel" name="fallbackModel" list="available-model-ids" defaultValue={e.modelConfig.fallbackModel ?? ""} className="input" />
              </div>
              <div>
                <label className="label" htmlFor="perTaskBudgetCents">Per-task budget (cents, blank = none)</label>
                <input id="perTaskBudgetCents" name="perTaskBudgetCents" type="number" min={0} defaultValue={e.modelConfig.perTaskBudgetCents ?? ""} className="input" />
              </div>
              <div>
                <label className="label" htmlFor="monthlyBudgetCents">Monthly budget (cents, blank = none)</label>
                <input id="monthlyBudgetCents" name="monthlyBudgetCents" type="number" min={0} defaultValue={e.modelConfig.monthlyBudgetCents ?? ""} className="input" />
                <p className="hint">Budgets are enforced from cost estimates, which require a pricing table (PROVIDER_PRICING_JSON). Without one, units are recorded but cost caps cannot be enforced.</p>
              </div>
            </div>
            <div className="flex justify-end"><SubmitButton>Save model configuration</SubmitButton></div>
          </form>
        </Card>
      )}
    </div>
  );
}
