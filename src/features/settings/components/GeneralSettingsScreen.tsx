"use client";

import type { ReactNode } from "react";
import Link from "next/link";

import { Alert, Card, Spinner } from "@/components";
import { Badge } from "@/components/ui/badge";
import { usePermissions } from "@/features/permissions";
import { TenantSubscriptionBadge, useTenant } from "@/features/tenant";
import type { Branch, Tenant, Warehouse } from "@/types/api";

import { useBranchDirectory } from "../hooks/useBranchDirectory";
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
 * NOTHING HERE IS EDITABLE IN PLACE, and not by choice: `PATCH /tenants/me`
 * accepts `settings` only, so the name, logo and timezone are set by the Buloo
 * team. The mockup's "Ubah" buttons wait on that endpoint (Fase 2).
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

/** Identity fields the mockup draws that the tenant document does not hold yet. */
const PENDING_IDENTITY = [
  "Nama badan hukum",
  "NPWP",
  "Format tanggal",
  "Tahun buku",
] as const;

const PENDING_CARDS: PendingHubCard[] = [
  {
    title: "Tipe pelanggan",
    description:
      "Umum, Member, Grosir, Klinik — mengisi harga dan tempo bawaan tiap pelanggan.",
    blockedBy: "Belum ada di sistem; yang ada baru tier VIP",
  },
  {
    title: "Tipe supplier",
    description:
      "Bentuk kerja sama dan badan usahanya — beli putus, konsinyasi, perusahaan, perorangan.",
    blockedBy: "Masih daftar tetap, belum bisa diubah tenant",
  },
  {
    title: "Notifikasi",
    description:
      "Pengingat jatuh tempo, stok minimum, dan membership yang akan habis.",
    blockedBy: "Belum ada modul notifikasi",
  },
  {
    title: "Langganan & tagihan",
    description:
      "Paket, kuota POS dan pengguna, serta tagihan berikutnya. Hanya untuk Owner.",
    blockedBy: "Paket dan kuotanya belum diputuskan",
  },
];

export function GeneralSettingsScreen() {
  const { can } = usePermissions();

  const mayReadTenant = can("tenants", "read");
  const mayReadBranches = can("branches", "read");
  const mayReadWarehouses = can("warehouses", "read");

  const { tenant, loading, error, refetch } = useTenant(mayReadTenant);
  const directory = useBranchDirectory({
    branches: mayReadBranches,
    warehouses: mayReadWarehouses,
  });

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
            warehouseCount={
              mayReadWarehouses && !directory.loading
                ? directory.warehouses.length
                : null
            }
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
          {mayReadTenant && (
            <>
              <HubLinkCard
                title="Faktur & dokumen"
                description="Catatan kaki faktur — rekening tujuan dan syarat bayar. Format nomor dokumen menyusul."
                href={SETTINGS_PATHS.fakturDokumen}
              />
              <HubLinkCard
                title="Stok & kasir"
                description="Boleh tidaknya kasir menjual barang yang stoknya sudah habis."
                href={SETTINGS_PATHS.stokKasir}
              />
            </>
          )}
          {PENDING_CARDS.map((card) => (
            <HubPendingCard key={card.title} {...card} />
          ))}
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
  warehouseCount,
}: {
  tenant: Tenant;
  /** Null while unknown or not readable — the chip is then left out. */
  branchCount: number | null;
  warehouseCount: number | null;
}) {
  const { subscription } = tenant;
  const joined = monthYear(tenant.createdAt);
  const trial = trialSummary(subscription.trialEndsAt);

  const places =
    branchCount === null
      ? null
      : warehouseCount === null
        ? `${branchCount} cabang`
        : `${branchCount} cabang · ${warehouseCount} gudang`;

  return (
    <Card>
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
        <TenantLogo tenant={tenant} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-2xl font-extrabold text-foreground">
            {tenant.name}
          </h2>
          <p className="text-sm text-muted">/{tenant.slug}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Chip>
              Paket {PLAN_LABELS[subscription.plan] ?? subscription.plan}
            </Chip>
            <TenantSubscriptionBadge status={subscription.status} />
            {trial && <Chip>{trial}</Chip>}
            {places && <Chip>{places}</Chip>}
            {joined && <Chip>Bergabung {joined}</Chip>}
          </div>
        </div>
      </div>
    </Card>
  );
}

function IdentitySection({ tenant }: { tenant: Tenant }) {
  return (
    <Section
      title="Identitas"
      hint="Diubah oleh tim Buloo — belum bisa dari sini"
    >
      <dl className="divide-y divide-border">
        <IdentityRow
          label="Nama tampilan"
          note="Muncul di kiri atas dan di semua ekspor"
        >
          {tenant.name}
        </IdentityRow>
        <IdentityRow
          label="Zona waktu"
          note="Menentukan batas hari untuk tutup shift dan laporan harian"
        >
          {tenant.timezone}
        </IdentityRow>
        <IdentityRow label="Mata uang">{tenant.currency}</IdentityRow>
        {PENDING_IDENTITY.map((label) => (
          <IdentityRow key={label} label={label}>
            <Badge variant="outline">Segera</Badge>
          </IdentityRow>
        ))}
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
    <Section
      title="Cabang & gudang"
      hint="Alamat cabang yang tercetak di struk, bukan alamat usaha"
      action={
        <>
          <Link
            href={SETTINGS_PATHS.cabang}
            className="text-sm font-semibold text-primary underline-offset-2 hover:underline"
          >
            Daftar cabang
          </Link>
          {showWarehouses && (
            <Link
              href={SETTINGS_PATHS.gudang}
              className="text-sm font-semibold text-primary underline-offset-2 hover:underline"
            >
              Kelola gudang
            </Link>
          )}
        </>
      }
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

      <p className="mt-3 border-t border-border pt-3 text-xs text-muted">
        Butuh cabang baru? Tiap cabang punya langganan sendiri dan diaktifkan
        oleh tim Buloo — hubungi kami.
      </p>
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
  const contact = [branch.address, branch.phone].filter(Boolean).join(" · ");

  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
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
              : `${warehouses.length} gudang · ${warehouses.map((w) => w.name).join(", ")}`}
          </p>
        )}
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
