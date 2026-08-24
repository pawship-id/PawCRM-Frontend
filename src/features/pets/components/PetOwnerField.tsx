"use client";

import { useEffect, useState } from "react";

import { FilterSelect } from "@/components";
import { customerService } from "@/services/customer.service";

/**
 * Picks the pet's owner.
 *
 * `FilterSelect layout="form"` rather than `SelectField`, per ui-rules §16: a
 * customer list is exactly the "anything somebody would want to TYPE into" case
 * — a shop with four hundred pelanggan cannot be scrolled. `active={false}` so an
 * answered field does not go navy and announce itself as a filter, and a real
 * placeholder because the default "Semua" would claim a choice nobody made on a
 * required field.
 *
 * THE LIST IS LOADED ONCE AND WHOLE, not searched server-side, and that is a
 * deliberate limit rather than an oversight. `FilterSelect` searches inside its
 * own popover over the options it was handed, so a tenant past `FETCH_LIMIT`
 * customers would have a picker that silently cannot find the rest. Wiring the
 * popover's search box back to `?search=` is the fix; it belongs to whoever
 * builds the POS customer picker in Fase 2, which needs the same thing and will
 * have somewhere to put it. Until then the ceiling is stated here rather than
 * discovered in a shop.
 *
 * DISABLED WHEN EDITING. A pet's owner is set once — reassigning would silently
 * move its bookings, invoices and grooming history under a different name, so
 * the API strips the key from a PATCH. The control says so rather than accepting
 * a change the server would drop.
 */

/**
 * THE API'S OWN CAP, not a number chosen here.
 *
 * `pagination` in the backend's common.validation.js refuses `limit` above 100 —
 * "so a client cannot ask for the whole collection in one request". Asking for
 * more does not return 100 rows; it returns a `400`, which is how this field
 * first shipped with an empty list and an English "Validation failed" under it.
 *
 * So the ceiling on how many customers this picker can search is the API's page
 * size, and raising it means paging or server-side search — not a bigger number.
 */
const FETCH_LIMIT = 100;

export function PetOwnerField({
  value,
  onChange,
  disabled = false,
  locked = false,
  error,
}: {
  value: string;
  onChange: (customerId: string) => void;
  disabled?: boolean;
  /** True when editing: the owner is fixed for the life of the record. */
  locked?: boolean;
  error?: string;
}) {
  const [options, setOptions] = useState<{ value: string; label: string }[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);

  useEffect(() => {
    // Nothing to pick from when the field cannot be changed anyway — and the
    // edit screen would otherwise pull four hundred customers to render one
    // disabled row.
    if (locked) return;

    let active = true;

    customerService
      .list({ limit: FETCH_LIMIT })
      .then((result) => {
        if (!active) return;
        setOptions(
          result.items.map((customer) => ({
            value: customer._id,
            // The phone is what tells two Ibu Sri apart at the counter.
            label: customer.phone
              ? `${customer.name} · ${customer.phone}`
              : customer.name,
          })),
        );
        setTruncated(result.pagination.total > result.items.length);
      })
      .catch(() => {
        if (!active) return;
        /*
          OUR OWN SENTENCE, never the server's. The API answers in English, and
          "Validation failed" under a picker tells a shop owner nothing they can
          act on — it is a message written for whoever is reading the logs. The
          real cause is worth finding in the console, not worth surfacing here.
        */
        setLoadError("Daftar pelanggan tidak bisa dimuat. Coba muat ulang halaman.");
      });

    return () => {
      active = false;
    };
  }, [locked]);

  // FilterSelect carries no `hint` slot — it is a filter control first, and a
  // filter never explains itself. The note is rendered beside it here rather
  // than added to the shared component for one caller.
  const hint = locked
    ? "Pemilik tidak bisa dipindah. Kalau hewannya pindah rumah, daftarkan lagi atas nama pemilik baru dan tandai data ini tidak aktif — riwayat groomingnya tetap utuh di dua-duanya."
    : truncated
      ? `Menampilkan ${FETCH_LIMIT} pelanggan pertama. Kalau yang dicari belum muncul, daftarkan hewannya dari halaman pelanggan itu.`
      : null;

  return (
    <div className="flex flex-col gap-1.5">
      <FilterSelect
        layout="form"
        label="Pemilik"
        ariaLabel="Pilih pemilik hewan"
        value={value}
        options={options}
        onChange={onChange}
        active={false}
        placeholder="Pilih pelanggan"
        searchable
        required
        disabled={disabled || locked}
        error={error ?? loadError ?? undefined}
      />
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}
