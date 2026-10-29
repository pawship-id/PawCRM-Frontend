"use client";

import { useRef, useState } from "react";
import { FileSpreadsheet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Where a wizard's Shopee file goes — click or drop, .xlsx only. Once a file
 * is picked it shows as a chip with Ganti. Same anatomy as TemplateDropzone.
 */
export function FileDropzone({
  file,
  source,
  disabled,
  onPick,
}: {
  file: File | null;
  /** Where in Seller Center the file comes from. */
  source: string;
  disabled?: boolean;
  onPick: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const take = (files: FileList | null) => {
    const picked = files?.[0];
    if (picked) onPick(picked);
  };

  const input = (
    <input
      ref={inputRef}
      type="file"
      accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      className="hidden"
      aria-label="Pilih file Shopee (.xlsx)"
      onChange={(event) => {
        take(event.target.files);
        event.target.value = "";
      }}
    />
  );

  if (file) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-border p-3">
        <FileSpreadsheet className="size-5 flex-none text-muted" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="break-all text-sm font-medium text-foreground">{file.name}</p>
          <p className="text-xs text-muted">{Math.ceil(file.size / 1024).toLocaleString("id-ID")} KB</p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
        >
          Ganti
        </Button>
        {input}
      </div>
    );
  }

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
        if (!disabled) take(event.dataTransfer.files);
      }}
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-6 py-8 text-center transition-colors",
        dragging ? "border-primary bg-primary/5" : "border-border",
      )}
    >
      <p className="text-sm font-semibold text-foreground">Tarik file ke sini</p>
      <p className="text-sm text-muted">{source}</p>
      <Button type="button" onClick={() => inputRef.current?.click()} disabled={disabled}>
        Pilih file
      </Button>
      {input}
    </div>
  );
}
