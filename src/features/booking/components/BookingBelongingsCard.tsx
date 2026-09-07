"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

import { Alert, Card, FIELD_HEIGHT } from "@/components";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Can } from "@/features/permissions";
import { ApiError } from "@/services/api-error";
import { bookingService } from "@/services/booking.service";
import type { Booking, BookingBelonging } from "@/types/api";

/** Mirrors BELONGING_NAME_MAX_LENGTH in booking.model.js. */
const NAME_MAX_LENGTH = 120;

/**
 * TITIPAN OWNER — what came in with this animal, and what has gone home.
 *
 * ─── ON THE ANIMAL'S OWN PAGE, NOT THE BOOKING'S ───────────────────────────
 *
 * It started on the booking overview, grouped by animal, and moved here. Handing
 * a collar back is something that happens at the table, next to the animal it
 * belongs to and the person holding it — and the overview is about what the
 * whole visit is and what it comes to. A card that made somebody scroll past two
 * other animals' things to tick one was in the wrong place.
 *
 * ─── TWO TICKS, NOT ONE ────────────────────────────────────────────────────
 *
 * "Sudah dikembalikan" as a single checkbox cannot tell apart the two states
 * that matter: something written down when the booking was taken and never
 * actually handed over, and something handed over and still in the drawer. Only
 * the second may hold a visit open, and a shop that ticked "returned" on things
 * that never arrived would train itself to ignore the warning.
 *
 * ─── ONE REQUEST PER TICK, AND PER ADD ─────────────────────────────────────
 *
 * Every box and the add box are their own request against one item, never a save
 * of the whole list: two counters handing back two animals' things at the same
 * moment would otherwise overwrite each other, and the loser is an item recorded
 * as returned and then quietly un-returned.
 *
 * ─── THE ROW REFLECTS THE SERVER, NOT THE CLICK ────────────────────────────
 *
 * Nothing is ticked locally and reconciled afterwards. The request goes, the
 * booking comes back, and the page redraws from it — so a refusal leaves the box
 * exactly as it was rather than flicking and flicking back.
 */
