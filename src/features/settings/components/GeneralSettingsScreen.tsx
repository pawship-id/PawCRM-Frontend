"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Building2 } from "lucide-react";

import { Alert, Card, Spinner } from "@/components";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { branchHoursSummary } from "@/features/branches/hours";
import { usePermissions } from "@/features/permissions";
import {
  currencyLabel,
  fiscalYearLabel,
  TenantSubscriptionBadge,
  timezoneLabel,
  useTenant,
} from "@/features/tenant";
import type { Branch, Tenant, Warehouse } from "@/types/api";
import { env } from "@/utils/env";

import { useBranchDirectory } from "../hooks/useBranchDirectory";
import { useUserCount } from "../hooks/useUserCount";
import { SETTINGS_PATHS } from "../paths";
import {
  HubLinkCard,
  HubPendingCard,
  type PendingHubCard,
} from "./SettingsHubCards";
import { SettingsTabsHeader } from "./SettingsHeader";

/**
 * Pengaturan › Umum — the tenant's profile, as the mockup draws it
 * (`buloo-navigation-v3`, `profilTenant`, 22 September 2026): who the business
 * is, where its branches are, and the preferences set once and left alone.
 *
 * IT REPLACED TWO SCREENS. The hub of cards that sat here, and the read-only
 * "Business information" page reached from the account menu
 * (/dashboard/business, which now redirects here). Its three forms — tax, stock,
 * invoice footer — went to the tabs the mockup gives them: Pajak under Keuangan,
 * the other two behind cards below.
 *
 * IDENTITY AND LOCALE ARE EDITABLE from the "Ubah" button on the Identitas
 * section: name, legal name, NPWP, timezone, currency, date format and fiscal
 * year all go through `PATCH /tenants/me` (Fase 2–3). What stays platform
 * administration is the slug — a public URL other links depend on — and the
 * subscription plan, which is what the business is billed on.
 *
 * CABANG BARU COMES FROM THE BULOO TEAM, per the mockup and the 22 September
 * decision: each branch is its own subscription, so the list has no create
 * button — only a line saying who to ask.
 */

const PLAN_LABELS: Record<Tenant["subscription"]["plan"], string> = {
  free: "Free",
  basic: "Basic",
  pro: "Pro",
  enterprise: "Enterprise",
};

/**
 * "Hubungi kami" for a new branch — Buloo's own WhatsApp, the same number and
 * `wa.me` shape the landing page's CTAs use (`env.whatsappNumber`), so a second
 * hand-typed number here never drifts from the real one.
 *
 * BLANK FIELDS, not a fixed sentence: whoever answers needs the shop's name and
 * which branch is wanted, and asking the tenant to type both from scratch loses
 * people. Matches the landing page's own "konsultasi" message shape.
 *
 * THE HREF IS BUILT ONCE, at module scope: `env.whatsappNumber` is resolved
 * from `NEXT_PUBLIC_PHONE_NUMBER` at build time and never changes at runtime,
 * so recomputing it per render would buy nothing.
 */
const NEW_BRANCH_WHATSAPP_MESSAGE = `Halo Buloo, saya mau tambah cabang baru.

Nama toko:
Cabang yang diminta:`;

const NEW_BRANCH_WHATSAPP_HREF = `https://wa.me/${env.whatsappNumber}?text=${encodeURIComponent(
  NEW_BRANCH_WHATSAPP_MESSAGE,
)}`;

/*
  ONLY LANGGANAN IS STILL A PENDING CONSTANT. Tipe pelanggan left this list on
  24 September 2026, on request — built as a real link now (its own row of
  cards, below), the same order Nomor dokumen and Notifikasi arrived in the
  day before.
*/
const LANGGANAN_CARD: PendingHubCard = {
  title: "Langganan & tagihan",
  description:
    "Paket, kuota POS dan pengguna, serta tagihan berikutnya. Hanya untuk Owner.",
  blockedBy: "Paket dan kuotanya belum diputuskan",
};

