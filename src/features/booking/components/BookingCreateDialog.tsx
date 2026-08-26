"use client";

import { useEffect, useState } from "react";
import { Plus, UserRound } from "lucide-react";

import {
  Alert,
  SelectField,
  Spinner,
  TextField,
  TextareaField,
} from "@/components";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/features/auth";
import { CustomerSearchDialog } from "@/features/customers";
import { PetQuickAddDialog } from "@/features/pets";
import { ApiError } from "@/services/api-error";
import { bookingService } from "@/services/booking.service";
import { petService } from "@/services/pet.service";
import { serviceService } from "@/services/service.service";
import { userService } from "@/services/user.service";
import { formatMoney, sumDecimals } from "@/utils/decimal";
import type {
  Booking,
  BookingStatus,
  Customer,
  Pet,
  Service,
} from "@/types/api";

/** The API's page cap. Asking for more is a 400, not a bigger page. */
const FETCH_LIMIT = 100;

/** Mirrors MAX_ITEMS in booking.model.js — the server refuses the twenty-first. */
const MAX_ITEMS = 20;

/** Mirrors NOTES_MAX_LENGTH in booking.model.js. */
const NOTES_MAX_LENGTH = 500;

/**
 * The groomer select's "nobody yet" row.
 *
 * A REAL VALUE, not `""`: Radix refuses an empty `SelectItem`, and an empty root
 * value is how "nothing chosen" is spelled — which is not what this means. It is
 * a deliberate answer (FR-3's "Belum ditentukan") and is sent to the API as
 * `null`.
 */
const UNASSIGNED = "belum-ditentukan";

/**
 * The API field names this form has a box for.
 *
 * Anything else the server refuses on — `branchId`, which is not on this form at
 * all — goes to the banner instead, because a field error bound to nothing is an
 * error nobody ever sees.
 */
const PLACEABLE_FIELDS = ["customerId", "petId", "items", "scheduledAt", "notes"];

/**
 * The two states a booking may be CREATED in.
 *
 * `in_progress`, `completed` and `cancelled` are absent because they are things
 * that HAPPEN to a booking rather than ways one starts, and each has rules the
 * status route enforces — see BOOKING_TRANSITIONS. A form that offered them
 * would be a second door into the state machine with no guard on it.
 */
const STATUS_OPTIONS: { value: BookingStatus; label: string }[] = [
  { value: "confirmed", label: "Dikonfirmasi" },
  { value: "draft", label: "Draft" },
];

/**
 * Today, in the shop's own clock rather than UTC.
 *
 * `toISOString().slice(0, 10)` is what the rest of this codebase writes, and it
 * is wrong here specifically: west of UTC+7 the UTC date is still yesterday
 * until seven in the morning, so a booking taken at opening time would default
 * to the wrong day. Everywhere else the field is a bookkeeping date somebody
 * reads and corrects; here it is the appointment itself.
 */
