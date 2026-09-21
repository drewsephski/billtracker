import { beforeEach, expect, it, vi } from "vitest";
import SettingsPage from "@/app/(app)/settings/page";
const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  listAccounts: vi.fn(),
  currentHousehold: vi.fn(),
}));
vi.mock("@/lib/server/auth", () => ({
  requireUser: mocks.requireUser,
  getAuth: () => ({ listAccounts: mocks.listAccounts }),
}));
vi.mock("@/lib/server/current", () => ({
  currentHousehold: mocks.currentHousehold,
}));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({
    id: "existing",
    email: "existing@example.com",
  });
  mocks.currentHousehold.mockResolvedValue({});
});
it("authenticates before checking linked accounts and trusts only provider state", async () => {
  mocks.listAccounts.mockResolvedValue({ data: [{ providerId: "google" }] });
  const page = await SettingsPage({ searchParams: Promise.resolve({}) });
  expect(page.props.googleConnected).toBe(true);
  expect(mocks.requireUser.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.listAccounts.mock.invocationCallOrder[0],
  );
});
it("never claims Google was connected from a callback query alone", async () => {
  mocks.listAccounts.mockResolvedValue({
    data: [{ providerId: "credential" }],
  });
  const page = await SettingsPage({
    searchParams: Promise.resolve({ error: "email_doesn't_match" }),
  });
  expect(page.props.googleConnected).toBe(false);
  expect(page.props.oauthError).toContain("Homeshare email");
});
it("allows Settings to render with unknown account status during an outage", async () => {
  mocks.listAccounts.mockRejectedValue(new Error("private details"));
  const page = await SettingsPage({ searchParams: Promise.resolve({}) });
  expect(page.props.googleConnected).toBeNull();
  expect(mocks.currentHousehold).toHaveBeenCalled();
  expect(JSON.stringify(page.props)).not.toContain("private details");
});
it("does not read account state when authentication fails", async () => {
  mocks.requireUser.mockRejectedValueOnce(new Error("redirect to sign-in"));
  await expect(
    SettingsPage({ searchParams: Promise.resolve({}) }),
  ).rejects.toThrow("sign-in");
  expect(mocks.listAccounts).not.toHaveBeenCalled();
});
