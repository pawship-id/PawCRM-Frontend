/**
 * The banner both accounting screens open with.
 *
 * IT IS NOT DECORATION. These two tables look exactly like the ones that will
 * render real books, and a chart of accounts or a ledger balance read off a
 * fixture is the kind of number somebody quotes in a meeting. Saying so on the
 * page — next to the data, not in a commit message — is the cheapest way to stop
 * that, and it disappears in one commit when the screens are wired to the API.
 */
export function DummyNotice({ endpoint }: { endpoint: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-accent/40 px-4 py-3 text-xs text-muted">
      <b className="text-foreground">Tampilan contoh.</b> Angka di halaman ini
      masih data dummy di frontend. Endpoint{" "}
      <code className="tabular-nums text-[11px] text-foreground">{endpoint}</code>{" "}
      sudah tersedia di backend dan belum disambungkan, jadi tombol aksi belum
      aktif.
    </div>
  );
}
