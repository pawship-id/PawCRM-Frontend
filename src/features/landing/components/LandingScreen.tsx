import Link from "next/link";

import { Logo } from "@/components";
import { Button } from "@/components/ui/button";
import { env } from "@/utils/env";
import { CashierMock } from "./CashierMock";
import { FinancePanel } from "./FinancePanel";
import { LandingNav } from "./LandingNav";
import {
  ACCOUNTING_POINTS,
  ONBOARDING,
  PRINCIPLES,
  PROBLEMS,
  RELEASES,
  SCOPE,
  WHATSAPP_INTENTS,
  type WhatsappIntent,
} from "../content";

/** The page's one column width, shared by every band. */
const WRAP = "mx-auto w-full max-w-[1200px] px-5 sm:px-8";

/**
 * The section heading pair. Sized to the BRAND BOOK's marketing scale, not the
 * product scale in ui-rules §5 — the rule itself names the difference: the
 * book's 56/40/30 is drawn for a marketing page, and the product's tuned-down
 * scale exists because a screen with a breadcrumb, a title and a table on it
 * cannot carry a 40 px heading. This page has one heading per screenful.
 */
function SectionHead({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-11 max-w-[60ch]">
      <h2 className="text-[27px] font-extrabold text-balance sm:text-3xl lg:text-[40px] lg:leading-[1.12]">
        {title}
      </h2>
      <p className="mt-4 text-lg text-muted">{children}</p>
    </div>
  );
}

/**
 * Buloo's marketing page, at `/`.
 *
 * A SERVER COMPONENT except for the nav — nothing here needs state, and a
 * marketing page that ships a bundle to say five static things is the wrong
 * first impression for a product whose pitch is that it does not make you wait.
 *
 * ON THE ORANGE BUDGET. ui-rules §4 caps orange at ~5 % of a screen and says two
 * orange things visible at once means one is wrong. That rule is written for
 * money screens, and this page deliberately spends more of the budget than one:
 * the two calls to action, one bar, one alert panel and the onboarding block.
 * The cap it keeps is the one that matters — orange is never text (§13) and
 * every orange fill takes navy ink.
 */
