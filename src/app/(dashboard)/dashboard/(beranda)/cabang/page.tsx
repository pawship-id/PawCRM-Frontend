import type { Metadata } from "next";

import { BerandaCabang } from "@/features/dashboard";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Cabang · Beranda · Buloo" };

/** Beranda › Cabang — the laba rugi, one row per cabang. */
export default function BerandaCabangPage() {
  return (
    <RequirePermission feature="berandaBranches">
      <RequirePermission feature="journalEntries" action="read">
        <BerandaCabang />
      </RequirePermission>
    </RequirePermission>
  );
}
