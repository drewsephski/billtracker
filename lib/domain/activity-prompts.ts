import { canManageShare } from "./bills";
import type { HouseholdData } from "./types";

export type ActivityPrompt = { label: string; text: string; choice?: number };
export type ActivityGuidance = {
  placeholder: string;
  prompts: ActivityPrompt[];
};
export const promptPlaceholder =
  /\[(?:contribution|total|YYYY-MM-DD|amount|bill|name)\]/;
export const draftDollars = (cents: number) =>
  `$${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
export type PromptCandidate = {
  kind: "existing" | "new";
  payer: string;
  bill: string;
  dueDate: string | null;
  amount: string | null;
};
export const promptStyles = ["paid", "contributed", "put"] as const;
export type PromptStyle = (typeof promptStyles)[number];

// Construct only activities the viewer could actually record. Model selection
// uses array positions; household/member/bill IDs never leave the server.
export function activityPromptCandidates(
  data: HouseholdData,
): PromptCandidate[] {
  const candidates: PromptCandidate[] = [];
  for (const bill of [...data.bills].sort((a, b) =>
    a.dueDate.localeCompare(b.dueDate),
  )) {
    if (bill.paidCents >= bill.amountCents) continue;
    const shares = [...bill.splits].sort(
      (a, b) =>
        Number(b.memberId === data.viewer.id) -
        Number(a.memberId === data.viewer.id),
    );
    for (const share of shares) {
      if (
        share.paidCents >= share.amountCents ||
        !data.members.some((m) => m.id === share.memberId) ||
        !canManageShare(data.viewer.role, data.viewer.id, share.memberId)
      )
        continue;
      candidates.push({
        kind: "existing",
        payer: share.memberId === data.viewer.id ? "I" : share.name,
        bill: bill.name,
        dueDate: bill.dueDate,
        amount: draftDollars(share.amountCents - share.paidCents),
      });
      if (candidates.length >= 9) break;
    }
    if (candidates.length >= 9) break;
  }
  // These are explicitly NEW bill drafts, never claims that these bills exist.
  const eligible = data.members
    .filter((m) => canManageShare(data.viewer.role, data.viewer.id, m.id))
    .sort(
      (a, b) =>
        Number(b.id === data.viewer.id) - Number(a.id === data.viewer.id),
    );
  ["Internet", "Electricity", "Water"].forEach((bill, i) => {
    const payer = eligible[i % eligible.length];
    candidates.push({
      kind: "new",
      payer: !payer || payer.id === data.viewer.id ? "I" : payer.name,
      bill,
      dueDate: null,
      amount: null,
    });
  });
  return candidates.filter(
    (candidate, i) =>
      candidates.findIndex(
        (c) => JSON.stringify(c) === JSON.stringify(candidate),
      ) === i,
  );
}

export function renderActivityPrompt(
  candidate: PromptCandidate,
  style: PromptStyle,
): ActivityPrompt {
  const amount = candidate.amount ?? "$[contribution]";
  const verb =
    style === "contributed" ? "contributed" : style === "put" ? "put" : "paid";
  const share = candidate.payer === "I" ? "my" : "their";
  const bill =
    candidate.kind === "new"
      ? `a new ${candidate.bill} bill`
      : `${candidate.bill}, due ${candidate.dueDate}`;
  return {
    label:
      candidate.kind === "new"
        ? `Set up ${candidate.bill}`
        : `${candidate.payer === "I" ? "My" : `${candidate.payer}’s`} ${candidate.bill} share`,
    text: `${candidate.payer} ${verb} ${amount} toward ${share} share of ${bill}.${candidate.kind === "new" ? " The total is $[total], due [YYYY-MM-DD]." : ""}`,
  };
}
