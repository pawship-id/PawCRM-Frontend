"use client";

import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Where a Shopee template is dropped — the first one of a new store, or a
 * refresh. Same anatomy as Inventori's ImportDropzone: one box that takes a
 * click and a drop. .xlsx only; the server reads the file itself.
 */
export function TemplateDropzone({
  title,
  busy,
  onPick,
}: {
  title: string;
  busy: boolean;
  onPick: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const take = (files: FileList | null) => {
    const file = files?.[0];
    if (file) onPick(file);
  };

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        if (!busy) take(event.dataTransfer.files);
      }}
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors",
        dragging ? "border-primary bg-primary/5" : "border-border",
        busy && "opacity-60",
      )}
    >
      <p className="text-base font-semibold text-foreground">{title}</p>
      <p className="max-w-md text-sm text-muted">
        Unduh dari Seller Center › Produk Saya › Ubah Massal › Info Penjualan, lalu
        tarik file-nya ke sini. Jangan diedit dulu sebelum diupload.
      </p>
      <Button type="button" onClick={() => inputRef.current?.click()} disabled={busy}>
        {busy ? "Membaca template…" : "Pilih file"}
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="hidden"
        aria-label="Pilih template Shopee (.xlsx)"
        onChange={(event) => {
          take(event.target.files);
          event.target.value = "";
        }}
      />
    </div>
  );
}
