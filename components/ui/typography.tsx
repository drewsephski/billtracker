import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
export function Heading({
  level = 1,
  className,
  ...props
}: ComponentProps<"h1"> & { level?: 1 | 2 | 3 }) {
  const Tag = `h${level}` as "h1" | "h2" | "h3";
  return (
    <Tag
      className={cn(
        "font-heading tracking-tight text-balance [overflow-wrap:anywhere]",
        level === 1
          ? "text-3xl font-semibold sm:text-4xl"
          : level === 2
            ? "text-xl font-semibold"
            : "text-base font-semibold",
        className,
      )}
      {...props}
    />
  );
}
export function Text({
  muted = false,
  small = false,
  className,
  ...props
}: ComponentProps<"p"> & { muted?: boolean; small?: boolean }) {
  return (
    <p
      className={cn(
        "leading-relaxed [overflow-wrap:anywhere]",
        muted && "text-muted-foreground",
        small ? "text-sm" : "text-base",
        className,
      )}
      {...props}
    />
  );
}
export function Eyebrow(props: ComponentProps<"p">) {
  return (
    <p
      {...props}
      className={cn(
        "[overflow-wrap:anywhere] text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground",
        props.className,
      )}
    />
  );
}
