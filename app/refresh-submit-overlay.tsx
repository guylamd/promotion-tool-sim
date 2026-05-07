"use client";

import { useEffect, useState } from "react";

type Props = {
  formId: string;
};

export function RefreshSubmitOverlay({ formId }: Props) {
  const [active, setActive] = useState(false);

  useEffect(() => {
    const form = document.getElementById(formId) as HTMLFormElement | null;
    if (!form) {
      return;
    }

    const onSubmit = () => setActive(true);
    form.addEventListener("submit", onSubmit);
    return () => form.removeEventListener("submit", onSubmit);
  }, [formId]);

  if (!active) {
    return null;
  }

  return (
    <div className="loaderOverlay" role="status" aria-live="polite">
      <div className="loaderCard">
        <img className="loaderLogo" src="/whalo-logo.gif" alt="Loading" />
        <p className="loaderText">Refreshing simulation...</p>
      </div>
    </div>
  );
}
