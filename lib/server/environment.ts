import "server-only";
import { z } from "zod";
export function appUrl(): string {
  const value =
    process.env.APP_URL ||
    (process.env.NODE_ENV === "development"
      ? "http://localhost:3000"
      : undefined);
  const url = new URL(z.url().parse(value));
  if (
    url.protocol !== "https:" &&
    !(
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(url.hostname)
    )
  )
    throw new Error("APP_URL must use HTTPS outside local development.");
  return url.origin;
}
