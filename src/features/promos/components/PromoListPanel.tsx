"use client";

import { Info, Pencil, Square, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  Alert,
  ConfirmDialog,
  DataTable,
  FilterBar,
  FilterSearch,
  FilterSelect,
  HighlightText,
  LensCard,
  ListFooter,
  RowLinkMenu,
  withAll,
  type DataTableColumn,
  type RowAction,
  type RowLink,
} from "@/components";
import { ToneBadge } from "@/features/memberships";
import { formatDate, formatRupiah } from "@/features/memberships/labels";
import { usePermissions } from "@/features/permissions";
import { swalToast } from "@/lib/swal";
import { promoService } from "@/services/promo.service";
import type { Promo, PromoStatus, PromoType } from "@/types/promo";

import { promoFailure } from "../errors";
import { PROMO_PAGE_SIZE, usePromos } from "../hooks/usePromos";
import {
  PROMO_STATUSES,
  PROMO_STATUS_LABEL,
  PROMO_TYPES,
  PROMO_TYPE_LABEL,
  promoEditHref,
  promoItemsText,
  weekdaysText,
} from "../labels";
import { PromoStatusBadge } from "./PromoStatusBadge";

/**
 * Promosi › Promo — every promo the shop has (BO mockup `tabPromo`).
 *
 * THE STATUS STRIP IS THE LENS (ui-rules §8, the same cards as Anggota):
 * Berjalan · Terjadwal · Draft · Berakhir with their counts, applying on
 * click; the pressed card pressed again lets go. Below it a quick bar —
 * search and one Jenis select, which applies on click (two controls is below
 * a panel's floor).
 *
 * The row opens the form. Hentikan and Hapus live in the row's kebab, each
 * behind a ConfirmDialog, and only where the server would allow them:
 * Hentikan for a scheduled or running promo, Hapus for a draft or a promo
 * nobody has used.
 */

const TYPE_OPTIONS = withAll(
  PROMO_TYPES.map((value) => ({ value, label: PROMO_TYPE_LABEL[value] })),
  "Semua",
);

type Pending = { kind: "stop" | "delete"; promo: Promo };

