import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { buildOfficeLayout, getActorFrame, OFFICE_STAND_MS } from "@/lib/office/choreography";
import { buildOfficeWorld, type OfficePalette } from "@/lib/office/three-world";
import type { SceneDepartment } from "@/lib/office/types";

const palette = Object.fromEntries(["canvas", "surface", "surface2", "surface3", "ink", "ink2", "line", "accent", "violet", "amber", "teal", "rose", "blue", "emerald", "slate"].map((key) => [key, "rgb(100, 120, 140)"])) as OfficePalette;
const roles = ["Operations", "Knowledge Librarian", "Sales", "Marketing", "Designer", "Developer", "Customer Support"];
function fixture() {
  const departments: SceneDepartment[] = roles.map((roleTitle, index) => ({
    id: `room-${index}`, slug: `room-${index}`, name: `Fictional team ${index}`, color: "teal",
    layout: { col: index % 3, row: Math.floor(index / 3) }, managerName: null,
    counts: { active: 0, needsApproval: 0, blocked: 0 },
    employees: [{ id: `employee-${index}`, name: `Fictional colleague ${index}`, status: "active", avatarSeed: `seed-${index}`, roleTitle,
      activity: { kind: "idle", label: "Idle", detail: "Fixture", task: null, approvalId: null } }],
  }));
  return buildOfficeLayout(departments);
}

describe("procedural 3D office", () => {
  it("creates seven distinct articulated identities and fixed selectable stations without changing source state", () => {
    const layout = fixture(), before = JSON.stringify(layout);
    const world = buildOfficeWorld(layout, palette);
    expect(world.actors.size).toBe(7);
    expect([...world.actors.values()].map((actor) => actor.root.userData.characterKind)).toEqual(["operations", "library", "sales", "marketing", "creative", "developer", "support"]);
    const desk = world.root.getObjectByName("desk:employee-0")!;
    const originalPosition = desk.position.clone();
    const actor = world.actors.get("employee-0")!;
    const frame = getActorFrame(layout, "employee-0", OFFICE_STAND_MS + 2_000);
    actor.setFrame(frame, "none", 2.8);
    expect(actor.root.position.x).toBe((frame.x - layout.width / 2) / 50);
    expect(actor.root.position.z).toBe((frame.y - layout.height / 2) / 50);
    expect(desk.position.equals(originalPosition)).toBe(true);
    expect(world.pickables.length).toBeGreaterThan(100);
    expect(world.pickables.every((object) => typeof object.userData.employeeId === "string")).toBe(true);
    expect(JSON.stringify(layout)).toBe(before);
    world.dispose();
  });

  it("uses received posture and motion, bends seated knees and faces the actual walking vector", () => {
    const layout = fixture(), world = buildOfficeWorld(layout, palette);
    const actor = world.actors.get("employee-0")!;
    const resting = getActorFrame(layout, "employee-0", 12_000);
    actor.setFrame(resting, "none", 12);
    expect(actor.root.getObjectByName("left-leg")!.rotation.x).toBe(-Math.PI / 2);
    expect(actor.root.getObjectByName("body")!.position.y).toBe(0.49);
    expect(actor.root.getObjectByName("review-tablet")!.visible).toBe(false);
    actor.setFrame(resting, "reviewing", 12);
    expect(actor.root.getObjectByName("review-tablet")!.visible).toBe(true);
    actor.setFrame({ ...resting, posture: "walking", y: resting.y + 10 }, "none", 13);
    expect(actor.root.rotation.y).toBeCloseTo(0);
    actor.setFrame({ ...resting, posture: "walking", y: resting.y + 20 }, "none", 14);
    expect(actor.root.rotation.y).toBeCloseTo(0);
    expect(actor.root.getObjectByName("review-tablet")!.visible).toBe(false);
    world.dispose();
  });

  it("shares GPU resources and disposes each once, including repeated cleanup", () => {
    const world = buildOfficeWorld(fixture(), palette);
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
    let meshes = 0;
    world.root.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        meshes++; geometries.add(object.geometry);
        (Array.isArray(object.material) ? object.material : [object.material]).forEach((material) => materials.add(material));
      }
    });
    expect(geometries.size).toBe(5);
    expect(meshes).toBeGreaterThan(geometries.size * 20);
    const spies = [...geometries, ...materials].map((item) => vi.spyOn(item, "dispose"));
    world.dispose(); world.dispose();
    spies.forEach((spy) => expect(spy).toHaveBeenCalledTimes(1));
    expect(world.root.children).toHaveLength(0);
    expect(world.actors.size).toBe(0);
    expect(world.pickables).toHaveLength(0);
  });

  it("smooths posture transitions, freezes with the clock, and resets deterministically", () => {
    const layout = fixture(), world = buildOfficeWorld(layout, palette);
    const actor = world.actors.get("employee-0")!;
    const seated = getActorFrame(layout, "employee-0", 12_000);
    actor.setFrame(seated, "none", 1);
    const standing = { ...seated, posture: "standing" as const };
    actor.setFrame(standing, "none", 1.016);
    const firstHeight = actor.root.getObjectByName("body")!.position.y;
    expect(firstHeight).toBeGreaterThan(0.49);
    expect(firstHeight).toBeLessThan(0.64);
    actor.setFrame(standing, "none", 1.016);
    expect(actor.root.getObjectByName("body")!.position.y).toBe(firstHeight);
    actor.setFrame(standing, "none", 1.4);
    expect(actor.root.getObjectByName("body")!.position.y).toBeGreaterThan(0.63);
    actor.setFrame(seated, "none", 0);
    expect(actor.root.getObjectByName("body")!.position.y).toBe(0.49);
    world.dispose();
  });
});
