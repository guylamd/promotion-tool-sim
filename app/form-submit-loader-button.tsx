"use client";

import { useFormStatus } from "react-dom";

type Props = {
  idleLabel: string;
  loadingLabel: string;
  className: string;
  disabled?: boolean;
  formAction?: (formData: FormData) => void | Promise<void>;
  form?: string;
};

export function FormSubmitLoaderButton({
  idleLabel,
  loadingLabel,
  className,
  disabled = false,
  formAction,
  form,
}: Props) {
  const { pending } = useFormStatus();

  return (
    <>
      <button
        className={className}
        type="submit"
        formAction={formAction}
        form={form}
        disabled={pending || disabled}
      >
        {pending ? loadingLabel : idleLabel}
      </button>
      {pending ? (
        <div className="loaderOverlay" role="status" aria-live="polite">
          <div className="loaderCard">
            <img className="loaderLogo" src="/whalo-logo.gif" alt="Loading" />
            <p className="loaderText">{loadingLabel}</p>
          </div>
        </div>
      ) : null}
    </>
  );
}
