# Homeshare

A friendly roommate household bill tracker built on Next.js 16, React 19, strict TypeScript, Tailwind CSS v4, shadcn/ui, Neon Postgres, Drizzle, and managed Neon Auth (Better Auth).

Production: [homeshare.dev](https://homeshare.dev). The previous public Vercel domain redirects here, preserving paths and query strings.

## Run locally

Node 22.12+ and pnpm 10.32.1 are required.

```sh
pnpm install --frozen-lockfile
cp .env.example .env.local
# Fill the environment variables from one Neon branch.
pnpm db:migrate
pnpm dev
```

Open http://localhost:3000. `/demo` is an explicitly read-only product preview with Sarah, Emma, Olivia, and Lake Street Apartment. The real app never falls back to demo data when configuration or authentication fails.

For this workspace, `.env.local` is already connected to the dedicated **homeshare / development** Neon branch. `.env.production-reference` contains the original main-branch connection/auth values for deployment reference; it is ignored by Git and Next.js. Do not copy development credentials or `SEED_ALLOWED` into production.

### Development seed

Set `SEED_ALLOWED=true` only on an isolated development branch, then run:

```sh
pnpm db:seed
```

This creates managed-auth users Sarah, Emma and Olivia and a Lake Street Apartment household with rent, electricity, internet and gas. It includes paid, partial, upcoming and overdue examples, plus monthly templates. Random login credentials are written to `.env.seed` with private file permissions. Re-running with that file present is a no-op. It never deletes existing records. Reserved example.com seed users are verified through a development-only SQL fixture, without sending email. No such bypass exists in application routes.

## Architecture

Server Components render the app. Small Client Components handle dialogs, filters, forms and payment buttons. Server Actions resolve the managed-auth session, validate input with Zod and call transactional domain services. Business rules live separately from presentation. A node-postgres pool is attached to Vercel Fluid Compute lifecycle management; Drizzle owns migrations.

`lib/server/households.ts` provides the authorization boundary: session-derived identity → membership check → role enforcement → scoped transaction. Reads use a repeatable-read snapshot so concurrent mutations cannot combine mismatched bills and splits. React cache is request-local only; private household data is never globally cached.

### Browser sessions

Email sign-in explicitly requests a persistent session. `proxy.ts` checks existing sessions through Neon's auth handler before page rendering and forwards renewed cookies to both the browser and the current request. This is necessary because Server Components cannot write cookies. It bypasses the SDK's session-data cache so upstream session-token renewals are preserved. Signed-in visitors to `/` go straight to `/dashboard`; public pages remain accessible when signed out. Authorization still checks the provider session and household membership on the server.

Neon manages the actual session lifetime and renewal policy. The 60-second `sessionDataTtl` is only an identity-cache duration, not a login timeout. Keep `NEON_AUTH_COOKIE_SECRET` stable across deployments. Clearing browser cookies, provider expiry/revocation, or explicitly signing out still requires another login.

### Schema

| Table                       | Purpose                                                               |
| --------------------------- | --------------------------------------------------------------------- |
| `neon_auth.*`               | Provider-managed users, sessions, credentials; not managed by Drizzle |
| `profiles`                  | Auth-ID-keyed application identity, no passwords                      |
| `households`                | Name and IANA time zone; USD in this version                          |
| `household_members`         | Owner/member roles per household; users can belong to multiple homes  |
| `household_invitations`     | Email, hashed random token, expiry, acceptance/revocation             |
| `recurring_bill_templates`  | Monthly rule, amount, next date, anchor day, version, active state    |
| `recurring_template_splits` | Selected members and exact future allocations                         |
| `bills`                     | Independent historical instances; unique template/period              |
| `bill_splits`               | One exact-cent share per member per bill                              |
| `payments`                  | One active payment per split; recorder, timestamps and reversal audit |

Composite foreign keys prevent linking records across households. Unique indexes prevent duplicate members, splits, recurring periods and active share payments. Deferred Postgres constraint triggers enforce bill/template allocation totals at commit; payments must equal their share.

### Permissions

All members can read household bills, see shares/history, and add bills. Members mark/undo only their own shares. The owner may record any share, manage invitations, change household settings, and edit recurring templates. Owners or original creators can edit bills only before any payment history exists. Paid records cannot be rewritten even after a reversal. Financial edits and payments take the same bill lock, and stale edit versions are rejected.

Invitations are shareable links, not automatically emailed. The recipient must sign in with the invited address and verify that email using Neon’s email OTP. Links expire after seven days; replacing or revoking one invalidates it. Acceptance is atomic and replay-safe. No household details are revealed before membership is verified.

Application-level authorization is active. Postgres RLS is not enabled. Transactions set `app.user_id` and `app.household_id`, and tenant columns/composite keys prepare the schema for future RLS. Before enabling RLS, use a restricted non-owner DB role and add explicit policies; do not assume `ENABLE ROW LEVEL SECURITY` alone protects an owner connection.

### Money, dates and recurring bills

Money is integer cents, parsed directly from decimal strings. Equal splits distribute remaining pennies in stable member-ID order. Custom splits must sum exactly to the bill amount. A payment records settlement of an entire share; partial payment of an individual share is not part of this version.

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
- `/settings` — household details, account controls, appearance
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

The opt-in database suite uses an explicitly designated development database (`SEED_ALLOWED=true`). It verifies actual transactions, foreign keys, allocation constraints, tenant access denial, concurrency, historical immutability, stale edits, template snapshots, and invitations. It cleans up only its UUID-namespaced application fixtures.

Playwright covers responsive demo browsing, filters, split previews, dark mode, unauthenticated route protection, cron rejection, and real managed-auth signup → household → invite → second roommate → bill → individual payments → reversal/history. The full flow is development-only and creates uniquely named example.com test accounts/households, retained for debugging. Email verification is a clearly identified database fixture; inbox delivery is not claimed as tested. Artifacts are under ignored `test-results/`.

## Neon setup

The dedicated project is `homeshare` (`dark-thunder-86597548`, AWS us-east-2, Postgres 17):

- `main`: `br-calm-base-b5s7r32b` — production target
- `development`: `br-little-bird-b5u1z1lv` — local/test/seed target

Managed Better Auth is enabled on both. Localhost is allowed. Each branch has a different database connection and Auth base URL; always pair them. This workspace uses the published `@neondatabase/auth@0.5.0-beta` Next.js SDK. It is pinned because its package types currently differ from unreleased main-branch documentation. Its upstream auth-UI dependency reports peer warnings; this app uses only the Next.js server entrypoint and its own shadcn forms.

For a fresh setup: create a Neon project, enable Managed Better Auth, obtain the pooled/direct connection strings and Auth URL, configure email/password and email OTP, add your deployment origin to trusted domains, and apply `pnpm db:migrate`. Neon’s shared email provider is available; verify inbox delivery on your chosen domain before inviting real roommates. Do not migrate `neon_auth` yourself.

## Environment variables

| Variable                  | Required         | Use                                                                 |
| ------------------------- | ---------------- | ------------------------------------------------------------------- |
| `DATABASE_URL`            | Yes              | Runtime pooled Postgres connection with TLS                         |
| `DATABASE_URL_UNPOOLED`   | For migrations   | Direct connection; runtime uses pooled URL                          |
| `NEON_AUTH_BASE_URL`      | Yes              | This database branch’s managed-auth endpoint                        |
| `NEON_AUTH_COOKIE_SECRET` | Yes              | Random secret of at least 32 characters; use `openssl rand -hex 32` |
| `APP_URL`                 | Yes              | Canonical app origin; production: `https://homeshare.dev`           |
| `CRON_SECRET`             | Yes for cron     | Independent random bearer secret                                    |
| `SEED_ALLOWED`            | Development only | Explicit opt-in for seeds and DB/browser lifecycle tests            |

No secrets use `NEXT_PUBLIC_`. `.env.local`, `.env.seed`, and `.env.production-reference` must remain untracked.

## Deploy to Vercel

1. Import this repository into Vercel with the Next.js preset, Node 22 or newer, pnpm install, and `pnpm build`. No custom output directory is needed.
2. Set production variables from the Neon **main** branch. Generate independent cookie/cron secrets. Set `APP_URL=https://homeshare.dev`; omit `SEED_ALLOWED`.
3. Add `https://homeshare.dev` to the main branch’s Neon Auth trusted domains. Configure preview deployments with a separate Neon branch and corresponding trusted origin.
4. Apply reviewed migrations to main using its direct connection: `DATABASE_URL_UNPOOLED='...' pnpm db:migrate`. Keep migrations separate from the build; do not race multiple deploys applying schema changes.
5. Deploy. `vercel.json` schedules generation daily at 10:00 UTC. Vercel sends the configured `CRON_SECRET`; the route refuses missing/incorrect secrets. Lazy generation also works if cron is unavailable.
6. On the deployed origin, create real accounts, verify email delivery and password reset, create a household, share an invitation, accept with a second account, create a small test bill, mark/undo shares, and inspect history. Remove test fixtures through a deliberate maintenance process before real use.

A production build and local managed-auth flow do not establish deployed correctness. Deployment, trusted-domain configuration for the final URL, and real inbox delivery remain separate release checks.

## Deliberate limits and next improvements

One household per account; USD only; up to 30 members; monthly recurrence; payments settle a complete share. No funds move through Homeshare. Invitations are copied/shared manually. No member-removal/ownership-transfer UI yet, because preserving historical obligations requires a separate archival design. Bills with payment history cannot be edited or deleted; mistaken payments can be reversed. No real-time subscriptions; refresh sees other roommates’ updates. Dark mode is a per-visit toggle. History loads the household’s records; add cursor pagination when volumes justify it.

Best next work: verify production email/deployment lifecycle, member departure with historical membership retention, a clear unpaid-bill cancellation/archive flow, optional reminders and payment links, history pagination, and defense-in-depth RLS with a restricted runtime role.

See [the implementation plan and researched official sources](docs/IMPLEMENTATION.md) and [agent conventions](AGENTS.md).

### Multiple households and invitation onboarding

Apply migration `0003_pretty_wraith.sql` with `pnpm db:migrate` before releasing this application update. It replaces the single-household constraint with a unique `(household_id, user_id)` membership and adds a user lookup index. No financial data is rewritten; migration `0002_financial_invariants.sql` remains intact.

The household menu on desktop and mobile switches homes or starts another household. A server-set, HTTP-only cookie remembers the choice; every read resolves it against the signed-in account’s memberships and every mutation independently authorizes the supplied household. Missing or stale preferences fall back to the oldest membership. Joining or creating a household selects it immediately. Switching returns to the dashboard and remounts household UI, preventing stale bill drafts from carrying into another home.

Invitation links preview the household and prefill the invited email. Signup, sign-in, verification and password recovery retain the invitation destination. Verification happens inside the invitation screen; wrong-account and unavailable-invitation states offer recovery. The email remains verified and email-bound at acceptance. Additional homes do not inherit owner permissions or existing bill allocations.
