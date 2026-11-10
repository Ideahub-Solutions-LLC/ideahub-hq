# Navigable 3D office

## Scope

This is a local, reference-inspired 3D presentation layer over the existing authenticated office snapshot. It keeps employee profiles, workspaces, expertise development, tasks, approvals, sources and the existing illustrated/list alternatives. It does not migrate records, reset the database, activate staff or connect external tools.

- `/office`: navigable WebGL office.
- `/office?view=characters`: retained illustrated character floor.
- `/office?view=list`: motion-independent, text-first alternative.

The first slice is one cutaway floor with the current six department rooms and a shared lounge. It is not yet a multi-storey building, free-roaming first-person game, room editor or multiplayer presence system. Geometry is built locally from primitives; no external model, texture or image service is used. The supplied promotional image is a visual reference, not an imported scene or evidence that its advertised capabilities exist here.

## State and authority

Activity comes from the same workspace-scoped server service used by the other office views. Since 10 November, Juno's content workflow uses confirmed worker stages and fresh leases/heartbeats; other workflows retain recorded task states. See [JUNO_CONTENT_WORKFLOW.md](JUNO_CONTENT_WORKFLOW.md). The office-life preview is a local choreographed routine: stand, walk to the lounge, return, sit and work. It never enqueues a job, changes employee status, approves an action or sends a message. Pause and reduced-motion controls apply to travel and character motion.

The snapshot refresh remains read-only. Selecting a colleague opens the existing evidence spotlight and established workspace/development/profile links. Existing approval boundaries are unchanged.

## Implementation

- `src/lib/office/three-world.ts`: procedural rooms, furniture and distinct articulated characters.
- `src/components/office/office-three.tsx`: WebGL renderer, camera/room navigation, interaction and accessible alternatives.
- `src/components/office/office-three.module.css`: responsive presentation.
- `src/lib/office/choreography.ts`: shared immutable desk layout and deterministic preview routes.
- `src/components/office/office-scene.tsx`: counts, preview mode, selection spotlight and two-second read-only activity polling. Camera and selection survive updates.

Three.js is lazy-loaded only for the 3D view. The dependency and its types are recorded in the existing pnpm lockfile. WebGL failure must leave the other office views reachable.

## Verification

The integrated suite passes 169 tests across 16 files, both application and test TypeScript configurations, ESLint, whitespace checks and `next build --webpack`. New world tests cover distinct identities, fixed stations, posture/clock behavior, movement-derived facing and GPU disposal. Route tests cover clear paths, phase continuity, immutable source state and overflow rosters.

Chrome visual and functional checks confirmed:
- A real Three.js WebGL canvas containing six department rooms and seven characters, with rendered furniture, walls, floor, shadows and name labels.
- Room focus targets and zoom, the existing Operations department link, camera rotate/pan/zoom/reset controls, and camera preservation after status refresh.
- Juno's outbound travel, lounge destination at world (0,0), return trip and sitting at the original (-8.7,-3.8) desk anchor. Fixed furniture stays in place. The normal seven-person routine lasts 112 seconds.
- Pause, preview/recorded distinction, native colleague selection, spotlight keyboard focus and Close returning focus to the colleague button.
- The established employee workspace still contains its conversation, current task, draft workflows, artifacts, approvals and sources. No workflow was triggered by these checks.
- A 390 × 844 layout without document overflow; touch navigation is opt-in and returns to page scrolling when disabled. This was responsive-layout testing, not physical-device gesture certification.
- Dark and light themes. A temporary-size resize defect found during QA was fixed by retaining valid dimensions and refreshing the frustum on window/observed size changes; mobile-to-desktop recovery was rechecked.
- Both retained Characters and List routes. The final normal viewport and original dark theme were restored, and the 3D rehearsal was left open for review.

Reduced-motion and context-loss fallbacks are implemented and reviewed; OS preference changes and forced GPU context loss were not exercised in the browser. This is targeted UI QA, not a complete accessibility/performance audit. The current routes serialize roaming to one employee at a time and are not a general-purpose physics/navmesh system.

The local server is bound to loopback on port 3000 with provider keys blank and `JOB_WORKER_MODE=external`, without starting an external worker. This keeps visual review from processing background jobs. This work did not rewrite the environment file or employee records. Final read-only checks found the same seven employee statuses and six succeeded jobs. Configuration versions present in the database were retained rather than reset. No deployment, external send, model invocation, commit or push was performed.
