# HQ configuration foundation — 10 November 2026

The HQ now has a configuration layer for profiles, model routing and MCP connections, independent of business workflows. Open **HQ readiness** in the main navigation (`/hq/setup`) and each employee's **Configuration desk** (`/employees/<id>/setup`). Existing identities, activation states, sources and model choices are preserved. No employee is automatically activated.

## Employee profiles

Identity/personality remains separate from authority, skills, knowledge and models. The new **Operating brief** tab defines mission, responsibilities, expected deliverables, escalation rules and quality criteria. Managers may save drafts; an owner/admin reviews the exact version and body hash. Editing invalidates the brief's review. Saving/reviewing increments employee configuration and writes an audit record.

Only a reviewed operating brief is included in employee chat instructions. It never grants tool access, replaces approved skills or overrides platform policy. Existing structured business workflows keep their existing prompt contracts; this slice does not retrofit the brief into every workflow. The current brief and its version are stored, with change/review hashes in audit history; full historical brief bodies are not an immutable version archive yet.

HQ readiness surfaces reviewer permissions, operating brief, requested model access, fallback access, budgets/pricing, approved skill versions, traceable knowledge, review policy and operating state. A completed checklist means configuration checks are satisfied, not that the model was quality-tested or the deployment security-audited. MCP assignments are shown separately because invocation is unavailable.

Department, manager, skill and knowledge assignments are checked against the workspace. Skill/source replacement is transactional and deduplicates selections, so invalid cross-workspace input cannot delete valid assignments.

## Models and provider access

**Admin → Model providers → Refresh model access** reads the provider's Models API using the server credential. It stores model IDs, a check timestamp and a credential fingerprint, never the key or raw provider response. No employee content is sent and no generation request is made. Failed or incomplete catalogs are not verified; access evidence expires after 24 hours or credential rotation. Select exact IDs from the fetched catalog rather than assuming an alias is available.

The employee's **Model & budget** tab supports primary/fallback model IDs, explicit fallback pairing, spending limits, an OpenAI API mode (existing Chat Completions or Responses) and temperature omission for models that do not accept that parameter. Settings apply to that employee's provider routing, including OpenAI fallback. Responses requests disable storage and do not expose tools to the model. Existing model selections are not upgraded automatically. API keys remain server-managed `OPENAI_API_KEY` / `ANTHROPIC_API_KEY`; per-employee keys and a secrets-management UI are not implemented.

Credential presence, model listing, API parameter compatibility and output quality are separate facts. The Models API verifies listing/access only. Live generation, reasoning settings, structured-output compatibility and suitability for each role still need qualification. Role scope and source requirements should drive the choice; no model is labeled universally best for an employee.

Current fallback routing selects an approved alternative when the primary credential is absent. It does not automatically retry a failed runtime API call on another provider. If no allowed live provider has credentials, the existing visibly labeled Offline Demo route remains. Live model access remains unverified in the current local environment because no real keys were supplied.

Pricing must be configured using `PROVIDER_PRICING_JSON`, with explicit budgets. Content generation already uses conservative cost reservations; older chat paths do not reserve concurrent spending and do not uniformly fail closed without pricing. These remaining controls are a live-use gate, not solved by an access check.

## MCP connection setup

Open **Integrations → MCP connections** (owner/admin). This is a separate registry from the existing Demo/Planned business adapters.

