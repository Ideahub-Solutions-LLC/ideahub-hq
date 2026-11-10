import {
  ScopeFields,
  type ScopeEmployee,
  type ScopeTeam,
} from "./scope-fields";
import { SubmitButton } from "@/components/ui/button";
export function ScopeBar({
  teams,
  staff,
  departmentId,
  employeeId,
  q = "",
  hidden = {},
}: {
  teams: ScopeTeam[];
  staff: ScopeEmployee[];
  departmentId?: string;
  employeeId?: string;
  q?: string;
  hidden?: Record<string, string | undefined>;
}) {
  return (
    <form
      method="get"
      className="mb-5 grid items-end gap-3 rounded-2xl border border-line bg-surface p-4 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1.5fr_auto]"
    >
      {Object.entries(hidden).map(([key, value]) =>
        value ? (
          <input key={key} type="hidden" name={key} value={value} />
        ) : null,
      )}
      <ScopeFields
        teams={teams}
        staff={staff}
        departmentId={departmentId}
        employeeId={employeeId}
        prefix="filter"
      />
      <div className="min-w-0">
        <label className="label" htmlFor="workspace-search">
          Search this area
        </label>
        <input
          className="input"
          id="workspace-search"
          name="q"
          type="search"
          maxLength={200}
          defaultValue={q}
          placeholder="Search titles and details…"
        />
      </div>
      <SubmitButton variant="secondary">Apply filters</SubmitButton>
    </form>
  );
}
