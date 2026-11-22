"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

import { Alert, SelectField, Spinner, TextField } from "@/components";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { swalToast } from "@/lib/swal";
import { ApiError } from "@/services/api-error";
import { hotelStayService } from "@/services/hotel.service";
import type { HotelAvailability, HotelStayBooking } from "@/types/api";
import { formatMoney } from "@/utils/decimal";

import {
  addDays,
  longDate,
  nightsOf,
  roomText,
  shortDate,
  times,
} from "../stay";

/** The quick picks for a belonging, as the mockup offers them. */
const BELONGING_SUGGESTIONS = [
  "Mangkok",
  "Selimut",
  "Makanan",
  "Mainan",
  "Tali / harness",
  "Obat",
  "Kandang travel",
];

export type StayAction = "checkin" | "extend" | "checkout";

const nowTime = () => {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
};

const failure = (error: unknown, fallback: string) =>
  error instanceof ApiError ? (error.reason ?? error.fullMessage) : fallback;

/**
 * Check-in, Perpanjang and Check-out — the three acts on a stay that need a
 * few answers first (21 November 2026, PLAN-Hotel-V1.md §4.2). One dialog
 * component, three bodies; each answers with the stay as saved.
 */
export function HotelStayDialog({
  action,
  booking,
  onClose,
  onDone,
}: {
  action: StayAction;
  booking: HotelStayBooking;
  onClose: () => void;
  onDone: (updated: HotelStayBooking) => void;
}) {
  const title =
    action === "checkin"
      ? `Check-in ${booking.petName ?? ""}`
      : action === "extend"
        ? `Perpanjang menginap ${booking.petName ?? ""}`
        : `Check-out ${booking.petName ?? ""}`;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="tabular-nums">
            {booking.bookingNumber} · {roomText(booking.stay)} ·{" "}
            {shortDate(booking.stay.checkInDate)} –{" "}
            {shortDate(booking.stay.checkOutDate)}
          </DialogDescription>
        </DialogHeader>
        {action === "checkin" ? (
          <CheckInBody booking={booking} onClose={onClose} onDone={onDone} />
        ) : action === "extend" ? (
          <ExtendBody booking={booking} onClose={onClose} onDone={onDone} />
        ) : (
          <CheckOutBody booking={booking} onClose={onClose} onDone={onDone} />
        )}
      </DialogContent>
    </Dialog>
  );
}

interface BodyProps {
  booking: HotelStayBooking;
  onClose: () => void;
  onDone: (updated: HotelStayBooking) => void;
}

/** Free units of the stay's room type over [from, to), the stay itself left out. */
function useUnits(booking: HotelStayBooking, from: string, to: string) {
  const [availability, setAvailability] = useState<HotelAvailability | null>(
    null,
  );
  useEffect(() => {
    if (booking.stay.roomMode !== "numbered" || !(to > from)) return;
    let active = true;
    hotelStayService
      .availability({
        roomTypeId: booking.stay.roomTypeId,
        from,
        to,
        excludeIds: [booking._id],
      })
      .then((result) => active && setAvailability(result))
      .catch(() => active && setAvailability(null));
    return () => {
      active = false;
    };
  }, [booking._id, booking.stay.roomMode, booking.stay.roomTypeId, from, to]);
  return availability && availability.mode === "numbered"
    ? availability.units
    : [];
}

export function UnitSelect({
  units,
  value,
  onChange,
  current,
}: {
  units: { _id: string; code: string; underRepair: boolean; free: boolean }[];
  value: string;
  onChange: (next: string) => void;
  current: string | null;
}) {
  if (units.length === 0) return null;
  return (
    <SelectField
      label="Nomor kamar"
      value={value}
      onChange={(next) => next && onChange(next)}
      options={units.map((unit) => ({
        value: unit._id,
        label: `${unit.code}${
          unit.underRepair
            ? " · perbaikan"
            : unit.free || unit._id === current
              ? " · kosong"
              : " · terisi"
        }`,
        disabled: unit.underRepair || (!unit.free && unit._id !== current),
      }))}
      placeholder="Pilih nomor kamar"
    />
  );
}

