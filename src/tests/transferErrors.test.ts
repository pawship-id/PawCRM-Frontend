import { ApiError } from "@/services/api-error";
import {
  TRANSFER_MAX_ITEMS,
  transferFailureMessage,
} from "@/features/inventory/utils/transferErrors";

/**
 * A timed-out transfer write may still land on the server. Only a NEW transfer
 * — whose idempotency key the server enforces — may be saved again blind; the
 * rest must say to check first.
 */
const timeout = new ApiError("Request timed out after 60000ms", 0, {
  isNetworkError: true,
  isTimeout: true,
});

it("lets a NEW transfer be saved again — its key makes the retry harmless", () => {
  expect(transferFailureMessage(timeout, "buat")).toMatch(
    /Tekan Simpan transfer lagi.*tidak akan tercatat dua kali/,
  );
});

it("tells somebody to check before retrying an edit, receive or cancel", () => {
  expect(transferFailureMessage(timeout, "ubah")).toMatch(
    /perubahannya mungkin sudah tercatat.*cek halaman transfer dulu/i,
  );
  expect(transferFailureMessage(timeout, "terima")).toMatch(/penerimaannya/);
  expect(transferFailureMessage(timeout, "batal")).toMatch(/pembatalannya/);
});

it("passes the server's own refusal through unchanged", () => {
  const refused = new ApiError("Transfer TRF/2610/0001 sudah diterima", 409, {
    reason: "Muat ulang halaman.",
  });

  expect(transferFailureMessage(refused, "ubah")).toBe(refused.fullMessage);
  expect(transferFailureMessage(new Error("boom"), "buat")).toBe(
    "Terjadi kesalahan. Coba lagi.",
  );
});

it("matches the server's ceiling on products per transfer", () => {
  // MAX_ITEMS in PawCRM-Backend/src/models/stockTransfer.model.js.
  expect(TRANSFER_MAX_ITEMS).toBe(50);
});
