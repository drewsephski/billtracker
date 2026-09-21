import {
  resolveActivity,
  type ActivityIntent,
  type ActivityReply,
} from "./domain/activity";
import type { ActivityPrompt } from "./domain/activity-prompts";
import { demoData } from "./demo";

export const demoActivityPrompts = [
  {
    label: "Record my contribution",
    text: "I paid $25 toward Internet this month. Done now!",
  },
  {
    label: "Set up a shared bill",
    text: "Add a $90 household bill today. Split it equally.",
  },
  {
    label: "Record Emma’s contribution",
    text: "Emma paid $30.80 toward Gas for the month. Done.",
  },
] as const satisfies readonly ActivityPrompt[];

export type DemoActivityKey = "own-share" | "new-bill" | "roommate-share";

const intents: Record<DemoActivityKey, (today: string) => ActivityIntent> = {
  "own-share": () => ({
    intent: "contribution",
    payer: "I",
    amount: "25",
    bill: "Internet",
    category: null,
    total: null,
    dueDate: null,
    period: null,
    household: null,
    incomplete: false,
  }),
  "new-bill": (today) => ({
    intent: "contribution",
    payer: "I",
    amount: "30",
    bill: "Household supplies",
    category: null,
    total: "90",
    dueDate: today,
    period: null,
    household: null,
    incomplete: false,
  }),
  "roommate-share": () => ({
    intent: "contribution",
    payer: "Emma",
    amount: "30.80",
    bill: "Gas",
    category: null,
    total: null,
    dueDate: null,
    period: null,
    household: null,
    incomplete: false,
  }),
};

export function demoActivityReply(
  key: DemoActivityKey,
  today: string,
): ActivityReply {
  const data = demoData();
  const resolution = resolveActivity(intents[key](today), data);

  if (resolution.kind !== "proposal") {
    return {
      kind: "error",
      message: "Choose one of the sample requests to preview the review flow.",
    };
  }

  const { proposal } = resolution;
  return {
    kind: "proposal",
    message:
      proposal.kind === "new"
        ? "I created a draft bill, split it equally, and prepared it for review. Nothing is saved in this preview."
        : "I matched the bill, checked the share, and prepared it for review. Nothing is saved in this preview.",
    proposal: {
      kind: proposal.kind,
      payerName: proposal.payerName,
      amountCents: proposal.amountCents,
      name: proposal.name,
      category: proposal.category,
      totalCents: proposal.totalCents,
      dueDate: proposal.dueDate,
      shareCents: proposal.shareCents,
      paidCents: proposal.paidCents,
      remainingCents: proposal.remainingCents,
      allocations: proposal.allocations.map(({ name, amountCents }) => ({
        name,
        amountCents,
      })),
    },
  };
}
