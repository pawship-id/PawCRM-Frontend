/*
  DIBUAT OTOMATIS oleh automation/build-guide-web.mjs dari automation/manuals/*.md.
  Jangan ubah file di folder ini dengan tangan: perubahan akan tertimpa. Ubah
  naskah manualnya, lalu jalankan `npm run guide-web` di automation/.
*/
import type { HelpModule, HelpRelease } from "@/features/help/types";

import mulai from "./mulai.json";
import pengaturanUmum from "./pengaturan-umum.json";
import pengaturanKeuangan from "./pengaturan-keuangan.json";
import pengaturanSistem from "./pengaturan-sistem.json";
import dataAwal from "./data-awal.json";
import inventori from "./inventori.json";
import pelanggan from "./pelanggan.json";
import layanan from "./layanan.json";
import booking from "./booking.json";
import kasir from "./kasir.json";
import penjualan from "./penjualan.json";
import pembelian from "./pembelian.json";
import promosi from "./promosi.json";
import keuangan from "./keuangan.json";
import laporan from "./laporan.json";
import groomer from "./groomer.json";
import version from "./version.json";

export const HELP_RELEASE: HelpRelease = version;

export const HELP_MODULES: HelpModule[] = [
  mulai,
  pengaturanUmum,
  pengaturanKeuangan,
  pengaturanSistem,
  dataAwal,
  inventori,
  pelanggan,
  layanan,
  booking,
  kasir,
  penjualan,
  pembelian,
  promosi,
  keuangan,
  laporan,
  groomer,
];
