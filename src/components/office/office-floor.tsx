"use client";
import { activityMotion } from "@/lib/office/motion";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { RotateCcw, SkipForward } from "lucide-react";
import type { OfficeSnapshot, SceneEmployee } from "@/lib/office/types";
import { buildOfficeLayout, getActorFrame, SLOT_DURATION_MS, type OfficeActorFrame } from "@/lib/office/choreography";
import { OfficeActor, OfficeDesk } from "./office-character";
import styles from "./office-floor.module.css";

const COLORS: Record<string, string> = { violet: "var(--violet)", amber: "var(--amber)", teal: "var(--accent-2)", rose: "var(--rose)", blue: "var(--blue)", emerald: "var(--emerald)", slate: "var(--slate)" };
const PHASE_LABELS: Record<OfficeActorFrame["phase"], string> = { working: "Working at the desk", standing_up: "Standing up", walking_out: "Walking to the lounge", taking_break: "Taking a lounge break", walking_back: "Returning to the desk", sitting_down: "Sitting down" };

function subscribeMotion(callback: () => void) {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}
const readReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const serverReducedMotion = () => true;

/** Local visual clock only. It never dispatches work, writes data or calls a model. */
function useSceneClock(running: boolean) {
  const elapsedRef = useRef(0);
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!running) return;
    let handle = 0;
    let previous = performance.now();
    let lastPaint = previous;
    function tick(now: number) {
      const delta = Math.min(now - previous, 100);
      previous = now;
      if (document.visibilityState === "visible") {
        elapsedRef.current += delta;
        if (now - lastPaint >= 40) { setElapsed(elapsedRef.current); lastPaint = now; }
      }
      handle = requestAnimationFrame(tick);
    }
    handle = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(handle);
  }, [running]);
  return { elapsed, seek: (time: number) => { elapsedRef.current = time; setElapsed(time); } };
}

