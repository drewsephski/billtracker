import { beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AuthEntry } from "@/components/auth-entry";
import SignInPage from "@/app/sign-in/page";
import SignUpPage from "@/app/sign-up/page";
const session = vi.hoisted(() => vi.fn());
vi.mock("@/lib/server/auth", () => ({
  getAuth: () => ({ getSession: session }),
  requireUser: vi.fn(),
}));
beforeEach(() => session.mockResolvedValue({ data: null }));
it.each([SignInPage, SignUpPage])(
  "keeps recovery and password controls on a sanitized callback error",
  async (Page) => {
    const element = await Page({
      searchParams: Promise.resolve({
        error: "access_denied",
        error_description: "private provider detail",
      }),
    });
    const page = await AuthEntry(element.props);
    const html = renderToStaticMarkup(page);
    expect(html).toContain("Google connection was cancelled");
    expect(html).toContain('name="email"');
    expect(html).toContain('name="password"');
    expect(html).toContain("Continue with Google");
    expect(html).not.toContain("private provider detail");
    expect(html).not.toContain("lookup=1");
    expect(html).not.toContain("Confirm your email first");
  },
);
it("keeps public recovery controls available when session lookup fails", async () => {
  session.mockRejectedValueOnce(new Error("provider detail"));
  const page = await AuthEntry({
    mode: "sign-in",
    oauthError: "Google connection is temporarily unavailable.",
  });
  const html = renderToStaticMarkup(page);
  expect(html).toContain("Forgot your password?");
  expect(html).toContain("Continue with Google");
  expect(html).not.toContain("provider detail");
});
