"use client";

import type { ReactNode } from "react";

import { Alert } from "./Alert";
import { Spinner } from "./Spinner";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "./ui/dialog";

/**
 * A confirm dialog for the destructive/irreversible actions (delete, restore,
 * unlock) across master-data screens, built on the shadcn/ui Dialog.
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
          {/*
            "Batal", not "Cancel" — ui-rules §12. It had gone unnoticed because
            every screen using this dialog was still half-English; the till is
            not, and an English word on a cashier's screen is the one place it
            cannot pass.
          */}
          <Button variant="outline" onClick={onCancel} disabled={busy}>
            Batal
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
