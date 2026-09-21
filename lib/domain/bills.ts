export class DomainError extends Error {}
export const categories = [
  "Rent",
  "Electricity",
  "Internet",
  "Gas",
  "Water",
  "Household",
  "Other",
] as const;
export type Category = (typeof categories)[number];
export type Allocation = { memberId: string; amountCents: number };
export type BillStatus =
  "upcoming" | "unpaid" | "partially paid" | "paid" | "overdue";
export function parseMoney(value: string): number {
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(value.trim()))
    throw new DomainError("Enter an amount with up to two decimal places.");
  const [whole, fraction = ""] = value.trim().split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (cents > 100_000_000)
    throw new DomainError("The maximum bill amount is $1,000,000.");
  return cents;
}
export function money(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}
export function equalSplit(cents: number, memberIds: string[]): Allocation[] {
  if (
    !Number.isSafeInteger(cents) ||
    cents <= 0 ||
    !memberIds.length ||
    new Set(memberIds).size !== memberIds.length
  )
    throw new DomainError("Select unique roommates and a positive amount.");
  const sorted = [...memberIds].sort();
  return sorted.map((memberId, i) => ({
    memberId,
    amountCents:
      Math.floor(cents / sorted.length) + (i < cents % sorted.length ? 1 : 0),
  }));
}
export function validateCustomSplit(
  cents: number,
  allocations: Allocation[],
): Allocation[] {
  if (
    !Number.isSafeInteger(cents) ||
    cents <= 0 ||
    !allocations.length ||
    new Set(allocations.map((a) => a.memberId)).size !== allocations.length ||
    allocations.some(
      (a) => !Number.isSafeInteger(a.amountCents) || a.amountCents < 0,
    ) ||
    allocations.reduce((s, a) => s + a.amountCents, 0) !== cents
  )
    throw new DomainError("Roommates’ shares must add up to the bill total.");
  return allocations;
}
export function todayInZone(zone: string, now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
export function validDate(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    value >= "2000-01-01" &&
    value <= "2100-12-31" &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value
  );
}
export function monthDate(month: string, day: number): string {
  const [year, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(year, m, 0)).getUTCDate();
  return `${month}-${String(Math.min(day, last)).padStart(2, "0")}`;
}
export function nextMonth(date: string, anchorDay: number): string {
  const [year, month] = date.split("-").map(Number);
  const next = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 7);
  return monthDate(next, anchorDay);
}
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
}
export function dateLabel(date: string, withYear = false): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    ...(withYear ? ({ year: "numeric" } as const) : {}),
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
}
export function billStatus(
  total: number,
  paid: number,
  dueDate: string,
  today: string,
): BillStatus {
  if (paid >= total) return "paid";
  if (dueDate < today) return "overdue";
  if (paid > 0) return "partially paid";
  return dueDate > today ? "upcoming" : "unpaid";
}
export function occurrenceDates(
  nextDue: string,
  day: number,
  through: string,
  limit = 24,
): string[] {
  const result: string[] = [];
  for (
    let date = nextDue;
    date <= through && result.length < limit;
    date = nextMonth(date, day)
  )
    result.push(date);
  return result;
}
export function canEditBill(
  role: string,
  userId: string,
  creatorId: string,
  hasPaymentHistory: boolean,
) {
  return !hasPaymentHistory && (role === "owner" || userId === creatorId);
}
export function canManageShare(
  role: string,
  actorMemberId: string,
  shareMemberId: string,
) {
  return role === "owner" || actorMemberId === shareMemberId;
}
