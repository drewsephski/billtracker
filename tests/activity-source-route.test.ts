import { beforeEach, describe, expect, it, vi } from "vitest";
const auth = vi.hoisted(() => vi.fn());
vi.mock("@/lib/server/activity-http", () => ({ activeActivityContext: auth }));
import { POST } from "@/app/api/activity/sources/route";
const request = (body = "Water $90", overrides: Record<string, string> = {}) =>
  new Request("https://home.test/api/activity/sources", {
    method: "POST",
    body,
    headers: {
      origin: "https://home.test",
      "x-household-id": "12345678-1234-4234-8234-123456789012",
      "x-file-name": "bill.txt",
      ...overrides,
    },
  });
beforeEach(() => {
  auth.mockReset();
  auth.mockResolvedValue({});
});
describe("authenticated transient source uploads", () => {
  it("extracts a bounded document without storing it", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect((await response.json()).source).toEqual({
      name: "bill.txt",
      text: "Water $90",
    });
  });
  it("rejects a switched household before reading document content", async () => {
    auth.mockRejectedValue(new Error("not authorized"));
    expect((await POST(request())).status).toBe(400);
  });
  it("rejects cross-origin and oversized requests", async () => {
    expect(
      (await POST(request("bill", { origin: "https://evil.test" }))).status,
    ).toBe(400);
    expect(auth).not.toHaveBeenCalled();
    expect(
      (await POST(request("bill", { "content-length": "1000001" }))).status,
    ).toBe(400);
    expect((await POST(request("a".repeat(1_000_001)))).status).toBe(400);
  });
});
