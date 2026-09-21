"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, RotateCcw } from "lucide-react";

import {
  Alert,
  Card,
  FilterBar,
  FilterSearch,
  FilterToggle,
  Spinner,
} from "@/components";
import { Button } from "@/components/ui/button";
import { Can } from "@/features/permissions";
import { useDebouncedQuery } from "@/hooks/useDebouncedQuery";

import { usePaymentChannelList } from "../hooks/usePaymentChannelList";
import { PaymentChannelsTable } from "./PaymentChannelsTable";

const NEW_HREF = "/dashboard/pengaturan/channel-pembayaran/new";

/**
 * CHANNEL PEMBAYARAN — the named places money can arrive, and the account each
 * one lands in.
 *
 * MOVED HERE FROM KEUANGAN › KAS & BANK on 20 September 2026, on request. It
 * belongs with the setup screens rather than with the reports, for the same
 * reason Daftar Akun moved a few rows above it: a channel is configured once and
 * then referred to — by the POS payment panel, by the supplier payment picker —
 * which is what every other row in this nav group is. Kas & Bank kept the
 * question it is named for, and now answers it per ACCOUNT, where the saldo
 * column adds up.
 *
 * A QUICK BAR, NOT A PANEL (ui-rules §8). Two fields — a search and one toggle —
 * is at the floor where a `Filter (n)` button would be hiding two things behind
 * one click. Both apply live: the search settles 300 ms after typing stops
 * (`useDebouncedQuery`), the toggle on the click.
 *
 * "TAMPILKAN TERHAPUS" IS HOW A DELETED CHANNEL IS RESTORED, which is why it is
 * a visible control rather than a query parameter somebody has to know about. A
 * channel is soft-deleted precisely so the transactions that used it stay
 * readable; without this toggle there would be no way back.
 */
export function PaymentChannelsScreen() {
  const [query, setQuery] = useState({ search: "", includeDeleted: false });
  /*
    Only the text field waits. The toggle is a finished decision and goes
    straight through — see the hook's own header for why debouncing the whole
    object makes a checkbox feel broken.
  */
  const settled = useDebouncedQuery(query);

  const { rows, loading, error, refetch } = usePaymentChannelList(settled);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold">Channel Pembayaran</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Tombol yang dipilih kasir saat menerima uang, dan akun kas atau bank
            yang menampungnya. Jumlah uang yang masuk lewat masing-masing akun
            ada di Keuangan › Kas &amp; Bank.
          </p>
        </div>
        <Can feature="paymentChannels" action="create">
          <Button asChild>
            <Link href={NEW_HREF}>
              <Plus className="size-4" />
              Channel baru
            </Link>
          </Button>
        </Can>
      </div>

      {/* ui-rules §8: a quick bar — two fields, both applying on the spot,
          search pinned far right. */}
      <FilterBar
        search={
          <FilterSearch
            value={query.search}
            onChange={(search) => setQuery((q) => ({ ...q, search }))}
            placeholder="Cari nama channel…"
            ariaLabel="Cari channel pembayaran"
          />
        }
      >
        <FilterToggle
          label="Tampilkan terhapus"
          checked={query.includeDeleted}
          onChange={(includeDeleted) =>
            setQuery((q) => ({ ...q, includeDeleted }))
          }
        />
      </FilterBar>

      {error && (
        <Alert variant="error">
          <span className="flex flex-wrap items-center gap-3">
            {error}
            <Button variant="secondary" size="sm" onClick={refetch}>
              <RotateCcw className="size-4" />
              Coba lagi
            </Button>
          </span>
        </Alert>
      )}

      {loading && rows.length === 0 ? (
        <Card>
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
            <Spinner /> Memuat channel…
          </div>
        </Card>
      ) : (
        <PaymentChannelsTable
          rows={rows}
          loading={loading}
          onChanged={refetch}
          search={query.search}
        />
      )}
    </div>
  );
}
