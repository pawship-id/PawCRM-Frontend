"use client";

import { useState } from "react";

import { Alert, TextField } from "@/components";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ApiError } from "@/services/api-error";
import { customerService } from "@/services/customer.service";
import type { ApiWarning, Customer } from "@/types/api";

const NAME_MAX_LENGTH = 120;
const PHONE_MAX_LENGTH = 32;

/**
 * Registers a customer without leaving the till.
 *
 * BUILT FOR THE POS (FR-2): a walk-in taking credit has to be tied to a real
 * identity before the sale can be finished, and sending the cashier to the
 * customer module would abandon a half-built cart.
 *
 * TWO FIELDS, NOT FIVE. Name and phone are what a person at a counter can answer
 * while holding a dog's lead; email, address and VIP tier are filled in later
 * from the full form. The PRD is explicit that quick-add must not block a
 * transaction waiting for a complete profile.
 *
 * PHONE IS REQUIRED HERE AND OPTIONAL IN THE API, and the asymmetry is
 * deliberate rather than a gap. The API has to keep accepting a name-only
 * customer — a clinic recording a walk-in before it has any contact details is a
 * real case the customer docs already describe. But the reason to quick-add
 * FROM THE TILL is almost always a piutang, and a debtor with no phone number is
 * a debt nobody can chase. The rule belongs to this dialog, not to the contract.
 *
 * A DUPLICATE NUMBER IS A WARNING, NOT A REFUSAL. Two people in one household
 * share a handset. The customer is saved, the dialog stays open long enough to
 * say who else holds the number, and the caller gets the new customer either way
 * — see `onCreated`.
 */
export function CustomerQuickAddDialog({
  open,
  onOpenChange,
  onCreated,
  /** Prefills the phone box — the POS may already have it from a search. */
  initialPhone = "",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Handed the created customer AND anything the server warned about. */
  onCreated: (customer: Customer, warnings: ApiWarning[]) => void;
  initialPhone?: string;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState(initialPhone);
  const [nameError, setNameError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function reset() {
    setName("");
    setPhone(initialPhone);
    setNameError(null);
    setPhoneError(null);
    setFormError(null);
  }

  function handleOpenChange(next: boolean) {
    // Never close mid-write: the caller would be told nothing about whether the
    // customer was created.
    if (saving) return;
    if (!next) reset();
    onOpenChange(next);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;

    const trimmedName = name.trim();
    const trimmedPhone = phone.trim();
    let invalid = false;

    if (trimmedName === "") {
      setNameError("Nama pelanggan wajib diisi.");
      invalid = true;
    } else if (trimmedName.length > NAME_MAX_LENGTH) {
      setNameError(`Maksimal ${NAME_MAX_LENGTH} karakter.`);
      invalid = true;
    }
    if (trimmedPhone === "") {
      setPhoneError("No. HP wajib diisi untuk pelanggan yang didaftar di kasir.");
      invalid = true;
    } else if (trimmedPhone.length > PHONE_MAX_LENGTH) {
      setPhoneError(`Maksimal ${PHONE_MAX_LENGTH} karakter.`);
      invalid = true;
    }

    if (invalid) return;

    setSaving(true);
    setFormError(null);

    try {
      /*
        The envelope, not the payload. The duplicate-phone WARNING it used to
        carry is gone — a repeated number is now refused outright — but the shape
        stays, because other warnings will land beside a created customer.
      */
      const result = await customerService.createWithWarnings({
        name: trimmedName,
        phone: trimmedPhone,
      });

      onCreated(result.data, result.warnings ?? []);
      reset();
      onOpenChange(false);
    } catch (error) {
      /*
        A TAKEN NUMBER IS A FIELD ERROR, NOT A FORM ERROR, and the dialog STAYS
        OPEN.

        The number is the one thing to change, so the message belongs beside the
        box holding it. Closing would throw away a name the cashier has already
        typed, to make them retype it with one digit different — and the server
        names the holder ("sudah terdaftar atas nama Ibu Rina"), which is what
        tells them whether they are about to register somebody twice.
      */
      if (error instanceof ApiError && error.status === 409) {
        setPhoneError(error.reason ?? error.message);
      } else {
        setFormError(
          error instanceof ApiError
            ? (error.reason ?? error.message)
            : "Terjadi kesalahan. Coba lagi.",
        );
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Pelanggan baru</DialogTitle>
            <DialogDescription>
              Cukup nama dan nomornya dulu. Alamat dan detail lain bisa
              dilengkapi nanti dari menu Pelanggan.
            </DialogDescription>
          </DialogHeader>

          {formError && <Alert variant="error">{formError}</Alert>}

          <TextField
            label="Nama pelanggan"
            name="quick-customer-name"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setNameError(null);
            }}
            error={nameError ?? undefined}
            placeholder="mis. Ibu Rina Wijaya"
            maxLength={NAME_MAX_LENGTH}
            autoFocus
            disabled={saving}
            required
          />

          <TextField
            label="No. HP"
            name="quick-customer-phone"
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(event) => {
              setPhone(event.target.value);
              setPhoneError(null);
            }}
            error={phoneError ?? undefined}
            placeholder="mis. 0812-3456-7890"
            maxLength={PHONE_MAX_LENGTH}
            hint="Dipakai untuk mengirim struk dan menagih piutang."
            disabled={saving}
            required
          />

          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => handleOpenChange(false)}
              disabled={saving}
            >
              Batal
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Menyimpan…" : "Simpan pelanggan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
