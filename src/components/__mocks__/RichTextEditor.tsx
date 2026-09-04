/**
 * A stand-in for the TipTap editor, for suites that mount a form containing one
 * without ever driving it.
 *
 * WHY THIS EXISTS. `RichTextEditor` builds a full ProseMirror instance — schema,
 * plugins, keymaps, a contenteditable — on every mount. `ProductForm.test.tsx`
 * mounts the form 88 times and touches the editor in exactly none of them, so
 * the suite was paying for 88 ProseMirror constructions to test a SKU field.
 * That is most of why it ran for 40 seconds alone and timed out under a parallel
 * run.
 *
 * IT IS A REAL TEXTAREA, not an empty div, and that is deliberate: the mock
 * stands in for the FIELD, not for nothing. A test that does want to type a
 * description can, `value`/`onChange` behave, and the accessible name matches —
 * so a suite reaching for it finds something rather than silently asserting
 * against a hole.
 *
 * WHAT IT COSTS, stated plainly: the editor's own behaviour — link insertion,
 * image upload, the sanitising second barrier in `RichTextView` — is covered by
 * no test today, and this does not change that. Mounting a component is not
 * testing it, so nothing was lost here; the gap was already there and is now
 * visible. A `RichTextEditor.test.tsx` that drives the real thing is the fix,
 * and it belongs to whoever next touches that component.
 */
export function RichTextEditor({
  value,
  onChange,
  ariaLabel = "Deskripsi produk",
}: {
  value?: string | null;
  onChange?: (html: string) => void;
  ariaLabel?: string;
}) {
  return (
    <textarea
      aria-label={ariaLabel}
      value={value ?? ""}
      onChange={(event) => onChange?.(event.target.value)}
    />
  );
}

/** The read-only counterpart. Renders the stored HTML as text. */
export function RichTextView({ html }: { html?: string | null }) {
  return <div data-testid="rich-text-view">{html ?? ""}</div>;
}