export function OfficeFloor({ snapshot, preview, motion, selectedId, onSelect }: {
  snapshot: OfficeSnapshot;
  preview: boolean;
  motion: boolean;
  selectedId: string | null;
  onSelect: (employeeId: string, button: HTMLButtonElement) => void;
}) {
  const layout = useMemo(() => buildOfficeLayout(snapshot.departments, snapshot.unassigned), [snapshot.departments, snapshot.unassigned]);
  const reducedMotion = useSyncExternalStore(subscribeMotion, readReducedMotion, serverReducedMotion);
  const [held, setHeld] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const paused = !motion || reducedMotion || (preview && (!!held || !!focused || !!selectedId));
  const clock = useSceneClock(preview && !paused);
  const frames = layout.actors.map((actor) => ({ actor, frame: getActorFrame(layout, actor.employee.id, clock.elapsed) }));
  const routine = frames[Math.floor(clock.elapsed / SLOT_DURATION_MS) % Math.max(1, frames.length)];

  function workMotion(employee: SceneEmployee): "typing" | "reviewing" | "waiting" | "none" {
    if (!motion || reducedMotion) return "none";
    if (preview) return /knowledge|creative|marketing/i.test(employee.roleTitle) ? "reviewing" : "typing";
    return activityMotion(employee.activity);
  }
  const position = (x: number, y: number): CSSProperties => ({ left: `${x / layout.width * 100}%`, top: `${y / layout.height * 100}%` });

  return <div className={styles.floor}>
    <div className={styles.routineBar}>
      <div><p className={styles.routineTitle}>{preview && routine ? <><span className={styles.routineDot} aria-hidden />{routine.actor.employee.name} · {reducedMotion ? "Seated, reduced motion" : PHASE_LABELS[routine.frame.phase]}{paused ? " · paused" : ""}</> : "Shared office floor"}</p><p className={styles.routineHint}>{preview ? "Stand → walk → lounge → return → sit → work. Preview movement only, never task execution." : "Fixed desks and shared aisles. Enable the office-life preview to watch a complete routine."}</p></div>
      {preview && <div className="flex flex-wrap gap-2"><button type="button" className="btn btn-secondary btn-sm" onClick={() => clock.seek((Math.floor(clock.elapsed / SLOT_DURATION_MS) + 1) * SLOT_DURATION_MS)}><SkipForward size={14} aria-hidden />Next colleague</button><button type="button" className="btn btn-ghost btn-sm" onClick={() => clock.seek(0)}><RotateCcw size={14} aria-hidden />Restart routine</button></div>}
    </div>
    {reducedMotion && <p className={styles.motionNotice}>Reduced motion is enabled. Characters stay seated and all travel animation is disabled.</p>}
    <div className={styles.viewport} role="region" aria-label="Office floor, horizontally scrollable on smaller screens" tabIndex={0}>
      <div className={styles.canvas} style={{ aspectRatio: `${layout.width} / ${layout.height}` }} data-office-floor data-preview={preview} data-phase={preview ? (reducedMotion ? "working" : routine?.frame.phase) : "recorded"} data-travel-paused={paused}>
        <svg viewBox={`0 0 ${layout.width} ${layout.height}`} className={styles.plan} aria-hidden>
          <rect x="1" y="1" width={layout.width - 2} height={layout.height - 2} rx="24" fill="var(--surface-2)" stroke="var(--line)" />
          <path d={`M28 ${layout.lounge.y - 36}H${layout.width - 28}V${layout.lounge.y + 43}H28Z`} fill="var(--surface)" stroke="var(--line)" />
          <path d={`M35 ${layout.lounge.y + 35}H${layout.width - 35}`} stroke="var(--line-strong)" strokeDasharray="3 9" opacity="0.6" />
          {layout.rooms.map((room) => <g key={room.id}>
            <rect x={room.x} y={room.y + 8} width={room.width} height={room.height} rx="14" fill="var(--ink)" opacity="0.05" />
            <rect x={room.x} y={room.y} width={room.width} height={room.height} rx="14" fill="var(--surface)" stroke="var(--line-strong)" />
            <rect x={room.x + 1} y={room.y + 1} width={room.width - 2} height="57" rx="13" fill={COLORS[room.color] ?? COLORS.slate} opacity="0.08" />
            <path d={room.y > layout.lounge.y ? `M${room.x + 14} ${room.y + 1}H${room.x + room.width / 2 - 32}M${room.x + room.width / 2 + 32} ${room.y + 1}H${room.x + room.width - 14}` : `M${room.x + 14} ${room.y + 1}H${room.x + room.width - 14}`} stroke={COLORS[room.color] ?? COLORS.slate} strokeWidth="3" />
            <path d={`M${room.x + room.width / 2 - 32} ${room.y > layout.lounge.y ? room.y : room.y + room.height}h64`} stroke="var(--surface-2)" strokeWidth="5" />
            <path d={`M${room.x + room.width / 2} ${room.y + 76}V${room.y + room.height - 18}`} stroke="var(--line)" strokeWidth="40" opacity="0.3" />
            <g transform={`translate(${room.x + room.width - 35},${room.y + 32})`}><rect x="-6" y="4" width="12" height="12" rx="3" fill={COLORS[room.color] ?? COLORS.slate} opacity="0.5" /><path d="M0 4V-9" stroke="var(--emerald)" strokeWidth="2" /><ellipse cx="-4" cy="-6" rx="4" ry="7" fill="var(--emerald)" transform="rotate(-30)" /><ellipse cx="4" cy="-10" rx="4" ry="7" fill="var(--emerald)" transform="rotate(30)" /></g>
          </g>)}
          <g transform={`translate(${layout.lounge.x + 96},${layout.lounge.y})`}><ellipse cx="0" cy="13" rx="34" ry="12" fill="var(--ink)" opacity="0.07" /><rect x="-25" y="-25" width="50" height="34" rx="10" fill="var(--surface-3)" stroke="var(--line-strong)" /><path d="M-10-15h12v13h-12Z" fill="var(--surface)" stroke="var(--amber)" /><path d="M2-12q10-1 5 7H2" fill="none" stroke="var(--amber)" strokeWidth="2" /><rect x="12" y="-17" width="8" height="15" rx="2" fill="var(--accent-2-soft)" stroke="var(--accent-2)" /></g>
          <text x={layout.lounge.x - 110} y={layout.lounge.y + 22} fill="var(--ink-3)" fontSize="10" fontWeight="600" letterSpacing="1.8">SHARED LOUNGE</text>
        </svg>
        {layout.rooms.map((room) => <div className={styles.roomLabel} key={room.id} style={{ ...position(room.x + 18, room.y + 15), width: `${140 / layout.width * 100}%` }}>{room.slug ? <Link href={`/departments/${room.slug}`} className="hover:underline">{room.name} ↗</Link> : <span>{room.name}</span>}<p>{room.employees.length} AI colleague{room.employees.length === 1 ? "" : "s"}</p></div>)}
        {layout.actors.map((actor) => <div key={`desk-${actor.employee.id}`} className={styles.desk} data-desk-for={actor.employee.id} style={{ ...position(actor.deskX, actor.deskY), width: `${110 / layout.width * 100}%`, zIndex: Math.round(actor.deskY) + 3 }}><OfficeDesk departmentSlug={actor.departmentSlug} size={110} /></div>)}
        {frames.map(({ actor, frame }) => {
          const travel = preview && !reducedMotion;
          const x = travel ? frame.x : actor.deskX;
          const y = travel ? frame.y : actor.deskY;
          const posture = travel ? frame.posture : "sitting";
          const employee = actor.employee;
          const phase = preview ? (reducedMotion ? "working" : frame.phase) : employee.activity.kind;
          return <button key={employee.id} type="button" className={styles.actor} style={{ ...position(x, y), width: `${90 / layout.width * 100}%`, zIndex: Math.round(y) + (posture === "sitting" ? 1 : 4) }} data-actor-id={employee.id} data-actor-phase={phase} data-world-x={x.toFixed(2)} data-world-y={y.toFixed(2)} aria-pressed={selectedId === employee.id} aria-label={`Inspect ${employee.name}, ${employee.roleTitle}. ${employee.activity.label}${preview ? ". Office-life preview only" : ""}`} onPointerEnter={(event) => { if (event.pointerType === "mouse") setHeld(employee.id); }} onPointerLeave={() => setHeld(null)} onFocus={() => setFocused(employee.id)} onBlur={() => setFocused(null)} onClick={(event) => onSelect(employee.id, event.currentTarget)}>
            <OfficeActor seed={employee.avatarSeed} name={employee.name} roleTitle={employee.roleTitle} departmentSlug={actor.departmentSlug} posture={posture} motion={posture === "sitting" ? workMotion(employee) : "none"} facing={travel ? frame.facing : "right"} paused={paused} size={90} />
            <span className={styles.nameplate}>{employee.name}<span aria-hidden>AI</span></span>
            <span className={styles.phaseLabel} aria-hidden>{preview ? (reducedMotion ? "Seated · reduced motion" : PHASE_LABELS[frame.phase]) : employee.activity.label}</span>
          </button>;
        })}
      </div>
    </div>
    <p className={styles.footnote}>Pan across the floor on smaller screens, or use List view. Travel pauses while a character is hovered, focused or selected. Desks stay fixed; the route is a visual rehearsal.</p>
  </div>;
}