export function BookingBelongingsCard({
  booking,
  petId,
  petName,
  onChanged,
}: {
  booking: Booking;
  /** Only this animal's things — the page is about one animal. */
  petId: string;
  petName: string | null;
  /** Called with the updated booking, so the page redraws from the server. */
  onChanged: (booking: Booking) => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);

  const belongings = (booking.belongings ?? []).filter(
    (belonging) => belonging.petId === petId,
  );

  /*
    STILL HERE: handed over, not yet given back. An item that never arrived is
    NOT outstanding — it is why these are two dates and not a flag — and counting
    it would hold the visit open over something nobody brought.
  */
  const outstanding = belongings.filter(
    (belonging) => belonging.checkedInAt && !belonging.checkedOutAt,
  );

  async function run(work: () => Promise<Booking>, id: string) {
    setBusyId(id);
    setError(null);

    try {
      onChanged(await work());
      return true;
    } catch (err) {
      setError(
        err instanceof ApiError
          ? (err.reason ?? err.message)
          : "Tidak bisa disimpan. Coba lagi.",
      );
      return false;
    } finally {
      setBusyId(null);
    }
  }

  async function add() {
    const name = draft.trim();
    if (name === "") return;

    const ok = await run(
      () => bookingService.addBelonging(booking._id, { petId, name }),
      "new",
    );

    if (ok) {
      setDraft("");
      setAdding(false);
    }
  }

  return (
    <Card
      title="Titipan Owner"
      /*
        THE COUNT IN THE HEADER, so a closed-up card still says whether anything
        is outstanding. It carries the WORD as well as the colour — ui-rules §1.3
        — because "2" in red is a number somebody has to decode.
      */
      action={
        outstanding.length > 0 ? (
          <span className="rounded-full bg-tint-danger px-3 py-1 text-xs font-semibold text-danger">
            {outstanding.length} belum kembali
          </span>
        ) : (
          belongings.length > 0 && (
            <span className="rounded-full bg-tint-success px-3 py-1 text-xs font-semibold text-success">
              Semua kembali
            </span>
          )
        )
      }
    >
      <div className="flex flex-col gap-3">
        {error && <Alert variant="error">{error}</Alert>}

        {belongings.length === 0 && !adding ? (
          <p className="text-sm text-muted">
            {petName ?? "Hewan ini"} tidak menitipkan barang apa pun.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
                  <th className="py-2 text-left font-medium">Barang</th>
                  <th className="w-20 py-2 text-center font-medium">Masuk</th>
                  <th className="w-20 py-2 text-center font-medium">Keluar</th>
                </tr>
              </thead>
              <tbody>
                {belongings.map((belonging) => (
                  <BelongingRow
                    key={belonging._id}
                    belonging={belonging}
                    busy={busyId === belonging._id}
                    onTick={(patch) =>
                      void run(
                        () =>
                          bookingService.checkBelonging(
                            booking._id,
                            belonging._id,
                            patch,
                          ),
                        belonging._id,
                      )
                    }
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Can feature="bookings" action="update">
          {adding ? (
            <div className="flex items-start gap-2">
              <Input
                aria-label={`Nama barang titipan ${petName ?? "hewan ini"}`}
                autoFocus
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void add();
                  }
                  if (event.key === "Escape") setAdding(false);
                }}
                placeholder="mis. Kalung merah + lonceng"
                maxLength={NAME_MAX_LENGTH}
                disabled={busyId === "new"}
                className={`flex-1 ${FIELD_HEIGHT}`}
              />
              <Button
                type="button"
                disabled={busyId === "new" || draft.trim() === ""}
                onClick={() => void add()}
              >
                Simpan
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={busyId === "new"}
                onClick={() => {
                  setDraft("");
                  setAdding(false);
                }}
              >
                Batal
              </Button>
            </div>
          ) : (
            <div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setAdding(true)}
              >
                <Plus className="size-4" aria-hidden />
                Tambah barang
              </Button>
            </div>
          )}
        </Can>

        {outstanding.length > 0 && (
          <p className="text-xs text-muted">
            Booking tidak bisa diselesaikan sampai semuanya dicentang keluar.
          </p>
        )}
      </div>
    </Card>
  );
}

function BelongingRow({
  belonging,
  busy,
  onTick,
}: {
  belonging: BookingBelonging;
  busy: boolean;
  onTick: (patch: { checkedIn?: boolean; checkedOut?: boolean }) => void;
}) {
  const isIn = Boolean(belonging.checkedInAt);
  const isOut = Boolean(belonging.checkedOutAt);

  return (
    <tr className="border-b border-border last:border-b-0">
      <td className="py-2.5">
        <Label htmlFor={`belonging-in-${belonging._id}`} className="font-normal">
          {belonging.name}
        </Label>
      </td>

      <td className="py-2.5 text-center">
        {/*
          `Can` RATHER THAN A DISABLED BOX. Somebody without the grant is not
          being stopped mid-act — they are reading the page, and a row of dead
          checkboxes reads as broken. The state still shows.
        */}
        <Can feature="bookings" action="update" fallback={<Mark on={isIn} />}>
          <Checkbox
            id={`belonging-in-${belonging._id}`}
            aria-label={`${belonging.name} masuk`}
            checked={isIn}
            disabled={busy}
            onCheckedChange={(checked) => onTick({ checkedIn: checked === true })}
          />
        </Can>
      </td>

      <td className="py-2.5 text-center">
        <Can feature="bookings" action="update" fallback={<Mark on={isOut} />}>
          <Checkbox
            id={`belonging-out-${belonging._id}`}
            aria-label={`${belonging.name} keluar`}
            checked={isOut}
            /*
              NOT TICKABLE BEFORE IT HAS ARRIVED. The server refuses it with a
              409 naming the item; disabling the box means nobody has to read a
              refusal to learn the order the two happen in.
            */
            disabled={busy || !isIn}
            onCheckedChange={(checked) =>
              onTick({ checkedOut: checked === true })
            }
          />
        </Can>
      </td>
    </tr>
  );
}

/** The state, for somebody who may read the page but not tick it. */
function Mark({ on }: { on: boolean }) {
  return <span className={on ? "text-success" : "text-muted"}>{on ? "✓" : "–"}</span>;
}
