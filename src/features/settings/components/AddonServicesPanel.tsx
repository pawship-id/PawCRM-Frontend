"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Pencil, Plus } from "lucide-react";

import { Alert, Spinner } from "@/components";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { serviceEditPath } from "@/features/grooming/serviceDisplay";
import { Can } from "@/features/permissions";
import {
  formatDurationRange,
  formatServicePrice,
  serviceDurationBounds,
} from "@/features/services/format";

import type { UseAddonServiceListResult } from "../hooks/useAddonServiceList";
import { ListItemStatus } from "./ListItemStatus";

const NEW_SERVICE_PATH = "/dashboard/master/layanan/new";

/**
 * Add-on — one section of Pengaturan › Layanan: every add-on service, its price,
 * its length, and how many main services carry it.
 *
 * READ HERE, WRITTEN IN THE SERVICE FORM. An add-on is a service with
 * `serviceType: "addon"`, so "Tambah add-on" and each row's Ubah open the one
 * service editor — a second editor for the same record would be two answers to
 * what a service is.
 *
 * THE MOCKUP'S TAHAPAN, KOMISI AND "DIJUAL TERPISAH" COLUMNS ARE NOT DRAWN. None
 * of the three exists on a service; a switch with nowhere to save to is worse
 * than no switch (ui-rules §16, "Not decided").
 */
export function AddonServicesPanel({
  list,
  intro,
}: {
  list: UseAddonServiceListResult;
  intro?: ReactNode;
}) {
  const { addons, attachedCount, loading, error } = list;
  const firstLoad = loading && addons.length === 0;

  return (
    <div className="flex flex-col gap-5">
      {intro}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted">
          Ditempel ke layanan utama dari form layanan itu.
        </p>
        <Can feature="services" action="create">
          <Button asChild>
            <Link href={NEW_SERVICE_PATH}>
              <Plus className="size-4" aria-hidden />
              Tambah add-on
            </Link>
          </Button>
        </Can>
      </div>

      {error && <Alert variant="error">{error}</Alert>}

      {firstLoad ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
          <Spinner /> Memuat add-on…
        </div>
      ) : error && addons.length === 0 ? null : addons.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-surface px-6 py-12 text-center">
          <p className="font-semibold text-foreground">Belum ada add-on.</p>
          <p className="mt-1 text-sm text-muted">
            Buat layanan baru dan pilih jenis Add-on.
          </p>
          <Can feature="services" action="create">
            <Button asChild variant="ghost" className="mt-2">
              <Link href={NEW_SERVICE_PATH}>Tambah yang pertama →</Link>
            </Button>
          </Can>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <Table className={loading ? "opacity-60" : undefined}>
            <TableHeader>
              <TableRow>
                <TableHead>Nama</TableHead>
                <TableHead className="text-right">Harga</TableHead>
                <TableHead className="text-right">Durasi</TableHead>
                <TableHead>Status</TableHead>
                <Can feature="services" action="update">
                  <TableHead className="text-right">Aksi</TableHead>
                </Can>
              </TableRow>
            </TableHeader>
            <TableBody>
              {addons.map((addon) => {
                const attached = attachedCount[addon._id] ?? 0;

                return (
                  <TableRow key={addon._id}>
                    <TableCell>
                      <p className="font-medium text-foreground">{addon.name}</p>
                      <p className="text-xs text-muted">
                        <span className="tabular-nums">{addon.code}</span>
                        {" · "}
                        {attached === 0
                          ? "belum ditempel ke layanan"
                          : `ditempel ke ${attached} layanan`}
                      </p>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatServicePrice(addon)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatDurationRange(serviceDurationBounds(addon))}
                    </TableCell>
                    <TableCell>
                      <ListItemStatus item={addon} />
                    </TableCell>
                    <Can feature="services" action="update">
                      <TableCell>
                        <div className="flex justify-end">
                          <Button asChild variant="ghost" size="sm">
                            <Link
                              href={serviceEditPath(addon._id)}
                              aria-label={`Ubah ${addon.name}`}
                            >
                              <Pencil className="size-4" aria-hidden />
                              Ubah
                            </Link>
                          </Button>
                        </div>
                      </TableCell>
                    </Can>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
