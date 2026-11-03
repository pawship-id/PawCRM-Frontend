/**
 * HOW FAR A BACKGROUND JOB GOT — `done` of `total`, as a bar a screen reader
 * can read. Promoted on its second user (opname imports, then the product bulk
 * update); the words around it stay each screen's own.
 */
export function JobProgressBar({
  done,
  total,
  label,
}: {
  done: number;
  total: number;
  label: string;
}) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={done}
      className="mt-2 flex h-2 overflow-hidden rounded-full bg-navy-100"
    >
      <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
    </div>
  );
}
