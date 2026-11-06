# Architecture

## Principles (from the master plan)

1. **Employee state lives in our platform, not in a model conversation.** Identity, skills, knowledge, memory, permissions, task state, artifacts, receipts and usage are relational records. A model is a replaceable component behind an adapter.
2. **Every consequential action is explicit.** proposed → pending approval → approved → executing → succeeded / failed / unknown, bound to the exact payload hash, with an idempotency key and a receipt.
3. **Untrusted content is data.** Knowledge sources, meeting records and inbound messages are wrapped as `<untrusted_data>` for the model, and — independently of the model — nothing executes unless it went through an approval record that server code validated.
4. **Workspace isolation from day one.** Every table carries `workspace_id`; membership is server-verified; tests cover cross-workspace reads and writes.
5. **Honest status.** Live vs Demo vs Disconnected vs Planned is computed on the server from what is actually implemented and configured; the UI cannot show "Live" for something simulated.

## Stack

| Layer | Choice | Why |
| --- | --- | --- |
| Web framework | Next.js 16 (App Router, React 19, Server Actions, Turbopack) | One deployable, server-rendered, server actions keep mutations on the server |
| Language | TypeScript 5 (strict) | Portable, Codex-friendly |
| Styling | Tailwind CSS v4 + CSS design tokens in `src/app/globals.css` | Light warm-neutral + dark mode, all colors are tokens |
| Database | SQLite via `better-sqlite3` + Drizzle ORM + SQL migrations (`drizzle/`) | Zero-setup local dev; schema is Postgres-portable |
| Jobs | DB-backed durable queue (`jobs` table) + worker loop | Survives restarts; no Redis needed for the pilot |
| AI providers | Direct `fetch` adapters for Anthropic Messages API and OpenAI Chat Completions + offline Demo adapter | No SDK lock-in; one interface |
| Tests | Vitest against in-memory SQLite | Fast, no network |
| Office scene | Server-rendered isometric SVG | Accessible, keyboard-navigable, works without WebGL, reduced-motion aware |

## Directory map

```
src/
  app/
    layout.tsx, globals.css          root layout + design tokens
    page.tsx                         → /dashboard
    login/                           sign-in page + login/logout server actions
    (app)/                           authenticated shell (requires workspace membership)
      layout.tsx                     AppShell (nav, emergency banner, counts)
      dashboard/                     overview
      office/, departments/[slug]/   2.5D office + list view, department pages
      employees/                     directory, new, [id] profile, [id]/edit, [id]/workspace, actions.ts
      tasks/                         board/list, [id] detail, actions.ts
      approvals/                     center, [id] detail, actions.ts
      knowledge/, skills/, memory/   sources, versioned skills, memory review queue, actions.ts
      integrations/                  connectors, grants, communication history, actions.ts
      admin/                         controls, members, permissions, providers, usage, audit
      error.tsx, loading.tsx, not-found.tsx
    api/health, api/jobs/run         health check; optional token-protected job trigger
  components/
    app-shell.tsx                    responsive shell (client)
    office/office-scene.tsx          isometric office (server component, SVG)
    artifacts/artifact-view.tsx      renders drafts for reviewers
    ui/                              badge, button, card, avatar, markdown, flash, theme toggle
  db/
    schema.ts                        Drizzle schema (single source of truth)
    client.ts                        connection, migrations, singleton
    seed.ts, demo-users.ts           fictional sample data (runs the real pipeline)
  lib/
    auth/                            password (scrypt), session, membership, request context
    authz.ts                         permission matrix + assertCan
    audit.ts                         append-only audit with secret redaction
    ids.ts, format.ts, actions-util.ts
    providers/                       types, anthropic, openai, demo, resolver (fallback rules)
    connectors/                      connector framework + demo/planned adapters, effective mode
    workflows/                       meeting-actions (extractor + grounding), weekly-summary, runner
    jobs/                            queue (enqueue/claim/fail/recover) + worker (handlers, timeouts)
    services/                        approvals, tasks, employees, knowledge, chat, retrieval, prompt, usage, admin
  proxy.ts                           route guard (session cookie presence); real checks happen per request
  instrumentation.ts                 starts the inline worker in the Next.js process
scripts/                             migrate, seed, reset, worker (tsx)
drizzle/                             generated SQL migrations + snapshots
tests/                               Vitest suites + fixture
docs/                                this folder
```

