import { beforeEach, describe, expect, it, vi } from "vitest";
import * as React from "react";
import { GoogleSignIn } from "@/components/google-sign-in";
import { ConnectedAccounts } from "@/components/connected-accounts";
import { Button } from "@/components/ui/button";
import { Feedback } from "@/components/feedback";
const mocks = vi.hoisted(() => ({
  social: vi.fn(),
  link: vi.fn(),
  refresh: vi.fn(),
  states: [] as unknown[],
  cursor: 0,
}));
vi.mock("@/lib/client/auth", () => ({
  authClient: { signIn: { social: mocks.social }, linkSocial: mocks.link },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useState: (initial: unknown) => {
    const index = mocks.cursor++;
    if (!(index in mocks.states)) mocks.states[index] = initial;
    return [
      mocks.states[index],
      (value: unknown) => {
        mocks.states[index] = value;
      },
    ];
  },
}));
type Element = React.ReactElement<{
  children?: React.ReactNode;
  onClick?: () => Promise<void>;
  disabled?: boolean;
  state?: { error?: string };
}>;
function find(node: React.ReactNode, type: unknown): Element {
  if (React.isValidElement(node)) {
    const element = node as Element;
    if (element.type === type) return element;
    for (const child of React.Children.toArray(element.props.children)) {
      try {
        return find(child, type);
      } catch {
        /* Search remaining children. */
      }
    }
  }
  throw new Error("Element not found");
}
function render<T>(component: () => T) {
  mocks.cursor = 0;
  return component();
}
beforeEach(() => {
  mocks.states = [];
  mocks.cursor = 0;
  vi.clearAllMocks();
  mocks.social.mockResolvedValue({
    data: { url: "https://accounts.google.com" },
  });
  mocks.link.mockResolvedValue({
    data: { url: "https://accounts.google.com" },
  });
});
describe("auth controls", () => {
  it.each(["sign-in", "sign-up"] as const)(
    "keeps %s Google on the installed signIn.social API and preserves recovery destination",
    async (mode) => {
      const view = render(() =>
        GoogleSignIn({ callbackURL: "/join/invitation", mode }),
      );
      expect(find(view, Button).props.children).toContain(
        "Continue with Google",
      );
      await find(view, Button).props.onClick!();
      expect(mocks.social).toHaveBeenCalledWith({
        provider: "google",
        callbackURL: "/join/invitation",
        errorCallbackURL: `/${mode}?next=%2Fjoin%2Finvitation`,
      });
      expect(mocks.link).not.toHaveBeenCalled();
    },
  );
  it("links from Settings using linkSocial, never signIn.social", async () => {
    const view = render(() => ConnectedAccounts({ googleConnected: false }));
    await find(view, Button).props.onClick!();
    expect(mocks.link).toHaveBeenCalledWith({
      provider: "google",
      callbackURL: "/settings",
      errorCallbackURL: "/settings",
    });
    expect(mocks.social).not.toHaveBeenCalled();
  });
  it("disables already-connected Google and offers retry for account-list outages", () => {
    expect(
      find(
        render(() => ConnectedAccounts({ googleConnected: true })),
        Button,
      ).props.disabled,
    ).toBe(true);
    mocks.states = [];
    const button = find(
      render(() => ConnectedAccounts({ googleConnected: null })),
      Button,
    );
    expect(button.props.children).toBe("Refresh accounts");
    button.props.onClick!();
    expect(mocks.refresh).toHaveBeenCalled();
  });
  it.each([
    "email_doesn't_match",
    "account_already_linked_to_different_user",
    "access_denied",
    "provider_not_found",
  ])("recovers safely from link failure %s", async (code) => {
    mocks.link.mockResolvedValueOnce({
      error: { code, message: "secret provider details" },
    });
    await find(
      render(() => ConnectedAccounts({ googleConnected: false })),
      Button,
    ).props.onClick!();
    const view = render(() => ConnectedAccounts({ googleConnected: false }));
    expect(find(view, Feedback).props.state?.error).toBeTruthy();
    expect(find(view, Feedback).props.state?.error).not.toContain("secret");
    expect(find(view, Button).props.disabled).toBe(false);
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
  it("sanitizes immediate Google sign-in errors and transport exceptions", async () => {
    mocks.social.mockResolvedValueOnce({
      error: { code: "account_not_linked", message: "private" },
    });
    await find(
      render(() => GoogleSignIn({ callbackURL: "/dashboard" })),
      Button,
    ).props.onClick!();
    expect(
      find(
        render(() => GoogleSignIn({ callbackURL: "/dashboard" })),
        Feedback,
      ).props.state?.error,
    ).toContain("reset your password");
    mocks.social.mockRejectedValueOnce(new Error("private"));
    await find(
      render(() => GoogleSignIn({ callbackURL: "/dashboard" })),
      Button,
    ).props.onClick!();
    expect(
      find(
        render(() => GoogleSignIn({ callbackURL: "/dashboard" })),
        Feedback,
      ).props.state?.error,
    ).not.toContain("private");
  });
});
