"use client";

import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { usePermissions } from "@/features/permissions";
import { cn } from "@/lib/utils";

import { useSetupCounts, type SetupCount } from "../hooks/useSetupCounts";

/**
 * Pengaturan → Data Awal: the opening figures, before Buloo starts recording.
 *
 * A LIST OF STEPS, NOT A HUB OF CARDS, which is what the mockup draws (`s-awal`)
 * and what the work actually is: the order binds. Opening stock needs products
 * first, opening receivables need customers, and the closing equity figure is
 * whatever is left once the rest balance. Cards would present seven independent
 * errands and let somebody start at the wrong end.
 *
 * A STEP READS "SELESAI" WHEN ITS COUNT IS ABOVE ZERO, which is as much as this
 * screen can honestly claim. Nothing in the database records that a shop
 * FINISHED importing its catalogue — only how many products exist — so the
 * status reports what was counted ("selesai · 248 produk") rather than asserting
 * a completeness nobody ever wrote down.
 *
 * THE LAST THREE ARE LOCKED, and not because this screen is enforcing an
 * ordering rule: their screens do not exist. Saldo awal kas & bank, piutang &
 * utang awal and ekuitas awal have no route to send anybody to, so the rows say
 * so rather than offering a link into nothing.
 *
 * WHAT THE MOCKUP HAS AND THIS DOES NOT: per-branch progress ("2 dari 4
 * cabang"). Every count here is tenant-wide, because none of these endpoints
 * groups by branch — and "2 dari 4" computed from a tenant-wide total would be
 * arithmetic dressed as a fact. The mockup's own note says that progress belongs
 * per branch; when the API can answer it, this is where it lands.
 */
interface Step {
  title: string;
  description: string;
  /** Absent on a step whose screen does not exist yet. */
  href?: string;
  /** The right-hand status, already worded. */
  status: string;
  /** Whether it reads as done — a tick instead of its number. */
  done: boolean;
  /** Dimmed, and with no way in. */
  locked?: boolean;
}

/** "selesai · 248 produk", "belum ada", or a dash while the answer is in flight. */
function statusOf(count: SetupCount, unit: string): string {
  if (count.loading) return "…";
  if (count.error) return "gagal dimuat";
  if (count.total === 0) return "belum ada";
  return `selesai · ${count.total} ${unit}`;
}

const isDone = (count: SetupCount) =>
  !count.loading && !count.error && count.total > 0;

