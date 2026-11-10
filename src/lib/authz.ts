import type { WorkspaceRole } from "@/db/schema";

/**
 * Server-enforced permission matrix. The UI may hide controls, but every mutation
 * re-checks `can(role, permission)` on the server (see src/lib/auth/context.ts).
 *
 * Roles: owner > admin > manager > member (least privilege by default).
 */
export const PERMISSIONS = {
  "workspace.view": ["owner", "admin", "manager", "member"],
  "workspace.records.create": ["owner", "admin", "manager", "member"],
  "workspace.records.manage": ["owner", "admin", "manager"],
  "employee.create": ["owner", "admin", "manager"],
  "employee.edit": ["owner", "admin", "manager"],
  "employee.pause": ["owner", "admin", "manager"],
  "employee.archive": ["owner", "admin"],
  "employee.authority.edit": ["owner", "admin"], // what an employee may propose — stricter than editing personality
  "employee.model.edit": ["owner", "admin"],
  "task.create": ["owner", "admin", "manager", "member"],
  "task.edit": ["owner", "admin", "manager"],
  "task.run_workflow": ["owner", "admin", "manager", "member"],
  "approval.decide": ["owner", "admin", "manager"],
  "approval.execute": ["owner", "admin", "manager"],
  "skill.edit": ["owner", "admin", "manager"],
  "skill.approve": ["owner", "admin"],
  "knowledge.edit": ["owner", "admin", "manager"],
  "knowledge.approve": ["owner", "admin", "manager"],
  "memory.review": ["owner", "admin", "manager"],
  "connector.manage": ["owner", "admin"],
  "connector.grant": ["owner", "admin"],
  "admin.members": ["owner", "admin"],
  "admin.roles": ["owner"],
  "admin.providers": ["owner", "admin"],
  "admin.budgets": ["owner", "admin"],
  "admin.audit.view": ["owner", "admin"],
  "admin.emergency_stop": ["owner", "admin"],
  "usage.view": ["owner", "admin", "manager"],
} as const satisfies Record<string, readonly WorkspaceRole[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: WorkspaceRole | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return (PERMISSIONS[permission] as readonly WorkspaceRole[]).includes(role);
}

export class AuthorizationError extends Error {
  readonly status = 403;
  constructor(message = "You do not have permission to do that.") {
    super(message);
    this.name = "AuthorizationError";
  }
}

export class NotFoundError extends Error {
  readonly status = 404;
  constructor(message = "Not found.") {
    super(message);
    this.name = "NotFoundError";
  }
}

export function assertCan(role: WorkspaceRole | null | undefined, permission: Permission): void {
  if (!can(role, permission)) throw new AuthorizationError(`Missing permission: ${permission}`);
}