## Request flow

1. `proxy.ts` redirects to `/login` when no session cookie exists (cheap guard only).
2. Every page/action calls `requireWorkspace()` → verifies the session token hash, loads memberships, and picks the workspace from the `ih_workspace` cookie **only if the user is a member** (otherwise the first membership).
3. Mutations are Server Actions in `actions.ts` files. Each calls `requirePermission(<permission>)` (see `src/lib/authz.ts`), validates input with zod, calls a service, writes an audit event, and redirects with a flash message. No client-side trust.

## A task moving through the system

```
Human starts workflow  →  tasks(queued) + jobs(task.run)
Worker claims job      →  runTaskWorkflow(): status=working, step 1..4 with checkpoints (task_steps)
                           step 1 verifies the source is approved AND linked to the employee
                           step 2 runs the deterministic extractor (optionally model + grounding)
                           step 3 stores the artifact (draft_action_list / draft_status_summary)
                           step 4 proposeAction(review_draft) → approvals(pending), task=needs_approval
Manager reviews        →  decideApproval(): review_draft approve = artifact.reviewed, task completed
                           NOTHING external happens here (tested)
Manager proposes follow-up (optional) → proposeFollowUp(): requires artifact.reviewed, builds exact payload,
                           checks employee authority + connector grant + connector mode → approvals(pending)
Manager approves       →  jobs(approval.execute) → executeApproval(): payload-hash check, emergency stop,
                           employee active, grant active, receipt (unique idempotency key), connector adapter
                           (Demo → simulated receipt + communication_events.status='simulated')
Unknown outcome        →  receipt.status=unknown; retry calls adapter.reconcile() first; never re-runs blindly
```

## Model gateway

`resolveProvider(modelConfig)`: primary if configured → fallback if the employee config allows it and it is configured → Demo (always available, clearly labeled, `degraded=true`). Every call records a `usage_events` row with a unique `event_key` so retries never double-count. Budgets are checked before model calls when cost estimates exist. Output is not promised to be identical across providers; the UI shows the degradation note.

## Jobs

- `enqueueJob` inserts a row; `claimNextJob` does a conditional `UPDATE … WHERE status='queued'` so two workers never run the same job.
- Failures: retryable errors (provider/timeouts) back off exponentially up to `max_attempts`; non-retryable (`WorkflowBlocked`, `ApprovalError`) fail immediately and the task is marked blocked with the reason.
- Emergency stop holds jobs (re-queued 30s later) instead of failing them.
- Inline mode (`JOB_WORKER_MODE=inline`, default) runs a poller inside the Next.js process **and** drains jobs synchronously right after a server action so the demo feels immediate. External mode runs `pnpm worker`.
- Replacing the queue with BullMQ/pg-boss only touches `src/lib/jobs/*`.

## Office scene

`OfficeScene` is a pure server component that emits SVG: each department is an isometric room (`<a>` link, `aria-label` with status summary, keyboard focusable). Employee tokens show status rings and a pulsing "working" dot. Motion is CSS-only and disabled under `prefers-reduced-motion`. On small screens the list view is rendered instead; `/office?view=list` renders the list on any screen.

## Moving to Postgres

The schema uses only `text`, `integer` and JSON-as-text columns. Steps: switch `drizzle.config.ts` dialect to `postgresql`, swap `better-sqlite3` for `pg`/`postgres` in `src/db/client.ts`, regenerate migrations with `pnpm db:generate`, and replace the synchronous `.run()/.get()/.all()/.sync()` calls in services with `await` (Drizzle's API is otherwise identical). The test fixture uses the same client factory. Keep `workspace_id` on every table and add Postgres row-level security when client workspaces go live.
