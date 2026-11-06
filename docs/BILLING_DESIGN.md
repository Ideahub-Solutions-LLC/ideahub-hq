# Future client offering and billing — design only (not implemented)

Nothing in this document is live. There is no checkout, no invoicing and no price list in the codebase. The pilot records *usage* so that unit economics can be measured before any price is set.

## Commercial layers (keep separate)

| Layer | What the client buys | Metered? |
| --- | --- | --- |
| One-time employee setup | Job specification, knowledge onboarding, skills, readiness test | No (fixed fee) |
| Platform subscription | Workspace, seats, employees, dashboards, approvals, audit | No (per period) |
| Optional human management & support | A named IdeaHub manager reviewing outputs, SLAs | No (per period) or hourly |
| AI model usage | Tokens by provider/model | **Yes** |
| Communications usage | Messages/calls through connectors (Slack, email, SMS later) | **Yes** |
| Third-party usage | Connector-specific costs (e.g. transcription minutes) | **Yes** |

## Provider account routes

1. **IdeaHub-managed API usage** (baseline): IdeaHub pays providers, meters per workspace/employee/task, applies allowances and overages, discloses terms.
2. **Customer-owned provider account**: the client supplies API credentials stored in a secret store (never the DB) scoped to their workspace; the client pays the provider directly. **The client must not be charged again for that same usage**; only a clearly disclosed separate *service fee* may apply.
3. Consumer subscriptions (ChatGPT/Claude logins) are **not** a supported route.

## Usage ledger (exists today, minimal)

`usage_events`: workspace, employee, task, provider, model, meter, units, estimated cost (nullable), cost status, unique event key, timestamp.

To become billable it needs: `price_version`, `currency`, `billable_to` (ideahub | client-provider), `reconciliation_status` (estimated | finalized | disputed | credited), and a nightly job that finalizes estimates from provider invoices.

## Allowances, budgets, overages, alerts

- Budgets exist per workspace and per employee (monthly limit + alert threshold). Enforcement blocks *new* model calls when estimates reach the cap; in-flight work is checkpointed, never discarded.
- Add: plan allowances (included tokens/messages), overage rates, hard caps per task, email/Slack alerts at thresholds, and what happens at a cap (stop new work, queue, or request approval).

## Account and billing architecture (target)

```
Customer → tenant (workspace) → users & roles → employee entitlements → approved connectors
        → task usage → budget enforcement → reconciled billing ledger → invoice (payment provider)
```

Payment processing stays with a payment provider (e.g. Stripe); raw card data never enters this platform.

## Client readiness gate (from the master plan)

A client launch requires: a narrow supported use case, signed commercial terms, approved data handling, tested isolation (including RLS), a support owner, a recovery process, known unit economics from the pilot ledger, and an agreed quality standard. Price, margins, service levels and contract terms remain open decisions for Marco and the commercial owner.
