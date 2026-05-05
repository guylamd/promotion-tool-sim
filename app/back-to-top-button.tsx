"use client";

import { useEffect, useState } from "react";

type Props = {
  targetId: string;
};

export function BackToTopButton({ targetId }: Props) {
  const [visible, setVisible] = useState(false);
  const [idle, setIdle] = useState(false);

  useEffect(() => {
    const target = document.getElementById(targetId);
    if (!target) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        setVisible(!entry.isIntersecting);
      },
      { threshold: 0.05 },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [targetId]);

  useEffect(() => {
    if (!visible) {
      setIdle(false);
      return;
    }

    let idleTimeout: ReturnType<typeof setTimeout> | null = null;
    const scheduleIdle = () => {
      if (idleTimeout) {
        clearTimeout(idleTimeout);
      }
      setIdle(false);
      idleTimeout = setTimeout(() => setIdle(true), 1200);
    };

    const onActivity = () => scheduleIdle();
    window.addEventListener("scroll", onActivity, { passive: true });
    window.addEventListener("mousemove", onActivity);
    window.addEventListener("touchstart", onActivity, { passive: true });
    scheduleIdle();

    return () => {
      if (idleTimeout) {
        clearTimeout(idleTimeout);
      }
      window.removeEventListener("scroll", onActivity);
      window.removeEventListener("mousemove", onActivity);
      window.removeEventListener("touchstart", onActivity);
    };
  }, [visible]);

  if (!visible) {
    return null;
  }

  return (
    <button
      type="button"
      className={`backToTopButton ${idle ? "isIdle" : ""}`}
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      aria-label="Back to top"
    >
      ↑ Top
    </button>
  );
}
