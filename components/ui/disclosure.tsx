"use client";

import { useState, type ReactNode } from "react";
import { Collapsible } from "radix-ui";
import { motion, useReducedMotion } from "framer-motion";
import { AnimatedIcon } from "@/components/icons/animated-icon";
import { cn } from "@/lib/utils";

/** Keep form fields mounted so closing a section never discards a draft. */
export function Disclosure({
  title,
  children,
  defaultOpen = false,
  className,
  triggerClassName,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const reduced = useReducedMotion();
  return (
    <Collapsible.Root
      open={open}
      onOpenChange={setOpen}
      className={cn("rounded-xl border border-border/70 px-3", className)}
    >
      <Collapsible.Trigger
        className={cn(
          "flex min-h-11 w-full cursor-pointer items-center justify-between gap-3 rounded-lg text-left text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring",
          triggerClassName,
        )}
      >
        {title}
        <AnimatedIcon name={open ? "chevron-up" : "chevron-down"} />
      </Collapsible.Trigger>
      <Collapsible.Content forceMount asChild>
        <motion.div
          data-slot="disclosure-content"
          initial={false}
          animate={{ height: open ? "auto" : 0, opacity: open ? 1 : 0 }}
          transition={{
            duration: reduced ? 0 : 0.24,
            ease: [0.22, 1, 0.36, 1],
          }}
          inert={!open}
          aria-hidden={!open}
          className="-mx-1 overflow-hidden px-1"
        >
          <div className="space-y-3 pb-3 pt-1">{children}</div>
        </motion.div>
      </Collapsible.Content>
    </Collapsible.Root>
  );
}
