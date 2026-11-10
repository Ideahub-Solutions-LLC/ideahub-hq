"use client";
import { useState } from "react";
export type ScopeTeam = { id: string; name: string };
export type ScopeEmployee = {
  id: string;
  name: string;
  departmentId: string | null;
};
export function ScopeFields({
  teams,
  staff,
  departmentId = "",
  employeeId = "",
  prefix = "scope",
}: {
  teams: ScopeTeam[];
  staff: ScopeEmployee[];
  departmentId?: string;
  employeeId?: string;
  prefix?: string;
}) {
  const [team, setTeam] = useState(departmentId);
  const [employee, setEmployee] = useState(employeeId);
  return (
    <>
      <div className="min-w-0">
        <label className="label" htmlFor={`${prefix}-department`}>
          Team
        </label>
        <select
          className="select"
          id={`${prefix}-department`}
          name="departmentId"
          value={team}
          onChange={(e) => {
            setTeam(e.target.value);
            setEmployee("");
          }}
        >
          <option value="">Organization · all teams</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>
      <div className="min-w-0">
        <label className="label" htmlFor={`${prefix}-employee`}>
          AI employee
        </label>
        <select
          className="select"
          id={`${prefix}-employee`}
          name="employeeId"
          value={employee}
          onChange={(e) => setEmployee(e.target.value)}
        >
          <option value="">All employees</option>
          {staff
            .filter((e) => !team || e.departmentId === team)
            .map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
        </select>
      </div>
    </>
  );
}
