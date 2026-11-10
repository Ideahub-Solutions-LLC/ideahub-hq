# Juno content workflow and live office — 10 November 2026

## What is available

Open **Office → Juno → Assign content brief**, or **Employees → Juno → Open workspace → Assign content brief**. This slice implements `content_draft`: brief → approved-source reading → outline and copy → claim citation checks → human review. Teams and publishing remain future work.

The form collects the deliverable, audience, intended channel, objective, call to action, a selected brand guide and supporting approved sources. It queues a durable job and opens Juno's office spotlight. A submission key prevents a repeated form from creating duplicate work. Source text, versions, references and hashes are captured with the employee configuration and approved skill version.

The saved artifact includes headline options, an outline, copy, a claim/evidence checklist, review notes and expandable source snapshots. The reviewer can accept, reject or request changes. Requesting changes blocks the task with the note; **Generate revision** queues a fresh draft and a new review. Old artifacts are retained as superseded, and prior decision notes remain recorded. Accepting completes the internal content task and creates no delivery job or connector receipt. There is no content publishing action in this slice.

## Readiness and setup

Existing employee settings and source approvals are preserved. The form displays unmet requirements and disables submission until they are satisfied. For Juno to run:

1. Keep her Marketing Content Assistant role in Marketing. Assign a workspace manager, admin or owner as the accountable reviewer; the fictional member Riley does not have review permission.
2. In **Develop expertise**, prepare the marketing skill pack. Its new Brand Outline skill is bound to `content_draft`. Review and approve the current skill version, then retain its assignment. Existing skills are not silently rewritten or approved.
3. Add a brand guide and factual source material through **Skills & Knowledge**. Each source needs nonempty content, a source reference, a verification date, human approval and an access grant to Juno. Select the brand guide explicitly in each brief.
4. Review her configuration before setting her active. Required draft review and `review_draft` authority must remain enabled. Emergency stop blocks work.
5. Use inline worker mode for the local pilot, or start `pnpm worker` with `JOB_WORKER_MODE=external`.

With no configured API credentials, the real job/review pipeline uses a clearly labeled **Offline Demo** implementation. It assembles deterministic text from the brief and exact source excerpts; it does not demonstrate live AI writing or intelligent revision quality. No artificial delay makes the office appear busy. A live configured provider requires valid `PROVIDER_PRICING_JSON` and enough budget for the reserved call; content generation fails closed without pricing. Provider adapters and live content quality still require qualification against approved real briefs.

## Office behavior

| Confirmed state | Office status and motion |
| --- | --- |
| Queued | Waiting; no claim that execution started |
| Validating / reading sources | Reviewing motion while a current worker lease and heartbeat are fresh |
| Drafting | Typing motion while the run is confirmed live |
| Checking citations | Reviewing motion |
| Draft ready | Awaiting review; productive motion stops; **Review request** opens the exact saved artifact |
| Changes requested / failed | Blocked; open the task to resolve the note and generate a revision |
| Accepted | Content draft reviewed; nothing published or sent |
| Stale worker / failed office connection | Execution unconfirmed; productive motion stops |
| Employee paused / workspace emergency stop | Paused / stopped takes precedence |

Both animated office views fetch the authenticated, workspace-scoped `/api/office/activity` endpoint every two seconds while visible. Worker heartbeats renew every five seconds; a lease or heartbeat older than thirty seconds is stale. Requests time out after eight seconds. Camera position and selected colleague remain in the client while statuses update. Pause updates stops confirmed-live work motion. Selecting Juno exposes the task, next action, source/review destinations and brief assignment; camera and department controls remain interactive. The List view is a labeled snapshot that refreshes on reload.

The office-life walking routine is still an explicitly labeled visual preview. Content work does not fabricate colleague conversations, messages, Teams presence or autonomous handoffs. Older meeting/weekly workflows still show recorded task status; only the new content execution path has the heartbeat and late-result guarantees described here.

## Execution and review safeguards

The worker checks active status, authority, reviewer, current approved skill, granted sources and emergency stop before work and again before committing a draft. Acceptance repeats the evidence checks. Content reviews are bound to the exact artifact ID, version and content hash, and can be decided only by the assigned reviewer or a workspace owner/admin with review permission. Manual completion and generic outbound follow-ups are disabled for content tasks.

Timeouts abort the provider request. Job completion/failure is fenced to the owning worker attempt; content checkpoints and commits reject cancelled or expired leases. A revision revokes prior queued/running jobs before creating a new job, so an older provider result cannot overwrite it. Duplicate jobs cannot block the run that owns the task. Content jobs do not retry automatically after uncertain results. Failed/unknown live calls keep their conservative cost reservation; reconcile provider usage before releasing it directly in a controlled maintenance process. No reservation-reconciliation UI is included yet.

Automated claim checks verify that an exact quoted excerpt exists in its captured source. They do not prove the claim follows from the quote or that the model listed every factual claim. Unsupported quotes block acceptance; meaning, missing citations, suitability and brand voice remain human review duties.

Migration `0003_content_workflow_runs.sql` adds `workflow_runs` for stages, lease association, heartbeat, finish/error and cost reservations. Apply migrations when moving code to another environment; do not reset an existing database.

## Verification

See [JUNO_CONTENT_VERIFICATION.md](JUNO_CONTENT_VERIFICATION.md) for the automated checks, isolated fictional browser flow and remaining live-provider limits.
