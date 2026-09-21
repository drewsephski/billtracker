import {
  NEON_AUTH_SESSION_COOKIE_NAME,
  parseSetCookies,
} from "@neondatabase/auth/server";
import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@/lib/server/auth";

export async function proxy(request: NextRequest) {
  if (!request.cookies.has(NEON_AUTH_SESSION_COOKIE_NAME))
    return NextResponse.next();

  // Renew before rendering: Server Components cannot persist Set-Cookie.
  // Bypass the SDK cache because its cache-miss minting only returns session_data,
  // dropping the upstream session_token renewal in @neondatabase/auth 0.5.0-beta.
  const url = new URL("/api/auth/get-session", request.url);
  url.searchParams.set("disableCookieCache", "true");
  const sessionResponse = await getAuth().handler().GET(
    new NextRequest(url, { headers: { cookie: request.headers.get("cookie")! } }),
    { params: Promise.resolve({ path: ["get-session"] }) },
  );
  if (!sessionResponse.ok) return NextResponse.next();

  const session = await sessionResponse.json();
  const renewedCookies = sessionResponse.headers.getSetCookie();
  for (const header of renewedCookies) {
    for (const cookie of parseSetCookies(header)) {
      if (
        cookie.maxAge === 0 ||
        (cookie.expires && cookie.expires.getTime() <= Date.now())
      )
        request.cookies.delete(cookie.name);
      else request.cookies.set(cookie.name, cookie.value);
    }
  }

  const response =
    request.nextUrl.pathname === "/" && session?.user && session?.session
      ? NextResponse.redirect(new URL("/dashboard", request.url))
      : NextResponse.next({ request: { headers: request.headers } });
  for (const cookie of renewedCookies)
    response.headers.append("Set-Cookie", cookie);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  matcher: [
    "/",
    "/dashboard/:path*",
    "/bills/:path*",
    "/household/:path*",
    "/settings/:path*",
    "/onboarding",
    "/join/:path*",
    "/sign-in",
    "/sign-up",
    "/verify-email",
    "/forgot-password",
    "/reset-password",
  ],
};
