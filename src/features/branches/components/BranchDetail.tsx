"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Building2, Warehouse as WarehouseIcon } from "lucide-react";

import { Alert, Card, Spinner } from "@/components";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/features/permissions";
import { SettingsPageHeader } from "@/features/settings/components/SettingsHeader";
import { SETTINGS_PATHS } from "@/features/settings/paths";
import { ApiError } from "@/services/api-error";
import { branchService } from "@/services/branch.service";
import { warehouseService } from "@/services/warehouse.service";
import type { Branch, Warehouse } from "@/types/api";

import { branchHoursSummary, formatOperatingDays } from "../hours";
import { BranchStatusBadge } from "./BranchStatusBadge";

/**
 * Pengaturan › Cabang › one branch — what this place IS, and where its stock
 * sits (28 September 2026, on request).
 *
 * IT TOOK OVER THE `/cabang/:id` ADDRESS from `BranchEditForm`, which moved to
 * `/cabang/:id/edit`. The split is the one Kas & Bank's transaction already
 * makes (docs/ui-rules.md §16): a document is READ far more often than it is
 * changed, and the read should not demand the grant the change does. The edit
 * form is gated on `branches:update`, so while it sat on this address a role
 * that may only look at the branch list had nowhere to click through TO — the
 * row's "Kelola" was hidden from them entirely.
 *
 * ⚠️ THE WAREHOUSES ARE A SECOND REQUEST, not a field on the branch. Nothing on
 * `Branch` says which warehouses point at it — the pointer lives the other way
 * round, on `warehouse.defaultBranchId` — so this asks
 * `GET /warehouses?defaultBranchId=`. It is fetched independently and fails
 * independently: a branch stays readable when the warehouse list does not load,
 * because the branch's own facts are what the page is for.
 *
 * CENTRAL WAREHOUSES ARE NOT HERE, deliberately. A warehouse with no
 * `defaultBranchId` serves every branch and belongs to none, so listing it
 * under each one would claim an ownership no document records.
 */
export function BranchDetail({ id }: { id: string }) {
  const { can } = usePermissions();
  const mayReadWarehouses = can("warehouses", "read");

  const [branch, setBranch] = useState<Branch | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    branchService
      .getById(id)
      .then((result) => {
        if (active) setBranch(result);
      })
      .catch((error) => {
        if (!active) return;
        setLoadError(
          error instanceof ApiError
            ? error.fullMessage
            : "Data cabang ini tidak bisa dimuat.",
        );
      });
    return () => {
      active = false;
    };
  }, [id]);

  return (
    <div className="flex flex-col gap-6">
      <SettingsPageHeader
        tab="umum"
        title={branch?.name ?? "Cabang"}
        description="Alamat yang tercetak di struk cabang ini, jam bukanya, dan gudang tempat stoknya disimpan."
        action={
          branch && can("branches", "update") ? (
            <Button asChild variant="secondary">
              <Link href={`${SETTINGS_PATHS.cabang}/${branch._id}/edit`}>
                Ubah cabang
              </Link>
            </Button>
          ) : undefined
        }
      />

      {loadError ? (
        <Alert variant="error">{loadError}</Alert>
      ) : !branch ? (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted">
          <Spinner /> Memuat cabang…
        </div>
      ) : (
        <>
          <BranchHero branch={branch} />
          <IdentityCard branch={branch} />
          {mayReadWarehouses && <BranchWarehouses branchId={branch._id} />}
        </>
      )}
    </div>
  );
}

/** Name, code and state — the three things somebody checks they opened the right branch by. */
function BranchHero({ branch }: { branch: Branch }) {
  return (
    <Card>
      <div className="flex flex-wrap items-start gap-4">
        <span className="flex size-12 flex-none items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Building2 className="size-6" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-bold text-foreground">{branch.name}</h2>
            <BranchStatusBadge
              isActive={branch.isActive}
              deleted={branch.deletedAt !== null}
            />
          </div>
          <p className="mt-1 text-sm text-muted">
            {[branch.city, branch.phone].filter(Boolean).join(" · ") ||
              "Kota dan telepon belum diisi"}
          </p>
        </div>
      </div>
    </Card>
  );
}

