"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Alert, Button, Card, TextField } from "@/components";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { swalToast } from "@/lib/swal";
import type { SupplierType } from "@/types/purchasing";

import * as demo from "@/features/inventory/data/demoStore";
import { useInventoryDemo } from "@/features/inventory/hooks/useInventoryDemo";

const TYPES: Array<{ value: SupplierType; label: string; hint: string }> = [
  {
    value: "beli_putus",
    label: "Beli putus",
    hint: "Barang jadi milik toko saat diterima — penerimaan membuat faktur utang.",
  },
  {
    value: "konsinyasi",
    label: "Konsinyasi",
    hint: "Barang dititipkan; masih milik supplier sampai laku. Tidak membuat utang.",
  },
  {
    value: "both",
    label: "Keduanya",
    hint: "Tipe ditentukan per penerimaan.",
  },
];

/**
 * Create or edit a supplier.
 *
 * `paymentTermDays` looks like a minor field and is the one that quietly drives
 * the payables screen: it is what turns an invoice date into a due date, and
 * therefore what decides which rows show up as overdue. A supplier entered with
 * the default 0 will have every invoice due the day it arrives, which reads as
 * a cash-flow emergency that is not real — so it gets a hint rather than being
 * left to guess.
 */
export function SupplierForm({ supplierId }: { supplierId?: string }) {
  const router = useRouter();
  const { suppliers, sync } = useInventoryDemo();

  const existing = supplierId
    ? suppliers.find((supplier) => supplier._id === supplierId)
    : undefined;

  const [name, setName] = useState(existing?.name ?? "");
  const [supplierType, setSupplierType] = useState<SupplierType>(
    existing?.supplierType ?? "beli_putus",
  );
  const [picName, setPicName] = useState(existing?.picName ?? "");
  const [phone, setPhone] = useState(existing?.phone ?? "");
  const [email, setEmail] = useState(existing?.email ?? "");
  const [address, setAddress] = useState(existing?.address ?? "");
  const [npwp, setNpwp] = useState(existing?.npwp ?? "");
  const [paymentTermDays, setPaymentTermDays] = useState(
    String(existing?.paymentTermDays ?? 30),
  );
  const [notes, setNotes] = useState(existing?.notes ?? "");

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function validate(): boolean {
    const next: Record<string, string> = {};

    if (name.trim() === "") next.name = "Nama supplier wajib diisi.";
    else if (
      suppliers.some(
        (supplier) =>
          supplier.name.toLowerCase() === name.trim().toLowerCase() &&
          supplier._id !== existing?._id,
      )
    ) {
      next.name = "Sudah ada supplier dengan nama ini.";
    }

    const term = Number(paymentTermDays);
    if (!Number.isInteger(term) || term < 0 || term > 365) {
      next.paymentTermDays = "Isi 0–365 hari.";
    }

    if (email.trim() !== "" && !email.includes("@")) {
      next.email = "Alamat email tidak valid.";
    }

    setFieldErrors(next);
    return Object.keys(next).length === 0;
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    if (!validate()) return;

    setSaving(true);
    try {
      const saved = demo.saveSupplier({
        id: existing?._id,
        name,
        supplierType,
        picName,
        phone,
        email,
        address,
        npwp,
        paymentTermDays: Number(paymentTermDays),
        notes,
      });

      sync();
      router.push("/dashboard/purchasing/suppliers");
      swalToast(
        existing ? "Perubahan disimpan." : `${saved.name} ditambahkan.`,
      );
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : "Terjadi kesalahan. Coba lagi.",
      );
      setSaving(false);
    }
  }

  const activeType = TYPES.find((type) => type.value === supplierType);

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="flex max-w-3xl flex-col gap-6"
    >
      {formError && <Alert variant="error">{formError}</Alert>}

      <Card title="Identitas">
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <TextField
              label="Nama supplier"
              name="name"
              className="sm:col-span-2"
              value={name}
              onChange={(event) => setName(event.target.value)}
              error={fieldErrors.name}
              placeholder="PT Sumber Pakan Sejahtera"
              required
            />

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="supplierType">Tipe kerja sama</Label>
              <Select
                value={supplierType}
                onValueChange={(value) =>
                  setSupplierType(value as SupplierType)
                }
              >
                <SelectTrigger id="supplierType" aria-label="Tipe kerja sama">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {activeType && (
            <p className="text-xs text-muted">{activeType.hint}</p>
          )}

          <TextField
            label="Alamat"
            name="address"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            placeholder="Jl. Rungkut Industri 21, Surabaya"
          />
        </div>
      </Card>

      <Card title="Kontak & administrasi">
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField
            label="Penanggung jawab"
            name="picName"
            value={picName}
            onChange={(event) => setPicName(event.target.value)}
            placeholder="Pak Hendra"
          />
          <TextField
            label="Telepon"
            name="phone"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="031-8877-221"
          />
          <TextField
            label="Email"
            name="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            error={fieldErrors.email}
            placeholder="sales@supplier.co.id"
          />
          <TextField
            label="NPWP"
            name="npwp"
            value={npwp}
            onChange={(event) => setNpwp(event.target.value)}
            className="font-mono"
            placeholder="01.234.567.8-609.000"
          />
          <TextField
            label="Termin pembayaran"
            name="paymentTermDays"
            inputMode="numeric"
            value={paymentTermDays}
            onChange={(event) => setPaymentTermDays(event.target.value)}
            error={fieldErrors.paymentTermDays}
            hint="Hari sampai jatuh tempo. 0 = bayar saat terima."
          />
          <TextField
            label="Catatan"
            name="notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="opsional"
          />
        </div>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={saving}>
          {saving
            ? "Menyimpan…"
            : existing
              ? "Simpan perubahan"
              : "Simpan supplier"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => router.push("/dashboard/purchasing/suppliers")}
        >
          Batal
        </Button>
      </div>
    </form>
  );
}
