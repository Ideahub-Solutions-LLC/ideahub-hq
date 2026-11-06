/**
 * Original, procedural placeholder portrait for AI employees.
 * Deterministic from `seed`, abstract (no robots, no faces), always labelled as AI.
 */
function hash(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function avatarPalette(seed: string) {
  const h = hash(seed);
  const hue = h % 360;
  const hue2 = (hue + 40 + (h % 50)) % 360;
  return { a: `hsl(${hue} 62% 58%)`, b: `hsl(${hue2} 70% 42%)`, soft: `hsl(${hue} 60% 92%)` };
}

export function AiAvatar({ seed, name, size = 40, className = "", showLabel = false }: { seed: string; name: string; size?: number; className?: string; showLabel?: boolean }) {
  const h = hash(seed);
  const { a, b } = avatarPalette(seed);
  const initial = name.trim().charAt(0).toUpperCase() || "A";
  // Three orbit arcs with seed-derived rotation give each employee a distinct crest.
  const r1 = h % 360;
  const r2 = (h >> 3) % 360;
  const r3 = (h >> 6) % 360;
  const id = `g-${h.toString(36)}`;
  return (
    <span className={`relative inline-flex shrink-0 ${className}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={`${name}, AI employee (placeholder portrait)`}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={a} />
            <stop offset="100%" stopColor={b} />
          </linearGradient>
        </defs>
        <rect x="2" y="2" width="60" height="60" rx="18" fill={`url(#${id})`} />
        <g fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="2" strokeLinecap="round">
          <path d="M32 12 A20 20 0 0 1 52 32" transform={`rotate(${r1} 32 32)`} />
          <path d="M32 16 A16 16 0 0 1 48 32" transform={`rotate(${r2} 32 32)`} opacity="0.8" />
          <path d="M32 20 A12 12 0 0 1 44 32" transform={`rotate(${r3} 32 32)`} opacity="0.6" />
        </g>
        <circle cx="32" cy="32" r="13" fill="rgba(255,255,255,0.92)" />
        <text x="32" y="37" textAnchor="middle" fontSize="15" fontWeight="600" fontFamily="Inter Variable, system-ui, sans-serif" fill={b}>
          {initial}
        </text>
      </svg>
      {showLabel && (
        <span className="absolute -bottom-1 -right-1 rounded-md bg-ink px-1 text-[9px] font-semibold leading-4 text-canvas" aria-hidden>
          AI
        </span>
      )}
    </span>
  );
}

export function PersonAvatar({ name, size = 32, className = "" }: { name: string; size?: number; className?: string }) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join("");
  return (
    <span className={`inline-flex shrink-0 items-center justify-center rounded-full bg-surface-3 font-medium text-ink-2 ${className}`} style={{ width: size, height: size, fontSize: Math.max(10, size * 0.38) }} aria-label={name} role="img">
      {initials}
    </span>
  );
}
