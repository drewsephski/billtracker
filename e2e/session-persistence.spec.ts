import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";

test("sign-in persists across a browser reopen and revoked sessions stay signed out", async ({
  browser,
  baseURL,
}) => {
  test.skip(
    process.env.SEED_ALLOWED !== "true",
    "Only runs against an explicitly designated development auth branch.",
  );
  const email = `persistence-${randomUUID()}@example.com`;
  const password = `Test-${randomUUID()}!`;
  const first = await browser.newContext({ baseURL });
  const page = await first.newPage();
  await page.goto("/sign-up");
  await page.getByLabel("Your name").fill("Persistence Test");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Create your account" }).click();
  await expect(page).toHaveURL(/\/onboarding/);
  expect((await first.request.post("/api/auth/sign-out")).ok()).toBe(true);

  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/onboarding/);

  const cookies = await first.cookies();
  const token = cookies.find((cookie) =>
    cookie.name.endsWith(".session_token"),
  );
  expect(token).toBeDefined();
  expect(token!.expires).toBeGreaterThan(Date.now() / 1000 + 86400);
  expect(token!.httpOnly).toBe(true);
  expect(token!.secure).toBe(true);
  // Simulate reopening after the short identity cache expired. Only persistent
  // cookies survive; no localStorage or sessionStorage is restored.
  const persistentCookies = cookies.filter(
    (cookie) =>
      cookie.expires > Date.now() / 1000 &&
      !cookie.name.endsWith(".session_data"),
  );
  await first.close();
  const reopened = await browser.newContext({
    baseURL,
    storageState: { cookies: persistentCookies, origins: [] },
  });
  try {
    const returning = await reopened.newPage();
    await returning.goto("/");
    await expect(returning).toHaveURL(/\/onboarding/);
    await returning.goto("/sign-in");
    await expect(returning).toHaveURL(/\/onboarding/);
    await returning.reload();
    await expect(returning).toHaveURL(/\/onboarding/);

    expect((await reopened.request.post("/api/auth/sign-out")).ok()).toBe(true);
    // Restoring a saved token must not resurrect the revoked provider session.
    await reopened.addCookies(persistentCookies);
    await returning.goto("/dashboard");
    await expect(returning).toHaveURL(/\/sign-in/);
    await returning.goto("/");
    await expect(
      returning.getByRole("heading", { name: /Share a home/ }),
    ).toBeVisible();
  } finally {
    await reopened.close();
  }
});
