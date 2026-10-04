import type { PaymentChannelType } from "@/types/api";

/**
 * The words the four channel types wear, and the order they are read in.
 *
 * NO HOOK LIVES HERE ANY MORE, which is why the file is no longer called
 * `hooks/usePaymentChannels.ts`. The list hook it was named for went when Kas &
 * Bank absorbed the screen (16 September 2026); the screen came back to
 * Pengaturan on 20 September with a hook of its own, `usePaymentChannelList`,
 * and left the vocabulary here — which was always the half other modules
 * borrowed.
 *
 * No `"use client"`: two constants need no runtime, and the POS panel imports
 * them into both trees.
 */

/** Indonesian labels for the four tabs. The visible word is copy, not the API's value. */
export const CHANNEL_TYPE_LABELS: Record<PaymentChannelType, string> = {
  cash: "Tunai",
  transfer: "Transfer",
  qris: "QRIS",
  edc: "EDC",
  // Pay-out only — a giro is a post-dated cheque a business WRITES.
  giro: "Giro",
};

/** The order the POS panel renders its tabs, and this screen its groups. */
export const CHANNEL_TYPE_ORDER: PaymentChannelType[] = [
  "cash",
  "transfer",
  "qris",
  "edc",
];
