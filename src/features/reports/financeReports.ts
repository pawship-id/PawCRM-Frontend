import {
  ACCOUNT_CATEGORY_LABEL,
  ACCOUNT_TYPE_LABEL,
  SHARED_LINE_LABEL,
  sourceLabel,
} from "@/features/accounting";
import { reportService } from "@/services/report.service";
import type { AccountType } from "@/types/accounting";
import type {
  AgingKind,
  AgingReportRow,
  CashFlowReport,
  CashFlowSection,
  ExpenseCategory,
  ExpenseReportRow,
  LedgerReport,
} from "@/types/report";

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

/* ------------------------------------------------------- Saldo per akun */

/**
 * One line of the buku besar as it lands in the sheet: an account's opening,
 * each journal line under it, then its closing with the period's totals.
 * The account repeats on every row so the sheet can be filtered by it.
 */
export interface LedgerRow {
  code: string;
  name: string;
  accountType: AccountType;
  date: string | null;
  entryNumber: string | null;
  source: string | null;
  branchName: string | null;
  description: string;
  memo: string | null;
  debit: string | null;
  credit: string | null;
  balance: string;
}

/** The server's per-account ledger, flattened in reading order. */
export function ledgerRows(report: LedgerReport): LedgerRow[] {
  const from = report.range?.fromDate ?? null;
  const to = report.range?.toDate ?? null;

  return report.accounts.flatMap((account) => {
    const base = {
      code: account.code,
      name: account.name,
      accountType: account.accountType,
      entryNumber: null,
      source: null,
      branchName: null,
      memo: null,
    };
    return [
      {
        ...base,
        date: from,
        description: "Saldo awal",
        debit: null,
        credit: null,
        balance: account.opening,
      },
      ...account.lines.map((line) => ({
        ...base,
        date: line.date,
        entryNumber: line.entryNumber,
        source: sourceLabel(line.sourceType),
        branchName: line.branchName,
        description: line.description ?? "",
        memo: line.memo,
        debit: line.debit,
        credit: line.credit,
        balance: line.balance,
      })),
      {
        ...base,
        date: to,
        description: "Saldo akhir",
        debit: account.debit,
        credit: account.credit,
        balance: account.closing,
      },
    ];
  });
}

const LEDGER_COLUMNS: SalesReportColumn<LedgerRow>[] = [
  { header: "Kode akun", value: (r) => r.code, width: 12, about: "Kode akun" },
  { header: "Nama akun", value: (r) => r.name, width: 26, about: "Nama akun" },
  {
    header: "Tipe akun",
    value: (r) => ACCOUNT_TYPE_LABEL[r.accountType],
    width: 12,
    about: "Aset, Kewajiban, Ekuitas, Pendapatan, atau Beban",
  },
  {
    header: "Tanggal",
    value: (r) => r.date,
    type: "date",
    width: 12,
    about: "Tanggal jurnal; untuk saldo awal/akhir, awal/akhir periode",
  },
  {
    header: "No. jurnal",
    value: (r) => r.entryNumber,
    width: 18,
    about: "Nomor jurnal",
  },
  {
    header: "Sumber",
    value: (r) => r.source,
    width: 16,
    about: "Asal jurnal: kasir, faktur, jurnal manual, dst.",
  },
  {
    header: "Cabang",
    value: (r) => r.branchName,
    width: 16,
    about: "Cabang jurnal",
  },
  {
    header: "Keterangan",
    value: (r) => r.description,
    width: 36,
    about: "Keterangan jurnal, atau Saldo awal / Saldo akhir",
  },
  {
    header: "Memo",
    value: (r) => r.memo,
    width: 24,
    about: "Catatan di baris jurnal",
  },
  {
    header: "Debit",
    value: (r) => num(r.debit),
    type: "number",
    width: 16,
    about: "Di baris saldo akhir: total debit periode ini",
  },
  {
    header: "Kredit",
    value: (r) => num(r.credit),
    type: "number",
    width: 16,
    about: "Di baris saldo akhir: total kredit periode ini",
  },
  {
    header: "Saldo",
    value: (r) => num(r.balance),
    type: "number",
    width: 18,
    about:
      "Saldo berjalan, mengikuti saldo normal akun (aset & beban dari debit, lainnya dari kredit)",
  },
];

const ALL_ACCOUNT_TYPES = Object.keys(ACCOUNT_TYPE_LABEL) as AccountType[];

