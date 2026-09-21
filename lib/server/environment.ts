import "server-only";

export function appUrl(): string {
  const localDevelopment =
    process.env.NODE_ENV === "development" &&
    (!process.env.VERCEL_ENV || process.env.VERCEL_ENV === "development");
  const value =
    process.env.APP_URL?.trim() ||
    (localDevelopment ? "http://localhost:3000" : undefined);
  if (!value)
    throw new Error("Configure APP_URL with the public application origin.");
  const url = new URL(value);
  const localHost =
    url.hostname === "localhost" ||
    url.hostname.endsWith(".localhost") ||
    url.hostname === "[::1]" ||
    /^127\./.test(url.hostname) ||
    url.hostname === "0.0.0.0";
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/" ||
    (!localDevelopment && localHost) ||
    (url.protocol !== "https:" &&
      !(localDevelopment && localHost && url.protocol === "http:"))
  )
    throw new Error(
      "APP_URL must be a public HTTPS origin outside local development.",
    );
  return url.origin;
}
