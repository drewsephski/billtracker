import { describe, expect, it } from "vitest";
import {
  billStatus,
  canEditBill,
  canManageShare,
  daysBetween,
  equalSplit,
  nextMonth,
  occurrenceDates,
  parseMoney,
  todayInZone,
  validDate,
  validateCustomSplit,
} from "@/lib/domain/bills";
import { billSchema } from "@/lib/domain/validation";
describe("exact currency and splitting", () => {
  it.each([
    ["186.42", 18642],
    ["0.29", 29],
    ["1.1", 110],
    ["1000000", 100000000],
  ])("parses %s exactly", (amount, cents) =>
    expect(parseMoney(amount)).toBe(cents),
  );
  it.each(["-1", "1.005", "1e3", "NaN", "", "1,000", "1000001"])(
    "rejects %s",
    (amount) => expect(() => parseMoney(amount)).toThrow(),
  );
  it("splits $186.42 three ways", () =>
    expect(
      equalSplit(18642, ["c", "a", "b"]).map((s) => s.amountCents),
    ).toEqual([6214, 6214, 6214]));
  it("distributes leftover cents deterministically, independent of input order", () =>
    expect(equalSplit(100, ["c", "b", "a"])).toEqual([
      { memberId: "a", amountCents: 34 },
      { memberId: "b", amountCents: 33 },
      { memberId: "c", amountCents: 33 },
    ]));
  it("conserves every cent including amounts smaller than the group", () => {
    for (let total = 1; total < 1000; total++) {
      const shares = equalSplit(total, ["a", "b", "c", "d", "e", "f", "g"]);
      expect(shares.reduce((s, a) => s + a.amountCents, 0)).toBe(total);
      expect(
        Math.max(...shares.map((s) => s.amountCents)) -
          Math.min(...shares.map((s) => s.amountCents)),
      ).toBeLessThanOrEqual(1);
    }
  });
  it("rejects duplicates and empty groups", () => {
    expect(() => equalSplit(100, [])).toThrow();
    expect(() => equalSplit(100, ["a", "a"])).toThrow();
  });
  it("validates exact custom allocations", () => {
    expect(
      validateCustomSplit(100, [
        { memberId: "a", amountCents: 20 },
        { memberId: "b", amountCents: 80 },
      ]),
    ).toHaveLength(2);
    expect(() =>
      validateCustomSplit(100, [{ memberId: "a", amountCents: 99 }]),
    ).toThrow();
    expect(() =>
      validateCustomSplit(100, [
        { memberId: "a", amountCents: -1 },
        { memberId: "b", amountCents: 101 },
      ]),
    ).toThrow();
  });
});
describe("dates, status and recurrence", () => {
  it.each([
    [100, "2026-10-01", "paid"],
    [25, "2026-10-01", "overdue"],
    [0, "2026-10-01", "overdue"],
    [25, "2026-10-10", "partially paid"],
    [0, "2026-10-05", "unpaid"],
    [0, "2026-10-10", "upcoming"],
  ] as const)("derives %s paid / %s as %s", (paid, due, status) =>
    expect(billStatus(100, paid, due, "2026-10-05")).toBe(status),
  );
  it("respects household midnight", () => {
    const now = new Date("2026-10-06T02:00:00Z");
    expect(todayInZone("America/Chicago", now)).toBe("2026-10-05");
    expect(todayInZone("Asia/Tokyo", now)).toBe("2026-10-06");
  });
  it("handles leap years and preserves anchor day", () => {
    expect(nextMonth("2028-01-31", 31)).toBe("2028-02-29");
    expect(nextMonth("2028-02-29", 31)).toBe("2028-03-31");
    expect(nextMonth("2026-12-31", 31)).toBe("2027-01-31");
  });
  it("uses calendar dates across DST", () =>
    expect(daysBetween("2026-03-07", "2026-03-09")).toBe(2));
  it("rejects rolled-over dates", () => {
    expect(validDate("2026-02-30")).toBe(false);
    expect(validDate("2028-02-29")).toBe(true);
  });
  it("plans bounded catch-up and becomes empty after advancing cursor", () => {
    const dates = occurrenceDates("2026-01-31", 31, "2026-04-30");
    expect(dates).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
    ]);
    expect(
      occurrenceDates(nextMonth(dates.at(-1)!, 31), 31, "2026-04-30"),
    ).toEqual([]);
    expect(occurrenceDates("2020-01-01", 1, "2026-01-01")).toHaveLength(24);
  });
});
describe("permissions", () => {
  it("permits personal payment or household owner only", () => {
    expect(canManageShare("member", "a", "b")).toBe(false);
    expect(canManageShare("member", "a", "a")).toBe(true);
    expect(canManageShare("owner", "a", "b")).toBe(true);
  });
  it("locks history even for owner", () => {
    expect(canEditBill("owner", "a", "b", true)).toBe(false);
    expect(canEditBill("member", "a", "b", false)).toBe(false);
    expect(canEditBill("member", "a", "a", false)).toBe(true);
  });
  it("rejects unvalidated external input", () =>
    expect(
      billSchema.safeParse({
        amount: "1e10",
        name: "",
        dueDate: "bad",
        memberIds: ["untrusted"],
      }).success,
    ).toBe(false));
});
