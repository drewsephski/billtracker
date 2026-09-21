"use server";
import { cookies, headers } from "next/headers";
import {
  allowAuthRequest,
  authClientKey,
  resetRequestMessage,
} from "./auth-throttle";
import {
  ACTIVE_HOUSEHOLD_COOKIE,
  invitationDestination,
} from "@/lib/domain/navigation";
import { rememberHousehold } from "./active-household";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { DomainError } from "@/lib/domain/bills";
import type { ActionResult } from "@/lib/domain/types";
import { authSchema } from "@/lib/domain/validation";
import { getAuth, requireUser } from "./auth";
import { appUrl } from "./environment";
import {
  acceptInvitation,
  createHousehold,
  inviteMember,
  inHousehold,
  revokeInvitation,
  updateHousehold,
} from "./households";
import { recordPayment, saveBill, updateTemplate } from "./bills";
function failure(error: unknown): ActionResult {
  if (error instanceof z.ZodError)
    return { error: error.issues[0]?.message || "Check your entries." };
  if (error instanceof DomainError) return { error: error.message };
  console.error(
    "Household operation failed",
    error instanceof Error ? error.name : "Unknown error",
  );
  return { error: "We couldn’t save that. Please try again." };
}
export async function authenticate(
  mode: "sign-in" | "sign-up",
  _state: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  let result;
  const next = String(form.get("next") || "/dashboard");
  const safeNext = invitationDestination(next);
  try {
    const values = authSchema.parse(Object.fromEntries(form));
    if (mode === "sign-up" && !values.name?.trim())
      return { error: "What should your roommates call you?" };
    if (
      !allowAuthRequest(
        values.email,
        authClientKey(await headers()),
        mode === "sign-up" ? "send" : "attempt",
      )
    )
      return { error: "Please wait a few minutes and try again." };
    result =
      mode === "sign-up"
        ? await getAuth().signUp.email({ ...values, name: values.name! })
        : await getAuth().signIn.email({ ...values, rememberMe: true });
    if (result.error)
      return {
        error:
          mode === "sign-in"
            ? "We couldn’t sign you in. Check your email and password, or reset your password."
            : "We couldn’t create the account. Try again, or sign in or reset your password if you already have an account.",
      };
  } catch (e) {
    return failure(e);
  }
  redirect(safeNext);
}
export async function signOut() {
  await getAuth().signOut();
  (await cookies()).delete(ACTIVE_HOUSEHOLD_COOKIE);
  redirect("/");
}
export async function createHouseholdAction(
  _state: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  try {
    const id = await createHousehold(user, Object.fromEntries(form));
    await rememberHousehold(id);
  } catch (e) {
    return failure(e);
  }
  redirect("/dashboard");
}
export async function saveBillAction(
  householdId: string,
  input: unknown,
  edit?: { id: string; version: number },
): Promise<ActionResult> {
  const user = await requireUser();
  try {
    const id = await saveBill(user, householdId, input, edit);
    revalidatePath("/", "layout");
    return { id, success: "Bill saved." };
  } catch (e) {
    return failure(e);
  }
}
export async function paymentAction(
  householdId: string,
  billId: string,
  splitId: string,
  undoPaymentId?: string,
): Promise<ActionResult> {
  const user = await requireUser();
  try {
    await recordPayment(user, householdId, billId, splitId, undoPaymentId);
    revalidatePath("/", "layout");
    return {
      success: undoPaymentId ? "Payment undone." : "Share marked as paid.",
    };
  } catch (e) {
    return failure(e);
  }
}
export async function templateAction(
  householdId: string,
  id: string,
  version: number,
  input: unknown,
  active: boolean,
): Promise<ActionResult> {
  const user = await requireUser();
  try {
    z.boolean().parse(active);
    z.number().int().positive().parse(version);
    await updateTemplate(user, householdId, id, version, input, active);
    revalidatePath("/", "layout");
    return { success: "Future bills updated." };
  } catch (e) {
    return failure(e);
  }
}
export async function inviteAction(
  householdId: string,
  _state: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  try {
    const url = await inviteMember(user, householdId, Object.fromEntries(form));
    revalidatePath("/household");
    return {
      url,
      success: "Invitation ready. Share this link with your roommate.",
    };
  } catch (e) {
    return failure(e);
  }
}
export async function revokeAction(
  householdId: string,
  id: string,
): Promise<ActionResult> {
  const user = await requireUser();
  try {
    await revokeInvitation(user, householdId, id);
    revalidatePath("/household");
    return { success: "Invitation revoked." };
  } catch (e) {
    return failure(e);
  }
}
export async function acceptAction(
  token: string,
  _state: ActionResult,
): Promise<ActionResult> {
  void _state;
  const user = await requireUser(`/join/${token}`);
  try {
    const id = await acceptInvitation(user, token);
    await rememberHousehold(id);
  } catch (e) {
    return failure(e);
  }
  redirect("/dashboard");
}
export async function settingsAction(
  householdId: string,
  _state: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  try {
    await updateHousehold(user, householdId, Object.fromEntries(form));
    revalidatePath("/", "layout");
    return { success: "Household settings saved." };
  } catch (e) {
    return failure(e);
  }
}
export async function sendVerification(
  _state: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  void _state;
  const user = await requireUser(invitationDestination(form.get("next")));
  try {
    if (!allowAuthRequest(user.email, authClientKey(await headers()), "send"))
      return {
        error: "Please wait a few minutes before requesting another code.",
      };
    const result = await getAuth().emailOtp.sendVerificationOtp({
      email: user.email,
      type: "email-verification",
    });
    return result.error
      ? {
          error:
            "We couldn’t send a verification code. Please try again shortly.",
        }
      : { success: "A verification code is on its way. Check your email." };
  } catch (e) {
    return failure(e);
  }
}
export async function verifyEmail(
  _state: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  const user = await requireUser(invitationDestination(form.get("next")));
  try {
    if (
      !allowAuthRequest(user.email, authClientKey(await headers()), "attempt")
    )
      return {
        error: "Too many attempts. Please wait a few minutes and try again.",
      };
    const otp = z
      .string()
      .regex(/^\d{6}$/, "Enter the six-digit code.")
      .parse(form.get("otp"));
    const result = await getAuth().emailOtp.verifyEmail({
      email: user.email,
      otp,
    });
    if (result.error)
      return {
        error: "That code didn’t work. Request a new code and try again.",
      };
  } catch (e) {
    return failure(e);
  }
  revalidatePath("/", "layout");
  redirect(invitationDestination(form.get("next")));
}
export async function requestPasswordReset(
  _state: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  try {
    const email = z
      .email()
      .parse(String(form.get("email") || "").trim())
      .toLowerCase();
    if (allowAuthRequest(email, authClientKey(await headers()), "send"))
      await getAuth().requestPasswordReset({
        email,
        redirectTo: `${appUrl()}/reset-password?next=${encodeURIComponent(invitationDestination(form.get("next")))}`,
      });
  } catch (e) {
    if (e instanceof z.ZodError)
      return { error: "Enter a valid email address." };
    // Keep account existence, provider failures, and throttling indistinguishable.
  }
  return { success: resetRequestMessage };
}
export async function resetPassword(
  _state: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  try {
    const value = z
      .object({
        token: z.string().min(1),
        password: z.string().min(8).max(128),
      })
      .parse(Object.fromEntries(form));
    if (
      !allowAuthRequest(value.token, authClientKey(await headers()), "attempt")
    )
      return {
        error: "Too many attempts. Please wait a few minutes and try again.",
      };
    const result = await getAuth().resetPassword({
      token: value.token,
      newPassword: value.password,
    });
    if (result.error)
      return {
        error:
          "That reset link is invalid or expired. Request a new link and try again.",
      };
    return { success: "Password updated. You can now sign in." };
  } catch (e) {
    return failure(e);
  }
}

export async function switchHouseholdAction(
  _state: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  try {
    const id = String(form.get("householdId") || "");
    await inHousehold(user, id, async () => rememberHousehold(id));
    revalidatePath("/", "layout");
  } catch (error) {
    return failure(error);
  }
  redirect(form.get("returnTo") === "/chat" ? "/chat" : "/dashboard");
}

export async function switchAccount(next: string) {
  await getAuth().signOut();
  (await cookies()).delete(ACTIVE_HOUSEHOLD_COOKIE);
  redirect(invitationDestination(next));
}
