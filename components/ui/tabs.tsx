"use client";
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";
import { Tabs as TabsPrimitive } from "radix-ui";
import { motion, useReducedMotion } from "framer-motion";

const TabsContext = React.createContext({ value: "", id: "" });
function Tabs({
  className,
  orientation = "horizontal",
  value,
  defaultValue,
  onValueChange,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  const [internal, setInternal] = React.useState(defaultValue || "");
  const id = React.useId();
  return (
    <TabsContext.Provider value={{ value: value ?? internal, id }}>
      <TabsPrimitive.Root
        data-slot="tabs"
        orientation={orientation}
        value={value ?? internal}
        onValueChange={(next) => {
          setInternal(next);
          onValueChange?.(next);
        }}
        className={cn(
          "group/tabs flex min-w-0 gap-3 data-[orientation=horizontal]:flex-col",
          className,
        )}
        {...props}
      />
    </TabsContext.Provider>
  );
}
const tabsListVariants = cva(
  "inline-flex min-h-12 w-fit items-center gap-1 rounded-full p-1 text-muted-foreground",
  {
    variants: { variant: { default: "bg-muted", line: "bg-transparent" } },
    defaultVariants: { variant: "default" },
  },
);
function TabsList({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> &
  VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  );
}
function TabsTrigger({
  className,
  children,
  value,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  const context = React.useContext(TabsContext);
  const reduced = useReducedMotion();
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      value={value}
      className={cn(
        "relative isolate inline-flex min-h-11 flex-1 shrink-0 items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground data-[state=active]:text-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {context.value === value && (
        <motion.span
          aria-hidden
          className="absolute inset-0 -z-10 rounded-full bg-card shadow-sm ring-1 ring-border/50"
          layoutId={reduced ? undefined : `${context.id}-pill`}
          transition={{ type: "spring", stiffness: 420, damping: 36 }}
        />
      )}
      {children}
    </TabsPrimitive.Trigger>
  );
}
function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn(
        "min-w-0 flex-1 outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
      {...props}
    />
  );
}
export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants };
