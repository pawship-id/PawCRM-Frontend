import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";
import { FIELD_HEIGHT, FormField } from "./form/FormField";
import { Input } from "./ui/input";

/**
 * A labelled text input with inline error and optional hint, composed from the
 * shadcn/ui Input.
 *
 * The public API has not changed — call sites keep writing
 * `label`, `error`, `hint`, `required` and a `className` that lands on the
 * INPUT (not the wrapper), exactly as before. What moved is the label / error /
 * hint markup, which now comes from `FormField` so this control, `TextareaField`,
 * `SelectField` and `SearchSelect` cannot drift apart.
 *
 * 44px tall — see `FIELD_HEIGHT`. A call site may still override the height by
 * passing its own `h-*`; `cn` merges in the caller's favour.
 */
export interface TextFieldProps extends Omit<ComponentProps<"input">, "id"> {
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
  return (
    <FormField label={label} required={required} error={error} hint={hint}>
      {(field) => (
        <Input
          {...props}
          {...field}
          required={required}
          className={cn(
            FIELD_HEIGHT,
            error && "border-danger focus-visible:ring-danger/40",
            className,
          )}
        />
      )}
    </FormField>
  );
}
