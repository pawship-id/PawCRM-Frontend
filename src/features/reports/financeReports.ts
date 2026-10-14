import { sourceLabel } from "@/features/accounting";
import { reportService } from "@/services/report.service";
import type { CashFlowReport, CashFlowSection } from "@/types/report";

import type {
  SalesReportColumn,
  SalesReportDefinition,
} from "./components/SalesReportDialog";

/**
 * THE LAPORAN › KEUANGAN EXPORTS that open as a dialog — the same
 * `SalesReportDialog` the Penjualan tab uses, in its Cabang-only mode.
 */

/* ------------------------------------------------------------ Arus kas */

/**
 * One line of the statement as it lands in the sheet. The statement is a
 * document read top to bottom, so it is laid out as one: a section, a
 * description, and the money — with the totals as rows of their own.
 */
export interface CashFlowRow {
  section: string;
  label: string;
  entryCount: number | null;
  inflow: string | null;
  outflow: string | null;
  amount: string | null;
}

const SECTION_LABEL: Record<string, string> = {
  operating: "Operasional",
  investing: "Investasi",
  financing: "Pendanaan",
  null: "Belum diklasifikasikan",
};

const sectionLabel = (type: CashFlowSection) => SECTION_LABEL[String(type)];

const num = (value: string | null) => (value === null ? null : Number(value));

/** The server's statement, flattened into rows in reading order. */
export function cashFlowRows(report: CashFlowReport): CashFlowRow[] {
  const balanceRows = (
    section: string,
    side: CashFlowReport["opening"],
    totalLabel: string,
  ): CashFlowRow[] => [
    ...side.accounts.map((account) => ({
      section,
      label: `${account.code} ${account.name}`,
      entryCount: null,
      inflow: null,
      outflow: null,
      amount: account.balance,
    })),
    {
      section,
      label: totalLabel,
      entryCount: null,
      inflow: null,
      outflow: null,
      amount: side.total,
    },
  ];

  return [
    ...balanceRows("Saldo awal", report.opening, "Total saldo awal kas & bank"),
    ...report.sections.flatMap((section) => {
      const name = sectionLabel(section.type);
      return [
        ...section.lines.map((line) => ({
          section: name,
          label: sourceLabel(line.sourceType),
          entryCount: line.entryCount,
          inflow: line.inflow,
          outflow: line.outflow,
          amount: line.net,
        })),
        {
          section: name,
          label:
            section.type === null
              ? "Arus kas bersih belum diklasifikasikan"
              : `Arus kas bersih dari aktivitas ${name.toLowerCase()}`,
          entryCount: null,
          inflow: section.inflow,
          outflow: section.outflow,
          amount: section.net,
        },
      ];
    }),
    {
      section: "Perubahan kas",
      label: "Kenaikan (penurunan) kas bersih",
      entryCount: null,
      inflow: null,
      outflow: null,
      amount: report.netChange,
    },
    ...balanceRows(
      "Saldo akhir",
      report.closing,
      "Total saldo akhir kas & bank",
    ),
  ];
}

const CASH_FLOW_COLUMNS: SalesReportColumn<CashFlowRow>[] = [
  {
    header: "Bagian",
    value: (r) => r.section,
    width: 22,
    about:
      "Saldo awal, Operasional, Investasi, Pendanaan, Perubahan kas, Saldo akhir",
  },
  {
    header: "Keterangan",
    value: (r) => r.label,
    width: 44,
    about: "Sumber transaksi, akun kas & bank, atau baris total",
  },
  {
    header: "Jumlah transaksi",
    value: (r) => r.entryCount,
    type: "number",
    about: "Berapa transaksi yang menggerakkan kas di baris itu",
  },
  {
    header: "Uang masuk",
    value: (r) => num(r.inflow),
    type: "number",
    width: 16,
    about: "Kas yang masuk",
  },
  {
    header: "Uang keluar",
    value: (r) => num(r.outflow),
    type: "number",
    width: 16,
    about: "Kas yang keluar",
  },
  {
    header: "Jumlah",
    value: (r) => num(r.amount),
    type: "number",
    width: 18,
    about: "Masuk − keluar, atau saldo untuk baris saldo awal dan akhir",
  },
];

/**
 * Kas awal sampai kas akhir: operasional, investasi, pendanaan — read off the
 * ledger, every Kas & Bank account together.
 */
export const cashFlowReport: SalesReportDefinition<CashFlowRow, never> = {
  title: "Arus kas",
  description:
    "Kas awal sampai kas akhir: operasional, investasi, pendanaan. Diunduh sebagai Excel.",
  fileName: "arus-kas",
  rowNoun: "baris",
  periodLabel: "tanggal transaksi",
  locations: "branches",
  note: "Dihitung dari jurnal pada semua akun Kas & Bank. Pindah dana antar akun kas sendiri tidak dihitung sebagai masuk atau keluar.",
  columns: CASH_FLOW_COLUMNS,
  fetch: async ({ dateFrom, dateTo, branchIds }) =>
    cashFlowRows(await reportService.cashFlow({ dateFrom, dateTo, branchIds })),
};
