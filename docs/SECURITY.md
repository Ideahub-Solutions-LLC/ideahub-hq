# Security and privacy

**This is a single-tenant internal pilot. It has not been independently security-audited and must not be presented as production-ready or offered to clients before the open items below are closed.**

## What is enforced today

| Control | Implementation | Test |
| --- | --- | --- |
| Authentication | Email + password, scrypt (N=16384) hashes, constant-time compare; 30-day server-side sessions; only the SHA-256 of the cookie token is stored; cookies are `httpOnly`, `sameSite=lax`, `secure` in production | `tests/authz.test.ts` |
| Authorization | Role matrix in `src/lib/authz.ts`; every server action/page calls `requirePermission()`; UI hides controls but the server re-checks | `tests/authz.test.ts` |
| Workspace isolation | `workspace_id` on all tables; membership verified per request; services take `workspaceId` and scope every query | `tests/isolation.test.ts` |
| Approval binding | Approval stores exact payload + hash; decide/execute refuse on mismatch; approvals expire (72h) | `tests/approvals.test.ts` |
| Draft ≠ send | `review_draft` approvals never call a connector; follow-ups require a reviewed artifact and a brand-new approval | `tests/approvals.test.ts` |
| Least privilege for employees | Authority policy per employee (allowed action types, forbidden list) + per-connector grants; personality cannot change it; new employees can only request draft reviews | `tests/approvals.test.ts` |
| Duplicate action prevention | Unique idempotency key per approval and per receipt; reconcile-before-retry on unknown outcomes; usage events deduplicated by `event_key` | `tests/approvals.test.ts`, `tests/jobs.test.ts` |
| Stop controls | Workspace emergency stop (holds jobs, blocks replies and execution), employee pause/archive, grant revocation | `tests/approvals.test.ts`, `tests/jobs.test.ts` |
| Untrusted content | Knowledge/meeting content is wrapped as `<untrusted_data>`; extraction is deterministic by default; model drafts are re-validated against the source (owners must be roster members and literally present; excerpts must exist) | `tests/workflows.test.ts` |
| Execution limits | Job timeout (`JOB_TIMEOUT_MS`), bounded retries with backoff, concurrency cap, per-task/monthly budgets (when pricing exists), max output tokens | `tests/jobs.test.ts` |
| Audit | Append-only `audit_events` with secret-key redaction | — |
| Secrets | Only env vars; DB stores names; `.env*` git-ignored; nothing logged | — |

## Known limitations (must be addressed before any client workspace)

1. **No rate limiting or brute-force protection** on `/login`. Add a limiter (per IP + per email) and optional 2FA.
2. **No CSRF token** beyond Next.js Server Actions' built-in origin checks and `sameSite=lax` cookies. Review before exposing publicly.
3. **No encryption at rest** for the SQLite file; rely on disk encryption for the pilot. Postgres + managed encryption for production.
4. **Password reset / invitations / SSO** are not implemented. Admins create members with a one-time temporary password shown once.
5. **Prompt injection** is mitigated (data wrapping, server-side validation, no tool execution from model text) but a model can still produce misleading *draft text*. Human review of every draft remains the control.
6. **Cross-tenant retrieval** is enforced by `workspace_id` filters in code, not by database row-level security. Add Postgres RLS before multi-tenant use.
7. **File uploads** are not implemented (knowledge is pasted text). When added: virus scanning, size limits, storage isolation per workspace, and deletion propagation to derived chunks/embeddings.
8. **Deletion/retention policies** are not implemented. Define retention for messages, artifacts, audit logs and backups before client data is accepted.
9. **Budget enforcement in cost terms requires a pricing table.** Without `PROVIDER_PRICING_JSON`, caps are only enforced via max output tokens and job limits.
10. **Demo login hints** are shown on the sign-in page outside production (`SHOW_DEMO_LOGINS=1` forces them on). Remove seeded accounts before any real use.
11. **The optional `/api/jobs/run` trigger** is disabled unless `JOBS_TRIGGER_TOKEN` is set; rotate the token if used.
12. **No security headers / CSP** configured yet.

## Incident playbook (pilot)

1. Admin → Controls → **Activate emergency stop** (records reason, holds all jobs).
2. Pause the affected employee; revoke its connector grants (Integrations).
3. Review `audit_events`, the task's activity history and receipts; reconcile any `execution_unknown` approvals against the destination.
4. Fix the root cause, add a test, lift the stop.

## Privacy notes

- All seeded people, clients and meetings are fictional.
- Only approved knowledge an employee was explicitly granted is sent to a provider, plus the conversation history for that employee.
- Provider data terms must be reviewed before client data is used (see the master plan, section 8).
