import { describe, expect, it } from "vitest";
import { buildOfficeLayout, getActorFrame, getOfficeCycleDuration, OFFICE_ACTIVE_MS, OFFICE_SLOT_MS, OFFICE_STAND_MS, OFFICE_WALK_MS, OFFICE_BREAK_MS, OFFICE_ACTOR_CLEARANCE } from "@/lib/office/choreography";
import type { SceneDepartment, SceneEmployee } from "@/lib/office/types";

const employee = (id: string): SceneEmployee => ({ id, name: `Fictional ${id}`, status: "active", avatarSeed: id, roleTitle: "Designer", activity: { kind: "idle", label: "Idle", detail: "Fictional fixture", task: null, approvalId: null } });
const department = (id: string, count = 1): SceneDepartment => ({ id, slug: id, name: id, color: "var(--accent)", layout: { col: 0, row: 0 }, managerName: null, employees: Array.from({ length: count }, (_, i) => employee(`${id}-${i}`)), counts: { active: count, needsApproval: 0, blocked: 0 } });
const sample = () => buildOfficeLayout(Array.from({ length: 6 }, (_, i) => department(`team-${i}`, i === 0 ? 2 : 1)), []);

describe("visual office choreography", () => {
  it("builds deterministic fixed desks without mutating source or authoritative activity", () => {
    const departments = [department("operations", 2), department("creative")];
    const before = JSON.stringify(departments);
    const layout = buildOfficeLayout(departments, []);
    expect(buildOfficeLayout(departments, [])).toEqual(layout);
    const layoutBefore = JSON.stringify(layout);
    for (let time = 0; time < getOfficeCycleDuration(layout) * 2; time += 37) {
      for (const actor of layout.actors) getActorFrame(layout, actor.employee.id, time);
    }
    expect(JSON.stringify(departments)).toBe(before);
    expect(JSON.stringify(layout)).toBe(layoutBefore);
    expect(layout.actors[0].route[0]).toEqual({ x: layout.actors[0].deskX, y: layout.actors[0].deskY });
  });

  it("shows every stage, returns to the same desk and hands over a single roaming slot", () => {
    const layout = sample();
    expect(getOfficeCycleDuration(layout)).toBe(112_000);
    for (const [index, actor] of layout.actors.entries()) {
      const start = index * OFFICE_SLOT_MS;
      const at = (offset: number) => getActorFrame(layout, actor.employee.id, start + offset);
      expect(at(0).phase).toBe("standing_up");
      expect(at(OFFICE_STAND_MS + 200).phase).toBe("walking_out");
      expect(at(OFFICE_STAND_MS + OFFICE_WALK_MS)).toMatchObject({ ...layout.lounge, phase: "taking_break" });
      expect(at(OFFICE_STAND_MS + OFFICE_WALK_MS + OFFICE_BREAK_MS + 200).phase).toBe("walking_back");
      expect(at(OFFICE_ACTIVE_MS - 1)).toMatchObject({ x: actor.deskX, y: actor.deskY, phase: "sitting_down", posture: "sitting" });
      expect(at(OFFICE_ACTIVE_MS)).toMatchObject({ x: actor.deskX, y: actor.deskY, posture: "sitting", active: false });
    }
    for (let t = 0; t <= getOfficeCycleDuration(layout); t += 41) {
      const frames = layout.actors.map((actor) => getActorFrame(layout, actor.employee.id, t));
      expect(frames.filter((frame) => frame.active).length).toBeLessThanOrEqual(1);
      for (const [i, frame] of frames.entries()) {
        if (!frame.active) expect(frame).toMatchObject({ x: layout.actors[i].deskX, y: layout.actors[i].deskY, posture: "sitting" });
      }
    }
  });

  it("keeps moving bodies clear of seated colleagues, including overflow rooms and rows", () => {
    const layouts = [sample(), buildOfficeLayout(Array.from({ length: 9 }, (_, i) => department(`overflow-${i}`, 6)), [employee("floating")])];
    for (const layout of layouts) {
      expect(layout.width).toBe(1100);
      for (const [i, actor] of layout.actors.entries()) {
        for (const point of actor.route) {
          expect(point.x).toBeGreaterThanOrEqual(0);
          expect(point.x).toBeLessThanOrEqual(layout.width);
          expect(point.y).toBeGreaterThanOrEqual(0);
          expect(point.y).toBeLessThanOrEqual(layout.height);
        }
        for (let offset = 0; offset <= OFFICE_ACTIVE_MS; offset += 97) {
          const frame = getActorFrame(layout, actor.employee.id, i * OFFICE_SLOT_MS + offset);
          for (const other of layout.actors) {
            if (other.employee.id === actor.employee.id) continue;
            expect(Math.hypot(frame.x - other.deskX, frame.y - other.deskY)).toBeGreaterThanOrEqual(OFFICE_ACTOR_CLEARANCE - 0.0001);
          }
        }
      }
    }
  });

  it("has no position discontinuity at any phase, slot or cycle boundary", () => {
    const layout = sample();
    const boundaries = [0, OFFICE_STAND_MS, OFFICE_STAND_MS + OFFICE_WALK_MS, OFFICE_STAND_MS + OFFICE_WALK_MS + OFFICE_BREAK_MS, OFFICE_STAND_MS + OFFICE_WALK_MS * 2 + OFFICE_BREAK_MS, OFFICE_ACTIVE_MS, OFFICE_SLOT_MS];
    for (const [index, actor] of layout.actors.entries()) {
      for (const boundary of boundaries) {
        const t = index * OFFICE_SLOT_MS + boundary + getOfficeCycleDuration(layout);
        const before = getActorFrame(layout, actor.employee.id, t - 0.01);
        const after = getActorFrame(layout, actor.employee.id, t + 0.01);
        expect(Math.hypot(before.x - after.x, before.y - after.y)).toBeLessThan(0.01);
      }
      expect(getActorFrame(layout, actor.employee.id, 0)).toEqual(getActorFrame(layout, actor.employee.id, getOfficeCycleDuration(layout)));
    }
  });

  it("honors persisted department positions instead of input or database identifier order", () => {
    const later = { ...department("alpha"), layout: { row: 1, col: 0 } };
    const first = { ...department("zeta"), layout: { row: 0, col: 0 } };
    const middle = { ...department("beta"), layout: { row: 0, col: 1 } };
    expect(buildOfficeLayout([later, middle, first]).rooms.map((room) => room.id)).toEqual(["zeta", "beta", "alpha"]);
  });

  it("filters archived and duplicate staff, supports unassigned and empty rosters", () => {
    const group = department("design", 2);
    group.employees[1].status = "archived";
    const layout = buildOfficeLayout([group], [group.employees[0], employee("unassigned-person")]);
    expect(layout.actors.map((actor) => actor.employee.id)).toEqual(["design-0", "unassigned-person"]);
    expect(layout.rooms[1].slug).toBe("");
    expect(buildOfficeLayout([], []).actors).toEqual([]);
    expect(() => getActorFrame(layout, "missing", 0)).toThrow("Unknown office actor");
    expect(getActorFrame(layout, "design-0", NaN)).toEqual(getActorFrame(layout, "design-0", 0));
  });
});
