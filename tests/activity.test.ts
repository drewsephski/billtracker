import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  activityIntentSchema,
  billCandidates,
  categoryAlias,
  contributionCents,
  memberCandidates,
  normalizeName,
  resolveActivity,
  type ActivityIntent,
} from "@/lib/domain/activity";
import { demoData } from "@/lib/demo";
import { prepareActivity, chooseActivity } from "@/lib/server/activity";
import { signActivity, verifyActivity } from "@/lib/server/activity-token";
import { redactActivityText } from "@/lib/server/activity-interpreter";
const intent = (overrides: Partial<ActivityIntent> = {}): ActivityIntent => ({
  intent: "contribution",
  payer: "I",
  amount: "10",
  bill: "Internet",
  category: "Internet",
  total: null,
  dueDate: null,
  period: null,
  household: null,
  incomplete: false,
  ...overrides,
});
const fixture = () => {
  const d = demoData();
  d.members[0].name = "Allie Smith";
  d.members[1].name = "Emma Jones";
  return d;
};
describe("deterministic activity resolution", () => {
  it("normalizes case/whitespace and matches full names, self, and unique first names", () => {
    const d = fixture();
    expect(normalizeName(" ALLIE  Smith ")).toBe("allie smith");
    for (const name of ["allie smith", "Allie", "me", "I"])
      expect(memberCandidates(name, d.members, d.viewer.id)).toEqual([
        d.members[0],
      ]);
    expect(memberCandidates("All", d.members, d.viewer.id)).toEqual([]);
  });
  it("never chooses between duplicate first names or duplicate full names", () => {
    const d = fixture();
    d.members[1].name = "Allie Jones";
    expect(memberCandidates("Allie", d.members, d.viewer.id)).toHaveLength(2);
    const r = resolveActivity(intent({ payer: "Allie" }), d);
    expect(r.kind).toBe("clarification");
    if (r.kind === "clarification")
      expect(r.choices?.map((c) => c.label)).toEqual([
        "Allie Smith",
        "Allie Jones",
      ]);
    d.members[1].name = "Allie Smith";
    expect(
      memberCandidates("Allie Smith", d.members, d.viewer.id),
    ).toHaveLength(2);
  });
  it.each(["electric", "electricity", "power", "the electric bill"])(
    "normalizes category alias %s",
    (name) => expect(categoryAlias(name)).toBe("Electricity"),
  );
  it.each(["wifi", "wi-fi", "internet"])(
    "normalizes internet alias %s",
    (name) => expect(categoryAlias(name)).toBe("Internet"),
  );
  it("resolves exact bill names first; requires explicit period for multiple instances", () => {
    const d = fixture();
    const b = d.bills.find((b) => b.category === "Internet")!;
    const next = { ...b, id: "second", dueDate: "2027-02-28" };
    b.dueDate = "2027-01-28";
    d.bills.push(next);
    expect(billCandidates(intent(), d.bills)).toHaveLength(2);
    expect(resolveActivity(intent(), d).kind).toBe("clarification");
    expect(billCandidates(intent({ period: "2027-02" }), d.bills)).toEqual([
      next,
    ]);
    expect(billCandidates(intent({ dueDate: "2027-01-28" }), d.bills)).toEqual([
      b,
    ]);
    next.name = "Fiber plan";
    expect(billCandidates(intent({ bill: "Fiber plan" }), d.bills)).toEqual([
      next,
    ]);
  });
  it.each(["0", "-1", "1.234", "abc", "1e2", "1,000", "$50", "1000001", "NaN"])(
    "rejects invalid explicit money %s",
    (amount) => {
      expect(() => contributionCents(amount)).toThrow();
      expect(resolveActivity(intent({ amount }), fixture()).kind).toBe(
        "clarification",
      );
    },
  );
  it("uses exact integer cents and rejects numeric structured money / model IDs", () => {
    expect(contributionCents("50.01")).toBe(5001);
    expect(
      activityIntentSchema.safeParse({ ...intent(), amount: 50.01 }).success,
    ).toBe(false);
    expect(
      activityIntentSchema.safeParse({ ...intent(), memberId: "invented" })
        .success,
    ).toBe(false);
  });
  it.each(["payer", "amount", "bill"] as const)(
    "clarifies missing %s",
    (field) =>
      expect(resolveActivity(intent({ [field]: null }), fixture()).kind).toBe(
        "clarification",
      ),
  );
  it("rejects unknown people, unauthorized other shares, missing historical splits, fully settled shares and overpayment", () => {
    const d = fixture();
    const cases = [
      intent({ payer: "Imaginary" }),
      intent({ amount: "999" }),
      intent({ bill: "Rent", category: "Rent" }),
    ];
    for (const i of cases)
      expect(resolveActivity(i, d).kind).toBe("clarification");
    d.viewer = d.members[1];
    expect(resolveActivity(intent({ payer: "Allie" }), d)).toMatchObject({
      message: expect.stringContaining("own share"),
    });
    d.viewer = d.members[0];
    const b = d.bills.find((b) => b.category === "Internet")!;
    b.splits = b.splits.filter((s) => s.memberId !== d.viewer.id);
    expect(resolveActivity(intent(), d)).toMatchObject({
      message: expect.stringContaining("does not have a share"),
    });
    expect(
      resolveActivity(
        intent({ bill: "Electricity", category: "Electricity" }),
        d,
      ),
    ).toMatchObject({
      message: expect.stringContaining("already fully settled"),
    });
  });
  it("does not infer a new bill total or date; shows deterministic equal splits", () => {
    const d = fixture();
    d.bills = [];
    expect(resolveActivity(intent(), d)).toMatchObject({
      message: expect.stringContaining("total bill amount and due date"),
    });
    expect(resolveActivity(intent({ total: "60.01" }), d)).toMatchObject({
      message: expect.stringContaining("due date"),
    });
    expect(resolveActivity(intent({ dueDate: "2027-01-31" }), d)).toMatchObject(
      { message: expect.stringContaining("total bill amount") },
    );
    const r = resolveActivity(
      intent({ total: "60.01", dueDate: "2027-01-31" }),
      d,
    );
    expect(r.kind).toBe("proposal");
    if (r.kind === "proposal")
      expect(r.proposal.allocations.map((a) => a.amountCents)).toEqual([
        2001, 2000, 2000,
      ]);
    expect(
      resolveActivity(
        intent({ amount: "21", total: "60.01", dueDate: "2027-01-31" }),
        d,
      ),
    ).toMatchObject({
      message: expect.stringContaining("Nothing was created"),
    });
  });
  it("never proposes a contribution when interpretation still reports uncertainty", () => {
    expect(
      resolveActivity(intent({ incomplete: true }), fixture()),
    ).toMatchObject({
      kind: "clarification",
      message: expect.stringContaining("Please clarify"),
    });
  });
  it("explains the required fields when a chat request is not an activity", () => {
    const result = resolveActivity(
      intent({ intent: "unsupported" }),
      fixture(),
    );
    expect(result).toMatchObject({
      kind: "clarification",
      message: expect.stringContaining("contribution amount"),
      guidance: {
        prompts: [
          { label: "Record a contribution" },
          { label: "Add a new bill" },
        ],
      },
    });
  });
  it("clarifies conflicting totals/dates and does not match unrelated Other bills", () => {
    const d = fixture();
    expect(resolveActivity(intent({ total: "99" }), d)).toMatchObject({
      message: expect.stringContaining("differs"),
    });
    expect(
      resolveActivity(intent({ dueDate: "2027-01-31", period: "2027-02" }), d),
    ).toMatchObject({ message: expect.stringContaining("disagree") });
    d.bills[0].category = "Other";
    expect(
      billCandidates(
        intent({ bill: "Brand new bill", category: "Other" }),
        d.bills,
      ),
    ).toEqual([]);
  });
  it("rejects multiple commands, provider payments and a different household", () => {
    expect(
      resolveActivity(intent({ intent: "multiple" }), fixture()),
    ).toMatchObject({
      message: expect.stringContaining("one financial activity"),
    });
    expect(
      resolveActivity(intent({ intent: "provider_payment" }), fixture()),
    ).toMatchObject({ message: expect.stringContaining("aren’t supported") });
    expect(
      resolveActivity(intent({ household: "Another home" }), fixture()),
    ).toMatchObject({ message: expect.stringContaining("switch") });
  });
});
describe("signed proposals", () => {
  beforeEach(() =>
    vi.stubEnv(
      "AI_PROPOSAL_SECRET",
      "test-only-secret-for-signing-32-characters",
    ),
  );
  it("binds user, household, expiry and all reviewed values", () => {
    const d = fixture();
    const user = {
      id: d.viewer.userId,
      name: d.viewer.name,
      email: d.viewer.email,
      emailVerified: true,
    };
    const reply = prepareActivity(user, d, intent(), [
      "I paid $10 toward Internet",
    ]);
    const token = reply.token!;
    expect(verifyActivity(token, user.id, d.household.id).resolution.kind).toBe(
      "proposal",
    );
    expect(() => verifyActivity(token, "other", d.household.id)).toThrow(
      "household changed",
    );
    expect(() => verifyActivity(token, user.id, "other-home")).toThrow(
      "household changed",
    );
    expect(() => verifyActivity(`x${token}`, user.id, d.household.id)).toThrow(
      "verified",
    );
    const context = verifyActivity(token, user.id, d.household.id);
    expect(() =>
      verifyActivity(
        signActivity({ ...context, expires: 0 }),
        user.id,
        d.household.id,
      ),
    ).toThrow("expired");
    expect(JSON.stringify(reply.proposal)).not.toContain(d.viewer.id);
  });
  it("resolves clicked ambiguity choices deterministically without another LLM call", () => {
    const d = fixture();
    d.members[1].name = "Allie Jones";
    const user = {
      id: d.viewer.userId,
      name: d.viewer.name,
      email: d.viewer.email,
      emailVerified: true,
    };
    const first = prepareActivity(user, d, intent({ payer: "Allie" }), []);
    const next = chooseActivity(user, d, first.token!, 1);
    expect(next.proposal?.payerName).toBe("Allie Jones");
    expect(() => chooseActivity(user, d, first.token!, 8)).toThrow(
      "no longer available",
    );
  });
  it("redacts emails and UUIDs before provider input", () =>
    expect(
      redactActivityText("me@example.com 12345678-1234-4234-8234-123456789012"),
    ).toBe("[email omitted] [ID omitted]"));
});
