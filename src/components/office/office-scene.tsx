import Link from "next/link";
import type { EmployeeStatus } from "@/db/schema";
import { avatarPalette } from "@/components/ui/ai-avatar";

/**
 * 2.5D isometric office — an original SVG scene (no WebGL), rendered on the server.
 * It is a navigation + status layer: every room is a real link, keyboard focusable, with an
 * accessible label. Motion is subtle and switched off by prefers-reduced-motion in CSS.
 */
export type SceneEmployee = { id: string; name: string; status: EmployeeStatus; avatarSeed: string; roleTitle: string; working: boolean };
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

const TILE_W = 360;
const TILE_H = 180;
const INSET = 0.72; // rooms are islands: the gap keeps walls, signs and labels from colliding
const WALL_H = 16;
const ORIGIN_X = 550;
const ORIGIN_Y = 64;
const FONT = "Inter Variable, system-ui, sans-serif";

const COLOR_VAR: Record<string, string> = { violet: "var(--violet)", amber: "var(--amber)", teal: "var(--accent-2)", rose: "var(--rose)", blue: "var(--blue)", emerald: "var(--emerald)", slate: "var(--slate)" };
const STATUS_RING: Record<EmployeeStatus, string> = { active: "var(--emerald)", paused: "var(--amber)", draft: "var(--line-strong)", archived: "var(--ink-3)" };

function cellCenter(col: number, row: number) {
  return { cx: ORIGIN_X + ((col - row) * TILE_W) / 2, cy: ORIGIN_Y + ((col + row) * TILE_H) / 2 + TILE_H / 2 };
}

export function OfficeScene({ departments, title }: { departments: SceneDepartment[]; title: string }) {
  const sorted = [...departments].sort((a, b) => a.layout.row + a.layout.col - (b.layout.row + b.layout.col) || a.layout.col - b.layout.col);
  const cols = Math.max(...departments.map((d) => d.layout.col)) + 1;
  const rows = Math.max(...departments.map((d) => d.layout.row)) + 1;
  // Ground plate hugging the grid
  const g = [
    `${ORIGIN_X},${ORIGIN_Y - 24}`,
    `${ORIGIN_X + (cols * TILE_W) / 2 + 24},${ORIGIN_Y + (cols * TILE_H) / 2 - 12}`,
    `${ORIGIN_X + ((cols - rows) * TILE_W) / 2},${ORIGIN_Y + ((cols + rows) * TILE_H) / 2 + 24}`,
    `${ORIGIN_X - (rows * TILE_W) / 2 - 24},${ORIGIN_Y + (rows * TILE_H) / 2 - 12}`,
  ].join(" ");
  return (
    <div className="card overflow-hidden" aria-label={`${title} office map`}>
      <svg viewBox="0 0 1100 560" className="h-auto w-full" role="group" aria-label="Isometric office map. Each room is a department; select one to open it.">
        <defs>
          <linearGradient id="floor-base" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--surface-2)" />
            <stop offset="100%" stopColor="var(--surface-3)" />
          </linearGradient>
          <linearGradient id="sweep" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="white" stopOpacity="0" />
            <stop offset="50%" stopColor="white" stopOpacity="0.14" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </linearGradient>
          <filter id="soft-shadow" x="-10%" y="-10%" width="120%" height="140%">
            <feDropShadow dx="0" dy="8" stdDeviation="7" floodColor="#141821" floodOpacity="0.12" />
          </filter>
        </defs>
        <polygon points={g} fill="url(#floor-base)" stroke="var(--line)" />
        <g className="anim-sweep" style={{ mixBlendMode: "soft-light" }} aria-hidden>
          <rect x="-200" y="0" width="280" height="560" fill="url(#sweep)" transform="skewX(-20)" />
        </g>
        {sorted.map((d) => (
          <Room key={d.id} dept={d} />
        ))}
      </svg>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line px-4 py-3 text-xs text-ink-2">
        <Legend color="var(--emerald)" label="Active" />
        <Legend color="var(--amber)" label="Paused" />
        <Legend color="var(--line-strong)" label="Draft (not yet approved)" />
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-accent anim-pulse" aria-hidden /> Working now
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="rounded-full bg-amber-soft px-1.5 text-[10px] font-semibold text-amber">n</span> needs approval
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="rounded-full bg-rose-soft px-1.5 text-[10px] font-semibold text-rose">n</span> blocked
        </span>
        <span className="ml-auto hidden sm:inline">Tab moves between rooms · Enter opens a department</span>
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-full border-2" style={{ borderColor: color }} aria-hidden /> {label}
    </span>
  );
}

