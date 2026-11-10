import * as THREE from "three";
import type { OfficeActorFrame, OfficeLayout } from "./choreography";

export type OfficePalette = {
  canvas: string; surface: string; surface2: string; surface3: string;
  ink: string; ink2: string; line: string; accent: string; violet: string;
  amber: string; teal: string; rose: string; blue: string; emerald: string; slate: string;
};
type Motion = "typing" | "reviewing" | "waiting" | "none";
type Kind = "operations" | "library" | "sales" | "marketing" | "creative" | "developer" | "support";
type ActorRig = { root: THREE.Group; setFrame(frame: OfficeActorFrame, motion: Motion, timeSeconds: number): void };

// Keep the established SVG cast's role precedence and identities in the 3D cast.
function characterKind(role: string, department: string): Kind {
  const value = `${role} ${department}`.toLowerCase();
  if (/librar|knowledge|research/.test(value)) return "library";
  if (/sales|revenue|business development/.test(value)) return "sales";
  if (/support|customer|success/.test(value)) return "support";
  if (/creative|design|art director/.test(value)) return "creative";
  if (/market|content|social/.test(value)) return "marketing";
  if (/develop|engineer|delivery|technical/.test(value)) return "developer";
  return "operations";
}

/** Pure procedural scenery. No task state, network requests or inference of live activity. */
export function buildOfficeWorld(layout: OfficeLayout, palette: OfficePalette): {
  root: THREE.Group; actors: Map<string, ActorRig>; pickables: THREE.Object3D[]; dispose(): void;
} {
  const root = new THREE.Group();
  root.name = "office-world";
  const furniture = new THREE.Group();
  furniture.name = "fixed-furniture";
  root.add(furniture);
  const actors = new Map<string, ActorRig>();
  const pickables: THREE.Object3D[] = [];
  const geometries = {
    box: new THREE.BoxGeometry(1, 1, 1),
    sphere: new THREE.SphereGeometry(1, 12, 8),
    cylinder: new THREE.CylinderGeometry(1, 1, 1, 12),
    cone: new THREE.ConeGeometry(1, 1, 9),
    ring: new THREE.TorusGeometry(1, 0.035, 6, 28),
  };
  const materials = new Map<string, THREE.MeshStandardMaterial>();
  function material(token: keyof OfficePalette, glow = false) {
    const key = `${token}:${glow}`;
    let result = materials.get(key);
    if (!result) {
      result = new THREE.MeshStandardMaterial({ color: palette[token], roughness: 0.72, metalness: 0.08 });
      if (glow) { result.emissive.set(palette[token]); result.emissiveIntensity = 0.35; }
      materials.set(key, result);
    }
    return result;
  }
  function shape(parent: THREE.Object3D, geometry: keyof typeof geometries, token: keyof OfficePalette,
    x: number, y: number, z: number, sx: number, sy: number, sz: number, glow = false) {
    const mesh = new THREE.Mesh(geometries[geometry], material(token, glow));
    mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz);
    mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh);
    return mesh;
  }
  const box = (parent: THREE.Object3D, token: keyof OfficePalette, x: number, y: number, z: number, w: number, h: number, d: number) => shape(parent, "box", token, x, y, z, w, h, d);
  const wx = (x: number) => (x - layout.width / 2) / 50;
  const wz = (y: number) => (y - layout.height / 2) / 50;
  function group(parent: THREE.Object3D, name: string, x = 0, y = 0, z = 0) {
    const item = new THREE.Group(); item.name = name; item.position.set(x, y, z); parent.add(item); return item;
  }
  function plant(parent: THREE.Object3D, x: number, z: number, scale = 1) {
    const pot = group(parent, "plant", x, 0, z); pot.scale.setScalar(scale);
    shape(pot, "cylinder", "surface3", 0, 0.18, 0, 0.2, 0.36, 0.2);
    shape(pot, "cylinder", "slate", 0, 0.52, 0, 0.035, 0.55, 0.035);
    for (let i = 0; i < 5; i++) {
      const angle = i * Math.PI * 2 / 5;
      const leaf = shape(pot, "sphere", i % 2 ? "teal" : "emerald", Math.sin(angle) * 0.15, 0.7 + i * 0.055, Math.cos(angle) * 0.15, 0.16, 0.32, 0.11);
      leaf.rotation.z = Math.sin(angle) * 0.65; leaf.rotation.x = Math.cos(angle) * 0.65;
    }
  }

  // One instanced grid avoids hundreds of tile draw calls. The underlay shows through as grout.
  box(furniture, "slate", 0, -0.2, 0, layout.width / 50 + 0.35, 0.35, layout.height / 50 + 0.35);
  box(furniture, "line", 0, -0.025, 0, layout.width / 50, 0.05, layout.height / 50);
  const cols = Math.ceil(layout.width / 50), rows = Math.ceil(layout.height / 50);
  const tiles = new THREE.InstancedMesh(geometries.box, material("surface2"), cols * rows);
  const transform = new THREE.Object3D();
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const w = layout.width / 50 / cols, d = layout.height / 50 / rows;
    transform.position.set(-layout.width / 100 + (c + 0.5) * w, 0.005, -layout.height / 100 + (r + 0.5) * d);
    transform.scale.set(w - 0.025, 0.025, d - 0.025); transform.updateMatrix();
    tiles.setMatrixAt(r * cols + c, transform.matrix);
  }
  tiles.name = "floor-tiles"; tiles.receiveShadow = true; furniture.add(tiles);

  const accents: (keyof OfficePalette)[] = ["teal", "amber", "blue", "rose", "violet", "emerald", "slate"];
  for (const [index, room] of layout.rooms.entries()) {
    const accent = accents[index % accents.length];
    const w = room.width / 50, d = room.height / 50;
    const roomGroup = group(furniture, `room:${room.id}`, wx(room.x + room.width / 2), 0, wz(room.y + room.height / 2));
    roomGroup.userData.departmentId = room.id;
    box(roomGroup, "surface", 0, 0.035, 0, w, 0.045, d);
    box(roomGroup, accent, 0, 0.065, -d / 2 + 0.19, w - 0.35, 0.02, 0.14);
    const hallY = layout.actors.find((actor) => actor.roomId === room.id)?.route[2]?.y ?? layout.lounge.y;
    const openingSide = hallY < room.y ? -1 : 1;
    // Low foreground cutaways preserve sightlines at the default elevated camera angle.
    for (const side of [-1, 1]) {
      const wallHeight = side < 0 ? 1.6 : 0.42;
      const z = side * d / 2;
      if (side === openingSide) {
        const segment = (w - 1.35) / 2;
        for (const sign of [-1, 1]) {
          box(roomGroup, "surface3", sign * (w / 2 - segment / 2), wallHeight / 2, z, segment, wallHeight, 0.12);
          box(roomGroup, accent, sign * (w / 2 - segment / 2), wallHeight + 0.025, z, segment, 0.05, 0.15);
        }
        box(roomGroup, accent, 0, 0.07, z, 1.35, 0.025, 0.22);
      } else {
        box(roomGroup, "surface3", 0, wallHeight / 2, z, w, wallHeight, 0.12);
        box(roomGroup, accent, 0, wallHeight + 0.025, z, w, 0.05, 0.15);
      }
    }
    for (const side of [-1, 1]) {
      box(roomGroup, "surface3", side * w / 2, 0.28, 0, 0.12, 0.56, d);
      box(roomGroup, "line", side * w / 2, 0.58, 0, 0.15, 0.04, d);
    }
    // Framed wall display and a low cabinet are physical room details, not live dashboards.
    const display = group(roomGroup, "department-display", -1.6, 1.05, -d / 2 + 0.085);
    box(display, "slate", 0, 0, 0, 1.15, 0.62, 0.08);
    box(display, accent, 0, 0, 0.045, 1.04, 0.51, 0.02);
    for (let i = 0; i < 3; i++) box(display, "surface", -0.28 + i * 0.28, -0.1 + i * 0.07, 0.065, 0.12, 0.15 + i * 0.11, 0.015);
    plant(roomGroup, w / 2 - 0.48, -d / 2 + 0.5, 1.05);
    box(roomGroup, "surface3", -w / 2 + 0.6, 0.3, -d / 2 + 0.5, 0.9, 0.6, 0.55);
    box(roomGroup, accent, -w / 2 + 0.6, 0.63, -d / 2 + 0.5, 0.95, 0.06, 0.6);

    for (const seat of room.employees) {
      const desk = group(furniture, `desk:${seat.employee.id}`, wx(seat.deskX), 0, wz(seat.deskY));
      // Face the front cutaway camera while keeping the immutable seat anchor.
      desk.rotation.y = Math.PI;
      desk.userData.employeeId = seat.employee.id;
      box(desk, "surface3", 0, 0.83, -0.85, 1.65, 0.12, 0.85);
      for (const x of [-0.65, 0.65]) for (const z of [-1.16, -0.55]) box(desk, "slate", x, 0.4, z, 0.065, 0.8, 0.065);
      box(desk, accent, 0, 0.9, -0.73, 0.85, 0.015, 0.49);
      box(desk, "slate", 0, 0.925, -0.75, 0.7, 0.04, 0.42);
      const screen = box(desk, "slate", 0, 1.15, -0.96, 0.72, 0.44, 0.045); screen.rotation.x = -0.12;
      const screenFace = shape(desk, "box", "blue", 0, 1.15, -0.93, 0.64, 0.35, 0.015, true); screenFace.rotation.x = -0.12;
      for (let i = 0; i < 3; i++) box(desk, "surface", -0.09, 1.24 - i * 0.08, -0.9, 0.36 - i * 0.06, 0.025, 0.01);
      shape(desk, "cylinder", "surface", 0.58, 1.01, -0.69, 0.09, 0.22, 0.09);
      // Stationary chair remains at its assigned desk while its employee roams.
      const chair = group(desk, "chair");
      shape(chair, "cylinder", "slate", 0, 0.2, 0.08, 0.06, 0.4, 0.06);
      box(chair, "slate", 0, 0.08, 0.08, 0.6, 0.055, 0.06);
      box(chair, "slate", 0, 0.08, 0.08, 0.06, 0.055, 0.6);
      box(chair, accent, 0, 0.43, 0.04, 0.65, 0.13, 0.6);
      box(chair, accent, 0, 0.76, 0.31, 0.65, 0.64, 0.12);
      for (const x of [-0.37, 0.37]) box(chair, "slate", x, 0.66, 0.04, 0.07, 0.08, 0.43);
      desk.traverse((object) => { if (object instanceof THREE.Mesh) { object.userData.employeeId = seat.employee.id; pickables.push(object); } });
    }
  }

  // Lounge furnishings sit beside, rather than on, the scheduler's shared destination.
  const lounge = group(furniture, "shared-lounge", wx(layout.lounge.x), 0, wz(layout.lounge.y));
  box(lounge, "line", 0, 0.04, 0, 4, 0.025, 1.95);
  for (const x of [-1.55, 1.55]) {
    box(lounge, "violet", x, 0.3, 1, 1.32, 0.45, 0.6);
    box(lounge, "violet", x, 0.62, 1.27, 1.32, 0.52, 0.13);
    for (const side of [-1, 1]) box(lounge, "surface3", x + side * 0.6, 0.53, 1, 0.11, 0.2, 0.64);
  }
  // Keep the exact lounge destination open for a standing visitor.
  shape(lounge, "cylinder", "surface3", 0, 0.35, 0.72, 0.42, 0.07, 0.24);
  shape(lounge, "cylinder", "slate", 0, 0.18, 0.72, 0.07, 0.35, 0.07);
  plant(lounge, -2.55, 1.15, 0.9); plant(lounge, 2.55, 1.15, 0.9);

  for (const actor of layout.actors) {
    const kind = characterKind(actor.employee.roleTitle, actor.departmentSlug);
    const token: keyof OfficePalette = ({ operations: "teal", library: "amber", sales: "blue", marketing: "rose", creative: "violet", developer: "emerald", support: "teal" } as const)[kind];
    const actorRoot = group(root, `actor:${actor.employee.id}`, wx(actor.deskX), 0, wz(actor.deskY));
    actorRoot.userData.employeeId = actor.employee.id; actorRoot.userData.characterKind = kind;
    const body = group(actorRoot, "body", 0, 0.64, 0);
    shape(body, "sphere", token, 0, 0.27, 0, 0.3, 0.34, 0.22);
    box(body, "surface", 0, 0.28, 0.2, 0.34, 0.29, 0.06);
    shape(body, "sphere", token, 0, 0.3, 0.246, 0.065, 0.065, 0.02, true);
    const head = group(body, "head", 0, 0.7, 0);
    shape(head, "sphere", "surface3", 0, 0, 0, 0.37, 0.3, 0.29);
    shape(head, "sphere", "slate", 0, 0.005, 0.24, 0.29, 0.17, 0.08);
    for (const x of [-0.12, 0.12]) shape(head, "sphere", token, x, 0.025, 0.309, 0.042, 0.063, 0.025, true);
    box(head, token, 0, -0.08, 0.315, 0.1, 0.025, 0.018);
    shape(head, "cylinder", "slate", 0, 0.36, 0, 0.025, 0.17, 0.025);
    shape(head, "sphere", token, 0, 0.46, 0, 0.06, 0.06, 0.06, true);
    const arms: THREE.Group[] = [], elbows: THREE.Group[] = [], legs: THREE.Group[] = [], knees: THREE.Group[] = [];
    for (const side of [-1, 1]) {
      const arm = group(body, side < 0 ? "left-arm" : "right-arm", side * 0.34, 0.4, 0);
      shape(arm, "sphere", token, 0, 0, 0, 0.11, 0.11, 0.11);
      shape(arm, "cylinder", "surface3", 0, -0.14, 0, 0.075, 0.24, 0.075);
      const elbow = group(arm, "elbow", 0, -0.27, 0);
      shape(elbow, "sphere", "slate", 0, 0, 0, 0.08, 0.08, 0.08);
      shape(elbow, "cylinder", token, 0, -0.12, 0, 0.075, 0.22, 0.075);
      shape(elbow, "sphere", "surface3", 0, -0.25, 0, 0.095, 0.1, 0.095);
      arms.push(arm); elbows.push(elbow);
      const leg = group(body, side < 0 ? "left-leg" : "right-leg", side * 0.14, 0, 0);
      shape(leg, "cylinder", "slate", 0, -0.14, 0, 0.08, 0.26, 0.08);
      const knee = group(leg, "knee", 0, -0.28, 0);
      shape(knee, "sphere", token, 0, 0, 0, 0.09, 0.09, 0.09);
      shape(knee, "cylinder", "surface3", 0, -0.12, 0, 0.075, 0.24, 0.075);
      shape(knee, "sphere", token, 0, -0.24, 0.06, 0.12, 0.09, 0.18);
      legs.push(leg); knees.push(knee);
    }
    if (kind === "creative") {
      const beret = shape(head, "sphere", "violet", 0, 0.23, 0, 0.39, 0.12, 0.3); beret.rotation.z = -0.16;
      box(body, "amber", -0.1, 0.25, 0.24, 0.055, 0.18, 0.035);
    }
    if (kind === "library" || kind === "developer") {
      for (const x of [-0.13, 0.13]) shape(head, "ring", token, x, 0.025, 0.33, 0.105, 0.105, 0.105);
      box(head, token, 0, 0.025, 0.335, 0.08, 0.025, 0.025);
    }
    if (kind === "sales" || kind === "support" || kind === "marketing") {
      for (const side of [-1, 1]) shape(head, "sphere", token, side * 0.35, 0.02, 0, 0.075, 0.14, 0.13);
      const band = shape(head, "ring", token, 0, 0.02, 0, 0.365, 0.3, 0.365); band.rotation.y = Math.PI / 2;
      box(head, "slate", 0.27, -0.09, 0.22, 0.035, 0.035, 0.3);
      shape(head, "sphere", token, 0.25, -0.09, 0.36, 0.06, 0.04, 0.045);
    }
    if (kind === "operations") {
      box(body, "amber", 0, 0.3, 0.25, 0.055, 0.24, 0.025);
      box(body, "surface3", 0.19, 0.35, 0.2, 0.09, 0.11, 0.045);
    }
    if (kind === "sales") box(body, "blue", 0, 0.36, 0.25, 0.15, 0.07, 0.04);
    if (kind === "support") {
      box(body, "rose", 0, 0.28, 0.255, 0.16, 0.05, 0.02);
      box(body, "rose", 0, 0.28, 0.255, 0.05, 0.16, 0.02);
    }
    if (kind === "marketing") shape(body, "cone", "rose", 0, 0.28, 0.26, 0.1, 0.12, 0.025).rotation.z = -Math.PI / 2;
    const book = group(elbows[0], "review-tablet", 0, -0.22, 0.1);
    box(book, kind === "library" ? "amber" : "slate", 0, 0, 0, 0.28, 0.33, 0.055);
    box(book, "surface", 0, 0, 0.033, 0.21, 0.26, 0.015);
    book.visible = false;
    actorRoot.traverse((object) => { if (object instanceof THREE.Mesh) { object.userData.employeeId = actor.employee.id; pickables.push(object); } });
    let previousX = actor.deskX, previousY = actor.deskY, previousTime = 0, initialized = false;
    const rig: ActorRig = {
      root: actorRoot,
      setFrame(frame, motion, timeSeconds) {
        const t = Number.isFinite(timeSeconds) ? timeSeconds : 0;
        const seated = frame.posture === "sitting", walking = frame.posture === "walking";
        const dx = frame.x - previousX, dz = frame.y - previousY;
        // Approximately 95% settled after 350ms; a frozen clock freezes the pose.
        // Clock resets and the first frame snap to their exact requested posture.
        const blend = !initialized || t < previousTime ? 1 : 1 - Math.exp(-Math.max(0, t - previousTime) * 9);
        const previousBodyY = body.position.y, previousBodyTilt = body.rotation.x;
        const joints = [...arms, ...elbows, ...legs, ...knees];
        const previousAngles = joints.map((joint) => joint.rotation.x);
        actorRoot.position.set(wx(frame.x), 0, wz(frame.y));
        if (seated) actorRoot.rotation.y = 0;
        else if (walking && t < previousTime) actorRoot.rotation.y = frame.facing === "left" ? -Math.PI / 2 : Math.PI / 2;
        else if (walking && Math.hypot(dx, dz) > 0.001) actorRoot.rotation.y = Math.atan2(dx, dz);
        else if (!walking) actorRoot.rotation.y = frame.facing === "left" ? -0.45 : 0.45;
        previousX = frame.x; previousY = frame.y; previousTime = t;
        const swing = walking ? Math.sin(t * 9) * 0.5 : 0;
        body.position.y = seated ? 0.49 : 0.64 + (walking ? Math.abs(Math.sin(t * 9)) * 0.045 : 0);
        body.rotation.x = seated && motion === "typing" ? 0.07 : 0;
        head.rotation.set(0, 0, 0);
        if (motion === "reviewing" && !walking) head.rotation.x = 0.12;
        for (let i = 0; i < 2; i++) {
          const direction = i === 0 ? 1 : -1;
          legs[i].rotation.x = seated ? -Math.PI / 2 : swing * direction;
          knees[i].rotation.x = seated ? Math.PI / 2 : Math.max(0, -swing * direction) * 0.65;
          arms[i].rotation.set(walking ? -swing * direction : 0, 0, direction * 0.08);
          elbows[i].rotation.x = -0.12;
          if (seated && motion === "typing") {
            arms[i].rotation.x = -0.5;
            elbows[i].rotation.x = -0.95 + Math.sin(t * 11 + i * Math.PI) * 0.13;
          } else if (!walking && motion === "reviewing") {
            arms[i].rotation.x = -0.35; elbows[i].rotation.x = -1.3;
          }
        }
        book.visible = !walking && motion === "reviewing";
        body.position.y = THREE.MathUtils.lerp(previousBodyY, body.position.y, blend);
        body.rotation.x = THREE.MathUtils.lerp(previousBodyTilt, body.rotation.x, blend);
        joints.forEach((joint, index) => { joint.rotation.x = THREE.MathUtils.lerp(previousAngles[index], joint.rotation.x, blend); });
        initialized = true;
      },
    };
    actors.set(actor.employee.id, rig);
    rig.setFrame({ x: actor.deskX, y: actor.deskY, posture: "sitting", facing: "right", phase: "working", active: false }, "none", 0);
  }
  let disposed = false;
  return { root, actors, pickables, dispose() {
    if (disposed) return;
    disposed = true;
    tiles.dispose();
    for (const geometry of Object.values(geometries)) geometry.dispose();
    for (const item of materials.values()) item.dispose();
    root.clear(); actors.clear(); pickables.length = 0;
  } };
}
