import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { bills, households, members, payments, splits } from "@/lib/db/schema";
import { canManageShare, DomainError, money } from "@/lib/domain/bills";
import {
  activityIntentSchema,
  resolveActivity,
  type ActivityReply,
  type ActivityResolution,
  type ActivitySelection,
} from "@/lib/domain/activity";
import { billSchema } from "@/lib/domain/validation";
import type { HouseholdData } from "@/lib/domain/types";
import type { Identity } from "./auth";
import { inHousehold } from "./households";
import { readHouseholdInTransaction } from "./queries";
import { createBillInTransaction, recordPaymentInTransaction } from "./bills";
import {
  signActivity,
  verifyActivity,
  type ActivityContext,
} from "./activity-token";

export function activityReply(
  context: ActivityContext,
  notice?: string,
): ActivityReply {
  const r = context.resolution;
  const token = signActivity(context);
  if (r.kind === "clarification")
    return {
      kind: r.kind,
      message: notice ? `${notice} ${r.message}` : r.message,
      choices: r.choices?.map((c) => c.label),
      guidance: r.guidance,
      token,
    };
  const p = r.proposal;
  return {
    kind: "proposal",
    message:
      notice ?? "Review this roommate share contribution before recording it.",
    token,
    proposal: {
      kind: p.kind,
      payerName: p.payerName,
      amountCents: p.amountCents,
      name: p.name,
      category: p.category,
      totalCents: p.totalCents,
      dueDate: p.dueDate,
      shareCents: p.shareCents,
      paidCents: p.paidCents,
      remainingCents: p.remainingCents,
      allocations: p.allocations.map((a) => ({
        name: a.name,
        amountCents: a.amountCents,
      })),
    },
  };
}
export function prepareActivity(
  user: Identity,
  data: HouseholdData,
  raw: unknown,
  history: string[],
  selection: ActivitySelection = {},
): ActivityReply {
  const intent = activityIntentSchema.parse(raw);
  return activityReply({
    userId: user.id,
    householdId: data.household.id,
    commandId: randomUUID(),
    expires: Date.now() + 15 * 60_000,
    intent,
    selection,
    resolution: resolveActivity(intent, data, selection),
    history: history.slice(-6),
  });
}
export function chooseActivity(
  user: Identity,
  data: HouseholdData,
  token: string,
  index: number,
) {
  const context = verifyActivity(token, user.id, data.household.id);
  if (context.resolution.kind !== "clarification")
    throw new DomainError("Please start this activity again.");
  const choice = context.resolution.choices?.[index];
  if (!choice) throw new DomainError("That choice is no longer available.");
  return prepareActivity(
    user,
    data,
    context.intent,
    context.history,
    choice.selection,
  );
}
function refreshed(context: ActivityContext, resolution: ActivityResolution) {
  return activityReply(
    { ...context, resolution, expires: Date.now() + 15 * 60_000 },
    "That bill or household changed since I prepared this. I’ve refreshed the details; please review and confirm again.",
  );
}
export async function confirmActivity(
  user: Identity,
  activeHouseholdId: string,
  token: string,
): Promise<ActivityReply> {
  const context = verifyActivity(token, user.id, activeHouseholdId, {
    allowExpired: true,
  });
  if (context.resolution.kind !== "proposal")
    throw new DomainError("There is no contribution ready to confirm.");
  const expected = context.resolution.proposal;
  return inHousehold(user, activeHouseholdId, async (tx, actor) => {
    // Serialize retries BEFORE creating anything. The ledger unique index is a
    // second backstop; rollback includes a newly created bill and its splits.
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${context.commandId}, 0))`,
    );
    const [previous] = await tx
      .select({ payment: payments, share: splits })
      .from(payments)
      .innerJoin(
        splits,
        and(
          eq(splits.id, payments.splitId),
          eq(splits.householdId, payments.householdId),
        ),
      )
      .where(
        and(
          eq(payments.sourceCommandId, context.commandId),
          eq(payments.householdId, activeHouseholdId),
        ),
      );
    if (previous) {
      if (
        previous.payment.recordedBy !== user.id ||
        !canManageShare(actor.role, actor.id, previous.share.memberId)
      )
        throw new DomainError("You can only update your own share.");
      return {
        kind: "success",
        message: `This previously confirmed activity was already recorded.${previous.payment.reversedAt ? " Its contribution has since been reversed." : ""}`,
        billUrl: `/bills/${previous.share.billId}`,
      };
    }
    if (context.expires < Date.now())
      throw new DomainError(
        "This proposal expired. Check the bill history before starting this activity again.",
      );
    // Same order as invitations. Blocks membership insertion while snapshotting
    // all current members; share locks also block removal/role changes.
    await tx
      .select()
      .from(households)
      .where(eq(households.id, activeHouseholdId))
      .for("update");
    await tx
      .select()
      .from(members)
      .where(eq(members.householdId, activeHouseholdId))
      .for("share");
    if (expected.billId) {
      const [bill] = await tx
        .select()
        .from(bills)
        .where(
          and(
            eq(bills.id, expected.billId),
            eq(bills.householdId, activeHouseholdId),
          ),
        )
        .for("update");
      if (!bill)
        throw new DomainError(
          "That bill is no longer available. Nothing was recorded.",
        );
    }
    const data = await readHouseholdInTransaction(
      tx,
      activeHouseholdId,
      actor.id,
    );
    const selection = {
      memberId: expected.memberId,
      ...(expected.billId ? { billId: expected.billId } : {}),
    };
    const current = resolveActivity(context.intent, data, selection);
    if (
      current.kind !== "proposal" ||
      JSON.stringify(current.proposal) !== JSON.stringify(expected)
    )
      return refreshed(context, current);
    const proposal = current.proposal;
    let billId = proposal.billId;
    let splitId = proposal.splitId;
    if (proposal.kind === "new") {
      const value = billSchema.parse({
        name: proposal.name,
        category: proposal.category,
        amount: context.intent.total,
        dueDate: proposal.dueDate,
        splitMode: "equal",
        memberIds: proposal.allocations.map((a) => a.memberId),
        recurring: false,
      });
      billId = await createBillInTransaction(
        tx,
        user,
        activeHouseholdId,
        value,
        proposal.allocations,
      );
      const [share] = await tx
        .select()
        .from(splits)
        .where(
          and(
            eq(splits.householdId, activeHouseholdId),
            eq(splits.billId, billId),
            eq(splits.memberId, proposal.memberId),
          ),
        );
      splitId = share.id;
    }
    if (!billId || !splitId)
      throw new DomainError("The bill could not be resolved.");
    await recordPaymentInTransaction(
      tx,
      user,
      activeHouseholdId,
      actor,
      billId,
      splitId,
      {
        amountCents: proposal.amountCents,
        sourceCommandId: context.commandId,
        sourceCreatedBill: proposal.kind === "new",
      },
    );
    return {
      kind: "success",
      message:
        proposal.kind === "new"
          ? `Created ${proposal.name} for ${money(proposal.totalCents)} due ${proposal.dueDate}, split it across ${proposal.allocations.length} roommates, and recorded ${proposal.payerName}’s ${money(proposal.amountCents)} contribution.`
          : `Updated ${proposal.name}. Recorded ${money(proposal.amountCents)} from ${proposal.payerName}. They have ${money(proposal.remainingCents)} left on their share.`,
      billUrl: `/bills/${billId}`,
    };
  });
}