export function LandingScreen() {
  /*
    ONE BUILDER, TWO INTENTS. The number is configuration
    (NEXT_PUBLIC_PHONE_NUMBER) because it changes without the page changing — a
    shop line, a new SIM, a second number for sales. Four hand-typed `wa.me` URLs
    is how one of them ends up pointing at the old number six months after it was
    cancelled.

    THE MESSAGE IS ENCODED, NOT PASTED. It carries newlines and a comma; an
    unencoded `?text=` truncates at the first one, and the person on the other
    end gets a greeting with the questions missing.
  */
  const whatsappHref = (intent: WhatsappIntent) =>
    `https://wa.me/${env.whatsappNumber}?text=${encodeURIComponent(
      WHATSAPP_INTENTS[intent],
    )}`;

  return (
    <div className="flex min-h-full flex-col bg-surface">
      <LandingNav />

      {/* ---------------------------------------------------------- hero -- */}
      <div className="relative overflow-hidden bg-primary text-primary-foreground">
        {/* Decorative only — the hero reads identically without them. */}
        <span
          aria-hidden
          className="pointer-events-none absolute -top-48 -left-40 size-[520px] rounded-full bg-white/10"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute top-32 -right-72 size-[640px] rounded-full bg-foreground/20"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute -bottom-48 right-[34%] size-[360px] rounded-full bg-secondary/20"
        />

        <div
          className={`${WRAP} relative grid items-center gap-12 py-16 lg:grid-cols-[1.02fr_0.98fr] lg:gap-16 lg:py-24`}
        >
          <div>
            <h1 className="max-w-[16ch] text-[34px] leading-[1.06] font-extrabold tracking-[-0.03em] text-balance sm:text-5xl lg:text-[54px]">
              Dicatat sekali di kasir. Sampai ke laba rugi sendiri.
            </h1>
            <p className="mt-5 max-w-[46ch] text-lg text-primary-foreground/80">
              Kasir, booking grooming, stok, pembelian, faktur, dan pembukuan
              jalan di satu alur. Begitu kasir menekan Bayar, stoknya berkurang
              dan jurnalnya sudah tertulis.
            </p>

            <div className="mt-7 flex flex-wrap gap-3">
              <Button
                asChild
                className="h-12 bg-secondary px-6 text-[15px] text-secondary-foreground hover:bg-secondary-hover max-sm:w-full"
              >
                <a href={whatsappHref("trial")}>Minta akses uji coba</a>
              </Button>
              <Button
                asChild
                variant="ghost"
                className="h-12 border-[1.5px] border-white/40 px-6 text-[15px] text-primary-foreground hover:bg-white/10 hover:text-primary-foreground max-sm:w-full"
              >
                <a href="#analitik">Lihat contoh layarnya</a>
              </Button>
            </div>

            <p className="mt-6 max-w-[46ch] text-sm leading-relaxed text-primary-foreground/65">
              Tanpa kartu kredit.{" "}
              <span className="font-semibold text-primary-foreground/90">
                Katalog lama masuk lewat Import Produk
              </span>{" "}
              — unduh templatenya, isi, lihat pratinjaunya dulu, baru disimpan.
              Stok awal dicatat di layarnya sendiri, bukan lewat penjualan palsu.
            </p>
          </div>

          <CashierMock />
        </div>
      </div>

      {/* ------------------------------------------------------- masalah -- */}
      <section id="masalah" className="scroll-mt-20 py-18 lg:py-26">
        <div className={WRAP}>
          <SectionHead title="Masalahnya jarang di jualannya. Biasanya di catatannya.">
            Lima hal yang paling sering terdengar dari belakang meja kasir.
            Kelimanya sudah punya tempat di Buloo, dan halaman ini menyebut di
            mana.
          </SectionHead>

          {/*
            NUMBERED, and the numbers are load-bearing: on a narrow screen the
            quote and its answer stack, and the number is what tells a reader
            which answer belongs to which complaint.
          */}
          <ol className="border-t border-border">
            {PROBLEMS.map((problem, index) => (
              <li
                key={problem.quote}
                className="grid items-start gap-2 border-b border-border py-6 md:grid-cols-2 md:gap-8"
              >
                <p className="flex gap-3 text-[17px] font-semibold">
                  <span className="shrink-0 pt-0.5 text-sm font-bold tabular-nums text-muted">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span>“{problem.quote}”</span>
                </p>
                <p className="max-w-[52ch] pl-8 text-[15px] text-muted md:pl-0">
                  {problem.answer}
                </p>
              </li>
            ))}
          </ol>

          <p className="mt-7 max-w-[62ch] text-[15px] text-muted">
            Tiap fase ditutup dengan{" "}
            <span className="font-semibold text-foreground">
              panduan uji coba yang dijalankan pemilik tokonya sendiri
            </span>{" "}
            — langkah per langkah, dengan alasan tiap layar berperilaku begitu.
            Bukan demo yang kami setir.
          </p>
        </div>
      </section>

      {/* -------------------------------------------------------- kenapa -- */}
      <section id="kenapa" className="scroll-mt-20 bg-background py-18 lg:py-26">
        <div className={WRAP}>
          <SectionHead title="Kami bukan yang paling banyak fiturnya. Kami yang paling sedikit angka gandanya.">
            Tiga prinsip yang membentuk hampir tiap keputusan di dalamnya, dan
            bukti masing-masing dari produk yang sedang jalan.
          </SectionHead>

          <ul className="grid gap-6 lg:grid-cols-3">
            {PRINCIPLES.map((principle) => (
              <li
                key={principle.title}
                className="rounded-xl border border-border bg-surface p-6"
              >
                <h3 className="text-xl leading-tight font-bold">
                  {principle.title}
                </h3>
                <p className="mt-2.5 text-[15px] text-muted">{principle.body}</p>
                <p className="mt-4 border-t border-dashed border-border pt-4 text-sm leading-relaxed text-primary">
                  <span className="font-semibold">Kelihatan di:</span>{" "}
                  {principle.proof}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ------------------------------------------------------ analitik -- */}
      <section id="analitik" className="scroll-mt-20 py-18 lg:py-26">
        <div className={WRAP}>
          <SectionHead title="Pembukuannya bukan pekerjaan terpisah. Ia hasil sampingan jualan.">
            Tidak ada langkah “input ke akuntansi” di akhir hari, karena tidak
            ada satu pun transaksi yang lolos tanpa jurnal.
          </SectionHead>

          <div className="grid items-center gap-12 lg:grid-cols-[0.92fr_1.08fr] lg:gap-14">
            <ul>
              {ACCOUNTING_POINTS.map((point) => (
                <li
                  key={point.title}
                  className="max-w-[52ch] border-t border-border py-3.5"
                >
                  <p className="text-base font-semibold">{point.title}</p>
                  <p className="text-[15px] text-muted">{point.body}</p>
                </li>
              ))}
            </ul>
            <FinancePanel />
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------- cakupan -- */}
      <section id="cakupan" className="scroll-mt-20 bg-background py-18 lg:py-26">
        <div className={WRAP}>
          <SectionHead title="Cara jualan petshop tidak cuma satu. Yang sudah jalan, disebut satu-satu.">
            Toko yang sama bisa jual makanan di rak, grooming per varian, dan
            kirim ke reseller — di kasir yang sama.
          </SectionHead>

          <ul className="grid gap-x-12 md:grid-cols-2">
            {SCOPE.map((item) => (
              <li key={item.title} className="border-t border-border py-4.5">
                <p className="text-base font-semibold">{item.title}</p>
                <p className="mt-0.5 max-w-[46ch] text-[15px] text-muted">
                  {item.body}
                </p>
              </li>
            ))}
          </ul>

          {/*
            SAYING WHAT IS NOT BUILT, on the page whose whole argument is that
            the product does not overstate itself. Hotel and E-commerce Sync are
            placeholders in the sidebar today and say so on their own screens;
            a landing page that listed them beside the ten above would be the
            first place a customer catches us being loose with a claim.
          */}
          <p className="mt-7 max-w-[62ch] text-[15px] text-muted">
            <span className="font-semibold text-foreground">
              Hotel dan E-commerce Sync belum jalan.
            </span>{" "}
            Keduanya sudah punya tempat di menu, dan layarnya mengatakan sendiri
            bahwa isinya belum ada. Penitipan yang dijual sebagai layanan sudah
            bisa ditagih lewat kasir hari ini — yang belum ada adalah papan
            kamarnya.
          </p>
        </div>
      </section>

      {/* ----------------------------------------------------- perubahan -- */}
      <section id="perubahan" className="scroll-mt-20 py-18 lg:py-26">
        <div className={WRAP}>
          <SectionHead title="Tiap bulan ada yang berubah, dan kami sebutkan apa.">
            Bukan “peningkatan performa dan perbaikan bug”. Ini empat rilis
            terakhir, apa adanya.
          </SectionHead>

          <div className="grid items-start gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:gap-14">
            <ol className="border-t border-border">
              {RELEASES.map((release) => (
                <li
                  key={release.title}
                  className="grid gap-1 border-b border-border py-5 sm:grid-cols-[150px_1fr] sm:gap-5"
                >
                  <time
                    dateTime={release.month}
                    className="pt-0.5 text-sm font-semibold tabular-nums text-muted"
                  >
                    {release.when}
                  </time>
                  <div>
                    <h3 className="text-[17px] font-bold">{release.title}</h3>
                    <p className="mt-0.5 max-w-[52ch] text-[15px] text-muted">
                      {release.body}
                    </p>
                  </div>
                </li>
              ))}
            </ol>

            <div className="rounded-2xl bg-tint-warning p-6">
              <h3 className="text-xl font-bold">Yang menemani pindahannya</h3>
              <ul className="mt-3">
                {ONBOARDING.map((item) => (
                  <li
                    key={item.lead}
                    className="border-t border-warning/20 py-2.5 text-[15px] first:border-t-0 first:pt-0"
                  >
                    <span className="font-semibold">{item.lead}</span>{" "}
                    {item.body}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------- cta -- */}
      <section
        id="coba"
        className="relative scroll-mt-20 overflow-hidden bg-primary py-18 text-center text-primary-foreground lg:py-26"
      >
        <span
          aria-hidden
          className="pointer-events-none absolute -top-40 -left-28 size-[420px] rounded-full bg-white/10"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute -right-16 -bottom-44 size-[300px] rounded-full bg-secondary/20"
        />
        <div className={`${WRAP} relative`}>
          <h2 className="mx-auto max-w-[20ch] text-3xl font-extrabold text-balance lg:text-[42px] lg:leading-tight">
            Coba dulu empat belas hari.
          </h2>
          <p className="mx-auto mt-4 mb-7 max-w-[52ch] text-lg text-primary-foreground/80">
            Pakai di jam ramai, bukan waktu toko sepi. Kalau setelah dua minggu
            tidak menghemat waktu siapa pun, tidak usah dilanjutkan.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Button
              asChild
              className="h-12 bg-secondary px-6 text-[15px] text-secondary-foreground hover:bg-secondary-hover max-sm:w-full"
            >
              <a href={whatsappHref("trial")}>Minta akses uji coba</a>
            </Button>
            <Button
              asChild
              variant="ghost"
              className="h-12 border-[1.5px] border-white/40 px-6 text-[15px] text-primary-foreground hover:bg-white/10 hover:text-primary-foreground max-sm:w-full"
            >
              <a href={whatsappHref("talk")}>Tanya-tanya dulu</a>
            </Button>
          </div>
          {/*
            WHAT ACTUALLY HAPPENS, in the order it happens. There is no signup
            form behind the button and this says so — a page that offers "Coba
            gratis" and lands somebody on a login screen they have no account for
            spends the trust the rest of it just earned.
          */}
          <p className="mx-auto mt-6 max-w-[56ch] text-sm leading-relaxed text-primary-foreground/65">
            Tidak ada form pendaftaran. Kami yang menyiapkan akunnya — cabang,
            gudang, dan katalog awalnya sekalian — lalu kredensialnya dikirim
            lewat WhatsApp.{" "}
            <span className="font-semibold text-primary-foreground/90">
              Empat belas harinya baru mulai begitu akunnya jadi
            </span>
            , bukan sejak Anda mengirim pesan. Tanpa kartu kredit, tanpa biaya
            pemasangan, dan sisa harinya selalu terlihat di halaman bisnis Anda
            sendiri.
          </p>
        </div>
      </section>

      {/* -------------------------------------------------------- footer -- */}
      <footer className="bg-brand-deep py-14 text-sm text-white/65">
        <div className={WRAP}>
          <div className="grid gap-8 border-b border-white/15 pb-8 md:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
            <div>
              <Logo size={34} reversed />
              <p className="mt-3.5 max-w-[34ch] leading-relaxed">
                Kasir, booking, stok, dan pembukuan petshop dalam satu aplikasi.
                Dibuat di Indonesia, untuk petshop Indonesia.
              </p>
            </div>

            <div>
              <h4 className="mb-3 text-xs font-bold text-white">Produk</h4>
              <ul className="flex flex-col gap-2">
                <li>
                  <a href="#masalah" className="hover:text-white">
                    Kasir
                  </a>
                </li>
                <li>
                  <a href="#cakupan" className="hover:text-white">
                    Booking &amp; layanan
                  </a>
                </li>
                <li>
                  <a href="#cakupan" className="hover:text-white">
                    Stok &amp; pembelian
                  </a>
                </li>
                <li>
                  <a href="#analitik" className="hover:text-white">
                    Keuangan
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="mb-3 text-xs font-bold text-white">Belajar</h4>
              <ul className="flex flex-col gap-2">
                <li>
                  <a href="#perubahan" className="hover:text-white">
                    Yang baru tiap bulan
                  </a>
                </li>
                <li>
                  <a href="#cakupan" className="hover:text-white">
                    Yang sudah jalan
                  </a>
                </li>
                <li>
                  <a href="#kenapa" className="hover:text-white">
                    Cara kami membangunnya
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="mb-3 text-xs font-bold text-white">Hubungi</h4>
              <ul className="flex flex-col gap-2">
                <li>
                  <a
                    href={whatsappHref("talk")}
                    className="hover:text-white"
                  >
                    WhatsApp
                  </a>
                </li>
                <li>
                  <a href="mailto:halo@buloo.id" className="hover:text-white">
                    halo@buloo.id
                  </a>
                </li>
                <li>
                  <Link href="/login" className="hover:text-white">
                    Masuk ke aplikasi
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          <p className="pt-6 text-sm text-white/50">© 2026 Buloo</p>
        </div>
      </footer>
    </div>
  );
}
