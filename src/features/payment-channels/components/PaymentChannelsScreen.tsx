"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";

import {
  Alert,
  FilterBar,
  FilterSearch,
  FilterSelect,
  FilterToggle,
  Spinner,
  withAll,
} from "@/components";
import { Button } from "@/components/ui/button";
import { Can } from "@/features/permissions";
import { chartOfAccountsService } from "@/services/chartOfAccounts.service";
import { branchService } from "@/services/branch.service";

import {
  usePaymentChannels,
  CHANNEL_TYPE_LABELS,
  CHANNEL_TYPE_ORDER,
  type PaymentChannelsQuery,
} from "../hooks/usePaymentChannels";
import { PaymentChannelsTable } from "./PaymentChannelsTable";

const TYPES = withAll<PaymentChannelsQuery["type"]>(
  CHANNEL_TYPE_ORDER.map((type) => ({
    value: type,
    label: CHANNEL_TYPE_LABELS[type],
  })),
  "Semua tipe",
);

/**
 * Keuangan → Kas & Bank. The channels a cashier can take money through.
 *
 * IN KEUANGAN, NOT MASTER DATA, because what is being edited is a mapping to the
 * chart of accounts — the row's whole purpose is the account it debits, and the
 * person who knows which account is right is the one who reads the ledger.
 *
 * THE ACCOUNT AND BRANCH LABELS ARE FETCHED HERE, once, and handed to the table
 * as maps. The alternative — a lookup per row — would be six requests for six
 * channels, and the table would have to own loading states for data it does not
 * otherwise care about.
 */
export function PaymentChannelsScreen() {
  const { channels, query, loading, error, setQuery, refetch } =
    usePaymentChannels();

  const [accountLabels, setAccountLabels] = useState<Map<string, string>>(
    new Map(),
  );
  const [branchLabels, setBranchLabels] = useState<Map<string, string>>(
    new Map(),
  );

  useEffect(() => {
    let active = true;

    Promise.all([
      // Only assets can be a channel's account, so only assets are worth
      // labelling — and it keeps the request small on a tenant with a long chart.
      chartOfAccountsService.list({ accountType: "asset", limit: 100 }),
      branchService.list({ limit: 100 }),
    ])
      .then(([accounts, branches]) => {
        if (!active) return;
        setAccountLabels(
          new Map(
            accounts.items.map((account) => [
              account._id,
              `${account.code} · ${account.name}`,
            ]),
          ),
        );
        setBranchLabels(
          new Map(branches.items.map((branch) => [branch._id, branch.name])),
        );
      })
      // A missing label renders as a dash. Failing loudly here would put a red
      // banner over a list that is otherwise perfectly readable.
      .catch(() => {});

    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-extrabold text-foreground">Kas & Bank</h1>
        <p className="mt-1 text-sm text-muted">
          Tempat uang masuk saat kasir menerima pembayaran, dan akun mana yang
          dicatat. Kasir memilih channel yang spesifik — bukan cuma
          &ldquo;transfer&rdquo; — supaya jurnalnya mendarat di akun yang benar.
        </p>
      </div>

      <FilterBar
        search={
          <FilterSearch
            value={query.search}
            onChange={(search) => setQuery({ search })}
            placeholder="Cari nama channel"
            ariaLabel="Cari channel pembayaran"
          />
        }
        actions={
          <Can feature="paymentChannels" action="create">
            <Button asChild>
              <Link href="/dashboard/keuangan/kas-bank/new">
                <Plus className="size-4" />
                Channel baru
              </Link>
            </Button>
          </Can>
        }
      >
        <FilterSelect
          label="Tipe"
          ariaLabel="Filter tipe channel"
          value={query.type}
          options={TYPES}
          onChange={(type) => setQuery({ type })}
        />
        <FilterToggle
          label="Tampilkan terhapus"
          checked={query.includeDeleted}
          onChange={(includeDeleted) => setQuery({ includeDeleted })}
        />
      </FilterBar>

      {error && <Alert variant="error">{error}</Alert>}

      {loading && channels.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
          <Spinner /> Memuat daftar channel…
        </div>
      ) : (
        <PaymentChannelsTable
          channels={channels}
          loading={loading}
          onChanged={refetch}
          search={query.search}
          accountLabels={accountLabels}
          branchLabels={branchLabels}
        />
      )}
    </div>
  );
}
