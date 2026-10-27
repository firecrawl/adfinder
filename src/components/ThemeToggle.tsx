import { Monitor, Moon, Sun } from "lucide-react";
import { useState } from "react";

type Theme = "system" | "light" | "dark";
const KEY = "adfinder:theme";
const NEXT: Record<Theme, Theme> = { system: "light", light: "dark", dark: "system" };
const LABEL: Record<Theme, string> = {
  system: "Theme: match system",
  light: "Theme: light",
  dark: "Theme: dark",
};

function stored(): Theme {
  try {
    const t = localStorage.getItem(KEY);
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(stored);
  const pick = (t: Theme) => {
    setTheme(t);
    document.documentElement.dataset.theme =
      t === "system" ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : t;
    try {
      if (t === "system") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, t);
    } catch {
      // Without storage the choice still holds for this visit.
    }
  };
  const Icon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;
  return (
    <button
      className="theme-btn"
      aria-label={`${LABEL[theme]}. Click to change.`}
      title={LABEL[theme]}
      onClick={() => pick(NEXT[theme])}
    >
      <Icon size={16} />
    </button>
  );
}
