import { useId } from "react";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

/**
 * A labelled text input with inline error and optional hint, composed from the
 * shadcn/ui Input and Label.
 *
 * The project's form ergonomics are preserved: one component owns the label,
 * the error (red + aria-invalid + role="alert", announced via aria-describedby)
 * and the hint, so forms keep binding `error={fieldErrors.x}` exactly as before.
 */
export interface TextFieldProps
  extends Omit<ComponentProps<"input">, "id"> {
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
      <Label htmlFor={id}>
        {label}
        {required && <span className="text-danger"> *</span>}
      </Label>
      <Input
        {...props}
        id={id}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : hint ? hintId : undefined}
        className={cn(
          error && "border-danger focus-visible:ring-danger/40",
          className,
        )}
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