function Room({ dept }: { dept: SceneDepartment }) {
  const { cx, cy } = cellCenter(dept.layout.col, dept.layout.row);
  const rw = (TILE_W / 2) * INSET;
  const rh = (TILE_H / 2) * INSET;
  const color = COLOR_VAR[dept.color] ?? "var(--slate)";
  const top = { x: cx, y: cy - rh };
  const right = { x: cx + rw, y: cy };
  const bottom = { x: cx, y: cy + rh };
  const left = { x: cx - rw, y: cy };
  const floor = `${top.x},${top.y} ${right.x},${right.y} ${bottom.x},${bottom.y} ${left.x},${left.y}`;
  const n = dept.employees.length;
  const label = `${dept.name}: ${n} AI employee${n === 1 ? "" : "s"}, ${dept.counts.active} active task${dept.counts.active === 1 ? "" : "s"}, ${dept.counts.needsApproval} needing approval, ${dept.counts.blocked} blocked. Manager: ${dept.managerName ?? "unassigned"}.`;
  // Token slots stay inside the diamond (checked against the half-width at each height).
  const slots = [
    { dx: -62, dy: -2 },
    { dx: -8, dy: -18 },
    { dx: 48, dy: -4 },
  ];
  const badges: { value: number; fill: string; color: string; title: string }[] = [];
  if (dept.counts.needsApproval > 0) badges.push({ value: dept.counts.needsApproval, fill: "var(--amber-soft)", color: "var(--amber)", title: "needing approval" });
  if (dept.counts.blocked > 0) badges.push({ value: dept.counts.blocked, fill: "var(--rose-soft)", color: "var(--rose)", title: "blocked" });
  const nameW = dept.name.length * 7.2;
  const plateW = 30 + nameW + badges.length * 24 + (badges.length ? 4 : 0);
  const plateY = top.y - WALL_H - 30;
  return (
    <Link href={`/departments/${dept.slug}`} aria-label={label} className="group outline-none">
      <g style={{ cursor: "pointer" }}>
        <title>{label}</title>
        <g filter="url(#soft-shadow)">
          {/* back walls */}
          <polygon points={`${left.x},${left.y} ${top.x},${top.y} ${top.x},${top.y - WALL_H} ${left.x},${left.y - WALL_H}`} fill="var(--surface-3)" stroke="var(--line)" />
          <polygon points={`${top.x},${top.y} ${right.x},${right.y} ${right.x},${right.y - WALL_H} ${top.x},${top.y - WALL_H}`} fill="var(--surface-2)" stroke="var(--line)" />
          {/* floor */}
          <polygon points={floor} fill="var(--surface)" stroke="var(--line-strong)" className="transition-[fill] duration-150 group-hover:fill-[var(--surface-2)] group-focus-visible:fill-[var(--surface-2)]" />
        </g>
        <polygon points={floor} fill={color} opacity="0.11" />
        <line x1={left.x} y1={left.y - WALL_H} x2={top.x} y2={top.y - WALL_H} stroke={color} strokeWidth="3" strokeLinecap="round" />
        <polygon points={floor} fill="none" stroke={color} strokeWidth="2" className="opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
        {/* desks */}
        <Desk x={cx + 82} y={cy + 6} />
        <Desk x={cx - 40} y={cy + 28} />
        <Desk x={cx + 34} y={cy + 30} />
        {/* employees */}
        {dept.employees.slice(0, 3).map((e, i) => (
          <EmployeeToken key={e.id} e={e} cx={cx + slots[i].dx} cy={cy + slots[i].dy} />
        ))}
        {n > 3 && (
          <text x={cx + 78} y={cy - 22} fontSize="11" fontWeight="600" fill="var(--ink-2)" fontFamily={FONT}>
            +{n - 3}
          </text>
        )}
        <text x={cx} y={cy + 42} textAnchor="middle" fontSize="10" fill="var(--ink-3)" fontFamily={FONT}>
          {dept.counts.active} active
        </text>
        {/* name sign hung above the back corner */}
        <g transform={`translate(${cx - plateW / 2}, ${plateY})`}>
          <rect width={plateW} height="24" rx="8" fill="var(--surface)" stroke="var(--line-strong)" className="transition-[stroke] group-hover:stroke-[var(--ink-3)]" />
          <circle cx="13" cy="12" r="4" fill={color} />
          <text x="24" y="16" fontSize="12" fontWeight="600" fill="var(--ink)" fontFamily={FONT}>
            {dept.name}
          </text>
          {badges.map((b, i) => (
            <g key={b.title} transform={`translate(${30 + nameW + 4 + i * 24}, 3)`}>
              <title>{`${b.value} ${b.title}`}</title>
              <rect width="20" height="18" rx="9" fill={b.fill} />
              <text x="10" y="13" textAnchor="middle" fontSize="10.5" fontWeight="700" fill={b.color} fontFamily={FONT}>
                {b.value}
              </text>
            </g>
          ))}
        </g>
      </g>
    </Link>
  );
}