/**
 * Saldo tiap akun dengan rincian ke mutasi jurnal — the buku besar for a
 * period, every account that held or moved money.
 */
export const ledgerReport: SalesReportDefinition<LedgerRow, AccountType> = {
  title: "Saldo per akun",
  description:
    "Saldo tiap akun dengan rincian ke mutasi jurnal. Diunduh sebagai Excel.",
  fileName: "saldo-per-akun",
  rowNoun: "baris",
  periodLabel: "tanggal jurnal",
  locations: "branches",
  note: "Akun yang tidak punya saldo dan tidak bergerak di periode ini tidak dicantumkan.",
  columns: LEDGER_COLUMNS,
  choice: {
    label: "Tipe akun",
    options: ALL_ACCOUNT_TYPES.map((value) => ({
      value,
      label: ACCOUNT_TYPE_LABEL[value],
    })),
    defaults: ALL_ACCOUNT_TYPES,
    summary: (values) =>
      values.length === ALL_ACCOUNT_TYPES.length
        ? "Semua tipe"
        : values.map((v) => ACCOUNT_TYPE_LABEL[v]).join(", "),
  },
  fetch: async ({ dateFrom, dateTo, branchIds }, accountTypes) =>
    ledgerRows(
      await reportService.ledger({ dateFrom, dateTo, branchIds, accountTypes }),
    ),
};

/* --------------------------------------------------- Biaya per kategori */

const EXPENSE_CATEGORIES: ExpenseCategory[] = ["hpp", "biaya", "biaya_lainnya"];

const EXPENSE_COLUMNS: SalesReportColumn<ExpenseReportRow>[] = [
  {
    header: "Kategori",
    value: (r) => ACCOUNT_CATEGORY_LABEL[r.accountCategory],
    width: 22,
    about: "Harga Pokok Penjualan, Biaya, atau Biaya Lainnya",
  },
  {
    header: "Kode akun",
    value: (r) => r.code,
    width: 12,
    about: "Kode akun biaya",
  },
  {
    header: "Nama akun",
    value: (r) => r.name,
    width: 28,
    about: "Nama akun biaya",
  },
  {
    header: "Lini bisnis",
    value: (r) => r.businessLineName ?? SHARED_LINE_LABEL,
    width: 18,
    about: `Lini yang menanggung biaya. "${SHARED_LINE_LABEL}" = belum ada aturan Sub Akun yang membaginya`,
  },
  {
    header: "Biaya langsung",
    value: (r) => num(r.direct),
    type: "number",
    width: 16,
    about: "Yang dicatat langsung ke lini itu",
  },
  {
    header: "Alokasi biaya bersama",
    value: (r) => num(r.allocated),
    type: "number",
    width: 18,
    about: `Bagian biaya bersama yang dibagikan ke lini itu. Minus di baris "${SHARED_LINE_LABEL}" = yang sudah dibagikan keluar`,
  },
  {
    header: "Total",
    value: (r) => num(r.total),
    type: "number",
    width: 16,
    about: "Biaya langsung + alokasi. Sama dengan angka di Laba rugi",
  },
  {
    header: "% dari total biaya",
    value: (r) => r.share,
    type: "number",
    about: "Porsi baris ini dari semua biaya di file",
  },
];

/**
 * Biaya per kategori, termasuk alokasi biaya bersama — one row per cost
 * account × lini bisnis, the laba rugi's figures.
 */
export const expenseReport: SalesReportDefinition<
  ExpenseReportRow,
  ExpenseCategory
> = {
  title: "Biaya per kategori",
  description:
    "Biaya per kategori, termasuk alokasi biaya bersama. Diunduh sebagai Excel.",
  fileName: "biaya-per-kategori",
  rowNoun: "baris",
  periodLabel: "tanggal jurnal",
  locations: "branches",
  note: "Biaya bersama dibagi mengikuti aturan Sub Akun di Daftar Akun, sama persis dengan Laba rugi.",
  columns: EXPENSE_COLUMNS,
  choice: {
    label: "Kategori",
    options: EXPENSE_CATEGORIES.map((value) => ({
      value,
      label: ACCOUNT_CATEGORY_LABEL[value],
    })),
    defaults: EXPENSE_CATEGORIES,
    summary: (values) =>
      values.length === EXPENSE_CATEGORIES.length
        ? "Semua kategori biaya"
        : values.map((v) => ACCOUNT_CATEGORY_LABEL[v]).join(", "),
  },
  fetch: async ({ dateFrom, dateTo, branchIds }, accountCategories) =>
    (
      await reportService.expenses({
        dateFrom,
        dateTo,
        branchIds,
        accountCategories,
      })
    ).rows,
};

