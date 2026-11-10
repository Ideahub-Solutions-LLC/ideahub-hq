import type { WorkRecord, WorkRecordKind } from "@/db/schema";
import { CONTENT_TYPES, DEAL_STAGES } from "@/lib/workspace/records";
import {
  ScopeFields,
  type ScopeEmployee,
  type ScopeTeam,
} from "./scope-fields";
import { RecordForm } from "./record-form";
import { EventFields } from "./event-fields";
import { SubmitButton } from "@/components/ui/button";
import { saveWorkRecordAction } from "@/app/(app)/work/actions";
export function RecordEditor({
  kind,
  row,
  teams,
  staff,
  companies = [],
  parentId = null,
  departmentId = "",
  employeeId = "",
  contentType = "document",
}: {
  kind: WorkRecordKind;
  row?: WorkRecord;
  teams: ScopeTeam[];
  staff: ScopeEmployee[];
  companies?: { id: string; title: string }[];
  parentId?: string | null;
  departmentId?: string;
  employeeId?: string;
  contentType?: string;
}) {
  const prefix = `record-${kind}`;
  const data = row?.data ?? {};
  const input = (name: string, label: string, max = 300, type = "text") => (
    <div key={name}>
      <label className="label" htmlFor={`${prefix}-${name}`}>
        {label}
      </label>
      <input
        className="input"
        id={`${prefix}-${name}`}
        name={name}
        type={type}
        maxLength={max}
        defaultValue={String(data[name] ?? "")}
      />
    </div>
  );
  return (
    <RecordForm
      action={saveWorkRecordAction.bind(null, kind, row?.id ?? null)}
      event={kind === "event"}
    >
      <input type="hidden" name="version" value={row?.version ?? 0} />
      <input
        type="hidden"
        name="parentId"
        value={row?.parentId ?? parentId ?? ""}
      />
      <div className="sm:col-span-2">
        <label className="label" htmlFor={`${prefix}-title`}>
          {kind === "mail"
            ? "Subject"
            : kind === "contact"
              ? "Full name"
              : kind === "company"
                ? "Company name"
                : "Title"}
        </label>
        <input
          className="input"
          name="title"
          id={`${prefix}-title`}
          required
          minLength={1}
          maxLength={180}
          defaultValue={row?.title ?? ""}
        />
      </div>
      <ScopeFields
        teams={teams}
        staff={staff}
        departmentId={row?.departmentId ?? departmentId}
        employeeId={row?.employeeId ?? employeeId}
        prefix={prefix}
      />
      {kind === "folder" && (
        <div className="sm:col-span-2">
          {input("description", "Folder description", 500)}
        </div>
      )}
      {kind === "file" && (
        <div className="sm:col-span-2">
          {input("fileName", "Download file name", 180)}
          <p className="hint">
            Use a simple name such as notes.md. This editor creates a text
            document.
          </p>
        </div>
      )}
      {kind === "event" && <EventFields data={row?.data} />}
      {kind === "company" && (
        <>
          {input("website", "Website", 500, "url")}
          {input("industry", "Industry", 120)}
        </>
      )}
      {kind === "contact" && (
        <>
          {input("email", "Email", 254, "email")}
          {input("phone", "Phone", 80)}
          {input("jobTitle", "Job title", 120)}
        </>
      )}
      {["contact", "deal"].includes(kind) && (
        <div>
          <label className="label" htmlFor={`${prefix}-companyId`}>
            Company
          </label>
          <select
            className="select"
            id={`${prefix}-companyId`}
            name="companyId"
            defaultValue={String(data.companyId ?? "")}
          >
            <option value="">No company linked</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </div>
      )}
      {kind === "deal" && (
        <>
          <div>
            <label className="label" htmlFor={`${prefix}-stage`}>
              Pipeline stage
            </label>
            <select
              className="select"
              id={`${prefix}-stage`}
              name="stage"
              defaultValue={String(data.stage ?? "lead")}
            >
              {DEAL_STAGES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor={`${prefix}-value`}>
              Deal value
            </label>
            <input
              className="input"
              id={`${prefix}-value`}
              name="value"
              inputMode="decimal"
              required
              pattern="[0-9]{1,9}(\.[0-9]{1,2})?"
              defaultValue={String(Number(data.valueCents ?? 0) / 100)}
            />
          </div>
          <div>
            <label className="label" htmlFor={`${prefix}-currency`}>
              Currency
            </label>
            <input
              className="input"
              id={`${prefix}-currency`}
              name="currency"
              required
              pattern="[A-Za-z]{3}"
              maxLength={3}
              defaultValue={String(data.currency ?? "USD")}
            />
          </div>
        </>
      )}
      {kind === "content" && (
        <>
          <div>
            <label className="label" htmlFor={`${prefix}-contentType`}>
              Content type
            </label>
            <select
              className="select"
              id={`${prefix}-contentType`}
              name="contentType"
              defaultValue={String(data.contentType ?? contentType)}
            >
              {CONTENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </div>
          {input("channel", "Intended channel", 100)}
        </>
      )}
      {kind === "mail" && (
        <div className="sm:col-span-2">{input("to", "To", 254, "email")}</div>
      )}
      {["file", "content", "mail"].includes(kind) && (
        <div className="sm:col-span-2">
          <label className="label" htmlFor={`${prefix}-body`}>
            {kind === "mail" ? "Message draft" : "Content"}
          </label>
          <textarea
            className="textarea min-h-48"
            id={`${prefix}-body`}
            name="body"
            maxLength={kind === "file" ? 200000 : 50000}
            defaultValue={String(data.body ?? "")}
          />
        </div>
      )}
      {["event", "company", "contact", "deal"].includes(kind) && (
        <div className="sm:col-span-2">
          <label className="label" htmlFor={`${prefix}-notes`}>
            Notes
          </label>
          <textarea
            className="textarea"
            id={`${prefix}-notes`}
            name="notes"
            maxLength={10000}
            defaultValue={String(data.notes ?? "")}
          />
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 sm:col-span-2">
        <p className="text-xs text-ink-3">
          Saved inside this workspace. No external delivery, invitations or
          synchronization.
        </p>
        <SubmitButton>
          {kind === "mail"
            ? "Save shared draft"
            : row
              ? "Save changes"
              : kind === "folder"
                ? "Create folder"
                : "Save record"}
        </SubmitButton>
      </div>
    </RecordForm>
  );
}
