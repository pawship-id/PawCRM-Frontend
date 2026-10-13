import { ApiError } from "@/services/api-error";
import { keyedSaveFailureMessage } from "./idempotency";

/**
 * The most products one transfer may carry — the server's `MAX_ITEMS`
 * (stockTransfer.model.js), checked here so the form says so while somebody is
 * still adding rows, rather than after Simpan as an English validation error.
 */
export const TRANSFER_MAX_ITEMS = 50;

export type TransferAct = "buat" | "ubah" | "terima" | "batal";

/**
 * What to tell somebody whose transfer write did not answer.
 *
 * A TIMEOUT IS NOT A FAILURE. The browser stopped waiting; the server did not
 * stop working, and the goods may already have moved.
 *
 * A NEW transfer may simply be saved again: the form keeps its idempotency key
 * across a failed attempt, and the server returns the transfer that key already
 * made — even when the first save is still running (a unique index on the key).
 * An edit, receive or cancel carries no such key, so for those the message says
 * what to check first. Every other refusal is the server's own sentence.
 */
export function transferFailureMessage(
  error: unknown,
  act: TransferAct,
): string {
  if (error instanceof ApiError && error.isTimeout) {
    if (act === "buat") {
      return keyedSaveFailureMessage(error, "Simpan transfer");
    }

    const what =
      act === "terima"
        ? "penerimaannya"
        : act === "batal"
          ? "pembatalannya"
          : "perubahannya";

    return `Server belum menjawab, tapi ${what} mungkin sudah tercatat. Cek halaman transfer dulu sebelum mencoba lagi, supaya tidak tercatat dua kali.`;
  }

  return error instanceof ApiError
    ? error.fullMessage
    : "Terjadi kesalahan. Coba lagi.";
}
