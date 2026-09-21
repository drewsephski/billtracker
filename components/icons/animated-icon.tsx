"use client";

import { useEffect, useRef, type ComponentProps } from "react";
import { useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import { ArrowRightIcon } from "./lucide-animated/arrow-right";
import { ArrowUpRightIcon } from "./lucide-animated/arrow-up-right";
import { ArrowLeftIcon } from "./lucide-animated/arrow-left";
import { ChevronDownIcon } from "./lucide-animated/chevron-down";
import { ChevronUpIcon } from "./lucide-animated/chevron-up";
import { UndoIcon } from "./lucide-animated/undo";
import { HomeIcon } from "./lucide-animated/home";
import { UsersIcon } from "./lucide-animated/users";
import { RefreshCWIcon } from "./lucide-animated/refresh-cw";
import { ReceiptTextIcon } from "./lucide-animated/receipt-text";
import { SettingsIcon } from "./lucide-animated/settings";
import { PlusIcon } from "./lucide-animated/plus";
import { CheckIcon } from "./lucide-animated/check";
import { HeartHandshakeIcon } from "./lucide-animated/heart-handshake";

import { actionIcons } from "./action-icons";

const icons = {
  ...actionIcons,
  "arrow-right": ArrowRightIcon,
  "arrow-up-right": ArrowUpRightIcon,
  "arrow-left": ArrowLeftIcon,
  "chevron-down": ChevronDownIcon,
  "chevron-up": ChevronUpIcon,
  undo: UndoIcon,
  home: HomeIcon,
  users: UsersIcon,
  "refresh-cw": RefreshCWIcon,
  "receipt-text": ReceiptTextIcon,
  settings: SettingsIcon,
  plus: PlusIcon,
  check: CheckIcon,
  "heart-handshake": HeartHandshakeIcon,
};
export type AnimatedIconName = keyof typeof icons;
type IconHandle = { startAnimation: () => void; stopAnimation: () => void };

/** Trigger the upstream animations from their containing action or card. */
export function AnimatedIcon({
  name,
  className,
  ref: forwardedRef,
  ...props
}: ComponentProps<"span"> & { name: AnimatedIconName }) {
  const elementRef = useRef<HTMLSpanElement>(null);
  const controls = useRef<IconHandle>(null);
  const reduced = useReducedMotion();
  const Icon = icons[name];

  useEffect(() => {
    const element = elementRef.current;
    if (!element || reduced) return;
    const target =
      element.closest<HTMLElement>(
        "[data-animated-icon-trigger], a, button, summary, .action-surface, [data-slot=card], [data-slot=select-scroll-up-button], [data-slot=select-scroll-down-button]",
      ) ?? element;
    const start = () => {
      if (
        !target.matches(":disabled, [aria-disabled=true]") &&
        !window.matchMedia("(prefers-reduced-motion: reduce)").matches
      )
        controls.current?.startAnimation();
    };
    const stop = () => controls.current?.stopAnimation();
    const enter = (event: PointerEvent) => {
      if (event.pointerType !== "touch") start();
    };
    const leave = (event: PointerEvent) => {
      if (event.pointerType !== "touch") stop();
    };
    const blur = (event: FocusEvent) => {
      if (
        !(event.relatedTarget instanceof Node) ||
        !target.contains(event.relatedTarget)
      )
        stop();
    };
    target.addEventListener("pointerenter", enter);
    target.addEventListener("pointerleave", leave);
    target.addEventListener("pointerdown", start);
    target.addEventListener("pointercancel", stop);
    target.addEventListener("focusin", start);
    target.addEventListener("focusout", blur);
    return () => {
      target.removeEventListener("pointerenter", enter);
      target.removeEventListener("pointerleave", leave);
      target.removeEventListener("pointerdown", start);
      target.removeEventListener("pointercancel", stop);
      target.removeEventListener("focusin", start);
      target.removeEventListener("focusout", blur);
    };
  }, [name, reduced]);

  return (
    <span
      {...props}
      ref={(element) => {
        elementRef.current = element;
        if (typeof forwardedRef === "function") return forwardedRef(element);
        if (forwardedRef) forwardedRef.current = element;
      }}
      aria-hidden="true"
      data-animated-icon={name}
      className={cn(
        "inline-flex size-4 shrink-0 items-center justify-center align-middle [&>span]:flex [&>span]:size-full [&_svg]:size-full!",
        className,
      )}
    >
      <Icon key={`${name}-${Boolean(reduced)}`} ref={controls} size={16} />
    </span>
  );
}
