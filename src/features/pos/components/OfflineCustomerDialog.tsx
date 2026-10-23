"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

import { useOfflineStore } from "../offline/store";

const SHOWN = 30;

function fold(value: string | null | undefined): string {
  return (value ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * PICKING A CUSTOMER WITH NO SERVER TO ASK (POS offline mode, 19 October 2026)
 * — searched on the device's copy, by name, phone or code. Adding a NEW
 * customer needs the server and is not offered here; the sale can go to
 * "pembeli yang lewat" and the customer be added once online.
 */
export function OfflineCustomerDialog({
  open,
  onOpenChange,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (customer: { _id: string; name: string }) => void;
}) {
  const { snapshot } = useOfflineStore();
  const [term, setTerm] = useState("");

  const matches = useMemo(() => {
    const all = snapshot.customers?.customers ?? [];
    const query = fold(term.trim());
    const digits = term.replace(/\D/g, "");
    const found = query
      ? all.filter(
          (customer) =>
            fold(customer.name).includes(query) ||
            fold(customer.code).includes(query) ||
            (digits.length >= 3 && (customer.phone ?? "").replace(/\D/g, "").includes(digits)),
        )
      : all;
    return found.slice(0, SHOWN);
  }, [snapshot.customers, term]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setTerm("");
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Pilih pelanggan</DialogTitle>
          <DialogDescription>
            Mode offline: mencari dari data di perangkat ini. Pelanggan baru
            bisa ditambahkan saat online.
          </DialogDescription>
        </DialogHeader>

        <Input
          autoFocus
          value={term}
          placeholder="Cari nama, nomor HP, atau kode"
          onChange={(event) => setTerm(event.target.value)}
        />

        {matches.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">
            Tidak ada pelanggan yang cocok di data offline.
          </p>
        ) : (
          <ul className="max-h-[50vh] divide-y divide-border overflow-y-auto">
            {matches.map((customer) => (
              <li key={customer._id}>
                <button
                  type="button"
                  className="flex min-h-11 w-full flex-col items-start rounded-md px-2 py-2 text-left hover:bg-surface-hover focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                  onClick={() => {
                    setTerm("");
                    onSelect({ _id: customer._id, name: customer.name });
                  }}
                >
                  <span className="text-sm font-semibold">{customer.name}</span>
                  {(customer.phone || customer.code) && (
                    <span className="text-sm text-muted tabular-nums">
                      {[customer.code, customer.phone].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex justify-end">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