export function GeneralSettingsScreen() {
  const { can } = usePermissions();

  const mayReadTenant = can("tenants", "read");
  const mayReadBranches = can("branches", "read");
  const mayReadWarehouses = can("warehouses", "read");
  const mayReadUsers = can("users", "read");
  const mayReadCustomerTypes = can("customerTypes", "read");

  const { tenant, loading, error, refetch } = useTenant(mayReadTenant);
  const directory = useBranchDirectory({
    branches: mayReadBranches,
    warehouses: mayReadWarehouses,
  });
  const userCount = useUserCount(mayReadUsers);

  return (
    <div className="flex flex-col gap-6">
      <SettingsTabsHeader />

      {mayReadTenant && loading && (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted">
          <Spinner /> Memuat profil usaha…
        </div>
      )}

      {mayReadTenant && !loading && (error || !tenant) && (
        <Alert variant="error">
          {error ?? "Profil usaha tidak bisa dimuat."}{" "}
          <button
            type="button"
            onClick={refetch}
            className="font-semibold underline underline-offset-2"
          >
            Coba lagi
          </button>
        </Alert>
      )}

      {tenant && (
        <>
          <TenantHero
            tenant={tenant}
            branchCount={
              mayReadBranches && !directory.loading
                ? directory.branches.length
                : null
            }
            warehouses={
              mayReadWarehouses && !directory.loading
                ? directory.warehouses
                : null
            }
            userCount={userCount}
          />
          <IdentitySection tenant={tenant} />
        </>
      )}

      {mayReadBranches && (
        <BranchesSection
          directory={directory}
          showWarehouses={mayReadWarehouses}
          mayEdit={can("branches", "update")}
        />
      )}

      <Section
        title="Data master & preferensi"
        hint="Diatur sekali lalu ditinggal"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {mayReadCustomerTypes && (
            <HubLinkCard
              title="Tipe pelanggan"
              description="Reguler, Reseller, Grosir — menempel di profil pelanggan dan jadi dasar aturan harga khusus nanti."
              href={SETTINGS_PATHS.tipePelanggan}
            />
          )}
          {/*
            NOT GATED ON `tenants:read` like the cards below it: this one reads
            no tenant setting at all — it explains what `beli_putus` and
            `konsinyasi` do to the books, which is the same answer for everybody.
          */}
          <HubLinkCard
            title="Tipe supplier"
            description="Beli putus, konsinyasi, perusahaan, perorangan — apa artinya, dan di mana diatur."
            href={SETTINGS_PATHS.tipeSupplier}
          />
          {mayReadTenant && (
            <>
              <HubLinkCard
                title="Nomor dokumen"
                description="Awalan, kapan nomor mengulang, dan jumlah digit tiap jenis dokumen."
                href={SETTINGS_PATHS.nomorDokumen}
              />
              <HubLinkCard
                title="Notifikasi"
                description="Pengingat otomatis yang ingin dikirim. Belum ada yang mengirim — pilihannya tersimpan saja."
                href={SETTINGS_PATHS.notifikasi}
              />
              <HubLinkCard
                title="Faktur & dokumen"
                description="Catatan kaki faktur — rekening tujuan dan syarat bayar."
                href={SETTINGS_PATHS.fakturDokumen}
              />
              <HubLinkCard
                title="Stok & kasir"
                description="Boleh tidaknya kasir menjual barang yang stoknya sudah habis."
                href={SETTINGS_PATHS.stokKasir}
              />
            </>
          )}
          <HubPendingCard {...LANGGANAN_CARD} />
        </div>
      </Section>
    </div>
  );
}

/** One of the profile's panels — the mockup's `.sec`, drawn as the app's Card. */
function Section({
  title,
  hint,
  action,
  children,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card title={title} description={hint} action={action}>
      {children}
    </Card>
  );
}

function TenantHero({
  tenant,
  branchCount,
  warehouses,
  userCount,
}: {
  tenant: Tenant;
  /** Null while unknown or not readable — the chip is then left out. */
  branchCount: number | null;
  warehouses: Warehouse[] | null;
  userCount: number | null;
}) {
  const { subscription } = tenant;
  const joined = monthYear(tenant.createdAt);
  const trial = trialSummary(subscription.trialEndsAt);

  const places =
    branchCount === null
      ? null
      : warehouses === null
        ? `${branchCount} cabang`
        : `${branchCount} cabang · ${warehouses.length} gudang`;

  /*
    KASIR AKTIF, WITHOUT THE MOCKUP'S "dari 5". The quota is a subscription
    figure and no plan carries one yet, so the chip counts what is switched on
    and claims no limit nobody has set.
  */
  const tills = warehouses?.filter((warehouse) => warehouse.hasPos).length;

  /*
    ONLY ON THE FREE PLAN, on request (24 September 2026). Trial is a Free-plan
    concept in this app — a tenant upgrades out of it — so a paid plan showing
    "Trial" would be a data anomaly, not something to surface here. Grouped as
    one unit because both read the same status: the badge names it, the chip
    counts the days.
  */
  const showTrial = subscription.plan === "free";

  return (
    <Card>
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
        <TenantLogo tenant={tenant} />
        <div className="min-w-0 flex-1">
          {/*
            THE TRIAL GROUP SITS ON THE NAME'S OWN ROW, right-aligned, rather
            than in the chip row below — it is a status about the account
            itself, not one more fact about the business, and putting it beside
            the name is what makes it read as a callout rather than a chip
            among chips.
          */}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h2 className="min-w-0 truncate text-2xl font-extrabold text-foreground">
              {tenant.name}
            </h2>
            {showTrial && (
              <div className="flex flex-none flex-wrap items-center gap-2">
                <TenantSubscriptionBadge status={subscription.status} />
                {trial && <Chip>{trial}</Chip>}
              </div>
            )}
          </div>
          <p className="text-sm text-muted">{identitySubtitle(tenant)}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Chip>
              Paket {PLAN_LABELS[subscription.plan] ?? subscription.plan}
            </Chip>
            {places && <Chip>{places}</Chip>}
            {userCount !== null && <Chip>{`${userCount} pengguna`}</Chip>}
            {tills !== undefined && <Chip>{`${tills} kasir aktif`}</Chip>}
            {joined && <Chip>Bergabung {joined}</Chip>}
          </div>
        </div>
      </div>
    </Card>
  );
}