function Chip({ x, label, fill, color }: { x: number; label: string; fill: string; color: string }) {
  return (
    <g transform={`translate(${x},0)`}>
      <rect width={label.length * 6.2 + 14} height="19" rx="9.5" fill={fill} />
      <text x="7" y="13.5" fontSize="10.5" fontWeight="600" fill={color} fontFamily={FONT}>
        {label}
      </text>
    </g>
  );
}

function Desk({ x, y }: { x: number; y: number }) {
  const w = 38;
  const h = 19;
  const t = 8;
  return (
    <g aria-hidden>
      <polygon points={`${x - w / 2},${y + h / 2 - t} ${x},${y + h - t} ${x},${y + h} ${x - w / 2},${y + h / 2}`} fill="var(--line-strong)" opacity="0.65" />
      <polygon points={`${x},${y + h - t} ${x + w / 2},${y + h / 2 - t} ${x + w / 2},${y + h / 2} ${x},${y + h}`} fill="var(--line)" />
      <polygon points={`${x},${y - t} ${x + w / 2},${y + h / 2 - t} ${x},${y + h - t} ${x - w / 2},${y + h / 2 - t}`} fill="var(--surface-3)" stroke="var(--line-strong)" strokeWidth="0.8" />
    </g>
  );
}

function EmployeeToken({ e, cx, cy }: { e: SceneEmployee; cx: number; cy: number }) {
  const { a, b } = avatarPalette(e.avatarSeed);
  const ring = STATUS_RING[e.status];
  const id = `tok-${e.id}`;
  return (
    <g aria-hidden className={e.working ? "anim-float" : undefined} style={{ transformBox: "fill-box", transformOrigin: "center" }}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={a} />
          <stop offset="100%" stopColor={b} />
        </linearGradient>
      </defs>
      <ellipse cx={cx} cy={cy + 15} rx="11" ry="3.5" fill="#141821" opacity="0.12" />
      <circle cx={cx} cy={cy} r="13" fill={`url(#${id})`} stroke={ring} strokeWidth="2.5" opacity={e.status === "draft" ? 0.7 : 1} />
      <circle cx={cx} cy={cy} r="6.5" fill="rgba(255,255,255,0.92)" />
      <text x={cx} y={cy + 3.2} textAnchor="middle" fontSize="8.5" fontWeight="700" fill={b} fontFamily={FONT}>
        {e.name.charAt(0)}
      </text>
      {e.working && <circle cx={cx + 10} cy={cy - 9} r="3.6" fill="var(--accent)" stroke="var(--surface)" strokeWidth="1.5" className="anim-pulse" style={{ transformBox: "fill-box", transformOrigin: "center" }} />}
      <text x={cx} y={cy + 27} textAnchor="middle" fontSize="9.5" fill="var(--ink-2)" fontFamily={FONT}>
        {e.name}
      </text>
    </g>
  );
}
