import { NextRequest } from "next/server";
import { getAuth } from "@/lib/server/auth";

export async function proxy(request: NextRequest) {
  // Neon middleware must process the OAuth verifier on the first navigation
  // back from Google. It exchanges that verifier for the session cookie before
  // the protected route renders. Calling get-session directly here skips that
  // exchange and sends a successful OAuth login back to /sign-in.
  return getAuth().middleware({ loginUrl: "/sign-in" })(request);
}

export const config = {
  matcher: [
    "/",
    "/dashboard/:path*",
    "/chat/:path*",
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
