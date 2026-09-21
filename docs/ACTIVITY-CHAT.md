# Roommate activity chat

The dashboard can interpret one roommate share contribution, resolve it within the active household, and display a confirmation card. The model has no mutation tools. This does not track utility/provider payments, advances, reimbursements beyond a share, bank transfers, recurring creation, or custom splits.

## Runtime and configuration

This implementation uses `ai` 7, `@ai-sdk/react` 4, and `@openrouter/ai-sdk-provider` 3. The official [AI SDK structured-output documentation](https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data), [chat transport documentation](https://ai-sdk.dev/docs/ai-sdk-ui/transport), [custom data streams](https://ai-sdk.dev/docs/ai-sdk-ui/streaming-data), and [OpenRouter provider documentation](https://github.com/OpenRouterTeam/ai-sdk-provider) were checked against the installed package source. OpenRouter's general integration page still includes an older tool schema example; the implementation follows the current installed SDK types.

Server-only configuration:

```dotenv
OPENROUTER_API_KEY=
OPENROUTER_MODEL=openai/gpt-5.6-luna
# Optional independent signing secret, at least 32 characters.
# Otherwise NEON_AUTH_COOKIE_SECRET signs proposals with a domain-specific prefix.
AI_PROPOSAL_SECRET=
```

Choose an OpenRouter model with structured JSON output support. There is no hardcoded model or automatic fallback to an unconfigured provider. No `NEXT_PUBLIC_*` credentials are used. Missing configuration gives a recoverable message; manual settlement remains available. Rotating the signing secret invalidates pending proposals.

`streamText({ output: Output.object({ schema }) })` performs one interpretation step. The strict output contains a short Markdown summary and the structured activity. `partialOutputStream` sends only summary deltas as standard UI text parts; only the completed, Zod-validated activity reaches the deterministic resolver. `useChat` and `DefaultChatTransport` consume text and typed custom data parts. The customized official AI Elements `Message` / memoized `MessageResponse` render streaming Markdown through Streamdown. Draft notes are explicitly labeled; they are never financial confirmation or evidence of a write. Reasoning is excluded and never forwarded. Raw HTML, remote images and generated actionable links are disabled. Confirmation is a separate deterministic POST; SDK approval of raw tool arguments would not meet this financial boundary.

## Interpretation and resolution

- The strict schema has spoken payer/bill references, intent, decimal-string contribution and optional explicit bill total/date/period, optional household reference, canonical category, and an incomplete flag. IDs are excluded. Money is validated with `parseMoney`; no user money is parsed with floating point.
- `I`, `me`, `my`, and `myself` resolve to the authenticated member. Full names are compared case-insensitively with normalized whitespace; a first name resolves only when unique. Unknown or ambiguous names require clarification. Choices carry server-generated, signed selections and do not call the model again.
- Exact normalized bill names take precedence, then explicit due date/period filters. Category aliases can supply candidates, never break a tie. Broad `Other` classifications do not match unrelated bills. Paid bills remain in the candidate set; the resolver never silently selects an unpaid/latest/oldest instance.
- Missing new-bill total/date are requested separately from the contribution. A new one-time bill uses `billSchema`, the existing creation helper and `equalSplit` across every current member. Every share is displayed before confirmation. Contributions exceeding the resulting share are rejected before creation.
- Historical bills retain their original shares. A member who has no split on the selected bill cannot contribute to it.
- Multiple activities, provider payments, unauthorized other-person contributions, invalid money/dates, fully settled shares and overpayments produce explanations or clarification without writes.

The provider receives only household display name, household-local today, bounded user text, reviewed reference text, and the preceding extracted intent. It receives no household member/bill records at all: matching happens afterward. Emails and UUIDs in the supplied text are redacted. User messages are capped at 1,000 characters, provider history at five messages, structured output at 2,400 tokens, one generation step, zero automatic retries and a 40-second timeout. There are no SQL, email or mutation tools. Request bytes are capped before JSON parsing. OpenRouter spending limits should also be configured on the production key; this implementation does not add a distributed rate-limiting service.

## Household-aware starters and follow-up guidance

The dashboard requests three editable starter drafts from `/api/activity/suggestions`. The server authenticates the active household and builds bounded candidates from current unpaid splits the viewer is allowed to record. Each existing-bill candidate includes the exact remaining cents and full due date. Empty/settled households get explicitly new-bill drafts with missing contribution, total and date placeholders, using current eligible roommates. Settled shares and departed members are excluded.

The configured Luna model chooses three distinct candidate positions and natural verb styles using structured output. The server renders the final prompts with authoritative values, so the model cannot substitute a roommate, invent an amount/date, or introduce a financial command. IDs and emails never enter this request. Invalid/out-of-range/duplicate output, timeout, missing configuration or provider failure produces three safe local drafts. One 600-token generation, no retries and an eight-second timeout cap cost. A bounded 100-entry, five-minute in-memory cache coalesces equivalent requests; authentication and fresh household reads happen before cache lookup, and the key includes viewer, household, role, model and candidate state.

Selecting a starter or follow-up only fills and focuses the textarea. It never sends a message or confirms a payment. Missing placeholders are selected for easy replacement and blocked both in the composer and server endpoint. Ambiguous member/bill choices retain their signed choice index until the user edits the draft, then require an explicit Send. Household remounts abort pending suggestion fetches and discard drafts.

Follow-ups come from the authoritative resolver: eligible roommate choices, bill/date choices, missing contribution amounts, actual remaining shares, and new-bill total/date requests. No suggested total or date is invented. Attachment controls are collapsed until requested; “Use an attached bill” opens them. Ordinary contributions show only the useful server question/confirmation, suppressing redundant model narration. Reviewed document notes continue streaming as Markdown. No ledger, schema, authorization or confirmation behavior changes.

## Documents and sources

Attach up to two PDF, TXT, Markdown or CSV documents, or paste relevant text from a webpage. Uploads are authenticated and active-household scoped, same-origin, limited to 1 MB before buffering, and never written to disk or the database. PDF extraction uses the serverless `unpdf` build, allows at most 10 pages, and closes the PDF loading task afterward. Binary, empty, unreadable and overlong documents fail without a model call. Scanned/image PDFs and URLs alone are not supported; paste their relevant text instead. There is no arbitrary URL fetching, SQL generation, or external-resource tool.

The user reviews and can edit extracted text before attaching it. Each reference is limited to 6,000 characters. Email addresses and UUIDs are redacted again at the provider boundary. Account numbers and other sensitive details must be removed in the review UI. Only the reviewed text and source label are sent to OpenRouter on Send, not raw files, metadata or authenticated database records. Sources are in-memory only and clear on cancel, successful confirmation, reload, or household change. They are not a durable document library.

The model can organize source facts with numbered references and use an explicit bill total/date from a document. A source cannot authorize an action or establish a roommate contribution; the user still states the activity and confirms one resolved proposal. Document instructions are untrusted. Multiple activities still require one-at-a-time recording. Bill creation and partial contribution rules are unchanged.

## Model comparison and Vercel setup (2026-09-21)

The [OpenRouter live catalog](https://openrouter.ai/api/v1/models) and official model pages were checked, followed by real SDK streaming requests using synthetic fixtures only. Five identical cases covered a cent-accurate contribution, provider payment, multiple commands, excessive decimal places, and extracting a source bill total/date despite an embedded instruction to mark every bill paid.

| Model                                                                       | Exact checks | Median / slowest | Catalog input / output per million tokens |
| --------------------------------------------------------------------------- | ------------ | ---------------- | ----------------------------------------- |
| [GPT-5.6 Luna](https://openrouter.ai/openai/gpt-5.6-luna)                   | 5/5          | 2.62s / 3.71s    | $0.20 / $1.20                             |
| [Gemini 3.5 Flash Lite](https://openrouter.ai/google/gemini-3.5-flash-lite) | 5/5          | 1.10s / 1.30s    | $0.30 / $2.50                             |
| [GLM 5.3 Flash](https://openrouter.ai/z-ai/glm-5.3-flash)                   | 3/5          | 3.07s / 30.06s   | $0.09 / $0.30                             |

Luna is selected for the lower token prices with acceptable response time. Gemini was faster and passed a second five-case run too. GLM's two mismatches returned `unsupported` for provider/multiple activities, so they failed safely but lost the specific clarification. This small sample is a smoke evaluation, not a statistical reliability benchmark; prices/routing/latency can change. An earlier disabled-reasoning trial was rejected by GLM/Gemini endpoints; the working configuration requests minimal reasoning and excludes it from responses. DeepSeek's earlier trial also timed out on two cases and was not selected.

Routing requires support for supplied parameters and sets OpenRouter `data_collection: deny`. This is not a claim of zero provider retention. No automatic model fallback or unbounded retries are enabled.

`OPENROUTER_API_KEY` was securely uploaded as a Vercel Secret, and `OPENROUTER_MODEL=openai/gpt-5.6-luna` as Config, to Production, Preview and Development on `drews-projects-870e934b/billtracker` (`homeshare.dev`). The local model was set without displaying or replacing the key. Vercel environment changes apply to subsequent deployments; this task does not claim an explicit production deployment or production migration.

Live evaluation is opt-in and disabled in ordinary CI:

```sh
RUN_LIVE_MODEL_TESTS=1 LIVE_MODELS=openai/gpt-5.6-luna,google/gemini-3.5-flash-lite \
pnpm exec vitest run tests/activity-live.test.ts --reporter=verbose
```

The reference implementation follows the [Markdown memoization cookbook](https://ai-sdk.dev/cookbook/next/markdown-chatbot-with-memoization) and [AI Elements Message](https://ai-sdk.dev/elements/components/message). The human-in-the-loop, multimodal, natural-language Postgres and JSON-repair cookbooks were reviewed. Arbitrary SQL and JSON repair were intentionally not introduced into the financial path: malformed completed output fails closed, and signed deterministic proposals retain approval authority.

## Confirmation and transactions

Each proposal has an HMAC-signed, 15-minute token binding its user, household, stable random command UUID, interpreted intent, deterministic selections and reviewed snapshot. The token also carries bounded continuation context; the dashboard draft has no persisted history. Shared `/chat` messages and private jobs are persisted separately; see [HOUSE-CHAT.md](HOUSE-CHAT.md). Treat tokens as private short-lived application data. Only the latest user text and signed context are sent by the client, never client-supplied assistant messages.

All activity endpoints derive identity from Neon and resolve the HTTP-only active-household preference against memberships. A client household ID is a consistency assertion, never the authorization source. A switch remounts the chat and discards its in-memory proposal; the endpoint rejects a token/expected-household mismatch, including cross-tab switches. Same-origin JSON POSTs are required.

Confirmation enters `inHousehold`, takes a transaction advisory lock for the command UUID, checks for a previous ledger result, locks the household/members and existing bill, and reads authoritative state again. Any changed reviewed values, membership, bill version, or remaining amount produce refreshed details requiring another confirmation. Replays return “already recorded,” including after proposal expiry or when the original payment has subsequently been reversed. Expired uncommitted proposals cannot write.

For new bills, bill creation, all splits, and the contribution use one transaction and shared `createBillInTransaction` / `recordPaymentInTransaction` implementations. A failure rolls back all three. Concurrent retries serialize before creating a bill; the unique payment command index supplies a second backstop. Cancellation does not call the confirmation endpoint. After an interrupted confirmation the UI retains the same proposal/token so a retry cannot duplicate the activity. Dashboard activity draft persistence across a full page reload is intentionally absent; inspect the linked bill/history before entering a new activity if a reload interrupted confirmation.

## Partial-contribution migration

`drizzle/0004_partial_contributions.sql` is part of the required current migration chain 0000–0006. It removes `one_active_payment_per_split`, adds a split lookup index and nullable globally unique `source_command_id`, and adds `source_created_bill` for source attribution. Manual rows keep a null command ID. Existing full-share rows require no backfill and remain valid.

The replacement payment trigger enforces positive contributions and cumulative **non-reversed** contributions no greater than the split. It updates/locks the parent bill before checking the aggregate, incrementing the version on insert/reversal so stale proposals cannot miss a reversal/replacement. It forbids altering a payment's amount, tenant, split, recorder, time or command provenance, or undoing/changing an existing reversal. A split guard rejects financial changes once payment history exists. Application roles never expose ledger deletion; controlled test teardown still deletes its own reserved fixtures.

The service takes the bill lock **before** reading the remaining amount. Explicit cent amounts must fit. Omitting the amount retains the manual “settle remaining” behavior, with an already-settled manual retry remaining a no-op. Reads sum every active contribution. Split UI displays paid/remaining amounts and retains “Mark paid” for a partial share; “Undo latest” reverses only the displayed latest active payment ID. Payment history continues showing individual records and reversals. Any history, including reversed rows, still prevents bill financial edits.

## Verification

Ordinary `pnpm test` requires no OpenRouter key. Resolver/token/request tests and mocked HTTP tests exercise the real SDK/provider structured-output path without calling OpenRouter. The database suite requires `RUN_DB_TESTS=1` plus all explicit development guards in [RELEASE.md](RELEASE.md); it covers partial contributions, manual remainder, reversal/replacement, SQL/service concurrency, idempotency, tenant/role checks, stale proposals, membership changes and rollback after bill creation.

For a fresh, separately designated child-branch development setup, review the entire 0000–0006 migration chain before applying it. The current live branch must not be switched, seeded, or migrated during this hardening pass. Use the direct Neon URL (without `-pooler`) and `sslmode=verify-full` for migrations. Run:

```sh
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:integration
```

Authenticated activity E2E uses real development Neon auth/database plus a **test-process-only** fetch stub. There is no application mock mode, test endpoint, or auth bypass. Use local HTTPS for WebKit’s secure authentication cookies. Generate a temporary certificate, trust it only in the test process, and start a fresh test server via Playwright:

```sh
openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout /tmp/homeshare-e2e-key.pem -out /tmp/homeshare-e2e-cert.pem \
  -days 2 -subj '/CN=localhost' \
  -addext 'subjectAltName=DNS:localhost,IP:127.0.0.1'

NODE_EXTRA_CA_CERTS=/tmp/homeshare-e2e-cert.pem \
HOMESHARE_E2E_LLM_STUB=true \
OPENROUTER_API_KEY=test-only OPENROUTER_MODEL=test-model \
E2E_BASE_URL=https://localhost:3013 \
E2E_SERVER_COMMAND='NODE_OPTIONS="--require=./e2e/openrouter-stub.cjs" pnpm dev --port 3013 --experimental-https --experimental-https-key /tmp/homeshare-e2e-key.pem --experimental-https-cert /tmp/homeshare-e2e-cert.pem --experimental-https-ca /tmp/homeshare-e2e-cert.pem' \
pnpm test:e2e e2e/activity.spec.ts
```

This test is skipped without the designated development environment and explicit stub flag. It covers iPhone proposal/confirmation, ambiguity, missing new-bill details, cancel, double-tap/replay, response loss after commit, household switching and a short keyboard-sized viewport. Browser/auth and database verification remain separate from real OpenRouter model behavior, production migration and deployed behavior.

## Changed files

| Area                            | Files                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dashboard UI                    | `components/activity-chat.tsx`, `components/activity-prompts.tsx`, `components/dashboard.tsx`                                                                                                                                                                                                                                                                                                |
| Documents and streamed Markdown | `components/activity-sources.tsx`, `components/ai-elements/message.tsx`, `lib/domain/activity-sources.ts`, `lib/server/activity-sources.ts`, `app/api/activity/sources/route.ts`, `app/globals.css`                                                                                                                                                                                          |
| Partial-share UI and fixtures   | `components/bill-detail.tsx`, `components/payment-button.tsx`, `lib/domain/types.ts`, `lib/demo.ts`                                                                                                                                                                                                                                                                                          |
| Intent, matching and chat types | `lib/domain/activity.ts`, `lib/domain/activity-prompts.ts`, `lib/domain/activity-chat.ts`                                                                                                                                                                                                                                                                                                    |
| Interpretation and confirmation | `lib/server/activity.ts`, `activity-token.ts`, `activity-interpreter.ts`, `activity-suggestions.ts`, `activity-http.ts`                                                                                                                                                                                                                                                                      |
| HTTP boundaries                 | `app/api/activity/route.ts`, `app/api/activity/suggestions/route.ts`, `app/api/activity/confirm/route.ts`                                                                                                                                                                                                                                                                                    |
| Shared financial reads/writes   | `lib/server/bills.ts`, `lib/server/queries.ts`                                                                                                                                                                                                                                                                                                                                               |
| Ledger and migration            | `lib/db/schema.ts`, `drizzle/0004_partial_contributions.sql`, `drizzle/meta/0004_snapshot.json`, `drizzle/meta/_journal.json`                                                                                                                                                                                                                                                                |
| Tests                           | `tests/activity-prompts.test.ts`, `tests/activity-suggestions-route.test.ts`, `tests/activity-live.test.ts`, `tests/activity-sources.test.ts`, `tests/activity-source-route.test.ts`, `tests/activity.test.ts`, `tests/activity-route.test.ts`, `tests/activity-interpreter.test.ts`, `tests/integration.test.ts`, `e2e/activity.spec.ts`, `e2e/openrouter-stub.cjs`, `playwright.config.ts` |
| Setup and documentation         | `package.json`, `pnpm-lock.yaml`, `.env.example`, `AGENTS.md`, `README.md`, `docs/PAYMENT-SEMANTICS.md`, this document                                                                                                                                                                                                                                                                       |

## Verification recorded for this implementation

- `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` passed. The ordinary suite passed 131 tests, including streamed-provider, PDF/text extraction, source-limit and upload-boundary tests; 19 database and 6 live-model tests were skipped by default.
- `pnpm test:integration` passed all 19 tests against the explicitly designated development database. Migration 0004 was applied there; its recorded hash matches the reviewed file. No production migration was applied.
- The authenticated activity Playwright flow passed in Chromium and iPhone WebKit over local HTTPS, using real development auth/database and deterministic OpenRouter HTTP responses. It includes household starter selection without submission, prefilled disambiguation, placeholder guards, dynamic follow-ups, document upload and redaction review, pasted-source bill creation, Markdown formatting, recovery from response loss after commit, double-tap/replay, cancellation, clarification, household switching, and a 390 × 450 viewport.
- The existing Chromium smoke suite passed all three flows, including the manual signup → household → invitation → bill → payment → reversal/history lifecycle.
- The client production bundle contains no OpenRouter or proposal-signing environment variable references.
- Real OpenRouter interpretation was tested with synthetic inputs as recorded above. Production migration, deployed authenticated behavior, physical-device keyboard behavior, and real-world document extraction remain separate verification layers.

## Draft-entry UX refinement

Follow-up choices are compact and use only the missing details; bill choices exclude settled or unrelated shares. All displayed draft dates include a readable month and year. Draft placeholders are highlighted inside a native textarea. Clicking a highlight opens its amount/name editor or date calendar above the clicked text fragment, including wrapped lines. Editors track the text as the viewport moves and adjust at screen edges. The small field buttons remain available for keyboard access. The shadcn Calendar/Popover date picker opens on the active household's local today without preselecting a financial due date. Applying a field replaces the whole placeholder; incomplete drafts remain blocked on both client and server.

Generated source summaries use AI Elements MessageResponse with streaming Markdown, and are labeled separately from the brief progress indicator and deterministic confirmation/question. Private reasoning stays excluded. The interpreter prompt limits source summaries to two short sentences, with no process narration. Source attachment/review behavior is unchanged.

Refinement verification (2026-09-21): formatting, lint, typecheck, production build, 134 ordinary tests, 19 development Postgres tests, and 8 real OpenRouter Luna tests passed. The live set includes readable absolute dates and “tomorrow” against an explicit reference date. Chromium passed the final authenticated flow, including placeholder selection, invalid-amount correction, Escape focus restoration, and current-month calendar selection. iPhone WebKit passed the full flow before the final Escape-focus refinement; subsequent reruns were blocked before the dashboard by Neon Auth session-fetch HTTP 429 responses. Recheck that last WebKit refinement after the provider cooldown. No production deployment or migration was performed for this refinement.

Inline editor follow-up: highlights now open a shared shadcn popover anchored to the clicked line fragment, with the shared calendar body for dates. Field shortcuts switch editors without an intervening dismissal, and stale animation-frame focus requests cannot close a newly opened editor. The direct-tap authenticated flow passed Chromium and iPhone WebKit before the final rapid-switch refinements. Final isolated-browser checks against the real component and built styles passed both engines for anchor geometry, field switching, focus, amount entry, and date replacement; the subsequent full authenticated rerun was blocked by Neon Auth HTTP 429 before reaching the dashboard.

Historical evaluation and deployment observations above are dated evidence, not current production proof. Use [RELEASE.md](RELEASE.md) for the current release process and mandatory write-test safeguards.
