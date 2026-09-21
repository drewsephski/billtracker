import "server-only";
import { eq, desc, asc } from "drizzle-orm";
import {
  bills,
  households,
  members,
  payments,
  profiles,
  splits,
  templates,
  templateSplits,
} from "@/lib/db/schema";
import { billStatus, todayInZone, type Category } from "@/lib/domain/bills";
import type { HouseholdData } from "@/lib/domain/types";
import type { Identity } from "./auth";
import { inHousehold } from "./households";
export async function readHousehold(
  user: Identity,
  householdId: string,
): Promise<HouseholdData> {
  return inHousehold(
    user,
    householdId,
    async (tx, actor) => {
      const [household] = await tx
        .select()
        .from(households)
        .where(eq(households.id, householdId));
      const people = await tx
        .select({
          id: members.id,
          userId: members.userId,
          role: members.role,
          name: profiles.name,
          email: profiles.email,
        })
        .from(members)
        .innerJoin(profiles, eq(members.userId, profiles.id))
        .where(eq(members.householdId, householdId))
        .orderBy(asc(members.createdAt));
      const rows = await tx
        .select()
        .from(bills)
        .where(eq(bills.householdId, householdId))
        .orderBy(desc(bills.dueDate));
      const shares = await tx
        .select()
        .from(splits)
        .where(eq(splits.householdId, householdId));
      const records = await tx
        .select()
        .from(payments)
        .where(eq(payments.householdId, householdId))
        .orderBy(desc(payments.recordedAt));
      const rules = await tx
        .select()
        .from(templates)
        .where(eq(templates.householdId, householdId))
        .orderBy(asc(templates.nextDueDate));
      const allocations = await tx
        .select()
        .from(templateSplits)
        .where(eq(templateSplits.householdId, householdId));
      const today = todayInZone(household.timeZone);
      const memberMap = new Map(people.map((p) => [p.id, p]));
      const shareMap = new Map(shares.map((s) => [s.id, s]));
      const billMap = new Map(rows.map((b) => [b.id, b]));
      const peopleByUser = new Map(people.map((p) => [p.userId, p]));
      const sharesByBill = Map.groupBy(shares, (s) => s.billId);
      const allocationsByTemplate = Map.groupBy(
        allocations,
        (a) => a.templateId,
      );
      const activePaymentBySplit = new Map(
        records.filter((p) => !p.reversedAt).map((p) => [p.splitId, p]),
      );
      const billsWithHistory = new Set(
        records.map((p) => shareMap.get(p.splitId)!.billId),
      );
      return {
        household,
        today,
        members: people,
        viewer: people.find((p) => p.id === actor.id)!,
        bills: rows.map((bill) => {
          const billShares = (sharesByBill.get(bill.id) || []).map((share) => {
            const payment = activePaymentBySplit.get(share.id);
            return {
              ...share,
              name: memberMap.get(share.memberId)!.name,
              paidCents: payment?.amountCents || 0,
              paymentId: payment?.id || null,
            };
          });
          const paidCents = billShares.reduce((sum, s) => sum + s.paidCents, 0);
          return {
            ...bill,
            category: bill.category as Category,
            paidCents,
            status: billStatus(
              bill.amountCents,
              paidCents,
              bill.dueDate,
              today,
            ),
            splits: billShares,
            hasPaymentHistory: billsWithHistory.has(bill.id),
          };
        }),
        payments: records.map((p) => {
          const share = shareMap.get(p.splitId)!;
          const bill = billMap.get(share.billId)!;
          return {
            ...p,
            recordedAt: p.recordedAt.toISOString(),
            reversedAt: p.reversedAt?.toISOString() || null,
            memberName: memberMap.get(share.memberId)!.name,
            billName: bill.name,
            billId: bill.id,
            recordedByName: peopleByUser.get(p.recordedBy)?.name || "Roommate",
          };
        }),
        templates: rules.map((t) => ({
          ...t,
          category: t.category as Category,
          allocations: (allocationsByTemplate.get(t.id) || []).map((a) => ({
            memberId: a.memberId,
            amountCents: a.amountCents,
          })),
        })),
      };
    },
    { snapshot: true },
  );
}
