/**
 * The landing page's copy, as data.
 *
 * SEPARATE FROM THE COMPONENTS because this is the half that changes. Every
 * claim below names something the product actually does, and the rows are meant
 * to be re-read against the app when a module ships — a marketing page that
 * drifts from the product is worse than no page, because the first person to
 * catch the drift is a customer who already paid.
 *
 * Bahasa Indonesia, per ui-rules §12. The words the product does not use ("POS",
 * "invoice", "platform", "UMKM") do not appear here either.
 */

/**
 * The two conversations the page can start, as prefilled WhatsApp messages.
 *
 * WHY A MESSAGE AND NOT A FORM. There is no lead endpoint behind this app —
 * `POST /api/tenants` is platform-owner administration and is not gated yet, and
 * nothing stores an enquiry. A form would need a place to put what it collects
 * before it collects anything, and until that exists it would drop what somebody
 * typed. So the form's questions are asked HERE, in the channel that already
 * answers them, and the reply comes from a person — which is exactly what every
 * button on this page promises: a 30-minute conversation, not a signup.
 *
 * THE BLANK LINES ARE THE FORM. Somebody opens WhatsApp and finds three labels
 * waiting for three answers, which is faster than being asked them one at a time
 * and is the whole reason to prefill rather than open an empty chat.
 *
 * REPLACE THIS WITH A REAL FORM once an enquiry has somewhere to live. The
 * questions do not change; only where the answers land does.
 */
export const WHATSAPP_INTENTS = {
  /** Ready to book the call. Asks for what preparing for it needs. */
  konsultasi: `Halo Buloo, saya mau jadwalkan konsultasi gratis 30 menit.

Nama toko:
Nama saya:
Jumlah cabang:`,
  /** Not ready to book anything yet, and should not be made to pretend. */
  tanya: "Halo Buloo, saya mau tanya-tanya dulu soal Buloo untuk petshop saya.",
} as const;

export type WhatsappIntent = keyof typeof WHATSAPP_INTENTS;

/** In-page anchors, in the order the sections appear. */
export const LANDING_SECTIONS = [
  { id: "masalah", label: "Masalah → solusi" },
  { id: "kenapa", label: "Kenapa Buloo" },
  { id: "proses", label: "Cara mulai" },
] as const;

/* -------------------------------------------------------------------------- */
/*  Hero — three example screens behind three tabs                            */
/* -------------------------------------------------------------------------- */

/**
 * THE TABS ARE THE PITCH, in the order the pitch is made: what the numbers say,
 * what the week looks like, and where the profit actually comes from. Every
 * figure below is an EXAMPLE and each panel's header says whose day it is —
 * none of it is passed off as a real shop's month.
 */
export const HERO_TABS = [
  { id: "analitik", label: "Analitik" },
  { id: "kalender", label: "Kalender booking" },
  { id: "keuangan", label: "Keuangan" },
] as const;

export type HeroTabId = (typeof HERO_TABS)[number]["id"];

/** A headline number with the direction it moved. */
export interface HeroKpi {
  label: string;
  value: string;
  /** Carries a word or a sign, never a colour alone — ui-rules §1.3. */
  delta: string;
  tone: "up" | "down" | "warn";
}

export const HERO_KPIS: HeroKpi[] = [
  { label: "Penjualan", value: "4,18 jt", delta: "+12%", tone: "up" },
  { label: "Margin kotor", value: "31,4%", delta: "−4,1 poin", tone: "down" },
  { label: "Stok menipis", value: "6 item", delta: "2 habis", tone: "warn" },
];

/** The orange note under each panel: the one thing worth doing about it. */
export interface HeroInsight {
  title: string;
  body: string;
}

export const HERO_ANALYTICS_INSIGHT: HeroInsight = {
  title: "Yang perlu ditindak",
  body: "Margin turun karena Dry Food didiskon tiga minggu, sementara HPP-nya naik 6%.",
};

