# House Chat

`/chat` is the household's shared conversation. The dashboard links to it;
all current housemates can read the same persisted history. No DMs, reactions,
threads, transfers, or general file storage are introduced.

## Storage and tenant boundary

Migration `0005_kind_jocasta.sql` adds `chat_messages` and `chat_jobs`.
Messages have UUID identity, a bigint cursor, household, member sender, a
historical display-name snapshot, kind, text, timestamp, client send key,
optional source message, and safe activity display data. Composite foreign keys
constrain senders, sources, and active proposals to their household. Existing
financial migrations and provider-managed auth tables are unchanged.

A unique household/kind/client key makes ambiguous sends safely retryable. A short
household advisory lock serializes cursor allocation through commit: polling
cannot advance past an insert that has not committed. Reads use the indexed
household/cursor pair, 40 rows at a time, with one lookahead. All operations use
`inHousehold`; HTTP derives identity from Neon and the active home from server
membership plus the HTTP-only preference. The client household header is only
a stale-page guard. It never grants access. Writes also require same-origin JSON
and bounded bodies. Human sends are limited to 30 per member per minute.

Names are snapshotted, so later profile renames do not rewrite history. Sender
membership references are retained, consistent with the existing financial
history membership policy; a future membership-removal feature must preserve
historical membership rows rather than delete them.

## Realtime and recovery

`GET /api/chat?after=<cursor>` performs incremental polling every 10 seconds
only while visible, and immediately after visibility/network recovery. Failed
reads back off up to 60 seconds to respect upstream auth/provider limits. `before`
loads older messages. A bounded `watch` list refreshes proposal states already
on screen without downloading the conversation again. Responses are private,
non-cacheable. No provider or WebSocket infrastructure is needed.

`POST /api/chat` commits the human message and queued AI job together, returns
the message, then uses Next `after` to run AI. Reads recover the sender's queued
or expired jobs, at most two per request. A 100-second database lease and lease
identity fence concurrent workers; provider calls are bounded and at most three
attempts survive process interruptions. Provider failures finish once with a recoverable response when Homeshare was
addressed or triage selected engagement; failed triage stays quiet otherwise. There is no guaranteed background execution when
all clients are closed: interrupted jobs resume when their author returns.
Human persistence is independent of model availability.

## AI routing and financial confirmation

The existing `OPENROUTER_API_KEY` and `OPENROUTER_MODEL` configure both the
existing activity interpreter and chat. There is no second provider or model
setting. Each new message receives bounded structured `silent`, `answer`, or
`activity` triage. Homeshare mentions override a silent classification. Normal
roommate conversation stays quiet.

Answers receive the last 12 messages and a fresh server snapshot, projected to
display names, bill names, dates, integer-cent totals, status, and share balances.
The latest 150 bills are included and truncation is disclosed to the model.
Emails, UUIDs, configured secret values and common API/bearer credentials are
redacted. Notes, auth records, tokens, and database identities are never fields
in the model input. Chat text is untrusted context, never financial truth.

Activities use `interpretActivity`, `prepareActivity`, the deterministic
resolver, signed contexts, and `confirmActivity`. No generic mutation tools are
available. Initial extraction receives only the source author's message, never
another roommate's words. Explicit clarification continues only that author's
signed history; its text is also persisted with a stable send key.

The group renderer reuses `ActivityConfirmation` from `activity-chat.tsx`.
Signed tokens live only in `chat_jobs`, never group API responses or message
JSON. `POST /api/activity` accepts a stored chat message ID for clarification,
choice, refresh, or cancellation. `POST /api/activity/confirm` accepts that ID
for confirmation. Every operation checks the original author, even for owners.
The existing financial transaction invokes a small optional result callback;
the payment and its shared, bill-linked result commit or roll back together.
Repeating a completed confirmation returns its persisted result. Refreshing an
expired proposal requires a new explicit review and preserves current financial
validation. Cancellation and confirmation races recheck the active proposal
inside the write transaction.

Switching households blanks the old view and composer immediately, changes the
server preference, stays on `/chat`, and remounts the conversation by household.
Other tabs reject stale household headers and refresh before further work.

## Verification

- `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.
- `pnpm test:integration`: real designated development Postgres, including chat
  persistence, pagination, isolation, retry keys, leases, private proposals,
  author-only confirmation and atomic results.
- `RUN_LIVE_MODEL_TESTS=1 pnpm exec vitest run tests/chat-live.test.ts`: live
  configured OpenRouter model, synthetic chat/snapshot fixtures only.
- Authenticated browser tests use the real development Neon auth/database and
  a process-only deterministic OpenRouter stub:

  ```sh
  HOMESHARE_BUILD_DIR=.next-chat HOMESHARE_E2E_LLM_STUB=true \
  E2E_BASE_URL=http://localhost:3107 \
  E2E_SERVER_COMMAND='NODE_OPTIONS="--require ./e2e/openrouter-stub.cjs" pnpm dev --port 3107' \
  pnpm exec playwright test e2e/activity.spec.ts
  ```

The separate build directory keeps concurrent local development independent.
Never enable the stub in deployment. It requires the designated development
flag and is not imported by application code. Browser coverage uses two actual
sessions and tests shared visibility, reload, historical pagination, failed-send
retry, guarded autoscroll, author-only proposals, confirmation replay, AI outage,
household switching, and a keyboard-sized viewport on Chromium and iPhone WebKit.
Physical iPhone keyboard behavior, deployed Vercel `after` lifecycle and
production migration execution remain release checks distinct from local tests.
