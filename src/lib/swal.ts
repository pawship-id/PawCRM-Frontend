import Swal from "sweetalert2";

/**
 * Themed SweetAlert2 toast.
 *
 * A small auto-dismissing notification pinned to the top-right — used for
 * success/error feedback after an action (and, for create, after the redirect
 * so it rides along on the next screen). Colours are SweetAlert's defaults
 * (green success / red error).
 *
 * `timer` IS OPTIONAL AND DEFAULTED, so no existing call site changes. It exists
 * because a refusal a user has to ACT on is not the same length of read as
 * "Tersimpan": "somebody else paid this while you were recording it — reload and
 * check the balance" does not fit in three seconds, and a toast that vanishes
 * mid-sentence is worse than one that never appeared. Pass a longer one for
 * anything carrying an instruction.
 */
export function swalToast(
  title: string,
  icon: "success" | "error" = "success",
  timer = 3000,
) {
  return Swal.fire({
    toast: true,
    position: "top-end",
    icon,
    title,
    showConfirmButton: false,
    timer,
    timerProgressBar: true,
  });
}
