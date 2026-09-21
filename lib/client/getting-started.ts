export type GettingStartedProgress = "invite" | "bill" | "both" | "complete";

export function gettingStartedProgress(
  memberCount: number,
  billCount: number,
  previous: GettingStartedProgress | null,
): GettingStartedProgress | null {
  if (previous === "complete") return "complete";
  if (!previous && !(memberCount === 1 && billCount === 0)) return null;
  const invite = memberCount === 1 && previous !== "bill";
  const bill = billCount === 0 && previous !== "invite";
  return invite && bill
    ? "both"
    : invite
      ? "invite"
      : bill
        ? "bill"
        : "complete";
}
