"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";

import {
  Alert,
  Card,
  CheckRow,
  CheckRowGroup,
  FilterBar,
  FilterSelect,
  FormActionBar,
  SelectField,
  TextField,
} from "@/components";
import { Button } from "@/components/ui/button";
import { Can, usePermissions } from "@/features/permissions";
import { swalToast } from "@/lib/swal";
import { marketplaceService } from "@/services/marketplace.service";
import type { AccountRole, MarketplaceStore, StoreAccountRow } from "@/types/marketplace";

import { ecommerceFailure } from "../errors";
import { useMarketplaceStores } from "../hooks/useMarketplaceStores";
import { useSelectedStore } from "../hooks/useSelectedStore";
import { useAccountOptions } from "../hooks/useAccountOptions";
import { useWarehouseOptions } from "../hooks/useWarehouseOptions";
import { ECOMMERCE_SKU_HREF, ORDER_STATUSES, formatCount, formatDateTime, withStore } from "../labels";
import { ConnectStoreDialog } from "./ConnectStoreDialog";
import { EcommerceHeader } from "./EcommerceHeader";
import { NoStoresCard } from "./NoStoresCard";
import { StorePicker } from "./StorePicker";

/**
 * Penjualan › E-commerce › Pengaturan — one store's settings (Tahap A).
 *
 * Name, status, the warehouse stock is read from and the buffer held back.
 * Shop ID and the Shopee username are shown, never edited: the first template
 * sets the one and the first payout report the other.
 */
export function StoreSettingsScreen({ initialStoreId }: { initialStoreId?: string | null }) {
  const { stores, loading, error, refetch } = useMarketplaceStores();
  const { storeId, store, select } = useSelectedStore(stores, initialStoreId);
  const [connecting, setConnecting] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <EcommerceHeader stores={stores} storeId={storeId} onChanged={refetch} />

      {error ? <Alert variant="error">{error}</Alert> : null}

      {!loading && stores.length === 0 && !error ? (
        <NoStoresCard
          onCreated={(created) => {
            select(created._id);
            refetch();
          }}
        />
      ) : null}

      {store ? (
        <>
          <FilterBar
            actions={
              <Can feature="ecommerce" action="manageStores">
                <Button type="button" variant="secondary" onClick={() => setConnecting(true)}>
                  <Plus className="size-4" aria-hidden />
                  Hubungkan toko
                </Button>
              </Can>
            }
          >
            <StorePicker stores={stores} value={storeId} onChange={select} />
          </FilterBar>

          <StoreForm key={`${store._id}:${store.updatedAt}`} store={store} onSaved={refetch} />
        </>
      ) : null}

      {connecting ? (
        <ConnectStoreDialog
          onClose={() => setConnecting(false)}
          onCreated={(created) => {
            setConnecting(false);
            select(created._id);
            refetch();
          }}
        />
      ) : null}
    </div>
  );
}

