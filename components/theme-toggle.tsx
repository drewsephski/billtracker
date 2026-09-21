"use client";
import { useEffect, useSyncExternalStore } from "react";
import { AnimatedIcon } from "@/components/icons/animated-icon";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  applyTheme,
  getThemePreference,
  setThemePreference,
  subscribeTheme,
  themeStorageKey,
} from "@/lib/client/theme";

export function ThemeSync() {
  useEffect(() => {
    const system = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => applyTheme(getThemePreference());
    const storage = (event: StorageEvent) => {
      if (event.key !== themeStorageKey && event.key !== null) return;
      applyTheme(
        event.newValue === "dark" || event.newValue === "light"
          ? event.newValue
          : "system",
      );
    };
    sync();
    system.addEventListener("change", sync);
    window.addEventListener("storage", storage);
    return () => {
      system.removeEventListener("change", sync);
      window.removeEventListener("storage", storage);
    };
  }, []);
  return null;
}

export function ThemeToggle() {
  const dark = useSyncExternalStore(
    subscribeTheme,
    () => document.documentElement.classList.contains("dark"),
    () => false,
  );
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={dark ? "Use light mode" : "Use dark mode"}
      onClick={() => setThemePreference(dark ? "light" : "dark")}
    >
      <AnimatedIcon name={dark ? "sun" : "moon"} />
    </Button>
  );
}

export function ThemePreferenceControl() {
  const preference = useSyncExternalStore(
    subscribeTheme,
    getThemePreference,
    () => "system",
  );
  return (
    <div className="space-y-2">
      <Label htmlFor="theme-preference">Appearance</Label>
      <Select
        value={preference}
        onValueChange={(value) => {
          if (value === "system" || value === "light" || value === "dark")
            setThemePreference(value);
        }}
      >
        <SelectTrigger id="theme-preference" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="system">Use device setting</SelectItem>
          <SelectItem value="light">Light</SelectItem>
          <SelectItem value="dark">Dark</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
