export type ThemePreference = "system" | "light" | "dark";
export const themeStorageKey = "homeshare-theme";

// Runs in <head> before the body can paint; keep independent of module imports.
export const themeScript = `(()=>{let p="system";try{const s=localStorage.getItem("homeshare-theme");if(s==="light"||s==="dark")p=s}catch{}const d=p==="dark"||(p==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);const r=document.documentElement;r.classList.toggle("dark",d);r.style.colorScheme=d?"dark":"light";r.dataset.themePreference=p})()`;

export function getThemePreference(): ThemePreference {
  const preference = document.documentElement.dataset.themePreference;
  return preference === "light" || preference === "dark"
    ? preference
    : "system";
}

export function applyTheme(preference: ThemePreference) {
  const dark =
    preference === "dark" ||
    (preference === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  const root = document.documentElement;
  root.dataset.themePreference = preference;
  root.classList.toggle("dark", dark);
  root.style.colorScheme = dark ? "dark" : "light";
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", dark ? "#0a0a0a" : "#f7f7fa");
  window.dispatchEvent(new Event("theme-change"));
}

export function setThemePreference(preference: ThemePreference) {
  try {
    if (preference === "system") localStorage.removeItem(themeStorageKey);
    else localStorage.setItem(themeStorageKey, preference);
  } catch {
    /* Theme still works when browser storage is unavailable. */
  }
  applyTheme(preference);
}

export function subscribeTheme(callback: () => void) {
  window.addEventListener("theme-change", callback);
  return () => window.removeEventListener("theme-change", callback);
}
