# Master plan continuation — 9 November 2026

## Canonical local application

Continue `ideahub-ai-team/`, imported from `ideahub-ai-team_3.zip` on 7 November. Baseline: v0.1.0, commit `b4acb13`, plus the preserved local P0 authentication/onboarding edits. Do not re-extract the ZIP over this working tree. The enclosing workspace has a separate empty Git repository; application history lives here.

The separate IdeaHub HQ project remains reference material. The existing isometric office and accessible list in this app are preserved, not replaced. This continuation does not claim a WebGL 3D upgrade.

## Implemented in this slice

- Dashboard pilot section: one marked Operations Coordinator, accountable manager, active status, two approved current skill versions, accessible approved meeting source with traceability, review policy, emergency-stop state, and links to task evidence and HQ/list views.
- Checks are read-only diagnostics, not permission, readiness certification or proof that real pilot inputs are authorized. Multiple marked pilot employees are not silently resolved. The fictional demo remains fictional.
- Workflow evidence counts distinguish awaiting-review and reviewed drafts from external completion.
- Dashboard totals count all workspace records rather than only the preview-list limits. Corrected the emergency-stop banner's broken Admin link.
- Meeting grounding uses whole cleaned source lines. Owners and dates must be supported by that same evidence, not elsewhere in the meeting. Nonliteral action wording and unsupported decisions/questions remain visible with review flags. Literal wording matches do not prove meaning.
- New meeting artifacts retain source text, version, SHA-256, source reference, verification date and employee configuration at generation. The UI exposes this snapshot for review.
- Source approval, access and unchanged content are checked after a model call, before a follow-up proposal, and before a new connector execution/retry. Completed receipts remain idempotent and unknown outcomes still reconcile before any retry.
- Existing meeting drafts remain readable. Legacy drafts without provenance must be regenerated and reviewed before a new follow-up. Full internal source snapshots are excluded from proposed outgoing messages.

No migration or dependency change is introduced by this slice. No credentials, real member identities, source grants or connector modes were changed. No production publish, remote push or live connector/model calls were performed.

## Next master-plan gates

1. Confirm the real pilot manager, Operations Coordinator identity and approved source set. Use the separate clean pilot setup rather than converting fictional records into real people.
2. Evaluate ten authorized meeting records, including ambiguous people, relative dates, contradictory decisions and embedded instructions. Record quality and human review time. Lexical grounding is deliberately conservative; it is not semantic proof.
3. Evolve the executive brief from current platform task records into versioned approved tracker snapshots plus meeting decisions. Separate accepted drafts from accepted real-world outcomes and define period/time-zone semantics.
4. Complete current-authority/skill/budget checks, usage pricing, audit retention, source-deletion propagation, production authentication and independent tenant-security review before enabling live model or connector routes.
5. Add read-only calendar/CQL context first. Any later email, SMS, task creation or bounded phone service needs explicit scope, exact-payload approvals, tested receipts and its own acceptance gate.

## Preservation and rollback

All pre-existing P0 changes are retained uncommitted. No commit or push was made. To roll back this slice, review its named source/test files and remove only these additions; do not reset the full working tree because it includes earlier P0 work. Existing source snapshots are artifact JSON and remain backward compatible with the previous database schema.

Verification results are recorded in `MASTER_PLAN_VERIFICATION.md`.
