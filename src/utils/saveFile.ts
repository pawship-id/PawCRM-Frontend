/**
 * Hands the browser a file to save.
 *
 * The object URL is revoked immediately: the anchor click is synchronous into the
 * browser's download manager, and one left behind pins the whole blob in memory.
 */
export function saveFile(file: Blob, name: string): void {
  const url = URL.createObjectURL(file);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}
