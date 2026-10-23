import type { PosItemInput, PosTransaction } from "@/types/api";

import { ownDiscountOf } from "../bookingDiscount";

/**
 * The basket as the payload a cart write sends — every line, with everything
 * the server would otherwise lose on the next write. A pure function of the
 * cart (POS offline mode, 19 October 2026: the offline till builds its own
 * basket from a server one with it, and the sync sends exactly this).
 */
export function cartItemsAsInput(cart: PosTransaction | null): PosItemInput[] {
  return (cart?.items ?? []).map((item) => ({
    kind: item.kind,
    refId: item.refId,
    qty: item.qty,
    /*
      A TYPED PRICE IS RE-SENT, OR IT EVAPORATES (28 September 2026).

      The server rebuilds every line from this payload on each write, so an
      override left out of the next one — stepping the quantity of a bag of
      feed three lines down — would quietly put this line back to the shelf
      price with nothing on screen saying so.

      `listPrice` IS THE FLAG. It is non-null only when the two differ, so
      this sends a price exactly for the lines that have one and leaves
      every ordinary line alone — which matters, because sending a price at
      all is what makes the server ask for `posTransactions:setPrice`.
    */
    ...(item.listPrice ? { unitPrice: item.unitPrice } : {}),
    /*
      THE LOT AND THE LINE NOTE, SENT BACK (8 October 2026). Same reason as
      the price above: the server rebuilds every line from this payload, so
      a lot or a note left out of the next write — stepping the quantity of
      something else — would quietly fall off this line, and the sale would
      then take from whichever lot FEFO likes instead of the one the cashier
      picked off the shelf.
    */
    ...(item.lots?.length
      ? {
          lots: item.lots.map(({ batchId, qty }) => ({ batchId, qty })),
        }
      : {}),
    ...(item.note ? { note: item.note } : {}),
    /*
      THE LINE'S OWN DISCOUNT, never the whole of it. A booking's share of
      "Diskon seluruh booking" rides inside the stored figure, and the server
      adds it back from the booking — sending it too would count it twice.
    */
    discount: (() => {
      const own = ownDiscountOf(item);
      return own
        ? {
            mode: own.mode,
            value: own.value,
            ...(own.approvedBy ? { approvedBy: own.approvedBy } : {}),
          }
        : null;
    })(),
    /*
      THE MEMBERSHIP BENEFIT, SENT BACK (30 September 2026). Same reason as
      the typed price above and the journey below: the server rebuilds every
      line from this payload on each write, so a benefit left out of the
      next one would quietly fall off the moment the cashier stepped the
      quantity of a bag of feed three lines down — and the customer would be
      charged full price for something they had already been told was free.

      `discount.source` IS THE FLAG, the way `listPrice` is the flag for an
      overridden price: it is `membership` only on a line a card paid for.
      TWO IDS AND NOTHING ELSE go back — the server re-reads the card and
      re-prices it, so a stale amount on this side can never become money.
    */
    ...(item.discount?.source === "membership" &&
    item.discount.membershipId &&
    item.discount.benefitId
      ? {
          benefit: {
            membershipId: item.discount.membershipId,
            benefitId: item.discount.benefitId,
          },
        }
      : {}),
    bookingId: item.bookingId,
    /*
      THE TRIP A FEE LINE BILLS, SENT BACK (11 October 2026). Left out, the
      server reads the line as a "Biaya Kunjungan" typed by hand and refuses
      the whole write — the next tap on anything in the basket would fail.
    */
    ...(item.homeTripId ? { homeTripId: item.homeTripId } : {}),
    petId: item.petId,
    petName: item.petName,
    groomerName: item.groomerName,
    /*
      WHAT THE LINE WAS PRICED ON, SENT BACK (17 September 2026). The server
      rebuilds every line from this payload on each write, so a walk-in
      grooming at home whose "Lokasi" were left out would be refused — or
      re-priced — the moment the cashier changed the quantity of a bag of
      feed. The snapshot's name and label are for reading; the server wants
      only the pair.
    */
    ...(item.variantChoices?.length
      ? {
          variantChoices: item.variantChoices.map(({ optionId, code }) => ({
            optionId,
            code,
          })),
        }
      : {}),
    /*
      THE JOURNEY THE LINE IS, SENT BACK (24 September 2026). Same reason as
      the choices above: the server rebuilds every line from this payload on
      each write, and a ride whose two ends were left out would be re-priced
      from the customer's stored pin the moment somebody changed the
      quantity of a bag of feed — a different fare, for a journey nobody
      re-agreed. The response nests each end; the wire is flat.
    */
    ...(item.trip
      ? {
          trip: {
            leg: item.trip.leg,
            origin: {
              address: item.trip.origin?.address ?? null,
              lat: item.trip.origin?.lat as number,
              lng: item.trip.origin?.lng as number,
            },
            destination: {
              address: item.trip.destination?.address ?? null,
              lat: item.trip.destination?.lat as number,
              lng: item.trip.destination?.lng as number,
            },
          },
          linkedBookingIds: item.linkedBookingIds ?? [],
          passengerPetIds: item.passengerPetIds ?? [],
        }
      : {}),
  }));
}