/**
 * The hero's subtitle: "PT Anabul Sejahtera Bersama · NPWP 01.234.567.8-901.000",
 * matching the mockup's identity line (23 September 2026, on request).
 *
 * EITHER HALF MAY BE MISSING, and the join drops the one that is: a shop with a
 * legal name but no NPWP yet reads just the name, not "· NPWP —". Falls back to
 * the slug when NEITHER is set, so the line is never empty before a shop has
 * filled in Identitas.
 */
function identitySubtitle(tenant: Tenant): string {
  const parts = [
    tenant.legalName || null,
    tenant.taxId ? `NPWP ${tenant.taxId}` : null,
  ].filter((part): part is string => Boolean(part));

  return parts.length > 0 ? parts.join(" · ") : `/${tenant.slug}`;
}

function IdentitySection({ tenant }: { tenant: Tenant }) {
  return (
    <Section
      title="Identitas"
      hint="Dipakai di dokumen resmi dan tagihan Buloo"
      action={
        <Link
          href={SETTINGS_PATHS.identitas}
          className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-surface-hover"
        >
          Ubah
        </Link>
      }
    >
      <dl className="divide-y divide-border">
        <IdentityRow
          label="Nama tampilan"
          note="Muncul di kiri atas dan di semua ekspor"
        >
          {tenant.name}
        </IdentityRow>
        <IdentityRow
          label="Nama badan hukum"
          note="Tercetak di faktur. Kosong berarti faktur memakai nama tampilan."
        >
          {tenant.legalName || "—"}
        </IdentityRow>
        <IdentityRow label="NPWP">
          {tenant.taxId ? (
            <span className="tabular-nums">{tenant.taxId}</span>
          ) : (
            "—"
          )}
        </IdentityRow>
        <IdentityRow
          label="Zona waktu"
          note="Menentukan batas hari untuk tutup shift dan laporan harian."
        >
          {timezoneLabel(tenant.timezone)}
        </IdentityRow>
        <IdentityRow label="Mata uang">
          {currencyLabel(tenant.currency)}
        </IdentityRow>
        <IdentityRow label="Format tanggal">
          {tenant.dateFormat ?? "DD MMM YYYY"}
        </IdentityRow>
        <IdentityRow label="Tahun buku">
          {fiscalYearLabel(tenant.fiscalYearStartMonth ?? 1)}
        </IdentityRow>
      </dl>
    </Section>
  );
}

function IdentityRow({
  label,
  note,
  children,
}: {
  label: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-1 py-3 sm:grid-cols-[190px_minmax(0,1fr)] sm:gap-4">
      <dt className="text-sm font-semibold text-muted">{label}</dt>
      <dd className="text-sm font-semibold text-foreground">
        {children}
        {note && (
          <span className="mt-0.5 block text-xs font-normal text-muted">
            {note}
          </span>
        )}
      </dd>
    </div>
  );
}

