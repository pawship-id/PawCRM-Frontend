/**
 * The one reason a document sheet cannot be saved yet, said with the row it is
 * about.
 *
 * "Pilih batch dulu." is unanswerable on a sheet of twenty lines. It names a
 * rule, which the reader already agrees with, and leaves them to find which of
 * twenty rows broke it — so the message that exists to unblock somebody is the
 * thing making them hunt. On a sheet of two it is merely annoying; the forms
 * these run under take up to two hundred.
 *
 * The key already carries the answer. Every per-line rule files its complaint
 * under `line.<productId>.<field>`, so the product — variant name included, as
 * the Produk column spells it — is one lookup away.
 *
 * ONE MESSAGE, NOT A LIST, and deliberately. A sheet mid-typing has a complaint
 * on nearly every row; printing all of them under the button is a wall that says
 * "you have done nothing right" to somebody halfway through doing it right. The
 * first is the topmost unfinished thing, which is where they were heading
 * anyway, and the next appears as soon as it is fixed.
 */
export function blockingReason(
  errors: Record<string, string>,
  nameOf: (productId: string) => string | undefined,
): string | null {
  const [key, message] = Object.entries(errors)[0] ?? [];

  if (message === undefined) return null;
  // A header rule — gudang, cabang, tanggal, alasan. There is one of each on the
  // form, so naming it would only repeat the label the reader is looking at.
  if (!key.startsWith("line.")) return message;

  const name = nameOf(key.slice("line.".length, key.lastIndexOf(".")));

  return name === undefined ? message : `${name} - ${message}`;
}
