import "server-only";
import { and, eq, lte, min } from "drizzle-orm";
import { getDb, type Transaction } from "@/lib/db";
import {
  bills,
  households,
  splits,
  templates,
  templateSplits,
} from "@/lib/db/schema";
import {
  nextMonth,
  occurrenceDates,
  todayInZone,
  validateCustomSplit,
} from "@/lib/domain/bills";
import { inHousehold } from "./households";
import type { Identity } from "./auth";
export async function generateInTransaction(
  tx: Transaction,
  householdId: string,
  through: string,
) {
  const rules = await tx
    .select()
    .from(templates)
    .where(
      and(
        eq(templates.householdId, householdId),
        eq(templates.active, true),
        lte(templates.nextDueDate, through),
      ),
    )
    .orderBy(templates.id)
    .for("update");
  let generated = 0;
  for (const rule of rules) {
    const allocations = await tx
      .select({
        memberId: templateSplits.memberId,
        amountCents: templateSplits.amountCents,
      })
      .from(templateSplits)
      .where(
        and(
          eq(templateSplits.householdId, householdId),
          eq(templateSplits.templateId, rule.id),
        ),
      );
    validateCustomSplit(rule.amountCents, allocations);
    const dates = occurrenceDates(rule.nextDueDate, rule.dayOfMonth, through);
    for (const dueDate of dates) {
      const [bill] = await tx
        .insert(bills)
        .values({
          householdId,
          templateId: rule.id,
          period: dueDate.slice(0, 7),
          name: rule.name,
          category: rule.category,
          amountCents: rule.amountCents,
          dueDate,
          createdBy: rule.createdBy,
        })
        .onConflictDoNothing({ target: [bills.templateId, bills.period] })
        .returning();
      if (bill) {
        await tx
          .insert(splits)
          .values(
            allocations.map((a) => ({ ...a, householdId, billId: bill.id })),
          );
        generated++;
      }
    }
    if (dates.length)
      await tx
        .update(templates)
        .set({
          nextDueDate: nextMonth(dates.at(-1)!, rule.dayOfMonth),
          version: rule.version + 1,
        })
        .where(
          and(
            eq(templates.id, rule.id),
            eq(templates.householdId, householdId),
          ),
        );
  }
  return generated;
}
export async function generateForUser(user: Identity, householdId: string) {
  return inHousehold(user, householdId, async (tx) => {
    const [household] = await tx
      .select()
      .from(households)
      .where(eq(households.id, householdId));
    const today = todayInZone(household.timeZone);
    return generateInTransaction(
      tx,
      householdId,
      nextMonth(today, Number(today.slice(-2))),
    );
  });
}
// System job only. The route authenticates CRON_SECRET before this function is called.
export async function generateScheduled() {
  const due = await getDb()
    .select({ id: households.id, timeZone: households.timeZone })
    .from(households)
    .innerJoin(templates, eq(templates.householdId, households.id))
    .where(
      and(
        eq(templates.active, true),
        lte(templates.nextDueDate, nextMonth(todayInZone("UTC"), 31)),
      ),
    )
    .groupBy(households.id, households.timeZone)
    .orderBy(min(templates.nextDueDate))
    .limit(100);
  let generated = 0;
  for (const household of due) {
    const today = todayInZone(household.timeZone);
    generated += await getDb().transaction((tx) =>
      generateInTransaction(
        tx,
        household.id,
        nextMonth(today, Number(today.slice(-2))),
      ),
    );
  }
  return generated;
}
