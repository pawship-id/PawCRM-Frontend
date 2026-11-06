"use client";

import { useState } from "react";

import { FilterSelect, TextField } from "@/components";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { swalToast } from "@/lib/swal";
import { marketplaceService } from "@/services/marketplace.service";
import type { Marketplace, MarketplaceStore } from "@/types/marketplace";

import { ecommerceFailure } from "../errors";
import { useAccountOptions } from "../hooks/useAccountOptions";
import { useWarehouseOptions } from "../hooks/useWarehouseOptions";
import { MARKETPLACE_LABEL, marketplaceProfile } from "../labels";

const MARKETPLACE_OPTIONS = (Object.keys(MARKETPLACE_LABEL) as Marketplace[]).map((value) => ({
  value,
  label: MARKETPLACE_LABEL[value],
}));

/**
 * Hubungkan toko — a Shopee shop, or a TikTok Shop / Tokopedia store (one
 * Seller Center, so one store), as a store of this tenant. The Shop ID is not
 * asked for: Shopee's first template supplies it and locks it; TikTok's files
 * name no shop. Either way the next step after saving is that upload.
 *
 * "Dana cair masuk ke" as the mockup draws it: a new "Saldo Shopee – <toko>"
 * account by default (the server opens it, numbered under 1106), or an
 * existing Kas & Bank account.
 */
export function ConnectStoreDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (store: MarketplaceStore) => void;
}) {
  const warehouses = useWarehouseOptions();
  const [marketplace, setMarketplace] = useState<Marketplace>("shopee");
  const profile = marketplaceProfile(marketplace);
  const [name, setName] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [saldoAccount, setSaldoAccount] = useState("new");
  const cashAccounts = useAccountOptions({ cashBankOnly: true });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const blockedReason = !name.trim()
    ? "Isi nama toko dulu."
    : !warehouseId
      ? "Pilih gudang sumber stok."
      : null;

  const save = async () => {
    if (blockedReason) return;
    setSaving(true);
    try {
      const store = await marketplaceService.createStore({
        marketplace,
        name: name.trim(),
        warehouseId,
        saldoAccount,
      });
      swalToast(`Toko ${store.name} terhubung. Upload template pertamanya.`);
      onCreated(store);
    } catch (error) {
      const failure = ecommerceFailure(error, "Toko belum bisa disimpan.");
      setErrors(failure.fieldErrors);
      swalToast(failure.toast, "error", 6000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Hubungkan toko</DialogTitle>
          <DialogDescription>
            {marketplace === "tiktok"
              ? "Satu toko untuk pesanan dari aplikasi TikTok dan Tokopedia sekaligus, karena keduanya dikelola dari satu Seller Center. Toko punya gudang, template, dan pengikatan SKU sendiri. Buffer stok diatur di Pengaturan."
              : "Satu toko Shopee punya gudang, template, dan pengikatan SKU sendiri. Shop ID diambil dari template pertama yang diupload. Buffer stok diatur di Pengaturan."}
          </DialogDescription>
        </DialogHeader>

        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <FilterSelect
            label="Marketplace"
            layout="form"
            active={false}
            value={marketplace}
            options={MARKETPLACE_OPTIONS}
            onChange={(value) => setMarketplace(value as Marketplace)}
          />
          <TextField
            label="Nama toko"
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={`Nama toko di ${profile.short}`}
            error={errors.name}
            maxLength={80}
          />
          <FilterSelect
            label="Gudang sumber stok"
            layout="form"
            active={false}
            required
            searchable
            placeholder={warehouses.loading ? "Memuat gudang…" : "Pilih gudang"}
            value={warehouseId}
            options={warehouses.options}
            onChange={setWarehouseId}
            error={errors.warehouseId}
          />

          <FilterSelect
            label="Dana cair masuk ke"
            layout="form"
            active={false}
            searchable={cashAccounts.length > 6}
            value={saldoAccount}
            options={[
              { value: "new", label: `Akun baru: ${profile.saldoPrefix} – ${name.trim() || "nama toko"}` },
              ...cashAccounts,
            ]}
            onChange={setSaldoAccount}
            hint={`Akun Kas & Bank tempat ${profile.incomeFileName} dicatat. Penarikan ke rekening dicatat sebagai transfer di Kas & Bank. Bisa diganti di Pengaturan › Akun.`}
            error={errors.saldoAccount}
          />

          {blockedReason && (name || warehouseId) ? (
            <p className="text-sm text-muted">{blockedReason}</p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
              Batal
            </Button>
            <Button type="submit" disabled={saving || Boolean(blockedReason)}>
              {saving ? "Menyimpan…" : "Hubungkan toko"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
