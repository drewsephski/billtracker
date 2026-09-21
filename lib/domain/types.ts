import type { BillStatus, Category } from "./bills";
export type MemberView = {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: "owner" | "member";
};
export type PaymentView = {
  id: string;
  splitId: string;
  amountCents: number;
  recordedAt: string;
  reversedAt: string | null;
  memberName: string;
  billName: string;
  billId: string;
  recordedByName: string;
};
export type BillView = {
  id: string;
  householdId: string;
  name: string;
  category: Category;
  amountCents: number;
  dueDate: string;
  notes: string;
  templateId: string | null;
  createdBy: string;
  version: number;
  paidCents: number;
  status: BillStatus;
  hasPaymentHistory: boolean;
  splits: {
    id: string;
    memberId: string;
    name: string;
    amountCents: number;
    paidCents: number;
    /** Latest active contribution; undo targets this record only. */
    paymentId: string | null;
    activePaymentCount: number;
  }[];
};
export type TemplateView = {
  id: string;
  name: string;
  category: Category;
  amountCents: number;
  dayOfMonth: number;
  nextDueDate: string;
  active: boolean;
  version: number;
  splitMode: "equal" | "custom";
  allocations: { memberId: string; amountCents: number }[];
};
export type HouseholdData = {
  household: { id: string; name: string; timeZone: string };
  viewer: MemberView;
  members: MemberView[];
  bills: BillView[];
  payments: PaymentView[];
  templates: TemplateView[];
  today: string;
};
export type ActionResult = {
  error?: string;
  success?: string;
  id?: string;
  url?: string;
};
