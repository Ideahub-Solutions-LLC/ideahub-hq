import Link from "next/link";
import type { ReactNode } from "react";

export function Card({ children, className = "", padded = true }: { children: ReactNode; className?: string; padded?: boolean }) {
  return <section className={`card ${padded ? "p-5" : ""} ${className}`}>{children}</section>;
}

export function CardTitle({ children, action, description }: { children: ReactNode; action?: ReactNode; description?: ReactNode }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-4">
      <div>
        <h2 className="text-base font-semibold text-ink">{children}</h2>
        {description && <p className="mt-0.5 text-sm text-ink-2">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, description, actions, eyebrow }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && <div className="mb-1 text-xs font-medium uppercase tracking-wider text-ink-3">{eyebrow}</div>}
        <h1 className="text-2xl font-semibold text-ink">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-ink-2">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function Stat({ label, value, hint, href, tone }: { label: string; value: ReactNode; hint?: ReactNode; href?: string; tone?: "accent" | "amber" | "rose" | "emerald" }) {
  const toneClass = tone === "amber" ? "text-amber" : tone === "rose" ? "text-rose" : tone === "emerald" ? "text-emerald" : tone === "accent" ? "text-accent" : "text-ink";
  const body = (
    <>
      <div className="text-xs font-medium uppercase tracking-wider text-ink-3">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${toneClass}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-ink-2">{hint}</div>}
    </>
  );
  return href ? (
    <Link href={href} className="card card-hover block p-4">
      {body}
    </Link>
  ) : (
    <div className="card p-4">{body}</div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-line-strong p-8 text-center">
      <p className="text-sm font-medium text-ink">{title}</p>
      {description && <p className="mt-1 text-sm text-ink-2">{description}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function Notice({ tone = "neutral", children, title }: { tone?: "neutral" | "amber" | "rose" | "emerald" | "accent"; children: ReactNode; title?: string }) {
  const cls = { neutral: "bg-surface-2 border-line text-ink-2", amber: "bg-amber-soft border-transparent text-amber", rose: "bg-rose-soft border-transparent text-rose", emerald: "bg-emerald-soft border-transparent text-emerald", accent: "bg-accent-soft border-transparent text-accent" }[tone];
  return (
    <div className={`rounded-xl border px-4 py-3 text-sm ${cls}`} role={tone === "rose" ? "alert" : "status"}>
      {title && <div className="font-medium">{title}</div>}
      <div className={title ? "mt-0.5 opacity-90" : ""}>{children}</div>
    </div>
  );
}

export function DescriptionList({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
      {items.map((it) => (
        <div key={it.label}>
          <dt className="text-xs font-medium uppercase tracking-wider text-ink-3">{it.label}</dt>
          <dd className="mt-0.5 text-sm text-ink">{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function LinkTabs({ tabs, current }: { tabs: { href: string; label: string; count?: number }[]; current: string }) {
  return (
    <nav className="mb-5 flex gap-1 overflow-x-auto border-b border-line" aria-label="Sections">
      {tabs.map((t) => {
        const active = t.href === current;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors ${active ? "border-accent font-medium text-ink" : "border-transparent text-ink-2 hover:text-ink"}`}
          >
            {t.label}
            {t.count !== undefined && <span className="ml-1.5 rounded-full bg-surface-2 px-1.5 text-xs text-ink-3">{t.count}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
