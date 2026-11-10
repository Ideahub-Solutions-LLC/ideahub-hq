"use client";
import { activityMotion } from "@/lib/office/motion";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { buildOfficeLayout, getActorFrame, SLOT_DURATION_MS, type OfficeActorFrame } from "@/lib/office/choreography";
import { buildOfficeWorld, type OfficePalette } from "@/lib/office/three-world";
import type { OfficeSnapshot } from "@/lib/office/types";
import styles from "./office-three.module.css";

type Props = {
  snapshot: OfficeSnapshot;
  preview: boolean;
  motion: boolean;
  selectedId: string | null;
  onSelect: (employeeId: string, button: HTMLButtonElement) => void;
};
type CameraAction = { kind: "home" | "left" | "right" | "in" | "out" | "next" | "restart" | "pan-left" | "pan-right" | "pan-up" | "pan-down" } | { kind: "room"; id: string };

const PHASE_LABELS: Record<OfficeActorFrame["phase"], string> = {
  working: "Working at the desk", standing_up: "Standing up", walking_out: "Walking to the lounge",
  taking_break: "Taking a lounge break", walking_back: "Returning to the desk", sitting_down: "Sitting down",
};

function lightColor(palette: OfficePalette) {
  const surface = new THREE.Color(palette.surface);
  return surface.r + surface.g + surface.b > 1.5 ? palette.surface : palette.ink;
}

function readPalette(): OfficePalette {
  const css = getComputedStyle(document.documentElement);
  const token = (name: string) => css.getPropertyValue(`--${name}`).trim();
  return { canvas: token("canvas"), surface: token("surface"), surface2: token("surface-2"), surface3: token("surface-3"), ink: token("ink"), ink2: token("ink-2"), line: token("line"), accent: token("accent"), violet: token("violet"), amber: token("amber"), teal: token("accent-2"), rose: token("rose"), blue: token("blue"), emerald: token("emerald"), slate: token("slate") };
}

