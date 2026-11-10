import type { SceneDepartment, SceneEmployee } from "./types";

export type Point = { x: number; y: number };
export type OfficeActor = {
  employee: SceneEmployee;
  departmentSlug: string;
  roomId: string;
  deskX: number;
  deskY: number;
  /** Outbound foot-position path. Return travel follows this path in reverse. */
  route: Point[];
};
export type OfficeRoom = {
  id: string;
  slug: string;
  name: string;
  color: string;
  x: number;
  y: number;
  width: number;
  height: number;
  employees: { employee: SceneEmployee; deskX: number; deskY: number }[];
};
export type OfficeLayout = {
  width: number;
  height: number;
  rooms: OfficeRoom[];
  actors: OfficeActor[];
  lounge: Point;
};
export type OfficeActorFrame = Point & {
  posture: "walking" | "standing" | "sitting";
  facing: "left" | "right";
  phase: "working" | "standing_up" | "walking_out" | "taking_break" | "walking_back" | "sitting_down";
  active: boolean;
};

export const OFFICE_STAND_MS = 800;
export const OFFICE_WALK_MS = 4_000;
export const OFFICE_BREAK_MS = 1_000;
export const OFFICE_SIT_MS = 800;
export const OFFICE_SLOT_MS = 16_000;
export const SLOT_DURATION_MS = OFFICE_SLOT_MS;
export const OFFICE_ACTIVE_MS = OFFICE_STAND_MS + OFFICE_WALK_MS * 2 + OFFICE_BREAK_MS + OFFICE_SIT_MS;
export const OFFICE_ACTOR_CLEARANCE = 80;

/** All timings are visual rehearsal only: this module never changes employee/task state. */
export function getOfficeCycleDuration(layout: OfficeLayout): number {
  return Math.max(1, layout.actors.length) * OFFICE_SLOT_MS;
}

export function buildOfficeLayout(departments: SceneDepartment[], unassigned: SceneEmployee[] = []): OfficeLayout {
  // Honor the saved department layout, with one physical seat per employee.
  const seen = new Set<string>();
  const roster = (employees: SceneEmployee[]) => employees.filter((employee) => {
    if (employee.status === "archived" || seen.has(employee.id)) return false;
    seen.add(employee.id);
    return true;
  });
  const groups = [...departments].sort((a, b) => a.layout.row - b.layout.row || a.layout.col - b.layout.col || a.name.localeCompare(b.name)).map((department) => ({ ...department, employees: roster(department.employees) }));
  const extra = roster(unassigned);
  if (extra.length) groups.push({
    id: "office-unassigned", slug: "", name: "Shared studio", color: "slate",
    layout: { col: 0, row: 0 }, managerName: null, employees: extra,
    counts: { active: 0, needsApproval: 0, blocked: 0 },
  });
  const deskRows = Math.max(1, ...groups.map((group) => Math.ceil(group.employees.length / 2)));
  const roomHeight = Math.max(270, 220 + (deskRows - 1) * 130);
  const pairStride = roomHeight * 2 + 340;
  const lounge = { x: 550, y: roomHeight + 120 };
  const actors: OfficeActor[] = [];
  const rooms = groups.map((group, index): OfficeRoom => {
    const row = Math.floor(index / 3);
    const pair = Math.floor(row / 2);
    const lower = row % 2 === 1;
    const x = 30 + (index % 3) * 355;
    const y = 30 + pair * pairStride + (lower ? roomHeight + 170 : 0);
    const hallY = 30 + pair * pairStride + roomHeight + 90;
    const aisleX = x + 165;
    const seats = group.employees.map((employee, seat) => {
      const deskX = x + (seat % 2 === 0 ? 85 : 245);
      const deskY = y + 170 + Math.floor(seat / 2) * 130;
      const route: Point[] = [{ x: deskX, y: deskY }, { x: aisleX, y: deskY }, { x: aisleX, y: hallY }];
      if (pair > 0) route.push({ x: 15, y: hallY }, { x: 15, y: lounge.y });
      route.push({ ...lounge });
      actors.push({ employee, departmentSlug: group.slug, roomId: group.id, deskX, deskY, route });
      return { employee, deskX, deskY };
    });
    return { id: group.id, slug: group.slug, name: group.name, color: group.color, x, y, width: 330, height: roomHeight, employees: seats };
  });
  const lastPair = Math.floor(Math.max(0, groups.length - 1) / 6);
  const lastHallY = 30 + lastPair * pairStride + roomHeight + 90;
  return { width: 1100, height: Math.max(780, lastHallY + 50, ...rooms.map((room) => room.y + room.height + 40)), rooms, actors, lounge };
}

function alongRoute(route: Point[], progress: number, reverse: boolean): Point & { facing: "left" | "right" } {
  const points = reverse ? [...route].reverse() : route;
  const lengths = points.slice(1).map((point, i) => Math.hypot(point.x - points[i].x, point.y - points[i].y));
  let remaining = lengths.reduce((sum, length) => sum + length, 0) * Math.min(1, Math.max(0, progress));
  let facing: "left" | "right" = reverse ? "left" : "right";
  for (let i = 0; i < lengths.length; i++) {
    const from = points[i];
    const to = points[i + 1];
    if (to.x !== from.x) facing = to.x < from.x ? "left" : "right";
    if (remaining <= lengths[i] || i === lengths.length - 1) {
      const fraction = lengths[i] === 0 ? 1 : remaining / lengths[i];
      return { x: from.x + (to.x - from.x) * fraction, y: from.y + (to.y - from.y) * fraction, facing };
    }
    remaining -= lengths[i];
  }
  return { ...points[0], facing };
}

/** At most one actor owns a slot. Idle actors stay at their exact, immutable desk. */
export function getActorFrame(layout: OfficeLayout, actorId: string, elapsedMs: number): OfficeActorFrame {
  const index = layout.actors.findIndex((actor) => actor.employee.id === actorId);
  if (index < 0) throw new Error(`Unknown office actor: ${actorId}`);
  const actor = layout.actors[index];
  const seated: OfficeActorFrame = { x: actor.deskX, y: actor.deskY, posture: "sitting", facing: "right", phase: "working", active: false };
  const time = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
  const cycleTime = time % getOfficeCycleDuration(layout);
  const slot = Math.floor(cycleTime / OFFICE_SLOT_MS);
  const local = cycleTime - slot * OFFICE_SLOT_MS;
  if (slot !== index || local >= OFFICE_ACTIVE_MS) return seated;
  if (local < OFFICE_STAND_MS) return { ...seated, posture: "standing", phase: "standing_up", active: true };
  if (local < OFFICE_STAND_MS + OFFICE_WALK_MS) return {
    ...alongRoute(actor.route, (local - OFFICE_STAND_MS) / OFFICE_WALK_MS, false),
    posture: "walking", phase: "walking_out", active: true,
  };
  if (local < OFFICE_STAND_MS + OFFICE_WALK_MS + OFFICE_BREAK_MS) return {
    ...alongRoute(actor.route, 1, false), posture: "standing", phase: "taking_break", active: true,
  };
  if (local < OFFICE_STAND_MS + OFFICE_WALK_MS * 2 + OFFICE_BREAK_MS) return {
    ...alongRoute(actor.route, (local - OFFICE_STAND_MS - OFFICE_WALK_MS - OFFICE_BREAK_MS) / OFFICE_WALK_MS, true),
    posture: "walking", phase: "walking_back", active: true,
  };
  return { ...seated, phase: "sitting_down", active: true };
}
