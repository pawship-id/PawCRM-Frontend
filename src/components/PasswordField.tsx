"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

import { cn } from "@/lib/utils";
import { FIELD_HEIGHT, FormField } from "./form/FormField";
import { Input } from "./ui/input";
import type { TextFieldProps } from "./TextField";

/**
 * A `TextField` for passwords with an eye button that toggles the value
 * between hidden (`type="password"`) and visible (`type="text"`).
 */
export type PasswordFieldProps = Omit<TextFieldProps, "type">;

export function PasswordField({
  label,
  error,
  hint,
  className,
  required,
  ...props
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);

  return (
    <FormField label={label} required={required} error={error} hint={hint}>
      {(field) => (
        <div className="relative">
          <Input
            {...props}
            {...field}
            type={visible ? "text" : "password"}
            required={required}
            className={cn(
              FIELD_HEIGHT,
              "pr-11",
              error && "border-danger focus-visible:ring-danger/40",
              className,
            )}
          />
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
            aria-pressed={visible}
            className="absolute inset-y-0 right-0 flex w-11 cursor-pointer items-center justify-center rounded-md text-muted transition hover:text-foreground focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            {visible ? (
              <EyeOff className="size-4" aria-hidden />
            ) : (
              <Eye className="size-4" aria-hidden />
            )}
          </button>
        </div>
      )}
    </FormField>
  );
}
