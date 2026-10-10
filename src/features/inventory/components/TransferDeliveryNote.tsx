import type { StockTransferDetail } from "@/types/inventory";
import { formatQty, sumDecimals } from "@/utils/decimal";

/**
 * SURAT JALAN — the note a driver carries with the boxes, and the one the
 * receiving warehouse counts them against.
 *
 * ITS SHAPE IS FIXED BY WHAT SHOPS ALREADY HOLD. It follows the delivery note the
 * stock system these shops used before prints: a title, who it is from and to, the
 * number and date on the right, a ruled table of SKU, name, quantity, unit and a
 * remark per line, a quantity total, and the transfer's own note beneath. Nobody
 * is asked to learn a new document, and the receiving end — who may still be on
 * the old one — reads it the way they always have.
 *
 * ONE ROW PER PRODUCT, not per lot. What was ASKED FOR is what a person counts
 * boxes against; which lots FEFO drew is a fact about the source shelf and
 * belongs on the screen, not on a paper that travels. A product that came off
 * three shelves is still one line here with one quantity.
 *
 * "TOTAL QTY" ADDS UNITS TOGETHER, and says so by being a bare number: it is a
 * count of items for the person at the door, not a stock figure, and the same
 * total the old note carried. Nothing downstream reads it.
 *
 * THE REMARK COLUMN IS THE LINE'S OWN NOTE, kept even when every one is blank:
 * the column is where the person receiving writes what they found, in ink.
 *
 * BLACK ON WHITE whatever the viewer's theme — `receipt.css` sets it for the
 * printed page; the screen preview is a sheet of paper, not a card.
 *
 * A4 ONLY. Unlike an invoice nobody prints this at the counter on a thermal
 * roll: it is a table with six columns and a name that runs long.
 */
export function TransferDeliveryNote({
  transfer,
}: {
  transfer: StockTransferDetail;
}) {
  const total = sumDecimals(transfer.items.map((item) => item.qty));

  return (
    <div
      data-receipt-sheet="a4"
      className="mx-auto w-full bg-white p-8 text-sm text-black"
    >
      <h1 className="text-center text-2xl font-bold text-black">Surat Jalan</h1>

      <div className="mt-8 flex flex-wrap items-start justify-between gap-6 text-xs">
        <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-1.5">
          <Meta label="DARI">{transfer.fromWarehouseName ?? "—"}</Meta>
          <Meta label="TUJUAN">{transfer.toWarehouseName ?? "—"}</Meta>
        </dl>

        <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-1.5">
          <Meta label="No. Transfer">{transfer.transferNumber}</Meta>
          <Meta label="Tanggal">{formatNoteDate(transfer.transferDate)}</Meta>
        </dl>
      </div>

      <table className="mt-5 w-full border-collapse border border-black text-xs">
        <thead>
          <tr>
            <Th className="w-10">NO</Th>
            <Th className="w-40">SKU</Th>
            <Th>NAMA BARANG</Th>
            <Th className="w-16 text-center">QTY</Th>
            <Th className="w-20">UNIT</Th>
            <Th className="w-40">KETERANGAN</Th>
          </tr>
        </thead>
        <tbody>
          {transfer.items.map((item, index) => (
            <tr key={`${item.productId}-${item.batchId ?? index}`}>
              <Td className="text-center tabular-nums">{index + 1}</Td>
              <Td>{item.productSku ?? ""}</Td>
              <Td>{item.productName ?? ""}</Td>
              <Td className="text-center tabular-nums">{formatQty(item.qty)}</Td>
              <Td>{item.productUnit ?? ""}</Td>
              <Td>{item.notes ?? ""}</Td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="mt-6 pr-[11.5rem] text-right text-xs font-bold tabular-nums">
        Total Qty
        <span className="ml-4 font-normal">{formatQty(total)}</span>
      </p>

      <div className="mt-8 text-xs">
        <p className="font-bold">Catatan :</p>
        <p className="mt-2 whitespace-pre-line">{transfer.notes ?? ""}</p>
      </div>
    </div>
  );
}

function Meta({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <dt className="font-bold">{label}</dt>
      <dd>
        <span className="mr-2">:</span>
        {children}
      </dd>
    </>
  );
}

function Th({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <th
      className={`border border-black px-2 py-1 text-left font-bold ${className}`}
    >
      {children}
    </th>
  );
}

function Td({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <td className={`border border-black px-2 py-1 align-top ${className}`}>
      {children}
    </td>
  );
}

/** "29 Agu 2026" — the short form the note has always carried. */
function formatNoteDate(iso: string): string {
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
