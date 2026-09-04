"use client";

import { useRef, useState } from "react";

import { ChevronDownIcon } from "lucide-react";

import { Card } from "@/components";
// The shadcn button rather than the project wrapper: only this one takes
// `asChild`, which is what lets it be the dropdown's trigger without nesting a
// button inside a button.
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { StockWarehouse } from "@/types/inventory";

import type { TemplateFormat } from "../hooks/useProductImport";

/**
 * Step 1: get a file, and the one thing a file cannot carry.
 *
 * THE WAREHOUSE IS ASKED HERE, ONCE, and only when the sheet turns out to need
 * one. A bulk import is somebody entering a shelf they are standing in front of,
 * so a per-row column would hold the same value five hundred times and offer
 * five hundred chances to misspell it. The picker appears after the file is read
 * rather than before, because until then nobody knows whether the question
 * applies — a pure catalogue import never sees it.
 *
 * THE TEMPLATE BUTTON IS NOT DECORATION. The column names are the contract
 * between this screen and the server, and a user who invents their own headers
 * gets a refusal about a column they can plainly see. Downloading the template
 * is the supported path in and it is the first thing on the card.
 */
export function ImportDropzone({
  fileName,
  needsWarehouse,
  warehouses,
  warehouseId,
  onWarehouseChange,
  onPick,
  onDownloadTemplate,
  disabled,
}: {
  fileName: string | null;
  needsWarehouse: boolean;
  warehouses: StockWarehouse[];
  warehouseId: string;
  onWarehouseChange: (id: string) => void;
  onPick: (file: File) => void;
  onDownloadTemplate: (format: TemplateFormat) => void;
  disabled: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (file) onPick(file);
  };

  return (
    <Card
      title="1. Pilih file"
      description="Unduh templatenya, isi di Excel, lalu unggah di sini — bisa .xlsx maupun .csv."
    >
      <div className="flex flex-col gap-4">
        <div>
          {/*
            ONE BUTTON, TWO FORMATS BEHIND IT. Both are real choices, but only
            one of them is the right default — so the menu states the difference
            rather than leaving two equal-looking buttons for the user to pick
            between on the strength of the file extension alone.

            The .xlsx is not a convenience alongside the .csv: its barcode column
            is formatted as Text, and without that a code like 0123456789012
            loses its leading zero the moment it is typed, before any code of
            ours sees it. The .csv stays for Google Sheets and for tooling that
            prefers it.
          */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="secondary" disabled={disabled}>
                Unduh template
                <ChevronDownIcon className="size-4 opacity-50" />
              </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="start" className="w-72">
              <DropdownMenuItem
                onSelect={() => onDownloadTemplate("xlsx")}
                className="flex-col items-start gap-0.5"
              >
                <span className="font-medium">Excel (.xlsx)</span>
                <span className="text-xs text-muted">
                  Disarankan — kolom barcode dikunci sebagai teks, jadi angka nol
                  di depan tidak hilang.
                </span>
              </DropdownMenuItem>

              <DropdownMenuItem
                onSelect={() => onDownloadTemplate("csv")}
                className="flex-col items-start gap-0.5"
              >
                <span className="font-medium">CSV (.csv)</span>
                <span className="text-xs text-muted">
                  Untuk Google Sheets, atau kalau Anda memang memakai CSV.
                </span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <p className="mt-2 text-xs text-muted">
            Template sudah berisi contoh: satu produk satuan dan satu produk
            bervarian.
          </p>
        </div>

        {/*
          A label wrapping a hidden input, plus drop handlers on the same box.
          Clicking and dragging land on one element, so there is no state in
          which the outline says "drop here" and the click does nothing.
        */}
        <div
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            if (!disabled) handleFiles(event.dataTransfer.files);
          }}
          className={cn(
            "flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-8 text-center transition-colors",
            dragging ? "border-primary bg-primary/5" : "border-border",
            disabled && "opacity-60",
          )}
        >
          <p className="text-sm text-foreground">
            {fileName ? (
              <>
                Terpilih: <span className="font-medium">{fileName}</span>
              </>
            ) : (
              "Tarik file ke sini, atau"
            )}
          </p>
          <Button
            type="button"
            variant="secondary"
            onClick={() => inputRef.current?.click()}
            disabled={disabled}
          >
            {fileName ? "Ganti file" : "Pilih file"}
          </Button>
          <input
            ref={inputRef}
            type="file"
            /*
              Both formats, and the MIME types browsers actually report for them.
              The extensions are listed alongside because a Windows machine with
              no Office install reports `application/octet-stream` for an .xlsx,
              and an accept list of MIME types alone would grey out the very file
              the user came to upload.
            */
            accept=".csv,.xlsx,.xlsm,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            aria-label="Pilih file CSV atau Excel"
            onChange={(event) => {
              handleFiles(event.target.files);
              // Cleared so picking the SAME file twice fires `change` again —
              // the natural thing to do after fixing it in Excel.
              event.target.value = "";
            }}
          />
        </div>

        {needsWarehouse && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="import-warehouse">Gudang untuk stok awal</Label>
            <Select value={warehouseId} onValueChange={onWarehouseChange}>
              <SelectTrigger id="import-warehouse" className="w-full sm:w-72">
                <SelectValue placeholder="Pilih gudang…" />
              </SelectTrigger>
              <SelectContent>
                {warehouses.map((warehouse) => (
                  <SelectItem key={warehouse._id} value={warehouse._id}>
                    {warehouse.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted">
              Ada baris yang mengisi <code>stok_awal</code>, jadi stoknya perlu
              masuk ke salah satu gudang. Berlaku untuk semua baris di file ini.
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}
