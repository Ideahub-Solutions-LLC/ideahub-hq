import type { Department, Employee, User } from "@/db/schema";
import { SENIORITY_LEVELS } from "@/db/schema";
import { SubmitButton } from "@/components/ui/button";

/** Identity + personality form. Deliberately contains no permissions or model settings. */
export function EmployeeProfileForm({ employee, departments, people, action, submitLabel }: { employee: Employee | null; departments: Department[]; people: User[]; action: (fd: FormData) => Promise<void>; submitLabel: string }) {
  const p = employee?.personality;
  return (
    <form action={action} className="space-y-6">
      <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-semibold text-ink">Identity</legend>
        <div>
          <label className="label" htmlFor="name">Name</label>
          <input id="name" name="name" required minLength={2} maxLength={60} defaultValue={employee?.name ?? ""} className="input" />
          <p className="hint">Shown with an “AI” label everywhere. Never present an employee as a human.</p>
        </div>
        <div>
          <label className="label" htmlFor="roleTitle">Role title</label>
          <input id="roleTitle" name="roleTitle" required minLength={2} maxLength={80} defaultValue={employee?.roleTitle ?? ""} className="input" placeholder="AI Operations Coordinator" />
        </div>
        <div>
          <label className="label" htmlFor="departmentId">Department</label>
          <select id="departmentId" name="departmentId" defaultValue={employee?.departmentId ?? ""} className="select">
            <option value="">— None —</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="managerUserId">Human manager (accountable owner)</label>
          <select id="managerUserId" name="managerUserId" defaultValue={employee?.managerUserId ?? ""} className="select">
            <option value="">— Unassigned —</option>
            {people.map((u) => (
              <option key={u.id} value={u.id}>{u.name}{u.title ? ` · ${u.title}` : ""}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="seniority">Seniority (evidence-based operating mode)</label>
          <select id="seniority" name="seniority" defaultValue={employee?.seniority ?? "trainee"} className="select">
            {SENIORITY_LEVELS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <p className="hint">Trainee: drafts only, every output reviewed. Promotion is a configuration change backed by evaluations — it never grants access by itself.</p>
        </div>
        <div>
          <label className="label" htmlFor="channels">Communication channels (comma-separated)</label>
          <input id="channels" name="channels" defaultValue={employee?.channels.join(", ") ?? "web"} className="input" placeholder="web, slack:#ops (demo)" />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="bio">Job description / scope</label>
          <textarea id="bio" name="bio" required maxLength={1200} defaultValue={employee?.bio ?? ""} className="textarea" />
        </div>
      </fieldset>

      <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-semibold text-ink">Personality & working style <span className="ml-2 font-normal text-ink-3">style only — grants no permissions</span></legend>
        <div>
          <label className="label" htmlFor="tone">Tone</label>
          <select id="tone" name="tone" defaultValue={p?.tone ?? "warm"} className="select">
            <option value="warm">Warm</option>
            <option value="neutral">Neutral</option>
            <option value="direct">Direct</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="verbosity">Verbosity</label>
          <select id="verbosity" name="verbosity" defaultValue={p?.verbosity ?? "concise"} className="select">
            <option value="concise">Concise</option>
            <option value="balanced">Balanced</option>
            <option value="detailed">Detailed</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="reportingFormat">Reporting format</label>
          <select id="reportingFormat" name="reportingFormat" defaultValue={p?.reportingFormat ?? "bullets"} className="select">
            <option value="bullets">Bullets</option>
            <option value="narrative">Narrative</option>
            <option value="table">Table</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="questionStyle">How it asks questions</label>
          <select id="questionStyle" name="questionStyle" defaultValue={p?.questionStyle ?? "ask_before_acting"} className="select">
            <option value="ask_before_acting">Ask before acting</option>
            <option value="batch_questions">Batch questions at the end</option>
            <option value="assume_and_flag">Assume and flag assumptions</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="personalitySummary">Personality summary</label>
          <textarea id="personalitySummary" name="personalitySummary" required maxLength={600} defaultValue={p?.summary ?? ""} className="textarea" placeholder="Calm, precise and explicit about uncertainty…" />
        </div>
      </fieldset>

      <div className="flex justify-end">
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
