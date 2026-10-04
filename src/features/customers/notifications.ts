import type { Customer, CustomerNotifications } from "@/types/api";

/**
 * Which automatic messages a customer has agreed to — resolved, never read raw.
 *
 * ⚠️ `customer.notifications` MAY NOT BE THERE AT ALL, which is what this
 * module exists for (28 September 2026). The field has schema defaults on the
 * backend, but the API's reads use `.lean()` and `.lean()` SKIPS DEFAULTS — so
 * every customer written before the field arrived comes back with no
 * `notifications` key. On this database that is 9 customers out of 10.
 *
 * It crashed `CustomerProfileScreen`'s Consents outright
 * ("Cannot read properties of undefined"), and it did something quieter and
 * worse in the edit form: spreading an absent object left all three flags
 * `undefined`, the checkboxes drew as unticked, and SAVING re-wrote them as
 * `false` — opting a customer out of booking reminders they had never been
 * asked about.
 *
 * ⚠️ THE DEFAULTS ARE NOT `false`. They mirror `customer.model.js`: the two
 * service messages are ON and marketing is OFF. "No record" means the shop
 * never asked, and the honest reading of that is the default the model would
 * have written — not a refusal the customer never gave.
 *
 * MERGED PER FIELD rather than substituted wholesale, so a half-written
 * document (one flag stored, two missing) resolves each flag on its own.
 */
export const DEFAULT_CUSTOMER_NOTIFICATIONS: CustomerNotifications = {
  bookingReminder: true,
  membershipRenewal: true,
  promo: false,
};

export function customerNotifications(
  customer: Pick<Customer, "notifications">,
): CustomerNotifications {
  return { ...DEFAULT_CUSTOMER_NOTIFICATIONS, ...(customer.notifications ?? {}) };
}