1. Run or select a trusted **Streamable HTTP** MCP endpoint. Register its name, accountable workspace owner, endpoint and optional credential variable name. The URL must be HTTPS; HTTP is permitted only on loopback for development. Embedded credentials, query strings and fragments are rejected.
2. The server operator explicitly adds its exact origin to `MCP_ALLOWED_ORIGINS` in the environment, then restarts. Empty denies all endpoints. Use only trusted origins and deployment egress controls; an allowlist is not a complete hostile-network/SSRF audit.
3. For bearer authentication, store a dedicated credential in `MCP_<NAME>_TOKEN` on the server and reference only that variable name in the registry. Provider API key variables cannot be repurposed here. Anonymous endpoints are supported when intentionally configured without a credential reference.
4. Enable the connection and **Request discovery approval**. The existing approval engine binds the exact endpoint, server version and metadata operation. Only a current connection administrator can approve and execute it. Workspace emergency stop blocks execution.
5. **Approve & discover tools** runs initialization and paginated `tools/list` through the official MCP SDK. JSON and SSE responses are supported. A receipt records the actual metadata check. No `tools/call`, resource reading, sampling, prompts or business action is exposed by this client.
6. Review each tool's description and input schema. Treat `readOnlyHint` as advisory. Choose an employee and a human-reviewed read/approval-required policy, then save the assignment. The assignment pins the exact tool definition hash and connection version. Changes revoke stale assignments; inventory expires after 24 hours. Disabling/editing a connection invalidates discovery and assignments.

The client rejects redirects and alternate endpoints, has request/overall deadlines, limits response/inventory size and pagination, and discards results after access/configuration/stop changes or a newer discovery. Error receipts contain a generic result, not raw provider data or credentials. Failed metadata checks require a new approved discovery; the same approval is not automatically replayed.

**Current boundary:** real metadata discovery and reviewed assignments are implemented; employee MCP tool invocation is not. A grant is a reviewed configuration record, not a working tool runtime. OAuth onboarding/token refresh, stdio subprocess management, connection-specific execution adapters, tool argument validation and governed invocation/reconciliation remain future development. Do not label an external service connected for business execution just because its tool list was discovered. Registering a connector in Codex/ChatGPT also does not install it into this HQ application.

## Migration and verification

Migration `0004_hq_configuration.sql` adds `employee_briefs`, `provider_catalogs`, `mcp_servers` and `mcp_tool_grants`. Apply migrations to each environment; do not reset/reseed an existing database. The main fictional database was backed up and migrated without changing existing employee settings. UI mutations were tested on a separate copy labeled **IdeaHub HQ · Configuration QA**.

The integrated suite passes **203 tests across 19 files**, both application/test TypeScript checks, ESLint, whitespace checks and `next build --webpack`. Twenty new tests cover reviewed briefs and hash/version checks, workspace references, model settings, provider access/rotation/errors/pagination, Responses request/response parsing, MCP approvals/current roles, changed configuration, late/superseded discovery, tool definition pins and revocation. Four of these use a real loopback HTTP fixture to verify SDK initialization, JSON/SSE pagination, bearer handling, redirect rejection and origin denial. No external provider or business tool was called.

Browser QA as fictional admin Jordan covered brief save/review, model mode/temperature save, missing-key provider checks, MCP registration, exact-payload approval, real loopback discovery and receipt, assignment and the employee configuration summary. Profile/configuration, provider and MCP pages fit a 390 × 844 viewport without document overflow. The normal viewport was restored. This is targeted UI/transport QA, not a production security or accessibility audit.

Screenshots are in `docs/verification/hq-configuration-desk.png`, `hq-mcp-inventory.png` and `hq-readiness.png`. No deployment or push was performed for this configuration slice.

## Official references

- [OpenAI Models API](https://developers.openai.com/api/reference/resources/models/methods/list)
- [OpenAI Responses and structured output](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses)
- [Anthropic Models API](https://platform.claude.com/docs/en/api/models/list)
- [MCP Streamable HTTP transport](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)
- [Official MCP TypeScript client](https://ts.sdk.modelcontextprotocol.io/client)

## Remaining HQ foundation work

Qualify live provider settings and role/model fit with approved data; complete concurrency-safe spending controls for older chat paths; add OAuth/credential lifecycle management and governed tool invocation; improve onboarding from fictional to real team identities; add deployment/backup/session controls and CI browser coverage. New business workflows and recurring jobs are deliberately outside this slice.
