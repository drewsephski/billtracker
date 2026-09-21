import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { interpretActivity } from "@/lib/server/activity-interpreter";
import { activityError, activityBody } from "@/lib/server/activity-http";
const output = {
  intent: "contribution",
  payer: "I",
  amount: "50.01",
  bill: "electric",
  category: "Electricity",
  total: null,
  dueDate: null,
  period: null,
  household: null,
  incomplete: false,
};
const input = {
  text: "I paid $50.01 toward electric",
  history: [],
  householdName: "Maple home",
  today: "2026-09-21",
};
describe("OpenRouter structured-output boundary (stubbed HTTP, real AI SDK)", () => {
  beforeEach(() => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-only");
    vi.stubEnv("OPENROUTER_MODEL", "test/model");
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });
  function stub(content: string) {
    return vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response([
        `data: ${JSON.stringify({ id: "test", choices: [{ index: 0, delta: { content }, finish_reason: null }] })}\n\n`,
        `data: ${JSON.stringify({ id: "test", choices: [{ index: 0, delta: {}, finish_reason: "stop" }] })}\n\n`,
        "data: [DONE]\n\n",
      ].join(""), { headers: { "Content-Type": "text/event-stream" } }),
    );
  }
  it("uses the configured model and current SDK structured output without mutation tools", async () => {
    const fetch = stub(JSON.stringify({ summary: "**Review** this contribution.", activity: output }));
    expect(await interpretActivity(input)).toEqual(output);
    const body = JSON.parse(fetch.mock.calls[0][1]!.body as string);
    expect(body.model).toBe("test/model");
    expect(body.tools).toBeUndefined();
    expect(body.response_format.type).toBe("json_schema");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("caps history and removes emails/IDs from user context", async () => {
    const fetch = stub(JSON.stringify({ summary: "**Review** this contribution.", activity: output }));
    await interpretActivity({
      ...input,
      text: "email me@example.com 12345678-1234-4234-8234-123456789012",
      history: Array.from({ length: 20 }, (_, i) => `message ${i}`),
    });
    const body = JSON.parse(fetch.mock.calls[0][1]!.body as string);
    const prompt = JSON.parse(body.messages.at(-1).content);
    expect(prompt.recentUserMessages).toHaveLength(5);
    expect(prompt.message).not.toContain("me@example.com");
    expect(prompt.message).not.toContain("12345678");
    expect(Object.keys(prompt).sort()).toEqual([
      "currentHousehold",
      "message",
      "previous",
      "recentUserMessages",
      "sources",
      "today",
    ]);
  });
  it.each([
    "not JSON",
    JSON.stringify({ ...output, amount: 50 }),
    JSON.stringify({ ...output, memberId: "invented" }),
  ])("rejects invalid model output", async (content) => {
    stub(content.startsWith("{") ? JSON.stringify({ summary: "Draft", activity: JSON.parse(content) }) : content);
    await expect(interpretActivity(input)).rejects.toThrow();
  });
  it("returns a recoverable provider failure without leaking provider details or retrying", async () => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        Response.json(
          { error: { message: "sensitive provider detail" } },
          { status: 503 },
        ),
      );
    let message = "";
    try {
      await interpretActivity(input);
    } catch (error) {
      message = activityError(error);
    }
    expect(message).toContain("temporarily unavailable");
    expect(message).not.toContain("sensitive");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("does not send requests when configuration is missing", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "");
    const fetch = vi.spyOn(globalThis, "fetch");
    await expect(interpretActivity(input)).rejects.toThrow("not configured");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects cross-origin and oversized payloads before provider calls", async () => {
    await expect(
      activityBody(
        new Request("https://home.test/api/activity", {
          method: "POST",
          headers: {
            origin: "https://evil.test",
            "Content-Type": "application/json",
          },
          body: "{}",
        }),
      ),
    ).rejects.toThrow("from Homeshare");
    await expect(
      activityBody(
        new Request("https://home.test/api/activity", {
          method: "POST",
          headers: {
            origin: "https://home.test",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ text: "a".repeat(50_000) }),
        }),
      ),
    ).rejects.toThrow("too long");
  });
});
