import { getAuth } from "@/lib/server/auth";
import {
  allowAuthRequest,
  authClientKey,
  resetRequestMessage,
} from "@/lib/server/auth-throttle";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

type Context = { params: Promise<{ path: string[] }> };
const resetPaths = new Set([
  "request-password-reset",
  "forget-password",
  "email-otp/request-password-reset",
  "forget-password/email-otp",
]);
const verificationPaths = new Set([
  "send-verification-email",
  "email-otp/send-verification-otp",
  "email-otp/verify-email",
]);
const sendPaths = new Set([
  ...resetPaths,
  "sign-up/email",
  "sign-in/magic-link",
  ...verificationPaths,
]);
const attemptPaths = new Set([
  "reset-password",
  "email-otp/reset-password",
  "email-otp/passcode", // Legacy path exposed by the pinned Neon server adapter.
  "email-otp/check-verification-otp",
  "sign-in/email-otp",
  "sign-in/email",
]);
const json = (body: object, status = 200) =>
  NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
const resetAccepted = () =>
  json({ status: true, message: resetRequestMessage });

export async function GET(request: NextRequest, context: Context) {
  const path = (await context.params).path.join("/");
  // The provider's default error destination must never render debug details.
  if (path === "error") {
    const url = new URL("/sign-in", request.url);
    url.searchParams.set("error", "invalid_callback");
    return NextResponse.redirect(url);
  }
  return getAuth().handler().GET(request, context);
}
export async function POST(request: NextRequest, context: Context) {
  const path = (await context.params).path.join("/");
  if (path === "link-social") {
    const session = await getAuth().getSession({
      query: { disableCookieCache: "true" },
    });
    if (session.error || !session.data?.user)
      return json(
        { code: "UNAUTHORIZED", message: "Sign in before connecting Google." },
        401,
      );
  }
  if (!sendPaths.has(path) && !attemptPaths.has(path))
    return getAuth().handler().POST(request, context);

  let body: Record<string, unknown>;
  try {
    body = z
      .record(z.string(), z.unknown())
      .parse(await request.clone().json());
  } catch {
    return json(
      { code: "INVALID_REQUEST", message: "Check your entries." },
      400,
    );
  }
  const parsed = z
    .email()
    .safeParse(
      typeof body.email === "string"
        ? body.email.trim().toLowerCase()
        : body.email,
    );
  if (!parsed.success && path !== "reset-password")
    return json(
      { code: "INVALID_REQUEST", message: "Enter a valid email address." },
      400,
    );
  const email = parsed.success
    ? parsed.data
    : String(body.token || "missing-token");
  if (verificationPaths.has(path)) {
    const session = await getAuth().getSession({
      query: { disableCookieCache: "true" },
    });
    if (
      session.error ||
      !session.data?.user ||
      session.data.user.email.toLowerCase() !== email
    )
      return json(
        { code: "UNAUTHORIZED", message: "Sign in to verify your own email." },
        401,
      );
    // The application supports verification, not anonymous OTP sign-in/linking.
    if (
      path === "email-otp/send-verification-otp" &&
      body.type !== "email-verification"
    )
      return json(
        {
          code: "INVALID_REQUEST",
          message:
            "Use email and password to sign in, or request a password reset.",
        },
        400,
      );
  }
  const kind =
    path === "email-otp/verify-email" || attemptPaths.has(path)
      ? "attempt"
      : "send";
  if (!allowAuthRequest(email, authClientKey(request.headers), kind))
    return resetPaths.has(path)
      ? resetAccepted()
      : json(
          {
            code: "TOO_MANY_REQUESTS",
            message: "Please wait a few minutes and try again.",
          },
          429,
        );
  if (resetPaths.has(path)) {
    try {
      await getAuth().handler().POST(request, context);
    } catch {
      /* Same response for absent accounts and provider failures. */
    }
    return resetAccepted();
  }
  return getAuth().handler().POST(request, context);
}