function IdentityCard({ branch }: { branch: Branch }) {
  const hours = branchHoursSummary(branch);
  const days = formatOperatingDays(branch.operatingDays ?? []);

  return (
    <Card
      title="Identitas & jam buka"
      description="Dipakai di struk cabang ini dan di nomor dokumennya."
    >
      <dl className="divide-y divide-border">
        {/*
          THE CODE IS WORTH ITS OWN ROW AND ITS OWN WARNING. A branch with no
          code cannot issue an invoice at all — the API refuses and names the
          branch — so an empty one is not a cosmetic gap, it is a branch that
          will fail at the till.
        */}
        <Row label="Kode cabang" note="Muncul di tengah nomor dokumen, mis. INV/CBS/2609/0001.">
          {branch.code ? (
            <span className="tabular-nums">{branch.code}</span>
          ) : (
            <span className="text-danger">
              Belum diisi — cabang ini belum bisa menerbitkan faktur
            </span>
          )}
        </Row>
        <Row label="Alamat" note="Alamat cabang, bukan alamat usaha.">
          {branch.address || "—"}
        </Row>
        <Row label="Kota">{branch.city || "—"}</Row>
        <Row label="Telepon">
          {branch.phone ? (
            <span className="tabular-nums">{branch.phone}</span>
          ) : (
            "—"
          )}
        </Row>
        <Row
          label="Jam buka"
          note="Belum ada yang menegakkan jam ini — disimpan untuk penjadwalan booking nanti."
        >
          {hours ?? "Belum diisi"}
        </Row>
        <Row label="Hari operasional">{days || "Belum diisi"}</Row>
        <Row label="Catatan kaki struk">{branch.receiptFooter || "—"}</Row>
        {/*
          READ DEFENSIVELY. `location` arrived after the collection did and the
          backend's list reads use `.lean()`, which skips schema defaults — so a
          branch written before the field comes back with no `location` key at
          all, not with a pair of nulls.
        */}
        <Row
          label="Titik peta"
          note="Menentukan zona antar-jemput dihitung dari mana."
        >
          {branch.location?.lat != null && branch.location?.lng != null ? (
            <span className="tabular-nums">
              {branch.location.lat}, {branch.location.lng}
            </span>
          ) : (
            "Belum dipasang"
          )}
        </Row>
        <Row label="Dibuat">{fullDate(branch.createdAt)}</Row>
        <Row label="Terakhir diubah">{fullDate(branch.updatedAt)}</Row>
      </dl>
    </Card>
  );
}

/** "14 September 2026, 09.30" — module scope because `toLocaleString` is impure. */
function fullDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Row({
  label,
  note,
  children,
}: {
  label: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1 py-3 sm:grid-cols-[210px_minmax(0,1fr)] sm:gap-4">
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

/**
 * The warehouses filed under this branch.
 *
 * DELETED ONES ARE LEFT OUT and retired ones are not: a deactivated warehouse
 * still holds this branch's stock and still has to be accounted for, so hiding
 * it would understate the place. It is badged rather than dropped.
 */
function BranchWarehouses({ branchId }: { branchId: string }) {
  const { can } = usePermissions();
  const [warehouses, setWarehouses] = useState<Warehouse[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    warehouseService
      .list({ defaultBranchId: branchId, limit: 100 })
      .then((result) => {
        if (active) setWarehouses(result.items);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [branchId]);

  const tills = warehouses?.filter((warehouse) => warehouse.hasPos).length ?? 0;

  return (
    <Card
      title="Gudang di cabang ini"
      description={
        warehouses === null
          ? "Tempat stok cabang ini benar-benar berada."
          : `${warehouses.length} gudang · ${tills} punya kasir`
      }
      action={
        can("warehouses", "read") ? (
          <Link
            href={SETTINGS_PATHS.gudang}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-surface-hover"
          >
            Semua gudang
          </Link>
        ) : undefined
      }
    >
      {error ? (
        <Alert variant="info">Daftar gudang tidak bisa dimuat.</Alert>
      ) : warehouses === null ? (
        <div className="flex items-center gap-2 py-4 text-sm text-muted">
          <Spinner /> Memuat gudang…
        </div>
      ) : warehouses.length === 0 ? (
        /*
          IN PRACTICE UNREACHABLE, and kept anyway. Every branch is given a
          default warehouse the moment it is created (branch.service.js calls
          `ensureDefaultWarehouse`), so this can only show for a branch made
          before that, or one whose warehouses were all deleted.
        */
        <p className="py-4 text-sm text-muted">
          Belum ada gudang di cabang ini. Stok tidak bisa masuk sampai ada
          satu.{" "}
          <Link
            href={`${SETTINGS_PATHS.gudang}/new`}
            className="font-semibold text-foreground underline underline-offset-2"
          >
            Tambah gudang →
          </Link>
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {warehouses.map((warehouse) => (
            <WarehouseRow key={warehouse._id} warehouse={warehouse} />
          ))}
        </ul>
      )}
    </Card>
  );
}

function WarehouseRow({ warehouse }: { warehouse: Warehouse }) {
  const pic = [warehouse.picName, warehouse.picPhone].filter(Boolean).join(" · ");

  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <span className="flex size-10 flex-none items-center justify-center rounded-lg bg-primary/10 text-primary">
        <WarehouseIcon className="size-5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-foreground">
          {warehouse.name}
          {warehouse.hasPos && <Badge variant="outline">Kasir</Badge>}
          {warehouse.isDefault && <Badge variant="outline">Bawaan cabang</Badge>}
          {!warehouse.isActive && <Badge variant="outline">Nonaktif</Badge>}
        </p>
        <p className="text-xs text-muted">
          {warehouse.address || "Alamat belum diisi"}
        </p>
        <p className="text-xs text-muted">{pic || "PIC belum diisi"}</p>
      </div>
      <Link
        href={`${SETTINGS_PATHS.gudang}/${warehouse._id}`}
        className="flex-none rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-surface-hover"
      >
        Kelola
      </Link>
    </li>
  );
}
