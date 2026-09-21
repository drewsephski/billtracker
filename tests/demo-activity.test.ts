import { describe, expect, it } from "vitest";
import { demoActivityPrompts, demoActivityReply } from "@/lib/demo-activity";

describe("landing activity preview", () => {
  it("keeps the example requests within one character of each other", () => {
    const lengths = demoActivityPrompts.map((prompt) => prompt.text.length);
    expect(Math.max(...lengths) - Math.min(...lengths)).toBeLessThanOrEqual(1);
  });

  it.each([
    ["own-share", "Internet"],
    ["new-bill", "Household supplies"],
    ["roommate-share", "Gas"],
  ] as const)("creates a reviewable %s preview for %s", (key, name) => {
    const reply = demoActivityReply(key, "2026-09-21");

    expect(reply.kind).toBe("proposal");
    expect(reply.proposal?.name).toBe(name);
    expect(reply.message).toContain("Nothing is saved in this preview");
  });
});
