# AGENTS.md — conventions for coding agents (Codex, Claude, humans)

## Verified commands

```bash
pnpm install            # Node >= 20.9, pnpm 10 (no native build: better-sqlite3 ships prebuilt binaries)
pnpm db:setup           # db:migrate + db:seed (fictional data)
pnpm dev                # http://localhost:3000 (inline job worker starts automatically)
pnpm typecheck          # tsc for app and tests
pnpm lint               # eslint (flat config, eslint-config-next 16)
pnpm test               # vitest, in-memory SQLite, no network — must stay green
pnpm build && pnpm start
pnpm db:generate --name <change>   # after editing src/db/schema.ts; commit drizzle/*.sql and drizzle/meta
pnpm db:reset && pnpm db:setup   # fresh database
```

## Rules

1. **Server-enforced everything.** Pages and server actions start with `requireWorkspace()` / `requirePermission()`. Never trust client state; never read `workspace_id` from a form.
2. **Services, not actions, hold logic.** `src/lib/services/*` and `src/lib/workflows/*` are plain functions `(db, input)`; actions authorize → validate (zod) → call → `recordAudit` → `flashRedirect`.
3. **No direct connector calls.** The only path to an external system is `proposeAction → decideApproval → executeApproval`. Keep `review_draft` side-effect free.
4. **Never claim live when simulated.** Connector mode is computed by `effectiveConnectorMode`; demo results must carry `simulated: true` and comms status `simulated`.
5. **Secrets stay in env.** The database stores env var *names* only. Do not log tokens; `redact()` runs on audit data.
6. **Untrusted data stays data.** Knowledge, meeting records and inbound messages are wrapped as `<untrusted_data>`; model output is validated by code (`groundDraft`) before it is shown as a draft.
7. **Every schema change ships with a migration and, if behavior changes, a test.** Tests use `tests/fixture.ts` (`freshDb()` + `buildFixture()`).
8. **Drizzle on better-sqlite3 is synchronous.** `db.select().…get()/.all()/.run()`; relational `db.query.*` needs `.sync()` in services or `await` in server components.
9. **Design tokens, not hex.** Colors come from CSS variables in `src/app/globals.css` (`bg-surface`, `text-ink-2`, `bg-accent-soft`, …). Keep light and dark in sync. Respect `prefers-reduced-motion`.
10. **Accessibility baseline.** Native buttons/links, labels for inputs, `aria-current` for nav, focus-visible rings, no color-only status (badges carry text).
11. **Fictional data only** in seeds, tests and docs.
12. **Naming is configuration.** Use `PRODUCT_NAME`/workspace settings; never hard-code "IdeaHub AI Team" in UI strings.

## Where things are

See `docs/ARCHITECTURE.md` for the directory map and flows, `docs/DATA_MODEL.md` for tables, `docs/INTEGRATIONS.md` for connectors, `docs/SECURITY.md` for limits, `docs/CODEX_HANDOFF.md` for priorities.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
