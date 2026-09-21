# Release and database safety

The database branch currently holding real Homeshare users is the production source of truth. Do not move live data merely to make the branch name `main`. Create separate child branches for future development.

Branch labels, old `.env.local` files and `.env.production-reference` filenames do not establish which data is production. Keep the existing deployment `DATABASE_URL` / `NEON_AUTH_BASE_URL` pair intact. Do not copy users/data, manually migrate Better Auth accounts, edit live `neon_auth` tables, seed or clean live records. Creating future child branches and configuring their credentials is a separate operator action, not part of this hardening pass.

## Read-only release check

Supply the existing deployment environment through your secure operator environment, then run:

```sh
pnpm release:check
```

This command deliberately does **not** load `.env.local` or any other environment file. It validates required database/Auth/cookie/app/cron configuration, HTTPS URLs and secret lengths, rejects seeding/test flags, connects with `default_transaction_read_only=on`, starts a repeatable-read **READ ONLY** transaction and rolls it back. It reads only PostgreSQL catalogs and `drizzle.__drizzle_migrations`. It never initializes application services, reads application/auth rows, applies migrations or repairs anything. Connection failures print fixed guidance without driver errors, credentials, URLs or SQL.

The checker compares current Drizzle tables/columns, types, nullability, indexes, constraints, enabled financial triggers and reviewed function bodies. It checks every migration timestamp and SHA-256 hash, and rejects the obsolete one-household/one-active-payment restrictions. Index column order, uniqueness and validity matter. It fails when permissions are insufficient or code/schema are out of sync. It is a release guard, not a proof that every possible out-of-band schema alteration has been detected.

| Migration | Required behavior                                                                          |
| --------- | ------------------------------------------------------------------------------------------ |
| 0000–0001 | Original public household/financial schema and indexes                                     |
| 0002      | Deferred allocation checks and payment trigger                                             |
| 0003      | Unique household/user memberships; user lookup index                                       |
| 0004      | Partial contributions, command/source columns, aggregate caps and immutable settled shares |
| 0005      | `chat_messages` and private `chat_jobs`, tenant foreign keys and retry keys                |
| 0006      | Unique active chat proposals, source lookup and sender rate indexes                        |

This pass adds no migration. If checking fails, investigate against the existing production branch; do not choose a different database or silently apply schema changes. Future migrations require separate review, child-branch testing and explicit production authorization. Builds never run migrations.

AI configuration is optional for manual bill tracking. Separately confirm `OPENROUTER_API_KEY` and `OPENROUTER_MODEL` when AI is enabled, and a 32+ character `AI_PROPOSAL_SECRET` if using an independent signing key. The checker does not contact Google, Neon Auth, email or OpenRouter and cannot prove provider policy or inbox delivery.

## Development write safeguards

Seeds and integration tests require all of:

- `HOMESHARE_ENV=development` or `test`, an explicit operator designation independent of the test runner's automatic `NODE_ENV=test`.
- `SEED_ALLOWED=true`.
- `NODE_ENV`, `VERCEL_ENV` and `VERCEL_TARGET_ENV` must not be `production`.
- `TEST_DATABASE_HOST` must exactly match the host in the explicitly designated child branch's `DATABASE_URL`.

Seeds and authenticated E2E additionally require `TEST_AUTH_HOST` to match the child Auth endpoint and `TEST_APP_ORIGIN` to match the intended local/development app URL (`E2E_BASE_URL` for browser tests, otherwise `APP_URL`). Set these only after independently identifying the future child branch. Never populate them from the current live endpoint simply to get a command to pass. These guards prove explicit operator designation, not the absence of inherited production data on a branch.

`pnpm test` runs without loading local DB configuration and skips the database suite by default. `pnpm test:integration` loads `.env.local` only when explicitly enabled, then checks safety **before** setup or cleanup hooks can run. Playwright validates the same safeguards before enabling write scenarios. Public demo checks can run with `SEED_ALLOWED=false`.

The pre-existing seed/browser SQL email-verification fixtures are confined to generated reserved example.com test users on the designated development environment; they are not an application auth bypass or a production operation. No such fixtures are run by the release checker or normal unit tests. Do not run any of them on the live branch. Authenticated development suites retain their existing lifecycle/cleanup behavior.

## Google and recovery behavior

