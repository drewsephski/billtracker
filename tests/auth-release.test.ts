import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/auth/[...path]/route";
import { oauthErrorMessage } from "@/lib/domain/auth-errors";
import {
  requestPasswordReset,
  sendVerification,
  verifyEmail,
} from "@/lib/server/actions";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  proxy: vi.fn(),
  reset: vi.fn(),
  send: vi.fn(),
  verify: vi.fn(),
  requireUser: vi.fn(),
}));
vi.mock("@/lib/server/auth", () => ({
  getAuth: () => ({
    getSession: mocks.getSession,
    handler: () => ({ POST: mocks.proxy, GET: mocks.proxy }),
    requestPasswordReset: mocks.reset,
    emailOtp: { sendVerificationOtp: mocks.send, verifyEmail: mocks.verify },
  }),
  requireUser: mocks.requireUser,
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
}));
let n = 0;
const email = () => `auth-${++n}@example.com`;
function request(path: string, body: object) {
  return POST(
    new NextRequest(`https://app.example.com/api/auth/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ path: path.split("/") }) },
  );
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(1800000000000 + ++n * 1_000_000));
  vi.stubEnv("APP_URL", "https://app.example.com");
  mocks.getSession.mockResolvedValue({ data: null });
  mocks.proxy.mockImplementation(async () =>
    Response.json({
      url: "https://accounts.google.com/o/oauth2/auth",
      redirect: true,
    }),
  );
  mocks.reset.mockResolvedValue({ data: { status: true } });
  mocks.send.mockResolvedValue({ data: { status: true } });
  mocks.verify.mockResolvedValue({ data: { status: true } });
});
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("Google proxy and safe OAuth recovery", () => {
  it("preserves anonymous Google sign-in/signup request and callback response", async () => {
    const body = {
      provider: "google",
      callbackURL: "/dashboard",
      errorCallbackURL: "/sign-in",
    };
    const response = await request("sign-in/social", body);
    expect(response.status).toBe(200);
    expect((await response.json()).url).toContain("accounts.google.com");
    expect(await mocks.proxy.mock.calls[0][0].json()).toEqual(body);
    expect(mocks.getSession).not.toHaveBeenCalled();
  });
  it("requires a fresh authenticated session before linking", async () => {
    expect((await request("link-social", { provider: "google" })).status).toBe(
      401,
    );
    expect(mocks.proxy).not.toHaveBeenCalled();
    mocks.getSession.mockResolvedValue({
      data: { user: { id: "existing", email: email() } },
    });
    expect(
      (
        await request("link-social", {
          provider: "google",
          callbackURL: "/settings",
        })
      ).status,
    ).toBe(200);
    expect(mocks.getSession).toHaveBeenLastCalledWith({
      query: { disableCookieCache: "true" },
    });
    expect(mocks.proxy).toHaveBeenCalledTimes(1);
  });
  it("redirects default callback errors without reflecting details", async () => {
    const response = await GET(
      new NextRequest(
        "https://app.example.com/api/auth/error?error=secret&error_description=private",
      ),
      { params: Promise.resolve({ path: ["error"] }) },
    );
    expect(response.headers.get("location")).toBe(
      "https://app.example.com/sign-in?error=invalid_callback",
    );
    expect(mocks.proxy).not.toHaveBeenCalled();
  });
  it.each([
    "access_denied",
    "account_not_linked",
    "email_doesn't_match",
    "account_already_linked_to_different_user",
    "provider_not_found",
    "state_mismatch",
    "invalid_callback_request",
    "account_already_linked",
  ])("offers recoverable copy for %s", (code) => {
    expect(oauthErrorMessage(code)).toBeTruthy();
    expect(oauthErrorMessage(code, "link")).toBeTruthy();
    expect(oauthErrorMessage(code)).not.toContain(code);
  });
  it("ignores arbitrary strings, arrays and debug objects", () => {
    for (const raw of [
      "private secret <script>",
      ["secret"],
      { message: "secret" },
    ])
      expect(oauthErrorMessage(raw)).not.toContain("secret");
    expect(oauthErrorMessage(undefined)).toBeUndefined();
    expect(oauthErrorMessage("email_doesn't_match", "link")).toContain(
      "Homeshare email",
    );
  });
});
describe("verification and reset abuse protection", () => {
  it("blocks anonymous and wrong-email verification proxy calls", async () => {
    const target = email();
    expect(
      (
        await request("email-otp/send-verification-otp", {
          email: target,
          type: "email-verification",
        })
      ).status,
    ).toBe(401);
    mocks.getSession.mockResolvedValue({ data: { user: { email: email() } } });
    expect(
      (
        await request("email-otp/verify-email", {
          email: target,
          otp: "123456",
        })
      ).status,
    ).toBe(401);
    expect(mocks.proxy).not.toHaveBeenCalled();
  });
  it("throttles authenticated verification and ignores a form-supplied email", async () => {
    const target = email();
    mocks.requireUser.mockResolvedValue({ id: "existing", email: target });
    const form = new FormData();
    form.set("email", "other@example.com");
    expect((await sendVerification({}, form)).success).toBeTruthy();
    expect((await sendVerification({}, form)).error).toContain("wait");
    expect(mocks.send).toHaveBeenCalledExactlyOnceWith({
      email: target,
      type: "email-verification",
    });
  });
  it("shares email send limits between actions and the direct proxy", async () => {
    const target = email();
    const form = new FormData();
    form.set("email", target);
    const first = await requestPasswordReset({}, form);
    const second = await requestPasswordReset({}, form);
    expect(first).toEqual(second);
    expect(mocks.reset).toHaveBeenCalledTimes(1);
    const direct = await request("request-password-reset", { email: target });
    expect(direct.status).toBe(200);
    expect(mocks.proxy).not.toHaveBeenCalled();
  });
  it("returns identical recovery results for success, missing accounts and provider failure", async () => {
    const outputs = [];
    for (const outcome of ["ok", "missing", "failure"]) {
      const form = new FormData();
      form.set("email", email());
      if (outcome === "missing")
        mocks.reset.mockResolvedValueOnce({
          error: { message: "User not found" },
        });
      if (outcome === "failure")
        mocks.reset.mockRejectedValueOnce(new Error("private provider debug"));
      outputs.push(await requestPasswordReset({}, form));
    }
    expect(outputs[0]).toEqual(outputs[1]);
    expect(outputs[1]).toEqual(outputs[2]);
  });
  it.each([
    "request-password-reset",
    "forget-password",
    "email-otp/request-password-reset",
    "forget-password/email-otp",
  ])("keeps reset proxy %s generic", async (path) => {
    mocks.proxy.mockResolvedValueOnce(
      Response.json({ message: "Unknown private account" }, { status: 400 }),
    );
    const first = await request(path, { email: email() });
    mocks.proxy.mockRejectedValueOnce(new Error("secret"));
    const second = await request(path, { email: email() });
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await first.json()).toEqual(await second.json());
  });
  it("bounds OTP guesses and sanitizes upstream verification errors", async () => {
    mocks.requireUser.mockResolvedValue({ id: "existing", email: email() });
    mocks.verify.mockResolvedValue({
      error: { message: "private provider debug" },
    });
    const form = new FormData();
    form.set("otp", "123456");
    for (let i = 0; i < 10; i++)
      expect((await verifyEmail({}, form)).error).toBe(
        "That code didn’t work. Request a new code and try again.",
      );
    expect((await verifyEmail({}, form)).error).toContain("Too many attempts");
    expect(mocks.verify).toHaveBeenCalledTimes(10);
  });
});