/** Read-only rendering of the saved roster. This scene cannot dispatch work. */
export function OfficeThree({ snapshot, preview, motion, selectedId, onSelect }: Props) {
  // Refreshes replace server arrays, but only physical roster changes rebuild the scene.
  const rosterKey = JSON.stringify({
    departments: snapshot.departments.map((department) => ({ ...department, counts: undefined, employees: department.employees.map((employee) => ({ ...employee, activity: { kind: "idle", label: "", detail: "", task: null, approvalId: null } })) })),
    unassigned: snapshot.unassigned.map((employee) => ({ ...employee, activity: { kind: "idle", label: "", detail: "", task: null, approvalId: null } })),
  });
  const layout = useMemo(() => {
    const roster = JSON.parse(rosterKey) as OfficeSnapshot;
    return buildOfficeLayout(roster.departments, roster.unassigned);
  }, [rosterKey]);
  const activities = useRef(new Map<string, OfficeSnapshot["unassigned"][number]>());
  useEffect(() => {
    activities.current = new Map([...snapshot.departments.flatMap((room) => room.employees), ...snapshot.unassigned].map((employee) => [employee.id, employee]));
  }, [snapshot]);
  const host = useRef<HTMLDivElement>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const labels = useRef(new Map<string, HTMLSpanElement>());
  const actorLabels = useRef(new Map<string, HTMLSpanElement>());
  const routineHud = useRef<HTMLSpanElement>(null);
  const action = useRef<(value: CameraAction) => void>(() => {});
  const current = useRef({ preview, motion, selectedId, onSelect, touch: false });
  const [touch, setTouch] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [roomId, setRoomId] = useState<string | null>(null);
  useEffect(() => { current.current = { preview, motion, selectedId, onSelect, touch }; }, [preview, motion, selectedId, onSelect, touch]);

  useEffect(() => {
    const container = host.current;
    if (!container) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "low-power" }); }
    catch { queueMicrotask(() => setUnavailable(true)); return; }
    const canvas = renderer.domElement;
    canvas.setAttribute("aria-label", "Navigable 3D office. Use the camera controls and colleague buttons for keyboard navigation.");
    canvas.setAttribute("role", "img");
    canvas.dataset.officeThreeCanvas = "true";
    container.prepend(canvas);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene();
    let palette = readPalette();
    scene.background = new THREE.Color(palette.canvas);
    let world = buildOfficeWorld(layout, palette);
    scene.add(world.root);
    const ambient = new THREE.HemisphereLight(lightColor(palette), palette.slate, 2.6);
    const sun = new THREE.DirectionalLight(lightColor(palette), 3.2);
    sun.position.set(-14, 30, 18);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const extent = Math.max(layout.width, layout.height) / 50;
    sun.shadow.camera.left = -extent; sun.shadow.camera.right = extent;
    sun.shadow.camera.top = extent; sun.shadow.camera.bottom = -extent;
    sun.shadow.normalBias = 0.035;
    scene.add(ambient, sun);
    const camera = new THREE.OrthographicCamera(-20, 20, 20, -20, 0.1, 250);
    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = false;
    controls.minPolarAngle = 0.25;
    controls.maxPolarAngle = Math.PI / 2.35;
    controls.minZoom = 0.5;
    controls.maxZoom = 5;
    controls.enableZoom = false; // Scrolling the page must never be trapped by the canvas.
    controls.screenSpacePanning = false;
    canvas.style.touchAction = "pan-y";
    let width = 1;
    let height = 1;
    let homeSpan = extent * 0.9;
    let elapsed = 0;
    let limbTime = 0;
    let previous = performance.now();
    let lastPreview = current.current.preview;
    let visible = true;
    let stopped = false;
    const reducedQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const schemeQuery = window.matchMedia("(prefers-color-scheme: dark)");
    let reduceMotion = reducedQuery.matches;
    queueMicrotask(() => setReduced(reduceMotion));
    const handleReduced = () => { reduceMotion = reducedQuery.matches; setReduced(reduceMotion); };
    reducedQuery.addEventListener("change", handleReduced);

    function home() {
      resize();
      controls.target.set(0, 0, 0);
      camera.position.set(extent * 0.82, extent * 0.95, extent * 0.95);
      camera.zoom = 1;
      camera.updateProjectionMatrix();
      controls.update();
    }
    function resize() {
      const nextWidth = container!.clientWidth, nextHeight = container!.clientHeight;
      // Temporary hidden/zero layouts must not poison the camera frustum.
      if (nextWidth < 2 || nextHeight < 2) return;
      width = nextWidth; height = nextHeight;
      const aspect = width / height;
      homeSpan = Math.max(extent * 0.5, extent * 0.75 / aspect);
      camera.left = -homeSpan * aspect; camera.right = homeSpan * aspect;
      camera.top = homeSpan; camera.bottom = -homeSpan;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    }
    resize(); home();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    window.addEventListener("resize", resize);
    const intersection = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; });
    intersection.observe(container);
    function theme() {
      palette = readPalette();
      scene.background = new THREE.Color(palette.canvas);
      ambient.color.set(lightColor(palette)); ambient.groundColor.set(palette.slate); sun.color.set(lightColor(palette));
      scene.remove(world.root); world.dispose();
      world = buildOfficeWorld(layout, palette); scene.add(world.root);
    }
    const themeObserver = new MutationObserver(theme);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class", "style"] });
    schemeQuery.addEventListener("change", theme);
    action.current = (value) => {
      if (value.kind === "home") { home(); setRoomId(null); }
      if (value.kind === "in" || value.kind === "out") {
        camera.zoom = THREE.MathUtils.clamp(camera.zoom * (value.kind === "in" ? 1.25 : 0.8), controls.minZoom, controls.maxZoom);
        camera.updateProjectionMatrix();
      }
      if (value.kind === "left" || value.kind === "right") {
        const offset = camera.position.clone().sub(controls.target);
        offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), value.kind === "left" ? -Math.PI / 8 : Math.PI / 8);
        camera.position.copy(controls.target).add(offset); controls.update();
      }
      if (value.kind.startsWith("pan-")) {
        const right = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0).setY(0).normalize();
        const forward = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), right).normalize();
        const shift = (value.kind === "pan-left" || value.kind === "pan-right" ? right : forward).multiplyScalar((value.kind === "pan-left" || value.kind === "pan-up" ? -1 : 1) * 2 / camera.zoom);
        controls.target.add(shift); camera.position.add(shift); controls.update();
      }
      if (value.kind === "room") {
        const room = layout.rooms.find((item) => item.id === value.id);
        if (!room) return;
        const target = new THREE.Vector3((room.x + room.width / 2 - layout.width / 2) / 50, 0, (room.y + room.height / 2 - layout.height / 2) / 50);
        camera.position.add(target.clone().sub(controls.target));
        controls.target.copy(target);
        camera.zoom = THREE.MathUtils.clamp(homeSpan / (Math.max(room.width, room.height) / 50 * 0.95), 1, 4);
        camera.updateProjectionMatrix(); controls.update(); setRoomId(room.id);
      }
      if (value.kind === "next") elapsed = (Math.floor(elapsed / SLOT_DURATION_MS) + 1) * SLOT_DURATION_MS;
      if (value.kind === "restart") elapsed = 0;
    };
    const raycaster = new THREE.Raycaster();
    let start: { x: number; y: number; id: number } | null = null;
    let dragged = false;
    function down(event: PointerEvent) {
      controls.enabled = event.pointerType !== "touch" || current.current.touch;
      canvas.style.touchAction = current.current.touch ? "none" : "pan-y";
      if (start) dragged = true;
      else { start = { x: event.clientX, y: event.clientY, id: event.pointerId }; dragged = false; }
    }
    function move(event: PointerEvent) {
      if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6) dragged = true;
    }
    function up(event: PointerEvent) {
      if (!start || start.id !== event.pointerId || dragged || event.button !== 0) { start = null; return; }
      start = null;
      const rect = canvas.getBoundingClientRect();
      raycaster.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1), camera);
      const hit = raycaster.intersectObjects(world.pickables, true)[0];
      let object: THREE.Object3D | null = hit?.object ?? null;
      while (object && !object.userData.employeeId) object = object.parent;
      const id = object?.userData.employeeId as string | undefined;
      const button = id ? buttons.current.get(id) : undefined;
      if (id && button) current.current.onSelect(id, button);
    }
    function cancel() { start = null; }
    function lost(event: Event) { event.preventDefault(); stopped = true; renderer.setAnimationLoop(null); setUnavailable(true); }
    canvas.addEventListener("pointerdown", down, true);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", cancel);
    canvas.addEventListener("webglcontextlost", lost);
    const projected = new THREE.Vector3();
    function tick(now: number) {
      if (stopped || host.current !== container || !container!.isConnected) return;
      // Recover even when an observer misses a mobile/desktop viewport transition.
      if (container!.clientWidth !== width || container!.clientHeight !== height) resize();
      const delta = Math.min(now - previous, 80); previous = now;
      const state = current.current;
      if (state.preview !== lastPreview) { elapsed = 0; lastPreview = state.preview; }
      if (visible && document.visibilityState === "visible") {
        const animate = state.motion && !reduceMotion && (!state.preview || !state.selectedId);
        if (animate) limbTime += delta / 1000;
        if (animate && state.preview) elapsed += delta;
        for (const actor of layout.actors) {
          const seated = { x: actor.deskX, y: actor.deskY, posture: "sitting" as const, facing: "right" as const, phase: "working" as const, active: false };
          const frame = state.preview && !reduceMotion ? getActorFrame(layout, actor.employee.id, elapsed) : seated;

          const work = !state.motion || reduceMotion ? "none" : state.preview ? (/knowledge|creative|marketing/i.test(actor.employee.roleTitle) ? "reviewing" : "typing") : activities.current.get(actor.employee.id) ? activityMotion(activities.current.get(actor.employee.id)!.activity) : "none";
          world.actors.get(actor.employee.id)?.setFrame(frame, work, limbTime);
          const label = actorLabels.current.get(actor.employee.id);
          if (label) { const activity = activities.current.get(actor.employee.id)?.activity; const text = `${actor.employee.name} · ${activity?.label ?? "No active task"}`; if (label.textContent !== text) label.textContent = text; label.dataset.activity = activity?.kind ?? "idle"; label.dataset.phase = state.preview ? frame.phase : "recorded"; label.dataset.posture = frame.posture; }
        }
        const routineActor = layout.actors[Math.floor(elapsed / SLOT_DURATION_MS) % Math.max(1, layout.actors.length)];
        if (state.preview && routineHud.current) {
          const phase = routineActor ? getActorFrame(layout, routineActor.employee.id, elapsed).phase : "working";
          const caption = routineActor ? `${routineActor.employee.name} · ${reduceMotion ? "Seated, reduced motion" : PHASE_LABELS[phase]}${!animate && !reduceMotion ? " · paused" : ""}` : "No colleagues on this floor";
          if (routineHud.current.textContent !== caption) routineHud.current.textContent = caption;
        }
        controls.update(); renderer.render(scene, camera);
        for (const [id, rig] of world.actors) {
          const label = actorLabels.current.get(id);
          if (!label) continue;
          label.dataset.worldX = rig.root.position.x.toFixed(3);
          label.dataset.worldZ = rig.root.position.z.toFixed(3);
          projected.copy(rig.root.position); projected.y += 2.05; projected.project(camera);
          label.style.transform = `translate(-50%, -100%) translate(${(projected.x + 1) * width / 2}px, ${(1 - projected.y) * height / 2}px)`;
          label.style.visibility = Math.abs(projected.x) < 0.94 && Math.abs(projected.y) < 0.94 && projected.z > -1 && projected.z < 1 ? "visible" : "hidden";
        }
        for (const room of layout.rooms) {
          const label = labels.current.get(room.id);
          if (!label) continue;
          projected.set((room.x + room.width / 2 - layout.width / 2) / 50, 0.4, (room.y + 42 - layout.height / 2) / 50).project(camera);
          label.style.transform = `translate(-50%, -50%) translate(${(projected.x + 1) * width / 2}px, ${(1 - projected.y) * height / 2}px)`;
          label.style.visibility = Math.abs(projected.x) < 0.94 && Math.abs(projected.y) < 0.94 && projected.z > -1 && projected.z < 1 ? "visible" : "hidden";
        }
        canvas.dataset.preview = String(state.preview);
        canvas.dataset.travelPaused = String(!animate);
        canvas.dataset.actorCount = String(world.actors.size);
        canvas.dataset.roomCount = String(layout.rooms.length);
        canvas.dataset.cameraTarget = controls.target.toArray().map((value) => value.toFixed(3)).join(",");
        canvas.dataset.cameraZoom = camera.zoom.toFixed(3);
        canvas.dataset.viewSize = `${width},${height}`;
      }
    }
    renderer.setAnimationLoop(tick);
    return () => {
      stopped = true; renderer.setAnimationLoop(null); action.current = () => {};
      resizeObserver.disconnect(); window.removeEventListener("resize", resize); intersection.disconnect(); themeObserver.disconnect();
      reducedQuery.removeEventListener("change", handleReduced); schemeQuery.removeEventListener("change", theme);
      canvas.removeEventListener("pointerdown", down, true); canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up); canvas.removeEventListener("pointercancel", cancel); canvas.removeEventListener("webglcontextlost", lost);
      controls.dispose(); world.dispose(); sun.shadow.dispose(); renderer.dispose(); canvas.remove();
    };
  }, [layout, unavailable]);

  const focusedRoom = layout.rooms.find((room) => room.id === roomId);
  return <section className={styles.office} aria-label="3D office navigation">
    <div className={styles.heading}><div><span className={styles.eyebrow}>HEADQUARTERS · FLOOR 01</span><h3>Explore your team’s workspace</h3><p>{layout.rooms.length} department rooms · {layout.actors.length} individual desks · shared lounge</p></div><span className={styles.badge}>{preview ? "3D visual rehearsal" : "3D snapshot"}</span></div>
    <nav className={styles.rooms} aria-label="Focus a department room"><button type="button" aria-pressed={roomId === null} onClick={() => action.current({ kind: "home" })}>Whole office</button>{layout.rooms.map((room) => <button key={room.id} type="button" aria-label={`Focus ${room.name} room, ${room.employees.length} colleagues`} aria-pressed={roomId === room.id} onClick={() => action.current({ kind: "room", id: room.id })}>{room.name}<span>{room.employees.length}</span></button>)}</nav>
    {unavailable ? <div className={styles.fallback} role="status"><h3>The 3D view is unavailable in this browser.</h3><p>Your saved office and employees are unchanged. You can still explore the team in another view.</p><div><Link href="/office?view=characters" className="btn btn-secondary">Characters view</Link><Link href="/office?view=list" className="btn btn-secondary">List view</Link></div></div> : <div ref={host} className={styles.viewport} data-touch-navigation={touch}><div className={styles.labels} aria-hidden>{layout.rooms.map((room) => <span key={room.id} ref={(element) => { if (element) labels.current.set(room.id, element); else labels.current.delete(room.id); }} className={styles.roomLabel}>{room.name}</span>)}{layout.actors.map(({ employee }) => <span key={employee.id} ref={(element) => { if (element) actorLabels.current.set(employee.id, element); else actorLabels.current.delete(employee.id); }} className={styles.actorLabel} data-actor-id={employee.id} data-selected={selectedId === employee.id}>{employee.name}</span>)}</div><span className={styles.floorTag} aria-hidden>FLOOR 01 / TEAM STUDIO</span>{preview && <div className={styles.routineHud}><strong>OFFICE-LIFE REHEARSAL</strong><span ref={routineHud}>Starting rehearsal…</span></div>}</div>}
    <div className={styles.controls} aria-label="Camera controls"><div className={styles.buttonGroup}><button type="button" disabled={unavailable} onClick={() => action.current({ kind: "left" })}>↶ Rotate left</button><button type="button" disabled={unavailable} onClick={() => action.current({ kind: "right" })}>Rotate right ↷</button><button type="button" disabled={unavailable} onClick={() => action.current({ kind: "out" })} aria-label="Zoom out">−</button><button type="button" disabled={unavailable} onClick={() => action.current({ kind: "in" })} aria-label="Zoom in">+</button><button type="button" disabled={unavailable} onClick={() => action.current({ kind: "home" })}>Reset view</button></div><div className={styles.buttonGroup} aria-label="Pan camera">{(["pan-left", "pan-up", "pan-down", "pan-right"] as const).map((kind, index) => <button type="button" key={kind} disabled={unavailable} aria-label={kind.replace("-", " ")} onClick={() => action.current({ kind })}>{["←", "↑", "↓", "→"][index]}</button>)}</div><button type="button" disabled={unavailable} aria-pressed={touch} onClick={() => setTouch(!touch)}>{touch ? "Finish touch navigation" : "Enable touch navigation"}</button></div>
    {focusedRoom?.slug && <p className={styles.departmentLink}><Link href={`/departments/${focusedRoom.slug}`}>Open {focusedRoom.name} workspace ↗</Link></p>}
    <p className={styles.hint}>Drag to orbit · Right-drag to pan · Use + / − to zoom. On touch screens, enable navigation to orbit; turn it off to scroll the page. Select a character or a colleague below.</p>
    {reduced && <p className={styles.notice}>Reduced motion: all characters remain seated, with travel and limb animation disabled.</p>}
    {preview && <div className={styles.rehearsal}><span>Visual rehearsal only. Walking, lounge breaks and desk work do not start tasks or indicate live execution.</span><div className={styles.buttonGroup}><button type="button" onClick={() => action.current({ kind: "next" })}>Next colleague</button><button type="button" onClick={() => action.current({ kind: "restart" })}>Restart routine</button></div></div>}
    <details className={styles.roster} open><summary>Colleagues · select to inspect recorded activity</summary><div className={styles.people}>{layout.actors.map(({ employee: actorEmployee }) => { const employee = [...snapshot.departments.flatMap((room) => room.employees), ...snapshot.unassigned].find((item) => item.id === actorEmployee.id) ?? actorEmployee; return <button type="button" key={employee.id} ref={(element) => { if (element) buttons.current.set(employee.id, element); else buttons.current.delete(employee.id); }} aria-pressed={selectedId === employee.id} onClick={(event) => onSelect(employee.id, event.currentTarget)}><strong>{employee.name}</strong><span>{employee.activity.label}</span></button>; })}</div></details>
  </section>;
}
