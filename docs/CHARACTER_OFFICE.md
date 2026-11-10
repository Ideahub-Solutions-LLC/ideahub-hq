# Character office — 9 November 2026

## User-facing behavior

Open `/office?view=characters` for the illustrated character office, or `/office?view=list` for the accessible text alternative. The same persisted employee/task/approval data powers both views. Existing department, profile, workspace and expertise-development destinations remain linked.

Each employee has an original, role-based SVG AI companion. A fixed desk and chair are rendered independently from the employee body. The seven existing roles have distinct props and silhouettes: Operations clipboard, Knowledge book and glasses, Sales headset, Marketing headphones and phone, Creative beret and brush, Delivery glasses/laptop, and Support headset and heart mug. Colors use the application's light/dark tokens. This is an illustrated 2.5D office, not a WebGL scene or a model video feed.

Select a character to open an activity spotlight, with employee state, the relevant recorded task, update time, next step, approval link where applicable, and links to their workspace and development plan. Close returns focus to the selected character. Departments still open their existing pages. Empty departments and employees without a valid department remain represented.

## Truthful state and animation

Status precedence is: workspace emergency stop, employee paused/draft status, task working, task blocked/failed, human review, task queued, task paused, idle. Archived employees are excluded. Task choice is deterministic by last update and ID. Human-owned department tasks contribute to department counts but never make an AI employee appear to work. All reads are workspace-scoped, including manager membership and linked approval/task checks.

- **Content task working (10 November):** reviewing/typing follows a fresh worker lease, heartbeat and persisted content stage. Stale work stops productive motion. See [JUNO_CONTENT_WORKFLOW.md](JUNO_CONTENT_WORKFLOW.md).
- **Other tasks marked working:** typing follows a persisted task status, not a verified live worker heartbeat or model execution stream.
- **Task queued / no active task:** decorative waiting motion, not productive work.
- **Awaiting review / blocked / draft / paused / stop:** no work motion in recorded-state mode.
- **Preview office life:** explicitly labeled animation-only rehearsal. It rehearses standing, walking along a clear aisle to the lounge, returning, sitting and working without starting tasks, activating employees, approving anything or changing the database. Existing configuration remains visible in the spotlight and list.

The visual routine gives each colleague a 16-second slot; the seven-person cast completes a 112-second cycle. Only one colleague roams at a time, and others stay at fixed desks. Next colleague and Restart routine controls move within the rehearsal. Hover, keyboard focus or selection pauses travel to keep targets usable. A horizontally scrollable floor is contained within smaller screens.

Preview is off by default. **Pause motion** stops all character animation; the operating-system reduced-motion preference also disables it. Native buttons and links support keyboard interaction. The list provides text activity, task and approval destinations without relying on motion or color.

While the character page is visible, read-only `/api/office/activity` polling updates the snapshot every two seconds. **Pause updates** stops automatic polling and confirmed-live work motion; **Refresh status** can still request one update. Connection failures stop confirmed-live motion. No automation or OS service is installed. The list is a point-in-time snapshot and explicitly asks the user to reload for updates. Snapshot and task timestamps are shown in UTC.

## Implementation

- `src/lib/office/types.ts`: serializable presentation contracts.
- `src/lib/services/office.ts`: read-only scoped snapshots and activity precedence.
- `src/components/office/office-character.tsx` and its CSS module: deterministic role-specific companions and opt-in motion.
- `src/components/office/office-scene.tsx` and its CSS module: shared selection, preview/motion/update controls and spotlight.
- `src/components/office/office-floor.tsx` and its CSS module: illustrated floor, independent moving bodies and fixed furniture.
- `src/lib/office/choreography.ts`: pure layout, deterministic rehearsal phases and clear routes.
- `src/components/office/office-actor.module.css`: walking limbs, seated poses and transitions.
- `src/app/(app)/office/page.tsx`: authenticated scene/list routing.
- `tests/office.test.ts`, `tests/office-character.test.ts`: state/isolation and character rendering/animation contract checks.

No database schema, seed, employee status, authority, source access, model configuration or connector behavior was changed. Earlier local P0, source-evidence and department-expertise work is preserved. No external sends, production deploys or repository pushes.

## Verification

The initial character-office checks passed: 148 tests across 13 files, both application/test TypeScript configurations, ESLint, `git diff --check`, and `next build --webpack`. The final local server returns healthy database and inline-worker status.

Initial browser QA in Chrome's marketingmediacloud.com profile verified all seven distinct characters, correct paused/draft/review states, and the underlying task/approval links. Preview produced role-specific typing/reviewing CSS animations; Pause motion changed every character to `none` and left zero animated character descendants. Keyboard Enter opened Harper's spotlight, focused the evidence panel, and Close returned focus to the original character. Selection survived manual status refresh. Pause/resume updates controls worked; timed snapshot refresh was observed. Character/list navigation and browser Back/Forward worked. Scene and spotlight fit 390 × 844 without horizontal overflow. Light and dark themes were visually checked, then the original system theme and normal viewport were restored. No browser console errors were reported.

Reduced-motion gating is covered by code/static tests; the operating-system preference was not changed for this task. This is targeted UI QA, not a full accessibility audit, live-provider test or worker heartbeat validation.


The roaming extension passed 165 tests across 15 files, both TypeScript checks, ESLint, whitespace checks and a webpack build. Browser checks observed independent walking limbs, empty fixed desks during a lounge visit, seated work, zero animated actor descendants when paused, preserved selection and workspace navigation, and contained horizontal floor scrolling at 390 × 844. Pure route tests cover every phase boundary, all seven colleagues, overflow layouts, duplicate/archived staff and minimum seated-colleague clearance. No real workflow was started for animation testing.

The newer reference-inspired WebGL view is documented separately in [THREE_DIMENSIONAL_OFFICE.md](THREE_DIMENSIONAL_OFFICE.md). The illustrated floor remains available rather than being replaced.
