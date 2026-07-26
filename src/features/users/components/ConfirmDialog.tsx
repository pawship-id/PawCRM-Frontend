"use client";

import type { ReactNode } from "react";

import { Alert, Spinner } from "@/components";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

/**
 * A confirm dialog for the destructive/irreversible row actions (delete,
 * restore, unlock), built on the shadcn/ui Dialog.
 *
 * Radix provides the accessibility the previous hand-rolled version implemented
 * manually — focus trap, Escape-to-close, outside-click, and the labelled
 * role="dialog". The parent renders this only while an action is pending, so it
 * is always open; closing (Escape/backdrop/Cancel) calls `onCancel`, and it is
 * suppressed while `busy`.
 */
export interface ConfirmDialogProps {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  /** Style the confirm button as destructive (delete) vs. neutral. */
  destructive?: boolean;
  /** Disables the buttons and shows a spinner while the action runs. */
  busy?: boolean;
  /** Optional error to surface inside the dialog if the action failed. */
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  destructive = false,
  busy = false,
  error,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onCancel();
      }}
    >
      <DialogContent showCloseButton={!busy}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{children}</DialogDescription>
        </DialogHeader>

        {error && <Alert variant="error">{error}</Alert>}

        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy && <Spinner size={16} />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
