import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { DomainError } from "@/lib/domain/bills";
import type {
  ActivityIntent,
  ActivityResolution,
  ActivitySelection,
} from "@/lib/domain/activity";
export type ActivityContext = {
  userId: string;
  householdId: string;
  commandId: string;
  expires: number;
  intent: ActivityIntent;
  selection: ActivitySelection;
  resolution: ActivityResolution;
  // Bounded user-only conversation, never model reasoning or auth/tenant records.
  history: string[];
};
function signature(body: string) {
  const secret =
    process.env.AI_PROPOSAL_SECRET || process.env.NEON_AUTH_COOKIE_SECRET;
  if (!secret || secret.length < 32)
    throw new DomainError(
      "Activity chat is not configured yet. You can still record shares manually.",
    );
  return createHmac("sha256", secret)
    .update(`homeshare-activity-v1:${body}`)
    .digest();
}
export function signActivity(context: ActivityContext) {
  const body = Buffer.from(JSON.stringify(context)).toString("base64url");
  return `${body}.${signature(body).toString("base64url")}`;
}
export function verifyActivity(
  token: string,
  userId: string,
  householdId: string,
  options: { allowExpired?: boolean } = {},
): ActivityContext {
  if (token.length > 32_000)
    throw new DomainError("Please start this activity again.");
  const [body, mac, extra] = token.split(".");
  if (!body || !mac || extra)
    throw new DomainError("Please start this activity again.");
  const expected = signature(body);
  const received = Buffer.from(mac, "base64url");
  if (
    expected.length !== received.length ||
    !timingSafeEqual(expected, received)
  )
    throw new DomainError(
      "This proposal could not be verified. Please start again.",
    );
  const context = JSON.parse(
    Buffer.from(body, "base64url").toString(),
  ) as ActivityContext;
  if (context.userId !== userId || context.householdId !== householdId)
    throw new DomainError(
      "Your active household changed. Start this activity again in the selected household.",
    );
  if (!options.allowExpired && context.expires < Date.now())
    throw new DomainError(
      "This proposal expired. Please describe the activity again.",
    );
  return context;
}
