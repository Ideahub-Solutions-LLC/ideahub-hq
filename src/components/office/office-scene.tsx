"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { activityMotion } from "@/lib/office/motion";
import { isContentEmployee } from "@/lib/services/content-role";
import { Pause, Play, RefreshCw, X, Eye } from "lucide-react";
import type { OfficeSnapshot, SceneDepartment, SceneEmployee } from "@/lib/office/types";
import { OfficeCharacter } from "./office-character";
import { OfficeFloor } from "./office-floor";
import { Badge, EmployeeStatusBadge } from "@/components/ui/badge";
import styles from "./office-scene.module.css";

const OfficeThree = dynamic(() => import("./office-three").then((module) => module.OfficeThree), { ssr: false, loading: () => <div className="p-8 text-sm text-ink-2" role="status">Loading the 3D office…</div> });

export type { SceneDepartment, SceneEmployee } from "@/lib/office/types";

function motionFor(employee: SceneEmployee, preview: boolean, motion: boolean): "typing" | "reviewing" | "waiting" | "none" {
  if (!motion) return "none";
  if (preview) return /knowledge|creative|marketing/i.test(employee.roleTitle) ? "reviewing" : "typing";
  return activityMotion(employee.activity);
}

export function OfficeScene({ snapshot: initialSnapshot, title, renderMode = "three", initialEmployeeId }: { snapshot: OfficeSnapshot; title: string; renderMode?: "three" | "characters"; initialEmployeeId?: string }) {
  const [received, setReceived] = useState(initialSnapshot);
  const [pending, setPending] = useState(false);
  const [connected, setConnected] = useState(true);
  const refreshRequested = useRef<(() => void) | null>(null);
  const [preview, setPreview] = useState(false);
  const [motion, setMotion] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(initialEmployeeId ?? null);
  const spotlight = useRef<HTMLDivElement>(null);
  const lastButton = useRef<HTMLButtonElement | null>(null);
  const quietActivity = (employee: SceneEmployee): SceneEmployee => (!connected || !autoRefresh) && employee.activity.live ? { ...employee, activity: { ...employee.activity, kind: "stalled", live: false, label: autoRefresh ? "Office connection unavailable" : "Live updates paused", detail: "Showing the last confirmed stage. Productive motion is stopped until live updates resume." } } : employee;
  const newestSnapshot = initialSnapshot.observedAt > received.observedAt ? initialSnapshot : received;
  const snapshot = { ...newestSnapshot, departments: newestSnapshot.departments.map((room) => ({ ...room, employees: room.employees.map(quietActivity) })), unassigned: newestSnapshot.unassigned.map(quietActivity) };
  const rooms = [...snapshot.departments].sort((a, b) => a.layout.row - b.layout.row || a.layout.col - b.layout.col || a.name.localeCompare(b.name));
  if (snapshot.unassigned.length) rooms.push({ id: "unassigned", slug: "", name: "Unassigned", color: "slate", layout: { row: 1000, col: 0 }, managerName: null, employees: snapshot.unassigned, counts: { active: 0, needsApproval: 0, blocked: 0 } });
  const cast = rooms.flatMap((department) => department.employees.map((employee) => ({ employee, department })));
  const selected = cast.find(({ employee }) => employee.id === selectedId);
  const working = cast.filter(({ employee }) => employee.activity.kind === "working").length;
  const awaitingReview = cast.filter(({ employee }) => employee.activity.kind === "review").length;

  useEffect(() => {
    let active = true;
    let busy = false;
    const controller = new AbortController();
    async function refresh() {
      if (!active || busy || document.visibilityState !== "visible") return;
      busy = true; setPending(true);
      try {
        const response = await fetch("/api/office/activity", { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]) });
        if (!response.ok) throw new Error("Office updates unavailable");
        const next = await response.json() as OfficeSnapshot;
        if (active) { setReceived(next); setConnected(true); }
      } catch { if (active) setConnected(false); }
      finally { busy = false; if (active) setPending(false); }
    }
    refreshRequested.current = refresh;
    const timer = autoRefresh ? window.setInterval(refresh, 2000) : undefined;
    if (autoRefresh) { document.addEventListener("visibilitychange", refresh); void refresh(); }
    return () => { active = false; controller.abort(); clearInterval(timer); document.removeEventListener("visibilitychange", refresh); refreshRequested.current = null; };
  }, [autoRefresh]);

  useEffect(() => {
    if (selectedId) spotlight.current?.focus();
  }, [selectedId]);

  function closeSpotlight() {
    setSelectedId(null);
    lastButton.current?.focus();
  }

  return (
    <div className={styles.office} aria-label={`${title} character office`} data-preview={preview} data-motion={motion}>
      <div className={styles.commandBar}>
        <div><div className={styles.eyebrow}>The team, in their element</div><h2 className={styles.officeTitle}>{title}</h2><p className="mt-1 text-sm text-ink-2">{cast.length} AI characters · {working} task{working === 1 ? "" : "s"} marked working · {awaitingReview} awaiting review</p></div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={`btn btn-sm ${preview ? "btn-primary" : "btn-secondary"}`} aria-pressed={preview} onClick={() => { setSelectedId(null); setPreview(!preview); }}><Eye size={15} aria-hidden />{preview ? "Exit office-life preview" : "Preview office life"}</button>
          <button type="button" className="btn btn-secondary btn-sm" aria-pressed={!motion} onClick={() => setMotion(!motion)}>{motion ? <Pause size={14} aria-hidden /> : <Play size={14} aria-hidden />}{motion ? "Pause motion" : "Resume motion"}</button>
        </div>
      </div>
      <div className={`${styles.stateBar} ${preview ? styles.previewBar : ""}`} role="status">
        <span className={styles.stateDot} aria-hidden />
        {preview ? <span><strong>Animation preview only.</strong> Characters stand, walk to the lounge, return to their desks, sit and work in a choreographed routine. No task is started, no employee is activated, and recorded states stay unchanged.</span> : <span><strong>Office activity.</strong> Content work follows worker heartbeats and run stages. Other task states are recorded snapshots; idle motion is decorative.</span>}
      </div>
      {renderMode === "three" ? <OfficeThree snapshot={snapshot} preview={preview} motion={motion} selectedId={selected?.employee.id ?? null} onSelect={(employeeId, button) => { lastButton.current = button; if (selectedId === employeeId) spotlight.current?.focus(); else setSelectedId(employeeId); }} /> : <OfficeFloor key={preview ? "preview" : "recorded"} snapshot={snapshot} preview={preview} motion={motion} selectedId={selected?.employee.id ?? null} onSelect={(employeeId, button) => { lastButton.current = button; if (selectedId === employeeId) spotlight.current?.focus(); else setSelectedId(employeeId); }} />}
      {!connected && <p role="status" className="text-sm text-rose">Office connection unavailable. Showing the last snapshot; live work motion is stopped.</p>}
      <div className={styles.snapshotBar}><span>Checked {snapshot.observedAt.slice(11, 19)} UTC · {autoRefresh ? "live updates every 2s while visible" : "automatic refresh paused"}</span><div className="flex flex-wrap items-center gap-2"><button type="button" className="btn btn-ghost btn-sm" aria-pressed={autoRefresh} onClick={() => setAutoRefresh(!autoRefresh)}>{autoRefresh ? "Pause updates" : "Resume updates"}</button><button type="button" className="btn btn-secondary btn-sm" disabled={pending} onClick={() => refreshRequested.current?.()}><RefreshCw size={13} aria-hidden />{pending ? "Refreshing…" : "Refresh status"}</button></div></div>
      {selected ? <div ref={spotlight} tabIndex={-1} className={styles.spotlight} aria-label={`${selected.employee.name} activity details`}>
        <div className={styles.spotlightCharacter}><OfficeCharacter seed={selected.employee.avatarSeed} name={selected.employee.name} roleTitle={selected.employee.roleTitle} departmentSlug={selected.department.slug} motion={motionFor(selected.employee, preview, motion)} size={148} /></div>
        <div className="min-w-0 flex-1"><div className="mb-2 flex flex-wrap items-center gap-2"><h3 className="text-xl font-semibold text-ink">{selected.employee.name}</h3><EmployeeStatusBadge status={selected.employee.status} /><Badge>{selected.department.name}</Badge>{preview && <Badge tone="amber">Motion preview only</Badge>}</div><p className="text-sm text-ink-2">{selected.employee.roleTitle}</p><p className="mt-3 text-sm font-semibold text-ink">{selected.employee.activity.label}</p><p className="mt-1 text-sm text-ink-2">{selected.employee.activity.detail}</p>
          {selected.employee.activity.heartbeatAt && <p className="mt-2 text-xs text-ink-3">Last worker heartbeat: {selected.employee.activity.heartbeatAt.replace("T", " ").slice(0, 19)} UTC</p>}
          {selected.employee.activity.task && <div className="mt-3 rounded-xl bg-surface-2 p-3 text-sm"><Link className="font-medium text-accent hover:underline" href={`/tasks/${selected.employee.activity.task.id}`}>{selected.employee.activity.task.title}</Link><p className="mt-1 text-xs text-ink-2">Recorded {selected.employee.activity.task.updatedAt.replace("T", " ").slice(0, 19)} UTC · {selected.employee.activity.task.status}</p>{selected.employee.activity.task.nextAction && <p className="mt-2 text-ink-2">Next: {selected.employee.activity.task.nextAction}</p>}</div>}
          <div className="mt-4 flex flex-wrap gap-2">{isContentEmployee(selected.employee.roleTitle) && <Link className="btn btn-primary btn-sm" href={`/employees/${selected.employee.id}/content/new`}>Assign content brief</Link>}<Link className="btn btn-primary btn-sm" href={`/employees/${selected.employee.id}/workspace`}>Open workspace</Link><Link className="btn btn-secondary btn-sm" href={`/employees/${selected.employee.id}/development`}>Develop expertise</Link><Link className="btn btn-ghost btn-sm" href={`/employees/${selected.employee.id}`}>Profile</Link>{selected.employee.activity.approvalId && <Link className="btn btn-secondary btn-sm" href={`/approvals/${selected.employee.activity.approvalId}`}>Review request</Link>}</div>
        </div><button type="button" onClick={closeSpotlight} className="btn btn-ghost btn-sm self-start" aria-label="Close employee details"><X size={18} aria-hidden /></button>
      </div> : <p className={styles.selectionHint}>Select any character to see their recorded activity, open their workspace, or develop their expertise. Character appearance is illustrative.</p>}
    </div>
  );
}
