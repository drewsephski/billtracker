import { afterEach, describe, expect, it, vi } from "vitest";
import { authClientKey, createAuthThrottle } from "@/lib/server/auth-throttle";
afterEach(() => vi.unstubAllEnvs());
describe("bounded auth email/attempt throttling", () => {
  it("normalizes email, shares budgets across clients and expires without extending denial", () => {
    const allow = createAuthThrottle();
    expect(allow(" Alice@Example.com ", "one", "send", 0)).toBe(true);
    expect(allow("alice@example.com", "two", "send", 1)).toBe(false);
    expect(allow("alice@example.com", "two", "send", 60_000)).toBe(true);
    expect(allow("alice@example.com", "three", "send", 120_000)).toBe(true);
    expect(allow("alice@example.com", "four", "send", 180_000)).toBe(false);
    expect(allow("alice@example.com", "four", "send", 900_000)).toBe(true);
  });
  it("limits a client rotating email addresses", () => {
    const allow = createAuthThrottle();
    for (let i = 0; i < 10; i++)
      expect(allow(`${i}@example.com`, "one", "send", i)).toBe(true);
    expect(allow("new@example.com", "one", "send", 11)).toBe(false);
  });
  it("has independent attempt limits and fails closed at capacity", () => {
    const allow = createAuthThrottle(4);
    expect(allow("one@example.com", "one", "send", 0)).toBe(true);
    expect(allow("one@example.com", "one", "attempt", 0)).toBe(true);
    expect(allow("two@example.com", "two", "send", 0)).toBe(false);
    for (let i = 1; i < 10; i++)
      expect(allow("one@example.com", "one", "attempt", i)).toBe(true);
    expect(allow("one@example.com", "one", "attempt", 10)).toBe(false);
    expect(allow("two@example.com", "two", "send", 900_000)).toBe(true);
  });
  it("does not trust arbitrary forwarding headers", () => {
    vi.stubEnv("VERCEL", "");
    const headers = new Headers({
      "x-forwarded-for": "1.2.3.4",
      "x-vercel-forwarded-for": "2.3.4.5",
    });
    expect(authClientKey(headers)).toBe("shared-client");
    vi.stubEnv("VERCEL", "1");
    expect(authClientKey(headers)).toBe("2.3.4.5");
    headers.set("x-vercel-forwarded-for", "spoof, 2.3.4.5");
    expect(authClientKey(headers)).toBe("shared-client");
  });
});
