"use server";

import { requirePermission } from "@/lib/auth/context";
import { assertCan } from "@/lib/authz";
import { describeError, flashRedirect } from "@/lib/actions-util";
import { prepareEmployeeDevelopment } from "@/lib/services/employee-development";

export async function prepareDevelopmentAction(employeeId: string) {
  const { db, workspace, user, role } = await requirePermission("employee.edit");
  assertCan(role, "skill.edit");
  let created = 0;
  let assigned = 0;
  try {
    const result = prepareEmployeeDevelopment(db, { workspaceId: workspace.id, employeeId, userId: user.id });
    created = result.created;
    assigned = result.assigned;
  } catch (error) {
    flashRedirect(`/employees/${employeeId}/development`, { error: describeError(error) });
  }
  flashRedirect(`/employees/${employeeId}/development`, {
    ok: created || assigned
      ? `${created} skill drafts prepared; ${assigned} assignments added. Human approval is still required. Employee status and permissions are unchanged.`
      : "These skill drafts are already prepared. Existing instructions and reviews were preserved.",
  });
}
