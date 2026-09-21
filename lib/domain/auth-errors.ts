export type AuthSearchParams = {
  next?: string | string[];
  error?: string | string[];
};

// Only these fixed messages reach the UI. Never render provider descriptions,
// thrown messages, or arbitrary query-string values.
export function oauthErrorMessage(
  error: unknown,
  context: "sign-in" | "link" = "sign-in",
): string | undefined {
  if (error === undefined || error === null) return undefined;
  const code = typeof error === "string" ? error.toLowerCase() : "unknown";
  const recovery =
    context === "link"
      ? "Your current sign-in still works. Try connecting Google again from Settings."
      : "Try again or sign in with your email and password.";
  switch (code) {
    case "unauthorized":
    case "session_expired":
      return "Your session expired. Sign in with your email and password, then connect Google in Settings.";
    case "access_denied":
    case "user_cancelled":
    case "user_canceled":
    case "cancelled":
      return `Google connection was cancelled. ${recovery}`;
    case "email_doesn't_match":
    case "email_mismatch":
    case "account_already_linked_to_different_user":
      return context === "link"
        ? "That Google account cannot be connected here. Choose the Google account with your Homeshare email. Your current sign-in still works."
        : "That Google account cannot sign in here. Sign in with your email and password, or reset your password, then connect Google in Settings.";
    case "account_not_linked":
    case "unable_to_link_account":
    case "linking-failed":
    case "email_not_verified":
      return context === "link"
        ? "Google could not be connected. Your current sign-in still works. Try again with the same email, or use email and password."
        : "Sign in with your email and password, or reset your password, then connect Google in Settings.";
    case "account_already_linked":
      return "Google is already connected. Refresh Settings to check your connected accounts.";
    case "state_mismatch":
    case "state_not_found":
    case "invalid_state":
    case "invalid_callback_request":
    case "invalid_code":
    case "no_code":
    case "no_callback_url":
    case "invalid_callback":
      return `The Google sign-in link expired or could not be verified. ${recovery}`;
    default:
      return `Google connection is temporarily unavailable. ${recovery}`;
  }
}
