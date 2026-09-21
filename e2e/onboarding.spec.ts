import { test, expect } from "@playwright/test";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Pool } from "pg";

test("invitation recovery preserves context, email and accessible mobile forms", async ({
  page,
}) => {
  test.skip(
    process.env.SEED_ALLOWED !== "true",
    "Requires the designated development database.",
  );
  const ownerId = `test-onboarding-${randomUUID()}`;
  const householdId = randomUUID();
  const token = randomBytes(32).toString("hex");
  const email = `invite-${randomUUID()}@example.com`;
  const next = `/join/${token}`;
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  try {
    await pool.query(
      "insert into profiles (id, name, email) values ($1, 'Onboarding fixture', $2)",
      [ownerId, `owner-${ownerId}@example.com`],
    );
    await pool.query(
      "insert into households (id, name, time_zone) values ($1, 'Maple House', 'UTC')",
      [householdId],
    );
    await pool.query(
      "insert into household_invitations (household_id, email, token_hash, invited_by, expires_at) values ($1, $2, $3, $4, now() + interval '1 day')",
      [
        householdId,
        email,
        createHash("sha256").update(token).digest("hex"),
        ownerId,
      ],
    );
    await page.emulateMedia({ reducedMotion: "reduce" });
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(next);
      await expect(page).toHaveTitle(/Homeshare/);
      await expect(
        page.getByRole("heading", { name: "Join Maple House." }),
      ).toBeVisible();
      await expect(page.getByLabel("Email address")).toHaveValue(email);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: `/tmp/homeshare-invitation-${width}.png`,
        fullPage: true,
      });
    }
    await page
      .getByLabel("Password", { exact: true })
      .fill("DraftPassword123!");
    await page.getByRole("button", { name: "Show password" }).click();
    await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute(
      "type",
      "text",
    );
    await page.getByRole("button", { name: "Hide password" }).click();
    await page.getByRole("link", { name: "Sign in", exact: true }).click();
    await expect(page.getByLabel("Email address")).toHaveValue(email);
    await page.getByRole("link", { name: "Forgot your password?" }).click();
    expect(new URL(page.url()).searchParams.get("next")).toBe(next);
    await page.getByRole("link", { name: "Back to sign in" }).click();
    await expect(page.getByLabel("Email address")).toHaveValue(email);
    await page
      .getByLabel("Password", { exact: true })
      .fill("NotARealPassword123!");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.getByLabel("Email address")).toHaveValue(email);
    await expect(page.getByLabel("Password", { exact: true })).toHaveValue(
      "NotARealPassword123!",
    );
    await page.goto(
      `/reset-password?token=fixture&next=${encodeURIComponent(next)}`,
    );
    await page.getByRole("link", { name: "Back to sign in" }).click();
    expect(new URL(page.url()).searchParams.get("next")).toBe(next);
    await pool.query(
      "update household_invitations set revoked_at = now() where household_id = $1",
      [householdId],
    );
    await page.goto(next);
    await expect(
      page.getByRole("heading", { name: "Let’s find your way home." }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Create your account" }),
    ).toHaveCount(0);
    await page.goto("/join/bad-link");
    await expect(
      page.getByRole("link", { name: "Go to your households" }),
    ).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await pool.query(
      "delete from household_invitations where household_id = $1",
      [householdId],
    );
    await pool.query("delete from households where id = $1", [householdId]);
    await pool.query("delete from profiles where id = $1", [ownerId]);
    await pool.end();
  }
});
