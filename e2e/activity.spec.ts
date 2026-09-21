import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
test.use({ ignoreHTTPSErrors: true });
test.describe.configure({ timeout: 300_000 });
const expectChat = expect.configure({ timeout: 30000 });
test("house chat: shared persistence, pagination, retries, private proposals, switching and mobile composer", async ({
  page,
  browser,
}) => {
  test.setTimeout(300_000);
  test.skip(
    process.env.SEED_ALLOWED !== "true" ||
      process.env.HOMESHARE_E2E_LLM_STUB !== "true",
    "Requires designated dev auth/database and the process-only OpenRouter stub.",
  );
  const suffix = randomUUID();
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const homes: string[] = [];
  const users: string[] = [];
  const secondContext = await browser.newContext({ ignoreHTTPSErrors: true });
  const second = await secondContext.newPage();
  page.setDefaultTimeout(20_000);
  second.setDefaultTimeout(20_000);
  const base = new URL(process.env.E2E_BASE_URL ?? "http://localhost:3000")
    .origin;
  async function signup(target: Page, name: string, label: string) {
    const email = `chat-${label.toLowerCase()}-${suffix}@example.com`;
    await target.goto(`${base}/sign-up`);
    await target.getByRole("button", { name: "Show password" }).click();
    await target.getByLabel("Your name").fill(name);
    await target.getByLabel("Email address").fill(email);
    await target
      .getByLabel("Password", { exact: true })
      .fill(`Test-${randomUUID()}!`);
    await target.getByRole("button", { name: "Create your account" }).click();
    await expectChat(target).toHaveURL(/\/onboarding/, { timeout: 60000 });
    await target
      .getByLabel("Household name")
      .fill(`Chat ${label} ${suffix.slice(0, 6)}`);
    await target.getByRole("button", { name: "Create your household" }).click();
    await expectChat(target).toHaveURL(/\/dashboard/);
    const {
      rows: [row],
    } = await pool.query(
      "select p.id user_id, m.id member_id, m.household_id from profiles p join household_members m on m.user_id=p.id where p.email=$1",
      [email],
    );
    homes.push(row.household_id);
    users.push(row.user_id);
    return row as { user_id: string; member_id: string; household_id: string };
  }
  async function switchTo(target: Page, name: string) {
    await target
      .getByRole("button", { name: /Switch household, current:/ })
      .filter({ visible: true })
      .click();
    await target
      .getByRole("button", { name: new RegExp(name + " (Owner|Member)") })
      .click();
    await expectChat(
      target
        .getByRole("button", { name: `Switch household, current: ${name}` })
        .filter({ visible: true }),
    ).toBeVisible();
  }
  async function send(target: Page, text: string) {
    await target.getByLabel("Message your household").fill(text);
    await target
      .getByRole("button", { name: "Send message", exact: true })
      .click();
  }
  try {
    const owner = await signup(page, "Alex Owner", "Main");
    const roommate = await signup(second, "Blair Roommate", "Other");
    const roommateMember = randomUUID();
    const otherOwnerMember = randomUUID();
    const billId = randomUUID();
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query(
        "insert into household_members(id,household_id,user_id) values($1,$2,$3),($4,$5,$6)",
        [
          roommateMember,
          owner.household_id,
          roommate.user_id,
          otherOwnerMember,
          roommate.household_id,
          owner.user_id,
        ],
      );
      await client.query(
        "insert into bills(id,household_id,name,category,amount_cents,due_date,created_by) values($1,$2,'Electricity','Electricity',10000,'2027-09-28',$3)",
        [billId, owner.household_id, owner.user_id],
      );
      for (const member of [owner.member_id, roommateMember])
        await client.query(
          "insert into bill_splits(household_id,bill_id,member_id,amount_cents) values($1,$2,$3,5000)",
          [owner.household_id, billId, member],
        );
      for (let i = 0; i < 48; i++)
        await client.query(
          "insert into chat_messages(household_id,sender_id,sender_name,kind,text,client_key,created_at) values($1,$2,'Alex Owner','human',$3,$4,now()-interval '1 day')",
          [
            owner.household_id,
            owner.member_id,
            `Earlier message ${i}`,
            randomUUID(),
          ],
        );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
    await page.goto(`${base}/chat`);
    await second.reload();
    await switchTo(second, `Chat Main ${suffix.slice(0, 6)}`);
    await second.goto(`${base}/chat`);
    const log = page.getByRole("log");
    await expectChat(
      page.getByRole("heading", { name: "House Chat" }),
    ).toBeVisible();
    const composer = page.getByLabel("Message your household");
    await composer.fill("@");
    const mention = page.getByRole("option", { name: /Homeshare AI/ });
    await expectChat(mention).toBeVisible();
    await mention.click();
    await expectChat(composer).toHaveValue("@Homeshare ");
    await expectChat(
      page
        .getByTestId("chat-composer-highlight")
        .locator("[data-chat-mention]"),
    ).toHaveText("@Homeshare");
    await composer.fill("@ho");
    await composer.press("Tab");
    await expectChat(composer).toHaveValue("@Homeshare ");
    await expectChat(composer).toBeFocused();
    await composer.fill("@");
    await composer.press("Enter");
    await expectChat(composer).toHaveValue("@Homeshare ");
    await page
      .getByLabel("House Chat", { exact: true })
      .screenshot({
        path: `test-results/chat-mention-${test.info().project.name}.png`,
      });
    await composer.fill("");
    await page.getByRole("button", { name: "Load older messages" }).click();
    await expectChat(
      log.getByText("Earlier message 0", { exact: true }),
    ).toBeAttached();
    await expectChat(
      page.getByRole("button", { name: "Load older messages" }),
    ).toHaveCount(0);
    await send(page, "Dinner at seven?");
    await expectChat(
      second.getByRole("log").getByText("Dinner at seven?", { exact: true }),
    ).toBeVisible();
    await send(second, "See you then!");
    await expectChat(
      log.getByText("See you then!", { exact: true }),
    ).toBeVisible();
    await page.reload();
    await expectChat(
      log.getByText("Dinner at seven?", { exact: true }),
    ).toBeVisible();
    // Failure before delivery, then the same optimistic key succeeds once.
    let fail = true;
    await page.route("**/api/chat", async (route) => {
      if (route.request().method() === "POST" && fail) {
        fail = false;
        await route.abort();
      } else await route.continue();
    });
    await send(page, "Retry this hello");
    await page.getByRole("button", { name: "Failed to send · Retry" }).click();
    await expectChat(
      second.getByRole("log").getByText("Retry this hello", { exact: true }),
    ).toBeVisible();
    await page.unroute("**/api/chat");
    expect(
      (
        await pool.query(
          "select count(*)::int n from chat_messages where household_id=$1 and text='Retry this hello'",
          [owner.household_id],
        )
      ).rows[0].n,
    ).toBe(1);
    // Reading older messages must not jump to the newest message.
    await log.evaluate((el) => {
      el.scrollTop = 0;
    });
    await send(second, "A new message while you read");
    await expectChat(
      page.getByRole("button", { name: "New messages" }),
    ).toBeVisible();
    expect(await log.evaluate((el) => el.scrollTop)).toBeLessThan(100);
    await page.getByRole("button", { name: "New messages" }).click();
    await send(page, "@Homeshare who still owes on electricity?");
    await expectChat(
      log.getByText(/Electricity has an outstanding balance/),
    ).toBeVisible();
    await expectChat(log.locator("[data-chat-mention]").first()).toHaveText(
      "@Homeshare",
    );
    await send(page, "I paid $10 toward electricity");
    let proposal = log.getByTestId("activity-proposal").last();
    await expectChat(proposal).toContainText("Alex Owner");
    await expectChat(proposal).toContainText("Contribution: $10.00");
    await page.reload();
    proposal = log.getByTestId("activity-proposal").last();
    await expectChat(
      proposal.getByRole("button", { name: "Confirm", exact: true }),
    ).toBeVisible();
    const messageId = await proposal
      .locator("xpath=ancestor::*[@data-message-id]")
      .getAttribute("data-message-id");
    await expectChat(
      second.getByTestId("activity-proposal").last(),
    ).toBeVisible();
    await expectChat(
      second.getByRole("button", { name: "Confirm", exact: true }),
    ).toHaveCount(0);
    const snapshot = await second.request.get(`${base}/api/chat`, {
      headers: { "x-homeshare-household": owner.household_id },
    });
    expect(JSON.stringify(await snapshot.json())).not.toContain('"token"');
    const forbidden = await second.request.post(
      `${base}/api/activity/confirm`,
      {
        headers: { origin: base },
        data: { householdId: owner.household_id, chatMessageId: messageId },
      },
    );
    expect(forbidden.status()).toBe(400);
    expect((await forbidden.json()).message).toContain("Only the roommate");
    await proposal
      .getByRole("button", { name: "Confirm", exact: true })
      .click();
    await expectChat(
      log.getByRole("link", { name: "Open bill" }),
    ).toBeVisible();
    const repeat = await page.request.post(`${base}/api/activity/confirm`, {
      headers: { origin: base },
      data: { householdId: owner.household_id, chatMessageId: messageId },
    });
    expect((await repeat.json()).kind).toBe("success");
    expect(
      (
        await pool.query(
          "select count(*)::int n from payments where household_id=$1",
          [owner.household_id],
        )
      ).rows[0].n,
    ).toBe(1);
    await send(second, "I paid $10 toward electricity");
    await expectChat(
      second.getByTestId("activity-proposal").last(),
    ).toContainText("Blair Roommate");
    await send(page, "@Homeshare provider error");
    await expectChat(
      log.getByText(/Homeshare is temporarily unavailable/),
    ).toBeVisible();
    await send(page, "Human chat still works");
    await expectChat(
      second.getByRole("log").getByText("Human chat still works"),
    ).toBeVisible();
    await second.goto(`${base}/demo`);
    await page.setViewportSize({ width: 390, height: 450 });
    await page.getByLabel("Message your household").focus();
    await expectChat(
      page.getByRole("button", { name: "Send message", exact: true }),
    ).toBeInViewport();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/chat-keyboard-${test.info().project.name}.png`,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await switchTo(page, `Chat Other ${suffix.slice(0, 6)}`);
    await expectChat(page).toHaveURL(/\/chat/);
    await expectChat(
      page.getByText("Everyone on the same page."),
    ).toBeVisible();
    await expectChat(page.getByTestId("activity-proposal")).toHaveCount(0);
    await expectChat(
      log.getByText("Dinner at seven?", { exact: true }),
    ).toHaveCount(0);
    const stale = await page.request.get(`${base}/api/chat`, {
      headers: { "x-homeshare-household": owner.household_id },
    });
    expect(stale.status()).toBe(409);
    const wrongHome = await page.request.post(`${base}/api/activity/confirm`, {
      headers: { origin: base },
      data: { householdId: owner.household_id, chatMessageId: messageId },
    });
    expect(wrongHome.status()).toBe(400);
  } finally {
    await page.close();
    await secondContext.close();
    if (homes.length) {
      const client = await pool.connect();
      try {
        await client.query("begin");
        for (const table of [
          "chat_jobs",
          "chat_messages",
          "payments",
          "bill_splits",
          "bills",
          "recurring_template_splits",
          "recurring_bill_templates",
          "household_invitations",
          "household_members",
        ])
          await client.query(
            `delete from ${table} where household_id=any($1::uuid[])`,
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
