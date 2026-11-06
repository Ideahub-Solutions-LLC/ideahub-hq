# Integrations and communication

## Framework

`src/lib/connectors/index.ts` defines `ConnectorAdapter`:

```ts
interface ConnectorAdapter {
  key; name;
  implementedModes: ("demo" | "live")[];   // which modes have code behind them
  supportedActions: ActionType[];          // e.g. send_message, create_external_tasks
  credentialEnvVars: string[];             // names only; read on the server
  execute(input, mode): Promise<ExecuteResult>;      // called ONLY from executeApproval()
  reconcile(idempotencyKey, mode): Promise<"done" | "not_found" | "unknown">;
}
```

Rules enforced by `src/lib/services/approvals.ts` (and covered by tests):

- An employee can only *propose* actions listed in its authority policy, only on connectors it has an **active grant** for, and only when the connector's **effective mode** is Demo or Live.
- Execution happens only for an **approved** approval whose stored payload still matches its hash, while the workspace is not in emergency stop, the employee is active and the grant is still active.
- One receipt per idempotency key. Re-executing returns the existing receipt. Unknown outcomes are reconciled with the destination before any retry.
- `send_message` executions write a `communication_events` row: `simulated` for Demo, `sent` only for Live.

The **effective mode** is computed server-side (`effectiveConnectorMode`): a connector set to "live" by an admin shows **Disconnected** until a live adapter exists *and* its credentials are present. The UI can never show Live for a simulation.

## Status of each connection (this version)

| Connector | Key | Effective mode | Supported actions | Env vars reserved | What exists |
| --- | --- | --- | --- | --- | --- |
| Slack | `slack` | **Demo** | send_message | `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET` | Demo adapter records a simulated post with a `DEMO-SLACK-…` ref. No Slack API call. |
| Task system (external) | `task_system` | **Demo** | create_external_tasks, update_external_record | — | Demo adapter returns `DEMO-TASK-…` ids. Stand-in for ClickUp/Asana/GHL tasks. |
| Email | `email` | **Disconnected** | send_message | `SMTP_URL` | No SMTP configured; Demo adapter exists if switched to demo mode. |
| Microsoft Teams | `teams` | **Planned** | send_message | `MS_TEAMS_APP_ID`, `MS_TEAMS_APP_SECRET` | No adapter. |
| Zoom | `zoom` | **Planned** | access_service (read recaps/transcripts) | `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET` | No adapter. |
| CQL / GoHighLevel | `ghl` | **Planned** | update_external_record, send_message | `GHL_API_KEY`, `GHL_LOCATION_ID` | No adapter. |

**No message, task, account or record is created outside this platform by this version.** Nothing has been sent during development.

## Exact steps to make a connector live (example: Slack)

1. **Authorization.** A named human owner approves the integration scope (e.g. post to one channel). Record it on the connector (owner, scopes) in *Integrations*.
2. **Credentials.** Create a Slack app with a bot token limited to `chat:write` in a sandbox workspace. Put `SLACK_BOT_TOKEN` / `SLACK_SIGNING_SECRET` in the server secret store (env). Never in the DB or repo.
3. **Adapter.** In `src/lib/connectors/index.ts`, add `"live"` to `slack.implementedModes` and implement `execute` for `mode === "live"` using `chat.postMessage` with the idempotency key as `client_msg_id`/metadata; implement `reconcile` by searching recent channel history for that key. Return `simulated: false`.
4. **Tests.** Add a test that a live execute without credentials throws, that a timeout leaves `receipt.status = "unknown"`, and that reconcile finds the message by key.
5. **Switch.** Set the connector mode to Live in *Integrations* → the effective mode becomes Live only when credentials are present.
6. **Pilot.** Grant the employee access to one channel only; review `communication_events` and audit entries after the first week.

The same pattern applies to email (SMTP with `Message-ID` as the idempotency key), Teams (Graph API), Zoom (read-only recap retrieval into `knowledge_sources` of type `meeting_record`, pending review) and GHL (contact/pipeline updates with field validation and client isolation).

## Inbound messages (future)

The schema already separates `direction` (inbound/outbound/internal) and `status`. Inbound webhooks should create `communication_events(direction='inbound', status='received')` and, if an employee is assigned, a `messages` row + `employee.reply` job. Replies to external parties must go through `send_message` approvals. Internal comments stay on tasks (`task_events.kind='comment'`) and never appear in communication history.

## Dependencies and external services used by this repo

| Name | Kind | Used for | Real / mock |
| --- | --- | --- | --- |
| next, react, react-dom | npm | app framework | real |
| drizzle-orm, drizzle-kit, better-sqlite3 | npm | ORM, migrations, SQLite driver | real |
| zod | npm | validation | real |
| lucide-react | npm | icons | real |
| @fontsource-variable/inter | npm | self-hosted font | real |
| tailwindcss, @tailwindcss/postcss | npm | styling | real |
| vitest, tsx, typescript, eslint, eslint-config-next | npm (dev) | tests, scripts, types, lint | real |
| Anthropic Messages API | HTTPS | employee replies / optional extraction | real **only** when `ANTHROPIC_API_KEY` is set |
| OpenAI Chat Completions | HTTPS | fallback / alternative provider | real **only** when `OPENAI_API_KEY` is set |
| Demo provider | in-repo | deterministic offline replies | mock (labeled) |
| Slack / Email / Task system | in-repo | simulated execution | mock (labeled) |
| Teams / Zoom / GHL | — | planned | not implemented |
