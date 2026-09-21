export const ACTIVE_HOUSEHOLD_COOKIE = "homeshare-household";
export function invitationDestination(value: unknown): string {
  return typeof value === "string" && /^\/join\/[a-f0-9]{64}$/.test(value)
    ? value
    : "/dashboard";
}
export function selectHousehold<T extends { id: string }>(
  households: T[],
  preferred?: string,
): T | undefined {
  return (
    households.find((household) => household.id === preferred) ?? households[0]
  );
}
