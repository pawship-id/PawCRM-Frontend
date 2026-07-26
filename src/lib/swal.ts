import Swal from "sweetalert2";

/**
 * Themed SweetAlert2 toast.
 *
 * A small auto-dismissing notification pinned to the top-right — used for
 * success/error feedback after an action (and, for create, after the redirect
 * so it rides along on the next screen). Colours are SweetAlert's defaults
 * (green success / red error).
 */
export function swalToast(
  title: string,
  icon: "success" | "error" = "success",
) {
  return Swal.fire({
    toast: true,
    position: "top-end",
    icon,
    title,
    showConfirmButton: false,
    timer: 3000,
    timerProgressBar: true,
  });
}
