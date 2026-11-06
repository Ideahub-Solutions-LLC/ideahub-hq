# Codex handoff — IdeaHub AI Team v0.1 (internal pilot)

Prepared 6 Nov 2026 for Emmanuel and the IdeaHub engineering team. Read `README.md` first, then this file, then `docs/ARCHITECTURE.md`.

## 1. What works (verified)

Verified in this environment: Node 22.23.4, pnpm 10.28.0, Next.js 16.4.5, React 19.3.1, TypeScript 5.9.3, Drizzle 0.45.4, better-sqlite3 13.0.3.

| Check | Result |
| --- | --- |
| `pnpm install && pnpm db:setup && pnpm dev` | Runs; sign-in with seeded accounts works |
| `pnpm typecheck` | Clean (app + tests) |
| `pnpm lint` | Clean (ESLint 10, `eslint-config-next` flat config) |
| `pnpm test` | **35 / 35 passing** in 5 files (see §5) |
| `pnpm build` | Production build succeeds (Turbopack); `pnpm start` serves it |
| Browser flows (Playwright, Chromium) | Login; approve a `create_external_tasks` proposal → simulated receipt, "Executed", no second execution on reload; run meeting workflow → task `needs_approval` with rendered draft (owner missing / unverified flags); accept draft → artifact reviewed, **no receipt, nothing sent**; propose follow-up → new **pending** approval; chat with "remember that…" → demo-labeled reply + memory proposal in the review queue; manager hitting `/admin` → blocked server-side |
| Responsive / dark mode | All pages fit a 390px viewport without horizontal scroll; dark theme via OS preference or toggle |

Acceptance criteria from the brief:

1. Team member can run locally from the docs — **yes** (`README.md`).
2. Dashboard and office in visual and accessible list views — **yes** (`/office`, `/office?view=list`, auto-list on small screens; SVG rooms are links with ARIA labels; reduced-motion honored).
3. Inspect and edit the sample Operations Coordinator (role, personality, skills) — **yes** (`/employees/<harper>/edit`, tabs; authority and model are admin-only tabs).
4. Sample meeting summary produces a labeled draft task list with missing information flagged — **yes** (deterministic extractor; `owner missing`, `unverified`, `due not stated`, source line per item).
5. Manager can review a proposed action without any external message being sent — **yes** (Demo connectors; `communication_events.status = simulated`; tests assert no delivery path exists).
6. Task state and audit history persist — **yes** (SQLite file at `DATABASE_URL`; survives restarts; durable job queue).
7. Integration status separates live from simulated — **yes** (effective mode computed server-side; all connectors are Demo/Disconnected/Planned today).
8. Tests, setup instructions, truthful handoff — this document.

## 2. What is simulated or demo-only (be explicit with stakeholders)

| Item | Reality |
| --- | --- |
| AI provider | Live adapters for Anthropic and OpenAI exist and are exercised only when keys are set. **In the delivered environment no key was configured**, so every reply came from the deterministic Demo provider (labeled in the UI and in `messages.metadata.provider`). Live-model paths (`anthropic.ts`, `openai.ts`, model extraction in `runner.ts`) are **untested against real APIs** — test with real keys first. |
| Connectors | Slack / Email / Task system are Demo adapters; Teams / Zoom / GHL are Planned. Nothing was ever sent. |
| Provider pricing / costs | None configured; costs show "unavailable". We do not ship invented prices. |
| Billing / checkout | Design only (`docs/BILLING_DESIGN.md`). |
| Member invitations | Temporary password shown once; no email. |
| Files / URLs as knowledge | Pasted text only; no upload, crawl or vector index. |
| Office 3D | 2.5D isometric SVG, not WebGL. Deliberate: accessible, portable, no GPU dependency. Three.js can be layered on later behind the same `SceneDepartment` data. |
| Seed data | Entirely fictional (Avery Cruz, Sam Okafor, Northwind Dental…). Swap before any real use. |

## 3. What requires configuration to go further

