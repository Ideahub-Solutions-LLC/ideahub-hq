# IdeaHub AI Team

> Working title — the product name, company name and colors are configuration, not code.

A digital headquarters where IdeaHub's human team and AI employees work together. Each AI employee is a durable platform record with a name, role, personality, department, skills, approved knowledge, reviewed memory, tool grants, channels, tasks, a human manager and explicit permissions. People stay responsible for strategy, relationships, quality and decisions; AI employees prepare drafts and propose actions inside approved boundaries.

**Status: internal pilot build (single workspace).** Not security-audited, not production-ready, not a public SaaS. Everything that is simulated is labeled as such in the UI and in `docs/CODEX_HANDOFF.md`.

## What works today

| Area | State |
| --- | --- |
| Sign-in, server sessions, roles (owner / admin / manager / member) | **Real** — scrypt password hashes, hashed session tokens, server-enforced permission matrix (`src/lib/authz.ts`) |
| Workspace scoping | **Real** — every record carries `workspace_id`; membership is verified server-side on each request; covered by isolation tests |
| Dashboard, 2.5D office (SVG) + list view, departments | **Real** |
| Employee directory, profile, edit (identity / personality / skills / knowledge / authority / model) | **Real** — versioned, audited |
| Employee workspace (conversation, current task, outputs, approvals, workflow runner) | **Real** — replies use Claude/OpenAI when an API key is configured, otherwise a clearly labeled offline **Demo provider** |
| Pilot workflow A: meeting record → draft action list | **Real, deterministic** — source-linked, flags missing / unverified owners and dates; optional model extraction is validated against the source |
| Pilot workflow B: weekly status summary from task records | **Real, deterministic** — every line cites its record |
| Task board + task detail (steps / checkpoints, artifacts, activity, approvals, controls) | **Real**, persisted in SQLite |
| Approval center — exact action, payload hash binding, idempotent execution, receipts, reconcile-before-retry | **Real** engine; **execution targets are Demo connectors** |
| Skills (versioned), knowledge sources (reviewed), memory proposal queue | **Real** |
| Integrations (Slack, Teams, Email, Zoom, CQL/GoHighLevel, task system) | **Simulated**: Demo / Disconnected / Planned. Nothing is ever delivered externally in this version |
| Admin: members & roles, employee permissions, providers, usage ledger & budgets, audit log, emergency stop | **Real** (usage costs only when a pricing table is configured) |
| Background jobs | **Real** durable DB-backed queue with a worker (inline in dev, or `pnpm worker`) |
| Billing / checkout | **Not implemented** (design only: `docs/BILLING_DESIGN.md`) |

## Prerequisites

- Node.js **20.9+** (22 LTS recommended) and **pnpm 10** (`corepack enable` or `npm i -g pnpm`)
- A C/C++ toolchain is only needed if `better-sqlite3` has no prebuilt binary for your platform (it does for macOS/Linux/Windows on Node 20/22)
- No external services are required. SQLite is used for local development.

## Install and run locally

```bash
pnpm install
cp .env.example .env.local        # fill SESSION_SECRET (openssl rand -hex 32); keys are optional
pnpm setup                        # = db:migrate + db:seed (fictional sample workspace)
pnpm dev                          # http://localhost:3000
```

Sign in with a seeded fictional account (password = `SEED_DEMO_PASSWORD`, default `change-me-demo`):

| Role | Email |
| --- | --- |
| owner | avery@example.com |
| admin | jordan@example.com |
| manager | sam@example.com (manages the pilot employee) |
| manager | priya@example.com |
| member | riley@example.com |

> The pilot AI employee is **Harper — AI Operations Coordinator** (Operations department, managed by Sam). Open *Employees → Harper → Open workspace* to run both pilot workflows.

### Useful scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` / `pnpm build` / `pnpm start` | Next.js dev server / production build / production server |
| `pnpm test` | Vitest suite (in-memory SQLite, no network) |
| `pnpm typecheck` / `pnpm lint` | TypeScript (app + tests) / ESLint |
| `pnpm db:generate` | Generate a new SQL migration from `src/db/schema.ts` (Drizzle Kit) |
| `pnpm db:migrate` | Apply migrations to `DATABASE_URL` |
| `pnpm db:seed` | Seed the fictional workspace (refuses to double-seed; `--force` adds another) |
| `pnpm db:reset` | Delete the local SQLite file |
| `pnpm worker` | Run the job worker as a separate process (set `JOB_WORKER_MODE=external`) |

### Enabling live AI providers

Set `ANTHROPIC_API_KEY` and/or `OPENAI_API_KEY` in `.env.local` (server only) and restart. The dashboard banner disappears and *Admin → Model providers* shows the effective routing per employee. These must be **API keys from developer accounts**: a consumer ChatGPT or Claude subscription does not authorize API usage, and the platform never accepts passwords or session tokens.

Costs are estimated only if you provide `PROVIDER_PRICING_JSON` (USD per 1M tokens). Without it, usage is recorded in tokens and cost is marked *unavailable* — we do not invent provider prices.

## Deployment (outline)

1. Build: `pnpm build`; run: `pnpm start` (Node runtime, needs write access to `DATABASE_URL`'s directory).
2. Run the worker separately (`JOB_WORKER_MODE=external`, `pnpm worker`) or keep it inline for a single-instance deployment.
3. Set `SESSION_SECRET`, `SEED_DEMO_PASSWORD` (or do not seed), provider keys, and `NODE_ENV=production` (cookies become `Secure`).
4. SQLite is fine for a single-instance pilot. For multi-instance or client workspaces, move to Postgres (the schema uses only portable column types; see `docs/ARCHITECTURE.md`).
5. Put the app behind HTTPS and restrict network access until the security review in `docs/SECURITY.md` is complete.

## Documentation

- `docs/ARCHITECTURE.md` — layers, directory map, request/task/approval flows, Postgres path
- `docs/DATA_MODEL.md` — every table and why it exists; migration and seed instructions
- `docs/INTEGRATIONS.md` — connector framework, each connector's status, exact steps to go live
- `docs/SECURITY.md` — what is enforced, what is not, known limitations
- `docs/BILLING_DESIGN.md` — future client offering and usage ledger design (not implemented)
- `docs/CODEX_HANDOFF.md` — what works, what is mocked, what remains, prioritized next steps for the team
- `AGENTS.md` — repository conventions and verified commands for coding agents

## License / ownership

Internal IdeaHub Solutions LLC project. Sistava.com was used only as public inspiration for the general concept; no branding, assets, text or proprietary material from it is used here.