function todayValue(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

/**
 * The next half hour, as an `<input type="time">` holds it.
 *
 * A DEFAULT RATHER THAN A BLANK, because most bookings taken over the counter
 * are for later the same day and an empty required field is one more thing to
 * fill in while somebody waits. It is a suggestion — the field is editable and
 * nothing rounds it afterwards.
 */
function nextHalfHourValue(): string {
  const at = new Date();
  at.setSeconds(0, 0);
  at.setMinutes(at.getMinutes() <= 30 ? 30 : 60);
  return `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
}

/** What the two fields add up to, as the instant the API stores. */
function toScheduledAt(date: string, time: string): string | null {
  // No `Z`, so this is read as WALL-CLOCK TIME in the browser's zone — which is
  // the shop's. "Ten o'clock" means ten o'clock where the dog is being washed.
  const at = new Date(`${date}T${time}`);
  return Number.isNaN(at.getTime()) ? null : at.toISOString();
}

/**
 * Makes a booking from the Booking screen.
 *
 * WHY IT IS NOT THE TILL'S TAB. `AddServiceTab` creates a booking too, but for
 * somebody already standing at the counter: it has a customer handed to it, it
 * schedules for `now`, and it opens `confirmed` because there is nothing left to
 * confirm. A booking taken over the phone for Thursday needs the three things
 * that tab has no reason to ask — WHO, WHEN, and whether it is settled — so it
 * asks them here rather than growing a mode into the cashier's flow.
 *
 * A DIALOG, NOT A PAGE. ui-rules §9 allows a raw dialog when the body needs a
 * form, and this one is six fields over a short list. A route of its own would
 * take the day sheet off the screen — which is what somebody consults while
 * agreeing a time on the phone.
 *
 * ONE BOOKING IS ONE PET, as the model requires: a customer with two dogs in on
 * Thursday gets two bookings, made one after the other. `onCreated` fires per
 * booking so the list behind is right either way.
 */
export function BookingCreateDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Handed the created booking — the caller refetches its list from it. */
  onCreated: (booking: Booking) => void;
}) {
  const { session } = useAuth();

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [pets, setPets] = useState<Pet[]>([]);
  const [petId, setPetId] = useState("");
  const [services, setServices] = useState<Service[]>([]);
  /** serviceId → groomer, in the order they were ticked. */
  const [ticked, setTicked] = useState<Map<string, string>>(new Map());
  const [groomers, setGroomers] = useState<{ value: string; label: string }[]>(
    [],
  );

  const [date, setDate] = useState(todayValue);
  const [time, setTime] = useState(nextHalfHourValue);
  const [status, setStatus] = useState<BookingStatus>("confirmed");
  const [notes, setNotes] = useState("");

  const [picking, setPicking] = useState(false);
  const [addingPet, setAddingPet] = useState(false);
  const [petsNonce, setPetsNonce] = useState(0);

  const [loadingServices, setLoadingServices] = useState(true);
  const [loadingPets, setLoadingPets] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  /* The catalogue, once the dialog is open. Only what is still offered — a
     retired service is not something to promise on Thursday. */
  useEffect(() => {
    if (!open) return;

    let active = true;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadingServices(true);

    serviceService
      .list({ isActive: true, limit: FETCH_LIMIT })
      .then((result) => {
        if (active) setServices(result.items);
      })
      .catch(() => {
        if (active) {
          setLoadError("Daftar layanan tidak bisa dimuat. Coba lagi.");
        }
      })
      .finally(() => {
        if (active) setLoadingServices(false);
      });

    return () => {
      active = false;
    };
  }, [open]);

  /*
    The staff who might do the work — BEST EFFORT, and silent when it fails.

    Reading /api/users takes the `users read` permission, which a receptionist
    who books all day has no other reason to hold. A red banner over a working
    form would be the wrong answer to that: assignment is optional, the server
    names an unassigned slot "Belum ditentukan", and a booking with nobody on it
    yet is the ordinary case anyway. So the selects simply do not appear.
  */
  useEffect(() => {
    if (!open) return;

    let active = true;

    userService
      .list({ status: "active", limit: FETCH_LIMIT })
      .then((result) => {
        if (!active) return;
        setGroomers(
          result.items.map((user) => ({
            value: user._id,
            label: user.fullName,
          })),
        );
      })
      .catch(() => {
        if (active) setGroomers([]);
      });

    return () => {
      active = false;
    };
  }, [open]);

  /* This customer's animals. Re-asked after a quick-add rather than spliced —
     the list is server-ordered, and a local insert would be a second ordering
     rule to keep in step. */
  useEffect(() => {
    if (!open || !customer) {
      return;
    }

    let active = true;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadingPets(true);

    petService
      .list({ customerId: customer._id, isActive: true, limit: FETCH_LIMIT })
      .then((result) => {
        if (!active) return;
        setPets(result.items);
        // One pet is the overwhelming case; pre-selecting it removes a click.
        if (result.items.length === 1) setPetId(result.items[0]._id);
      })
      .catch(() => {
        if (!active) return;
        setPets([]);
        setLoadError("Daftar hewan tidak bisa dimuat. Coba lagi.");
      })
      .finally(() => {
        if (active) setLoadingPets(false);
      });

    return () => {
      active = false;
    };
  }, [open, customer, petsNonce]);

  function reset() {
    setCustomer(null);
    setPets([]);
    setPetId("");
    setTicked(new Map());
    setDate(todayValue());
    setTime(nextHalfHourValue());
    setStatus("confirmed");
    setNotes("");
    setLoadError(null);
    setFormError(null);
    setFieldErrors({});
  }

  function handleOpenChange(next: boolean) {
    // Never close mid-write: nobody would be told whether the booking was made.
    if (saving) return;
    if (!next) reset();
    onOpenChange(next);
  }

  /** A different owner invalidates the animal AND its services' prices. */
  function chooseCustomer(next: Customer) {
    setCustomer(next);
    setPets([]);
    setPetId("");
    setFieldErrors({});
  }

  function toggleService(serviceId: string) {
    setTicked((prev) => {
      const next = new Map(prev);
      if (next.has(serviceId)) next.delete(serviceId);
      else next.set(serviceId, UNASSIGNED);
      return next;
    });
    setFieldErrors({});
  }

  function assignGroomer(serviceId: string, groomerId: string) {
    setTicked((prev) => {
      const next = new Map(prev);
      next.set(serviceId, groomerId);
      return next;
    });
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (saving || !customer) return;

    const scheduledAt = toScheduledAt(date, time);
    if (!scheduledAt) {
      setFieldErrors({ scheduledAt: "Tanggal dan jam belum lengkap." });
      return;
    }

    setSaving(true);
    setFormError(null);
    setFieldErrors({});

    try {
      const booking = await bookingService.create({
        customerId: customer._id,
        petId,
        items: [...ticked].map(([serviceId, groomerUserId]) => ({
          serviceId,
          // FR-3's "Belum ditentukan" is a real state, not a gap.
          groomerUserId: groomerUserId === UNASSIGNED ? null : groomerUserId,
        })),
        scheduledAt,
        status,
        notes: notes.trim() === "" ? null : notes.trim(),
      });

      onCreated(booking);
      reset();
      onOpenChange(false);
    } catch (error) {
      if (error instanceof ApiError) {
        /*
          A REFUSAL GOES TO THE FIELD IT IS ABOUT, and only to the banner when
          no field on this form can hold it — a missing branch, or a 409. Saying
          it in both places at once reads as two problems.

          The server's own field names are English and are shown as they come:
          "petId This pet belongs to a different customer" can be acted on, and
          "Validation failed" cannot. See ApiError.fullMessage.
        */
        const placeable = Object.fromEntries(
          Object.entries(error.fieldErrors).filter(([field]) =>
            PLACEABLE_FIELDS.includes(field),
          ),
        );

        if (Object.keys(placeable).length > 0) setFieldErrors(placeable);
        else setFormError(error.fullMessage);
      } else {
        setFormError("Terjadi kesalahan. Coba lagi.");
      }
      setSaving(false);
    }
  }

  const total = sumDecimals(
    services
      .filter((service) => ticked.has(service._id))
      .map((service) => service.price),
  );

  /*
    WHAT IS STILL MISSING, in the order the form asks for it — so the disabled
    button can say which field rather than leaving somebody hunting. A branch
    comes first because it is not on this form at all: the server books the
    booking to the session's branch, and a user who reaches every branch signs in
    pointed at none of them.
  */
  const blockedReason = !session?.currentBranchId
    ? "Pilih cabang dulu lewat menu cabang di atas."
    : !customer
      ? "Pelanggan belum dipilih."
      : petId === ""
        ? "Hewan belum dipilih."
        : ticked.size === 0
          ? "Belum ada layanan yang dipilih."
          : date === "" || time === ""
            ? "Tanggal dan jamnya belum lengkap."
            : null;

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-xl">
          <form
            onSubmit={handleSubmit}
            noValidate
            className="flex max-h-[80vh] flex-col gap-4 overflow-y-auto"
          >
            <DialogHeader>
              <DialogTitle>Booking baru</DialogTitle>
              <DialogDescription>
                Satu hewan, satu jadwal. Pelanggan dengan dua hewan di hari yang
                sama dibuatkan dua booking.
              </DialogDescription>
            </DialogHeader>

            {loadError && <Alert variant="error">{loadError}</Alert>}
            {formError && <Alert variant="error">{formError}</Alert>}

            {/* §16 field order: kapan, lalu dengan siapa, lalu isinya. */}
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="Tanggal"
                name="booking-date"
                type="date"
                value={date}
                onChange={(event) => {
                  setDate(event.target.value);
                  setFieldErrors({});
                }}
                error={fieldErrors.scheduledAt}
                disabled={saving}
                required
              />
              <TextField
                label="Jam"
                name="booking-time"
                type="time"
                value={time}
                onChange={(event) => {
                  setTime(event.target.value);
                  setFieldErrors({});
                }}
                disabled={saving}
                required
              />
            </div>

            {/*
              THE POS PICKER, not a `FilterSelect`. §16 sends anything somebody
              would type into to the searchable picker, and for pelanggan that
              picker is `CustomerSearchDialog`: it searches ON THE SERVER, so the
              shop with four hundred customers can find the four hundredth, and
              it registers a new one without leaving the form.
            */}
            <div className="flex flex-col gap-1.5">
              <Label>
                Pelanggan<span className="text-danger"> *</span>
              </Label>
              {customer ? (
                <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2.5">
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-navy-100 text-primary">
                      <UserRound className="size-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-foreground">
                        {customer.name}
                      </span>
                      {customer.phone && (
                        <span className="block truncate text-xs tabular-nums text-muted">
                          {customer.phone}
                        </span>
                      )}
                    </span>
                  </span>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={saving}
                    onClick={() => setPicking(true)}
                  >
                    Ganti
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="secondary"
                  className="h-11 justify-start"
                  disabled={saving}
                  onClick={() => setPicking(true)}
                >
                  <UserRound className="size-4" />
                  Pilih pelanggan
                </Button>
              )}
              {fieldErrors.customerId && (
                <p role="alert" className="text-xs font-semibold text-danger">
                  {fieldErrors.customerId}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Label>
                Hewan<span className="text-danger"> *</span>
              </Label>

              {!customer ? (
                <p className="text-sm text-muted">
                  Pilih pelanggannya dulu — daftar hewan mengikuti pemiliknya.
                </p>
              ) : loadingPets ? (
                <div className="flex items-center gap-2 text-sm text-muted">
                  <Spinner /> Memuat hewan…
                </div>
              ) : (
                <>
                  {pets.length === 0 ? (
                    <p className="text-sm text-muted">
                      {customer.name} belum punya hewan terdaftar.
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {pets.map((pet) => (
                        <Button
                          key={pet._id}
                          type="button"
                          size="sm"
                          variant={petId === pet._id ? "default" : "secondary"}
                          aria-pressed={petId === pet._id}
                          disabled={saving}
                          onClick={() => {
                            setPetId(pet._id);
                            setFieldErrors({});
                          }}
                        >
                          {pet.name}
                        </Button>
                      ))}
                    </div>
                  )}
                  <div>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={saving}
                      onClick={() => setAddingPet(true)}
                    >
                      <Plus className="size-4" />
                      Tambah hewan
                    </Button>
                  </div>
                </>
              )}
              {fieldErrors.petId && (
                <p role="alert" className="text-xs font-semibold text-danger">
                  {fieldErrors.petId}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Label>
                Layanan<span className="text-danger"> *</span>
              </Label>

              {loadingServices ? (
                <div className="flex items-center gap-2 text-sm text-muted">
                  <Spinner /> Memuat layanan…
                </div>
              ) : services.length === 0 ? (
                <p className="text-sm text-muted">
                  Belum ada layanan yang bisa dijadwalkan. Tambahkan dulu di
                  Master Data → Layanan.
                </p>
              ) : (
                <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto">
                  {services.map((service) => {
                    const chosen = ticked.has(service._id);
                    /* The server refuses the twenty-first, so the tick that
                       would be refused never becomes available. */
                    const full = !chosen && ticked.size >= MAX_ITEMS;

                    return (
                      <li key={service._id}>
                        <label className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-surface-hover">
                          <Checkbox
                            checked={chosen}
                            onCheckedChange={() => toggleService(service._id)}
                            disabled={saving || full}
                            aria-label={service.name}
                          />
                          <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                            {service.name}
                          </span>
                          <span className="shrink-0 text-sm tabular-nums text-muted">
                            {formatMoney(service.price)}
                          </span>
                        </label>

                        {/*
                          WHO DOES IT, asked only once the service is on the
                          booking — an unticked row has nobody to assign. The
                          control sits OUTSIDE the label above, or clicking it
                          would untick the service it belongs to.

                          40px, not 44: this is a control inside a row, not a
                          field in the document's header (§16).
                        */}
                        {chosen && groomers.length > 0 && (
                          <div className="mb-1 ml-9 flex items-center gap-2">
                            <span className="text-sm text-muted">Groomer</span>
                            <Select
                              value={ticked.get(service._id) ?? UNASSIGNED}
                              onValueChange={(value) =>
                                assignGroomer(service._id, value)
                              }
                              disabled={saving}
                            >
                              <SelectTrigger
                                className="w-56"
                                aria-label={`Groomer untuk ${service.name}`}
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value={UNASSIGNED}>
                                  Belum ditentukan
                                </SelectItem>
                                {groomers.map((groomer) => (
                                  <SelectItem
                                    key={groomer.value}
                                    value={groomer.value}
                                  >
                                    {groomer.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}

              {fieldErrors.items && (
                <p role="alert" className="text-xs font-semibold text-danger">
                  {fieldErrors.items}
                </p>
              )}
            </div>

            <SelectField
              label="Status"
              value={status}
              onChange={(next) => setStatus(next as BookingStatus)}
              options={STATUS_OPTIONS}
              disabled={saving}
              hint="Hanya booking yang dikonfirmasi bisa ditarik ke keranjang di kasir."
              required
            />

            {/* §16: Catatan is always last. */}
            <TextareaField
              label="Catatan"
              name="booking-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              maxLength={NOTES_MAX_LENGTH}
              placeholder="mis. anjingnya takut hairdryer"
              error={fieldErrors.notes}
              disabled={saving}
            />

            <DialogFooter className="items-center">
              {ticked.size > 0 && (
                <span className="mr-auto text-sm tabular-nums text-muted">
                  {/* Summed as decimal STRINGS — this is a quote somebody will
                      be charged, and `0.1 + 0.2` is why utils/decimal exists. */}
                  Total {formatMoney(total)}
                </span>
              )}
              <Button
                type="button"
                variant="secondary"
                onClick={() => handleOpenChange(false)}
                disabled={saving}
              >
                Batal
              </Button>
              <Button
                type="submit"
                disabled={saving || blockedReason !== null}
                title={blockedReason ?? undefined}
              >
                {saving ? "Menyimpan…" : "Simpan booking"}
              </Button>
            </DialogFooter>

            {/* §16's blockedReason, said out loud rather than left to a
                disabled button nobody can interrogate. */}
            {blockedReason && (
              <p className="text-right text-sm text-muted">{blockedReason}</p>
            )}
          </form>
        </DialogContent>
      </Dialog>

      {/*
        ONE DIALOG, NOT TWO — `CustomerSearchDialog` hosts the quick-add itself,
        so somebody who discovers the customer does not exist registers them
        without losing the half-filled booking behind.
      */}
      <CustomerSearchDialog
        open={picking}
        onOpenChange={setPicking}
        onSelect={chooseCustomer}
      />

      {customer && (
        <PetQuickAddDialog
          customerId={customer._id}
          customerName={customer.name}
          open={addingPet}
          onOpenChange={setAddingPet}
          onCreated={(pet) => {
            setAddingPet(false);
            setPetsNonce((n) => n + 1);
            setPetId(pet._id);
          }}
        />
      )}
    </>
  );
}
