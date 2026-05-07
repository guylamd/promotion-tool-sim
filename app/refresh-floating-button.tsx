"use client";

import { useEffect, useState } from "react";

type Props = {
  anchorId: string;
  refreshFormId: string;
};

const SCROLL_KEY = "promotion_simulator_refresh_scroll_y";

export function RefreshFloatingButton({ anchorId, refreshFormId }: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const raw = window.sessionStorage.getItem(SCROLL_KEY);
    if (raw) {
      const value = Number(raw);
      if (Number.isFinite(value)) {
        window.scrollTo({ top: value, behavior: "auto" });
      }
      window.sessionStorage.removeItem(SCROLL_KEY);
    }
  }, []);

  useEffect(() => {
    const anchor = document.getElementById(anchorId);
    if (!anchor) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => setVisible(!entry.isIntersecting),
      { threshold: 0.05 },
    );
    observer.observe(anchor);
    return () => observer.disconnect();
  }, [anchorId]);

  useEffect(() => {
    const form = document.getElementById(refreshFormId) as HTMLFormElement | null;
    if (!form) {
      return;
    }

    const onSubmit = () => {
      window.sessionStorage.setItem(SCROLL_KEY, String(window.scrollY));
    };
    form.addEventListener("submit", onSubmit);
    return () => form.removeEventListener("submit", onSubmit);
  }, [refreshFormId]);

  if (!visible) {
    return null;
  }

  return (
    <button
      type="submit"
      form={refreshFormId}
      className="floatingRefreshButton"
      aria-label="Refresh simulation"
    >
      Refresh simulation
    </button>
  );
}