export function InitialDataScreen() {
  const { can } = usePermissions();

  const mayReadBranches = can("branches", "read");
  // Its own grant, not the branch one: a role may read the books a shop keeps
  // without being allowed to read where its stock sits, and asking anyway would
  // collect a 403 for a figure this row would simply leave out.
  const mayReadWarehouses = can("warehouses", "read");
  const mayReadProducts = can("products", "read");
  const mayReadCustomers = can("customers", "read");
  const mayReadSuppliers = can("suppliers", "read");

  const counts = useSetupCounts({
    branches: mayReadBranches,
    warehouses: mayReadWarehouses,
    products: mayReadProducts,
    customers: mayReadCustomers,
    suppliers: mayReadSuppliers,
    /*
      THE OPENING-STOCK COUNT RIDES ON `products:read`, not on a stock grant, and
      that is the call its own screen already makes: recording a shop's first
      stock is the continuation of registering a catalogue — it posts
      `opening_balance` against capital, never against inventory loss — which is
      why that route is gated on `products` rather than on `stockMovements`.
    */
    openingStock: mayReadProducts,
  });

  const steps: Step[] = [
    {
      title: "Cabang & gudang",
      description: "Tempat semua saldo dan stok nanti menempel.",
      href: mayReadBranches ? "/dashboard/master/branches" : undefined,
      status: mayReadBranches
        ? `${statusOf(counts.branches, "cabang")}${
            mayReadWarehouses && isDone(counts.warehouses)
              ? ` · ${counts.warehouses.total} gudang`
              : ""
          }`
        : "tidak bisa dilihat",
      done: isDone(counts.branches),
    },
    {
      title: "Produk & kategori",
      description: "Impor katalog lewat Excel, atau isi satu per satu.",
      href: mayReadProducts ? "/dashboard/inventory/products" : undefined,
      status: mayReadProducts
        ? statusOf(counts.products, "produk")
        : "tidak bisa dilihat",
      done: isDone(counts.products),
    },
    {
      title: "Pelanggan & supplier",
      description: "Impor daftar dari file lama, atau daftarkan seperlunya.",
      href: mayReadCustomers ? "/dashboard/master/customers" : undefined,
      status:
        mayReadCustomers || mayReadSuppliers
          ? [
              mayReadCustomers ? statusOf(counts.customers, "pelanggan") : null,
              mayReadSuppliers && isDone(counts.suppliers)
                ? `${counts.suppliers.total} supplier`
                : null,
            ]
              .filter(Boolean)
              .join(" · ")
          : "tidak bisa dilihat",
      done: isDone(counts.customers),
    },
    {
      title: "Stok awal",
      description:
        "Jumlah, nilai, batch, dan kedaluwarsa per gudang pada tanggal mulai — bukan penyesuaian.",
      href: mayReadProducts ? "/dashboard/inventory/opening-stock" : undefined,
      status: mayReadProducts
        ? statusOf(counts.openingStock, "dokumen")
        : "tidak bisa dilihat",
      done: isDone(counts.openingStock),
    },
    {
      title: "Saldo awal kas & bank",
      description: "Saldo tiap akun kas dan bank pada tanggal mulai.",
      status: "belum tersedia",
      done: false,
      locked: true,
    },
    {
      title: "Piutang & utang awal",
      description:
        "Faktur lama yang belum lunas, supaya penagihan dan pembayaran tidak putus di tanggal mulai.",
      status: "belum tersedia",
      done: false,
      locked: true,
    },
    {
      title: "Ekuitas awal",
      description:
        "Selisih otomatis supaya neraca pertama seimbang — dihitung, bukan diketik.",
      status: "menunggu langkah di atas",
      done: false,
      locked: true,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-extrabold text-foreground">Data Awal</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Angka pembuka sebelum Buloo mulai mencatat. Urutannya mengikat — stok
          awal butuh produk lebih dulu, piutang awal butuh pelanggan.
        </p>
      </div>

      <ol className="overflow-hidden rounded-2xl border border-border bg-surface">
        {steps.map((step, index) => (
          <li
            key={step.title}
            className={cn(
              "flex flex-wrap items-start gap-x-4 gap-y-2 px-5 py-4",
              index > 0 && "border-t border-border",
              step.locked && "opacity-60",
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                "flex size-7 flex-none items-center justify-center rounded-full text-xs font-bold tabular-nums",
                step.done
                  ? "bg-tint-success text-success"
                  : "bg-surface-selected text-primary",
              )}
            >
              {step.done ? <Check className="size-4" /> : index + 1}
            </span>

            <div className="min-w-0 flex-1">
              <p className="font-semibold text-foreground">{step.title}</p>
              <p className="mt-0.5 text-sm text-muted">{step.description}</p>
            </div>

            <div className="flex flex-none items-center gap-3">
              {/* The wording carries the state and the colour only underlines
                  it — a locked row still says WHAT it is waiting for, which is
                  the one thing "Segera" on its own cannot. */}
              <span
                className={cn(
                  "text-xs tabular-nums",
                  step.locked
                    ? "text-muted"
                    : step.done
                      ? "font-semibold text-success"
                      : "text-warning",
                )}
              >
                {step.status}
              </span>

              {step.locked && <Badge variant="outline">Segera</Badge>}

              {step.href && (
                <Link
                  href={step.href}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-1 text-sm font-semibold text-primary transition-colors hover:text-primary-hover focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  Buka
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
