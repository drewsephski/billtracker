"use client";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSyncExternalStore } from "react";
const subscribe = (cb: () => void) => {
  window.addEventListener("theme-change", cb);
  return () => window.removeEventListener("theme-change", cb);
};
export function ThemeToggle() {
  const dark = useSyncExternalStore(
    subscribe,
    () => document.documentElement.classList.contains("dark"),
    () => false,
  );
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={dark ? "Use light mode" : "Use dark mode"}
      onClick={() => {
        document.documentElement.classList.toggle("dark");
        window.dispatchEvent(new Event("theme-change"));
      }}
    >
      {dark ? <Sun /> : <Moon />}
    </Button>
  );
}
