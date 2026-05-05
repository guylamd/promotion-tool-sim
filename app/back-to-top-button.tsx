"use client";

import { useEffect, useState } from "react";

type Props = {
  targetId: string;
};

export function BackToTopButton({ targetId }: Props) {
  const [visible, setVisible] = useState(false);

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

  if (!visible) {
    return null;
  }

  return (
    <button
      type="button"
      className="backToTopButton"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      aria-label="Back to top"
    >
      Back to top
    </button>
  );
}
