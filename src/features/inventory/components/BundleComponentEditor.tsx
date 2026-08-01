"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatMoney, multiplyDecimals, sumDecimals } from "@/utils/decimal";
import type { BundleComponent, Product } from "@/types/inventory";

/**
 * What a bundle is made of, and what that makes it cost.
 *
 * ONLY STANDALONE PRODUCTS AND VARIANTS may be components, and that single rule
 * is what makes bundle nesting impossible: a bundle can never contain a bundle,
 * so no chain can close on itself and no cycle check is needed anywhere. It also
 * rules out a parent, whose stock is its variants' and which a till could not
 * decrement.
 *
 * The cost strip below is not decoration. A bundle priced by hand is the easiest
 * place in the catalogue to sell at a loss without noticing — the components'
 * costs move on their own with every receipt, while the fixed price sits where
 * somebody typed it months ago.
 */
export function BundleComponentEditor({
  components,
  products,
  onChange,
}: {
  components: BundleComponent[];
  products: Product[];
  onChange: (components: BundleComponent[]) => void;
}) {
  // The two types that own stock — see the header.
  const selectable = products.filter(
    (product) =>
      (product.productType === "standalone" || product.productType === "variant") &&
      product.isActive &&
      !components.some((component) => component.componentProductId === product._id),
  );

  const totalHpp = sumDecimals(
    components.map((component) => {
      const item = products.find((p) => p._id === component.componentProductId);
      return item?.hppAvg ? multiplyDecimals(item.hppAvg, component.qty) : "0";
    }),
  );

  const totalPrice = sumDecimals(
    components.map((component) => {
      const item = products.find((p) => p._id === component.componentProductId);
      return item?.sellPrice ? multiplyDecimals(item.sellPrice, component.qty) : "0";
    }),
  );

  function addComponent(productId: string) {
    onChange([
      ...components,
      {
        componentType: "product",
        componentProductId: productId,
        componentServiceId: null,
        qty: "1",
      },
    ]);
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold">Komponen bundle</p>
        <div className="ml-auto w-64">
          <Label htmlFor="addComponent" className="sr-only">
            Tambah komponen
          </Label>
          <Select value="" onValueChange={addComponent}>
            <SelectTrigger id="addComponent" aria-label="Tambah komponen">
              <SelectValue placeholder="+ Tambah komponen…" />
            </SelectTrigger>
            <SelectContent>
              {selectable.map((product) => (
                <SelectItem key={product._id} value={product._id}>
                  {product.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {components.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center">
          <p className="text-sm font-medium">Belum ada komponen</p>
          <p className="mt-1 text-xs text-muted">
            Bundle butuh minimal satu komponen. Bundle tidak boleh berisi bundle
            lain — itulah yang membuat rantai bundle tidak mungkin melingkar.
          </p>
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-[10px] uppercase tracking-widest text-muted">
              <th className="px-2 py-2 text-left font-medium">Komponen</th>
              <th className="px-2 py-2 text-right font-medium">Qty per bundle</th>
              <th className="px-2 py-2 text-right font-medium">HPP satuan</th>
              <th className="px-2 py-2 text-right font-medium">Subtotal HPP</th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {components.map((component, index) => {
              const item = products.find((p) => p._id === component.componentProductId);
              return (
                <tr key={component.componentProductId ?? index} className="border-b border-border/60">
                  <td className="px-2 py-2">
                    <p className="font-medium">{item?.name ?? "—"}</p>
                    <p className="font-mono text-xs text-muted">{item?.sku}</p>
                  </td>
                  <td className="px-2 py-2 text-right">
                    <Input
                      aria-label={`Qty ${item?.name ?? ""}`}
                      inputMode="decimal"
                      value={component.qty}
                      onChange={(event) =>
                        onChange(
                          components.map((existing, i) =>
                            i === index ? { ...existing, qty: event.target.value } : existing,
                          ),
                        )
                      }
                      className="ml-auto max-w-24 text-right font-mono"
                    />
                  </td>
                  <td className="px-2 py-2 text-right font-mono text-xs tabular-nums text-muted">
                    {formatMoney(item?.hppAvg)}
                  </td>
                  <td className="px-2 py-2 text-right font-mono text-xs tabular-nums">
                    {item?.hppAvg
                      ? formatMoney(multiplyDecimals(item.hppAvg, component.qty))
                      : "—"}
                  </td>
                  <td className="px-2 py-2 text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-danger"
                      onClick={() => onChange(components.filter((_, i) => i !== index))}
                    >
                      Hapus
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {components.length > 0 && (
        <div className="rounded-lg border border-dashed border-primary/50 bg-primary/5 p-3">
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-primary-hover">
            Perhitungan bundle
          </p>
          <p className="mt-1.5 overflow-x-auto whitespace-nowrap font-mono text-[13px] leading-7">
            HPP bundle <span className="text-muted">=</span> Σ(HPP komponen ×
            qty) <span className="text-muted">=</span>{" "}
            <b className="text-primary-hover">{formatMoney(totalHpp)}</b>
            <span className="text-muted"> · </span>
            harga otomatis <span className="text-muted">=</span>{" "}
            <b className="text-primary-hover">{formatMoney(totalPrice)}</b>
          </p>
        </div>
      )}
    </div>
  );
}
