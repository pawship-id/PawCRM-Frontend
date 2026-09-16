import type { PaymentChannelType } from "@/types/api";

/**
 * The words the four channel types wear, and the order they are read in.
 *
 * THE LIST HOOK THAT USED TO LIVE HERE IS GONE (16 September 2026). Kas & Bank
 * stopped being a settings list with its own search and type filter and became
 * the mockup's table — channels beside what moved through them — which
 * `useCashAccounts` fetches in one go along with the summary and the balances.
 * What is left is the vocabulary, which was always the half other modules
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
