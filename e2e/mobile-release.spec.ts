import { test, expect } from "@playwright/test";

test("system theme, explicit persistence, reset, and cross-tab sync", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/demo/settings");
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page
    .getByRole("button", { name: "Use light mode" })
    .filter({ visible: true })
    .click();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  const other = await context.newPage();
  await other.goto("/demo");
  await other
    .getByRole("button", { name: "Use dark mode" })
    .filter({ visible: true })
    .click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.getByRole("combobox", { name: "Appearance" }).click();
  await page.getByRole("option", { name: "Use device setting" }).click();
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveClass(/dark/);
  expect(
    await page.evaluate(() => localStorage.getItem("homeshare-theme")),
  ).toBeNull();
  expect(errors).toEqual([]);
  await other.close();
});

test("stored theme applies before application hydration", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({ baseURL, colorScheme: "light" });
  await context.addInitScript(() =>
    localStorage.setItem("homeshare-theme", "dark"),
  );
  const page = await context.newPage();
  // Prevent the React runtime from loading; the inline head bootstrap still runs.
  await page.route("**/_next/**/*.js*", (route) => route.abort());
  await page.goto("/demo", { waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveClass(/dark/);
  expect(
    await page.locator("html").evaluate((element) => element.style.colorScheme),
  ).toBe("dark");
  await context.close();
});

test("blocked storage still supports system theme and toggling", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      get: () => {
        throw new DOMException("Blocked", "SecurityError");
      },
    });
  });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/demo");
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page
    .getByRole("button", { name: "Use light mode" })
    .filter({ visible: true })
    .click();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
});

test("manifest, Apple metadata, icons, and safe-area viewport are served", async ({
  page,
  request,
}) => {
  await page.goto("/demo");
  const manifestLink = await page
    .locator('link[rel="manifest"]')
    .getAttribute("href");
  const response = await request.get(manifestLink!);
  expect(response.ok()).toBe(true);
  const manifest = await response.json();
  expect(manifest.display).toBe("standalone");
  expect(manifest.start_url).toBe("/dashboard");
  for (const icon of manifest.icons)
    expect((await request.get(icon.src)).ok()).toBe(true);
  await expect(
    page.locator('meta[name="apple-mobile-web-app-capable"]'),
  ).toHaveAttribute("content", "yes");
  await expect(
    page.locator('meta[name="mobile-web-app-capable"]'),
  ).toHaveAttribute("content", "yes");
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute(
    "content",
    /viewport-fit=cover/,
  );
  const apple = await page
    .locator('link[rel="apple-touch-icon"]')
    .getAttribute("href");
  expect((await request.get(apple!)).ok()).toBe(true);
});

test("password reveal and close actions retain labels and reduced-motion behavior", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/sign-up");
  await page.getByLabel("Password", { exact: true }).fill("Disposable UI test");
  await page.getByRole("button", { name: "Show password" }).click();
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute(
    "type",
    "text",
  );
  const hide = page.getByRole("button", { name: "Hide password" });
  await expect(hide.locator('[data-animated-icon="eye-off"]')).toBeVisible();
  await hide.click();
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute(
    "type",
    "password",
  );
  await page.goto("/demo");
  await page.getByRole("button", { name: "Add a bill", exact: true }).click();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