/* ---------------------------------------------- Umur piutang & utang */

const AGING_KIND_LABEL: Record<AgingKind, string> = {
  receivable: "Piutang",
  payable: "Utang",
};

const AGING_KINDS = Object.keys(AGING_KIND_LABEL) as AgingKind[];

/**
 * Which side and who, which document, how much is left — then the remainder
 * again under the one bucket it falls in, so each bucket column sums to what
 * is that late.
 */
const AGING_COLUMNS: SalesReportColumn<AgingReportRow>[] = [
  {
    header: "Jenis",
    value: (r) => AGING_KIND_LABEL[r.kind],
    about:
      "Piutang (pelanggan berutang ke toko) atau Utang (toko berutang ke supplier)",
  },
  {
    header: "Pelanggan / Supplier",
    value: (r) => r.partyName,
    width: 26,
    about: "Pihak yang berutang atau yang diutangi",
  },
  {
    header: "No. faktur",
    value: (r) => r.documentNumber,
    width: 22,
    about: "Nomor faktur penjualan atau pembelian",
  },
  {
    header: "Cabang",
    value: (r) => r.branchName,
    width: 16,
    about: "Cabang faktur",
  },
  {
    header: "Tanggal faktur",
    value: (r) => r.invoiceDate,
    type: "date",
    width: 14,
    about: "Tanggal faktur",
  },
  {
    header: "Jatuh tempo",
    value: (r) => r.dueDate,
    type: "date",
    width: 14,
    about: "Batas pembayaran",
  },
  {
    header: "Hari terlambat",
    value: (r) => r.daysOverdue,
    type: "number",
    about: "Hari sejak jatuh tempo, per hari ini. 0 kalau belum jatuh tempo",
  },
  {
    header: "Total",
    value: (r) => num(r.total),
    type: "number",
    width: 16,
    about: "Total faktur",
  },
  {
    header: "Dibayar",
    value: (r) => num(r.paid),
    type: "number",
    width: 16,
    about: "Yang sudah dibayar",
  },
  {
    header: "Sisa",
    value: (r) => num(r.outstanding),
    type: "number",
    width: 16,
    about: "Total − dibayar",
  },
  {
    header: "Belum jatuh tempo",
    value: (r) => num(r.current),
    type: "number",
    width: 16,
    about: "Sisa yang belum lewat jatuh tempo",
  },
  {
    header: "1–30 hari",
    value: (r) => num(r.days1to30),
    type: "number",
    width: 14,
    about: "Sisa yang terlambat 1–30 hari",
  },
  {
    header: "31–60 hari",
    value: (r) => num(r.days31to60),
    type: "number",
    width: 14,
    about: "Sisa yang terlambat 31–60 hari",
  },
  {
    header: "61–90 hari",
    value: (r) => num(r.days61to90),
    type: "number",
    width: 14,
    about: "Sisa yang terlambat 61–90 hari",
  },
  {
    header: "> 90 hari",
    value: (r) => num(r.over90),
    type: "number",
    width: 14,
    about: "Sisa yang terlambat lebih dari 90 hari",
  },
];

/**
 * Piutang dan utang menurut umur — as of today, every document still owed.
 */
export const agingReport: SalesReportDefinition<AgingReportRow, AgingKind> = {
  title: "Umur piutang & utang",
  description:
    "Piutang dan utang menurut umur: belum jatuh tempo, 1–30, 31–60, 61–90, lebih dari 90 hari. Diunduh sebagai Excel.",
  fileName: "umur-piutang-utang",
  rowNoun: "faktur",
  period: false,
  locations: "branches",
  note: "Posisi per hari ini, dihitung dari tanggal jatuh tempo. Utang di sini adalah faktur pembelian; utang konsinyasi ada di layar Konsinyasi.",
  columns: AGING_COLUMNS,
  choice: {
    label: "Jenis",
    options: AGING_KINDS.map((value) => ({
      value,
      label: AGING_KIND_LABEL[value],
    })),
    defaults: AGING_KINDS,
    summary: (values) =>
      values.length === AGING_KINDS.length
        ? "Piutang & utang"
        : values.map((v) => AGING_KIND_LABEL[v]).join(", "),
  },
  fetch: async ({ branchIds }, kinds) =>
    (await reportService.aging({ branchIds, kinds })).rows,
};