function BranchesSection({
  directory,
  showWarehouses,
  mayEdit,
}: {
  directory: ReturnType<typeof useBranchDirectory>;
  showWarehouses: boolean;
  mayEdit: boolean;
}) {
  const { branches, warehouses, loading, error } = directory;

  const byBranch = new Map<string, Warehouse[]>();
  for (const warehouse of warehouses) {
    if (!warehouse.defaultBranchId) continue;
    const list = byBranch.get(warehouse.defaultBranchId) ?? [];
    list.push(warehouse);
    byBranch.set(warehouse.defaultBranchId, list);
  }

  return (
    // NO "Daftar cabang" / "Kelola gudang" LINKS HERE, on request: a tenant
    // cannot add a branch itself (see the note below the list), so a link to
    // the bare list invited a click that led nowhere new. Each row's own
    // "Kelola" is still the way in when editing is allowed.
    <Section
      title="Cabang & gudang"
      hint="Alamat cabang yang tercetak di struk, bukan alamat usaha"
    >
      {loading ? (
        <div className="flex items-center gap-2 py-4 text-sm text-muted">
          <Spinner /> Memuat cabang…
        </div>
      ) : error ? (
        <Alert variant="error">Daftar cabang tidak bisa dimuat.</Alert>
      ) : (
        <ul className="divide-y divide-border">
          {branches.map((branch) => (
            <BranchRow
              key={branch._id}
              branch={branch}
              warehouses={
                showWarehouses ? (byBranch.get(branch._id) ?? []) : null
              }
              mayEdit={mayEdit}
            />
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
        <p className="text-xs text-muted">
          Butuh cabang baru? Tiap cabang punya langganan sendiri dan
          diaktifkan oleh tim Buloo.
        </p>
        <Button asChild variant="secondary" size="sm" className="flex-none">
          <a
            href={NEW_BRANCH_WHATSAPP_HREF}
            target="_blank"
            rel="noopener noreferrer"
          >
            Hubungi kami
          </a>
        </Button>
      </div>
    </Section>
  );
}

function BranchRow({
  branch,
  warehouses,
  mayEdit,
}: {
  branch: Branch;
  /** Null when the role may not read warehouses — the line is left out. */
  warehouses: Warehouse[] | null;
  mayEdit: boolean;
}) {
  const contact = [branch.address, branch.city, branch.phone]
    .filter(Boolean)
    .join(" · ");
  const hours = branchHoursSummary(branch);

  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      {/* The mockup's `.bic` — a small badge naming the row as a place. */}
      <span className="flex size-10 flex-none items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Building2 className="size-5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-foreground">
          {branch.name}
          {!branch.isActive && <Badge variant="outline">Nonaktif</Badge>}
        </p>
        <p className="text-xs text-muted">{contact || "Alamat belum diisi"}</p>
        {warehouses && (
          <p className="text-xs text-muted">
            {warehouses.length === 0
              ? "Belum ada gudang"
              : `${warehouses.length} gudang · ${warehouses.map(warehouseLabel).join(", ")}`}
          </p>
        )}
        <p className="text-xs text-muted">{hours ?? "Jam buka belum diisi"}</p>
      </div>
      {mayEdit && (
        <Link
          href={`${SETTINGS_PATHS.cabang}/${branch._id}`}
          className="flex-none rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-surface-hover"
        >
          Kelola
        </Link>
      )}
    </li>
  );
}

/** "Etalase Pusat (kasir)" — a warehouse, and whether a till stands in it. */
function warehouseLabel(warehouse: Warehouse): string {
  return warehouse.hasPos ? `${warehouse.name} (kasir)` : warehouse.name;
}

function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-7 items-center rounded-full border border-border bg-background px-3 text-xs font-semibold text-foreground">
      {children}
    </span>
  );
}

/** The tenant's logo, or its initials when it has none. */
function TenantLogo({ tenant }: { tenant: Tenant }) {
  if (tenant.logoUrl) {
    return (
      // A tenant-supplied URL on an unknown host — see TenantDetail's logo for
      // why this is a plain <img> rather than next/image.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={tenant.logoUrl}
        alt={`Logo ${tenant.name}`}
        className="size-19 flex-none rounded-2xl border border-border object-cover"
      />
    );
  }

  const initials =
    tenant.name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0]?.toUpperCase() ?? "")
      .join("") || "?";

  return (
    <span className="flex size-19 flex-none items-center justify-center rounded-2xl bg-primary text-2xl font-extrabold text-primary-foreground">
      {initials}
    </span>
  );
}

const MS_PER_DAY = 86_400_000;

/**
 * The trial deadline as the days LEFT, which is the number that matters. A
 * deadline already past is reported as such rather than clamped to zero — a
 * trial that ended last week on an account still marked "Trial" is exactly what
 * an owner needs to see. Module-level because Date.now() is impure (see
 * utils/date.ts).
 */
function trialSummary(trialEndsAt: string | null): string | null {
  if (!trialEndsAt) return null;
  const ends = new Date(trialEndsAt);
  if (Number.isNaN(ends.getTime())) return null;

  const days = Math.ceil((ends.getTime() - Date.now()) / MS_PER_DAY);
  if (days < 0) return `Trial berakhir ${Math.abs(days)} hari lalu`;
  if (days === 0) return "Trial berakhir hari ini";
  return `Trial sisa ${days} hari`;
}

/** "Maret 2024" — the month the workspace was created. */
function monthYear(value: string): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("id-ID", { month: "long", year: "numeric" });
}