The pinned `@neondatabase/auth@0.5.0-beta` client includes Better Auth 1.6.23 APIs. Public Google buttons use `signIn.social` with explicit success/error destinations. Password users can sign in normally or reset their password, then connect Google in authenticated Settings with `linkSocial`. Settings reads `listAccounts` on the server and only reports connected when that read confirms it. An account-list outage leaves the rest of Settings usable with a retry.

Neon owns account-linking policy. The application does not instantiate Better Auth or change its managed configuration. Upstream [Better Auth account-linking documentation](https://better-auth.com/docs/concepts/users-accounts) distinguishes implicit same-email linking from authenticated `linkSocial`; the deployed service's version/configuration must be verified separately. Existing implicit linking behavior is preserved; the removed path is the anonymous verification workaround. Same-email linking and rejection of another user's Google account are provider-enforced. Keep different-email linking disabled in the managed policy. If Neon cannot expose a desired policy option, confirm support with Neon rather than editing `neon_auth` or implementing custom merging.

Cancelled consent, wrong email/account, already-linked accounts, provider outages and invalid callback/state use fixed messages. Raw error descriptions are ignored. Public error pages retain the email/password form and reset link. Invitation verification is authenticated and scoped to the session email; the old `?lookup=1` URL no longer enables an anonymous form.

## Email abuse protection

Server actions and `/api/auth` proxy email sends share bounded in-process counters: a 60-second per-email cooldown, up to 3 sends per email and 10 per client in 15 minutes. OTP/reset/sign-in attempts have a separate budget of 10 per email/token and 30 per client in 15 minutes. Email keys are normalized and hashed; the map has a fixed capacity and expires entries. At capacity it refuses new keys instead of evicting live limits. On Vercel, client identity uses its [forwarded client header](https://vercel.com/docs/headers/request-headers); elsewhere a shared bucket avoids trusting spoofable forwarding headers.

Anonymous password-reset requests always get the same generic response for existing/missing accounts, provider failures and throttling. Verification sends/checks require the session's own email. Signup and sign-in keep safe generic failures. Direct auth-proxy reset aliases share limits so bypassing the form does not bypass local protection.

These lightweight counters reset with process lifecycle and are not distributed. They cannot protect requests made directly to the managed Neon Auth endpoint. Verify managed provider email/rate limits and, where needed, existing edge/WAF controls for distributed abuse. No Redis, database write or new infrastructure is introduced. Do not claim enumeration timing is identical; the returned status/message is intentionally uniform.

## Manual production checks still required

Use the existing live deployment and consenting accounts; do not run automated write fixtures or mass cleanup against it.

1. Supply actual deployment environment to `pnpm release:check`; resolve every failure before release. Confirm current database/Auth endpoint pairing, `SEED_ALLOWED` disabled, stable cookie secret and existing trusted production origin. Do not replace endpoints.
2. In Neon/Google Console, inspect the existing Google provider, enabled email/password recovery, allowed origin and `{NEON_AUTH_BASE_URL}/callback/google` redirect URI. Confirm same-email and cross-user linking policy. This checker cannot inspect managed configuration.
3. With an existing password user, sign in, connect the matching Google account in Settings, return to a confirmed connected status, then sign out and use Google. Verify the same existing account and household memberships are retained. Verify password sign-in still works. Repeat connect/refresh without duplicates.
4. Cancel consent; choose a different-email Google account and an account already connected to someone else. Confirm recovery guidance, unchanged current access and no accidental account merge. Test an expired/invalid callback and provider-unavailable response without raw details.
5. Verify normal Google sign-in for an already linked user and Google signup with a consenting new account. Confirm invitation destinations survive successful sign-in and recoverable errors. Mocked tests do not prove real consent or managed policy.
6. Verify password-reset inbox delivery, link expiry/reuse behavior and authenticated invitation-verification delivery. Make a small controlled repeat-request check, then inspect provider/edge limits for direct and distributed requests; never test abuse at volume on production.
7. Confirm deployed session persistence, household switching, existing bills/partial contributions/history and chat visibility. Exercise any financial or chat writes only as separately approved real user activity; use the future development child branch for full fixture-based lifecycle tests. Confirm Vercel `after` recovery and OpenRouter availability separately.

Record source/unit/build results, read-only schema results, real OAuth, email delivery and deployed behavior as separate evidence layers.
