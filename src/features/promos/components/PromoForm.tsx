"use client";

import { Lock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Breadcrumb, FormActionBar } from "@/components";
import { PROMOSI_SUMMARY_HREF } from "@/features/memberships/labels";
import { swalToast } from "@/lib/swal";
import { promoService } from "@/services/promo.service";
import type { Promo } from "@/types/promo";
import { isoDate } from "@/utils/date";

import { promoFailure } from "../errors";
import { useItemFacts } from "../hooks/useItemFacts";
import { PROMO_HREF, PROMO_TYPE_LABEL, promoStatusLabel } from "../labels";
import {
  draftToCreate,
  draftToUpdate,
  emptyPromoDraft,
  promoBlockedReason,
  promoToDraft,
  type FormPromoType,
  type PromoDraft,
} from "../promoDraft";
import { CoretItemsEditor } from "./CoretItemsEditor";
import { PromoInfoPanel } from "./PromoInfoPanel";
import { PromoPreview } from "./PromoPreview";
import { PromoRestrictionsPanel } from "./PromoRestrictionsPanel";
import { TieredPreview } from "./TieredPreview";
import { TieredRuleEditor } from "./TieredRuleEditor";

/** The line under the page title, per type (mockup `formShell` desc). */
const TYPE_DESCRIPTION: Record<FormPromoType, string> = {
  coret:
    "Harga promo per item atau per varian. Harga normal tampil dicoret di kasir dan website selama periode promo.",
  tiered: "Makin banyak item dari kelompok yang sama, makin besar diskonnya.",
};

/**
 * Buat / ubah promo — Harga coret or Diskon bertingkat — a full page with a sticky preview on the
 * right (BO mockup `coretForm`, the layout of MembershipPlanForm).
 *
 * Info promo · Item dan harga promo (coret) or Syarat + Tingkatan diskon
 * (bertingkat) · Batasan on the left; the preview says
 * back, as the till will show it, what the fields add up to.
 *
 * `promo.locked` (used at least once): items and prices are read-only and left
 * out of the PATCH — the server refuses to change them. An ENDED promo
 * (period over, or stopped) is read-only throughout: there is nothing left
 * for it to do, and a stopped one cannot be edited at all.
 */
export function PromoForm({ promo, type = "coret" }: { promo?: Promo; type?: FormPromoType }) {
  const router = useRouter();
  const editing = Boolean(promo);
  const readOnly = promo?.status === "ended";
  const locked = Boolean(promo?.locked);

  const [draft, setDraft] = useState<PromoDraft>(() => {
    const today = isoDate(new Date());
    return promo ? promoToDraft(promo, today) : emptyPromoDraft(today, type);
  });
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const tiered = draft.type === "tiered";
  const factsOf = useItemFacts(draft.items);
  const groupFactsOf = useItemFacts(tiered ? draft.group.slice(0, 2) : []);
  const set = (patch: Partial<PromoDraft>) => setDraft((current) => ({ ...current, ...patch }));

  const blockedReason = readOnly ? "Promo yang sudah berakhir tidak bisa diubah" : promoBlockedReason(draft);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (blockedReason) return;
    setSubmitting(true);
    setFieldErrors({});

    try {
      if (editing) {
        await promoService.update(promo!.id, draftToUpdate(draft, { locked }));
        swalToast("Promo tersimpan.", "success");
      } else {
        await promoService.create(draftToCreate(draft));
        swalToast(draft.draft ? "Promo disimpan sebagai draft." : "Promo dibuat.", "success");
      }
      router.push(PROMO_HREF);
      router.refresh();
    } catch (err) {
      const failure = promoFailure(err, "Gagal menyimpan promo. Coba lagi.");
      swalToast(failure.toast, "error", 6000);
      setFieldErrors(failure.fieldErrors);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6" noValidate>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Breadcrumb
            items={[
              { label: "Promosi", href: PROMOSI_SUMMARY_HREF },
              { label: "Promo", href: PROMO_HREF },
              { label: editing ? promo!.code : "Baru" },
            ]}
          />
          <h1 className="mt-1 text-2xl font-extrabold">
            {editing ? promo!.name : `${PROMO_TYPE_LABEL[draft.type]} baru`}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">{TYPE_DESCRIPTION[draft.type]}</p>
        </div>

        <FormActionBar
          className="ml-auto"
          submitLabel="Simpan promo"
          submitting={submitting}
          disabled={Boolean(blockedReason)}
          blockedReason={blockedReason}
          cancelHref={PROMO_HREF}
        />
      </div>

      {readOnly && (
        <div className="flex items-start gap-2 rounded-xl bg-tint-neutral p-4 text-sm">
          <Lock className="mt-0.5 size-4 flex-none text-muted" aria-hidden />
          <p>
            Promo ini sudah {promoStatusLabel(promo!).toLowerCase()}, jadi hanya bisa dilihat. Buat
            promo baru kalau ingin menjalankannya lagi.
          </p>
        </div>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <PromoInfoPanel
            draft={draft}
            onChange={set}
            errors={fieldErrors}
            readOnly={readOnly}
            draftLocked={locked}
          />
          {tiered ? (
            <TieredRuleEditor
              group={draft.group}
              tiers={draft.tiers}
              onChange={set}
              locked={locked}
              readOnly={readOnly}
            />
          ) : (
            <CoretItemsEditor
              items={draft.items}
              onChange={(items) => set({ items })}
              factsOf={factsOf}
              locked={locked}
              readOnly={readOnly}
            />
          )}
          <PromoRestrictionsPanel
            draft={draft}
            onChange={set}
            errors={fieldErrors}
            readOnly={readOnly}
          />
        </div>

        <div className="lg:sticky lg:top-20">
          {tiered ? (
            <TieredPreview draft={draft} factsOf={groupFactsOf} />
          ) : (
            <PromoPreview draft={draft} factsOf={factsOf} />
          )}
        </div>
      </div>
    </form>
  );
}
