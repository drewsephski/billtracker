import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
test.use({ ignoreHTTPSErrors: true });

test("mobile activity: real signed proposals, clarification, cancel, retry, and household switch", async ({
  page,
}) => {
  test.setTimeout(240_000);
  page.setDefaultTimeout(20_000);
  test.skip(
    process.env.SEED_ALLOWED !== "true" ||
      process.env.HOMESHARE_E2E_LLM_STUB !== "true",
    "Requires designated dev auth/database and the test-process OpenRouter stub.",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const suffix = randomUUID();
  const email = `activity-${suffix}@example.com`;
  const homeName = `Activity ${suffix.slice(0, 8)}`;
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const homes: string[] = [];
  const users: string[] = [];
  try {
    await page.goto("/sign-up");
    // Wait for an interactive control before filling SSR inputs.
    await page.getByRole("button", { name: "Show password" }).click();
    await page.getByRole("button", { name: "Hide password" }).click();
    await page.getByLabel("Your name").fill("Alex Owner");
    await page.getByLabel("Email address").fill(email);
    await page
      .getByLabel("Password", { exact: true })
      .fill(`Test-${randomUUID()}!`);
    await page.getByRole("button", { name: "Create your account" }).click();
    await expect(page).toHaveURL(/\/onboarding/);
    await page.getByLabel("Household name").fill(homeName);
    await page.getByRole("button", { name: "Create your household" }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    const {
      rows: [owner],
    } = await pool.query(
      "select p.id as user_id, m.id as member_id, m.household_id from profiles p join household_members m on m.user_id = p.id where p.email = $1",
      [email],
    );
    homes.push(owner.household_id);
    users.push(owner.user_id);
    const memberIds = [owner.member_id, randomUUID(), randomUUID()];
    const billId = randomUUID();
    const client = await pool.connect();
    try {
      await client.query("begin");
      for (let i = 1; i < 3; i++) {
        const id = `activity-roommate-${suffix}-${i}`;
        users.push(id);
        await client.query(
          "insert into profiles(id, name, email) values($1,$2,$3)",
          [
            id,
            i === 1 ? "Allie Smith" : "Allie Jones",
            `activity-${suffix}-${i}@example.com`,
          ],
        );
        await client.query(
          "insert into household_members(id, household_id, user_id) values($1,$2,$3)",
          [memberIds[i], owner.household_id, id],
        );
      }
      await client.query(
        "insert into bills(id, household_id, name, category, amount_cents, due_date, created_by) values($1,$2,'Electricity','Electricity',18642,'2027-09-28',$3)",
        [billId, owner.household_id, owner.user_id],
      );
      for (const member of memberIds)
        await client.query(
          "insert into bill_splits(household_id,bill_id,member_id,amount_cents) values($1,$2,$3,6214)",
          [owner.household_id, billId, member],
        );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
    await page.reload();
    const submit = async (text: string) => {
      await page.getByLabel("Describe bill activity").fill(text);
      await page.getByRole("button", { name: "Send activity" }).click();
    };
    await submit("I paid $40 toward electricity");
    const proposal = page.getByTestId("activity-proposal");
    await expect(proposal).toContainText("Remaining after: $22.14");
    expect(
      (
        await pool.query(
          "select count(*)::int as count from payments where household_id=$1",
          homes,
        )
      ).rows[0].count,
    ).toBe(0);
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    expect(
      (
        await pool.query(
          "select count(*)::int as count from payments where household_id=$1",
          homes,
        )
      ).rows[0].count,
    ).toBe(0);
    await submit("I paid $40 toward electricity");
    await expect(proposal).toBeVisible();
    await page
      .getByRole("button", { name: "Confirm", exact: true })
      .scrollIntoViewIfNeeded();
    expect(
      await page
        .getByRole("button", { name: "Confirm", exact: true })
        .evaluate((e) => e.getBoundingClientRect().height),
    ).toBeGreaterThanOrEqual(44);
    await page.screenshot({
      path: "test-results/activity-mobile-proposal.png",
      fullPage: true,
    });
    const confirmation = page.waitForRequest("**/api/activity/confirm");
    // A synchronous double tap reaches the ref guard even before React rerenders.
    await page
      .getByRole("button", { name: "Confirm", exact: true })
      .evaluate((e) => {
        (e as HTMLButtonElement).click();
        (e as HTMLButtonElement).click();
      });
    const command = (await confirmation).postDataJSON();
    await expect(
      page.getByText(/Updated Electricity\. Recorded \$40.00/),
    ).toBeVisible();
    const replay = await page.request.post("/api/activity/confirm", {
      data: command,
      headers: { origin: new URL(page.url()).origin },
    });
    expect((await replay.json()).message).toContain("already recorded");
    expect(
      (
        await pool.query(
          "select count(*)::int as count from payments where household_id=$1",
          homes,
        )
      ).rows[0].count,
    ).toBe(1);
    await page.getByRole("link", { name: "Open bill" }).click();
    await expect(page.getByText("$40.00 paid · $22.14 left")).toBeVisible();
    await page.goto("/dashboard");
    await submit("Allie paid $10 toward electricity");
    await expect(page.getByText("Which Allie did you mean?")).toBeVisible();
    await page
      .getByRole("button", { name: "Allie Smith", exact: true })
      .click();
    await expect(proposal).toContainText("Allie Smith");
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await submit("I paid $10 toward water");
    await expect(
      page.getByText(/total bill amount and due date/),
    ).toBeVisible();
    await submit("The total is $90, due 2027-09-28");
    await expect(proposal).toContainText("Create Water");
    await expect(proposal).toContainText("Allie Jones");
    // Lose the response AFTER the transaction commits, then retry the same token.
    await page.route(
      "**/api/activity/confirm",
      async (route) => {
        await route.fetch();
        await route.abort("connectionreset");
      },
      { times: 1 },
    );
    await page.getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(page.getByText(/Retry this same confirmation/)).toBeVisible();
    await page.getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(
      page.getByText(/previously confirmed activity was already recorded/),
    ).toBeVisible();
    expect(
      (
        await pool.query(
          "select count(*)::int as count from bills where household_id=$1 and name='Water'",
          homes,
        )
      ).rows[0].count,
    ).toBe(1);
    await page.goto("/onboarding?new=1");
    await page
      .getByLabel("Household name")
      .fill(`Second ${suffix.slice(0, 8)}`);
    await page.getByRole("button", { name: "Create your household" }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    const { rows } = await pool.query(
      "select household_id from household_members where user_id=$1",
      [owner.user_id],
    );
    for (const row of rows)
      if (!homes.includes(row.household_id)) homes.push(row.household_id);
    await page
      .getByRole("button", { name: /Switch household, current:/ })
      .filter({ visible: true })
      .click();
    await page
      .getByRole("button", { name: new RegExp(homeName + " Owner") })
      .click();
    await expect(
      page
        .getByRole("button", { name: `Switch household, current: ${homeName}` })
        .filter({ visible: true }),
    ).toBeVisible();
    await submit("I paid $10 toward electricity");
    await expect(proposal).toBeVisible();
    await page
      .getByRole("button", { name: /Switch household, current:/ })
      .filter({ visible: true })
      .click();
    await page
      .getByRole("button", {
        name: new RegExp("Second " + suffix.slice(0, 8) + " Owner"),
      })
      .click();
    await expect(
      page
        .getByRole("button", {
          name: `Switch household, current: Second ${suffix.slice(0, 8)}`,
        })
        .filter({ visible: true }),
    ).toBeVisible();
    await expect(proposal).toHaveCount(0);
    const wrongHome = await page.request.post("/api/activity/confirm", {
      data: command,
      headers: { origin: new URL(page.url()).origin },
    });
    expect(wrongHome.status()).toBe(400);
    expect((await wrongHome.json()).message).toContain("household changed");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    // Ensure the chat remains compact and reachable at a keyboard-sized viewport.
    await page.setViewportSize({ width: 390, height: 450 });
    await submit("I paid $10 toward water");
    await submit("The total is $90, due 2027-09-28");
    await expect(
      page.getByRole("button", { name: "Confirm", exact: true }),
    ).toBeInViewport();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    // Recoverable provider failure, with no writes.
    await submit("provider error");
    await expect(page.getByText(/temporarily unavailable/)).toBeVisible();
  } finally {
    if (homes.length) {
      const client = await pool.connect();
      try {
        await client.query("begin");
        for (const table of [
          "payments",
          "bill_splits",
          "bills",
          "recurring_template_splits",
          "recurring_bill_templates",
          "household_invitations",
          "household_members",
        ])
          await client.query(
            `delete from ${table} where household_id = any($1::uuid[])`,
            [homes],
          );
        await client.query("delete from households where id=any($1::uuid[])", [
          homes,
        ]);
        await client.query("delete from profiles where id=any($1::text[])", [
          users,
        ]);
        await client.query("commit");
      } catch (error) {
        await client.query("rollback");
        throw error;
      } finally {
        client.release();
      }
    }
    await pool.end();
  }
});
