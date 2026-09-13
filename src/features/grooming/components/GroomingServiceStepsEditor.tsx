"use client";

import { useState, type KeyboardEvent } from "react";
import { ChevronsUpDown, GripVertical, Plus, X } from "lucide-react";

import { Alert, Card } from "@/components";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { swalToast } from "@/lib/swal";
import { cn } from "@/lib/utils";
import { ApiError } from "@/services/api-error";
import { serviceService } from "@/services/service.service";
import type { Service } from "@/types/api";

import { useLineSessionNames } from "../hooks/useGroomingServiceDetail";
import {
  addStep,
  hasStep,
  MAX_SESSIONS,
  moveStep,
  removeStep,
  seedSteps,
  SESSION_MAX_LENGTH,
  setWeight,
  splitEvenly,
  stepsPatch,
  stepsProblem,
  stepsSignature,
  stepsTotal,
  type StepsDraft,
} from "../serviceStepsDraft";
import { DraftSaveBar } from "./DraftSaveBar";

/**
 * "+ Tambah tahapan…" — the tahapan other grooming services use, and a new name
 * typed. A popover rather than the mockup's native select, because the list has
 * to take a name nobody has used yet.
 */
function StepPicker({
  names,
  loading,
  isTaken,
  full,
  onPick,
}: {
  names: string[];
  loading: boolean;
  isTaken: (name: string) => boolean;
  full: boolean;
  onPick: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const typed = query.trim();
  const available = names.filter((name) => !isTaken(name));
  const matches = typed
    ? available.filter((name) => name.toLowerCase().includes(typed.toLowerCase()))
    : available;
  const exact = available.find(
    (name) => name.toLowerCase() === typed.toLowerCase(),
  );
  const typedTaken = typed !== "" && isTaken(typed);

  function pick(name: string) {
    onPick(name);
    setQuery("");
    setOpen(false);
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="secondary"
          disabled={full}
          title={full ? `Maksimal ${MAX_SESSIONS} tahapan.` : undefined}
          className="min-w-56 justify-between"
        >
          <span className="flex items-center gap-1.5">
            <Plus className="size-4" />
            Tambah tahapan…
          </span>
          <ChevronsUpDown className="size-4 text-muted" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-2">
        <Input
          aria-label="Cari atau ketik tahapan baru"
          autoFocus
          value={query}
          maxLength={SESSION_MAX_LENGTH}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            if (exact) pick(exact);
            else if (typed !== "" && !typedTaken) pick(typed);
          }}
          placeholder="Cari atau ketik tahapan baru"
          className="h-9"
        />

        <div className="mt-2 flex max-h-60 flex-col overflow-y-auto">
          {typed !== "" && !exact && !typedTaken && (
            <button
              type="button"
              onClick={() => pick(typed)}
              className="flex min-h-9 items-center gap-2 rounded-md px-2 text-left text-sm font-semibold text-primary transition hover:bg-surface-hover focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <Plus className="size-4" />
              Tambah “{typed}”
            </button>
          )}
          {typedTaken && (
            <p className="px-2 py-1.5 text-sm text-muted">
              Tahapan ini sudah ada di layanan ini.
            </p>
          )}

          {loading ? (
            <p className="px-2 py-1.5 text-sm text-muted">
              Memuat tahapan layanan lain…
            </p>
          ) : matches.length > 0 ? (
            <>
              <p className="px-2 pt-1.5 pb-1 text-xs text-muted">
                Dipakai layanan grooming lain
              </p>
              {matches.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => pick(name)}
                  className="flex min-h-9 items-center rounded-md px-2 text-left text-sm text-foreground transition hover:bg-surface-hover focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  {name}
                </button>
              ))}
            </>
          ) : (
            typed === "" && (
              <p className="px-2 py-1.5 text-sm text-muted">
                Belum ada tahapan lain untuk dipilih. Ketik nama tahapan baru.
              </p>
            )
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Layanan › Grooming › a service › Tahapan & Add-on › "Tahapan & bobot komisi" —
 * EDITED IN PLACE, as `buloo-grooming-v3.html` draws it (decided 14 September
 * 2026, on request).
 *
 * THE SAME SHAPE AS VARIAN & HARGA: every change goes to a draft
 * (`serviceStepsDraft.ts`), and `DraftSaveBar` appears once it differs from
 * what is stored — one PATCH of `sessions` and `sessionWeights`.
 *
 * WHAT A SAVE CHANGES: the tahapan a NEW booking line is split into, and how
 * its commission is shared. A booking already made keeps the turns it was made
 * with — they were copied onto it.
 *
 * REORDERING: the handle drags, and it also answers ArrowUp / ArrowDown, so the
 * order is not a mouse-only question.
 *
 * WHAT THE MOCKUP HAS AND THIS DOES NOT: a shop-wide list of tahapan to pick
 * from. There is none — the picker offers the names other grooming services
 * already use, and takes a new one typed.
 */
export function GroomingServiceStepsEditor({
  service,
  mayUpdate,
  onSaved,
}: {
  service: Service;
  /** `services:update` — without it the list is shown and nothing is editable. */
  mayUpdate: boolean;
  onSaved: (service: Service) => void;
}) {
  const [draft, setDraft] = useState<StepsDraft>(() => seedSteps(service));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  /** The row whose handle is held — only that row may start a drag. */
  const [armed, setArmed] = useState<number | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);

  const suggestions = useLineSessionNames(
    mayUpdate ? service.businessLineId : null,
    service._id,
  );

  const disabled = !mayUpdate || saving;
  const dirty = stepsSignature(draft) !== stepsSignature(seedSteps(service));
  const problem = stepsProblem(draft);
  const total = stepsTotal(draft);
  const single = draft.sessions.length === 1;

  function change(next: StepsDraft) {
    setDraft(next);
    setSaveError(null);
  }

  function moveByKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const to =
      event.key === "ArrowUp"
        ? index - 1
        : event.key === "ArrowDown"
          ? index + 1
          : null;
    if (to === null) return;

    event.preventDefault();
    change(moveStep(draft, index, to));
  }

  async function save() {
    if (problem || saving) return;

    setSaving(true);
    setSaveError(null);
    try {
      const updated = await serviceService.update(service._id, stepsPatch(draft));
      setDraft(seedSteps(updated));
      swalToast("Tahapan tersimpan.");
      onSaved(updated);
    } catch (err) {
      setSaveError(
        err instanceof ApiError
          ? (err.reason ?? err.fullMessage)
          : "Tahapan belum tersimpan. Coba lagi.",
      );
    } finally {
      setSaving(false);
    }
  }

  const badge =
    total === null
      ? draft.sessions.length === 0
        ? null
        : { label: "Dibagi rata", className: "bg-tint-neutral text-muted" }
      : total === 100
        ? { label: `Total ${total}%`, className: "bg-tint-success text-success" }
        : { label: `Total ${total}%`, className: "bg-tint-danger text-danger" };

  return (
    <div className="flex flex-col gap-6">
      {mayUpdate && dirty && (
        <DraftSaveBar
          problem={
            problem && <b className="font-semibold">{problem}</b>
          }
          saving={saving}
          saveLabel="Simpan tahapan"
          onDiscard={() => {
            setDraft(seedSteps(service));
            setSaveError(null);
          }}
          onSave={() => void save()}
        />
      )}

      {saveError && <Alert variant="error">{saveError}</Alert>}

      <Card
        title="Tahapan & bobot komisi"
        action={
          badge && (
            <Badge
              variant="outline"
              className={cn("border-transparent tabular-nums", badge.className)}
            >
              {badge.label}
            </Badge>
          )
        }
      >
        {draft.sessions.length === 0 ? (
          <p className="text-sm text-muted">
            Belum ada tahapan.
            {mayUpdate && " Tambah yang pertama lewat Tambah tahapan di bawah."}
          </p>
        ) : (
          <ol className="flex flex-col gap-2">
            {draft.sessions.map((name, index) => (
              <li
                key={name}
                draggable={mayUpdate && armed === index}
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", name);
                  setDragging(index);
                }}
                onDragOver={(event) => {
                  if (dragging === null) return;
                  event.preventDefault();
                  if (dragging !== index) {
                    change(moveStep(draft, dragging, index));
                    setDragging(index);
                  }
                }}
                onDrop={(event) => event.preventDefault()}
                onDragEnd={() => {
                  setDragging(null);
                  setArmed(null);
                }}
                className={cn(
                  "flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2",
                  dragging === index && "border-primary opacity-60",
                )}
              >
                {mayUpdate && (
                  <button
                    type="button"
                    aria-label={`Pindahkan ${name}`}
                    title="Seret untuk mengubah urutan, atau tekan panah atas/bawah"
                    disabled={saving}
                    onPointerDown={() => setArmed(index)}
                    onPointerUp={() => setArmed(null)}
                    onKeyDown={(event) => moveByKey(event, index)}
                    className="flex size-9 flex-none cursor-grab items-center justify-center rounded-md text-muted transition hover:bg-surface-hover hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none active:cursor-grabbing"
                  >
                    <GripVertical className="size-4" />
                  </button>
                )}
                <span className="min-w-0 flex-1 text-sm font-semibold text-foreground">
                  {name}
                </span>
                <Input
                  aria-label={`Bobot ${name} (%)`}
                  inputMode="numeric"
                  // One tahapan takes the whole commission, whatever is typed.
                  value={single ? "100" : (draft.weights[name] ?? "")}
                  disabled={disabled || single}
                  onChange={(event) =>
                    change(setWeight(draft, name, event.target.value))
                  }
                  placeholder="rata"
                  className="h-9 w-20 text-right tabular-nums"
                />
                <span className="text-sm text-muted">%</span>
                {mayUpdate && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={`Hapus tahapan ${name}`}
                    disabled={saving}
                    onClick={() => change(removeStep(draft, index))}
                    className="size-9 p-0 text-muted hover:bg-tint-danger hover:text-danger"
                  >
                    <X className="size-4" />
                  </Button>
                )}
              </li>
            ))}
          </ol>
        )}

        {mayUpdate && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <StepPicker
              names={suggestions.names}
              loading={suggestions.loading}
              isTaken={(name) => hasStep(draft, name)}
              full={saving || draft.sessions.length >= MAX_SESSIONS}
              onPick={(name) => change(addStep(draft, name))}
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={saving || draft.sessions.length < 2}
              onClick={() => change(splitEvenly(draft))}
            >
              Bagi rata
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
