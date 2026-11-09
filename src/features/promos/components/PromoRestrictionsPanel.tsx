"use client";

import { useEffect, useState } from "react";

import {
  Card,
  CheckRow,
  CheckRowGroup,
  FilterMultiSelect,
  TextField,
  type FilterOption,
} from "@/components";
import { Checkbox } from "@/components/ui/checkbox";
import { useBranchOptions } from "@/features/inventory/hooks/useBranchOptions";
import { FieldBlock } from "@/features/memberships/components/FormBits";
import { customerTypeService } from "@/services/customerType.service";
import type { PromoChannel } from "@/types/promo";

import { PROMO_CHANNELS, PROMO_CHANNEL_LABEL } from "../labels";
import type { PromoDraft } from "../promoDraft";

/** "Semua cabang" / "Pusat, Barat" / "3 cabang". */
const namesOrCount =
  (all: string, unit: string) =>
  (values: string[], options: FilterOption<string>[]) =>
    values.length === 0
      ? all
      : values.length <= 2
        ? values.map((value) => options.find((option) => option.value === value)?.label ?? "—").join(", ")
        : `${values.length} ${unit}`;

/** Kategori pelanggan — every type, read once (a tenant has a handful). */
function useCustomerTypeOptions() {
  const [options, setOptions] = useState<FilterOption<string>[]>([]);
  useEffect(() => {
    let live = true;
    customerTypeService
      .list({ limit: 100 })
      .then((result) => {
        if (live) setOptions(result.items.map((type) => ({ value: type._id, label: type.name })));
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  return options;
}

/**
 * Batasan — where, for whom, through which channel, and how often (BO mockup
 * `batasanPanel`, with Faktur added per BO 8 November 2026). Shared by every
 * promo type when they arrive.
 *
 * KANAL defaults to Kasir alone and must keep at least one. Website is stored
 * now and has no effect until the shop has a website.
 */
export function PromoRestrictionsPanel({
  draft,
  onChange,
  errors,
  readOnly,
}: {
  draft: PromoDraft;
  onChange: (patch: Partial<PromoDraft>) => void;
  errors: Record<string, string>;
  readOnly: boolean;
}) {
  const { branches } = useBranchOptions();
  const customerTypes = useCustomerTypeOptions();

  const toggleChannel = (channel: PromoChannel, on: boolean) =>
    onChange({
      channels: on
        ? PROMO_CHANNELS.filter((entry) => entry === channel || draft.channels.includes(entry))
        : draft.channels.filter((entry) => entry !== channel),
    });

  return (
    <Card title="Batasan">
      <div className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <FilterMultiSelect
            layout="form"
            label="Berlaku di cabang"
            values={draft.branchIds}
            options={branches.map((branch) => ({ value: branch._id, label: branch.name }))}
            onApply={(branchIds) => onChange({ branchIds })}
            onReset={() => onChange({ branchIds: [] })}
            formatValue={namesOrCount("Semua cabang", "cabang")}
            disabled={readOnly}
            error={errors["restrictions.branchIds"]}
          />
          <FilterMultiSelect
            layout="form"
            label="Kategori pelanggan"
            values={draft.customerTypeIds}
            options={customerTypes}
            onApply={(customerTypeIds) => onChange({ customerTypeIds })}
            onReset={() => onChange({ customerTypeIds: [] })}
            formatValue={namesOrCount("Semua kategori", "kategori")}
            disabled={readOnly}
            hint="Dari Pengaturan › Tipe pelanggan."
            error={errors["restrictions.customerTypeIds"]}
          />
        </div>

        <FieldBlock
          label="Kanal"
          required
          hint="Website belum aktif — dicentang sekarang, berlaku setelah website toko tersedia."
          error={errors["restrictions.channels"] ?? (draft.channels.length ? undefined : "Pilih minimal satu kanal")}
        >
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {PROMO_CHANNELS.map((channel) => {
              const checked = draft.channels.includes(channel);
              const id = `promo-channel-${channel}`;
              return (
                <label key={channel} htmlFor={id} className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
                  <Checkbox
                    id={id}
                    checked={checked}
                    disabled={readOnly}
                    onCheckedChange={(next) => toggleChannel(channel, next === true)}
                  />
                  {PROMO_CHANNEL_LABEL[channel]}
                </label>
              );
            })}
          </div>
        </FieldBlock>

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Kuota promo (transaksi)"
            inputMode="numeric"
            value={draft.quotaTotal}
            placeholder="0"
            disabled={readOnly}
            onChange={(event) => onChange({ quotaTotal: event.target.value.replace(/[^\d]/g, "") })}
            hint="Kosongkan atau isi 0 kalau tanpa batas."
            error={errors["restrictions.quotaTotal"]}
          />
          <TextField
            label="Batas per pelanggan"
            inputMode="numeric"
            value={draft.perCustomer}
            placeholder="0"
            disabled={readOnly}
            onChange={(event) => onChange({ perCustomer: event.target.value.replace(/[^\d]/g, "") })}
            hint="0 = tanpa batas. Berlaku kalau pelanggan dipilih di transaksi."
            error={errors["restrictions.perCustomer"]}
          />
        </div>

        <CheckRowGroup>
          <CheckRow
            label="Bisa digabung dengan promo lain"
            description="Kalau dicentang, promo ini ditambahkan di atas promo lain pada item yang sama, bukan bersaing."
            checked={draft.stackable}
            disabled={readOnly}
            onCheckedChange={(stackable) => onChange({ stackable })}
          />
        </CheckRowGroup>
      </div>
    </Card>
  );
}