/**
 * One booking, one groomer's column.
 *
 * `tone` is what the slot IS, not how it looks: `booked` a normal job, `stay` an
 * overnight, `due` something with a date attached to it, `free` an empty run.
 */
export interface CalendarSlot {
  time?: string;
  title: string;
  detail: string;
  tone: "booked" | "stay" | "due" | "free";
}

export interface CalendarDay {
  day: string;
  slots: CalendarSlot[];
}

export const HERO_WEEK: CalendarDay[] = [
  {
    day: "Sen",
    slots: [
      {
        time: "09:00",
        title: "Bella",
        detail: "Grooming lengkap",
        tone: "booked",
      },
      { time: "11:30", title: "Miko", detail: "Mandi kutu", tone: "booked" },
      {
        time: "14:00",
        title: "Oyen",
        detail: "Penitipan 3 hari",
        tone: "stay",
      },
    ],
  },
  {
    day: "Sel",
    slots: [
      { time: "10:00", title: "Coco", detail: "Potong kuku", tone: "booked" },
      { title: "4 slot kosong", detail: "", tone: "free" },
    ],
  },
  {
    day: "Rab",
    slots: [
      {
        time: "09:30",
        title: "Momo",
        detail: "Grooming basic",
        tone: "booked",
      },
      { title: "3 slot kosong", detail: "", tone: "free" },
    ],
  },
  {
    day: "Kam",
    slots: [
      {
        time: "08:30",
        title: "Luna",
        detail: "Grooming lengkap",
        tone: "booked",
      },
      { time: "13:00", title: "Kiko", detail: "Mandi", tone: "booked" },
    ],
  },
  {
    day: "Jum",
    slots: [
      {
        time: "09:00",
        title: "Chiko",
        detail: "Grooming lengkap",
        tone: "booked",
      },
      {
        time: "15:00",
        title: "Bella",
        detail: "Vaksin jatuh tempo",
        tone: "due",
      },
    ],
  },
  {
    day: "Sab",
    slots: [
      {
        time: "08:00",
        title: "Snowy",
        detail: "Grooming lengkap",
        tone: "booked",
      },
      { time: "10:30", title: "Bruno", detail: "Mandi kutu", tone: "booked" },
      { time: "13:30", title: "Cimol", detail: "Potong kuku", tone: "booked" },
    ],
  },
];

export const HERO_CALENDAR_INSIGHT: HeroInsight = {
  title: "Peluang minggu ini",
  body: "Tujuh slot kosong di Selasa–Rabu, padahal grooming margin tertinggi.",
};

/**
 * Profit per business line.
 *
 * `share` is the OMZET bar, as a percentage of the biggest line — so the longest
 * bar fills its track and the rest read against it. `margin` is a different
 * quantity and deliberately does not follow the bar: the whole argument of the
 * panel is that the widest line is not the most profitable one.
 */
export interface ProfitLine {
  name: string;
  detail: string;
  share: number;
  margin: string;
  tone: "high" | "low" | "plain";
  /** The one orange bar in the group — never more, per ui-rules §4. */
  accent?: boolean;
}

export const HERO_PROFIT_LINES: ProfitLine[] = [
  {
    name: "Toko",
    detail: "Makanan, pasir, obat",
    share: 100,
    margin: "22%",
    tone: "plain",
  },
  {
    name: "Grooming",
    detail: "Termasuk antar-jemput",
    share: 53,
    margin: "61%",
    tone: "high",
  },
  {
    name: "Penitipan",
    detail: "Per malam",
    share: 17,
    margin: "48%",
    tone: "high",
  },
  {
    name: "Baju & aksesoris",
    detail: "Merchandise",
    share: 8,
    margin: "9%",
    tone: "low",
    accent: true,
  },
];

export const HERO_PROFIT_INSIGHT: HeroInsight = {
  title: "Keputusan yang jadi jelas",
  body: "Merchandise makan seperlima waktu kasir dengan margin 9%.",
};