| Need | Where |
| --- | --- |
| `SESSION_SECRET` (any 32+ random bytes; reserved for signed cookies/CSRF work) | `.env.local` |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` (developer API keys only) | server env; see *Admin → Model providers* |
| `PROVIDER_PRICING_JSON` for cost estimates and budget enforcement | server env |
| `JOB_WORKER_MODE=external` + `pnpm worker` for production | server env / process manager |
| Connector credentials (names in `.env.example`) + live adapters | `src/lib/connectors/index.ts` (`docs/INTEGRATIONS.md` has the steps) |
| Postgres for multi-instance / client workspaces | `docs/ARCHITECTURE.md` → "Moving to Postgres" |

## 4. Repository map and conventions

See `docs/ARCHITECTURE.md` (directory map) and `AGENTS.md` (conventions + verified commands). Key rules:

- Business logic lives in `src/lib/services/*` and `src/lib/workflows/*` as plain functions taking `db` — testable without Next.js.
- Server Actions (`actions.ts` next to each route) only: authorize (`requirePermission`), parse (zod), call a service, redirect with a flash. Never put logic in actions.
- Every mutation writes an audit row through `recordAudit` (secrets redacted).
- Every consequential action goes through `proposeAction → decideApproval → executeApproval`. Do not add a code path that calls a connector directly.
- Schema changes: edit `src/db/schema.ts` → `pnpm db:generate` → commit SQL + `drizzle/meta`.
- Relational queries on better-sqlite3 are synchronous: use `.sync()` in services or `await` in server components (the thenable `db.query.*` object is **not** an array until awaited).

## 5. Tests and known failures

`pnpm test` → 35 passed, 0 failed, 0 skipped (≈1.2 s). Suites:

- `tests/authz.test.ts` — role matrix, approval decisions by role, last-owner protection, scrypt, session hashing/expiry
- `tests/isolation.test.ts` — cross-workspace reads/writes, membership, approvals, tasks
- `tests/approvals.test.ts` — authority policy, grants, planned/disconnected connectors, dedupe, undecided/rejected never execute, payload-hash binding, draft review has no effect, reviewed draft still needs a new approval, unverified owners never assigned, execute-once, reconcile-before-retry, emergency stop, paused employee, revoked grant
- `tests/workflows.test.ts` — extractor (owners, dates, source lines, injection as data), model-draft grounding, weekly summary sections, runner end to end, pending/no-access sources
- `tests/jobs.test.ts` — atomic claim, backoff and permanent failure, stale-lock recovery, emergency hold, non-retryable failures, idempotent replies + memory proposals, full seed through the real pipeline

Known gaps (no failing tests, but untested areas): live provider adapters, UI components (no component tests; Playwright was used manually, not committed as a suite), concurrency under multiple worker processes (claim is atomic; not load-tested).

## 6. Security and privacy limitations

See `docs/SECURITY.md`. Headline: no rate limiting, no 2FA, no RLS, no encryption at rest, no CSP, no retention policy, demo accounts seeded. Single-tenant pilot only.

## 7. Prioritized next engineering steps

**P0 — before the internal pilot runs on real meetings**
1. Add real API keys in a staging env; run both workflows with `useModel` on and compare against the deterministic output on 10 real recaps; fix extraction gaps in `meeting-actions.ts` (section patterns, owner patterns) with tests.
2. Replace seeded accounts with real IdeaHub users (`src/db/demo-users.ts`, or create via *Admin → Members*); set `SEED_DEMO_PASSWORD`, remove the login hints (`SHOW_DEMO_LOGINS`).
3. Add login rate limiting and a password reset flow.
4. Decide the first *real* source: either paste Zoom recaps as `meeting_record` sources (works today) or build the Zoom read-only connector (`docs/INTEGRATIONS.md`).

**P1 — controlled actions**
5. Implement the first live connector (recommended: Slack post to one channel, or the real task tool) following the 6-step recipe; keep Demo as the default mode.
6. Add `PROVIDER_PRICING_JSON` and verify budget enforcement end to end; add threshold alerts (email/Slack) using the same approval path.
7. Add a Playwright e2e suite from the manual flows listed in §1 (`tests/e2e/`), run in CI.

**P2 — platform hardening**
8. Move to Postgres + RLS; run two worker processes; add `JOBS_TRIGGER_TOKEN` cron for serverless deployments.
9. Knowledge ingestion: file upload (PDF/DOCX → text), source versioning diff, deletion propagation; optional vector index (keep it rebuildable).
10. Evaluation set per workflow (30–50 cases incl. adversarial) stored in-repo; a `pnpm eval` script scoring factual grounding and abstention.
11. Security headers/CSP, 2FA, SSO, retention jobs.

**P3 — product**
12. Second employee (Knowledge Assistant "Maren") using the cite-or-abstain skill once sources are curated.
13. Inbound messages (Slack/Email webhooks → `communication_events` → employee reply via approval).
14. Client workspace readiness per `docs/BILLING_DESIGN.md` gate.

## 8. GitHub export

This environment could not push (no valid GitHub credentials). The repo is delivered as a Git repository with one clean commit. To publish:

```bash
cd ideahub-ai-team
git remote add origin git@github.com:<org>/ideahub-ai-team.git
git push -u origin main
```

Exporting code does **not** transfer: the local SQLite database (`data/` is git-ignored — re-run `pnpm db:setup`), `.env.local` secrets, or any provider/connector configuration. Each environment must run migrations (`pnpm db:migrate`) and configure env vars separately.
