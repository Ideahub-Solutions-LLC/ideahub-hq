"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  LayoutDashboard,
  Building2,
  Users,
  KanbanSquare,
  ShieldCheck,
  BookOpen,
  Plug,
  Settings,
  Menu,
  X,
  LogOut,
  OctagonAlert,
  MessageCircle,
  CalendarDays,
  Folder,
  Contact,
  Library,
  Mail,
  Search,
  Activity,
} from "lucide-react";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { PersonAvatar } from "@/components/ui/ai-avatar";

export type NavCounts = { approvals: number; memoryProposals: number };

const NAV = [
  { group: "Work", href: "/chat", label: "Chat", icon: MessageCircle },
  { group: "Work", href: "/tasks", label: "Tasks", icon: KanbanSquare },
  { group: "Work", href: "/calendar", label: "Calendar", icon: CalendarDays },
  { group: "Work", href: "/drive", label: "Drive", icon: Folder },
  { group: "Work", href: "/crm", label: "CRM", icon: Contact },
  { group: "Work", href: "/library", label: "Library", icon: Library },
  { group: "Work", href: "/mailbox", label: "Mailbox", icon: Mail },
  {
    group: "Workforce",
    href: "/employees",
    label: "AI employees",
    icon: Users,
  },
  {
    group: "Workforce",
    href: "/knowledge",
    label: "Skills & Knowledge",
    icon: BookOpen,
    countKey: "memoryProposals" as const,
  },
  { group: "Workforce", href: "/tools", label: "Tools & apps", icon: Plug },
  {
    group: "Monitor",
    href: "/approvals",
    label: "Approvals",
    icon: ShieldCheck,
    countKey: "approvals" as const,
  },
  { group: "Monitor", href: "/office", label: "3D Office", icon: Building2 },
  { group: "Monitor", href: "/teams", label: "Teams", icon: Users },
  { group: "Monitor", href: "/activity", label: "Activity", icon: Activity },
  {
    group: "Monitor",
    href: "/dashboard",
    label: "Overview",
    icon: LayoutDashboard,
  },
  {
    group: "Setup",
    href: "/hq/setup",
    label: "HQ readiness",
    icon: ShieldCheck,
  },
  {
    group: "Setup",
    href: "/admin",
    label: "Administration",
    icon: Settings,
    adminOnly: true,
  },
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
  const drawer = useRef<HTMLDialogElement>(null);
  const jump = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState("");
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        setQuery("");
        jump.current?.showModal();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  const items = NAV.filter((n) => !n.adminOnly || isAdmin);

  const nav = (
    <nav aria-label="Primary" className="flex flex-col gap-0.5">
      {["Work", "Workforce", "Monitor", "Setup"].map((group) => (
        <div key={group} className="mb-4">
          <h2 className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-widest text-ink-3">
            {group}
          </h2>
          {items
            .filter((item) => item.group === group)
            .map((item) => {
              const active =
                pathname === item.href ||
                pathname.startsWith(item.href + "/") ||
                (item.href === "/knowledge" &&
                  (pathname.startsWith("/skills") ||
                    pathname.startsWith("/memory"))) ||
                (item.href === "/tools" &&
                  pathname.startsWith("/integrations")) ||
                (item.href === "/teams" && pathname.startsWith("/departments"));
              const count = item.countKey ? counts[item.countKey] : 0;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => drawer.current?.close()}
                  aria-current={active ? "page" : undefined}
                  className={`group flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors ${active ? "bg-surface text-ink shadow-sm" : "text-ink-2 hover:bg-surface hover:text-ink"}`}
                >
                  <Icon
                    size={17}
                    className={
                      active
                        ? "text-accent"
                        : "text-ink-3 group-hover:text-ink-2"
                    }
                    aria-hidden
                  />
                  <span className="flex-1">{item.label}</span>
                  {count > 0 && (
                    <span className="rounded-full bg-amber-soft px-1.5 text-xs font-medium text-amber">
                      {count}
                    </span>
                  )}
                </Link>
              );
            })}
        </div>
      ))}
    </nav>
  );

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[232px_minmax(0,1fr)]">
      {/* Sidebar (desktop) */}
      <aside className="hidden border-r border-line bg-surface-2/60 px-4 py-5 lg:sticky lg:top-0 lg:flex lg:h-dvh lg:min-h-0 lg:flex-col">
        <Brand productName={productName} workspaceName={workspaceName} />
        <div className="mt-5 min-h-0 flex-1 overflow-y-auto">{nav}</div>
        <UserCard user={user} role={role} logoutAction={logoutAction} />
      </aside>

      <dialog ref={drawer} className="nav-drawer" aria-label="Navigation">
        <div className="flex h-dvh min-h-0 flex-col bg-surface px-4 py-5">
          <div className="flex items-center justify-between gap-2">
            <Brand productName={productName} workspaceName={workspaceName} />
            <form method="dialog">
              <button
                className="btn btn-ghost btn-sm"
                aria-label="Close navigation"
              >
                <X size={18} />
              </button>
            </form>
          </div>
          <div className="mt-5 min-h-0 flex-1 overflow-y-auto">{nav}</div>
          <UserCard user={user} role={role} logoutAction={logoutAction} />
        </div>
      </dialog>
      <dialog
        ref={jump}
        className="app-catalog-dialog max-w-xl"
        aria-label="Jump to workspace area"
      >
        <div className="flex items-center justify-between border-b border-line p-4">
          <h2 className="font-semibold">Jump to workspace area</h2>
          <form method="dialog">
            <button className="btn btn-ghost btn-sm" aria-label="Close search">
              <X size={18} />
            </button>
          </form>
        </div>
        <div className="p-4">
          <label className="label" htmlFor="jump-search">
            Search navigation
          </label>
          <input
            id="jump-search"
            className="input"
            placeholder="Tasks, Drive, tools…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="mt-3 grid gap-1 sm:grid-cols-2">
            {items
              .filter((n) =>
                `${n.label} ${n.group}`
                  .toLowerCase()
                  .includes(query.toLowerCase()),
              )
              .map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  onClick={() => jump.current?.close()}
                  className="rounded-lg p-3 text-sm hover:bg-surface-2"
                >
                  <span className="mr-2 text-ink-3">{n.group} /</span>
                  {n.label}
                </Link>
              ))}
          </div>
        </div>
      </dialog>

      <div className="flex min-h-dvh min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-canvas/85 px-4 py-2.5 backdrop-blur sm:px-6">
          <span className="lg:hidden">
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => drawer.current?.showModal()}
              aria-label="Open navigation"
            >
              <Menu size={18} />
            </button>
          </span>
          <div className="min-w-0 flex-1 text-sm text-ink-2">
            <span className="font-medium text-ink lg:hidden">
              {productName}
            </span>
            <span className="hidden lg:inline">
              {workspaceName} · internal workspace
            </span>
          </div>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setQuery("");
              jump.current?.showModal();
            }}
            aria-label="Search workspace navigation"
            title="Jump to an area (⌘/Ctrl K)"
          >
            <Search size={16} aria-hidden />
            <span className="hidden sm:inline">Jump to…</span>
          </button>
          <ThemeToggle />
        </header>
        {emergencyStop.on && (
          <div
            className="flex items-center gap-2 bg-rose-soft px-4 py-2 text-sm text-rose sm:px-6"
            role="alert"
          >
            <OctagonAlert size={16} aria-hidden />
            <span className="font-medium">Emergency stop is active.</span>
            <span className="opacity-90">
              {emergencyStop.reason ??
                "All AI employee work and action execution is paused."}
            </span>
            {isAdmin && (
              <Link href="/admin" className="ml-auto underline">
                Manage
              </Link>
            )}
          </div>
        )}
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
        <footer className="px-4 py-4 text-center text-xs text-ink-3 sm:px-6">
          Internal pilot build · AI employees are software and act only within
          approved boundaries · Demo connectors never deliver anything
          externally
        </footer>
      </div>
    </div>
  );
}

function Brand({
  productName,
  workspaceName,
}: {
  productName: string;
  workspaceName: string;
}) {
  return (
    <Link href="/dashboard" className="flex items-center gap-3">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-ink text-sm font-semibold text-canvas">
        {productName.charAt(0)}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-ink">
          {productName}
        </span>
        <span className="block truncate text-xs text-ink-3">
          {workspaceName}
        </span>
      </span>
    </Link>
  );
}

function UserCard({
  user,
  role,
  logoutAction,
}: {
  user: { name: string; email: string };
  role: string;
  logoutAction: () => Promise<void>;
}) {
  return (
    <div className="mt-4 flex shrink-0 items-center gap-3 rounded-xl border border-line bg-surface p-3">
      <PersonAvatar name={user.name} size={34} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-ink">{user.name}</div>
        <div className="truncate text-xs text-ink-3">{role}</div>
      </div>
      <form action={logoutAction}>
        <button
          type="submit"
          className="btn btn-ghost btn-sm"
          aria-label="Sign out"
          title="Sign out"
        >
          <LogOut size={16} />
        </button>
      </form>
    </div>
  );
}
