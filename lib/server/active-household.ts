import "server-only";
import { cookies } from "next/headers";
import { ACTIVE_HOUSEHOLD_COOKIE } from "@/lib/domain/navigation";
// Call only after the server has established membership (create, accept, or switch).
export async function rememberHousehold(householdId: string) {
  (await cookies()).set(ACTIVE_HOUSEHOLD_COOKIE, householdId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}
