import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Logo } from "@/components";
import { Button } from "@/components/ui/button";
import { env } from "@/utils/env";
import { HeroShowcase } from "./HeroShowcase";
import { LandingNav } from "./LandingNav";
import { ProcessSteps } from "./ProcessSteps";
import { SmoothScroll } from "./SmoothScroll";
import { WhyCards } from "./WhyCards";
import {
  FLOW_ROWS,
  LANDING_SECTIONS,
  WHATSAPP_INTENTS,
  type WhatsappIntent,
} from "../content";

/** The page's one column width, shared by every band. */
const WRAP = "mx-auto w-full max-w-[1200px] px-5 sm:px-8";

/**
 * Where a section lands when its nav link is clicked.
 *
 * THE SECTION'S OWN TOP PADDING IS ALREADY THE OFFSET. `scroll-margin-top` sets
 * how far below the viewport top the section's top EDGE lands, and the heading
 * sits another 72 px (88 above 1024) inside it as padding. An 80 px margin
 * therefore stacked on padding that had already cleared the 72 px bar twice
 * over, and the heading arrived a third of a screen down with nothing above it.
 *
 * IT ALSO DRAGGED THE HERO DOWN WITH IT. Anything the margin leaves above the
 * section is the previous section showing through — 80 px of navy against a
 * 72 px bar, which is the dark stripe that used to appear under the bar after
 * clicking "Masalah → solusi". Zero above 1024 px puts the section's own white
 * padding behind the bar instead, and the heading lands 16 px under it.
 *
 * The 8 px below 1024 px is the one concession: the narrow layout's padding is
 * exactly the height of the bar, so with nothing here the heading would touch
 * it. Eight pixels of the hero go behind a 72 px bar and are never seen.
 */
const ANCHOR = "scroll-mt-2 lg:scroll-mt-0";

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
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-10 max-w-[54ch]">
      <h2 className="text-[27px] font-extrabold text-balance sm:text-3xl lg:text-[38px] lg:leading-[1.12]">
        {title}
      </h2>
      {children && <p className="mt-3 text-lg text-muted">{children}</p>}
    </div>
  );
}

/**
 * Buloo Jualan's marketing page, at `/`.
 *
 * A SERVER COMPONENT except for the nav and the hero's tabs — nothing else here
 * needs state, and a marketing page that ships a bundle to say four static
 * things is the wrong first impression for a product whose pitch is that it
 * does not make you wait.
 *
 * ON THE ORANGE BUDGET. ui-rules §4 caps orange at ~5 % of a screen and says two
 * orange things visible at once means one is wrong. That rule is written for
 * money screens, and this page deliberately spends more of the budget than one:
 * the calls to action, one bar per chart, one insight panel per tab, and the
 * third step of the process. The cap it keeps is the one that matters — orange
 * is never text (§13) and every orange fill takes navy ink.
 */
