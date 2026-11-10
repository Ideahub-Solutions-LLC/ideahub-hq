# Local verification — 7 November 2026

Environment: macOS arm64, Node 24.19.0 (within the declared >=20.9 range), pinned pnpm 10.28.0. The system default is pnpm 11.25.0; installation was explicitly run with pnpm 10 and the supplied lockfile.

## Checks

| Check | Result |
| --- | --- |
| Locked dependency install | Passed with pnpm 10.28.0 |
| Baseline tests, before edits | 35 passed in 5 suites |
| Final tests | 46 passed in 6 suites |
| App TypeScript | Passed (`tsc --noEmit`) |
| Test TypeScript | Passed (`tsc --noEmit -p tsconfig.test.json`) |
| ESLint | Passed |
| Diff whitespace check | Passed |
| Migrations + fictional seed | Passed; the original demo was seeded through the real workflow pipeline |
| Auth migrations on existing demo | Passed |
| Empty pilot setup CLI | Passed on a disposable database; a second run refused to overwrite it |
| Production build | Passed with `next build --webpack` |
| Production server | `next start` served port 3001; `/api/health` returned `ok: true`, `db: ok`; login included recovery link and excluded demo hints |

The default `next build` (Turbopack) could not complete in this desktop sandbox: its PostCSS evaluation worker failed binding a local port with EPERM. This also occurred on the unmodified baseline and persisted with a permission escalation. Webpack built the same application successfully; no application build errors were reported. The default build script remains unchanged. A normal staging/CI environment should rerun the default build.

Dependency installation reported existing ESLint 10 peer-range warnings. Lint itself passed. Vitest reported an informational warning about a future Vite config-loader default; tests passed.

## Browser demo (local fictional database)

- Signed in as Sam (manager); opened Harper's profile and workspace.
- Ran meeting record → draft action list on the 3 November Ops Sync. It rendered six actions, one missing owner, one unverified owner, three missing dates, decisions, questions and source lines.
- Accepted the draft: the artifact became reviewed; the review produced **zero receipts** (also checked directly in the database).
- Proposed task creation from the reviewed artifact; this created a separate pending approval showing the exact payload.
- Approved & simulated. The receipt showed succeeded, Demo mode and reference `DEMO-BATCH-3B328660`. Reload kept the action Executed. Database inspection confirmed **one** receipt for this approval; nothing was delivered externally.
- Ran a fresh weekly summary: completed/in-progress/blocker/decision sections rendered with task/approval record links.
- Opened both Office scene and List views.
- As manager, direct navigation to `/admin` displayed the server-side permission error.
- Signed in as Jordan (admin); activated emergency stop and verified its banner; lifted it afterward. Database inspection confirmed the stop was off at completion.
- Inspected Admin → Members: recovery controls appeared for managers/members and were absent for owner/admin targets while signed in as an admin.
- Verified the signed-out login page hides demo credentials and links to the new recovery page. Inspected the recovery instructions and labeled inputs.

Recovery issuance/consumption, revoked-issuer permissions, password change, token expiry/supersession and session revocation were tested at the service layer. No password was changed through the browser, and no email recovery delivery was claimed.

Screenshots:

![Simulated receipt](verification/demo-receipt.jpg)

![Password recovery](verification/password-recovery.jpg)

## Scope and remaining work

All providers remained offline Demo, all connector effects remained simulated, and no real team identities or meeting records were supplied. Live API behavior, ten real recaps, real onboarding, known pricing and staging readiness remain unverified. Weekly summaries currently have no model-assisted mode. See `LOCAL_PILOT.md` for the local P0 changes and staging checklist.
