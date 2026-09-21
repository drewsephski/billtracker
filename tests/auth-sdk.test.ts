import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAuthClient } from "@neondatabase/auth/next";
const upstream = vi.fn<typeof fetch>();
beforeEach(() => vi.stubGlobal("fetch", upstream));
afterEach(() => {
  vi.unstubAllGlobals();
  upstream.mockReset();
});
describe("installed Neon client OAuth contracts (mocked network)", () => {
  it.each(["sign-in", "link"] as const)(
    "forwards %s through the supported SDK endpoint",
    async (mode) => {
      upstream.mockResolvedValue(
        Response.json({
          url: "https://accounts.google.com/oauth",
          redirect: false,
        }),
      );
      const client = createAuthClient();
      const input = {
        provider: "google" as const,
        callbackURL: mode === "link" ? "/settings" : "/dashboard",
        errorCallbackURL: mode === "link" ? "/settings" : "/sign-in",
      };
      const result =
        mode === "link"
          ? await client.linkSocial(input)
          : await client.signIn.social(input);
      expect(result.error).toBeNull();
      expect(String(upstream.mock.calls[0][0])).toContain(
        mode === "link" ? "/link-social" : "/sign-in/social",
      );
      expect(JSON.parse(String(upstream.mock.calls[0][1]?.body))).toMatchObject(
        input,
      );
    },
  );
});
