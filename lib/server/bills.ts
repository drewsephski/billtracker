import "server-only";
import { and, eq, inArray, isNull } from "drizzle-orm";
import {
  bills,
  households,
  members,
  payments,
  splits,
  templates,
  templateSplits,
} from "@/lib/db/schema";
import type { Transaction } from "@/lib/db";
import {
  canEditBill,
  canManageShare,
  DomainError,
  equalSplit,
  monthDate,
  nextMonth,
  parseMoney,
  todayInZone,
  validateCustomSplit,
} from "@/lib/domain/bills";
import { billSchema, idSchema } from "@/lib/domain/validation";
import { inHousehold, requireOwner } from "./households";
import type { Identity } from "./auth";
async function allocationsFor(
  tx: Transaction,
  householdId: string,
  value: ReturnType<typeof billSchema.parse>,
) {
  const selected = await tx
    .select({ id: members.id })
    .from(members)
    .where(
      and(
        eq(members.householdId, householdId),
        inArray(members.id, value.memberIds),
      ),
    );
  if (selected.length !== value.memberIds.length)
    throw new DomainError("Choose roommates from this household only.");
  return value.splitMode === "equal"
    ? equalSplit(value.amount, value.memberIds)
    : validateCustomSplit(
        value.amount,
        value.memberIds.map((memberId) => ({
          memberId,
          amountCents: parseMoney(value.customAmounts[memberId] || "0"),
        })),
      );
}
export async function saveBill(
  user: Identity,
  householdId: string,
  input: unknown,
  edit?: { id: string; version: number },
) {
  const value = billSchema.parse(input);
  if (edit) idSchema.parse(edit.id);
  return inHousehold(user, householdId, async (tx, actor) => {
    const allocations = await allocationsFor(tx, householdId, value);
    if (edit) {
      const [bill] = await tx
        .select()
        .from(bills)
        .where(and(eq(bills.householdId, householdId), eq(bills.id, edit.id)))
        .for("update");
      if (!bill) throw new DomainError("Bill not found.");
      const history = await tx
        .select({ id: payments.id })
        .from(payments)
        .innerJoin(splits, eq(payments.splitId, splits.id))
        .where(
          and(
            eq(payments.householdId, householdId),
            eq(splits.billId, bill.id),
          ),
        )
        .limit(1);
      if (!canEditBill(actor.role, user.id, bill.createdBy, history.length > 0))
        throw new DomainError(
          "Only the owner or bill creator can edit bills without payment history.",
        );
      if (bill.version !== edit.version)
        throw new DomainError(
          "This bill changed. Refresh before editing again.",
        );
      await tx
        .update(bills)
        .set({
          name: value.name,
          category: value.category,
          amountCents: value.amount,
          dueDate: value.dueDate,
          notes: value.notes,
          version: bill.version + 1,
        })
        .where(and(eq(bills.householdId, householdId), eq(bills.id, bill.id)));
      await tx
        .delete(splits)
        .where(
          and(eq(splits.householdId, householdId), eq(splits.billId, bill.id)),
        );
      await tx
        .insert(splits)
        .values(
          allocations.map((a) => ({ ...a, householdId, billId: bill.id })),
        );
      return bill.id;
    }
    let templateId: string | null = null;
    if (value.recurring) {
      const [template] = await tx
        .insert(templates)
        .values({
          householdId,
          name: value.name,
          category: value.category,
          amountCents: value.amount,
          dayOfMonth: Number(value.dueDate.slice(-2)),
          nextDueDate: nextMonth(
            value.dueDate,
            Number(value.dueDate.slice(-2)),
          ),
          splitMode: value.splitMode,
          createdBy: user.id,
        })
        .returning();
      templateId = template.id;
      await tx.insert(templateSplits).values(
        allocations.map((a) => ({
          ...a,
          householdId,
          templateId: template.id,
        })),
      );
    }
    const [bill] = await tx
      .insert(bills)
      .values({
        householdId,
        name: value.name,
        category: value.category,
        amountCents: value.amount,
        dueDate: value.dueDate,
        notes: value.notes,
        createdBy: user.id,
        templateId,
        period: templateId ? value.dueDate.slice(0, 7) : null,
      })
      .returning();
    await tx
      .insert(splits)
      .values(allocations.map((a) => ({ ...a, householdId, billId: bill.id })));
    return bill.id;
  });
}
export async function recordPayment(
  user: Identity,
  householdId: string,
  billId: string,
  splitId: string,
  undoPaymentId?: string,
) {
  idSchema.parse(billId);
  idSchema.parse(splitId);
  if (undoPaymentId) idSchema.parse(undoPaymentId);
  return inHousehold(user, householdId, async (tx, actor) => {
    // Same bill lock as editing: a payment can never race a financial edit.
    const [bill] = await tx
      .select()
      .from(bills)
      .where(and(eq(bills.id, billId), eq(bills.householdId, householdId)))
      .for("update");
    if (!bill) throw new DomainError("Bill not found.");
    const [share] = await tx
      .select()
      .from(splits)
      .where(
        and(
          eq(splits.id, splitId),
          eq(splits.billId, billId),
          eq(splits.householdId, householdId),
        ),
      );
    if (!share || !canManageShare(actor.role, actor.id, share.memberId))
      throw new DomainError("You can only update your own share.");
    if (undoPaymentId) {
      await tx
        .update(payments)
        .set({ reversedAt: new Date(), reversedBy: user.id })
        .where(
          and(
            eq(payments.id, undoPaymentId),
            eq(payments.splitId, splitId),
            eq(payments.householdId, householdId),
            isNull(payments.reversedAt),
          ),
        );
    } else if (share.amountCents > 0) {
      await tx
        .insert(payments)
        .values({
          householdId,
          splitId,
          amountCents: share.amountCents,
          recordedBy: user.id,
        })
        .onConflictDoNothing();
    }
  });
}
export async function updateTemplate(
  user: Identity,
  householdId: string,
  id: string,
  version: number,
  input: unknown,
  active: boolean,
) {
  idSchema.parse(id);
  const value = billSchema.parse(input);
  return inHousehold(user, householdId, async (tx, actor) => {
    requireOwner(actor);
    const [template] = await tx
      .select()
      .from(templates)
      .where(and(eq(templates.id, id), eq(templates.householdId, householdId)))
      .for("update");
    if (!template || template.version !== version)
      throw new DomainError(
        "This recurring bill changed. Refresh and try again.",
      );
    const allocations = await allocationsFor(tx, householdId, value);
    // Preserve the next ungenerated period; changing the day never reopens old periods.
    const dayOfMonth = Number(value.dueDate.slice(-2));
    let nextDueDate = monthDate(template.nextDueDate.slice(0, 7), dayOfMonth);
    if (active && !template.active) {
      const [household] = await tx
        .select()
        .from(households)
        .where(eq(households.id, householdId));
      const today = todayInZone(household.timeZone);
      if (nextDueDate < today) {
        nextDueDate = monthDate(today.slice(0, 7), dayOfMonth);
        if (nextDueDate < today)
          nextDueDate = nextMonth(nextDueDate, dayOfMonth);
      }
    }
    await tx
      .update(templates)
      .set({
        name: value.name,
        category: value.category,
        amountCents: value.amount,
        dayOfMonth,
        nextDueDate,
        splitMode: value.splitMode,
        active,
        version: version + 1,
      })
      .where(and(eq(templates.householdId, householdId), eq(templates.id, id)));
    await tx
      .delete(templateSplits)
      .where(
        and(
          eq(templateSplits.householdId, householdId),
          eq(templateSplits.templateId, id),
        ),
      );
    await tx
      .insert(templateSplits)
      .values(allocations.map((a) => ({ ...a, householdId, templateId: id })));
  });
}
