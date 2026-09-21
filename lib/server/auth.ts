import "server-only";
import { createNeonAuth } from "@neondatabase/auth/next/server";
import { redirect } from "next/navigation";
import { invitationDestination } from "@/lib/domain/navigation";
import { cache } from "react";
let instance: ReturnType<typeof createNeonAuth> | undefined;
export function getAuth() {
  if (!process.env.NEON_AUTH_BASE_URL || !process.env.NEON_AUTH_COOKIE_SECRET)
    throw new Error("Configure Neon Auth before signing in.");
  return (instance ??= createNeonAuth({
    baseUrl: process.env.NEON_AUTH_BASE_URL,
    cookies: {
      secret: process.env.NEON_AUTH_COOKIE_SECRET,
      // Short identity cache, not the browser session lifetime (managed by Neon).
      sessionDataTtl: 60,
    },
  }));
}
export const requireUser = cache(async (next?: string) => {
  const { data, error } = await getAuth().getSession({
    query: { disableCookieCache: "true" },
  });
  if (error || !data?.user)
    redirect(
      next
        ? `/sign-in?next=${encodeURIComponent(invitationDestination(next))}`
        : "/sign-in",
    );
  return {
    id: data.user.id,
    name: data.user.name || data.user.email.split("@")[0],
    email: data.user.email.toLowerCase(),
    emailVerified: data.user.emailVerified,
  };
});
export type Identity = Awaited<ReturnType<typeof requireUser>>;
