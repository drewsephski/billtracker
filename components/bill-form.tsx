"use client";
import { AnimatedIcon } from "@/components/icons/animated-icon";
import { useState, useTransition } from "react";
import { useBillEditorViewport } from "./use-bill-editor-viewport";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";
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
  FieldGroup,
  FieldLabel,
  FieldSet,
  FieldLegend,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Textarea } from "@/components/ui/textarea";
import { Disclosure } from "@/components/ui/disclosure";
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
  triggerLabel,
}: {
  householdId: string;
  members: MemberView[];
  today: string;
  bill?: BillView;
  template?: TemplateView;
  demo?: boolean;
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant={bill || template ? "outline" : "default"}
          size={bill || template || triggerLabel ? "default" : "icon"}
          className={
            bill || template || triggerLabel
              ? undefined
              : "size-12 gap-0 p-0 sm:h-11 sm:w-auto sm:gap-2 sm:px-4"
          }
          aria-label={
            triggerLabel ||
            (bill ? "Edit bill" : template ? "Manage" : "Add a bill")
          }
        >
          {bill || template ? (
            <AnimatedIcon name="pencil" data-icon="inline-start" />
          ) : (
            <AnimatedIcon name="plus" />
          )}
          <span
            className={
              bill || template || triggerLabel ? undefined : "hidden sm:inline"
            }
          >
            {triggerLabel ||
              (bill ? "Edit bill" : template ? "Manage" : "Add a bill")}
          </span>
        </Button>
      </DialogTrigger>
      <DialogContent
        className="bill-editor sm:max-w-md"
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader className="shrink-0 gap-1 border-b px-5 py-4 pr-12">
          <DialogTitle>
            {bill
              ? "Edit this bill"
              : template
                ? "Edit recurring bill"
                : "Add a bill"}
          </DialogTitle>
          <DialogDescription
            className={bill || template ? undefined : "sr-only"}
          >
            {bill
              ? "Changes apply to this bill only."
              : template
                ? "Updates apply only to bills not yet created."
                : "A few details. A fair share for everyone."}
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
  const formRef = useBillEditorViewport();
  const [focusedShare, setFocusedShare] = useState<string | null>(null);
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
  let splitMessage = "Enter a total to preview the split.";
  let splitDetail = "";
  let splitInvalid = false;
  try {
    const total = parseMoney(amount);
    if (mode === "custom") {
      const assigned = selected.reduce(
        (sum, id) => sum + parseMoney(custom[id] || "0"),
        0,
      );
      const remaining = total - assigned;
      splitMessage =
        remaining === 0
          ? "All shares add up"
          : remaining > 0
            ? `${money(remaining)} left to assign`
            : `${money(-remaining)} over the total`;
      splitDetail = `${money(assigned)} of ${money(total)} assigned`;
      splitInvalid = remaining < 0;
    } else {
      splitMessage = `${money(total)} split equally`;
      splitDetail = `Between ${selected.length} ${selected.length === 1 ? "roommate" : "roommates"}`;
    }
    if (!selected.length) splitMessage = "Select at least one roommate.";
    if (total === 0) splitMessage = "Enter a total greater than $0.00.";
  } catch {
    if (amount) splitMessage = "Use amounts with up to 2 decimal places.";
  }
  const shareInputs = () =>
    Array.from(
      formRef.current?.querySelectorAll<HTMLInputElement>(
        "[data-share-input]",
      ) || [],
    );
  const finishShare = () => {
    const inputs = shareInputs();
    const index = inputs.findIndex(
      (input) => input.dataset.shareInput === focusedShare,
    );
    const next = inputs[index + 1];
    if (index >= 0 && next) next.focus({ preventScroll: true });
    else
      formRef.current
        ?.closest('[role="dialog"]')
        ?.querySelector<HTMLElement>('[data-slot="dialog-title"]')
        ?.focus({ preventScroll: true });
  };
  const hasNextShare =
    focusedShare !== null &&
    members.filter((member) => selected.includes(member.id)).at(-1)?.id !==
      focusedShare;

  return (
    <form
      ref={formRef}
      className="flex min-h-0 flex-1 flex-col"
      onFocusCapture={(event) => {
        if (
          event.target instanceof HTMLElement &&
          event.target.closest("[data-share-navigation]")
        )
          return;
        setFocusedShare(
          event.target instanceof HTMLInputElement
            ? event.target.dataset.shareInput || null
            : null,
        );
      }}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          setFocusedShare(null);
      }}
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
      <div
        data-bill-fields
        className="minimal-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4"
      >
        <FieldGroup className="gap-3 [&_[data-slot=input]]:min-h-11 [&_[data-slot=field][data-orientation=vertical]]:gap-1">
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
          <div className="grid grid-cols-2 gap-3">
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
                <DatePicker
                  id="bill-date"
                  name="dueDate"
                  defaultValue={bill?.dueDate || today}
                  today={today}
                />
              )}
            </Field>
          </div>
          {!bill && (
            <Field orientation="horizontal" className="min-h-11">
              <FieldLabel htmlFor="bill-recurring">
                <AnimatedIcon name="refresh-cw" className="size-4" />
                {template ? "Generate monthly bills" : "Repeat every month"}
              </FieldLabel>
              <Switch
                id="bill-recurring"
                checked={template ? active : recurring}
                onCheckedChange={template ? setActive : setRecurring}
              />
            </Field>
          )}
          <FieldSet className="gap-2">
            <FieldLegend className="mb-0 text-sm">
              Who’s sharing this bill?
            </FieldLegend>
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
            <div className="divide-y divide-border/60 rounded-xl bg-muted/60">
              {members.map((member) => (
                <Field
                  key={member.id}
                  orientation="horizontal"
                  className="min-h-14 gap-3 px-3 py-1.5 focus-within:bg-secondary/60"
                >
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
                  <FieldLabel
                    htmlFor={`member-${member.id}`}
                    className="min-h-10 min-w-0 flex-1 break-words"
                  >
                    {member.name}
                  </FieldLabel>
                  {mode === "custom" && selected.includes(member.id) ? (
                    <Input
                      aria-label={`${member.name}’s share in dollars`}
                      aria-describedby="bill-split-status"
                      data-share-input={member.id}
                      enterKeyHint={
                        members.filter((m) => selected.includes(m.id)).at(-1)
                          ?.id === member.id
                          ? "done"
                          : "next"
                      }
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          finishShare();
                        }
                      }}
                      inputMode="decimal"
                      value={custom[member.id] || ""}
                      onChange={(e) =>
                        setCustom((old) => ({
                          ...old,
                          [member.id]: e.target.value,
                        }))
                      }
                      placeholder="0.00"
                      className="h-11 w-28 shrink-0 bg-background text-right tabular-nums"
                    />
                  ) : (
                    <Text
                      small
                      muted
                      className="flex h-11 w-28 shrink-0 items-center justify-end tabular-nums animate-in fade-in duration-150 motion-reduce:animate-none"
                    >
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
            </div>
          </FieldSet>
          <Disclosure
            title="Category & optional note"
            defaultOpen={Boolean(bill?.notes)}
          >
            <div className="space-y-2">
              <Field orientation="horizontal" className="gap-3">
                <FieldLabel htmlFor="bill-category">Category</FieldLabel>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger
                    id="bill-category"
                    className="min-h-11 w-auto min-w-0 flex-1"
                  >
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
              {!template && (
                <Field>
                  <FieldLabel htmlFor="bill-notes">
                    Note{" "}
                    <span className="text-muted-foreground">(optional)</span>
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
            </div>
          </Disclosure>
          {demo && (
            <Text small muted>
              Read-only demo.{" "}
              <Link href="/sign-up" className="underline underline-offset-4">
                Create your household
              </Link>{" "}
              to save.
            </Text>
          )}
        </FieldGroup>
      </div>
      <div className="shrink-0 space-y-2 border-t bg-popover px-5 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="flex min-h-11 items-center justify-between gap-2">
          <div
            id="bill-split-status"
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className="min-w-0 text-sm"
          >
            <p
              className={
                splitInvalid ? "font-medium text-destructive" : "font-medium"
              }
            >
              {splitMessage}
            </p>
            <p className="text-xs text-muted-foreground">
              {splitDetail || "Shares must match the bill total."}
            </p>
          </div>
          {focusedShare && (
            <Button
              data-share-navigation
              type="button"
              variant="secondary"
              size="sm"
              onPointerDown={(event) => event.preventDefault()}
              onClick={finishShare}
            >
              {hasNextShare ? "Next" : "Done"}
            </Button>
          )}
        </div>
        <Feedback state={state} />
        <Button
          type="submit"
          className="w-full"
          disabled={pending || allocation.length === 0}
        >
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
    </form>
  );
}
