import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { NEON_AUTH_SESSION_COOKIE_NAME as tokenName } from "@neondatabase/auth/server";
import { config, proxy } from "@/proxy";

vi.hoisted(async () => {
  const { AsyncLocalStorage } = await import("node:async_hooks");
  vi.stubGlobal("AsyncLocalStorage", AsyncLocalStorage);
});

const upstream = vi.fn<typeof fetch>();
const now = new Date().toISOString();
const session = {
  session: {
    id: "test-session",
    userId: "test-user",
    expiresAt: new Date(Date.now() + 604800000).toISOString(),
    createdAt: now,
    updatedAt: now,
  },
  user: {
    id: "test-user",
    email: "persistence@example.com",
    createdAt: now,
    updatedAt: now,
  },
};

beforeEach(() => {
  vi.stubEnv("NEON_AUTH_BASE_URL", "https://auth.example.com");
  vi.stubEnv(
    "NEON_AUTH_COOKIE_SECRET",
    "unit-test-secret-at-least-32-characters",
  );
  vi.stubGlobal("fetch", upstream);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  upstream.mockReset();
});

function request(path = "/dashboard") {
  return new NextRequest(`https://homeshare.example.com${path}`, {
    headers: { cookie: `${tokenName}=original; theme=dark` },
  });
}

describe("browser session persistence through the real Neon SDK", () => {
  it("forwards renewed persistent cookies to the browser and current render", async () => {
    upstream.mockResolvedValueOnce(
      Response.json(session, {
        headers: {
          "Set-Cookie": `${tokenName}=renewed; Max-Age=604800; Path=/; HttpOnly; Secure; SameSite=Lax`,
        },
      }),
    );
    upstream.mockResolvedValue(Response.json(session));
    const response = await proxy(request());

    expect(String(upstream.mock.calls[0][0])).toContain(
      "/get-session?disableCookieCache=true",
    );
    expect(response.headers.getSetCookie().join(";")).toContain(
      `${tokenName}=renewed`,
    );
    expect(response.headers.getSetCookie().join(";")).toContain(
      "Max-Age=604800",
    );
    expect(response.headers.getSetCookie().join(";")).toMatch(/HttpOnly/i);
    expect(response.headers.getSetCookie().join(";")).toMatch(/Secure/);
    expect(response.headers.get("x-middleware-request-cookie")).toContain(
      `${tokenName}=renewed`,
    );
    expect(response.headers.get("x-middleware-request-cookie")).toContain(
      "theme=dark",
    );
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("takes returning signed-in users from the landing page to their household", async () => {
    upstream.mockResolvedValue(Response.json(session));
    const response = await proxy(request("/"));
    expect(response.headers.get("location")).toBe(
      "https://homeshare.example.com/dashboard",
    );
  });

  it("keeps public pages available without cookies or auth configuration", async () => {
    vi.stubEnv("NEON_AUTH_BASE_URL", "");
    const response = await proxy(
      new NextRequest("https://homeshare.example.com/"),
    );
    expect(response.headers.get("location")).toBeNull();
    expect(upstream).not.toHaveBeenCalled();
  });

  it("removes expired cookies and never redirects an invalid session to the dashboard", async () => {
    upstream.mockResolvedValue(
      Response.json(null, {
        headers: {
          "Set-Cookie": `${tokenName}=; Max-Age=0; Path=/; HttpOnly; Secure`,
        },
      }),
    );
    const response = await proxy(request("/"));
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-request-cookie")).not.toContain(
      tokenName,
    );
    expect(response.headers.getSetCookie().join(";")).toContain("Max-Age=0");
  });

  it("does not erase browser credentials on an upstream outage", async () => {
    upstream.mockResolvedValue(new Response(null, { status: 503 }));
    const response = await proxy(request("/"));
    expect(response.headers.getSetCookie()).toEqual([]);
    expect(response.headers.get("location")).toBeNull();
  });

  it("refreshes account pages without intercepting APIs, the demo, or assets", () => {
    for (const url of ["/", "/sign-in", "/sign-up", "/join/token", "/bills/id"])
      expect(unstable_doesMiddlewareMatch({ config, url })).toBe(true);
    for (const url of [
      "/api/auth/sign-out",
      "/api/cron/recurring",
      "/demo",
      "/favicon.ico",
      "/_next/static/chunk.js",
    ])
      expect(unstable_doesMiddlewareMatch({ config, url })).toBe(false);
  });
});
