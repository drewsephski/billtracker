import { describe, expect, it, vi, afterEach } from "vitest";
import { randomUUID } from "node:crypto";
import { demoData } from "@/lib/demo";
import {
  activityPromptCandidates,
  renderActivityPrompt,
  promptPlaceholder,
  draftDollars,
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
      expect(prompt.text).toContain(candidate.dueDate);
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
    expect(drafts[0].text).toContain("$[total], due [YYYY-MM-DD]");
  });
  it("guides new-bill details without guessing a total or date", () => {
    const data = demoData();
    data.bills = [];
    const result = resolveActivity(base, data);
    expect(result.kind).toBe("clarification");
    if (result.kind !== "clarification") return;
    expect(result.guidance?.prompts[0].text).toBe(
      "The total is $[total], due [YYYY-MM-DD].",
    );
    const dateOnly = resolveActivity({ ...base, total: "90" }, data);
    if (dateOnly.kind === "clarification")
      expect(dateOnly.guidance?.prompts[0].text).toBe(
        "The due date is [YYYY-MM-DD].",
      );
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
