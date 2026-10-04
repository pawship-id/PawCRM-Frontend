import { membershipFailure } from "@/features/memberships/errors";
import { ApiError } from "@/services/api-error";

/**
 * `membershipFailure` — apa yang dibaca orang saat form membership ditolak.
 *
 * Yang paling perlu dijaga di sini adalah NORMALISASI JALUR. Joi melaporkan
 * indeks larik dengan titik (`benefits.0.label`) sementara `BenefitEditor`
 * mencari yang berkurung (`benefits[0].label`), jadi tanpa itu setiap penolakan
 * Joi atas sebuah benefit hilang tanpa menandai field mana pun.
 */
describe("membershipFailure", () => {
  const validation = (details: { field: string; message: string }[]) =>
    new ApiError("Validation failed", 400, { details });

  it("memakai pesan itu sendiri saat hanya satu isian yang salah", () => {
    const failure = membershipFailure(
      validation([{ field: "body.name", message: "Nama paket wajib diisi" }]),
      "Gagal.",
    );

    expect(failure.toast).toBe("Nama paket wajib diisi");
    expect(failure.fieldErrors).toEqual({ name: "Nama paket wajib diisi" });
  });

  it("menghitung saja saat banyak, karena semuanya sudah menempel di field", () => {
    const failure = membershipFailure(
      validation([
        { field: "body.name", message: "Nama paket wajib diisi" },
        { field: "body.code", message: "Kode wajib diisi" },
        { field: "body.price", message: "Harga wajib diisi" },
      ]),
      "Gagal.",
    );

    expect(failure.toast).toBe(
      "Ada 3 isian yang belum benar — lihat tanda merah di formulir.",
    );
  });

  /* Inilah bug yang diperbaiki: tanpa ini, errornya tidak menempel ke mana pun. */
  it("mengubah indeks bertitik dari Joi menjadi berkurung seperti yang dicari editor", () => {
    const failure = membershipFailure(
      validation([
        { field: "body.benefits.0.label", message: "Nama benefit wajib diisi" },
        {
          field: "body.benefits.2.quota",
          message: "Jatah harus diisi berpasangan",
        },
      ]),
      "Gagal.",
    );

    expect(Object.keys(failure.fieldErrors).sort()).toEqual([
      "benefits[0].label",
      "benefits[2].quota",
    ]);
  });

  it("membiarkan jalur berkurung dari lapisan service apa adanya", () => {
    const failure = membershipFailure(
      new ApiError("Benefit belum benar", 400, {
        details: [
          {
            field: "benefits[0].scope",
            message: "Pilih minimal satu layanan, produk, kategori",
          },
        ],
      }),
      "Gagal.",
    );

    expect(failure.fieldErrors["benefits[0].scope"]).toBe(
      "Pilih minimal satu layanan, produk, kategori",
    );
    expect(failure.toast).toBe("Pilih minimal satu layanan, produk, kategori");
  });

  it("menggantikan 'Validation failed' yang berbahasa Inggris saat tidak ada rincian", () => {
    const failure = membershipFailure(
      new ApiError("Validation failed", 400, { details: [] }),
      "Gagal.",
    );

    expect(failure.toast).toBe("Ada isian yang belum benar.");
  });

  it("merangkai alasan sebuah konflik di belakang judulnya", () => {
    const failure = membershipFailure(
      new ApiError("Kode paket sudah dipakai", 409, {
        reason: '"VIP" sudah dipakai paket Paket VIP',
      }),
      "Gagal.",
    );

    expect(failure.toast).toBe(
      'Kode paket sudah dipakai — "VIP" sudah dipakai paket Paket VIP',
    );
  });

  it("menyebut koneksi saat permintaannya tidak sampai ke server", () => {
    expect(membershipFailure(ApiError.network(), "Gagal.").toast).toBe(
      "Tidak bisa menghubungi server. Cek koneksinya, lalu coba lagi.",
    );
  });

  it("memakai kalimat cadangan untuk kesalahan yang bukan dari API", () => {
    expect(membershipFailure(new Error("boom"), "Gagal menyimpan.").toast).toBe(
      "Gagal menyimpan.",
    );
  });
});
