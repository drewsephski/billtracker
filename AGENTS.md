<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Homeshare architecture and conventions

A household bill tracker, not a payments platform. Use pnpm; TypeScript strict mode remains enabled.

## Commands

- `pnpm dev` — local Next.js development server
- `pnpm format` / `pnpm format:check` — Prettier
- `pnpm lint` — ESLint
- `pnpm typecheck` — generate route types and run TypeScript
- `pnpm test` — pure domain tests (database suite skipped by default)
- `pnpm test:integration` — real Postgres suite, requires explicit development/test designation and matching endpoint safeguards in `docs/RELEASE.md`
- `pnpm test:e2e` — browser smoke; full signup/payment flow only with all development/auth endpoint safeguards
- `pnpm build` / `pnpm start` — production build/server
- `pnpm db:generate` / `pnpm db:migrate` — reviewed Drizzle migrations; never use push in production
- `pnpm release:check` — read-only deployment environment/schema/migration check; never loads local env implicitly or migrates
- `pnpm db:seed` — realistic development household; refuses production and writes credentials to ignored `.env.seed`

## Structure

- `app/`: thin Server Component routes; `(app)` is authenticated. No data access in Client Components.
- `components/ui/`: shadcn Radix primitives, with deliberate theme/size adjustments. Use these for all controls, feedback, cards, and typography.
- `components/`: product compositions. Client files contain interaction only.
- `lib/domain/`: pure money/date/status/permission rules, types, Zod validation.
- `lib/db/`: Drizzle schema, pooled node-postgres connection. Migration SQL in `drizzle/`.
- `lib/server/auth.ts`: lazy managed Neon Auth integration; session read bypasses cookie cache for authorization.
- `lib/server/households.ts`: tenant transaction boundary, onboarding, invitations.
- `lib/server/bills.ts`: atomic bill/template/payment mutations; shared transaction helpers for create-and-contribute.
- `lib/domain/activity.ts` + `lib/server/activity*.ts`: deterministic activity resolution, signed proposals, bounded interpretation, and atomic idempotent confirmation.
- `lib/server/recurrence.ts`: shared idempotent generation, authenticated lazy trigger and cron.
- `lib/server/queries.ts`: consistent-snapshot tenant reads, no framework auth dependencies.
- `lib/server/current.ts`: React request memoization and authenticated route context.
- `lib/server/actions.ts`: Next.js boundary; derive session identity, validate, call services, revalidate.
- `lib/server/active-household.ts`: HTTP-only active-household preference, always resolved against the current account’s memberships.
- `lib/server/chat*.ts` + `/chat`: persisted tenant-scoped house chat, bounded selective AI and author-only confirmations; private tokens live in `chat_jobs`.
- `lib/release/`: read-only schema verification and explicit development write guards.
- `lib/server/auth-throttle.ts`: bounded per-process email/attempt limits, shared by actions and proxy; provider/edge limits remain necessary.
- `lib/client/`: lightweight browser-only theme and first-run presentation state; never authorization or financial truth.
- `app/manifest.ts` + `app/apple-icon.png` + `public/icons/`: install metadata and icons; no offline financial writes or service worker.
- `lib/demo.ts` + `/demo`: read-only fixtures. Never add a demo-auth fallback.

## Non-negotiable invariants

1. Derive identity from Neon session in EVERY action. Internal services receive trusted `Identity`, never browser-supplied identities. Client household IDs are untrusted lookup candidates.
2. Every tenant service uses `inHousehold` and scopes ALL resource IDs by household. Roles are owner/member. Owners manage invitations/settings/templates; members record only their own shares; creators/owners edit unpaid bills.
3. Store cents as integers. Parse decimal strings, never `parseFloat(value) * 100`. Custom sums must equal bill totals. Equal split sorts member UUIDs before distributing leftover cents.
4. Calendar due dates are Postgres DATE, formatted without local JS timezone conversion. Overdue starts after the due date in the household IANA zone. UTC timestamps are for event history.
5. No paid boolean on bills. Payments are positive partial contributions toward individual splits; sum non-reversed rows and never exceed the share. Omitted manual amounts settle the remaining share. Reversals retain original rows. An old undo action must not reverse a newer payment.
6. Bill lock serializes financial edits and payment mutations. No financial editing once ANY payment history exists, including reversed payments. Version numbers prevent stale edits.
7. Monthly templates never update generated bills. Preserve the anchor day through short months. Unique template/period and row locks make generation idempotent. Resume skips missed paused periods. Catch-up is bounded to 24 instances per template per invocation.
8. Composite tenant foreign keys and deferred balance triggers are part of the schema. Keep custom migration `0002_financial_invariants.sql` when regenerating. Keep migration `0003_pretty_wraith.sql`, which replaces the single-household uniqueness constraint with `(household_id, user_id)` and adds a user index. Keep `0004_partial_contributions.sql`, including its aggregate payment and immutable-share triggers. Keep `0005_kind_jocasta.sql` (chat tables) and `0006_rapid_pixie.sql` (chat indexes/unique active proposals). Test future migrations against a separately designated child branch first.
9. Invitation tokens are 256-bit random, stored hashed, seven-day expiry, email-bound, owner-issued, revocable, transactionally consumed. Verified email required for acceptance.
10. No secrets, real user data, test credentials, or auth bypasses in tracked files. Test SQL verification applies ONLY to generated reserved example.com accounts on the designated development branch.
11. Existing profile IDs mirror Neon auth IDs; Neon owns the `neon_auth` schema. Do not migrate provider-managed tables. Household membership is the authorization source of truth.
12. Transactions set `app.user_id` and `app.household_id` for future RLS. System cron is the explicit exception and requires constant-time bearer-secret validation. RLS is not enabled yet.
13. No Stripe, bank connections, payment transfers, Redux, or organization framework. AI provides bounded activity interpretation and selective household chat answers described in `docs/ACTIVITY-CHAT.md` and `docs/HOUSE-CHAT.md`; it has no financial or authorization authority and every activity mutation requires explicit author confirmation. Keep dependencies product-focused.

## Verification and deployment

Accounts may own or join multiple homes; creation/acceptance selects the new home, stale preferences fall back to the oldest membership, and permissions remain per household.

See `README.md`, `docs/IMPLEMENTATION.md`, and the report-only `docs/PAYMENT-SEMANTICS.md`. The secret-free GitHub checks workflow runs source/unit/build checks only; real Neon integration/authenticated E2E require a trusted, explicitly designated development environment. Distinguish local source checks, real database tests, auth/browser lifecycle, email delivery, and deployed behavior. Never describe an untested layer as verified.

The database branch currently holding real Homeshare users is the production source of truth. Do not move live data merely to make the branch name `main`. Create separate child branches for future development.

Keep deployment database/Auth URLs intact. Never run seed/integration/auth E2E on the live branch. `SEED_ALLOWED` alone is insufficient: use `lib/release/development-guard.ts` and `docs/RELEASE.md`. Do not edit provider-owned tables or manually move auth users. Google linking uses authenticated `authClient.linkSocial` in Settings; no anonymous verification/merging flow. Account-list reads and all callback messages must remain safe during provider failures.
