import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  chatSendSchema,
  directlyAddressesHomeshare,
  mergeChatMessages,
  nearChatBottom,
  type ChatMessage,
} from "@/lib/domain/chat";
import { demoData } from "@/lib/demo";
const generate = vi.hoisted(() => vi.fn());
vi.mock("ai", () => ({
  generateText: generate,
  Output: { object: (v: unknown) => v },
  stepCountIs: vi.fn(),
}));
import { answerChat, chatSnapshot, triageChat } from "@/lib/server/chat-ai";
import { publicReply } from "@/lib/server/chat";
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("OPENROUTER_API_KEY", "sk-test-secret-value");
  vi.stubEnv("OPENROUTER_MODEL", "openai/gpt-5.6-luna");
});
describe("house chat boundaries", () => {
  it("rejects client identity, blank/oversized text and non-UUID retry keys", () => {
    expect(
      chatSendSchema.safeParse({
        text: "hi",
        clientKey: crypto.randomUUID(),
        householdId: crypto.randomUUID(),
      }).success,
    ).toBe(false);
    for (const text of [" ", "x".repeat(1001)])
      expect(
        chatSendSchema.safeParse({ text, clientKey: crypto.randomUUID() })
          .success,
      ).toBe(false);
    expect(
      chatSendSchema.safeParse({ text: "hi", clientKey: "retry" }).success,
    ).toBe(false);
  });
  it("deduplicates message updates while preserving chronological cursors", () => {
    const a = { id: "a", cursor: "2", actionable: true } as ChatMessage;
    const b = { id: "b", cursor: "1" } as ChatMessage;
    expect(mergeChatMessages([a], [b, { ...a, actionable: false }])).toEqual([
      b,
      { ...a, actionable: false },
    ]);
    expect(nearChatBottom(300, 1000, 620)).toBe(true);
    expect(nearChatBottom(0, 1000, 620)).toBe(false);
  });
  it("never exports signed tokens in group messages", () => {
    expect(
      publicReply({ kind: "proposal", message: "Review", token: "private" }),
    ).toEqual({ kind: "proposal", message: "Review" });
  });
  it.each(["silent", "answer", "activity"] as const)(
    "uses structured %s triage",
    async (mode) => {
      generate.mockResolvedValue({ output: { mode } });
      expect(await triageChat("A roommate message")).toBe(mode);
    },
  );
  it("guarantees engagement for mentions and direct Homeshare requests", async () => {
    generate.mockResolvedValue({ output: { mode: "silent" } });
    for (const text of ["@Homeshare hello", "Hey Homeshare, help me"]) {
      expect(directlyAddressesHomeshare(text)).toBe(true);
      expect(await triageChat(text)).toBe("answer");
    }
  });
  it("uses only a fresh whitelisted financial snapshot and sanitized context", async () => {
    const data = demoData();
    data.members[0].name = "Alex alex@example.com";
    data.bills[0].notes = "private note";
    const snapshot = JSON.stringify(chatSnapshot(data));
    expect(snapshot).not.toContain(data.household.id);
    expect(snapshot).not.toContain("example.com");
    expect(snapshot).not.toContain("private note");
    expect(snapshot).not.toContain('"id"');
    generate.mockResolvedValue({
      output: { answer: "Electricity is still due." },
    });
    await answerChat(
      "who owes? sk-test-secret-value",
      [{ name: "Alex", text: "alex@example.com" }],
      data,
    );
    const prompt = generate.mock.calls[0][0].prompt;
    expect(prompt).not.toContain("sk-test-secret-value");
    expect(prompt).not.toContain("example.com");
    expect(JSON.parse(prompt).snapshot.bills[0].shares[0].paidCents).toBe(
      data.bills[0].splits[0].paidCents,
    );
  });
});
