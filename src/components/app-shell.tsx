"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { LayoutDashboard, Building2, Users, KanbanSquare, ShieldCheck, BookOpen, Plug, Settings, Menu, X, LogOut, OctagonAlert } from "lucide-react";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { PersonAvatar } from "@/components/ui/ai-avatar";

export type NavCounts = { approvals: number; memoryProposals: number };

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/office", label: "Office", icon: Building2 },
  { href: "/employees", label: "Employees", icon: Users },
  { href: "/tasks", label: "Tasks", icon: KanbanSquare },
  { href: "/approvals", label: "Approvals", icon: ShieldCheck, countKey: "approvals" as const },
  { href: "/knowledge", label: "Skills & Knowledge", icon: BookOpen, countKey: "memoryProposals" as const },
  { href: "/integrations", label: "Integrations", icon: Plug },
  { href: "/admin", label: "Admin", icon: Settings, adminOnly: true },
];

export function AppShell({
  children,
  productName,
  workspaceName,
  user,
  role,
  isAdmin,
  counts,
  emergencyStop,
  logoutAction,
}: {
  children: ReactNode;
  productName: string;
  workspaceName: string;
  user: { name: string; email: string };
  role: string;
  isAdmin: boolean;
  counts: NavCounts;
  emergencyStop: { on: boolean; reason: string | null };
  logoutAction: () => Promise<void>;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const items = NAV.filter((n) => !n.adminOnly || isAdmin);

  const nav = (
    <nav aria-label="Primary" className="flex flex-col gap-0.5">
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(item.href + "/") || (item.href === "/knowledge" && (pathname.startsWith("/skills") || pathname.startsWith("/memory"))) || (item.href === "/office" && pathname.startsWith("/departments"));
        const count = item.countKey ? counts[item.countKey] : 0;
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setOpen(false)}
            aria-current={active ? "page" : undefined}
            className={`group flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors ${active ? "bg-surface text-ink shadow-sm" : "text-ink-2 hover:bg-surface hover:text-ink"}`}
          >
            <Icon size={17} className={active ? "text-accent" : "text-ink-3 group-hover:text-ink-2"} aria-hidden />
            <span className="flex-1">{item.label}</span>
            {count > 0 && <span className="rounded-full bg-amber-soft px-1.5 text-xs font-medium text-amber">{count}</span>}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[248px_1fr]">
      {/* Sidebar (desktop) */}
      <aside className="hidden border-r border-line bg-surface-2/60 px-4 py-5 lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col">
        <Brand productName={productName} workspaceName={workspaceName} />
        <div className="mt-6 flex-1">{nav}</div>
        <UserCard user={user} role={role} logoutAction={logoutAction} />
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <button className="absolute inset-0 bg-ink/40" aria-label="Close navigation" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 flex-col bg-surface px-4 py-5 shadow-lg">
            <div className="flex items-center justify-between">
              <Brand productName={productName} workspaceName={workspaceName} />
              <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)} aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <div className="mt-6 flex-1">{nav}</div>
            <UserCard user={user} role={role} logoutAction={logoutAction} />
          </div>
        </div>
      )}

      <div className="flex min-h-dvh flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-canvas/85 px-4 py-2.5 backdrop-blur sm:px-6">
          <button className="btn btn-ghost btn-sm lg:hidden" onClick={() => setOpen(true)} aria-label="Open navigation">
            <Menu size={18} />
          </button>
          <div className="min-w-0 flex-1 text-sm text-ink-2">
            <span className="font-medium text-ink lg:hidden">{productName}</span>
            <span className="hidden lg:inline">{workspaceName} · internal workspace</span>
          </div>
          <ThemeToggle />
        </header>
        {emergencyStop.on && (
          <div className="flex items-center gap-2 bg-rose-soft px-4 py-2 text-sm text-rose sm:px-6" role="alert">
            <OctagonAlert size={16} aria-hidden />
            <span className="font-medium">Emergency stop is active.</span>
            <span className="opacity-90">{emergencyStop.reason ?? "All AI employee work and action execution is paused."}</span>
            {isAdmin && (
              <Link href="/admin" className="ml-auto underline">
                Manage
              </Link>
            )}
          </div>
        )}
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
        <footer className="px-4 py-4 text-center text-xs text-ink-3 sm:px-6">
          Internal pilot build · AI employees are software and act only within approved boundaries · Demo connectors never deliver anything externally
        </footer>
      </div>
    </div>
  );
}

function Brand({ productName, workspaceName }: { productName: string; workspaceName: string }) {
  return (
    <Link href="/dashboard" className="flex items-center gap-3">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-ink text-sm font-semibold text-canvas">{productName.charAt(0)}</span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-ink">{productName}</span>
        <span className="block truncate text-xs text-ink-3">{workspaceName}</span>
      </span>
    </Link>
  );
}

function UserCard({ user, role, logoutAction }: { user: { name: string; email: string }; role: string; logoutAction: () => Promise<void> }) {
  return (
    <div className="mt-4 flex items-center gap-3 rounded-xl border border-line bg-surface p-3">
      <PersonAvatar name={user.name} size={34} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-ink">{user.name}</div>
        <div className="truncate text-xs text-ink-3">{role}</div>
      </div>
      <form action={logoutAction}>
        <button type="submit" className="btn btn-ghost btn-sm" aria-label="Sign out" title="Sign out">
          <LogOut size={16} />
        </button>
      </form>
    </div>
  );
}
