import { ApiError } from "@/services/api-error";

/**
 * Satu penolakan dari API membership, siap dipakai layar: satu kalimat untuk
 * toast, dan pesan per field untuk ditempel di bawah isiannya.
 *
 * ─── KENAPA ADA, PADAHAL `ApiError.fullMessage` SUDAH ADA ──────────────────
 *
 * `fullMessage` merangkai NAMA FIELD API ke dalam kalimatnya ("code Kode wajib
 * diisi") — berguna sebagai jaring pengaman umum, tapi yang terbaca jadi
 * setengah istilah teknis. Di sini nama field-nya dibuang: pesannya sendiri
 * sudah menyebut isian mana, karena skema Joi membership diberi `.label()`
 * berbahasa Indonesia (`validations/common.validation.js`).
 *
 * ⚠️ `"Validation failed"` MASIH BAHASA INGGRIS DAN MEMANG DIBIARKAN di
 * backend: itu pesan milik middleware validasi yang dipakai SELURUH modul, dan
 * menggantinya dari sini akan mengubah setiap modul lain sekaligus. Diganti di
 * sini saja, untuk membership.
 */
export interface MembershipFailure {
  /** Satu kalimat untuk `swalToast(…, "error")`. */
  toast: string;
  /** Pesan per field, jalurnya sudah dinormalkan — lihat `bracketed`. */
  fieldErrors: Record<string, string>;
}

/**
 * `benefits.0.label` → `benefits[0].label`.
 *
 * DUA SUMBER MENULIS JALUR DENGAN DUA CARA. Joi melaporkan jalurnya lewat
 * `path.join(".")`, jadi indeks larik jadi ruas bertitik; lapisan service
 * menyusun sendiri `benefits[${index}].scope` dengan kurung. `BenefitEditor`
 * mencari yang berkurung — jadi tanpa normalisasi ini, setiap penolakan Joi
 * atas sebuah benefit (nama kosong, jenis kosong, persentase di atas 100)
 * hilang tanpa jejak: toast-nya muncul, tapi tidak ada satu pun field yang
 * ditandai merah.
 */
function bracketed(field: string): string {
  return field.replace(/\.(\d+)(?=\.|$)/g, "[$1]");
}

/** Pesan bawaan middleware validasi, yang berlaku untuk semua modul. */
const GENERIC = "Validation failed";

export function membershipFailure(
  error: unknown,
  /** Kalimat untuk kegagalan yang bukan dari API — mis. "Gagal menyimpan paket." */
  fallback: string,
): MembershipFailure {
  if (!(error instanceof ApiError)) return { toast: fallback, fieldErrors: {} };

  if (error.isNetworkError) {
    return {
      toast: "Tidak bisa menghubungi server. Cek koneksinya, lalu coba lagi.",
      fieldErrors: {},
    };
  }

  const fieldErrors = Object.fromEntries(
    Object.entries(error.fieldErrors).map(([field, message]) => [
      bracketed(field),
      message,
    ]),
  );

  const messages = Object.values(fieldErrors);

  /*
    SATU MASALAH DISEBUTKAN UTUH; BANYAK MASALAH DIHITUNG SAJA. Menumpuk lima
    kalimat ke dalam satu toast yang hilang dalam lima detik adalah cara membuat
    orang tidak membaca satu pun — dan setiap kalimat itu toh sudah menempel di
    bawah isiannya masing-masing.
  */
  if (messages.length === 1) return { toast: messages[0], fieldErrors };
  if (messages.length > 1) {
    return {
      toast: `Ada ${messages.length} isian yang belum benar — lihat tanda merah di formulir.`,
      fieldErrors,
    };
  }

  const headline = error.message === GENERIC ? "Ada isian yang belum benar." : error.message;

  return {
    toast: error.reason ? `${headline} — ${error.reason}` : headline,
    fieldErrors,
  };
}
