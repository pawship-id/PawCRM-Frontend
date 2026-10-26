"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState, type ReactNode } from "react";

import { FilterSelect, withAll } from "@/components";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { usePetOptions } from "@/hooks/usePetOptions";

import { formatRupiah } from "../labels";
import type { VariantPriceDraft } from "../planDraft";
import { buildVariantKey, variantKeyLabel } from "../variantKey";

/**
 * A price PER PET VARIANT — the package's own price on a "Per varian hewan"
 * plan, or an option's "Harga khusus · Beda per varian".
 *
 * A ROW IS A VARIANT KEY (§1.1): jenis, and optionally ukuran and bulu, with
 * "Semua" meaning any. "Kucing" alone prices every cat; adding "Kucing · Kecil"
 * beside it prices small cats differently — the most specific row wins, exactly
 * as the server reads it.
 *
 * The rows usually arrive from a service's own price grid (the "Isi otomatis"
 * bar the caller puts in `toolbar`, or seeded by the option), so the two grids
 * line up row for row; the add bar under the table is for the rest.
 */
export function VariantPriceTable({
  rows,
  onChange,
  species,
  normalPrice,
  priceLabel,
  ariaLabel,
  toolbar,
  error,
}: {
  rows: VariantPriceDraft[];
  onChange: (rows: VariantPriceDraft[]) => void;
  /** The species a row may name; `[]` = every species the tenant has. */
  species: string[];
  /** When given, a "Harga normal" column shows what the service costs that variant. */
  normalPrice?: (variantKey: string) => string | null;
  priceLabel: string;
  ariaLabel: string;
  toolbar?: ReactNode;
  error?: string;
}) {
  const { choices, label } = usePetOptions();
  const [draft, setDraft] = useState({ species: "", size: "", fur: "" });

  const speciesChoices = choices("species").filter(
    (choice) => species.length === 0 || species.includes(choice.value),
  );

  const nameOf = (key: string) =>
    variantKeyLabel(key, (type, id) => label(type, id));

  const setPrice = (index: number, price: string) =>
    onChange(rows.map((row, i) => (i === index ? { ...row, price } : row)));

  const add = () => {
    const variantKey = buildVariantKey(draft);
    if (!variantKey || !draft.species) return;
    if (!rows.some((row) => row.variantKey === variantKey)) {
      onChange([...rows, { variantKey, price: "" }]);
    }
    setDraft({ species: draft.species, size: "", fur: "" });
  };

  return (
    <div className="flex flex-col gap-3">
      {toolbar}

      {rows.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-border">
          <Table aria-label={ariaLabel}>
            <TableHeader>
              <TableRow>
                <TableHead>Varian</TableHead>
                {normalPrice && <TableHead className="text-right">Harga normal</TableHead>}
                <TableHead className="text-right">{priceLabel}</TableHead>
                <TableHead className="w-12">
                  <span className="sr-only">Hapus</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, index) => (
                <TableRow key={row.variantKey}>
                  <TableCell>{nameOf(row.variantKey)}</TableCell>
                  {normalPrice && (
                    <TableCell className="text-right text-muted tabular-nums">
                      {formatRupiah(normalPrice(row.variantKey))}
                    </TableCell>
                  )}
                  <TableCell className="text-right">
                    <Input
                      inputMode="decimal"
                      value={row.price}
                      placeholder="0"
                      aria-label={`${priceLabel} ${nameOf(row.variantKey)}`}
                      onChange={(event) => setPrice(index, event.target.value)}
                      className="ml-auto max-w-40 text-right tabular-nums"
                    />
                  </TableCell>
                  <TableCell>
                    <Button
                      type="button"
                      variant="ghost"
                      className="size-9"
                      aria-label={`Hapus varian ${nameOf(row.variantKey)}`}
                      onClick={() => onChange(rows.filter((_, i) => i !== index))}
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <p className="text-sm text-muted">
          Belum ada varian. Tambahkan di bawah, atau isi otomatis dari layanan.
        </p>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <FilterSelect
          layout="field"
          label="Jenis"
          active={false}
          placeholder="Pilih jenis"
          value={draft.species}
          options={speciesChoices.map((choice) => ({ value: choice.value, label: choice.label }))}
          onChange={(value) => setDraft({ ...draft, species: value })}
          className="min-w-36"
        />
        <FilterSelect
          layout="field"
          label="Ukuran"
          active={false}
          value={draft.size}
          options={withAll(
            choices("size").map((choice) => ({ value: choice.value, label: choice.label })),
            "Semua",
          )}
          onChange={(value) => setDraft({ ...draft, size: value })}
          className="min-w-36"
        />
        <FilterSelect
          layout="field"
          label="Bulu"
          active={false}
          value={draft.fur}
          options={withAll(
            choices("furType").map((choice) => ({ value: choice.value, label: choice.label })),
            "Semua",
          )}
          onChange={(value) => setDraft({ ...draft, fur: value })}
          className="min-w-36"
        />
        <Button type="button" variant="secondary" onClick={add} disabled={!draft.species}>
          <Plus className="size-4" aria-hidden />
          Tambah varian
        </Button>
      </div>

      {error && (
        <p role="alert" className="text-xs font-semibold text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
