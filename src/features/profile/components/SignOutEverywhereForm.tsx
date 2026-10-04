"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

import { Alert, ConfirmDialog } from "@/components";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth";
import { ApiError } from "@/services/api-error";

/**
 * "Keluar dari semua perangkat" — revokes every session the signed-in user
 * holds, this browser included, then sends them to /login.
 *
 * ON THE PROFILE PAGE RATHER THAN IN THE ACCOUNT MENU, on request. The menu is
 * opened a dozen times a day to reach Logout, and a row beneath it that signs a
 * shop's whole counter out reads as the same act until it isn't. Here it sits
 * beside the password form, which is the screen somebody is already on when
 * they have a reason to use it.
 *
 * BEHIND A CONFIRM, because it is not undoable from here: a manager who does
 * this mid-shift has just signed the till out of its own drawer, and the other
 * devices get no warning — they are simply refused on their next request.
 */
export function SignOutEverywhereForm() {
  const router = useRouter();
  const { user, signOutEverywhere } = useAuth();

  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user) return null;

  async function handleConfirm() {
    setError(null);
    setBusy(true);
    try {
      await signOutEverywhere();
      /*
        `replace`, not `push`: the dashboard behind this page is no longer
        reachable, and leaving it in the history hands the user a Back button
        that lands on a screen which can only bounce them here again.
      */
      router.replace("/login");
    } catch (err) {
      /*
        THE DIALOG STAYS OPEN ON FAILURE. The session was not revoked anywhere,
        so the honest thing is to leave the user signed in and say so — closing
        would read as "done".
      */
      setError(
        err instanceof ApiError
          ? err.message
          : "Tidak bisa keluar dari semua perangkat. Coba lagi.",
      );
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Alert variant="warning">
        Semua perangkat yang sedang masuk sebagai <strong>{user.email}</strong>{" "}
        akan dikeluarkan, termasuk browser ini. Kasir yang shift-nya masih
        terbuka juga ikut keluar — shift-nya sendiri tidak tertutup, tapi
        kasirnya harus masuk lagi untuk melanjutkan.
      </Alert>

      <div className="flex justify-end">
        <Button
          type="button"
          variant="destructive"
          onClick={() => {
            setError(null);
            setConfirming(true);
          }}
        >
          <LogOut className="size-4" />
          Keluar dari semua perangkat
        </Button>
      </div>

      {confirming && (
        <ConfirmDialog
          title="Keluar dari semua perangkat"
          confirmLabel="Ya, keluarkan semua"
          destructive
          busy={busy}
          error={error}
          onConfirm={handleConfirm}
          onCancel={() => {
            setConfirming(false);
            setError(null);
          }}
        >
          Setiap sesi milik <strong>{user.email}</strong> akan diputus — di
          browser ini dan di perangkat lain. Anda akan diminta masuk lagi
          setelah ini.
        </ConfirmDialog>
      )}
    </div>
  );
}
