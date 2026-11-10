# Local P0 continuation — 7 November 2026

## What changed

- Login attempts are persisted in SQLite: five per normalized email and thirty per client address in a fixed 15-minute window. Every credential attempt consumes capacity, including successful attempts and nonexistent accounts. Restarting the app does not reset the counters. Expired buckets are deleted on the next attempt; identifiers are hashed.
- Address headers are ignored by default, so requests share an address bucket. Set `AUTH_CLIENT_IP_HEADER` only when a trusted reverse proxy **overwrites** that header with a single IP address and direct app access is blocked. Comma-separated forwarded chains are rejected. This limits application attempts; it does not replace proxy-level DoS protection or 2FA.
- Admin-assisted password recovery is available in **Admin → Members**. An owner may issue recovery codes for this workspace's accounts; admins may recover manager/member accounts only. Multi-workspace accounts require a separate verified recovery process. Verify the person's identity out of band before issuing or sharing a code.
- Codes contain 32 random bytes, expire in 30 minutes, are stored only as hashes, and are returned directly to the authorized admin UI (never in query strings or audit payloads). Issuing another invalidates the previous code. Issuer permissions and target membership/role are rechecked when the code is used. Enter it at `/login/reset`; a successful reset consumes the code and revokes all sessions. New passwords must be 12–128 characters. Reset attempts are also throttled. No recovery email is sent. Keep another owner available for recovery; a sole locked-out owner needs an operator-led process.
- New-member temporary passwords are returned only in the authorized form state, never in redirect/query strings. Existing accounts keep their credentials and receive no misleading temporary password.
- Demo account hints now require `SHOW_DEMO_LOGINS=1`; they are hidden by default in every environment.
- `pnpm pilot:setup` creates a clean workspace and owner without fictional records. It refuses any database containing a user or workspace. Existing demo data is left intact.
- Database/worker CLI commands now load `.env.local` using Next's environment loader. Previously a customized `DATABASE_URL` or `SEED_DEMO_PASSWORD` in that file was ignored by these scripts.
- Meeting extraction no longer assigns an ambiguous first name, alias or initial to the first matching roster entry. It requires a unique match, otherwise retaining an unverified owner flag.

## Use a clean pilot database

Keep the demonstration database for testing. For a real pilot, configure a **different** `DATABASE_URL` in `.env.local`, set a random `SESSION_SECRET`, and keep `SHOW_DEMO_LOGINS=0`.

Set `PILOT_OWNER_EMAIL`, `PILOT_OWNER_NAME`, and `PILOT_OWNER_PASSWORD` in the local environment file (use a new password with 12–128 characters). Run:

```sh
pnpm pilot:setup
```

Remove `PILOT_OWNER_PASSWORD` afterward. Sign in as the owner, add your actual team via Admin → Members, and configure approved skills, knowledge and employee records. This command creates only the owner and workspace: it does not pretend that empty configuration is a ready Operations Coordinator. Do not run `db:setup` for real pilot onboarding; it creates fictional sample data. Do not reuse demo passwords or copy the demonstration database into staging.

## First source: pasted meeting records

Use the existing paste workflow for the first small pilot. This is the local implementation path; the workflow owner still needs to approve the actual records and access scope. Zoom remains Planned.

1. In Skills & Knowledge, create a source with type **Meeting record**. Paste an authorized recap and record the meeting reference, source owner and verification details.
2. Review and approve the source. Grant Harper access on the employee's Knowledge tab.
3. Run Meeting record → draft action list, inspect every source line, and resolve missing/ambiguous people and dates before follow-up assignments.
4. Accepting the draft only records review. Follow-up actions require another exact-payload approval. Connectors remain Demo.

## Staging work still required

- Real member identities and a named pilot manager must be supplied by the team. No identities were guessed or added in this continuation.
- Set developer API keys in staging, configure known pricing/budgets, and use ten authorized real recaps. Keys and real records were not available locally.
- Compare deterministic vs model-assisted **meeting extraction**, recording missing actions, invented details, wrong owners/dates, unsupported excerpts and review time. Reproduce failures in de-identified fixtures before changing the extractor.
- The weekly status workflow is deterministic over task records. It does **not** have a model-assisted mode; `useModel` only applies to meeting extraction. Validate its citations against the actual staging task board rather than claiming a model comparison for it.
- The app remains an internal single-workspace pilot. Recovery is administrator assisted, with no SMTP, self-service reset email, SSO or 2FA.

## Local verification

See `docs/LOCAL_VERIFICATION.md` for the check results and browser observations from this continuation.
