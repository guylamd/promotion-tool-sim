"use client";

import { useState } from "react";

type ThemeMode = "light" | "dark";

function applyTheme(mode: ThemeMode) {
  document.documentElement.setAttribute("data-theme", mode);
  document.body.setAttribute("data-theme", mode);
  const isDark = mode === "dark";
  document.documentElement.classList.toggle("theme-dark", isDark);
  document.body.classList.toggle("theme-dark", isDark);
}

export function ThemeSwitch({ initialTheme }: { initialTheme: ThemeMode }) {
  const [theme, setTheme] = useState<ThemeMode>(initialTheme);

  async function onToggle(nextTheme: ThemeMode) {
    setTheme(nextTheme);
    applyTheme(nextTheme);

    try {
      await fetch("/api/theme", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme: nextTheme }),
      });
    } catch {
      // Keep UI responsive even if persistence fails transiently.
    }
  }

  return (
    <button
      className="themeSwitch"
      type="button"
      onClick={() => onToggle(theme === "dark" ? "light" : "dark")}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
    >
      <span className="themeSwitchTrack">
        <span className="themeSwitchIcon themeSwitchIconSun" aria-hidden="true">
          {"\u2600"}
        </span>
        <span className="themeSwitchIcon themeSwitchIconMoon" aria-hidden="true">
          {"\u263E"}
        </span>
        <span className={`themeSwitchThumb ${theme === "dark" ? "isDark" : ""}`} />
      </span>
    </button>
  );
}
