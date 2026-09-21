# Homeshare

A friendly roommate household bill tracker built on Next.js 16, React 19, strict TypeScript, Tailwind CSS v4, shadcn/ui, Neon Postgres, Drizzle, and managed Neon Auth (Better Auth).

Production: [homeshare.dev](https://homeshare.dev). The previous public Vercel domain redirects here, preserving paths and query strings.

## Run locally

Node 22.12+ and pnpm 10.32.1 are required.

```sh
pnpm install --frozen-lockfile
cp .env.example .env.local
# Use a separately designated child branch for development.
# Only a fresh development setup should apply reviewed migrations:
# pnpm db:migrate
pnpm dev
```

Open http://localhost:3000. `/demo` is an explicitly read-only product preview with Sarah, Emma, Olivia, and Lake Street Apartment. The real app never falls back to demo data when configuration or authentication fails.

The database branch currently holding real Homeshare users is the production source of truth. Do not move live data merely to make the branch name `main`. Create separate child branches for future development.

Treat the current live connection as production regardless of the branch label or old environment filenames. Do not copy live users, manually migrate Better Auth users, edit `neon_auth`, replace deployment URLs, seed, or clean live records. See [release and database safety](docs/RELEASE.md).

### Development seed

Only on a separately designated child branch, configure `HOMESHARE_ENV=development` (or `test`), `SEED_ALLOWED=true`, and exact `TEST_DATABASE_HOST`, `TEST_AUTH_HOST`, and `TEST_APP_ORIGIN` values. Production processes/deployments are refused. Existing `.env.local` values do not establish safety. Then run:

```sh
pnpm db:seed
```

This creates managed-auth users Sarah, Emma and Olivia and a Lake Street Apartment household with rent, electricity, internet and gas. It includes paid, partial, upcoming and overdue examples, plus monthly templates. Random login credentials are written to `.env.seed` with private file permissions. Re-running with that file present is a no-op. It never deletes existing records. Reserved example.com seed users are verified through a development-only SQL fixture, without sending email. No such bypass exists in application routes.

## Architecture

Server Components render the app. Small Client Components handle dialogs, filters, forms and payment buttons. Server Actions resolve the managed-auth session, validate input with Zod and call transactional domain services. Business rules live separately from presentation. A node-postgres pool is attached to Vercel Fluid Compute lifecycle management; Drizzle owns migrations.

`lib/server/households.ts` provides the authorization boundary: session-derived identity → membership check → role enforcement → scoped transaction. Reads use a repeatable-read snapshot so concurrent mutations cannot combine mismatched bills and splits. React cache is request-local only; private household data is never globally cached.

### Mobile experience

New owner households (one member, zero bills) get a compact dashboard card linking to the existing invite form and bill editor. Completed prompts disappear. Progress is a browser-local UI preference scoped to user and household; it does not change membership, authorization, or onboarding. Established households do not start this guidance. A different device cannot recover partially completed guidance without first having observed that household in its initial state. Blocked storage falls back to memory.

After creating an email-bound invitation, supported browsers show **Share invite**, opening the native share sheet with a short message and URL. **Copy link** remains available, with selectable text if clipboard access fails. Cancelling the share sheet is not an error and does not revoke the invitation. Homeshare does not send SMS or invitation emails.

The manifest launches `/dashboard` in standalone mode. Existing authentication handles signed-out launches. Opaque 192/512px icons, a maskable icon, and a 180px Apple touch icon reuse the existing house mark. In iPhone Safari, use Share → Add to Home Screen. Safe-area layout remains enabled; there is no service worker, offline cache, or offline financial-write queue. Installation, standalone auth/session behavior and the native share sheet still need real-device verification.

Appearance defaults to the system, reacts to system changes, and saves explicit light/dark choices locally across visits and tabs. Settings → Appearance → Use device setting clears the override. An inline head script applies the appearance before body rendering; browser storage failures do not break the page.

### Browser sessions

Email sign-in explicitly requests a persistent session. `proxy.ts` checks existing sessions through Neon's auth handler before page rendering and forwards renewed cookies to both the browser and the current request. This is necessary because Server Components cannot write cookies. It bypasses the SDK's session-data cache so upstream session-token renewals are preserved. Signed-in visitors to `/` go straight to `/dashboard`; public pages remain accessible when signed out. Authorization still checks the provider session and household membership on the server.

Neon manages the actual session lifetime and renewal policy. The 60-second `sessionDataTtl` is only an identity-cache duration, not a login timeout. Keep `NEON_AUTH_COOKIE_SECRET` stable across deployments. Clearing browser cookies, provider expiry/revocation, or explicitly signing out still requires another login.

### Schema

| Table                       | Purpose                                                                                      |
| --------------------------- | -------------------------------------------------------------------------------------------- |
| `neon_auth.*`               | Provider-managed users, sessions, credentials; not managed by Drizzle                        |
| `profiles`                  | Auth-ID-keyed application identity, no passwords                                             |
| `households`                | Name and IANA time zone; USD in this version                                                 |
| `household_members`         | Owner/member roles per household; users can belong to multiple homes                         |
| `household_invitations`     | Email, hashed random token, expiry, acceptance/revocation                                    |
| `recurring_bill_templates`  | Monthly rule, amount, next date, anchor day, version, active state                           |
| `recurring_template_splits` | Selected members and exact future allocations                                                |
| `bills`                     | Independent historical instances; unique template/period                                     |
| `bill_splits`               | One exact-cent share per member per bill                                                     |
| `payments`                  | Positive partial contributions; recorder, timestamps, command idempotency and reversal audit |
| `chat_messages`             | Shared household conversation, stable cursor and client send keys                            |
| `chat_jobs`                 | Private AI leases, recovery state and signed activity proposals                              |

Composite foreign keys prevent linking records across households. Unique indexes prevent duplicate household memberships, splits, recurring periods, source commands and chat retries. Deferred Postgres triggers enforce bill/template allocation totals at commit; positive, non-reversed contributions cannot exceed a share.

### Permissions

All members can read household bills, see shares/history, and add bills. Members mark/undo only their own shares. The owner may record any share, manage invitations, change household settings, and edit recurring templates. Owners or original creators can edit bills only before any payment history exists. Paid records cannot be rewritten even after a reversal. Financial edits and payments take the same bill lock, and stale edit versions are rejected.

Invitations are shareable links, not automatically emailed. The recipient must sign in with the invited address and verify that email using Neon’s email OTP. Links expire after seven days; replacing or revoking one invalidates it. Acceptance is atomic and replay-safe. A valid invitation previews the household name and invited email; bills and household records remain private until membership is verified.

Application-level authorization is active. Postgres RLS is not enabled. Transactions set `app.user_id` and `app.household_id`, and tenant columns/composite keys prepare the schema for future RLS. Before enabling RLS, use a restricted non-owner DB role and add explicit policies; do not assume `ENABLE ROW LEVEL SECURITY` alone protects an owner connection.

### Money, dates and recurring bills

Money is integer cents, parsed directly from decimal strings. Equal splits distribute remaining pennies in stable member-ID order. Custom splits must sum exactly to the bill amount. Payments can record partial contributions. Manual “Mark paid” settles the remaining share. Reversing a specific contribution retains its history; prior payment history still prevents financial edits.

Due dates are calendar dates in the household’s configured zone. A bill becomes overdue after its due date, never during that day. Status is derived: fully paid → overdue if outstanding past due → partially paid → upcoming or unpaid (due today). Event timestamps are stored in UTC and displayed in the household zone.

Monthly templates generate independent instances one month ahead. The original day-of-month remains the anchor; the 31st clamps to February’s last day and returns to the 31st in March. Row locks and `(template_id, period)` uniqueness make concurrent/retried generation safe. Edits affect ungenerated periods only. Pausing stops generation; resuming skips missed paused periods. Generation catches up at most 24 months per template per invocation. It runs on authenticated app access and via a daily authenticated Vercel cron. The cron handles up to 100 households per run, earliest due first; subsequent runs and normal app access continue catch-up.

### Routes

- `/` — landing page
- `/sign-in`, `/sign-up` — managed authentication
- `/forgot-password`, `/reset-password`, `/verify-email` — account recovery/verification
- `/onboarding` — create household
- `/join/[token]` — authenticated invitation acceptance
- `/dashboard` — this month’s totals, personal balance, overdue/upcoming, recent payments
- `/bills` — searchable status filters and recurring settings
- `/bills/[id]` — shares, payment actions, edits and history
- `/household` — roommates, invite links, revocation
- `/settings` — household details, account controls, connected Google account, appearance
- `/chat` — shared, persisted household conversation and selective AI assistance
- `/demo/[[...path]]` — isolated read-only example
- `/api/auth/[...path]` — Neon Auth’s official proxy handlers
- `/api/cron/recurring` — bearer-secret-protected generation

## Verification

```sh
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm exec playwright install chromium
pnpm test:e2e
pnpm build
```

Unit tests cover exact money, deterministic rounding, invalid/custom splits, status precedence, household midnight, DST-safe calendar math, leap/month-end recurrence, generation plans and permissions.

The opt-in database suite requires `HOMESHARE_ENV=development|test`, `SEED_ALLOWED=true`, a matching `TEST_DATABASE_HOST`, and a non-production process/deployment. It verifies actual transactions, foreign keys, allocation constraints, tenant access denial, concurrency, historical immutability, stale edits, template snapshots, and invitations. It cleans up only its UUID-namespaced application fixtures.

Playwright covers responsive demo browsing, filters, split previews, dark mode, unauthenticated route protection, cron rejection, and real managed-auth signup → household → invite → second roommate → bill → individual payments → reversal/history. The full flow is development-only and creates uniquely named example.com test accounts/households, retained for debugging. Email verification is a clearly identified database fixture; inbox delivery is not claimed as tested. Artifacts are under ignored `test-results/`.

### Continuous integration

`.github/workflows/checks.yml` runs frozen pnpm install, formatting, lint, typecheck, unit tests and production build for pull requests, pushes to main and manual dispatch. It has read-only repository permissions, receives no production secrets and explicitly disables DB tests/seeding. Builds do not run migrations.

Real Neon integration and authenticated E2E stay explicitly manual/trusted: use a separately designated child branch with the explicit development safeguards in [RELEASE.md](docs/RELEASE.md) and matching branch-specific credentials. Never expose these credentials to untrusted PR workflows. For public UI checks without writes, run `SEED_ALLOWED=false pnpm test:e2e`; install both Chromium and WebKit for the configured projects.

See [the payment-semantics decision report](docs/PAYMENT-SEMANTICS.md) before changing provider payment status or the dashboard balance. Neither semantic change is part of this release.

## Neon setup

Keep the existing live branch and its paired database/Auth URLs intact. Branch names are not a production-safety boundary. Future development must use separate child branches with matching database/Auth endpoints and trusted origins.

This workspace pins `@neondatabase/auth@0.5.0-beta` (installed Better Auth dependency: 1.6.23). The installed Next.js client exposes `signIn.social`, `linkSocial`, and `listAccounts`; the server adapter exposes `listAccounts` and forwards `/link-social` through its catch-all handler. Neon owns provider and account-linking policy; application code does not instantiate or reconfigure Better Auth.

Google sign-in uses the client-side Neon Auth proxy at `/api/auth` and the
Google provider configured in Neon Console. The Google OAuth client must list
`{NEON_AUTH_BASE_URL}/callback/google` as an authorized redirect URI for every
Neon branch in use. The app does not read Google credentials at runtime; keep
the client secret in Neon Auth’s provider configuration and never expose it as
a `NEXT_PUBLIC_` variable. Local `GOOGLE_CLIENT_ID` and
`GOOGLE_CLIENT_SECRET` values may be retained only as operator inputs for
branch configuration and must remain in ignored environment files.

Normal **Continue with Google** remains available for sign-in and signup. Existing password users sign in normally (or reset their password), then use **Settings → Connected accounts → Connect Google**. This uses authenticated `authClient.linkSocial({ provider: "google" })`, returns to Settings, and confirms status through the provider's account list. The anonymous email-verification linking flow has been removed. Invitation verification still requires an authenticated session.

Wrong-email/account, cancellation, linking, state/callback and provider errors show fixed recovery guidance, never provider descriptions. Already-connected Google is shown without another connect action. Neon controls implicit linking and same-email enforcement: verify its deployed policy as described in [RELEASE.md](docs/RELEASE.md); no custom merging or auth-table updates are introduced.

## Environment variables

| Variable                                 | Required           | Use                                                                             |
| ---------------------------------------- | ------------------ | ------------------------------------------------------------------------------- |
| `DATABASE_URL`                           | Yes                | Runtime pooled Postgres connection with TLS                                     |
| `DATABASE_URL_UNPOOLED`                  | For migrations     | Direct connection; runtime uses pooled URL                                      |
| `NEON_AUTH_BASE_URL`                     | Yes                | This database branch’s managed-auth endpoint                                    |
| `NEON_AUTH_COOKIE_SECRET`                | Yes                | Random secret of at least 32 characters; use `openssl rand -hex 32`             |
| `APP_URL`                                | Yes                | Canonical app origin; production: `https://homeshare.dev`                       |
| `CRON_SECRET`                            | Yes for cron       | Independent random bearer secret                                                |
| `SEED_ALLOWED`                           | Development only   | One of several required write-test opt-ins; absent or false in production       |
| `HOMESHARE_ENV`                          | Write tests only   | Explicit `development` or `test`; absent or `production` for release            |
| `TEST_DATABASE_HOST`                     | Write tests only   | Exact designated child-branch pooled database hostname                          |
| `TEST_AUTH_HOST`, `TEST_APP_ORIGIN`      | Seed/auth E2E only | Exact designated auth hostname and development app origin                       |
| `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` | For AI             | Server-only provider credentials/model shared by activity and chat              |
| `AI_PROPOSAL_SECRET`                     | Optional           | Independent 32+ character signing secret; otherwise uses the auth cookie secret |

No secrets use `NEXT_PUBLIC_`. `.env.local`, `.env.seed`, and `.env.production-reference` must remain untracked.

## Deploy to Vercel

1. Keep deployment `DATABASE_URL` and `NEON_AUTH_BASE_URL` pointing at the current live branch. Keep cookie secrets stable. Do not select a database by its `main`/`development` label.
2. Run source checks and build. With the actual deployment environment supplied by the operator, run `pnpm release:check`. It does not load `.env.local`, write data, or apply migrations. A schema mismatch blocks release; investigate instead of switching branches.
3. The current code requires migrations 0000–0006. This hardening pass adds no migration. Any future schema change must be separately reviewed and tested on a designated child branch before an explicitly authorized application to the existing production source of truth.
4. Deploy through the established Vercel workflow. Builds never migrate. `vercel.json` schedules the bearer-protected recurrence endpoint daily at 10:00 UTC; authenticated lazy generation remains available.
5. Complete the manual provider, email, session, household and chat checks in [RELEASE.md](docs/RELEASE.md). Do not use seeds or write-test suites on production, or clean live records as a release step.

A build or mocked OAuth test does not establish real Google consent, deployed provider policy, email delivery, or live schema compatibility.

## Deliberate limits and next improvements

Multiple households per account with an authorized active-household switcher; USD only; up to 30 members; monthly recurrence; positive partial contributions with manual remainder settlement. No funds move through Homeshare. Invitations are copied/shared manually. No member-removal/ownership-transfer UI yet, because preserving historical obligations requires a separate archival design. Bills with payment history cannot be edited or deleted; mistaken payments can be reversed. No WebSocket subscriptions; house chat polls incrementally while visible, with recovery and pagination. Bills refresh on normal navigation/actions. Appearance follows the device by default, with a persisted light/dark override and a device-setting reset in Settings. Financial history loads the household’s records; chat history uses cursor pagination.

Best next work: verify production email/deployment lifecycle, member departure with historical membership retention, a clear unpaid-bill cancellation/archive flow, optional reminders and payment links, history pagination, and defense-in-depth RLS with a restricted runtime role.

See [the implementation plan and researched official sources](docs/IMPLEMENTATION.md) and [agent conventions](AGENTS.md).

### Multiple households and invitation onboarding

The current schema includes migration `0003_pretty_wraith.sql`. It replaces the single-household constraint with a unique `(household_id, user_id)` membership and adds a user lookup index. No financial data is rewritten; migration `0002_financial_invariants.sql` remains intact.

The household menu on desktop and mobile switches homes or starts another household. A server-set, HTTP-only cookie remembers the choice; every read resolves it against the signed-in account’s memberships and every mutation independently authorizes the supplied household. Missing or stale preferences fall back to the oldest membership. Joining or creating a household selects it immediately. Switching returns to the dashboard and remounts household UI, preventing stale bill drafts from carrying into another home.

Invitation links preview the household and prefill the invited email. Signup, sign-in, verification and password recovery retain the invitation destination. Verification happens inside the invitation screen; wrong-account and unavailable-invitation states offer recovery. The email remains verified and email-bound at acceptance. Additional homes do not inherit owner permissions or existing bill allocations.

## Confirmed roommate activity

The dashboard can interpret a roommate contribution such as “Allie paid $50 toward electricity,” clarify the person/bill, and show a proposal before recording anything. Migration `0004_partial_contributions.sql` adds partial contributions while preserving manual settlement and individual reversals. The release checker requires this migration and the current chat migrations 0005–0006.

The chat streams Markdown draft notes and accepts reviewed PDF/text/Markdown/CSV references or pasted source excerpts. Sources are temporary; every financial action still needs a validated confirmation. Configure server-only `OPENROUTER_API_KEY` and `OPENROUTER_MODEL` (currently `openai/gpt-5.6-luna`) to enable interpretation. The AI never authorizes or performs financial mutations. See [the architecture, limits, migration and test instructions](docs/ACTIVITY-CHAT.md). Provider payments are outside this feature.

## Shared household chat

`/chat` persists human conversation separately from the dashboard activity draft. AI triage stays quiet for normal conversation; mentions and relevant questions can receive an answer based on a bounded household snapshot. Proposed contributions always require author confirmation and the existing tenant/financial validation. Private signed tokens stay in `chat_jobs`. Human messages remain available during AI outages. See [HOUSE-CHAT.md](docs/HOUSE-CHAT.md).
