import "server-only";
import { createHash } from "node:crypto";
import { isIP } from "node:net";

type Bucket = { count: number; expires: number; last: number };
type HeaderReader = { get(name: string): string | null };
const WINDOW_MS = 15 * 60_000;

// A bounded, per-process first line of defense. Neon/edge limits must also
// protect direct provider requests and traffic distributed across instances.
export function createAuthThrottle(maxBuckets = 10_000) {
  const buckets = new Map<string, Bucket>();
  return (
    email: string,
    client: string,
    kind: "send" | "attempt",
    now = Date.now(),
  ) => {
    for (const [key, value] of buckets)
      if (value.expires <= now) buckets.delete(key);
    const digest = (value: string) =>
      createHash("sha256").update(value).digest("hex");
    const limits = [
      {
        key: `${kind}:client:${digest(client)}`,
        limit: kind === "send" ? 10 : 30,
      },
      {
        key: `${kind}:email:${digest(email.trim().toLowerCase())}`,
        limit: kind === "send" ? 3 : 10,
      },
    ];
    const missing = limits.filter(({ key }) => !buckets.has(key)).length;
    if (buckets.size + missing > maxBuckets) return false;
    if (
      limits.some(({ key, limit }) => {
        const bucket = buckets.get(key);
        return (
          bucket &&
          (bucket.count >= limit ||
            (kind === "send" &&
              key.includes(":email:") &&
              now - bucket.last < 60_000))
        );
      })
    )
      return false;
    for (const { key } of limits) {
      const prior = buckets.get(key);
      buckets.set(key, {
        count: (prior?.count ?? 0) + 1,
        expires: prior?.expires ?? now + WINDOW_MS,
        last: now,
      });
    }
    return true;
  };
}

const processState = globalThis as typeof globalThis & {
  homeshareAuthThrottle?: ReturnType<typeof createAuthThrottle>;
};
export const allowAuthRequest = (processState.homeshareAuthThrottle ??=
  createAuthThrottle());

export function authClientKey(headers: HeaderReader): string {
  // Vercel overwrites this header. Never trust arbitrary X-Forwarded-For.
  const ip =
    process.env.VERCEL === "1"
      ? headers.get("x-vercel-forwarded-for")?.trim()
      : undefined;
  return ip && isIP(ip) ? ip : "shared-client";
}

export const resetRequestMessage =
  "If that email has an account, a reset link is on its way. If you requested one recently, wait a few minutes before trying again.";
