/**
 * The status of one entry on a settings list — a pet option, a tahapan.
 *
 * Three states, every one a word (§9). Deleted outranks retired: a deleted
 * entry may also be inactive, and "Nonaktif" about a row that is gone from
 * every picker answers the less important half of the question.
 *
 * Moved out of PetOptionsTable when Tahapan became its second caller (14
 * September 2026).
 */
export function ListItemStatus({
  item,
}: {
  item: { deletedAt: string | null; isActive: boolean };
}) {
  if (item.deletedAt !== null) {
    return (
      <span className="rounded-full bg-tint-danger px-2 py-0.5 text-xs font-medium text-danger-ink">
        Dihapus
      </span>
    );
  }
  if (!item.isActive) {
    return (
      <span className="rounded-full bg-tint-neutral px-2 py-0.5 text-xs font-medium text-muted">
        Nonaktif
      </span>
    );
  }
  return (
    <span className="rounded-full bg-tint-success px-2 py-0.5 text-xs font-medium text-success">
      Aktif
    </span>
  );
}
