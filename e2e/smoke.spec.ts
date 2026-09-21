import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
test("public and mobile demo: filters, bill detail, split form and dark mode", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Share a home/ }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Take a look around" }).click();
  await expect(
    page.getByRole("heading", { name: "Hey Sarah, welcome home." }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("navigation", { name: "Mobile navigation" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/dashboard-mobile.png",
    fullPage: true,
  });
  await page
    .getByRole("navigation", { name: "Mobile navigation" })
    .getByRole("link", { name: "Bills", exact: true })
    .click();
  await page.getByRole("tab", { name: "Overdue", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Gas", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Electricity", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "Gas", exact: true }).click();
  await expect(page.getByText("Everyone’s share")).toBeVisible();
  await expect(
    page.getByText("Payment history", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Use dark mode" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.getByRole("link", { name: "All bills", exact: true }).click();
  await page.getByRole("button", { name: "Add a bill" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByLabel("Total amount ($)").fill("100.00");
  await expect(
    page.getByRole("dialog").getByText("$33.34", { exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Custom amounts" }).click();
  await expect(
    page.getByRole("textbox", { name: "Sarah’s share in dollars" }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/bill-form-mobile.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
test("unauthenticated household routes and cron are protected", async ({
  page,
  request,
}) => {
  for (const route of [
    "/dashboard",
    "/chat",
    "/bills",
    "/household",
    "/settings",
  ]) {
    await page.goto(route);
    await expect(page).toHaveURL(/\/sign-in/);
  }
  const response = await request.get("/api/cron/recurring");
  expect(response.status()).toBe(401);
});
test("real Neon signup → household → invitation → bill → individual payments → history", async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000);
  test.skip(
    process.env.SEED_ALLOWED !== "true",
    "Only runs against an explicitly designated development database.",
  );
  const suffix = randomUUID().slice(0, 8);
  const password = `Test-${randomUUID()}!`;
  const ownerEmail = `owner-${suffix}@example.com`;
  const roommateEmail = `roommate-${suffix}@example.com`;
  await page.goto("/sign-up");
  await page.getByLabel("Your name").fill("Smoke Owner");
  await page.getByLabel("Email address").fill(ownerEmail);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Create your account" }).click();
  await expect(page).toHaveURL(/\/onboarding/);
  await page.getByLabel("Household name").fill(`Smoke home ${suffix}`);
  await page.getByRole("button", { name: "Create your household" }).click();
  await expect(
    page.getByRole("heading", { name: "Hey Smoke, welcome home." }),
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "Main navigation", exact: true })
    .getByRole("link", { name: "Household", exact: true })
    .click();
  await page.getByLabel("Roommate’s email address").fill(roommateEmail);
  await page.getByRole("button", { name: "Create invite link" }).click();
  const invitationLink = await page
    .getByLabel("Share this link directly with your roommate")
    .inputValue();
  expect(invitationLink).toMatch(/\/join\/[a-f0-9]{64}$/);
  const invitation = new URL(new URL(invitationLink).pathname, page.url()).href;
  const context = await browser.newContext();
  const roommate = await context.newPage();
  await roommate.goto(invitation);
  await expect(
    roommate.getByRole("heading", { name: `Join Smoke home ${suffix}.` }),
  ).toBeVisible();
  await expect(roommate.getByLabel("Email address")).toHaveValue(roommateEmail);
  await roommate.setViewportSize({ width: 390, height: 844 });
  await roommate.screenshot({
    path: "/tmp/homeshare-invite-mobile.png",
    fullPage: true,
  });
  await page.goto(invitation);
  await expect(
    page.getByRole("button", { name: "Use the invited email" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Join household" }),
  ).toHaveCount(0);
  await page.goto("/household");
  await roommate.getByLabel("Your name").fill("Smoke Roommate");
  await roommate.getByLabel("Email address").fill(roommateEmail);
  await roommate.getByLabel("Password", { exact: true }).fill(password);
  await roommate.getByRole("button", { name: "Create your account" }).click();
  await expect(
    roommate.getByRole("button", { name: "Email me a verification code" }),
  ).toBeVisible();
  await expect(
    roommate.getByRole("button", { name: "Join household" }),
  ).toHaveCount(0);
  await expect(roommate.getByLabel("Six-digit code")).toBeVisible();
  // Test fixture: verify the reserved example.com account on the dev branch only.
  // Email delivery itself is deliberately not simulated as an end-to-end pass.
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await pool.query(
      'update neon_auth."user" set "emailVerified" = true where email = $1',
      [roommateEmail],
    );
  } finally {
    await pool.end();
  }
  // Reproduce the reported bug: join while already owning another home.
  await roommate.goto("/onboarding");
  await roommate.getByLabel("Household name").fill(`Other home ${suffix}`);
  await roommate.getByRole("button", { name: "Create your household" }).click();
  await expect(roommate).toHaveURL(/\/dashboard/);
  await roommate.goto(invitation);
  await roommate.getByRole("button", { name: "Join household" }).click();
  await expect(roommate).toHaveURL(/\/dashboard/);
  await page.goto("/bills");
  await page.getByRole("button", { name: "Add a bill" }).click();
  await page.getByLabel("Bill name").fill(`Shared internet ${suffix}`);
  await page.getByLabel("Total amount ($)").fill("99.99");
  await page.getByLabel("Due date", { exact: true }).click();
  await page
    .getByRole("combobox", { name: "Choose the Year" })
    .selectOption("2099");
  await page
    .getByRole("combobox", { name: "Choose the Month" })
    .selectOption("0");
  await page.getByRole("button", { name: /January 31st, 2099/ }).click();
  await page.getByRole("switch", { name: "Repeat every month" }).check();
  await page.getByRole("button", { name: "Add bill", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: `Shared internet ${suffix}` }),
  ).toBeVisible();
  const billUrl = page.url();
  await page.getByRole("button", { name: "Mark paid for Smoke Owner" }).click();
  await expect(page.getByText("Partially paid", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Edit bill", exact: true }),
  ).toHaveCount(0);
  await roommate.goto(billUrl);
  await expect(
    roommate.getByRole("button", { name: "Undo payment for Smoke Owner" }),
  ).toHaveCount(0);
  await roommate
    .getByRole("button", { name: "Mark paid for Smoke Roommate" })
    .click();
  await expect(roommate.getByText("$0.00 left", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("$0.00 left", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Undo payment for Smoke Owner" })
    .click();
  await expect(page.getByText("Reversed", { exact: true })).toBeVisible();
  await page.screenshot({
    path: "test-results/bill-live-desktop.png",
    fullPage: true,
  });
  await page.goto("/bills");
  await page.getByRole("button", { name: "Manage", exact: true }).click();
  await expect(page.getByLabel("Day of month", { exact: true })).toHaveValue(
    "31",
  );
  await page.getByLabel("Total amount ($)").fill("119.99");
  await page.getByRole("button", { name: "Save future settings" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.goto(billUrl);
  await expect(page.getByText("$99.99", { exact: true })).toBeVisible();
  await roommate.goto("/dashboard");
  await roommate
    .getByRole("button", {
      name: `Switch household, current: Smoke home ${suffix}`,
    })
    .filter({ visible: true })
    .click();
  await expect(
    roommate.getByText("Your households", { exact: true }),
  ).toBeVisible();
  await roommate.screenshot({
    path: "/tmp/homeshare-switcher-mobile.png",
    fullPage: true,
  });
  await roommate
    .getByRole("button", { name: `Other home ${suffix} Owner` })
    .click();
  await expect(
    roommate
      .getByRole("button", {
        name: `Switch household, current: Other home ${suffix}`,
      })
      .filter({ visible: true }),
  ).toBeVisible();
  await roommate.reload();
  await expect(
    roommate
      .getByRole("button", {
        name: `Switch household, current: Other home ${suffix}`,
      })
      .filter({ visible: true }),
  ).toBeVisible();
  await roommate.goto("/bills");
  await expect(
    roommate.getByRole("link", {
      name: `Shared internet ${suffix}`,
      exact: true,
    }),
  ).toHaveCount(0);
  await roommate.goto(invitation);
  await roommate.getByRole("button", { name: "Open household" }).click();
  await expect(roommate).toHaveURL(/\/dashboard/);
  await roommate.goto("/bills");
  await expect(
    roommate.getByRole("link", {
      name: `Shared internet ${suffix}`,
      exact: true,
    }),
  ).toBeVisible();
  await context.close();
});
