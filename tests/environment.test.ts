import { afterEach, describe, expect, it, vi } from "vitest";
import { appUrl } from "@/lib/server/environment";

afterEach(() => vi.unstubAllEnvs());

describe("canonical URLs for invitations and password-reset emails", () => {
  it("uses the configured public origin in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_URL", " https://homeshare.dev/ ");
    expect(appUrl()).toBe("https://homeshare.dev");
  });

  it.each([
    "http://localhost:3000",
    "https://localhost",
    "http://127.0.0.1:3000",
    "https://127.0.0.2",
    "https://[::1]",
    "https://foo.localhost",
    "http://example.com",
    "https://user:password@example.com",
    "https://example.com/reset-password",
    "https://example.com?next=bad",
    "https://example.com#fragment",
    "",
    "not a URL",
  ])("rejects unsafe or malformed production origin %s", (origin) => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_URL", origin);
    expect(() => appUrl()).toThrow();
  });

  it("permits local development without configuring an origin", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("APP_URL", "");
    expect(appUrl()).toBe("http://localhost:3000");
  });

  it.each(["production", "preview"])(
    "never permits localhost on hosted %s",
    (environment) => {
      vi.stubEnv("NODE_ENV", "development");
      vi.stubEnv("VERCEL_ENV", environment);
      vi.stubEnv("APP_URL", "http://localhost:3000");
      expect(() => appUrl()).toThrow();
    },
  );
});
