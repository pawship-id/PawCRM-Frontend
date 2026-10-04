"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  Button,
  Card,
  CheckRow,
  FormActionBar,
  TextField,
  TextareaField,
} from "@/components";
import { membershipService } from "@/services/membership.service";
import { swalToast } from "@/lib/swal";
import type {
  BenefitInput,
  CreateMembershipPlanInput,
  MembershipPlan,
} from "@/types/membership";

import { membershipFailure } from "../errors";
import { DURATION_PRESETS, MEMBERSHIP_HREF, planHref } from "../labels";
import { BenefitEditor } from "./BenefitEditor";

/**
 * Add or edit a membership package — a **Form Entitas** (ui-rules §16): one
 * record standing alone, one card, fields grouped under section headers.
 *
 * Field order follows the module-wide entity order: Nama first and full-width,
 * then the identifier (Kode), then classification (harga, durasi), then the
 * check-row, then Keterangan last. Benefits are a section of their own below,
 * because they are a list rather than a field.
 *
 * ONE FORM FOR BOTH ACTIONS. `plan` present means edit. A second component for
 * editing would be a second place for the benefit rules to drift, and the two
 * payloads are the same shape — the API's PATCH takes exactly what its POST
 * does.
 */

export function MembershipPlanForm({ plan }: { plan?: MembershipPlan }) {
  const router = useRouter();
  const editing = Boolean(plan);

  const [code, setCode] = useState(plan?.code ?? "");
  const [name, setName] = useState(plan?.name ?? "");
  const [description, setDescription] = useState(plan?.description ?? "");
  const [price, setPrice] = useState(plan?.price ?? "");
  const [durationDays, setDurationDays] = useState(
    String(plan?.durationDays ?? 365),
  );
  const [renewalOfferDays, setRenewalOfferDays] = useState(
    String(plan?.renewalOfferDays ?? 30),
  );
  const [isActive, setIsActive] = useState(plan?.isActive ?? true);

  /*
    THE BENEFITS COME BACK WITH THEIR KEYS AND ARE SENT BACK WITH THEM. That is
    the whole mechanism that keeps a benefit's redemption history attached
    across an edit: the server matches on the key it issued. Dropping the key
    here would turn every save into "delete all benefits, add new ones", and
    every customer's remaining quota would silently reset.
  */
  const [benefits, setBenefits] = useState<BenefitInput[]>(
    plan?.benefits.map((benefit) => ({
      key: benefit.id,
      label: benefit.label,
      kind: benefit.kind,
      scope: benefit.scope,
      value: benefit.value,
      quota: benefit.quota,
      maxPerTransaction: benefit.maxPerTransaction,
    })) ?? [],
  );

  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setFieldErrors({});

    const payload: CreateMembershipPlanInput = {
      code: code.trim().toUpperCase(),
      name: name.trim(),
      description: description.trim() || null,
      price: price.trim(),
      durationDays: Number(durationDays) || 0,
      renewalOfferDays: Number(renewalOfferDays) || 0,
      isActive,
      benefits: benefits.map((benefit) => ({
        ...benefit,
        // An empty string from a number input is not zero and is not null —
        // it is "nothing typed", which the API reads as unlimited.
        value:
          benefit.value === "" || benefit.value === undefined
            ? null
            : benefit.value,
      })),
    };

    try {
      const saved = editing
        ? await membershipService.updatePlan(plan!.id, payload)
        : await membershipService.createPlan(payload);

      swalToast(
        editing ? "Paket membership tersimpan." : "Paket membership dibuat.",
        "success",
      );
      router.push(planHref(saved.id));
      router.refresh();
    } catch (err) {
      const failure = membershipFailure(
        err,
        "Gagal menyimpan paket membership. Coba lagi.",
      );
      /* Lebih lama dari toast "tersimpan": penolakan harus sempat dibaca. */
      swalToast(failure.toast, "error", 6000);
      setFieldErrors(failure.fieldErrors);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      <FormActionBar
        title={editing ? "Ubah paket membership" : "Paket membership baru"}
        submitLabel="Simpan"
        submitting={submitting}
        cancelHref={editing ? planHref(plan!.id) : MEMBERSHIP_HREF}
        cancelLabel="Kembali"
      />

      <Card
        title="Paket"
        description="Apa yang dijual, berapa harganya, dan berapa lama berlaku."
      >
        <div className="grid gap-4">
          <TextField
            label="Nama paket"
            required
            value={name}
            placeholder="Paket Grooming Setahun"
            onChange={(event) => setName(event.target.value)}
            error={fieldErrors.name}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Kode"
              required
              value={code}
              placeholder="GROOM-12"
              onChange={(event) => setCode(event.target.value)}
              error={fieldErrors.code}
              hint="Dicetak di kartu. Unik per tenant."
            />

            <TextField
              label="Harga"
              required
              inputMode="decimal"
              value={price}
              placeholder="1200000"
              onChange={(event) => setPrice(event.target.value)}
              error={fieldErrors.price}
              hint="Harga katalog, tanpa titik."
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <TextField
                label="Masa berlaku (hari)"
                required
                type="number"
                min={1}
                value={durationDays}
                onChange={(event) => setDurationDays(event.target.value)}
                error={fieldErrors.durationDays}
                hint="Dihitung dari tanggal aktif kartu, bukan tanggal beli."
              />
              {/*
                THE SHORTCUTS EXIST BECAUSE THE FIELD IS DAYS AND THE OWNER
                THINKS IN MONTHS. Days is what is stored — "3 bulan dari 31
                Januari" is a date somebody would have to decide — so the form
                lets them think in months and stores the number that means one
                thing.
              */}
              <div className="mt-2 flex flex-wrap gap-2">
                {DURATION_PRESETS.map((preset) => (
                  <Button
                    key={preset.days}
                    type="button"
                    variant="ghost"
                    className="h-9 px-3 text-sm"
                    onClick={() => setDurationDays(String(preset.days))}
                  >
                    {preset.label}
                  </Button>
                ))}
              </div>
            </div>

            <TextField
              label="Tawarkan perpanjangan (hari sebelum habis)"
              type="number"
              min={0}
              value={renewalOfferDays}
              onChange={(event) => setRenewalOfferDays(event.target.value)}
              error={fieldErrors.renewalOfferDays}
              hint="Kartu muncul di tab Perpanjangan mulai sekian hari sebelum masa berlakunya habis."
            />
          </div>

          <CheckRow
            label="Masih dijual"
            description="Matikan untuk berhenti menjual paket ini. Kartu yang sudah terbit tetap berlaku sampai masa berlakunya habis."
            checked={isActive}
            onCheckedChange={setIsActive}
          />

          <TextareaField
            label="Keterangan"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            error={fieldErrors.description}
            rows={3}
          />
        </div>
      </Card>

      <BenefitEditor
        benefits={benefits}
        onChange={setBenefits}
        errors={fieldErrors}
      />
    </form>
  );
}
