import type { CustomersQuery } from "./hooks/useCustomers";

/**
 * The URL's say in the first render of the Pelanggan register — today, only
 * `?createdSince=`, the Ringkasan tab's "Pelanggan baru" card drilling in.
 *
 * NO "use client" HERE, and that is the point of this file — mirrors
 * `cashTransactionsQueryFromParams`. The server page calls this directly;
 * inside a client hook's module it would reach the server only as a client
 * reference, which cannot be called.
 *
 * ANYTHING UNRECOGNISED IS DROPPED rather than sent on — a malformed date
 * would 400 the whole list, and a filter the screen cannot even show (there
 * is no "registered since" control) is worse than one it never applied.
 */
export function customersQueryFromParams(params: {
  createdSince?: string | string[];
}): Partial<CustomersQuery> {
  const initial: Partial<CustomersQuery> = {};

  const createdSince = Array.isArray(params.createdSince)
    ? params.createdSince[0]
    : params.createdSince;

  if (createdSince && !Number.isNaN(Date.parse(createdSince))) {
    initial.createdSince = createdSince;
  }

  return initial;
}
