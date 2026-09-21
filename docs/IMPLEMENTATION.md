# Homeshare implementation plan

1. Foundation: pnpm, strict TypeScript, current shadcn primitives and warm neutral/green design tokens.
2. Domain: exact cents, household-local calendar dates, deterministic splits, status, monthly rules.
3. Persistence: Postgres + Drizzle; transactional services with server-derived identity and household membership checks.
4. Vertical flows: managed Neon Auth → create/join → bills/splits → payments → recurring templates → household/settings.
5. Verification: unit and database integration tests, browser smoke, format/lint/typecheck/build.

## Model and security decisions (before implementation)

- Neon owns auth users/sessions; application profiles are keyed by verified auth user IDs (no passwords in app DB).
- Households have an IANA time zone and USD currency. Members have owner/member roles. One active household per account for this first version.
- Invitations are email-bound, expire after seven days, store SHA-256 token hashes, and are consumed atomically. Link sharing is deliberate; no email delivery dependency.
- Household members may create bills and record/undo their own payments. Owners may record/undo any member's payment, edit unpaid bills, and manage household invitations/templates. Bill creators may edit their own unpaid bills.
- Every household service executes in a transaction, verifies membership from the session user, and scopes resources by household_id. Composite foreign keys prevent cross-household associations. No browser database access. A transaction-local household/user context is set for future RLS.
- Bills snapshot amounts, names, due dates and splits. Payment records have recorded-by and reversal metadata. A bill with any payment history cannot be financially edited.
- Monthly templates own member allocations and their next generation date. Unique (template_id, period) plus row locking makes generation idempotent. Editing a template affects only ungenerated periods. Days 29–31 clamp to month end without drifting the anchor day.
- Generation runs lazily on authenticated app access and through a protected daily cron, with a one-month lookahead and bounded catch-up batches.
- UI demo uses explicit read-only fixtures in a separate public /demo route, never an authentication bypass.

## Official sources researched September 20, 2026

- Installed Next.js 16.3.5 docs: authentication, mutating-data, use-server; https://nextjs.org/docs/app/guides/authentication
- React actions: https://react.dev/reference/react/useActionState
- Neon managed auth: https://github.com/neondatabase/neon-js/blob/main/packages/auth/NEXT-JS.md
- Neon driver guidance: https://neon.com/docs/connect/choose-connection
- Drizzle: https://orm.drizzle.team/docs/get-started/postgresql-new and https://orm.drizzle.team/docs/transactions
- Postgres driver: https://node-postgres.com/features/transactions
- shadcn: https://ui.shadcn.com/docs/installation/next and https://ui.shadcn.com/docs/theming (component docs via CLI)
- Tailwind v4: https://tailwindcss.com/docs/installation/framework-guides/nextjs
- Zod: https://zod.dev/basics
- TypeScript: https://www.typescriptlang.org/tsconfig/strict.html
- Vitest: https://vitest.dev/guide/ ; Playwright: https://playwright.dev/docs/test-webserver

Installed package types are checked alongside official documentation; stable package APIs take precedence over unreleased examples.
