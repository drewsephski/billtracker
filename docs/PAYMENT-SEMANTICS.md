# Payment semantics: roommate settlement and provider payments

**Current implementation:** The confirmed activity feature adds partial roommate contributions in migration 0004. Active contributions are summed per split, and manual “Mark paid” settles the remainder. Reversal targets one payment record. Provider payments and advances remain unsupported. See [ACTIVITY-CHAT.md](./ACTIVITY-CHAT.md). The source audit below describes the earlier full-share implementation and is retained as historical context.

This is a source audit of HEAD `7203db7` and the mobile release slice. No financial schema, status rules, or balance calculation changes are implemented here.

## What the app currently records

`lib/db/schema.ts` defines `bills` (total, due date, creator, template/period), `bill_splits` (member obligation), and `payments` (full-share settlement, recorder, recorded time and optional reversal). There is no provider-payment field, provider-payee record, transfer recipient, actual bank transaction, or provider payment date. `created_by` identifies who entered a bill, not who paid the utility. `recorded_by` identifies who recorded a roommate settlement, not its recipient. The app cannot establish whether the provider was paid.

`lib/server/bills.ts` records a complete share, under the bill lock. Owners can record any share; members only their own. The unique active-payment index and `drizzle/0002_financial_invariants.sql` constrain each active payment to the split amount. Reversing a payment preserves the row and removes its settlement effect. Even reversed history prevents financial edits.

`lib/server/queries.ts` selects the non-reversed payment per split, sets each split's `paidCents`, and sums those values into the bill's `paidCents`. `lib/domain/bills.ts:billStatus` then applies this exact precedence:

1. Sum of roommate settlements >= bill total: **paid**, regardless of due date.
2. Outstanding and due date before household-local today: **overdue**, even if partly settled.
3. Some roommate settlement recorded: **partially paid**, including future-due bills.
4. Nothing settled: **upcoming** if future-due, otherwise **unpaid** (due today).

Zero-cent shares have nothing to settle. Individual partial settlements are unsupported. The household-month progress, bill badges, overdue warning, recent activity and personal balance therefore describe roommate settlement, not utility-provider payment.

## UX consequences

- All roommates can reimburse the bill organizer while the utility remains unpaid. The bill disappears from “Up next” and is labeled paid, hiding potential provider lateness.
- The organizer may have paid the provider in full while roommates still owe reimbursement. The app can label that bill overdue, suggesting a provider problem when only reimbursements remain.
- Provider due dates are reused as roommate settlement deadlines. Those dates need not agree.
- “Paid,” “Mark paid,” and monthly “paid” totals cannot tell users which obligation is complete. Recording one's own share also does not identify who advanced funds or who should receive reimbursement.

## Smallest clean separation to consider

For binary full-provider-payment tracking, add a **nullable provider payment confirmation** to each bill: `provider_paid_at` (timestamp) and `provider_payment_recorded_by` (profile ID), with an all-null/all-present check. Keep existing split/payment tables and integer totals unchanged. A null confirmation means **not recorded / unknown**, not proof of nonpayment. This is the smallest additive model that represents both concepts honestly without inventing old facts. If the product needs “confirmed unpaid” as a separate assertion, add a constrained `provider_payment_status` of `unknown`, `unpaid`, or `paid`, with consistent timestamp/recorder checks.

Expose two distinct concepts: **Provider payment** and **Roommate settlement**. An outstanding roommate balance must not clear provider warnings, and confirming provider payment must not settle shares. A nullable provider confirmation alone cannot safely power a definitive “provider overdue” badge: show “payment not recorded; due date passed” until the product decides how explicit unpaid confirmation should work. Consider a separate roommate settlement due date only if reimbursements require independent deadlines; do not silently reinterpret the current due date.

These confirmation fields represent current state only. For auditable corrections/undo comparable to existing share history, prefer a small tenant-scoped `bill_provider_payments` table with bill/household composite FK, recorder, recorded/paid timestamps, reversals and one-active-confirmation uniqueness. That is a larger but clean follow-up if full audit history is required. Neither option calculates who owes which recipient; payment recipients/advances would be another product decision.

### Migration and history

Use a new reviewed additive migration **after 0003**; do not rewrite 0002/0003 or any `neon_auth` tables. Start existing bills with unknown provider status (null confirmations); never backfill provider-paid from roommate settlements. Preserve all splits, payments, reversals, template instances and financial locks. Old bills retain their exact roommate settlement history; their provider state simply reads “Not recorded.” New recurring instances start unknown as well.

Authorize provider confirmations through `inHousehold`, derive the recorder from the session, validate dates, serialize through the bill lock and increment/check versions where needed. Decide whether provider confirmation history also forbids bill financial edits: the present `hasPaymentHistory` only covers split payments. Define who can confirm/undo and retain correction history before implementation. Validate the migration, tenant scoping, race handling, reversal/history, and unchanged split totals on a development branch before any production migration.

## “Your share to settle”

`components/dashboard.tsx` currently sums `amountCents - paidCents` across **every split belonging to the viewer in every loaded bill**, without a due-date, month or status filter. `lib/server/queries.ts` loads all household bills without a date cutoff. `lib/server/recurrence.ts` lazily and via cron generates through the same day of next month (clamped for short months), with up to 24 catch-up occurrences per template per invocation. Therefore already-generated future recurring bills **are included**, as are manually created future-dated bills. Ungenerated template periods are not included. The current “Across your unpaid household bills” copy and `/bills?filter=mine` destination agree with that all-date calculation.

| Option                      | Benefit                                                                   | Drawback                                                                                          |
| --------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| All unpaid shares (current) | Complete recorded obligations; matches the current list                   | Future generated bills inflate the immediate-looking balance, and generation timing changes it    |
| Due today + overdue         | Clear amount requiring attention now; stable against lookahead generation | Upcoming obligations need a separate visible total/list                                           |
| Current calendar month      | Useful for monthly budgeting                                              | Omits prior-month arrears and includes later-this-month bills; can show zero despite overdue debt |

**Recommendation:** use **due today plus overdue**, labeled “Your share due now,” filtering `dueDate <= today` in the household time zone. Preserve future obligations under a distinct “Upcoming” amount/list and retain all unpaid shares in Bills. Update the dashboard link/filter alongside the calculation so it opens the same set. Avoid current-month-only as the main actionable balance because it hides arrears. First decide whether the existing bill due date is also the roommate's settlement deadline; until a separate deadline exists, disclose that relationship. No calculation or copy change is made in this slice.
