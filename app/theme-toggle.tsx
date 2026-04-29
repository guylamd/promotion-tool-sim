"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "promotion-theme";

type ThemeMode = "light" | "dark";

function applyTheme(mode: ThemeMode) {
  document.documentElement.setAttribute("data-theme", mode);
  document.body.setAttribute("data-theme", mode);
  const isDark = mode === "dark";
  document.documentElement.classList.toggle("theme-dark", isDark);
  document.body.classList.toggle("theme-dark", isDark);
}

export function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>("light");

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    const initial = saved === "dark" ? "dark" : "light";
    setMode(initial);
    applyTheme(initial);
  }, []);

  function toggle() {
    const next: ThemeMode = mode === "dark" ? "light" : "dark";
    setMode(next);
    applyTheme(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  }

  return (
    <button className="ghostButton" type="button" onClick={toggle}>
      {mode === "dark" ? "Light mode" : "Dark mode"}
    </button>
  );
}
