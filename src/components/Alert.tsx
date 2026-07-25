import type { ReactNode } from "react";

/**
 * A banner for form-level feedback — an error the fields cannot show inline, or
 * a success confirmation. `role="alert"` on the error variant makes it
 * announced immediately; the success variant is a passive status.
 */
export interface AlertProps {
  variant?: "error" | "success" | "info";
  children: ReactNode;
  className?: string;
}

const VARIANTS: Record<NonNullable<AlertProps["variant"]>, string> = {
  error: "border-danger/30 bg-danger/10 text-danger",
  success: "border-success/30 bg-success/10 text-success",
  info: "border-secondary/40 bg-secondary/15 text-secondary-foreground",
};

export function Alert({ variant = "info", children, className }: AlertProps) {
  return (
    <div
      role={variant === "error" ? "alert" : "status"}
      className={[
        "rounded-lg border px-3.5 py-2.5 text-sm",
        VARIANTS[variant],
        className ?? "",
      ].join(" ")}
    >
      {children}
    </div>
  );
}
