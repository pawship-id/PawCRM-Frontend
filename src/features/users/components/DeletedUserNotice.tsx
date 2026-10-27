import { Alert } from "@/components";

/**
 * Said at the top of every editable card on the edit screen of a soft-deleted
 * user. The API refuses every write to a deleted user (404), so each card is
 * locked rather than letting a save fail; the only way forward is Zona
 * berbahaya › Pulihkan pengguna.
 */
export function DeletedUserNotice() {
  return (
    <Alert variant="info">
      Pengguna ini sudah dihapus. Pulihkan dulu di Zona berbahaya supaya bisa diubah.
    </Alert>
  );
}