/* -------------------------------------------------------------------------- */
/*  Masalah → solusi                                                          */
/* -------------------------------------------------------------------------- */

/** What a shop lives with today, and what stands in its place in Buloo. */
export interface FlowRow {
  nowTitle: string;
  nowBody: string;
  fixTitle: string;
  fixBody: string;
}

export const FLOW_ROWS: FlowRow[] = [
  {
    nowTitle: "Pelanggan datang sekali, tidak balik lagi",
    nowBody: "Tidak ada yang tahu siapa yang sudah lama menghilang.",
    fixTitle: "Daftar siapa yang perlu dihubungi",
    fixBody:
      "Pelanggan lama yang berhenti datang, vaksin jatuh tempo, dan jumlah pelanggan baru tiap bulan.",
  },
  {
    nowTitle: "Semua pelanggan mendarat di lapak orang lain",
    nowBody:
      "Potongan marketplace naik terus, dan toko belum punya tempat jualan sendiri.",
    fixTitle: "Halaman toko atas nama Anda sendiri",
    fixBody:
      "Pelanggan booking dan pesan langsung ke toko. Untung bersih tiap kanal tetap dihitung terpisah.",
  },
  {
    nowTitle: "Masih manual, jadi ada yang miss dan stok kecolongan",
    nowBody: "Keuangan ikut meleset karena sumber angkanya beda-beda.",
    fixTitle: "Semua tercatat sekali, bisa dibuka dari mana pun",
    fixBody:
      "Stok berkurang dari kasir dan jurnalnya ikut. Tiap perubahan ada nama dan waktunya.",
  },
  {
    nowTitle: "Punya beberapa cabang, konsolidasinya lambat",
    nowBody: "Angka tiap cabang baru menyatu waktu tutup buku.",
    fixTitle: "Semua cabang jadi satu angka, real-time",
    fixBody:
      "Owner melihat semuanya, tiap manager cuma cabangnya sendiri. Aksesnya diatur per orang.",
  },
];

/* -------------------------------------------------------------------------- */
/*  Kenapa Buloo — four cards, each carrying a piece of a real screen          */
/* -------------------------------------------------------------------------- */

/** A tinted chip on a mock row. Always carries a word — ui-rules §1.3. */
export interface MockTag {
  label: string;
  tone: "brand" | "success" | "warning" | "neutral";
}

/** One line of a mock screen: a name, a subtitle, and either a count or a tag. */
export interface MockRow {
  title: string;
  detail: string;
  count?: string;
  /** Draws the count in success ink — a number that went the right way. */
  countGood?: boolean;
  tag?: MockTag;
}

/** A bar in the branch-comparison mock. `share` is relative to the top row. */
export interface MockBar {
  label: string;
  value: string;
  share: number;
  accent?: boolean;
}

export interface WhyCard {
  title: string;
  body: string;
  /** The mock panel's caption — what screen this is a piece of. */
  caption: string;
  bars?: MockBar[];
  rows: MockRow[];
}

