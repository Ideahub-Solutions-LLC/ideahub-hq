import { and, eq, ne } from "drizzle-orm";
import type { Db } from "@/db/client";
import { departments, employees } from "@/db/schema";
import { validateWorkScope } from "./workspace-records";
export type WorkParams = {
  departmentId?: string;
  employeeId?: string;
  q?: string;
  view?: string;
  tab?: string;
  folder?: string;
  month?: string;
  zone?: string;
  record?: string;
  artifact?: string;
  ok?: string;
  error?: string;
  archived?: string;
};
export function workContext(db: Db, workspaceId: string, params: WorkParams) {
  const scope = {
    departmentId: params.departmentId || null,
    employeeId: params.employeeId || null,
  };
  validateWorkScope(db, workspaceId, scope);
  return {
    scope,
    teams: db
      .select({ id: departments.id, name: departments.name })
      .from(departments)
      .where(eq(departments.workspaceId, workspaceId))
      .all(),
    staff: db
      .select({
        id: employees.id,
        name: employees.name,
        departmentId: employees.departmentId,
      })
      .from(employees)
      .where(
        and(
          eq(employees.workspaceId, workspaceId),
          ne(employees.status, "archived"),
        ),
      )
      .all(),
  };
}
export function workUrl(
  path: string,
  params: Record<string, string | null | undefined>,
) {
  const query = new URLSearchParams(
    Object.entries(params).filter(
      (entry): entry is [string, string] => !!entry[1],
    ),
  );
  return query.size ? `${path}?${query}` : path;
}