export function LandingScreen() {
  /*
    ONE BUILDER, TWO INTENTS. The number is configuration
    (NEXT_PUBLIC_PHONE_NUMBER) because it changes without the page changing — a
    shop line, a new SIM, a second number for sales. Five hand-typed `wa.me` URLs
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

  /*
    WHATSAPP OPENS IN ITS OWN TAB, and the page stays where it was. On a laptop
    `wa.me` is a redirect into web.whatsapp.com or a hand-off to the desktop
    app; either way, replacing this tab with it costs somebody the section they
    were reading and the answer they had half-decided on. The reply comes back
    minutes later, by which time the pitch is gone.

    SPREAD, NOT TYPED SIX TIMES. `rel` is the half that gets forgotten — a
    `target="_blank"` without it hands the opened page a live `window.opener`
    back into this one.
  */
  const newTab = { target: "_blank", rel: "noopener noreferrer" } as const;

  return (
    <div className="flex min-h-full flex-col bg-surface">
      <SmoothScroll />
      <LandingNav />

      {/* ---------------------------------------------------------- hero -- */}
      <div className="relative overflow-hidden bg-primary text-primary-foreground">
        {/* Decorative only — the hero reads identically without them. */}
        <span
          aria-hidden
          className="pointer-events-none absolute -top-50 -left-42 size-125 rounded-full bg-white/15"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute top-22 -right-78 size-165 rounded-full bg-foreground/25"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute right-[38%] -bottom-48 size-80 rounded-full bg-secondary/15"
        />

        <div
          className={`${WRAP} relative grid items-center gap-12 py-16 lg:grid-cols-[0.92fr_1.08fr] lg:gap-14 lg:py-21`}
        >
          <div>
            <h1 className="max-w-[12ch] text-[36px] leading-[1.03] font-extrabold tracking-[-0.03em] text-balance sm:text-5xl lg:text-[58px]">
              Jualannya rapi. Tokonya tumbuh.
            </h1>
            <p className="mt-5 max-w-[38ch] text-lg text-primary-foreground/80">
              Kasir, booking, dan keuangan per lini bisnis. Angkanya bukan cuma
              tercatat — tapi menunjuk apa yang harus dikerjakan.
            </p>

            <div className="mt-7 flex flex-wrap gap-3">
              <Button
                asChild
                className="h-12 bg-secondary px-6 text-[15px] text-secondary-foreground hover:bg-secondary-hover max-sm:w-full"
              >
                <a href={whatsappHref("konsultasi")} {...newTab}>
                  Konsultasi gratis
                </a>
              </Button>
              <Button
                asChild
                variant="ghost"
                className="h-12 border-[1.5px] border-white/40 px-6 text-[15px] text-primary-foreground hover:bg-white/10 hover:text-primary-foreground max-sm:w-full"
              >
                <a href="#masalah">Lihat cara kerjanya</a>
              </Button>
            </div>

            <p className="mt-5 text-sm text-primary-foreground/65">
              30 menit bersama tim kami. Gratis dan tidak mengikat.
            </p>
          </div>

          <HeroShowcase />
        </div>
      </div>

      {/* ------------------------------------------------- masalah → solusi */}
      <section id="masalah" className={`${ANCHOR} py-18 lg:py-22`}>
        <div className={WRAP}>
          <SectionHead title="Empat hal yang menggerus untung, dan apa yang menggantikannya." />

          {/*
            TWO COLUMNS ON A DESK, ONE ON A PHONE — and the arrow turns with the
            layout. Stacked, the pair reads top-to-bottom, so an arrow still
            pointing right would be pointing at the edge of the screen; it
            rotates and the answer gets a navy rule down its left instead, which
            is what keeps a fix attached to the complaint above it.
          */}
          <div
            aria-hidden
            className="grid grid-cols-[1fr_56px_1fr] pb-3 max-md:hidden"
          >
            <span className="text-xs font-bold tracking-wide text-danger uppercase">
              Yang terjadi sekarang
            </span>
            <span />
            <span className="text-xs font-bold tracking-wide text-success uppercase">
              Yang terjadi di Buloo
            </span>
          </div>

          <ul className="border-t border-border">
            {FLOW_ROWS.map((row) => (
              <li
                key={row.nowTitle}
                className="grid items-center border-b border-border max-md:py-5 md:grid-cols-[1fr_56px_1fr]"
              >
                <div className="text-base text-muted max-md:pb-3 md:py-6 md:pr-6">
                  <b className="mb-1 block font-display text-[17px] leading-tight font-bold text-foreground">
                    {row.nowTitle}
                  </b>
                  {row.nowBody}
                </div>

                <div
                  aria-hidden
                  className="flex items-center max-md:pb-3 md:justify-center md:self-stretch md:border-x md:border-border md:bg-background"
                >
                  <ArrowRight className="size-5 text-info max-md:rotate-90" />
                </div>

                <div className="text-base max-md:border-l-2 max-md:border-tint-brand max-md:pl-4 md:py-6 md:pl-6">
                  <b className="mb-1 block font-display text-[17px] leading-tight font-bold text-primary">
                    {row.fixTitle}
                  </b>
                  <span className="text-muted">{row.fixBody}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* -------------------------------------------------------- kenapa -- */}
      <section id="kenapa" className={`${ANCHOR} bg-background py-18 lg:py-22`}>
        <div className={WRAP}>
          <SectionHead title="Yang tidak Anda dapat dari aplikasi kasir biasa.">
            Buloo dibuat khusus untuk petshop — bukan aplikasi toko kelontong
            yang ditambahi menu grooming.
          </SectionHead>

          <WhyCards />

          <p className="mt-7 max-w-[64ch] text-base text-muted">
            Semuanya dibuat{" "}
            <span className="font-semibold text-foreground">
              simpel dan mudah digunakan
            </span>{" "}
            — kasir baru biasanya sudah lancar di hari pertama, tanpa perlu
            pelatihan panjang.
          </p>
        </div>
      </section>

      {/* -------------------------------------------------------- proses -- */}
      <section id="proses" className={`${ANCHOR} py-18 lg:py-22`}>
        <div className={WRAP}>
          <SectionHead title="Tiap toko masalahnya beda, jadi solusinya juga beda.">
            Makanya kami mulai dari mendengarkan, bukan dari daftar harga.
          </SectionHead>

          <ProcessSteps />

          <div className="mt-10 flex flex-wrap items-center gap-3">
            <Button
              asChild
              className="h-12 bg-secondary px-6 text-[15px] text-secondary-foreground hover:bg-secondary-hover max-sm:w-full"
            >
              <a href={whatsappHref("konsultasi")} {...newTab}>
                Jadwalkan konsultasi
              </a>
            </Button>
            <Button
              asChild
              variant="secondary"
              className="h-12 px-6 text-[15px] max-sm:w-full"
            >
              <a href={whatsappHref("tanya")} {...newTab}>
                Tanya lewat WhatsApp
              </a>
            </Button>
            <p className="max-w-[34ch] text-[15px] text-muted">
              Data Anda terenkripsi dan tetap milik toko — bisa diunduh utuh
              kapan saja.
            </p>
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------- cta -- */}
      <section
        id="kontak"
        className={`${ANCHOR} relative overflow-hidden bg-primary py-18 text-center text-primary-foreground lg:py-22`}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute -top-50 -left-42 size-125 rounded-full bg-white/15"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute -right-18 -bottom-45 size-80 rounded-full bg-secondary/15"
        />
        <div className={`${WRAP} relative`}>
          <h2 className="mx-auto max-w-[18ch] text-3xl font-extrabold text-balance lg:text-[40px] lg:leading-tight">
            Ceritakan kendalanya. Kami bantu cari solusinya.
          </h2>
          <p className="mx-auto mt-4 mb-6 max-w-[46ch] text-lg text-primary-foreground/78">
            Konsultasi 30 menit bersama tim yang sudah menangani puluhan
            petshop. Kalau Buloo bukan yang Anda butuhkan, kami akan bilang
            begitu.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Button
              asChild
              className="h-12 bg-secondary px-6 text-[15px] text-secondary-foreground hover:bg-secondary-hover max-sm:w-full"
            >
              <a href={whatsappHref("konsultasi")} {...newTab}>
                Jadwalkan konsultasi
              </a>
            </Button>
            <Button
              asChild
              variant="ghost"
              className="h-12 border-[1.5px] border-white/40 px-6 text-[15px] text-primary-foreground hover:bg-white/10 hover:text-primary-foreground max-sm:w-full"
            >
              <a href={whatsappHref("tanya")} {...newTab}>
                WhatsApp kami
              </a>
            </Button>
          </div>
          <p className="mt-5 text-sm text-primary-foreground/65">
            Gratis dan tidak mengikat.
          </p>
        </div>
      </section>

      {/* -------------------------------------------------------- footer -- */}
      <footer className="bg-brand-deep py-11 text-[15px] text-white/62">
        <div className={WRAP}>
          <div className="flex flex-wrap items-start justify-between gap-8 border-b border-white/15 pb-6">
            <div>
              <Logo size={32} reversed />
              <p className="mt-3 max-w-[32ch] leading-relaxed">
                Kasir, booking, stok, dan catatan hewan dalam satu aplikasi.
                Dibuat di Indonesia.
              </p>
            </div>

            <nav aria-label="Peta situs">
              <ul className="flex flex-wrap gap-7">
                {LANDING_SECTIONS.map((section) => (
                  <li key={section.id}>
                    <a href={`#${section.id}`} className="hover:text-white">
                      {section.label}
                    </a>
                  </li>
                ))}
                <li>
                  <a
                    href={whatsappHref("tanya")}
                    className="hover:text-white"
                    {...newTab}
                  >
                    WhatsApp
                  </a>
                </li>
                <li>
                  <Link href="/login" className="hover:text-white">
                    Masuk ke aplikasi
                  </Link>
                </li>
              </ul>
            </nav>
          </div>

          <p className="pt-5 text-sm text-white/50">© 2026 Buloo</p>
        </div>
      </footer>
    </div>
  );
}
