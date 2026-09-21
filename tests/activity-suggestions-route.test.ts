import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  read: vi.fn(),
  suggest: vi.fn(),
}));
vi.mock("@/lib/server/activity-http", async (original) => ({
  ...(await original<typeof import("@/lib/server/activity-http")>()),
  activeActivityContext: mocks.auth,
}));
vi.mock("@/lib/server/queries", () => ({ readHousehold: mocks.read }));
vi.mock("@/lib/server/activity-suggestions", () => ({
  activitySuggestions: mocks.suggest,
}));
import { POST } from "@/app/api/activity/suggestions/route";
import { demoData } from "@/lib/demo";
const request = (extra = {}) =>
  new Request("https://home.test/api/activity/suggestions", {
    method: "POST",
    headers: {
      origin: "https://home.test",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ householdId: demoData().household.id, ...extra }),
  });
beforeEach(() => {
  vi.clearAllMocks();
  const data = demoData();
  mocks.auth.mockResolvedValue({
    user: { id: data.viewer.userId },
    householdId: data.household.id,
  });
  mocks.read.mockResolvedValue(data);
  mocks.suggest.mockResolvedValue([
    { label: "My Internet share", text: "A draft" },
  ]);
});
it("derives context before generating household-scoped drafts and disables HTTP caching", async () => {
  const response = await POST(request());
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(mocks.suggest).toHaveBeenCalledWith(demoData());
});
it("does not generate suggestions for a switched or unauthorized household", async () => {
  mocks.auth.mockRejectedValueOnce(new Error("household switched"));
  expect((await POST(request())).status).toBe(400);
  expect(mocks.suggest).not.toHaveBeenCalled();
  expect(mocks.read).not.toHaveBeenCalled();
});
it("does not accept model context or identity from the client", async () => {
  expect(
    (await POST(request({ members: [{ name: "Invented" }] }))).status,
  ).toBe(400);
  expect(mocks.suggest).not.toHaveBeenCalled();
});
