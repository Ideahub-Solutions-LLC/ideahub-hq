"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { Plug, Plus, Search, X } from "lucide-react";
import {
  APP_CATALOG,
  APP_CATEGORIES,
  CATEGORY_LABEL,
  type AppCategory,
} from "@/lib/workspace/app-catalog";
export function AppCatalog({
  initialCategory = "all",
}: {
  initialCategory?: AppCategory;
}) {
  const [category, setCategory] = useState(initialCategory);
  const [query, setQuery] = useState("");
  const apps = APP_CATALOG.filter(
    (app) =>
      (category === "all" || app.category === category) &&
      `${app.name} ${app.summary}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <div className="space-y-5">
      <label className="relative block">
        <span className="sr-only">Search apps</span>
        <Search
          aria-hidden
          size={16}
          className="absolute left-3 top-3 text-ink-3"
        />
        <input
          className="input pl-10"
          placeholder="Search apps by name or purpose…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <div
        className="flex flex-wrap gap-2"
        role="group"
        aria-label="App categories"
      >
        {APP_CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            className={`btn btn-sm ${category === c ? "btn-primary" : "btn-secondary"}`}
            aria-pressed={category === c}
            onClick={() => setCategory(c)}
          >
            {CATEGORY_LABEL[c]}
          </button>
        ))}
      </div>
      <p className="text-xs text-ink-3">
        {apps.length} apps · saved setup and verified access are shown
        separately
      </p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {apps.map((app) => (
          <Link
            key={app.key}
            href={`/tools/apps/${app.key}`}
            className="card card-hover min-w-0 p-4"
          >
            <div className="flex items-center gap-3">
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-sm font-semibold"
                style={{
                  color: `var(--${app.color === "teal" ? "accent-2" : app.color})`,
                }}
              >
                {app.name.slice(0, 2).toUpperCase()}
              </span>
              <h3 className="min-w-0 text-sm font-semibold">{app.name}</h3>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-ink-2">
              {app.summary}
            </p>
            <span className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-accent">
              <Plus size={13} aria-hidden />
              Choose setup
            </span>
          </Link>
        ))}
      </div>
      {!apps.length && (
        <p className="py-8 text-center text-sm text-ink-2">
          No matching apps. Try another category or search.
        </p>
      )}
    </div>
  );
}
export function AddAppsButton({
  label = "Add apps",
  category = "all",
  primary = false,
}: {
  label?: string;
  category?: AppCategory;
  primary?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button
        type="button"
        className={`btn ${primary ? "btn-primary" : "btn-secondary"}`}
        onClick={() => dialog.current?.showModal()}
      >
        <Plug size={15} aria-hidden />
        {label}
      </button>
      <dialog ref={dialog} className="app-catalog-dialog" aria-label="Add apps">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-line bg-surface p-5">
          <div>
            <h2 className="text-lg font-semibold">Add apps</h2>
            <p className="mt-1 text-xs text-ink-2">
              Choose an app, review ownership and access, then complete
              connection setup.
            </p>
          </div>
          <form method="dialog">
            <button
              className="btn btn-ghost btn-sm"
              aria-label="Close app catalog"
            >
              <X size={18} aria-hidden />
            </button>
          </form>
        </div>
        <div className="p-5">
          <AppCatalog initialCategory={category} />
        </div>
      </dialog>
    </>
  );
}