function CheckInBody({ booking, onClose, onDone }: BodyProps) {
  const [time, setTime] = useState(nowTime());
  const [unitId, setUnitId] = useState(booking.stay.unitId ?? "");
  const [condition, setCondition] = useState("");
  const [belongings, setBelongings] = useState<{ name: string; qty: string }[]>(
    [],
  );
  const [busy, setBusy] = useState(false);
  const units = useUnits(
    booking,
    booking.stay.checkInDate,
    booking.stay.checkOutDate,
  );

  async function submit() {
    setBusy(true);
    try {
      const updated = await hotelStayService.checkIn(booking._id, {
        time,
        unitId: unitId || null,
        conditionIn: condition,
        belongings: belongings
          .filter((row) => row.name.trim())
          .map((row) => ({
            name: row.name.trim(),
            qty: Math.max(1, Number(row.qty) || 1),
          })),
      });
      swalToast(
        `${booking.petName ?? "Hewan"} sudah check-in. Lanjut bayar di kasir.`,
      );
      onDone(updated);
    } catch (error) {
      swalToast(
        failure(error, "Check-in belum tersimpan. Coba lagi."),
        "error",
        6000,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Jam datang"
            name="time"
            type="time"
            value={time}
            onChange={(event) => setTime(event.target.value)}
          />
          <UnitSelect
            units={units}
            value={unitId}
            onChange={setUnitId}
            current={booking.stay.unitId}
          />
        </div>
        <TextField
          label="Kondisi saat datang"
          name="condition"
          value={condition}
          onChange={(event) => setCondition(event.target.value)}
          placeholder="Misal: sehat, ada luka kecil di kaki kiri"
        />
        <BelongingsEditor rows={belongings} onChange={setBelongings} />
        {booking.stay.care?.behaviour && (
          <Alert variant="info">
            Catatan perilaku: {booking.stay.care.behaviour}
          </Alert>
        )}
        <p className="rounded-lg bg-tint-neutral px-4 py-3 text-sm text-muted">
          Tagihan {formatMoney(booking.netAmount)}. Setelah check-in, lanjutkan
          di kasir: bayar lunas, DP, atau simpan sebagai tagihan terbuka sampai
          check-out.
        </p>
      </div>
      <DialogFooter>
        <Button
          type="button"
          variant="secondary"
          onClick={onClose}
          disabled={busy}
        >
          Batal
        </Button>
        <Button type="button" onClick={() => void submit()} disabled={busy}>
          {busy && <Spinner size={16} />}
          Check-in sekarang
        </Button>
      </DialogFooter>
    </>
  );
}

/** Belongings handed over — one row each, with the mockup's quick picks below. */
export function BelongingsEditor({
  rows,
  onChange,
}: {
  rows: { name: string; qty: string }[];
  onChange: (next: { name: string; qty: string }[]) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label>Barang bawaan</Label>
      {rows.length === 0 && (
        <p className="text-sm text-muted">Belum ada barang bawaan.</p>
      )}
      {rows.map((row, index) => (
        <div key={index} className="flex items-center gap-2">
          <Input
            aria-label="Nama barang"
            value={row.name}
            onChange={(event) =>
              onChange(
                rows.map((current, at) =>
                  at === index
                    ? { ...current, name: event.target.value }
                    : current,
                ),
              )
            }
            placeholder="Nama barang"
            className="h-11"
          />
          <Input
            aria-label={`Jumlah ${row.name}`}
            inputMode="numeric"
            value={row.qty}
            onChange={(event) =>
              onChange(
                rows.map((current, at) =>
                  at === index
                    ? { ...current, qty: event.target.value }
                    : current,
                ),
              )
            }
            className="h-11 w-20 text-right tabular-nums"
          />
          <Button
            type="button"
            variant="ghost"
            className="size-11 p-0"
            aria-label={`Hapus ${row.name || "barang"}`}
            onClick={() => onChange(rows.filter((_, at) => at !== index))}
          >
            <X className="size-4" />
          </Button>
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        {BELONGING_SUGGESTIONS.map((name) => (
          <Button
            key={name}
            type="button"
            size="sm"
            variant="secondary"
            disabled={rows.some((row) => row.name === name)}
            onClick={() => onChange([...rows, { name, qty: "1" }])}
          >
            + {name}
          </Button>
        ))}
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => onChange([...rows, { name: "", qty: "1" }])}
        >
          + Barang lain
        </Button>
      </div>
    </div>
  );
}

function ExtendBody({ booking, onClose, onDone }: BodyProps) {
  const stay = booking.stay;
  const [date, setDate] = useState(addDays(stay.checkOutDate, 1));
  const [time, setTime] = useState(stay.pickupTime ?? "12:00");
  const from =
    stay.checkInDate > booking.stayFacts.today
      ? stay.checkInDate
      : booking.stayFacts.today;
  const units = useUnits(booking, from, date);
  const [unitId, setUnitId] = useState(stay.unitId ?? "");
  const [busy, setBusy] = useState(false);
  const extra = Math.max(
    0,
    nightsOf({ ...stay, checkOutDate: date, leftDate: null }) -
      booking.stayFacts.nights,
  );
  const own = units.find((unit) => unit._id === stay.unitId);
  const moved = stay.roomMode === "numbered" && own && !own.free;

  useEffect(() => {
    if (moved && unitId === stay.unitId) {
      const free = units.find((unit) => unit.free);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- offer the first free unit when its own is taken
      if (free) setUnitId(free._id);
    }
  }, [moved, unitId, stay.unitId, units]);

  async function submit() {
    setBusy(true);
    try {
      const updated = await hotelStayService.extend(booking._id, {
        checkOutDate: date,
        pickupTime: time,
        unitId: stay.roomMode === "numbered" ? unitId || null : null,
      });
      swalToast(
        `Diperpanjang sampai ${shortDate(date)}. Tambahannya dibayar di kasir.`,
      );
      onDone(updated);
    } catch (error) {
      swalToast(
        failure(error, "Perpanjangan belum tersimpan. Coba lagi."),
        "error",
        6000,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Tanggal keluar baru"
            name="date"
            type="date"
            value={date}
            min={addDays(stay.checkOutDate, 1)}
            onChange={(event) => setDate(event.target.value)}
          />
          <TextField
            label="Jam jemput"
            name="time"
            type="time"
            value={time}
            onChange={(event) => setTime(event.target.value)}
          />
        </div>
        {moved && (
          <Alert variant="info">
            Kamar {stay.unitCode} sudah dipesan hewan lain di tanggal tambahan.
            Pindahkan {booking.petName} ke kamar lain:
          </Alert>
        )}
        {moved && (
          <UnitSelect
            units={units}
            value={unitId}
            onChange={setUnitId}
            current={null}
          />
        )}
        {extra > 0 && (
          <div className="rounded-lg border border-border px-4 py-3 text-sm">
            <div className="flex justify-between gap-3">
              <span>
                Tambahan {extra} malam × {formatMoney(stay.nightPrice)}
              </span>
              <b className="tabular-nums">
                {formatMoney(times(stay.nightPrice, extra))}
              </b>
            </div>
            <p className="mt-1 text-xs text-muted">
              Add-on per malam ikut bertambah sampai tanggal keluar baru.
            </p>
          </div>
        )}
      </div>
      <DialogFooter>
        <Button
          type="button"
          variant="secondary"
          onClick={onClose}
          disabled={busy}
        >
          Batal
        </Button>
        <Button
          type="button"
          onClick={() => void submit()}
          disabled={busy || !(date > stay.checkOutDate)}
        >
          {busy && <Spinner size={16} />}
          Simpan perpanjangan
        </Button>
      </DialogFooter>
    </>
  );
}

function CheckOutBody({ booking, onClose, onDone }: BodyProps) {
  const stay = booking.stay;
  const today = booking.stayFacts.today;
  const [date, setDate] = useState(
    today > stay.checkInDate ? today : addDays(stay.checkInDate, 1),
  );
  const [time, setTime] = useState(nowTime());
  const [returned, setReturned] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [condition, setCondition] = useState("");
  const [busy, setBusy] = useState(false);
  const belongings = booking.belongings ?? [];
  const missing = belongings.filter((row) => !returned.includes(row._id));
  const extra = Math.max(
    0,
    nightsOf({
      ...stay,
      checkOutDate: date > stay.checkOutDate ? date : stay.checkOutDate,
      leftDate: null,
    }) - booking.stayFacts.nights,
  );
  const cartHeld = booking.stayFacts.inCart && extra > 0;
  const blocked = (missing.length > 0 && !note.trim()) || cartHeld;
  const unbilled = Number(booking.stayFacts.unbilledAmount) > 0;

  async function submit() {
    setBusy(true);
    try {
      const updated = await hotelStayService.checkOut(booking._id, {
        date,
        time,
        returnedBelongingIds: returned,
        belongingsNote: missing.length > 0 ? note : null,
        conditionOut: condition,
      });
      const left = updated.stayFacts.unbilledAmount;
      swalToast(
        `${booking.petName ?? "Hewan"} sudah check-out.${Number(left) > 0 ? ` Sisa ${formatMoney(left)} belum ditagih — bayar di kasir.` : ""}`,
      );
      onDone(updated);
    } catch (error) {
      swalToast(
        failure(error, "Check-out belum tersimpan. Coba lagi."),
        "error",
        6000,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Tanggal pulang"
            name="date"
            type="date"
            value={date}
            min={addDays(stay.checkInDate, 1)}
            onChange={(event) => setDate(event.target.value)}
          />
          <TextField
            label="Jam dijemput"
            name="time"
            type="time"
            value={time}
            onChange={(event) => setTime(event.target.value)}
          />
        </div>
        {extra > 0 && (
          <Alert variant="info">
            Menginap {extra} malam lebih lama dari rencana —{" "}
            {formatMoney(times(stay.nightPrice, extra))} ditambahkan ke tagihan.
          </Alert>
        )}
        {cartHeld && (
          <Alert variant="warning">
            Tagihan hewan ini sedang terbuka di keranjang kasir. Bayar atau
            keluarkan dulu dari keranjang, baru tambah malamnya.
          </Alert>
        )}
        {booking.stayFacts.inCart && !cartHeld && (
          <Alert variant="info">
            Tagihan masih terbuka di keranjang kasir — jangan lupa dibayar saat
            penjemputan.
          </Alert>
        )}
        {!booking.stayFacts.inCart && unbilled && (
          <Alert variant="info">
            Masih ada {formatMoney(booking.stayFacts.unbilledAmount)} yang belum
            ditagih. Setelah check-out, tekan <b>Bayar di kasir</b> di halaman
            booking.
          </Alert>
        )}
        {date < stay.checkOutDate && (
          <Alert variant="info">
            Pulang lebih awal dari rencana ({longDate(stay.checkOutDate)}).
            Tagihan tidak berubah otomatis — ubah lewat Ubah booking kalau
            perlu.
          </Alert>
        )}
        <div className="flex flex-col gap-2">
          <Label>Barang bawaan dikembalikan</Label>
          {belongings.length === 0 ? (
            <p className="text-sm text-muted">Tidak ada barang bawaan.</p>
          ) : (
            <ul className="divide-y divide-border rounded-xl border border-border">
              {belongings.map((row) => (
                <li key={row._id}>
                  <label className="flex min-h-11 cursor-pointer items-center gap-3 px-4 py-2 text-sm">
                    <Checkbox
                      checked={returned.includes(row._id)}
                      onCheckedChange={(next) =>
                        setReturned((current) =>
                          next === true
                            ? [...current, row._id]
                            : current.filter((id) => id !== row._id),
                        )
                      }
                    />
                    <span>
                      {row.name}{" "}
                      <span className="text-muted tabular-nums">
                        ×{row.qty ?? 1}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
        {missing.length > 0 && belongings.length > 0 && (
          <TextField
            label="Catatan barang yang tidak kembali"
            name="note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Misal: selimut ikut dicuci, diantar besok"
          />
        )}
        <TextField
          label="Kondisi saat pulang"
          name="condition"
          value={condition}
          onChange={(event) => setCondition(event.target.value)}
          placeholder="Misal: sehat, sudah mandi"
        />
      </div>
      <DialogFooter>
        {blocked && !cartHeld && (
          <p className="mr-auto self-center text-xs text-muted">
            Centang barangnya, atau tulis catatannya.
          </p>
        )}
        <Button
          type="button"
          variant="secondary"
          onClick={onClose}
          disabled={busy}
        >
          Batal
        </Button>
        <Button
          type="button"
          onClick={() => void submit()}
          disabled={busy || blocked}
        >
          {busy && <Spinner size={16} />}
          Check-out
        </Button>
      </DialogFooter>
    </>
  );
}
