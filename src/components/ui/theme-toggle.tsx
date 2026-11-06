"use client";

import { useEffect, useState } from "react";
import { Moon, Sun, Monitor } from "lucide-react";

type Theme = "light" | "dark" | "system";
const KEY = "ih-theme";

function apply(theme: Theme) {
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
}

function readSaved(): Theme {
  try {
    const saved = localStorage.getItem(KEY) as Theme | null;
    return saved === "light" || saved === "dark" ? saved : "system";
  } catch {
    return "system";
  }
}

export function ThemeToggle() {
  // Initial value is "system" on the server; the saved choice is applied before paint by
  // `themeInitScript` and synchronized here after hydration via a subscription-style effect.
  const [theme, setTheme] = useState<Theme>("system");
  useEffect(() => {
    const id = requestAnimationFrame(() => setTheme(readSaved()));
    return () => cancelAnimationFrame(id);
  }, []);
  const cycle = () => {
    const next: Theme = theme === "system" ? "light" : theme === "light" ? "dark" : "system";
    setTheme(next);
    apply(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* ignore */
    }
  };
  const Icon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;
  return (
    <button type="button" onClick={cycle} className="btn btn-ghost btn-sm" aria-label={`Theme: ${theme}. Click to change.`} title={`Theme: ${theme}`}>
      <Icon size={16} aria-hidden />
      <span className="hidden sm:inline">{theme === "system" ? "Auto" : theme === "dark" ? "Dark" : "Light"}</span>
    </button>
  );
}

/** Inline script that applies the saved theme before first paint (prevents a flash). */
export const themeInitScript = `(function(){try{var t=localStorage.getItem('${KEY}');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})();`;
