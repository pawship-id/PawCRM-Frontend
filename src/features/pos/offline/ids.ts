/** Ids the device mints itself (POS offline mode). */

function randomBytes(count: number): Uint8Array {
  const bytes = new Uint8Array(count);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < count; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  return bytes;
}

function base64url(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** The device's own id for a sale — what makes a resend recognisable. */
export function newClientTxnId(): string {
  return `ctx-${base64url(randomBytes(15))}`;
}

/**
 * The public receipt link's token, minted here so the QR on a slip printed
 * offline works once the sale reaches the server: 16 random bytes, base64url —
 * the same 22 characters `utils/receiptLink.js` mints.
 */
export function newReceiptToken(): string {
  return base64url(randomBytes(16));
}

/** A local basket's id — never a server id, so the two cannot be confused. */
export function newLocalCartId(): string {
  return `local-${base64url(randomBytes(9))}`;
}

export function isLocalId(id: string | null | undefined): boolean {
  return typeof id === "string" && id.startsWith("local-");
}
