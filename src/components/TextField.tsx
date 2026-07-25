import { useId } from "react";
import type { InputHTMLAttributes, ReactNode } from "react";

/**
 * A labelled text input with inline error and optional hint.
 *
 * Accessibility is the point: the label is programmatically tied to the input,
 * the error is announced via aria-describedby + role="alert", and aria-invalid
 * flips when there is an error — so screen readers and the styling stay in sync
 * without test IDs.
 */
export interface TextFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  label: string;
  /** Backend or client validation message; renders red + sets aria-invalid. */
  error?: string;
  hint?: ReactNode;
}

export function TextField({
  label,
  error,
  hint,
  className,
  required,
  ...props
}: TextFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
        {required && <span className="text-danger"> *</span>}
      </label>
      <input
        {...props}
        id={id}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : hint ? hintId : undefined}
        className={[
          "w-full rounded-lg border bg-surface px-3.5 py-2.5 text-sm text-foreground",
          "placeholder:text-muted/70 transition-colors",
          "focus:outline-none focus:ring-2 focus:ring-offset-0",
          error
            ? "border-danger focus:ring-danger/40"
            : "border-border focus:border-primary focus:ring-primary/30",
          "disabled:cursor-not-allowed disabled:opacity-60",
          className ?? "",
        ].join(" ")}
      />
      {error ? (
        <p id={errorId} role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
