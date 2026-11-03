"use client";

import { Card, ImportFilePicker } from "@/components";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  return (
    <Card
      title="1. Pilih file"
      description="Unduh templatenya, isi di Excel, lalu unggah di sini — bisa .xlsx maupun .csv."
    >
      <div className="flex flex-col gap-4">
        {/*
          The .xlsx is not a convenience alongside the .csv: its barcode column is
          formatted as Text, and without that a code like 0123456789012 loses its
          leading zero the moment it is typed, before any code of ours sees it.

          .xlsm stays on this import's accept list, as it always was. Later
          uploads take .xlsx and .csv only.
        */}
        <ImportFilePicker
          fileName={fileName}
          onPick={onPick}
          onDownloadTemplate={onDownloadTemplate}
          disabled={disabled}
          templateNote="Template sudah berisi contoh: satu produk satuan dan satu produk bervarian."
          xlsxHint="Disarankan — kolom barcode dikunci sebagai teks, jadi angka nol di depan tidak hilang."
          accept=".csv,.xlsx,.xlsm,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        />

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
