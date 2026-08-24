import { useId } from "react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { Label } from "../ui/label";

/**
 * The label / hint / error shell every form control sits in.
 *
 * ONE PLACE, because the wiring is the part that drifts. Four controls need the
 * same three facts — a label pointing at the control, an error that is both red
 * and announced, a hint that is announced only when there is no error — and
 * writing that four times is how three of them end up missing `role="alert"`.
 * `TextField`, `TextareaField`, `SelectField` and `SearchSelect` all render
 * through this, so their labels line up and their errors read the same.
 *
 * A RENDER PROP rather than `children`, because the control needs the generated
 * id and the aria attributes: `{(field) => <input {...field} />}`. Nothing else
 * in here is negotiable per control.
 *
 * The label is ALWAYS above the control — the one rule the form guideline is
 * built on, and the reason a "label beside the field" variant does not exist.
 */
export interface FormFieldRenderProps {
  id: string;
  "aria-describedby": string | undefined;
  "aria-invalid": true | undefined;
}

export interface FormFieldProps {
  label: string;
  /** Renders the red asterisk AND is passed to the control by the caller. */
  required?: boolean;
  /** Backend or client validation message. Red, announced, wins over `hint`. */
  error?: string;
  hint?: ReactNode;
  className?: string;
  children: (field: FormFieldRenderProps) => ReactNode;
}

export function FormField({
  label,
  required,
  error,
  hint,
  className,
  children,
}: FormFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={id}>
        {label}
        {required && <span className="text-danger"> *</span>}
      </Label>

      {children({
        id,
        "aria-describedby": error ? errorId : hint ? hintId : undefined,
        "aria-invalid": error ? true : undefined,
      })}

      {error ? (
        // 13px and semibold, per docs/ui-rules.md §13: --danger is 4.38:1 as
        // text, marginally under the floor, so danger text is never small and
        // never colour alone — it is always a sentence.
        <p id={errorId} role="alert" className="text-xs font-semibold text-danger">
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

/**
 * The height of a form control: 44px.
 *
 * NOT 36 (`ui/input`'s default) and NOT 40 (a filter trigger). Two reasons, and
 * both are in the guideline: docs/ui-rules.md §1.5 puts the touch-target floor
 * at 44×44, and filling a form is a considered act where a mistake is expensive
 * — a wrong SKU or a wrong quantity — unlike picking a filter, which is one
 * click that is undone by another click.
 *
 * IT LIVES HERE RATHER THAN IN `ui/input.tsx` ON PURPOSE. That file is also the
 * input behind every filter control, and docs/ui-rules.md §8 pins those at 40.
 * Raising the vendored primitive would silently break §8 in fifteen toolbars.
 * So 44 is applied by the form layer, to the form layer.
 */
export const FIELD_HEIGHT = "h-11";

/**
 * The shared look of a control that is not a plain `<input>` — a select trigger
 * or a searchable combobox — so those two do not drift from `ui/input`.
 *
 * The focus treatment is a PAIR, not a ring alone: navy border plus orange halo.
 * The halo on its own is 2.33:1 and misses the 3:1 non-text floor. See §7.
 */
export const FIELD_SHELL = [
  "flex w-full items-center justify-between gap-2 rounded-md border border-border",
  "bg-surface px-3 text-sm shadow-xs transition-[color,box-shadow] outline-none",
  "focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/50",
  "aria-invalid:border-danger aria-invalid:ring-danger/20",
  "disabled:cursor-not-allowed disabled:opacity-50",
].join(" ");
