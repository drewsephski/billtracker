"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Pencil, Repeat2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSet,
  FieldLegend,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Text } from "@/components/ui/typography";
import { Feedback } from "./feedback";
import {
  categories,
  equalSplit,
  money,
  parseMoney,
  validateCustomSplit,
} from "@/lib/domain/bills";
import type {
  ActionResult,
  BillView,
  MemberView,
  TemplateView,
} from "@/lib/domain/types";
import { saveBillAction, templateAction } from "@/lib/server/actions";
export function BillDialog({
  householdId,
  members,
  today,
  bill,
  template,
  demo = false,
}: {
  householdId: string;
  members: MemberView[];
  today: string;
  bill?: BillView;
  template?: TemplateView;
  demo?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={bill || template ? "outline" : "default"}>
          {bill || template ? (
            <Pencil data-icon="inline-start" />
          ) : (
            <Plus data-icon="inline-start" />
          )}
          {bill ? "Edit bill" : template ? "Manage" : "Add a bill"}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {bill
              ? "Edit this bill"
              : template
                ? "Edit recurring bill"
                : "One less thing to keep track of."}
          </DialogTitle>
          <DialogDescription>
            {bill
              ? "Changes apply to this bill only."
              : template
                ? "Only future, ungenerated bills will change. Existing bills stay exactly as they are."
                : "Add the bill, split it fairly, and you’re all on the same page."}
          </DialogDescription>
        </DialogHeader>
        <BillForm
          householdId={householdId}
          members={members}
          today={today}
          bill={bill}
          template={template}
          demo={demo}
          onSaved={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
function BillForm({
  householdId,
  members,
  today,
  bill,
  template,
  demo,
  onSaved,
}: {
  householdId: string;
  members: MemberView[];
  today: string;
  bill?: BillView;
  template?: TemplateView;
  demo: boolean;
  onSaved: () => void;
}) {
  const initial = bill || template;
  const initialSplits = bill?.splits || template?.allocations;
  const [selected, setSelected] = useState(
    initialSplits?.map((s) => s.memberId) || members.map((m) => m.id),
  );
  const [amount, setAmount] = useState(
    initial ? (initial.amountCents / 100).toFixed(2) : "",
  );
  const [mode, setMode] = useState<"equal" | "custom">(
    template?.splitMode || (bill ? "custom" : "equal"),
  );
  const [custom, setCustom] = useState<Record<string, string>>(
    Object.fromEntries(
      initialSplits?.map((s) => [
        s.memberId,
        (s.amountCents / 100).toFixed(2),
      ]) || [],
    ),
  );
  const [recurring, setRecurring] = useState(false);
  const [templateDay, setTemplateDay] = useState(
    String(template?.dayOfMonth || 1),
  );
  const [active, setActive] = useState(template?.active ?? true);
  const [category, setCategory] = useState<string>(
    initial?.category || "Household",
  );
  const [state, setState] = useState<ActionResult>({});
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  let allocation: { memberId: string; amountCents: number }[] = [];
  try {
    allocation =
      mode === "equal"
        ? equalSplit(parseMoney(amount), selected)
        : validateCustomSplit(
            parseMoney(amount),
            selected.map((memberId) => ({
              memberId,
              amountCents: parseMoney(custom[memberId] || "0"),
            })),
          );
  } catch {
    /* Incomplete input is expected while typing. */
  }
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const input = {
          name: form.get("name"),
          category,
          amount,
          dueDate: template
            ? `2028-01-${templateDay.padStart(2, "0")}`
            : form.get("dueDate"),
          notes: form.get("notes") || "",
          splitMode: mode,
          memberIds: selected,
          customAmounts: custom,
          recurring,
        };
        if (demo) {
          setState({
            error:
              "This is a read-only demo. Create your household to save bills.",
          });
          return;
        }
        startTransition(async () => {
          try {
            const result = template
              ? await templateAction(
                  householdId,
                  template.id,
                  template.version,
                  input,
                  active,
                )
              : await saveBillAction(
                  householdId,
                  input,
                  bill ? { id: bill.id, version: bill.version } : undefined,
                );
            setState(result);
            if (!result.error) {
              onSaved();
              router.refresh();
              if (result.id && !bill) router.push(`/bills/${result.id}`);
            }
          } catch {
            setState({ error: "Connection interrupted. Please try again." });
          }
        });
      }}
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="bill-name">Bill name</FieldLabel>
          <Input
            id="bill-name"
            name="name"
            placeholder="e.g. Electricity"
            defaultValue={initial?.name}
            required
            maxLength={100}
          />
        </Field>
        <FieldGroup className="grid grid-cols-2 gap-4">
          <Field>
            <FieldLabel htmlFor="bill-amount">Total amount ($)</FieldLabel>
            <Input
              id="bill-amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              placeholder="0.00"
              required
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="bill-date">
              {template ? "Day of month" : "Due date"}
            </FieldLabel>
            {template ? (
              <Input
                id="bill-date"
                type="number"
                min={1}
                max={31}
                step={1}
                value={templateDay}
                onChange={(e) => setTemplateDay(e.target.value)}
                required
              />
            ) : (
              <Input
                id="bill-date"
                type="date"
                name="dueDate"
                min="2000-01-01"
                max="2100-12-31"
                defaultValue={bill?.dueDate || today}
                required
              />
            )}
          </Field>
        </FieldGroup>
        <Field>
          <FieldLabel htmlFor="bill-category">Category</FieldLabel>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger id="bill-category" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {categories.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        {!bill && (
          <Field orientation="horizontal">
            <FieldLabel htmlFor="bill-recurring">
              <Repeat2 className="size-4" />
              {template ? "Generate monthly bills" : "Repeat every month"}
            </FieldLabel>
            <Switch
              id="bill-recurring"
              checked={template ? active : recurring}
              onCheckedChange={template ? setActive : setRecurring}
            />
          </Field>
        )}
        {(recurring || template) && (
          <FieldDescription>
            Due on the same day each month. For shorter months, we use the last
            day. New bills appear one month ahead.
          </FieldDescription>
        )}
        <Separator />
        <FieldSet>
          <FieldLegend>Who’s sharing this bill?</FieldLegend>
          <Tabs
            value={mode}
            onValueChange={(v) => setMode(v as "equal" | "custom")}
          >
            <TabsList className="w-full">
              <TabsTrigger value="equal" className="flex-1">
                Split equally
              </TabsTrigger>
              <TabsTrigger value="custom" className="flex-1">
                Custom amounts
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <FieldGroup className="gap-3">
            {members.map((member) => (
              <Field key={member.id} orientation="horizontal">
                <Checkbox
                  id={`member-${member.id}`}
                  checked={selected.includes(member.id)}
                  onCheckedChange={(checked) =>
                    setSelected((old) =>
                      checked
                        ? [...old, member.id]
                        : old.filter((id) => id !== member.id),
                    )
                  }
                />
                <FieldLabel htmlFor={`member-${member.id}`} className="flex-1">
                  {member.name}
                </FieldLabel>
                {mode === "custom" && selected.includes(member.id) ? (
                  <Input
                    aria-label={`${member.name}’s share in dollars`}
                    inputMode="decimal"
                    value={custom[member.id] || ""}
                    onChange={(e) =>
                      setCustom((old) => ({
                        ...old,
                        [member.id]: e.target.value,
                      }))
                    }
                    placeholder="0.00"
                    className="w-28"
                  />
                ) : (
                  <Text small muted className="tabular-nums">
                    {allocation.find((a) => a.memberId === member.id)
                      ? money(
                          allocation.find((a) => a.memberId === member.id)!
                            .amountCents,
                        )
                      : "—"}
                  </Text>
                )}
              </Field>
            ))}
          </FieldGroup>
          <FieldDescription>
            {mode === "equal"
              ? "Any extra cents are distributed consistently between roommates."
              : "All selected shares must add up to the total."}
          </FieldDescription>
        </FieldSet>
        {!template && (
          <Field>
            <FieldLabel htmlFor="bill-notes">
              Note <span className="text-muted-foreground">(optional)</span>
            </FieldLabel>
            <Textarea
              id="bill-notes"
              name="notes"
              defaultValue={bill?.notes}
              placeholder="Anything your roommates should know?"
              maxLength={500}
              rows={2}
            />
          </Field>
        )}
        <Feedback state={state} />
        <div className="flex flex-wrap justify-end gap-2">
          {demo && (
            <Button asChild variant="outline">
              <Link href="/sign-up">Create your household</Link>
            </Button>
          )}
          <Button type="submit" disabled={pending || selected.length === 0}>
            {pending && (
              <Loader2 className="animate-spin" data-icon="inline-start" />
            )}
            {pending
              ? "Saving…"
              : template
                ? "Save future settings"
                : bill
                  ? "Save changes"
                  : "Add bill"}
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}
