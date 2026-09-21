import { describe, expect, it } from "vitest";
import {
  invitationDestination,
  selectHousehold,
} from "@/lib/domain/navigation";
describe("household navigation", () => {
  it("restores only a household the viewer belongs to", () => {
    const homes = [{ id: "first" }, { id: "second" }];
    expect(selectHousehold(homes, "second")).toBe(homes[1]);
    expect(selectHousehold(homes, "foreign-household")).toBe(homes[0]);
    expect(selectHousehold(homes)).toBe(homes[0]);
    expect(selectHousehold([], "stale-cookie")).toBeUndefined();
  });
  it("preserves invitation destinations without accepting open redirects", () => {
    const destination = `/join/${"a".repeat(64)}`;
    expect(invitationDestination(destination)).toBe(destination);
    for (const value of [
      null,
      "https://example.com",
      "//example.com",
      "/join/short",
      destination + "?next=https://example.com",
    ]) {
      expect(invitationDestination(value)).toBe("/dashboard");
    }
  });
});