export const WHY_CARDS: WhyCard[] = [
  {
    title: "Analitik yang mengerti pelanggan petshop",
    body: "Bukan cuma omzet naik-turun. Siapa yang sudah lama tidak datang, berapa pelanggan baru bulan ini, dan hewan siapa yang vaksinnya jatuh tempo.",
    caption: "Pelanggan · September",
    rows: [
      {
        title: "Sudah lama tidak datang",
        detail: "Terakhir grooming lebih dari 3 bulan",
        count: "18",
      },
      {
        title: "Pelanggan baru bulan ini",
        detail: "Bulan lalu 14",
        count: "23",
        countGood: true,
      },
      {
        title: "Vaksin jatuh tempo",
        detail: "Minggu ini",
        tag: { label: "Ingatkan 7", tone: "warning" },
      },
    ],
  },
  {
    title: "Toko Anda punya display sendiri",
    body: "Halaman berisi layanan dan produk toko, dengan nama dan warna Anda. Bisa ditaruh di bio Instagram, dan pesanannya masuk langsung ke kasir.",
    caption: "Pawship Petshop · halaman toko",
    rows: [
      {
        title: "Grooming lengkap",
        detail: "90 menit · Kak Rina atau Kak Dewi",
        tag: { label: "Pilih jadwal", tone: "brand" },
      },
      {
        title: "Penitipan",
        detail: "Per malam · kandang besar tersedia",
        tag: { label: "Pilih tanggal", tone: "brand" },
      },
      {
        title: "Pesanan masuk",
        detail: "Langsung jadi antrean di kasir",
        tag: { label: "Otomatis", tone: "success" },
      },
    ],
  },
  {
    title: "Semua tercatat, bisa dibuka dari mana pun",
    body: "Stok berkurang dari kasir, bukan dari input terpisah. Tiap perubahan punya nama dan waktunya, jadi selisih selalu bisa ditelusuri.",
    caption: "Kartu stok · Royal Canin Adult 2 kg",
    rows: [
      {
        title: "−1 pcs · Penjualan kasir",
        detail: "Rina · hari ini 14:02",
        tag: { label: "sisa 12", tone: "neutral" },
      },
      {
        title: "+24 pcs · Barang masuk",
        detail: "Budi · 2 Sep 09:15",
        tag: { label: "sisa 13", tone: "neutral" },
      },
      {
        title: "−2 pcs · Koreksi opname",
        detail: "Owner · 1 Sep · ada catatan",
        tag: { label: "Ditinjau", tone: "warning" },
      },
    ],
  },
  {
    title: "Banyak cabang, satu angka",
    body: "Tidak perlu menunggu tutup buku untuk tahu cabang mana yang jalan. Owner melihat semuanya, tiap manager cuma cabangnya sendiri.",
    caption: "Penjualan hari ini · 3 cabang",
    bars: [
      { label: "Pusat", value: "Rp 2,4 jt", share: 100 },
      { label: "Barat", value: "Rp 1,1 jt", share: 46 },
      { label: "Selatan", value: "Rp 0,6 jt", share: 25, accent: true },
    ],
    rows: [
      {
        title: "Manager Barat",
        detail: "Cuma melihat cabang Barat",
        tag: { label: "Akses terbatas", tone: "neutral" },
      },
    ],
  },
];

/* -------------------------------------------------------------------------- */
/*  Cara mulai                                                                */
/* -------------------------------------------------------------------------- */

/** `icon` is a key, not a component — content.ts holds no JSX. */
export type StepIcon = "chat" | "search" | "quote" | "team";

export interface ProcessStep {
  icon: StepIcon;
  /** The eyebrow. Sentence case, not shouted — ui-rules §12. */
  when: string;
  title: string;
  body: string;
  /** The one orange step. Never two — ui-rules §4. */
  highlight?: boolean;
}

export const PROCESS_STEPS: ProcessStep[] = [
  {
    icon: "chat",
    when: "Langkah 1 · 30 menit",
    title: "Konsultasi dengan tim kami",
    body: "Ceritakan kendala yang paling mengganggu dan target tumbuh toko Anda. Kami bantu cari solusinya.",
  },
  {
    icon: "search",
    when: "Langkah 2",
    title: "Kami petakan masalahnya",
    body: "Bagian mana yang paling memakan waktu dan paling banyak bocor, dan mana yang belum perlu dibenahi.",
  },
  {
    icon: "quote",
    when: "Langkah 3",
    title: "Penawaran khusus toko Anda",
    body: "Cakupan dan angkanya disusun sesuai yang benar-benar Anda butuhkan, termasuk kebutuhan khusus toko Anda.",
    highlight: true,
  },
  {
    icon: "team",
    when: "Langkah 4",
    title: "Pindahan & pendampingan",
    body: "Data lama kami yang pindahkan. Minggu pertama kami dampingi sampai kasirnya jalan sendiri.",
  },
];
