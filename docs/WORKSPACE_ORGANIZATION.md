# Workspace organization

The HQ now groups daily work separately from employee configuration and monitoring. The benchmark was used to understand navigation, shared scopes and app discovery; its private data and branding were not copied.

## Navigation

- **Work:** Chat, Tasks, Calendar, Drive, CRM, Library, Mailbox.
- **Workforce:** AI employees, Skills & Knowledge, Tools & apps.
- **Monitor:** Approvals, 3D Office, Teams, Activity, Overview.
- **Setup:** HQ readiness and role-gated Administration.

The sidebar scrolls independently. Mobile navigation uses a native modal dialog with keyboard dismissal and focus containment. The header's **Jump to…** button (Command/Ctrl K) searches navigation labels; it is not a full-text search across private documents.

Team means an existing HQ department. Team and AI-employee selectors filter the workspace's records; they do **not** create private team access boundaries. All workspace members can read these shared records and mailbox drafts. Members can create records and edit/archive their own; managers, admins and owners can manage shared records. App setup remains owner/admin only. Full audit history retains its existing admin permission.

## What works locally

| Area | Working behavior | External boundary |
| --- | --- | --- |
| Chat | Links to each existing employee workspace and its configured provider | Providers may still be offline Demo |
| Tasks | Existing board/list, status filters, team/employee/search filters, validated ownership and optional due dates | Creating a manual task does not implement a new autonomous workflow |
| Drive | Folders, text documents, binary uploads, attachment downloads, search, scoped browsing, trash and restore | No cloud-drive synchronization; files do not automatically become knowledge |
| Calendar | Month/agenda, month navigation, display time zones, internal events, task due dates in month view | No invitation delivery or Google/Microsoft calendar sync |
| CRM | Companies, linked contacts, deal pipeline, exact cents and per-record currency, edit/archive/restore | No CRM sync or CRM agent tools |
| Library | Human content drafts and existing AI artifacts, with original review state and links to task review | No new AI generator, publication or scheduling |
| Mailbox | Shared local drafts, recorded email activity, explicit simulation status, archive/restore | No live inbox synchronization or draft send action |
| Tools & apps | Searchable, categorized 19-app catalog; guided setup; human owner; team/employee scope; requested permissions; optional existing MCP link; status and setup disable | Saving setup does not sign in, grant access, enable invocation or change native connector grants |
| Teams / Activity | Department directory, scoped area links, actual task events, admin-only audit summary | No invented employee activity |

### Files and reviewed knowledge

Uploads are limited to **5 MiB each**, with **100 MiB of uploaded bytes per workspace including trash**. The server enforces both limits. File bytes live in SQLite, so ordinary database backups now include uploads. Text documents have a separate 200,000-character bound. This is a local pilot storage design, not an object-store service or malware scanner.

Downloads require workspace membership and active records, use attachment disposition and `application/octet-stream`, disable caching and MIME sniffing, and include a sandbox CSP. Uploaded files cannot be overwritten through the text editor. No inline execution or preview of uploaded HTML is provided.

Managers can propose a UTF-8 text file (up to 50,000 characters) as a **pending knowledge source**. This copies a versioned snapshot; the same Drive record/version is deduplicated. Review it in Knowledge and grant employee access separately. Editing the Drive document does not silently replace an approved source. PDF extraction and other format parsing are not part of this change.

### App setup and actual access

App setup is an intent record with status `setup_required` or `disabled`. One app can have independent organization, team and employee setups. Saving an existing scope updates it; changing scope creates another setup and keeps the original.

- A native adapter shows its computed Demo/Planned/disconnected status. Existing settings and grants remain in **Native connector settings**.
- Linking an MCP endpoint exposes whether its discovered inventory is current. Discovery and assignments use the existing approval path; **employee invocation is still unavailable**.
- Other catalog apps show **Connection needed**. Their OAuth/account authorization, token storage, data synchronization and invocation adapters have not been implemented.
- Disabling a saved setup does not revoke separately managed native connector or MCP grants. The UI states this explicitly.
- No credential fields are added. Secrets remain in environment variables according to existing provider and MCP configuration.

This is a working HQ shell and local data layer, not parity with every benchmark integration. A real Microsoft connection needs its own adapter, account authorization and permission review, sync behavior, approval-gated writes, reconciliation and receipts.

## Data and migration

Migration `0005_workspace_organization.sql` adds:

- `work_records`: validated kind-specific JSON, shared scopes, parent folder links, creator, optimistic version, soft archive and timestamps.
- `drive_blobs`: exact uploaded bytes, workspace key and stored size.
- `app_installations`: app key, canonical scope, human owner, requested permissions, optional MCP endpoint, setup status and version.

Services validate referenced departments, employees, folders, companies and connection owners within the current workspace. Folder cycles and excessive nesting are rejected; folders with active children and companies with active references cannot be archived. Parent folders and linked companies must be restored before dependent records. Text records and mailbox drafts are escaped text in the UI.

For an existing installation, back up the database and apply migrations; do not reseed. The app also applies pending migrations on a fresh process's first database access. Use Node 22+ and the pinned pnpm 10.28.0.

## Verification

`tests/workspace-organization.test.ts` covers isolation, actor permissions, reference checks, stale record edits, folder cycles/depth, archive/restore, exact upload bytes, size/quota/filename bounds, pending knowledge snapshots, CRM validation, app setup isolation and permissions, lack of automatic grants/actions, and calendar dates/time zones. Existing workflow, approval, provider, MCP and 3D office tests remain part of the full suite.

Browser verification uses a separately copied fictional database, never the signed-in benchmark account. Results and remaining limitations are recorded in `LOCAL_VERIFICATION.md` after the implementation checks.

## Next development steps

1. Implement one real Microsoft account connection behind this catalog (Teams or Microsoft 365 read-only data first), using the existing approval and audit boundaries.
2. Add background synchronization, conflict/retry behavior and real connectivity diagnostics before marking an app connected.
3. Expose a narrow set of approved employee tools for native records and then MCP invocation. Native module records are currently human-managed; their presence does not automatically give employees new tools.
4. Move binary storage to an appropriate object store with scanning and retention controls before broader deployment.
5. Add attachment relationships, richer calendar interactions, CRM reporting and content scheduling as separate tested slices.
