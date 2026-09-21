import { describe, expect, it } from "vitest";
import { runInNewContext } from "node:vm";
import { themeScript } from "@/lib/client/theme";
import { gettingStartedProgress } from "@/lib/client/getting-started";
import manifest from "@/app/manifest";

describe("first-run guidance progression", () => {
  it("starts only at one member and zero bills", () => {
    expect(gettingStartedProgress(1, 0, null)).toBe("both");
    expect(gettingStartedProgress(1, 3, null)).toBeNull();
    expect(gettingStartedProgress(3, 0, null)).toBeNull();
    expect(gettingStartedProgress(3, 3, null)).toBeNull();
  });
  it("completes either step first, and never revives completed guidance", () => {
    expect(gettingStartedProgress(2, 0, "both")).toBe("bill");
    expect(gettingStartedProgress(1, 1, "both")).toBe("invite");
    expect(gettingStartedProgress(1, 0, "invite")).toBe("invite");
    expect(gettingStartedProgress(2, 1, "invite")).toBe("complete");
    expect(gettingStartedProgress(2, 1, "bill")).toBe("complete");
    expect(gettingStartedProgress(1, 0, "complete")).toBe("complete");
  });
});

describe("pre-paint theme bootstrap", () => {
  for (const [saved, systemDark, expected] of [
    [null, true, true],
    [null, false, false],
    ["dark", false, true],
    ["light", true, false],
    ["corrupt", true, true],
    ["blocked", true, true],
  ] as const) {
    it(`applies ${saved ?? "system"} with system dark=${systemDark} before hydration`, () => {
      let dark = false;
      const root = {
        classList: {
          toggle: (_name: string, value: boolean) => {
            dark = value;
          },
        },
        style: { colorScheme: "" },
        dataset: { themePreference: "" },
      };
      runInNewContext(themeScript, {
        document: { documentElement: root },
        localStorage: {
          getItem: () => {
            if (saved === "blocked") throw new Error("Blocked");
            return saved;
          },
        },
        matchMedia: () => ({ matches: systemDark }),
      });
      expect(dark).toBe(expected);
      expect(root.style.colorScheme).toBe(expected ? "dark" : "light");
    });
  }
});

it("installs within the same origin and launches the authenticated dashboard", () => {
  const app = manifest();
  expect(app.name).toBe("Homeshare");
  expect(app.display).toBe("standalone");
  expect(app.start_url).toBe("/dashboard");
  expect(app.scope).toBe("/");
  expect(app.icons?.some((icon) => icon.purpose === "maskable")).toBe(true);
});
