import { describe, expect, it, vi, afterEach } from "vitest";
import { dateLabel } from "@/lib/domain/bills";
import { randomUUID } from "node:crypto";
import { demoData } from "@/lib/demo";
import {
  activityPromptCandidates,
  renderActivityPrompt,
  promptPlaceholder,
  draftDollars,
  draftPlaceholders,
  replaceDraftPlaceholder,
} from "@/lib/domain/activity-prompts";
import { activitySuggestions } from "@/lib/server/activity-suggestions";
import { resolveActivity, type ActivityIntent } from "@/lib/domain/activity";
const base: ActivityIntent = {
  intent: "contribution",
  payer: "I",
  amount: "10",
  bill: "Water",
  category: "Water",
  total: null,
  dueDate: null,
  period: null,
  household: null,
  incomplete: false,
};
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
describe("household-aware prompt drafts", () => {
  it("keeps large draft amounts parseable without grouping commas", () => {
    expect(draftDollars(123456)).toBe("$1234.56");
  });
  it("uses exact remaining amounts and explicit dates, never settled or unauthorized shares", () => {
    const data = demoData();
    data.viewer.role = "member";
    const candidates = activityPromptCandidates(data);
    expect(
      candidates
        .filter((c) => c.kind === "existing")
        .every((c) => c.payer === "I"),
    ).toBe(true);
    for (const candidate of candidates.filter((c) => c.kind === "existing")) {
      const prompt = renderActivityPrompt(candidate, "paid");
      expect(prompt.text).toContain(dateLabel(candidate.dueDate!, true));
      expect(prompt.text).toContain(candidate.amount);
    }
    for (const bill of data.bills) bill.paidCents = bill.amountCents;
    expect(activityPromptCandidates(data).every((c) => c.kind === "new")).toBe(
      true,
    );
  });
  it("offers three unique setup drafts with placeholders for an empty household", () => {
    const data = demoData();
    data.bills = [];
    const drafts = activityPromptCandidates(data).map((c) =>
      renderActivityPrompt(c, "paid"),
    );
    expect(drafts).toHaveLength(3);
    expect(new Set(drafts.map((d) => d.text)).size).toBe(3);
    for (const draft of drafts)
      expect(promptPlaceholder.test(draft.text)).toBe(true);
    expect(drafts[0].text).toContain("$[total], due [due date]");
  });
  it("guides new-bill details without guessing a total or date", () => {
    const data = demoData();
    data.bills = [];
    const result = resolveActivity(base, data);
    expect(result.kind).toBe("clarification");
    if (result.kind !== "clarification") return;
    expect(result.guidance?.prompts[0].text).toBe(
      "The total is $[total], due [due date].",
    );
    const dateOnly = resolveActivity({ ...base, total: "90" }, data);
    if (dateOnly.kind === "clarification")
      expect(dateOnly.guidance?.prompts[0].text).toBe(
        "The due date is [due date].",
      );
  });
  it("offers bill follow-ups only for the named person's unpaid shares", () => {
    const data = demoData();
    const result = resolveActivity({ ...base, bill: null }, data);
    expect(result.kind).toBe("clarification");
    if (result.kind !== "clarification") return;
    for (const prompt of result.guidance?.prompts ?? []) {
      const bill = data.bills.find((b) => prompt.text.includes(b.name))!;
      expect(
        bill.splits.some(
          (s) => s.memberId === data.viewer.id && s.paidCents < s.amountCents,
        ),
      ).toBe(true);
      expect(prompt.text).toContain(dateLabel(bill.dueDate, true));
    }
    const unknown = resolveActivity(
      { ...base, bill: null, payer: "Unknown" },
      data,
    );
    if (unknown.kind === "clarification")
      expect(unknown.guidance?.prompts).toEqual([]);
  });
  it("uses Luna's structured choices, excludes identity metadata, and coalesces identical requests", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    vi.stubEnv("OPENROUTER_MODEL", "openai/gpt-5.6-luna");
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        id: "test",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: JSON.stringify({
                suggestions: [
                  { candidate: 2, style: "put" },
                  { candidate: 0, style: "paid" },
                  { candidate: 1, style: "contributed" },
                ],
              }),
            },
            finish_reason: "stop",
          },
        ],
      }),
    );
    const data = demoData();
    data.household.id = randomUUID();
    const [first, second] = await Promise.all([
      activitySuggestions(data),
      activitySuggestions(data),
    ]);
    expect(first).toHaveLength(3);
    expect(second).toEqual(first);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(first[0].text).toContain(" put ");
    const body = JSON.parse(fetch.mock.calls[0][1]!.body as string);
    expect(body.model).toBe("openai/gpt-5.6-luna");
    expect(body.tools).toBeUndefined();
    expect(body.messages.at(-1).content).not.toContain(data.viewer.userId);
    expect(body.messages.at(-1).content).not.toContain(data.viewer.email);
    expect(body.messages.at(-1).content).not.toContain(data.household.id);
  });
  it("falls back to safe current-household drafts after provider failure", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    vi.stubEnv("OPENROUTER_MODEL", "test-model");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ error: { message: "unavailable" } }, { status: 503 }),
    );
    const data = demoData();
    data.household.id = randomUUID();
    data.bills = [];
    const result = await activitySuggestions(data);
    expect(result).toHaveLength(3);
    expect(result.every((p) => p.text.includes("[total]"))).toBe(true);
  });
});

describe("editable prompt placeholders", () => {
  it("replaces whole fields, preserves currency and surrounding text", () => {
    const text = "The total is $[total], due [due date].";
    const [total, date] = draftPlaceholders(text);
    expect(text.slice(total.start, total.end)).toBe("[total]");
    expect(
      replaceDraftPlaceholder(text, total.start, total.token, "90.00"),
    ).toBe("The total is $90.00, due [due date].");
    expect(
      replaceDraftPlaceholder(text, date.start, date.token, "Sep 28, 2027"),
    ).toBe("The total is $[total], due Sep 28, 2027.");
    expect(draftPlaceholders("Due [YYYY-MM-DD]")).toHaveLength(1);
  });
  it("does not overwrite manually changed text or treat unrelated brackets as fields", () => {
    expect(
      replaceDraftPlaceholder("The total is $95.", 14, "[total]", "90"),
    ).toBe("The total is $95.");
    expect(draftPlaceholders("Read [Source 1] and [notes]")).toEqual([]);
  });
});
