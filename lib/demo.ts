import {
  billStatus,
  equalSplit,
  nextMonth,
  todayInZone,
  type Category,
} from "./domain/bills";
import type { HouseholdData, MemberView, BillView } from "./domain/types";
export function demoData(): HouseholdData {
  const today = todayInZone("America/Chicago");
  const id = (n: number) =>
    `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const members: MemberView[] = ["Sarah", "Emma", "Olivia"].map((name, i) => ({
    id: id(i + 1),
    userId: `demo-${name.toLowerCase()}`,
    name,
    email: `${name.toLowerCase()}@example.com`,
    role: i === 0 ? "owner" : "member",
  }));
  const offset = (n: number) =>
    new Date(Date.parse(`${today}T12:00:00Z`) + n * 86400000)
      .toISOString()
      .slice(0, 10);
  const specs: [string, Category, number, string, number][] = [
    ["Rent", "Rent", 240000, `${today.slice(0, 7)}-01`, 3],
    ["Electricity", "Electricity", 18642, offset(3), 2],
    ["Internet", "Internet", 7500, offset(7), 0],
    ["Gas", "Gas", 9240, offset(-4), 1],
  ];
  const bills: BillView[] = specs.map(
    ([name, category, amountCents, dueDate, paidCount], i) => {
      const splits = equalSplit(
        amountCents,
        members.map((m) => m.id),
      ).map((a, index) => ({
        ...a,
        id: id(100 + i * 10 + index),
        name: members[index].name,
        paidCents: index < paidCount ? a.amountCents : 0,
        paymentId: index < paidCount ? id(200 + i * 10 + index) : null,
      }));
      const paidCents = splits.reduce((s, a) => s + a.paidCents, 0);
      return {
        id: id(10 + i),
        householdId: id(9),
        name,
        category,
        amountCents,
        dueDate,
        notes:
          i === 1
            ? "This month’s electricity. Thanks for keeping on top of it!"
            : "",
        templateId: id(50 + i),
        createdBy: members[0].userId,
        version: 1,
        paidCents,
        status: billStatus(amountCents, paidCents, dueDate, today),
        hasPaymentHistory: paidCount > 0,
        splits,
      };
    },
  );
  return {
    household: {
      id: id(9),
      name: "Lake Street Apartment",
      timeZone: "America/Chicago",
    },
    viewer: members[0],
    members,
    today,
    bills,
    payments: bills
      .flatMap((b) =>
        b.splits
          .filter((s) => s.paymentId)
          .map((s) => ({
            id: s.paymentId!,
            splitId: s.id,
            amountCents: s.amountCents,
            recordedAt: `${offset(-1)}T16:00:00.000Z`,
            reversedAt: null,
            memberName: s.name,
            billName: b.name,
            billId: b.id,
            recordedByName: s.name,
          })),
      )
      .reverse(),
    templates: bills.map((b) => ({
      id: b.templateId!,
      name: b.name,
      category: b.category,
      amountCents: b.amountCents,
      dayOfMonth: Number(b.dueDate.slice(-2)),
      nextDueDate: nextMonth(b.dueDate, Number(b.dueDate.slice(-2))),
      active: true,
      version: 1,
      splitMode: "equal",
      allocations: b.splits.map((s) => ({
        memberId: s.memberId,
        amountCents: s.amountCents,
      })),
    })),
  };
}
