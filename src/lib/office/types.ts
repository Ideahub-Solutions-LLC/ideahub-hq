import type { EmployeeStatus, TaskStatus } from "@/db/schema";

export type OfficeActivity = {
  kind: "working" | "queued" | "review" | "blocked" | "paused" | "draft" | "idle" | "stopped" | "stalled" | "completed";
  stage?: string;
  heartbeatAt?: string;
  live?: boolean;
  runId?: string;
  label: string;
  detail: string;
  task: { id: string; title: string; status: TaskStatus; updatedAt: string; nextAction: string | null } | null;
  approvalId: string | null;
};

export type SceneEmployee = {
  id: string;
  name: string;
  status: EmployeeStatus;
  avatarSeed: string;
  roleTitle: string;
  activity: OfficeActivity;
};

export type SceneDepartment = {
  id: string;
  slug: string;
  name: string;
  color: string;
  layout: { col: number; row: number };
  managerName: string | null;
  employees: SceneEmployee[];
  counts: { active: number; needsApproval: number; blocked: number };
};

export type OfficeSnapshot = {
  departments: SceneDepartment[];
  unassigned: SceneEmployee[];
  observedAt: string;
  emergencyStop: boolean;
};
