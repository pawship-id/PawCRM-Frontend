"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { OPERATING_DAYS, type OperatingDay } from "@/types/api";

import { DAY_LABELS, formatOperatingDays, sortDays } from "../hours";

/**
 * WHICH DAYS THIS BRANCH IS OPEN — seven checkboxes, Monday first.
 *
 * SEVEN BOXES RATHER THAN THE MOCKUP'S RANGE PICKER ("Senin – Minggu",
 * "Senin – Sabtu", …). A shop closed on Wednesday AND Sunday exists, and a
 * picker offering four ranges cannot say so — it would send that shop looking
 * for the option that describes it and then picking the nearest wrong one. The
 * summary underneath prints the range when the ticked days ARE one, so the
 * common case still reads the way the mockup draws it.
 *
 * NONE TICKED MEANS UNRECORDED, not closed: a branch that is not open on any day
 * is what `isActive: false` says, and says better. The caption says so rather
 * than leaving an empty row to be read as "closed every day".
 */
export function OperatingDaysField({
  value,
  onChange,
  disabled,
}: {
  value: OperatingDay[];
  onChange: (days: OperatingDay[]) => void;
  disabled?: boolean;
}) {
  const summary = formatOperatingDays(value);

  function toggle(day: OperatingDay, checked: boolean) {
    onChange(
      sortDays(checked ? [...value, day] : value.filter((d) => d !== day)),
    );
  }

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium text-foreground">
        Hari operasional
      </legend>

      <div className="flex flex-wrap gap-x-5 gap-y-2">
        {OPERATING_DAYS.map((day) => (
          <div key={day} className="flex min-h-11 items-center gap-2">
            <Checkbox
              id={`day-${day}`}
              checked={value.includes(day)}
              onCheckedChange={(checked) => toggle(day, checked === true)}
              disabled={disabled}
            />
            <Label htmlFor={`day-${day}`} className="font-normal">
              {DAY_LABELS[day]}
            </Label>
          </div>
        ))}
      </div>

      <p className="text-xs text-muted">
        {summary
          ? `Tercatat buka ${summary}.`
          : "Belum diisi. Kosong berarti belum dicatat, bukan tutup setiap hari — cabang yang tutup ditandai lewat status Aktif."}
      </p>
    </fieldset>
  );
}
