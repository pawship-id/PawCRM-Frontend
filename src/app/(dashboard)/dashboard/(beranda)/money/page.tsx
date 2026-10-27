import type { Metadata } from "next";

import { BerandaUang } from "@/features/dashboard";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Uang · Beranda · Buloo" };

/** Beranda › Uang — gated on the ledger, which every figure here reads. */
export default function BerandaUangPage() {
  return (
    <RequirePermission feature="berandaMoney">
      <RequirePermission feature="journalEntries" action="read">
        <BerandaUang />
      </RequirePermission>
    </RequirePermission>
  );
}
