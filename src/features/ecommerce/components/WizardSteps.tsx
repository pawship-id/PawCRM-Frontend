"use client";

import type { ReactNode } from "react";
import { Check, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * The step row of the three E-commerce wizards — Upload → Tinjau → Selesai.
 * As the mockup: the current step filled navy, a finished one a green tick.
 */
export function WizardSteps({
  steps,
  current,
  label,
}: {
  steps: readonly string[];
  current: number;
  label: string;
}) {
  return (
    <ol className="flex flex-wrap items-center gap-4 text-xs font-semibold" aria-label={label}>
      {steps.map((name, index) => {
        const number = index + 1;
        const done = current > number;
        const now = current === number;
        return (
          <li
            key={name}
            aria-current={now ? "step" : undefined}
            className={cn("flex items-center gap-1.5", now ? "text-primary" : "text-muted")}
          >
            <span
              className={cn(
                "flex size-6 items-center justify-center rounded-full border text-xs tabular-nums",
                now && "border-primary bg-primary text-primary-foreground",
                done && "border-transparent bg-tint-success text-success",
                !now && !done && "border-border",
              )}
            >
              {done ? <Check className="size-3.5" aria-hidden /> : number}
            </span>
            {name}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * The mockup's wizard frame: title and steps on one bar with ×, a body that
 * scrolls on its own, and a footer whose left side carries a short note.
 */
export function WizardFrame({
  title,
  steps,
  current,
  busy = false,
  onClose,
  note,
  footer,
  children,
}: {
  title: string;
  steps: readonly string[];
  current: number;
  busy?: boolean;
  onClose: () => void;
  note?: ReactNode;
  footer: ReactNode;
  children: ReactNode;
}) {
  return (
    <Dialog open onOpenChange={(next) => !next && !busy && onClose()}>
      <DialogContent
        showCloseButton={false}
        aria-describedby={undefined}
        className="flex max-h-[calc(100vh-2.5rem)] flex-col gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-5xl"
      >
        <div className="flex flex-wrap items-center gap-4 border-b border-border px-6 py-4">
          <DialogTitle className="text-lg font-bold">{title}</DialogTitle>
          <div className="ml-auto flex items-center gap-4">
            <WizardSteps steps={steps} current={current} label={`Langkah ${title.toLowerCase()}`} />
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className="size-9 border-border"
              aria-label="Tutup"
              disabled={busy}
              onClick={onClose}
            >
              <X className="size-4" aria-hidden />
            </Button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
        <div className="flex flex-wrap items-center gap-2 border-t border-border px-6 py-4">
          <p className="mr-auto text-sm text-muted">{note}</p>
          {footer}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * One labelled row of a wizard's first step — label left, control right, on
 * one line from `sm` up. `align="start"` for a tall control (a dropzone).
 */
export function WizardRow({
  label,
  align = "center",
  children,
}: {
  label: string;
  align?: "center" | "start";
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1 sm:flex-row sm:gap-3",
        align === "center" ? "sm:items-center" : "sm:items-start",
      )}
    >
      <div className={cn("text-sm font-semibold text-foreground sm:w-40 sm:flex-none", align === "start" && "sm:pt-3")}>
        {label}
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** A file shown as a chip: the XLSX badge, its name, one line under it. */
export function FileChip({
  title,
  detail,
  action,
}: {
  title: ReactNode;
  detail?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3">
      <span className="flex size-9 flex-none items-center justify-center rounded-lg bg-tint-success text-xs font-bold text-success">
        XLSX
      </span>
      <div className="min-w-0 flex-1">
        <div className="font-semibold text-foreground">{title}</div>
        {detail ? <div className="text-sm break-all text-muted">{detail}</div> : null}
      </div>
      {action}
    </div>
  );
}

/** A clickable count that filters a wizard's preview table. */
export function CountChip({
  label,
  value,
  selected,
  tone = "plain",
  onClick,
}: {
  label: string;
  value: string;
  selected?: boolean;
  tone?: "plain" | "warning";
  onClick?: () => void;
}) {
  const body = (
    <>
      <span className="text-xs text-muted">{label}</span>
      <span
        className={cn(
          "text-2xl font-semibold tabular-nums",
          tone === "warning" && value !== "0" ? "text-warning" : "text-foreground",
        )}
      >
        {value}
      </span>
    </>
  );

  if (!onClick) {
    return <div className="flex flex-col gap-1 rounded-xl border border-border p-3">{body}</div>;
  }

  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "flex min-h-11 flex-col gap-1 rounded-xl border p-3 text-left transition",
        "focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
        selected ? "border-primary bg-navy-100" : "border-border hover:bg-surface-hover",
      )}
    >
      {body}
    </button>
  );
}
