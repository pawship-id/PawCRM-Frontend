"use client";

import { useEffect, useMemo, useState } from "react";
import { PawPrint, Plus, Users } from "lucide-react";

import { Alert, Spinner, TextField } from "@/components";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { FieldBlock, Segmented } from "@/features/memberships/components/FormBits";
import {
  ATTACH_TO_LABEL,
  ELIGIBILITY_LABEL,
  formatDate,
  formatPlanDuration,
} from "@/features/memberships/labels";
import { PetQuickAddDialog } from "@/features/pets";
import { cn } from "@/lib/utils";
import { membershipService } from "@/services/membership.service";
import { petService } from "@/services/pet.service";
import { formatMoney } from "@/utils/decimal";
import type { Pet, PosCatalogItem, PosItem } from "@/types/api";
import type { EligibilityReason, MembershipEligibility } from "@/types/membership";

import type { MembershipAddResult, MembershipLineInput } from "../hooks/usePosCart";
import { newPackageRef } from "../membershipCart";

/** The API's page cap. */
const FETCH_LIMIT = 100;

/** The holder key for a plan the customer holds (no animal). */
const CUSTOMER = "customer";

type StartMode = "today" | "after" | "pick";

/** "YYYY-MM-DD" of a moment, in the browser's (the shop's) calendar. */
export function calendarDay(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Whether a start falls today or earlier — the allowance is usable in this basket. */
function startsNow(start: string | null | undefined): boolean {
  if (!start) return true;
  return calendarDay(start) <= calendarDay(new Date());
}

/**
 * Why this holder cannot buy the plan, as sentences — `referral_required` is
 * left out (the dialog asks for the code instead), and so is the basket's own
 * rule: one package per holder per basket.
 */
export function blockingReasons(
  check: MembershipEligibility | undefined,
): EligibilityReason[] {
  return (check?.reasons ?? []).filter((reason) => reason.code !== "referral_required");
}

/** The animal's three variant facts, as words — "Kucing · Kecil · Pendek". */
function petFacts(pet: Pet): string {
  return [pet.speciesLabel, pet.sizeLabel, pet.furTypeLabel].filter(Boolean).join(" · ");
}

/**
 * SELLING A MEMBERSHIP PACKAGE AT THE TILL (Promosi V1, Fase 4) — replaces the
 * service dialog for package tiles.
 *
 * WHAT IT ASKS, in order: whose (an animal of the customer's, or the customer
 * for a plan held by the customer), from when (Hari ini / Setelah yang aktif
 * berakhir / Pilih tanggal), and the referral code when the plan wants one.
 *
 * WHO MAY BUY IS THE SERVER'S ANSWER (`GET /pet-memberships/eligibility`,
 * contract §3.9), asked per animal when the dialog opens: an animal that may
 * not buy is still listed, disabled, with the reason — species, the buyer rule,
 * a missing variant price. A running card is not a refusal: it offers "Setelah
 * yang aktif berakhir" from `suggestedStartDate`. The basket's own rule (one
 * package per holder per basket) is checked here, against the lines.
 *
 * THE PRICE IS THE SERVER'S TOO — `eligibility.price` is what this animal's
 * variant costs, and what the cart save charges. Nothing here computes one.
 *
 * A refusal on save (409, `data.reasons`) is shown inside the dialog, which
 * stays open on the animal it is about.
 */
export function PosMembershipSaleDialog({
  plan,
  customerId,
  customerName,
  branchId,
  cartItems,
  busy = false,
  onAdd,
  onOpenChange,
}: {
  /** The package tile tapped, or null when nothing is pending. */
  plan: PosCatalogItem | null;
  customerId: string;
  customerName?: string;
  branchId?: string | null;
  /** The basket's lines — for "already in the basket" and a fresh packageRef. */
  cartItems: PosItem[];
  busy?: boolean;
  onAdd: (
    input: MembershipLineInput,
    summary: { holderName: string; startsNow: boolean },
  ) => Promise<MembershipAddResult>;
  onOpenChange: (open: boolean) => void;
}) {
  const open = plan !== null;
  const planId = plan?._id ?? null;
  const forCustomer = plan?.attachTo === "customer";
  const wantsReferral = plan?.eligibility === "referral";

  const [pets, setPets] = useState<Pet[]>([]);
  const [loadingPets, setLoadingPets] = useState(false);
  const [petsError, setPetsError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [addingPet, setAddingPet] = useState(false);

  /** Eligibility per holder (pet id, or CUSTOMER), judged from `suggestedStartDate`. */
  const [checks, setChecks] = useState<Record<string, MembershipEligibility | "error">>({});
  const [holder, setHolder] = useState<string | null>(null);
  const [mode, setMode] = useState<StartMode>("today");
  const [pickedDay, setPickedDay] = useState("");
  /** Eligibility for a picked day — keyed so an old answer is never read for a new day. */
  const [dayCheck, setDayCheck] = useState<{ key: string; check: MembershipEligibility | "error" } | null>(null);
  const [referral, setReferral] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [refusal, setRefusal] = useState<{ message: string; reasons: EligibilityReason[] } | null>(null);

  /* ── the animals ─────────────────────────────────────────────────── */
  useEffect(() => {
    if (!open || !customerId) return;

    let live = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadingPets(true);
    setPetsError(null);

    petService
      .list({ customerId, isActive: true, limit: FETCH_LIMIT })
      .then((result) => {
        if (live) setPets(result?.items ?? []);
      })
      .catch(() => {
        if (live) setPetsError("Daftar hewan tidak bisa dimuat. Coba lagi.");
      })
      .finally(() => {
        if (live) setLoadingPets(false);
      });

    return () => {
      live = false;
    };
  }, [open, customerId, nonce]);

  /* ── who may buy: one eligibility question per holder ─────────────── */
  const holderIds = useMemo(
    () => (forCustomer ? [CUSTOMER] : pets.map((pet) => pet._id)),
    [forCustomer, pets],
  );

  useEffect(() => {
    if (!open || !planId || holderIds.length === 0) return;

    let live = true;

    holderIds.forEach((id) => {
      membershipService
        .eligibility({
          planId,
          customerId,
          ...(id === CUSTOMER ? {} : { petId: id }),
          ...(branchId ? { branchId } : {}),
        })
        .then((result) => {
          if (live) setChecks((prev) => ({ ...prev, [id]: result }));
        })
        .catch(() => {
          if (live) setChecks((prev) => ({ ...prev, [id]: "error" }));
        });
    });

    return () => {
      live = false;
    };
  }, [open, planId, customerId, branchId, holderIds]);

  /** Already a package for this holder in the basket — one per holder per basket. */
  const inCart = (id: string) =>
    cartItems.some(
      (item) =>
        item.kind === "membership" &&
        (id === CUSTOMER ? !item.petId : String(item.petId) === id),
    );

  const checkOf = (id: string) => {
    const found = checks[id];
    return found && found !== "error" ? found : undefined;
  };

  const blockedWhy = (id: string): string[] => {
    const found = checks[id];
    if (found === "error") return ["Syarat paket tidak bisa diperiksa. Coba lagi."];
    const why = blockingReasons(found).map((reason) => reason.message);
    if (inCart(id)) {
      const name = id === CUSTOMER ? "pelanggan ini" : (pets.find((pet) => pet._id === id)?.name ?? "hewan ini");
      why.push(`Sudah ada paket untuk ${name} di keranjang`);
    }
    return why;
  };

  const ready = (id: string) => checks[id] !== undefined;
  const selectable = (id: string) => ready(id) && blockedWhy(id).length === 0;

  /* The first holder that may buy is chosen for the cashier — one tap fewer. */
  const firstSelectable = holderIds.find(selectable) ?? null;
  const chosen = holder && holderIds.includes(holder) ? holder : firstSelectable;
  const check = chosen ? checkOf(chosen) : undefined;
  const active = check?.activeCard ?? null;

  /* With a running card, "Hari ini" would overlap — "after" is the default. */
  const effectiveMode: StartMode = active && mode === "today" ? "after" : !active && mode === "after" ? "today" : mode;
  const minDay = active ? calendarDay(check?.suggestedStartDate ?? new Date()) : calendarDay(new Date());

  /* ── a picked day is judged on its own ────────────────────────────── */
  const dayKey = chosen && effectiveMode === "pick" && pickedDay ? `${chosen}:${pickedDay}` : "";

  useEffect(() => {
    if (!dayKey || !planId || !chosen) return;

    let live = true;

    membershipService
      .eligibility({
        planId,
        customerId,
        ...(chosen === CUSTOMER ? {} : { petId: chosen }),
        ...(branchId ? { branchId } : {}),
        startDate: pickedDay,
      })
      .then((result) => {
        if (live) setDayCheck({ key: dayKey, check: result });
      })
      .catch(() => {
        if (live) setDayCheck({ key: dayKey, check: "error" });
      });

    return () => {
      live = false;
    };
  }, [dayKey, planId, chosen, customerId, branchId, pickedDay]);

  const pickCheck = dayCheck && dayCheck.key === dayKey ? dayCheck.check : undefined;
  const pickReasons =
    pickCheck === "error"
      ? ["Tanggal ini tidak bisa diperiksa. Coba lagi."]
      : blockingReasons(pickCheck).map((reason) => reason.message);

  /* What the preview shows — the server's dates for the start in question. */
  const preview =
    effectiveMode === "pick"
      ? pickCheck && pickCheck !== "error"
        ? { start: pickCheck.startDate, end: pickCheck.endDate }
        : null
      : check
        ? { start: check.startDate ?? check.suggestedStartDate, end: check.endDate }
        : null;
  const usableNow = effectiveMode === "today" || (preview ? startsNow(preview.start) : false);

  const holderName =
    chosen === CUSTOMER
      ? (customerName ?? "pelanggan")
      : (pets.find((pet) => pet._id === chosen)?.name ?? "hewan");

  const referralMissing = wantsReferral && referral.trim() === "";
  const canAdd =
    Boolean(chosen) &&
    selectable(chosen as string) &&
    check?.price !== null &&
    check !== undefined &&
    !referralMissing &&
    (effectiveMode !== "pick" ||
      (pickedDay !== "" && pickCheck !== undefined && pickReasons.length === 0)) &&
    !busy &&
    !submitting;

  function reset() {
    setPets([]);
    setChecks({});
    setHolder(null);
    setMode("today");
    setPickedDay("");
    setDayCheck(null);
    setReferral("");
    setRefusal(null);
    setSubmitting(false);
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  async function add() {
    if (!plan || !chosen || !canAdd) return;

    setSubmitting(true);
    setRefusal(null);

    const result = await onAdd(
      {
        planId: plan._id,
        petId: chosen === CUSTOMER ? null : chosen,
        /* Absent = starts when paid. "Setelah…" sends the server's instant as
           returned; a picked day goes as the day (contract §6.2). */
        ...(effectiveMode === "after" && check?.suggestedStartDate
          ? { membershipStartDate: check.suggestedStartDate }
          : effectiveMode === "pick"
            ? { membershipStartDate: pickedDay }
            : {}),
        ...(wantsReferral ? { referralCode: referral.trim().toUpperCase() } : {}),
        packageRef: newPackageRef(cartItems),
      },
      { holderName, startsNow: usableNow },
    );

    setSubmitting(false);

    if (result.ok) {
      reset();
      return;
    }

    setRefusal({ message: result.message, reasons: result.reasons });
  }

  const modeOptions = [
    { value: "today" as const, label: "Hari ini", disabled: Boolean(active) },
    ...(active ? [{ value: "after" as const, label: "Setelah yang aktif berakhir" }] : []),
    { value: "pick" as const, label: "Pilih tanggal" },
  ];

  const loadingHolders =
    (forCustomer ? false : loadingPets) || holderIds.some((id) => !ready(id));

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{`Jual paket: ${plan?.name ?? ""}`}</DialogTitle>
            <DialogDescription>
              {[
                plan ? formatPlanDuration(plan) : null,
                plan?.eligibility ? ELIGIBILITY_LABEL[plan.eligibility] : null,
                plan ? `melekat ke ${ATTACH_TO_LABEL[plan.attachTo ?? "pet"].toLowerCase()}` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </DialogDescription>
          </DialogHeader>

          {petsError && <Alert variant="error">{petsError}</Alert>}

          <div className="flex flex-col gap-4">
            <FieldBlock label={forCustomer ? "Untuk pelanggan" : "Untuk hewan"}>
              {loadingHolders && holderIds.length === 0 ? (
                <div className="flex items-center gap-2 py-4 text-sm text-muted">
                  <Spinner /> Memuat hewan…
                </div>
              ) : !forCustomer && pets.length === 0 ? (
                <p className="text-sm text-muted">
                  {customerName ?? "Pelanggan ini"} belum punya hewan terdaftar.
                  Tambahkan dulu di bawah.
                </p>
              ) : (
                <div role="radiogroup" aria-label={forCustomer ? "Untuk pelanggan" : "Untuk hewan"} className="flex flex-col gap-2">
                  {holderIds.map((id) => {
                    const pet = pets.find((one) => one._id === id) ?? null;
                    const holderCheck = checkOf(id);
                    const why = ready(id) ? blockedWhy(id) : [];
                    const disabled = !selectable(id) || busy;
                    const selected = chosen === id;
                    const detail = [
                      id === CUSTOMER
                        ? pets.length > 0
                          ? `Berlaku untuk semua hewan: ${pets.map((one) => one.name).join(", ")}`
                          : "Berlaku untuk semua hewan pelanggan"
                        : pet
                          ? petFacts(pet)
                          : null,
                      holderCheck?.activeCard
                        ? `membership aktif s.d. ${formatDate(holderCheck.activeCard.endDate)}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ");

                    return (
                      <button
                        key={id}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        aria-disabled={disabled}
                        disabled={disabled}
                        onClick={() => {
                          setHolder(id);
                          setMode("today");
                          setPickedDay("");
                          setRefusal(null);
                        }}
                        className={cn(
                          "flex w-full items-start justify-between gap-3 rounded-lg border px-3 py-2.5 text-left transition outline-none",
                          "focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/50",
                          selected ? "border-primary bg-navy-100" : "border-border bg-surface hover:bg-surface-hover",
                          disabled && "cursor-not-allowed hover:bg-surface",
                        )}
                      >
                        <span className="flex min-w-0 items-start gap-2">
                          {id === CUSTOMER ? (
                            <Users className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
                          ) : (
                            <PawPrint className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
                          )}
                          <span className="min-w-0">
                            <span className={cn("block text-sm font-medium", disabled ? "text-muted" : "text-foreground")}>
                              {id === CUSTOMER ? (customerName ?? "Pelanggan") : (pet?.name ?? "Hewan")}
                            </span>
                            {detail && <span className="block text-xs text-muted">{detail}</span>}
                            {why.map((reason) => (
                              <span key={reason} className="block text-xs font-semibold text-danger">
                                {reason}
                              </span>
                            ))}
                          </span>
                        </span>
                        <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                          {!ready(id) ? (
                            <Spinner />
                          ) : holderCheck?.price ? (
                            formatMoney(holderCheck.price)
                          ) : (
                            "—"
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {!forCustomer && (
                <div>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={busy}
                    onClick={() => setAddingPet(true)}
                  >
                    <Plus className="size-4" />
                    Tambah hewan
                  </Button>
                </div>
              )}
            </FieldBlock>

            {chosen && check && selectable(chosen) && (
              <>
                <FieldBlock
                  label="Mulai berlaku"
                  hint={
                    active
                      ? `${holderName} masih punya membership aktif s.d. ${formatDate(active.endDate)}. Masa berlaku tidak boleh tumpang tindih.`
                      : undefined
                  }
                  error={effectiveMode === "pick" && pickReasons.length > 0 ? pickReasons.join(". ") : undefined}
                >
                  <Segmented
                    ariaLabel="Mulai berlaku"
                    value={effectiveMode}
                    options={modeOptions}
                    onChange={(next) => {
                      setMode(next);
                      setRefusal(null);
                      if (next === "pick" && !pickedDay) setPickedDay(minDay);
                    }}
                  />
                  {effectiveMode === "pick" && (
                    <Input
                      type="date"
                      aria-label="Tanggal mulai"
                      className="h-11 max-w-56 tabular-nums"
                      value={pickedDay}
                      min={minDay}
                      onChange={(event) => setPickedDay(event.target.value)}
                    />
                  )}
                </FieldBlock>

                {wantsReferral && (
                  <TextField
                    label="Kode referral"
                    required
                    value={referral}
                    placeholder="mis. RINA-7Q2"
                    className="uppercase"
                    hint="Kode dari member yang mengajak."
                    error={
                      refusal?.reasons.find((reason) => reason.code === "referral_required")?.message
                    }
                    onChange={(event) => setReferral(event.target.value)}
                  />
                )}

                <dl
                  aria-label="Pratinjau paket"
                  className="flex flex-col gap-1.5 rounded-lg border border-border bg-background p-3 text-sm"
                >
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted">Harga</dt>
                    <dd className="font-semibold tabular-nums text-foreground">
                      {check.price ? formatMoney(check.price) : "—"}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted">Masa berlaku</dt>
                    <dd className="tabular-nums text-foreground">
                      {preview ? `${formatDate(preview.start)} – ${formatDate(preview.end)}` : "—"}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted">Jatah</dt>
                    <dd className="text-right text-foreground">
                      {usableNow
                        ? "langsung bisa dipakai di transaksi ini"
                        : `mulai dipakai ${preview ? formatDate(preview.start) : "—"}`}
                    </dd>
                  </div>
                </dl>

                <p className="text-xs text-muted">
                  Membership aktif setelah transaksi lunas. Kalau dibayar piutang,
                  statusnya menunggu pembayaran dan jatahnya belum bisa dipakai.
                </p>
              </>
            )}

            {refusal && (
              <Alert variant="error">
                {refusal.reasons.length > 0
                  ? refusal.reasons.map((reason) => reason.message).join(". ")
                  : refusal.message}
              </Alert>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => handleOpenChange(false)}>
              Batal
            </Button>
            <Button type="button" disabled={!canAdd} onClick={() => void add()}>
              {(submitting || busy) && <Spinner />}
              Tambah ke keranjang
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {addingPet && (
        <PetQuickAddDialog
          customerId={customerId}
          customerName={customerName}
          open
          onOpenChange={setAddingPet}
          onCreated={(pet) => {
            setAddingPet(false);
            setNonce((n) => n + 1);
            setHolder(pet._id);
          }}
        />
      )}
    </>
  );
}
