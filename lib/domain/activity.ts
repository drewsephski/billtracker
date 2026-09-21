import { z } from "zod";
import {
  categories,
  dateLabel,
  canManageShare,
  equalSplit,
  money,
  parseMoney,
  validDate,
  type Category,
} from "./bills";
import { draftDollars, type ActivityGuidance } from "./activity-prompts";
import type { BillView, HouseholdData, MemberView } from "./types";

// Extraction only. No IDs, authorization decisions, or executable operations.
export const activityIntentSchema = z.strictObject({
  intent: z.enum([
    "contribution",
    "provider_payment",
    "multiple",
    "unsupported",
  ]),
  payer: z.string().max(100).nullable(),
  amount: z.string().max(40).nullable(),
  bill: z.string().max(100).nullable(),
  category: z.enum(categories).nullable(),
  total: z.string().max(40).nullable(),
  dueDate: z.string().max(40).nullable(),
  period: z.string().max(20).nullable(),
  household: z.string().max(80).nullable(),
  incomplete: z.boolean(),
});
export type ActivityIntent = z.infer<typeof activityIntentSchema>;
export type ActivitySelection = { memberId?: string; billId?: string };
export type ActivityProposal = {
  kind: "existing" | "new";
  memberId: string;
  payerName: string;
  amountCents: number;
  name: string;
  category: Category;
  totalCents: number;
  dueDate: string;
  shareCents: number;
  paidCents: number;
  remainingCents: number;
  billId: string | null;
  splitId: string | null;
  version: number | null;
  // Every member is snapshotted for new equal splits, including names shown.
  allocations: { memberId: string; name: string; amountCents: number }[];
};
export type ActivityResolution =
  | {
      kind: "clarification";
      message: string;
      guidance?: ActivityGuidance;
      choices?: { label: string; selection: ActivitySelection }[];
    }
  | { kind: "proposal"; proposal: ActivityProposal };
export type ActivityReply = {
  kind: "clarification" | "proposal" | "success" | "error";
  message: string;
  token?: string;
  guidance?: ActivityGuidance;
  choices?: string[];
  proposal?: Omit<
    ActivityProposal,
    "memberId" | "billId" | "splitId" | "version" | "allocations"
  > & {
    allocations: { name: string; amountCents: number }[];
  };
  billUrl?: string;
};
export const normalizeName = (s: string) =>
  s.normalize("NFKC").trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ");
export function memberCandidates(
  reference: string,
  members: MemberView[],
  viewerId: string,
) {
  const name = normalizeName(reference);
  if (["i", "me", "my", "myself"].includes(name))
    return members.filter((m) => m.id === viewerId);
  const exact = members.filter((m) => normalizeName(m.name) === name);
  return exact.length
    ? exact
    : members.filter((m) => normalizeName(m.name).split(" ")[0] === name);
}
export function categoryAlias(value: string): Category | null {
  const name = normalizeName(value)
    .replace(/\b(the|bill|share|of|toward|towards)\b/g, "")
    .trim();
  const aliases: Record<string, Category> = {
    electric: "Electricity",
    electricity: "Electricity",
    power: "Electricity",
    wifi: "Internet",
    "wi-fi": "Internet",
    internet: "Internet",
    rent: "Rent",
    water: "Water",
    gas: "Gas",
    household: "Household",
    other: "Other",
  };
  return aliases[name] ?? null;
}
const billName = (name: string) =>
  normalizeName(name)
    .replace(/^the /, "")
    .replace(/ bill$/, "");
