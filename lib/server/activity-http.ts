import "server-only";
import { cookies } from "next/headers";
import { z } from "zod";
import {
  ACTIVE_HOUSEHOLD_COOKIE,
  selectHousehold,
} from "@/lib/domain/navigation";
import { DomainError } from "@/lib/domain/bills";
import { requireUser } from "./auth";
import { householdsFor } from "./households";
// Chat must not lazily generate recurring bills while interpreting a message.
export async function activeActivityContext(expectedHousehold?: string) {
  const user = await requireUser();
  const household = selectHousehold(
    await householdsFor(user),
    (await cookies()).get(ACTIVE_HOUSEHOLD_COOKIE)?.value,
  );
  if (!household || (expectedHousehold && household.id !== expectedHousehold))
    throw new DomainError(
      "Your active household changed. Start this activity again in the selected household.",
    );
  return { user, householdId: household.id };
}
export async function activityBody(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin)
    throw new DomainError("Please record this activity from Homeshare.");
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new DomainError("Expected a chat request.");
  const reader = request.body?.getReader();
  if (!reader) throw new DomainError("The request is empty.");
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 48_000) {
        await reader.cancel();
        throw new DomainError(
          "This conversation is too long. Please start a new activity.",
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return JSON.parse(Buffer.concat(chunks).toString());
}
export function activityError(error: unknown) {
  return error instanceof DomainError
    ? error.message
    : error instanceof z.ZodError || error instanceof SyntaxError
      ? "I couldn’t interpret that activity safely. Please try one contribution with a name, amount, and bill."
      : "Activity chat is temporarily unavailable. Nothing was confirmed here; please try again. If confirmation was interrupted, retry the same confirmation to check its result.";
}