function StoreForm({ store, onSaved }: { store: MarketplaceStore; onSaved: () => void }) {
  const { can } = usePermissions();
  const editable = can("ecommerce", "manageStores");
  const warehouses = useWarehouseOptions();

  const [name, setName] = useState(store.name);
  const [isActive, setIsActive] = useState(store.isActive ? "active" : "inactive");
  const [warehouseId, setWarehouseId] = useState(store.warehouseId);
  const [stockBuffer, setStockBuffer] = useState(String(store.stockBuffer));
  const [importStatuses, setImportStatuses] = useState<string[]>(store.importStatuses ?? [...ORDER_STATUSES]);
  // Role → chosen account id; a role left out stays on what the server has.
  const [accountRows, setAccountRows] = useState<StoreAccountRow[]>([]);
  const [accountChoice, setAccountChoice] = useState<Partial<Record<AccountRole, string>>>({});
  const accountOptions = useAccountOptions();
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    let active = true;
    marketplaceService
      .getAccounts(store._id)
      .then((rows) => {
        if (active) setAccountRows(rows);
      })
      .catch(() => {
        if (active) setAccountRows([]);
      });
    return () => {
      active = false;
    };
  }, [store._id, store.updatedAt]);

  // The current warehouse stays nameable even when the picker cannot load
  // (a role without Gudang) or it has been deactivated since.
  const warehouseOptions = useMemo(
    () =>
      warehouses.options.some((option) => option.value === store.warehouseId) || !store.warehouseName
        ? warehouses.options
        : [{ value: store.warehouseId, label: store.warehouseName }, ...warehouses.options],
    [warehouses.options, store.warehouseId, store.warehouseName],
  );

  const buffer = Number(stockBuffer);
  const blockedReason = !name.trim()
    ? "nama toko kosong"
    : importStatuses.length === 0
      ? "pilih minimal satu status pesanan"
    : !Number.isInteger(buffer) || buffer < 0
      ? "buffer stok harus bilangan bulat 0 atau lebih"
      : null;
  const statusesChanged =
    [...importStatuses].sort().join("|") !== [...(store.importStatuses ?? [...ORDER_STATUSES])].sort().join("|");
  const changedAccounts = Object.fromEntries(
    Object.entries(accountChoice).filter(
      ([role, id]) => id !== accountRows.find((row) => row.role === role)?.account._id,
    ),
  ) as Partial<Record<AccountRole, string>>;
  const dirty =
    statusesChanged ||
    Object.keys(changedAccounts).length > 0 ||
    name.trim() !== store.name ||
    (isActive === "active") !== store.isActive ||
    warehouseId !== store.warehouseId ||
    buffer !== store.stockBuffer;

  const save = async () => {
    if (blockedReason || !dirty) return;
    setSaving(true);
    try {
      await marketplaceService.updateStore(store._id, {
        name: name.trim(),
        isActive: isActive === "active",
        warehouseId,
        stockBuffer: buffer,
        ...(statusesChanged ? { importStatuses } : {}),
        ...(Object.keys(changedAccounts).length > 0 ? { accounts: changedAccounts } : {}),
      });
      setAccountChoice({});
      swalToast("Pengaturan toko tersimpan.");
      setErrors({});
      onSaved();
    } catch (error) {
      const failure = ecommerceFailure(error, "Pengaturan toko belum bisa disimpan.");
      setErrors(failure.fieldErrors);
      swalToast(failure.toast, "error", 6000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      {editable ? (
        <FormActionBar
          submitLabel="Simpan toko"
          submitting={saving}
          disabled={Boolean(blockedReason) || !dirty}
          blockedReason={blockedReason}
        />
      ) : null}

      <Card title="Toko">
        <fieldset disabled={!editable} className="grid gap-4 md:grid-cols-2">
          <TextField
            label="Nama toko"
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            error={errors.name}
            maxLength={80}
          />
          <SelectField
            label="Status"
            value={isActive}
            onChange={setIsActive}
            options={[
              { value: "active", label: "Aktif" },
              { value: "inactive", label: "Nonaktif" },
            ]}
            hint="Toko nonaktif tidak bisa diekspor stoknya."
          />
          <FilterSelect
            label="Gudang sumber stok"
            layout="form"
            active={false}
            required
            searchable
            disabled={!editable}
            value={warehouseId}
            options={warehouseOptions}
            onChange={setWarehouseId}
            error={errors.warehouseId}
          />
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">Cabang</span>
            <p className="flex min-h-11 items-center text-sm text-foreground">
              {store.branchName ?? "—"}
            </p>
            <p className="text-xs text-muted">Ikut gudang sumber. Faktur dan pencairan toko ini dicatat di cabang ini.</p>
          </div>
          <TextField
            label="Buffer stok"
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={stockBuffer}
            onChange={(event) => setStockBuffer(event.target.value)}
            hint="Stok di file = stok gudang − buffer, minimal 0. Kalau dua toko memakai gudang yang sama, keduanya menerima stok yang sama."
            error={errors.stockBuffer}
          />
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">Username Shopee</span>
            <p className="flex min-h-11 items-center text-sm text-foreground">
              {store.shopUsername ?? "—"}
            </p>
            <p className="text-xs text-muted">
              Diambil dari Laporan Penghasilan pertama yang diimpor, lalu dikunci.
            </p>
          </div>
        </fieldset>
      </Card>

      <Card title="Impor pesanan">
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted">
            Status pesanan Shopee yang jadi faktur. Belum Bayar dan Batal tidak pernah jadi faktur.
          </p>
          <CheckRowGroup>
            {ORDER_STATUSES.map((status) => (
              <CheckRow
                key={status}
                label={status}
                disabled={!editable}
                checked={importStatuses.includes(status)}
                onCheckedChange={(checked) =>
                  setImportStatuses((current) =>
                    checked ? [...current, status] : current.filter((value) => value !== status),
                  )
                }
              />
            ))}
          </CheckRowGroup>
          <p className="text-sm text-muted">
            Pelanggan di faktur: <span className="font-medium text-foreground">Shopee – {store.name}</span>{" "}
            (dibuat otomatis saat impor pertama, tidak bisa diubah). Tanggal faktur = waktu
            pembayaran. Harga = Harga Awal, diskon baris = Diskon Dari Penjual, diskon faktur =
            Voucher Ditanggung Penjual.
          </p>
        </div>
      </Card>

      <Card title="Akun">
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted">
            Akun untuk faktur dan pencairan toko ini. Bawaan sudah disiapkan; ganti hanya kalau
            pembukuan toko berbeda.
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            {accountRows.map((row) => {
              const current = accountChoice[row.role] ?? row.account._id;
              const options = accountOptions.some((option) => option.value === row.account._id)
                ? accountOptions
                : [{ value: row.account._id, label: `${row.account.code} ${row.account.name}` }, ...accountOptions];
              return (
                <FilterSelect
                  key={row.role}
                  label={row.label}
                  layout="form"
                  active={false}
                  searchable
                  disabled={!editable}
                  value={current}
                  options={options}
                  onChange={(id) => setAccountChoice((choice) => ({ ...choice, [row.role]: id }))}
                  hint={row.isDefault ? `Bawaan ${row.defaultCode}` : "Dipilih untuk toko ini"}
                  error={errors[`accounts.${row.role}`]}
                />
              );
            })}
          </div>
        </div>
      </Card>

      <Card title="Template Shopee">
        <div className="flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            {store.template ? (
              <>
                <p className="break-all font-medium text-foreground">{store.template.fileName}</p>
                <p className="text-muted">
                  {formatCount(store.template.variantCount)} varian · diupload{" "}
                  {formatDateTime(store.template.uploadedAt)} · Shop ID {store.shopId}
                </p>
              </>
            ) : (
              <p className="text-muted">Belum diupload. Shop ID diambil dari template pertama.</p>
            )}
          </div>
          <Button asChild variant="secondary">
            <Link href={withStore(ECOMMERCE_SKU_HREF, store._id)}>Buka Pengikatan SKU</Link>
          </Button>
        </div>
      </Card>
    </form>
  );
}
