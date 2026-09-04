import type { Metadata } from "next";

import { Breadcrumb } from "@/components";
import { BatchLabelSheet } from "@/features/inventory";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Cetak label batch · Buloo" };

/** A page of labels is a page of labels — twenty lots is already a mis-built link. */
const MAX_LOTS = 20;

/**
 * The printable labels for one or more lots.
 *
 * `?ids=` RATHER THAN A ROUTE PARAM, because the sheet is almost never about one
 * lot. A delivery opens several at once, and a transfer re-labels every lot it
 * moved — codes are unique across the tenant, so the row created at the
 * destination gets a NEW code and the carton has to be re-stickered on arrival.
 * Both cases want one trip to the printer.
 *
 * `searchParams` is a Promise in this version of Next, like `params`.
 *
 * Gated on `productBatches:read`, the same grant the batch list carries: a label
 * shows what the list already shows, and printing it is not a separate kind of
 * access.
 */
export default async function BatchLabelsPage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string | string[] }>;
}) {
  const { ids } = await searchParams;

  /**
   * A QUERY STRING IS USER INPUT. Repeating the key gives an array, so both
   * shapes are flattened; anything that is not a plausible id is dropped rather
   * than sent to the API to be refused one request at a time.
   */
  const lotIds = (Array.isArray(ids) ? ids : (ids ?? ""))
    .toString()
    .split(",")
    .map((id) => id.trim())
    .filter((id) => /^[a-f0-9]{24}$/i.test(id))
    .slice(0, MAX_LOTS);

  return (
    <div className="flex flex-col gap-6">
      {/* The heading is off the print — a sheet of stickers does not want a
          breadcrumb across the top of the first one. */}
      <div className="print:hidden">
        <Breadcrumb
          items={[
            { label: "Inventory", href: "/dashboard/inventory" },
            { label: "Batch & Expired", href: "/dashboard/inventory/batches" },
            { label: "Cetak label" },
          ]}
        />
        <h1 className="mt-1 text-2xl font-extrabold text-foreground">
          Cetak label batch
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Tempel di kartonnya. Kode batch dicetak sebagai barcode dan QR — kasir
          tinggal scan, dan stok yang berkurang persis dari lot itu, bukan tebakan
          FEFO.
        </p>
      </div>

      <RequirePermission feature="productBatches">
        <BatchLabelSheet ids={lotIds} />
      </RequirePermission>
    </div>
  );
}
