"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProductMultiPicker } from "@/features/inventory/components/ProductMultiPicker";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/utils/decimal";
import type { Service } from "@/types/api";
import type { Product } from "@/types/inventory";

type Tab = "product" | "service";

/**
 * Choosing what an invoice bills for — the same "+ Tambah produk" dialog the
 * stock documents and receipts open, with a second tab because a bill also
 * carries services.
 *
 * BARANG IS ProductMultiPicker, unchanged: searched on the SERVER, ticks kept
 * across searches. Its `holdsStock` filter drops parents and bundles, which is
 * also exactly what the invoice API refuses — a parent is sold as a variant, and
 * a bundle "cannot be invoiced yet".
 *
 * PRODUCTS ALREADY ON THE BILL ARE HIDDEN, as on every other document: a second
 * row of the same product is a quantity somebody meant to type. SERVICES ARE
 * NOT — one grooming per animal is ordinary, and a customer with two cats needs
 * the same service twice.
 *
 * BOTH PANELS STAY MOUNTED, hidden rather than unmounted, so switching tabs
 * keeps the product search that was typed. Ticks from both go in one Tambahkan.
 *
 * NOTHING IS PRICED FOR AN ANIMAL HERE. A service priced by pet reads "Harga
 * menurut hewan"; the animal is chosen on the row afterwards, which re-prices it.
 */
export function InvoiceAddItemsDialog({
  services,
  existingProductIds,
  onAdd,
  onClose,
}: {
  /** The active services the form already loaded. */
  services: Service[];
  /** Products the bill already carries — hidden, never offered twice. */
  existingProductIds: string[];
  onAdd: (picked: { products: Product[]; services: Service[] }) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>("product");
  const [products, setProducts] = useState<Product[]>([]);
  const [picked, setPicked] = useState<Service[]>([]);
  const [search, setSearch] = useState("");

  const visibleServices = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return services;
    return services.filter(
      (service) =>
        service.name.toLowerCase().includes(q) ||
        Boolean(service.code?.toLowerCase().includes(q)),
    );
  }, [services, search]);

  const pickedIds = new Set(picked.map((service) => service._id));
  const count = products.length + picked.length;

  function toggleService(service: Service) {
    setPicked((current) =>
      pickedIds.has(service._id)
        ? current.filter((one) => one._id !== service._id)
        : [...current, service],
    );
  }

  const tabs: { value: Tab; label: string; picked: number }[] = [
    { value: "product", label: "Barang", picked: products.length },
    { value: "service", label: "Jasa", picked: picked.length },
  ];

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Tambah barang atau jasa ke faktur</DialogTitle>
          <DialogDescription>
            Cari lalu centang, boleh beberapa sekaligus dari kedua tab. Harga
            diambil dari katalog; hewan untuk jasa dipilih di baris faktur
            setelah ini.
          </DialogDescription>
        </DialogHeader>

        <div
          role="tablist"
          aria-label="Jenis item"
          className="flex gap-1 border-b border-border"
        >
          {tabs.map((one) => {
            const selected = tab === one.value;
            return (
              <button
                key={one.value}
                type="button"
                role="tab"
                id={`invoice-add-tab-${one.value}`}
                aria-selected={selected}
                aria-controls={`invoice-add-panel-${one.value}`}
                onClick={() => setTab(one.value)}
                className={cn(
                  "-mb-px h-11 rounded-t-md border-b-2 px-4 text-sm font-semibold transition",
                  "outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                  selected
                    ? "border-primary text-primary"
                    : "border-transparent text-muted hover:text-foreground",
                )}
              >
                {one.picked > 0 ? `${one.label} (${one.picked})` : one.label}
              </button>
            );
          })}
        </div>

        <div
          role="tabpanel"
          id="invoice-add-panel-product"
          aria-labelledby="invoice-add-tab-product"
          hidden={tab !== "product"}
        >
          <ProductMultiPicker
            selected={products}
            onChange={setProducts}
            excludeIds={existingProductIds}
          />
        </div>

        <div
          role="tabpanel"
          id="invoice-add-panel-service"
          aria-labelledby="invoice-add-tab-service"
          hidden={tab !== "service"}
        >
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Cari nama atau kode…"
                aria-label="Cari jasa"
                className="max-w-xs"
              />

              {picked.length > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setPicked([])}
                >
                  Kosongkan
                </Button>
              )}

              <span className="ml-auto text-xs text-muted">
                <b className="text-foreground">{picked.length}</b> jasa dipilih
              </span>
            </div>

            <div className="max-h-72 overflow-y-auto rounded-lg border border-border">
              {visibleServices.length === 0 ? (
                <p className="px-4 py-10 text-center text-sm text-muted">
                  {search.trim()
                    ? `Tidak ada jasa yang cocok dengan "${search.trim()}".`
                    : "Belum ada jasa aktif di katalog."}
                </p>
              ) : (
                visibleServices.map((service) => {
                  const id = `pick-service-${service._id}`;
                  return (
                    <div
                      key={service._id}
                      className="flex items-center gap-3 border-b border-border/60 px-3 py-2 last:border-0"
                    >
                      <Checkbox
                        id={id}
                        checked={pickedIds.has(service._id)}
                        onCheckedChange={() => toggleService(service)}
                      />
                      <Label
                        htmlFor={id}
                        className="flex flex-1 cursor-pointer flex-wrap items-baseline gap-x-2 font-normal"
                      >
                        <span className="text-sm text-foreground">
                          {service.name}
                        </span>
                        {service.code && (
                          <span className="text-xs text-muted tabular-nums">
                            {service.code}
                          </span>
                        )}
                        <span className="ml-auto text-xs text-muted tabular-nums">
                          {service.hasVariants || service.price === null
                            ? "Harga menurut hewan"
                            : formatMoney(service.price)}
                        </span>
                      </Label>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="secondary" onClick={onClose}>
            Batal
          </Button>
          <Button
            type="button"
            onClick={() => {
              onAdd({ products, services: picked });
              onClose();
            }}
            disabled={count === 0}
          >
            {count > 0 ? `Tambahkan ${count} item` : "Tambahkan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