export function billCandidates(intent: ActivityIntent, bills: BillView[]) {
  const exact = bills.filter(
    (b) => billName(b.name) === billName(intent.bill ?? ""),
  );
  const category = categoryAlias(intent.bill ?? "") ?? intent.category;
  let candidates = exact.length
    ? exact
    : category && category !== "Other"
      ? bills.filter((b) => b.category === category)
      : [];
  if (intent.dueDate)
    candidates = candidates.filter((b) => b.dueDate === intent.dueDate);
  if (intent.period)
    candidates = candidates.filter(
      (b) => b.dueDate.slice(0, 7) === intent.period,
    );
  return candidates;
}
export function contributionCents(value: string) {
  const cents = parseMoney(value);
  if (cents <= 0) throw new Error("Enter a contribution greater than zero.");
  return cents;
}
const clarify = (
  message: string,
  guidance?: ActivityGuidance,
): ActivityResolution => ({
  kind: "clarification",
  message,
  ...(guidance ? { guidance } : {}),
});
export function resolveActivity(
  raw: ActivityIntent,
  data: HouseholdData,
  selection: ActivitySelection = {},
): ActivityResolution {
  const intent = activityIntentSchema.parse(raw);
  if (intent.intent === "multiple")
    return clarify("Please record one financial activity at a time.");
  if (intent.intent === "provider_payment")
    return clarify(
      "This feature records roommate share contributions. Payments to a utility, provider, or landlord aren’t supported.",
    );
  if (intent.intent !== "contribution")
    return clarify(
      "Tell me about one roommate’s contribution toward their own share of a bill.",
    );
  if (
    intent.household &&
    normalizeName(intent.household) !== normalizeName(data.household.name)
  )
    return clarify(
      "Please switch to that household first, then record this activity there.",
    );
  if (!intent.payer)
    return clarify(
      "Who contributed? You can say “I” or use a roommate’s name.",
      {
        placeholder: "Who made the contribution?",
        prompts: data.members
          .filter((m) => canManageShare(data.viewer.role, data.viewer.id, m.id))
          .slice(0, 3)
          .map((m) => ({
            label: m.id === data.viewer.id ? "It was me" : m.name,
            text:
              m.id === data.viewer.id
                ? "I made the contribution."
                : `${m.name} made the contribution.`,
          })),
      },
    );
  if (!intent.amount)
    return clarify("How much did they contribute toward their own share?", {
      placeholder: "Enter the contribution amount…",
      prompts: [
        { label: "Enter an amount", text: "The contribution was $[amount]." },
      ],
    });
  if (!intent.bill)
    return clarify("Which bill was the contribution for?", {
      placeholder: "Which bill and due date?",
      prompts: data.bills
        .filter((b) =>
          b.splits.some((s) =>
            s.paidCents < s.amountCents &&
            canManageShare(data.viewer.role, data.viewer.id, s.memberId) &&
            memberCandidates(intent.payer!, data.members, data.viewer.id).some((m) => m.id === s.memberId),
          ),
        )
        .slice(0, 3)
        .map((b) => ({
          label: `${b.name} · ${dateLabel(b.dueDate, true)}`,
          text: `It’s for ${b.name}, due ${dateLabel(b.dueDate, true)}.`,
        })),
    });
  if (intent.incomplete)
    return clarify(
      "Please clarify whether this is their own share contribution and which bill you mean. Include a due date if you mean a particular period.",
    );
  let amountCents: number;
  let totalCents: number | null = null;
  try {
    amountCents = contributionCents(intent.amount);
    if (intent.total !== null) totalCents = contributionCents(intent.total);
  } catch {
    return clarify(
      "Use a positive dollar amount with at most two decimal places, for example 50.00.",
      {
        placeholder: "Enter the corrected dollar amount…",
        prompts: [
          {
            label: "Correct the amount",
            text: "The contribution is $[amount].",
          },
        ],
      },
    );
  }
  if (intent.dueDate && !validDate(intent.dueDate))
    return clarify(
      "What is the due date? Please include month, day, and year.",
      {
        placeholder: "Due date, including the year…",
        prompts: [
          { label: "Choose due date", text: "The due date is [due date]." },
        ],
      },
    );
  if (intent.period && !/^\d{4}-(0[1-9]|1[0-2])$/.test(intent.period))
    return clarify("Which month and year is this bill for?");
  if (
    intent.period &&
    intent.dueDate &&
    !intent.dueDate.startsWith(intent.period)
  )
    return clarify("The month and due date disagree. Which date should I use?");
  const people = memberCandidates(intent.payer, data.members, data.viewer.id);
  const payer = selection.memberId
    ? people.find((m) => m.id === selection.memberId)
    : people.length === 1
      ? people[0]
      : undefined;
  if (!payer) {
    if (people.length > 1)
      return {
        kind: "clarification",
        message: `Which ${intent.payer} did you mean?`,
        choices: people.map((m, i) => ({
          label: `${m.name}${people.filter((p) => p.name === m.name).length > 1 ? ` (roommate ${i + 1})` : ""}`,
          selection: { ...selection, memberId: m.id },
        })),
      };
    return clarify(
      `I can’t find ${intent.payer} in this household. Choose a current roommate.`,
      {
        placeholder: "Choose a current roommate…",
        prompts: data.members
          .filter((m) => canManageShare(data.viewer.role, data.viewer.id, m.id))
          .slice(0, 3)
          .map((m) => ({
            label: m.id === data.viewer.id ? "It was me" : m.name,
            text:
              m.id === data.viewer.id
                ? "I made the contribution."
                : `${m.name} made the contribution.`,
          })),
      },
    );
  }
  if (!canManageShare(data.viewer.role, data.viewer.id, payer.id))
    return clarify(
      "You can only record contributions toward your own share. The household owner can record someone else’s.",
      {
        placeholder: "Describe your own contribution…",
        prompts: [
          {
            label: "Record my own share",
            text: "I made the contribution toward my own share.",
          },
        ],
      },
    );
  const candidates = billCandidates(intent, data.bills);
  const bill = selection.billId
    ? candidates.find((b) => b.id === selection.billId)
    : candidates.length === 1
      ? candidates[0]
      : undefined;
  if (!bill && (candidates.length > 1 || selection.billId)) {
    if (!candidates.length)
      return clarify(
        "That bill changed or is no longer available. Please describe the bill again.",
      );
    if (candidates.length > 20)
      return clarify(
        "Several bills match. Please include the bill’s due date or month and year to narrow it down.",
      );
    return {
      kind: "clarification",
      message: "Which bill did you mean?",
      choices: candidates.map((b, i) => ({
        label: `${b.name} · ${money(b.amountCents)} · due ${dateLabel(b.dueDate, true)}${candidates.filter((c) => c.name === b.name && c.dueDate === b.dueDate && c.amountCents === b.amountCents).length > 1 ? ` (bill ${i + 1})` : ""}`,
        selection: { memberId: payer.id, billId: b.id },
      })),
    };
  }
  if (bill) {
    if (totalCents !== null && totalCents !== bill.amountCents)
      return clarify(
        `That bill’s total is ${money(bill.amountCents)}, which differs from the total you supplied. Please correct the total or identify a different bill.`,
      );
    if (bill.paidCents >= bill.amountCents)
      return clarify(
        "That bill is already fully settled. No contribution was recorded.",
      );
    const share = bill.splits.find((s) => s.memberId === payer.id);
    if (!share)
      return clarify(
        `${payer.name} does not have a share on that bill. Historical shares won’t be changed.`,
      );
    if (share.paidCents >= share.amountCents)
      return clarify(`${payer.name}’s share is already fully settled.`);
    if (amountCents > share.amountCents - share.paidCents)
      return clarify(
        `${payer.name} has ${money(share.amountCents - share.paidCents)} left on this share. Please correct the contribution amount.`,
        {
          placeholder: "Enter an amount within the remaining share…",
          prompts: [
            {
              label: `Use remaining ${money(share.amountCents - share.paidCents)}`,
              text: `The contribution is ${draftDollars(share.amountCents - share.paidCents)}.`,
            },
            {
              label: "Use a smaller amount",
              text: "The contribution is $[amount].",
            },
          ],
        },
      );
    return {
      kind: "proposal",
      proposal: {
        kind: "existing",
        memberId: payer.id,
        payerName: payer.name,
        amountCents,
        name: bill.name,
        category: bill.category,
        totalCents: bill.amountCents,
        dueDate: bill.dueDate,
        shareCents: share.amountCents,
        paidCents: share.paidCents,
        remainingCents: share.amountCents - share.paidCents - amountCents,
        billId: bill.id,
        splitId: share.id,
        version: bill.version,
        allocations: [],
      },
    };
  }
  if (!totalCents || !intent.dueDate)
    return clarify(
      `I don’t see a matching ${intent.bill} bill yet. What’s ${!totalCents && !intent.dueDate ? "the total bill amount and due date" : !totalCents ? "the total bill amount" : "the due date (including year)"}? The contribution is separate from the total.`,
      {
        placeholder:
          !totalCents && !intent.dueDate
            ? "What’s the full bill total and due date?"
            : !totalCents
              ? "What’s the full bill total?"
              : "When is the bill due? Include the year.",
        prompts: [
          {
            label:
              !totalCents && !intent.dueDate
                ? "Add total & date"
                : !totalCents
                  ? "Add bill total"
                  : "Choose due date",
            text:
              !totalCents && !intent.dueDate
                ? "The total is $[total], due [due date]."
                : !totalCents
                  ? "The total bill amount is $[total]."
                  : "The due date is [due date].",
          },
          {
            label: "Read my bill",
            text: "Use the attached bill’s total and due date for this contribution.",
          },
        ],
      },
    );
  const allocations = equalSplit(
    totalCents,
    data.members.map((m) => m.id),
  ).map((a) => ({
    ...a,
    name: data.members.find((m) => m.id === a.memberId)!.name,
  }));
  const share = allocations.find((a) => a.memberId === payer.id)!;
  if (amountCents > share.amountCents)
    return clarify(
      `${payer.name}’s equal share would be ${money(share.amountCents)}. Please correct the contribution or bill total. Nothing was created.`,
    );
  const category = categoryAlias(intent.bill) ?? intent.category ?? "Other";
  return {
    kind: "proposal",
    proposal: {
      kind: "new",
      memberId: payer.id,
      payerName: payer.name,
      amountCents,
      name: categoryAlias(intent.bill) ?? intent.bill,
      category,
      totalCents,
      dueDate: intent.dueDate,
      shareCents: share.amountCents,
      paidCents: 0,
      remainingCents: share.amountCents - amountCents,
      billId: null,
      splitId: null,
      version: null,
      allocations,
    },
  };
}