export function PromoListPanel() {
  const router = useRouter();
  const { can } = usePermissions();
  const { promos, counts, pagination, loading, error, query, patchQuery, reload } = usePromos();
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);

  const filtered = Boolean(query.status || query.type || query.search);

  function pickStatus(status: PromoStatus) {
    patchQuery({ status: query.status === status ? undefined : status });
  }

  async function act({ kind, promo }: Pending) {
    setBusy(true);
    try {
      if (kind === "stop") {
        await promoService.stop(promo.id);
        swalToast(`"${promo.name}" dihentikan.`, "success");
      } else {
        await promoService.remove(promo.id);
        swalToast(`"${promo.name}" dihapus.`, "success");
      }
      reload();
    } catch (err) {
      swalToast(
        promoFailure(err, kind === "stop" ? "Gagal menghentikan promo." : "Gagal menghapus promo.").toast,
        "error",
        6000,
      );
    } finally {
      setBusy(false);
      setPending(null);
    }
  }

  const columns: DataTableColumn<Promo>[] = [
    {
      id: "promo",
      header: "Promo",
      cell: (promo) => {
        const days = weekdaysText(promo.restrictions.weekdays);
        return (
          <>
            <span className="block font-medium text-foreground">
              <HighlightText text={promo.name} query={query.search} />
            </span>
            <span className="block text-sm text-muted tabular-nums">
              <HighlightText text={promo.code} query={query.search} />
              {days && ` · tiap ${days}`}
            </span>
          </>
        );
      },
    },
    {
      id: "type",
      header: "Jenis",
      cell: (promo) => <ToneBadge tone="brand" label={PROMO_TYPE_LABEL[promo.type]} />,
    },
    {
      id: "period",
      header: "Periode",
      cellClassName: "whitespace-nowrap tabular-nums",
      cell: (promo) =>
        `${formatDate(promo.restrictions.startDate)} – ${
          promo.restrictions.endDate ? formatDate(promo.restrictions.endDate) : "tanpa batas"
        }`,
    },
    {
      id: "items",
      header: "Berlaku untuk",
      cellClassName: "max-w-72 whitespace-normal",
      cell: (promo) => promoItemsText(promo),
    },
    {
      id: "used",
      header: "Terpakai",
      align: "right",
      cellClassName: "whitespace-nowrap tabular-nums",
      cell: (promo) =>
        promo.restrictions.quotaTotal
          ? `${promo.usage.used} / ${promo.restrictions.quotaTotal}`
          : String(promo.usage.used),
    },
    {
      id: "discount",
      header: "Potongan",
      align: "right",
      cellClassName: "whitespace-nowrap tabular-nums",
      cell: (promo) => formatRupiah(promo.usage.discount),
    },
    {
      id: "status",
      header: "Status",
      cell: (promo) => <PromoStatusBadge promo={promo} />,
    },
    {
      id: "actions",
      header: <span className="sr-only">Aksi</span>,
      align: "right",
      cell: (promo) => {
        const links: RowLink[] = can("promos", "update")
          ? [{ href: promoEditHref(promo.id), label: "Ubah", icon: <Pencil /> }]
          : [];
        const actions: RowAction[] = [];
        if (can("promos", "update") && (promo.status === "running" || promo.status === "scheduled")) {
          actions.push({
            label: "Hentikan",
            icon: <Square />,
            onSelect: () => setPending({ kind: "stop", promo }),
          });
        }
        if (can("promos", "delete") && (promo.status === "draft" || promo.usage.used === 0)) {
          actions.push({
            label: "Hapus",
            icon: <Trash2 />,
            destructive: true,
            onSelect: () => setPending({ kind: "delete", promo }),
          });
        }
        if (!links.length && !actions.length) return null;
        return <RowLinkMenu name={promo.name} links={links} actions={actions} />;
      },
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div
        role="group"
        aria-label="Status promo"
        className="grid grid-cols-2 gap-3 lg:grid-cols-4"
      >
        {PROMO_STATUSES.map((status) => (
          <LensCard
            key={status}
            label={PROMO_STATUS_LABEL[status]}
            count={counts?.[status]}
            tone="default"
            pressed={query.status === status}
            onPress={() => pickStatus(status)}
          />
        ))}
      </div>

      <FilterBar
        searchPlacement="leading"
        searchClassName="min-w-[12rem] flex-1"
        search={
          <FilterSearch
            value={query.search}
            onChange={(value) => patchQuery({ search: value })}
            ariaLabel="Cari promo"
            placeholder="Cari nama atau kode promo"
            fill
          />
        }
      >
        <FilterSelect
          layout="bar"
          label="Jenis"
          ariaLabel="Filter jenis promo"
          value={query.type ?? ""}
          options={TYPE_OPTIONS}
          onChange={(type) => patchQuery({ type: (type || undefined) as PromoType | undefined })}
        />
      </FilterBar>

      {error && <Alert variant="error">{error}</Alert>}

      <DataTable
        columns={columns}
        rows={promos}
        rowKey={(promo) => promo.id}
        loading={loading}
        onRowClick={can("promos", "update") ? (promo) => router.push(promoEditHref(promo.id)) : undefined}
        tableClassName="min-w-[60rem]"
        empty={
          <p className="py-8 text-center text-sm text-muted">
            {filtered
              ? "Tidak ada promo yang cocok."
              : "Belum ada promo. Tekan Buat promo untuk membuat yang pertama →"}
          </p>
        }
      />

      {pagination && pagination.total > 0 && (
        <ListFooter
          page={pagination.page}
          pageSize={pagination.limit}
          pageSizes={[PROMO_PAGE_SIZE, 50, 100]}
          total={pagination.total}
          totalPages={pagination.totalPages}
          unit="promo"
          onPageChange={(page) => patchQuery({ page })}
          onPageSizeChange={(limit) => patchQuery({ limit })}
        />
      )}

      <div className="flex gap-3 rounded-xl bg-tint-info p-4 text-sm">
        <Info className="mt-0.5 size-4 flex-none text-info" aria-hidden />
        <div>
          <p className="font-semibold text-foreground">Satu item, satu promo otomatis</p>
          <p className="mt-1 text-muted">
            Kalau satu item kena lebih dari satu promo, kasir memakai yang paling menguntungkan
            pelanggan, kecuali promo ditandai bisa digabung.
          </p>
        </div>
      </div>

      {pending && (
        <ConfirmDialog
          title={pending.kind === "stop" ? "Hentikan promo?" : "Hapus promo?"}
          confirmLabel={pending.kind === "stop" ? "Hentikan" : "Hapus"}
          destructive
          busy={busy}
          onConfirm={() => act(pending)}
          onCancel={() => setPending(null)}
        >
          {pending.kind === "stop" ? (
            <>
              &ldquo;{pending.promo.name}&rdquo; berhenti berlaku hari ini, di semua kanal. Riwayat
              pemakaiannya tetap tersimpan. Promo yang sudah dihentikan tidak bisa dijalankan lagi —
              buat promo baru kalau perlu.
            </>
          ) : (
            <>
              &ldquo;{pending.promo.name}&rdquo; akan dihapus. Promo ini belum pernah dipakai, jadi
              tidak ada riwayat transaksi yang hilang.
            </>
          )}
        </ConfirmDialog>
      )}
    </div>
  );
}

