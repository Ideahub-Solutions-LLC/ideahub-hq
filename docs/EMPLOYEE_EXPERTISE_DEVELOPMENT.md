# Department expertise development — 9 November 2026

## Direction and scope

Continues the existing ZIP-based application, preserving the previous local P0 and master-plan work. The current priority is developing each AI employee by department, rather than immediately running the ten-recap pilot. The existing HQ, two executable workflows, employee identities, statuses, authority and source grants are retained.

Open **Employees → Develop expertise**, or `/employees/development`. Each employee profile and department page also links to its development plan.

## Seven role packs

The scope comes from the employee role/bio and department purpose in `src/db/seed.ts`, checked against the local employee records. Detailed procedures and practice rubrics are newly proposed curriculum, not documented company SOP or evidence of proficiency.

| Employee / department | Proposed skill modules |
| --- | --- |
| Harper / Operations | Meeting evidence and action drafting; weekly reporting and decision queue |
| Maren / Operations | Cited procedural answers; knowledge coverage and freshness review |
| Theo / Sales | Approved lead research and fit brief; evidence-led outreach drafting |
| Juno / Marketing | Brand-grounded content outlining; editorial and claim review |
| Cyrus / Creative | Brief-to-shot planning; asset checklist and handoff readiness |
| Rowan / Development | Delivery status and blocker analysis; development handoff preparation |
| Ellis / Client Support | Known-issue response drafting; sensitive-case triage and escalation |

Each pack contains competencies, boundaries, two modules, source prerequisites, expected output structures, numbered instructions and four fictional practice scenarios with review criteria. There are 14 modules and 28 scenarios in total. Rowan remains a delivery coordinator, not an automatically enabled coding agent. Juno's curriculum blocks brand-specific work without approved current brand guidance; Juno remains paused.

Matching requires the normalized exact role title and exact department slug. Employee names are not used as identity keys. Renamed or custom roles with no match display an explicit gap instead of silently inheriting another specialty.

## What preparing a pack does

An owner, admin or manager can choose **Prepare 2 skill drafts** on an employee's development page. The server verifies actual workspace membership and both employee-edit and skill-edit permissions.

In one transaction the service:

1. Creates employee-specific skills and initial versions with draft/pending status.
2. Sets `workflowKey` to null, no required tools, and required draft review.
3. Adds missing skill assignments while preserving all existing ones.
4. Records pack/module provenance and each mutation in the audit history.
5. Increments employee configuration once when assignments change.

Repeat preparation preserves existing instructions, versions and reviews, and adds no duplicate skills. Reserved-slug conflicts fail without partial writes. Archived employees cannot prepare packs; draft and paused employees can prepare without activation. Human-edited records are identified by creation audit provenance, not merely by their name or slug.

The original local database was not changed to install or approve these packs. The new curriculum is immediately visible; preparing saved skill drafts is an explicit per-employee action. QA draft creation was performed only on an isolated demo database copy.

## Approval and runtime behavior

Only skills whose current version and parent skill are both approved can influence employee conversations. Assignments, employees, skills and versions are joined within the current workspace. Draft, pending, retired and cross-workspace instructions are excluded. Changing a skill to a new pending version makes the skill unavailable until that current version is approved; the interface now states this accurately.

An owner/admin approves skills through the existing skill-review page. Approval is permission to use instructions, not proof that an employee performs the specialty well. The employee must separately be active before it can work. No source approval, connector grant, external send, model-provider enablement or employee activation is bundled into preparation.

Conversation retrieval now supplies actual source ID, version, paragraph number and recorded verification time. Truncated excerpts are identified. The system prompt explicitly says it receives selected excerpts, not complete documents or a full inventory. This improves traceability but does not automatically validate model answers or establish source completeness/freshness.

## What is not implemented or claimed

- No model fine-tuning, training completion, certification or autonomous expertise.
- No live-model evaluation was performed. All providers were forced to offline Demo for testing.
- The 28 practice cases are written review exercises, not stored evaluation runs or passed results. A future evaluation runner should persist input snapshots, actual outputs, reviewer decisions and revision history.
- New modules are instruction-only. The only implemented draft workflows remain meeting action extraction and weekly task summaries.
- Required-source checklists are not automatically matched or satisfied. Knowledge owners must curate current approved evidence and explicitly grant employee access. Some curricula require inventories or task evidence not automatically supplied to chat; employees must ask for missing inputs.
- Existing Demo responses do not execute these sophisticated instructions as a live model would. Live provider evaluation requires separately configured and authorized API usage.
- No external communications, production deployment, repository push, credentials or new persistent service setup.

## Verification

On the final feature code: 123 tests across 11 files pass; app and test TypeScript checks pass; ESLint and whitespace checks pass; `next build --webpack` passes. Existing tests cover the previous master-plan safeguards; new tests cover all seven pack preparations, exact matching, authorization, workspace isolation, idempotency, human-edit preservation, rollback, archived rejection, draft/paused preservation, real chat prompt approval gating and citation metadata.

Browser QA uses Chrome's Emmanuel (marketingmediacloud.com) profile and an isolated SQLite copy at port 3001. Verified:

- Directory entry point, all seven role plans and department filtering (Operations shows Harper and Maren only).
- Maren's proposed instructions and practice criteria expand/collapse.
- Preparing two pending skill drafts adds two saved links and disables repeat submission; refresh preserves them and Maren remains Draft.
- A manager can view/edit the skill but sees no approve control.
- Navigation back from saved skill to development plan works.
- Juno remains Paused and shows the current-approved-brand-guide prerequisite.
- Overview and detail fit a 390 × 844 viewport without horizontal overflow; mobile navigation opens/closes without leaving the page.

This is targeted browser QA, not a full accessibility audit or end-to-end automation suite. No employee's real-world performance is claimed.

## Local runtime and next slice

The local app remains at `http://localhost:3000`, with the development overview at `/employees/development`. It is a local process, not a permanent system service. Future source edits require rebuilding/restarting this production-mode preview or using the normal development server.

The next useful slice is to choose the first department's approved SOP/source set and add a persistent supervised evaluation loop. Start with a narrowly scoped output for that role, capture evidence, compare the actual response against the pack's rubric, and revise the instruction version. Broaden role coverage after results justify it, without bypassing source or action approval.
