import { beforeEach, expect, it, vi } from "vitest";
import { DomainError } from "@/lib/domain/bills";
const mocks = vi.hoisted(() => ({
  context: vi.fn(),
  send: vi.fn(),
  list: vi.fn(),
  process: vi.fn(),
  recover: vi.fn(),
  after: vi.fn(),
}));
vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("@/lib/server/chat", () => ({
  sendChat: mocks.send,
  listChat: mocks.list,
  processChat: mocks.process,
  recoverChat: mocks.recover,
}));
vi.mock("@/lib/server/activity-http", async (original) => ({
  ...(await original<typeof import("@/lib/server/activity-http")>()),
  activeActivityContext: mocks.context,
}));
import { GET, POST } from "@/app/api/chat/route";
const home = "11111111-1111-4111-8111-111111111111";
const user = {
  id: "auth-user",
  name: "Alex",
  email: "alex@example.com",
  emailVerified: true,
};
function request(
  method: string,
  body?: unknown,
  extra: Record<string, string> = {},
  query = "",
) {
  return new Request(`https://home.test/api/chat${query}`, {
    method,
    headers: {
      origin: "https://home.test",
      "content-type": "application/json",
      "x-homeshare-household": home,
      ...extra,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.context.mockResolvedValue({ user, householdId: home });
  mocks.send.mockResolvedValue({ id: "message" });
  mocks.list.mockResolvedValue({
    householdId: home,
    messages: [],
    updates: [],
    hasMore: false,
  });
});
it("commits the human send before streaming AI and ignores no identity source", async () => {
  const body = { text: "hello", clientKey: crypto.randomUUID() };
  mocks.process.mockImplementationOnce(
    async (
      _user,
      _householdId,
      _messageId,
      options: { onTextDelta: (delta: string) => void },
    ) => {
      options.onTextDelta("Hello from a live stream.");
      return "Hello from a live stream.";
    },
  );
  const response = await POST(request("POST", body));
  expect(response.status).toBe(200);
  expect(mocks.send).toHaveBeenCalledWith(user, home, body);
  expect(mocks.process).toHaveBeenCalledWith(
    user,
    home,
    "message",
    expect.objectContaining({
      onTextDelta: expect.any(Function),
      signal: expect.any(AbortSignal),
    }),
  );
  expect(mocks.after).not.toHaveBeenCalled();
  expect(response.headers.get("cache-control")).toBe("no-store");
  const stream = await response.text();
  expect(stream).toContain('"type":"text-delta"');
  expect(stream).toContain("Hello from a live stream.");
  expect(stream).toContain('"type":"finish"');
});
it("rejects cross-origin writes before any persistence or AI", async () => {
  expect(
    (
      await POST(
        request("POST", { text: "hello" }, { origin: "https://evil.test" }),
      )
    ).status,
  ).toBe(400);
  expect(mocks.send).not.toHaveBeenCalled();
  expect(mocks.after).not.toHaveBeenCalled();
});
it("rejects a stale household for reads and sends", async () => {
  mocks.context.mockRejectedValue(
    new DomainError("Your active household changed."),
  );
  expect((await GET(request("GET"))).status).toBe(409);
  expect((await POST(request("POST", { text: "hello" }))).status).toBe(400);
  expect(mocks.list).not.toHaveBeenCalled();
  expect(mocks.send).not.toHaveBeenCalled();
});
it("does not confuse a database outage with household switching", async () => {
  mocks.list.mockRejectedValue(new Error("database unavailable"));
  expect((await GET(request("GET"))).status).toBe(503);
});
it("bounds cursors and watched proposals before querying", async () => {
  expect(
    (await GET(request("GET", undefined, {}, "?after=invalid"))).status,
  ).toBe(503);
  expect(mocks.list).not.toHaveBeenCalled();
  await GET(request("GET", undefined, {}, "?after=12"));
  expect(mocks.list).toHaveBeenCalledWith(user, home, {
    after: "12",
    watch: [],
  });
});
