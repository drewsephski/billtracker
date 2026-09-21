# homeshare design direction

A calm, mobile-first home for roommates’ shared bills. The existing routes,
authorization, services, money rules, recurrence, and payment history stay intact.

## Visual language

- Warm gray canvas, white surfaces, periwinkle accents, quiet status colors.
- Geist typography, rounded cards, pill actions, thin borders and subtle shadows.
- One generated matte blue blob, with two eyes and no mouth, used as a decorative
  brand asset. Text always communicates the actual state. No looping animation.
- Dark mode uses the same semantic tokens and preserves status contrast.

## Interaction decisions

- Home leads with the viewer’s remaining shares. Household progress is secondary;
  overdue household bills remain visible even when the viewer has paid their part.
- Four persistent mobile destinations: Home, Bills, Household, Settings.
- Bills use All bills / Your shares / Overdue / Paid filters; existing upcoming
  and unpaid URLs remain supported. Your shares includes only the viewer’s unpaid
  allocations, not all unpaid household bills.
- Radix dialogs become bottom sheets below 640px. Desktop keeps centered dialogs.
  Focus starts on the title, Escape closes, and focus returns to the trigger.
  The bill form ignores accidental backdrop clicks and keeps submit reachable.
- Bill category, optional notes, and payment help use a shared animated Radix disclosure. All existing fields,
  custom splits, recurring options, and edit permissions remain available.
- Framer Motion handles brief content/sheet entrances and shared-layout selection
  pills. Official Lucide Animated icons handle arrows and selected product icons;
  a shared adapter triggers their supplied animations from parent hover, focus,
  and touch without changing the upstream paths or timing.
  Both respect reduced motion.

- Bill dates use the official shadcn Calendar + Popover composition. The trigger
  shows a short month/day; the calendar exposes month/year selection. Date objects
  stay inside the calendar UI; form submissions remain YYYY-MM-DD strings.

## 21st references

- [Responsive modal](https://21st.dev/%40info-mdshakeeb/components/responsive-modal)
- [Tabs collection](https://21st.dev/community/components/explore/react-tabs)
- [Dialog behavior guide](https://docs.21st.dev/blog/react-modal-dialog-components)

Used as inspiration for responsive sheets and sliding segmented controls. The CLI
catalog search returned HTTP 401, so no registry code was installed. Existing
Radix primitives were adapted in place. `21st review` was run locally; token color
and disabled-control informational findings are intentional.

The date-picker pass retried the 21st catalog search (HTTP 401), then used the
[official shadcn date-picker composition](https://ui.shadcn.com/docs/components/radix/date-picker).
The local review flags calendar autofocus; this is intentional after the user
opens the picker, placing keyboard focus on the selected date.

## Verification boundaries

See `e2e/design.spec.ts` for 320/390/430px layout, sheet geometry, splits, filters,
read-only guards, keyboard focus, and reduced-motion coverage in Chromium and
mobile WebKit. These checks use public/demo data and do not prove real-device
keyboard behavior, live email delivery, database writes, or deployed behavior.
