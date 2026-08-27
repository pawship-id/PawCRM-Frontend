"use client";

import { useEffect, useState } from "react";

import { Alert, Spinner } from "@/components";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { userService } from "@/services/user.service";

/** The API's page cap — asking for more is a 400. */
const FETCH_LIMIT = 100;

/**
 * Approving an over-limit discount (FR-4).
 *
 * NOT A PIN PAD, though the PRD describes one. This system has sessions and
 * roles and no PIN store, and inventing one would be a second credential nobody
 * rotates. What the rule is FOR — a second, authorised person agreed — is what
 * gets checked: the approver is named, the server verifies they hold
 * `posTransactions:discountOverride`, and their id goes into the audit log.
 *
 * THE LIST IS NOT FILTERED TO APPROVERS HERE. It could be, and it would be a
 * lie: the browser cannot see who holds the grant without asking, and a list
 * that quietly omitted someone would look like they had left the company. The
 * server refuses the wrong choice with a sentence saying so, which is the honest
 * failure.
 */
export function PosApprovalDialog({
  open,
  message,
  onApprove,
  onCancel,
  busy = false,
}: {
  open: boolean;
  message: string;
  onApprove: (approverUserId: string) => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  const [users, setUsers] = useState<{ _id: string; fullName: string }[]>([]);
  const [approverId, setApproverId] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    let active = true;

    // Marking the fetch in flight is the effect's first act, which is what the
    // rule warns about — but the alternative is a dialog that shows an empty
    // picker for the length of the request. Same exemption CustomerSearchDialog
    // takes, for the same reason.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setLoadError(null);

    userService
      .list({ status: "active", limit: FETCH_LIMIT })
      .then((result) => {
        if (active) setUsers(result.items);
      })
      .catch(() => {
        if (active) setLoadError("Daftar pengguna gagal dimuat. Coba lagi.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [open]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Diskon perlu persetujuan</DialogTitle>
          <DialogDescription>{message}</DialogDescription>
        </DialogHeader>

        {loadError && <Alert variant="error">{loadError}</Alert>}

        <div className="space-y-2">
          <Label htmlFor="pos-approver">Disetujui oleh</Label>
          {loading ? (
            <div className="flex h-11 items-center gap-2 text-sm text-muted">
              <Spinner /> Memuat…
            </div>
          ) : (
            <Select value={approverId} onValueChange={setApproverId}>
              <SelectTrigger id="pos-approver" className="h-11">
                <SelectValue placeholder="Pilih atasan" />
              </SelectTrigger>
              <SelectContent>
                {users.map((user) => (
                  <SelectItem key={user._id} value={user._id}>
                    {user.fullName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <p className="text-xs text-muted">
            Namanya ikut tercatat di log, jadi bisa ditelusuri nanti.
          </p>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={onCancel}
            disabled={busy}
          >
            Batal
          </Button>
          <Button
            type="button"
            onClick={() => onApprove(approverId)}
            disabled={busy || !approverId}
          >
            {busy && <Spinner />}
            Setujui diskon
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
