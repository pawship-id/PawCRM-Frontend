"use client";

import { Button } from "@/components/ui/button";

/**
 * "TANPA MEMBER" / "PAKAI MEMBER" FOR ONE ADD-ON (22 October 2026).
 *
 * A text button beside the add-on's member label: the counter may agree an
 * add-on is billed at its normal price although a member benefit fits it.
 * Saved on the booking (`noMemberBenefitAddonIds`) and honoured by the till.
 *
 * THE MAIN SERVICE WEARS IT TOO (22 October 2026) — `BookingBenefitField`,
 * when the quote offers exactly one candidate; there it sets
 * `plannedBenefit` to null and back. `addonName` is then the service's name.
 *
 * The link-button pattern (`variant="link"`, `min-h-11`) for the 44px hit
 * area (ui-rules §1.5). It can sit inside a `CheckRow`'s label, so the click
 * is kept from reaching the label and toggling the add-on's box.
 */
export function AddonMemberToggle({
  optedOut,
  addonName,
  disabled,
  onToggle,
}: {
  optedOut: boolean;
  addonName: string;
  disabled?: boolean;
  /** `true` — set the add-on to "Tanpa member". */
  onToggle: (optOut: boolean) => void;
}) {
  const text = optedOut ? "Pakai member" : "Tanpa member";

  return (
    <Button
      type="button"
      variant="link"
      data-addon-member-toggle
      aria-label={`${text} untuk ${addonName}`}
      className="h-auto min-h-11 px-0 py-0 text-xs font-semibold"
      disabled={disabled}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onToggle(!optedOut);
      }}
    >
      {text}
    </Button>
  );
}
