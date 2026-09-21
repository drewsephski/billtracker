import { test, expect, type Locator } from "@playwright/test";

test("public chat previews stay read-only and link to the demo group chat", async ({
  page,
}) => {
  const requests: string[] = [];
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route(/\/api\/(activity|chat)(\/|\?|$)/, async (route) => {
    requests.push(route.request().url());
    await route.abort();
  });
  for (const path of ["/", "/demo", "/demo/dashboard"]) {
    await page.goto(path);
    await expect(
      page.getByRole("heading", { name: "Tell Homeshare what happened" }),
    ).toBeVisible();
    await page.getByRole("button", { name: /^Record a contribution/ }).click();
    await expect(
      page.getByRole("textbox", { name: "Describe bill activity" }),
    ).toHaveValue("I paid $25 toward Internet.");
    await page
      .getByRole("button", { name: "Send activity", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText("read-only demo");
    await expect(
      page.getByRole("textbox", { name: "Describe bill activity" }),
    ).toHaveValue("I paid $25 toward Internet.");
    const link = page.getByRole("link", {
      name: "Open group chat",
      exact: true,
    });
    await expect(link).toHaveAttribute("href", "/demo/chat");
    await expect(
      link.locator('[data-animated-icon="chevron-right"]'),
    ).toBeVisible();
    await link.click();
    await expect(
      page.getByRole("heading", { name: "House Chat", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("log", { name: "Household messages" }),
    ).toContainText("Your Internet share is $25.");
    await page
      .getByRole("textbox", { name: "Message your household" })
      .fill("Hello, housemates!");
    await page
      .getByRole("button", { name: "Send message", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText("read-only demo");
    await expect(page.getByRole("log")).not.toContainText("Hello, housemates!");
    await expect(
      page.getByRole("link", { name: "Sign up", exact: true }),
    ).toHaveAttribute("href", "/sign-up");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await expect(
      page.getByRole("button", { name: "Send message", exact: true }),
    ).toBeInViewport();
  }
  expect(requests).toEqual([]);
  expect(errors).toEqual([]);
});

test("bill date picker fits mobile and preserves calendar dates across time zones", async ({
  browser,
}, testInfo) => {
  for (const timezoneId of ["America/Los_Angeles", "Pacific/Auckland"]) {
    const context = await browser.newContext({
      ...testInfo.project.use,
      timezoneId,
      viewport: { width: 331, height: 908 },
    });
    const page = await context.newPage();
    try {
      await page.goto("/demo");
      await page
        .getByRole("button", { name: "Add a bill", exact: true })
        .click();
      const trigger = page.getByLabel("Due date", { exact: true });
      await trigger.click();
      const calendar = page.getByRole("dialog", {
        name: "Choose due date",
        exact: true,
      });
      await expect(calendar).toBeVisible();
      const bounds = await calendar.boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(331);
      await page
        .getByRole("combobox", { name: "Choose the Year" })
        .selectOption("2028");
      await page
        .getByRole("combobox", { name: "Choose the Month" })
        .selectOption("1");
      await page.screenshot({
        path: test
          .info()
          .outputPath(`date-picker-${timezoneId.replaceAll("/", "-")}.png`),
      });
      await page.getByRole("button", { name: /February 29th, 2028/ }).click();
      await expect(calendar).toHaveCount(0);
      await expect(page.locator('input[name="dueDate"]')).toHaveValue(
        "2028-02-29",
      );
      await expect(trigger).toContainText("Feb 29");
      await expect(trigger).toBeFocused();
      await trigger.press("Enter");
      const selected = page.getByRole("button", {
        name: /February 29th, 2028, selected/,
      });
      await expect(selected).toBeFocused();
      await selected.press("ArrowRight");
      await page.keyboard.press("Enter");
      await expect(page.locator('input[name="dueDate"]')).toHaveValue(
        "2028-03-01",
      );
      await trigger.press("Enter");
      await page.keyboard.press("Escape");
      await expect(calendar).toHaveCount(0);
      await expect(
        page.getByRole("dialog", { name: "Add a bill", exact: true }),
      ).toBeVisible();
    } finally {
      await context.close();
    }
  }
});

async function watchIconAnimation(icon: Locator) {
  await icon.evaluate((element) => {
    element.removeAttribute("data-animation-observed");
    const observer = new MutationObserver((records) => {
      if (
        records.some(
          (record) =>
            record.oldValue !==
            (record.target as Element).getAttribute(record.attributeName!),
        )
      ) {
        element.setAttribute("data-animation-observed", "true");
        observer.disconnect();
      }
    });
    observer.observe(element.querySelector("svg")!, {
      subtree: true,
      attributes: true,
      attributeOldValue: true,
      attributeFilter: ["d", "style", "stroke-dasharray", "stroke-dashoffset"],
    });
    setTimeout(() => observer.disconnect(), 1500);
  });
}

async function sampleDisclosureHeight(panel: Locator) {
  return panel.evaluate(
    (element) =>
      new Promise<number[]>((resolve) => {
        const heights: number[] = [];
        const observer = new ResizeObserver(() =>
          heights.push(element.clientHeight),
        );
        observer.observe(element);
        setTimeout(() => {
          observer.disconnect();
          resolve(heights);
        }, 600);
      }),
  );
}

test("disclosures animate both directions and preserve form drafts", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setViewportSize({ width: 350, height: 908 });
  await page.goto("/demo");
  await page.getByRole("button", { name: "Add a bill", exact: true }).click();
  const trigger = page.getByRole("button", {
    name: "Category & optional note",
    exact: true,
  });
  const panel = trigger
    .locator("..")
    .locator('[data-slot="disclosure-content"]');
  await trigger.focus();
  const opening = sampleDisclosureHeight(panel);
  await trigger.press("Enter");
  expect(new Set(await opening).size).toBeGreaterThan(2);
  await page.getByLabel("Note (optional)").fill("Remember this draft");
  await trigger.focus();
  const closing = sampleDisclosureHeight(panel);
  await trigger.press("Enter");
  expect(new Set(await closing).size).toBeGreaterThan(2);
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(panel).toHaveAttribute("inert", "");
  await trigger.press("Space");
  await expect(page.getByLabel("Note (optional)")).toHaveValue(
    "Remember this draft",
  );
  await page.goto("/demo/bills/00000000-0000-4000-8000-000000000013");
  const paymentHelp = page.getByRole("button", {
    name: "About recording payments",
    exact: true,
  });
  await paymentHelp.press("Enter");
  await expect(paymentHelp).toHaveAttribute("aria-expanded", "true");
  await expect(
    page.getByText("Settle up however you usually do", { exact: false }),
  ).toBeVisible();
});

test("official icons animate from their parent action and respect reduced motion", async ({
  page,
  isMobile,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  const viewBill = page.getByRole("link", { name: "View bill", exact: true });
  const billArrow = viewBill.locator('[data-animated-icon="arrow-up-right"]');
  const billCard = page.locator('[data-slot="card"]').filter({ has: viewBill });
  await billCard.scrollIntoViewIfNeeded();
  await watchIconAnimation(billArrow);
  if (isMobile) await billCard.tap({ position: { x: 20, y: 20 } });
  else await billCard.hover({ position: { x: 20, y: 20 } });
  await page.waitForTimeout(600);
  await expect(billArrow).not.toHaveAttribute(
    "data-animation-observed",
    "true",
  );
  await viewBill.focus();
  await expect(billArrow).toHaveAttribute("data-animation-observed", "true");
  const action = page.getByRole("link", { name: "Bring your home together" });
  const arrow = action.locator('[data-animated-icon="arrow-right"]');
  await action.scrollIntoViewIfNeeded();
  await watchIconAnimation(arrow);
  await action.focus();
  await expect(arrow).toHaveAttribute("data-animation-observed", "true");

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await action.scrollIntoViewIfNeeded();
  await watchIconAnimation(arrow);
  await action.focus();
  // Allow the complete upstream animation duration to elapse before asserting no motion.
  await page.waitForTimeout(700);
  await expect(arrow).not.toHaveAttribute("data-animation-observed", "true");
});

for (const width of [320, 390, 430]) {
  test(`mobile layouts remain usable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    for (const route of [
      "/",
      "/sign-up",
      "/demo",
      "/demo/bills",
      "/demo/household",
      "/demo/settings",
    ]) {
      // Each layout probe owns its page. Hard-navigating an actively
      // prefetching page makes WebKit report canceled RSC requests as errors.
      const preview = await page.context().newPage();
      await preview.setViewportSize({ width, height: 844 });
      const recordError = (error: Error) => errors.push(error.message);
      preview.on("pageerror", recordError);
      try {
        await preview.goto(route);
        await expect(preview.locator("h1")).toBeVisible();
        expect(
          await preview.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          route,
        ).toBe(true);
      } finally {
        preview.off("pageerror", recordError);
        await preview.close();
      }
    }
    await page.goto("/demo");
    const balance = page.getByRole("region", { name: "Your balance" });
    const amount = await balance
      .getByText("$25.00", { exact: true })
      .boundingBox();
    const blob = await balance.locator("img").boundingBox();
    expect(blob!.x - amount!.x - amount!.width).toBeGreaterThanOrEqual(16);
    await page.getByRole("link", { name: "See your shares" }).click();
    const recurring = page.getByRole("group", {
      name: "Rent recurring bill",
      exact: true,
    });
    await expect(recurring).toBeVisible();
    expect(
      (await recurring.getByText("Rent", { exact: true }).boundingBox())!
        .height,
    ).toBeLessThan(30);
    expect((await recurring.boundingBox())!.height).toBeLessThan(180);
    await recurring.screenshot({
      path: test.info().outputPath(`recurring-bill-${width}.png`),
    });
    await expect(
      page.getByRole("tab", { name: "Your shares" }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(
      page.getByRole("link", { name: "Internet", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Gas", exact: true }),
    ).toHaveCount(0);
    await page.getByLabel("Search bills").fill("nothing-matches");
    await expect(page.getByText("No bills by that name.")).toBeVisible();
    await page
      .getByRole("button", { name: "See all bills", exact: true })
      .click();
    await page.getByRole("button", { name: "Add a bill", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const bounds = await dialog.boundingBox();
    expect(bounds!.x).toBeCloseTo(0);
    expect(bounds!.width).toBeCloseTo(width);
    await expect
      .poll(async () => {
        const settled = await dialog.boundingBox();
        return settled!.y + settled!.height;
      })
      .toBeCloseTo(844, 0);
    await page
      .getByLabel("Bill name", { exact: true })
      .fill("Test electricity");
    await page.getByLabel("Total amount ($)").fill("100.00");
    await expect(dialog.getByText("$33.34", { exact: true })).toBeVisible();
    await page.getByRole("checkbox", { name: "Olivia", exact: true }).uncheck();
    await expect(dialog.getByText("$50.00", { exact: true })).toHaveCount(2);
    await page.getByRole("tab", { name: "Custom amounts" }).click();
    await page.getByLabel("Sarah’s share in dollars").fill("60.00");
    await page.getByLabel("Emma’s share in dollars").fill("40.00");
    await page.getByText("Category & optional note", { exact: true }).click();
    await expect(page.getByLabel("Category", { exact: true })).toBeVisible();
    await page.getByLabel("Note (optional)").fill("Keep this draft");
    await page.getByRole("button", { name: "Add bill", exact: true }).click();
    await expect(dialog.getByRole("alert")).toContainText("read-only demo");
    await expect(page.getByLabel("Bill name", { exact: true })).toHaveValue(
      "Test electricity",
    );
    expect(
      await dialog.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Add a bill", exact: true }),
    ).toBeFocused();
    expect(errors).toEqual([]);
  });
}

test("keyboard tabs, reduced motion, and read-only payment feedback", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/demo/bills");
  const all = page.getByRole("tab", { name: "All bills", exact: true });
  await all.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Your shares" })).toBeFocused();
  await page.getByRole("link", { name: "Internet", exact: true }).click();
  await page.getByRole("button", { name: "Mark paid for Sarah" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "read-only demo" }),
  ).toContainText("read-only demo");
  await expect(
    page.getByRole("button", { name: "Mark paid for Sarah" }),
  ).toBeEnabled();
});

test("mobile add icon is centered inside its button", async ({ page }) => {
  await page.setViewportSize({ width: 350, height: 908 });
  await page.goto("/demo");
  const button = page.getByRole("button", { name: "Add a bill", exact: true });
  const offset = await button.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const icon = element.querySelector("svg")!.getBoundingClientRect();
    return {
      x: Math.abs(bounds.x + bounds.width / 2 - icon.x - icon.width / 2),
      y: Math.abs(bounds.y + bounds.height / 2 - icon.y - icon.height / 2),
    };
  });
  expect(offset.x).toBeLessThan(1);
  expect(offset.y).toBeLessThan(1);
});

test("payment actions keep their alignment when feedback appears", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const width of [350, 390, 891, 1280, 1822]) {
    await page.setViewportSize({ width, height: 908 });
    await page.goto("/demo/bills/00000000-0000-4000-8000-000000000011");
    for (const name of ["Emma", "Olivia"]) {
      const button = page.getByRole("button", {
        name: `${name === "Emma" ? "Undo payment for" : "Mark paid for"} ${name}`,
        exact: true,
      });
      const before = await button.boundingBox();
      await button.click();
      const row = button.locator("../..");
      const feedback = row.getByRole("alert");
      await expect(feedback).toContainText("read-only demo");
      await expect(
        feedback.getByRole("link", { name: "Sign up", exact: true }),
      ).toHaveAttribute("href", "/sign-up");
      const after = await button.boundingBox();
      expect(after!.x).toBeCloseTo(before!.x, 0);
      const rowBounds = await row.boundingBox();
      const alertBounds = await feedback.boundingBox();
      expect(alertBounds!.width).toBeCloseTo(rowBounds!.width, 0);
      expect(alertBounds!.y).toBeGreaterThan(after!.y + after!.height);
      expect(alertBounds!.x).toBeCloseTo(rowBounds!.x, 0);
      expect(
        await feedback.evaluate(
          (element) => element.scrollWidth <= element.clientWidth,
        ),
      ).toBe(true);
      expect(alertBounds!.height).toBeLessThan(220);
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});

test("split mode changes preserve dialog and control positions", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const width of [350, 891]) {
    await page.setViewportSize({ width, height: 908 });
    await page.goto("/demo");
    await page.getByRole("button", { name: "Add a bill", exact: true }).click();
    const dialog = page.getByRole("dialog");
    const tabs = dialog.getByRole("tablist");
    const submit = dialog.getByRole("button", {
      name: "Add bill",
      exact: true,
    });
    const before = {
      dialog: await dialog.boundingBox(),
      tabs: await tabs.boundingBox(),
      submit: await submit.boundingBox(),
    };
    await page.getByRole("tab", { name: "Custom amounts" }).click();
    await expect(page.getByLabel("Sarah’s share in dollars")).toBeVisible();
    await page.getByLabel("Sarah’s share in dollars").focus();
    await page.screenshot({
      path: test.info().outputPath(`custom-share-focus-${width}.png`),
    });
    for (const [key, locator] of Object.entries({ dialog, tabs, submit })) {
      const after = await locator.boundingBox();
      const original = before[key as keyof typeof before]!;
      expect(after!.y).toBeCloseTo(original.y, 0);
      expect(after!.height).toBeCloseTo(original.height, 0);
    }
    await page.getByRole("tab", { name: "Split equally" }).click();
    expect((await dialog.boundingBox())!.height).toBeCloseTo(
      before.dialog!.height,
      0,
    );
    await dialog.getByRole("switch", { name: "Repeat every month" }).check();
    await dialog.getByText("Category & optional note", { exact: true }).click();
    await expect(dialog.getByLabel("Note (optional)")).toBeVisible();
    if (width === 891) {
      expect(
        await dialog.evaluate(
          (element) => element.scrollHeight - element.clientHeight,
        ),
      ).toBeLessThanOrEqual(1);
    }
    await submit.scrollIntoViewIfNeeded();
    await expect(submit).toBeInViewport();
    await page.screenshot({
      path: test.info().outputPath(`expanded-bill-${width}.png`),
    });
  }
});

test("recurring custom shares stay visible above a simulated phone keyboard", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/demo/bills");
  await page
    .getByRole("group", { name: "Electricity recurring bill", exact: true })
    .getByRole("button", { name: "Manage", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Edit recurring bill" });
  await expect(dialog.getByRole("heading")).toBeFocused();
  await page.getByRole("tab", { name: "Custom amounts" }).click();
  const sarah = page.getByLabel("Sarah’s share in dollars");
  const emma = page.getByLabel("Emma’s share in dollars");
  const olivia = page.getByLabel("Olivia’s share in dollars");
  const save = dialog.getByRole("button", { name: "Save future settings" });
  await sarah.focus();

  // Playwright cannot open an OS keyboard. Model Safari's separate visual
  // viewport (including its pan offset), leaving the layout viewport unchanged.
  await page.evaluate(() => {
    const viewport = window.visualViewport!;
    Object.defineProperty(viewport, "height", {
      configurable: true,
      value: 360,
    });
    Object.defineProperty(viewport, "offsetTop", {
      configurable: true,
      value: 55,
    });
    viewport.dispatchEvent(new Event("resize"));
    viewport.dispatchEvent(new Event("scroll"));
  });
  const expectUnobscured = async (input: Locator) => {
    await expect(input).toBeFocused();
    await expect
      .poll(async () =>
        input.evaluate((element) => {
          const bounds = element.getBoundingClientRect();
          const visible = element
            .closest("[data-bill-fields]")!
            .getBoundingClientRect();
          const viewport = window.visualViewport!;
          return (
            bounds.top >= visible.top &&
            bounds.bottom <= visible.bottom &&
            bounds.top >= viewport.offsetTop &&
            bounds.bottom <= viewport.offsetTop + viewport.height
          );
        }),
      )
      .toBe(true);
    const bounds = await save.boundingBox();
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(415);
    expect(bounds!.y).toBeGreaterThan((await input.boundingBox())!.y);
  };
  await expectUnobscured(sarah);
  await sarah.fill("60.00");
  await expect(dialog.getByRole("status")).toContainText(
    "$2.14 left to assign",
  );
  await expect(save).toBeDisabled();
  await dialog.getByRole("button", { name: "Next", exact: true }).click();
  await expectUnobscured(emma);
  await emma.fill("60.00");
  await emma.press("Enter");
  await expectUnobscured(olivia);
  await olivia.fill("70.00");
  await expect(dialog.getByRole("status")).toContainText(
    "$3.58 over the total",
  );
  await expect(save).toBeDisabled();
  await olivia.fill("66.421");
  await expect(dialog.getByRole("status")).toContainText(
    "up to 2 decimal places",
  );
  await expect(save).toBeDisabled();
  await olivia.fill("66.42");
  await expect(dialog.getByRole("status")).toContainText("All shares add up");
  await expect(save).toBeEnabled();
  await dialog.getByRole("button", { name: "Done", exact: true }).click();
  await expect(dialog.getByRole("heading")).toBeFocused();
  await page.evaluate(() => {
    const viewport = window.visualViewport!;
    Reflect.deleteProperty(viewport, "height");
    Reflect.deleteProperty(viewport, "offsetTop");
    viewport.dispatchEvent(new Event("resize"));
  });
  await expect
    .poll(async () => (await dialog.boundingBox())!.height)
    .toBeGreaterThan(600);
  await expect(sarah).toHaveValue("60.00");
  await expect(emma).toHaveValue("60.00");
  await expect(olivia).toHaveValue("66.42");
  await save.click();
  await expect(dialog.getByRole("alert")).toContainText("read-only demo");
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page
    .getByRole("group", { name: "Electricity recurring bill", exact: true })
    .getByRole("button", { name: "Manage", exact: true })
    .click();
  await expect(dialog.getByLabel("Total amount ($)")).toHaveValue("186.42");
  expect(errors).toEqual([]);
});
