"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MapPin, MessageCircle, Pencil } from "lucide-react";

import { Alert, Breadcrumb, Card, Spinner } from "@/components";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Can } from "@/features/permissions";
import { CustomerPetsSection } from "@/features/pets";
import { ApiError } from "@/services/api-error";
import { customerService } from "@/services/customer.service";
import type { Customer } from "@/types/api";
import { whatsAppLink } from "@/utils/phone";

import { CustomerHistorySection } from "./CustomerHistorySection";
import { CustomerValueSection } from "./CustomerValueSection";
import { CustomerVipBadge, CustomerStatusBadge } from "./CustomerVipBadge";

/** "12 Januari 2025" — a date somebody reads aloud. */
function day(iso: string): string {
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

/** "RW" — the mockup's avatar, from the name, since customers have no photo. */
function initials(name: string): string {
  const words = name.trim().split(/\s+/).slice(0, 2);
  return words.map((word) => word[0]?.toUpperCase() ?? "").join("") || "?";
}

/**
 * A customer's profile — the mockup's `profilPelanggan` (buloo-navigation-v3).
 *
 * READ, NOT EDIT, and that is the whole reason this route changed. `/master/
 * customers/:id` used to BE the edit form, gated on `customers:update`, so
 * "who is this person" and "change this person" were one screen behind one grant.
 * Two things were wrong with that, and the second is the one that matters:
 *
 *   A FORM ANSWERS IN FIELD VALUES. Somebody opening a customer to see what the
 *   shop knows about them got a column of inputs, with the interesting parts —
 *   their animals, what they owe, when they last came in — either absent or
 *   below a save button they had no business pressing.
 *
 *   AND IT ASKED FOR A PERMISSION IT DOES NOT NEED. A groomer who may not edit a
 *   customer still has to know whose dog this is and which number to ring. Editing
 *   has its own route now — `/master/customers/:id/edit`, behind `update` — and the
 *   button to it is hidden from anybody who cannot use it.
 *
 * THE SAME SHAPE THE PET PROFILE TOOK (PetProfileScreen, PCR-044), with one
 * difference: STACKED SECTIONS RATHER THAN TABS. A pet's profile has four bodies
 * of detail that each fill a screen, so tabs earn their cost; a customer's has
 * five short ones, and the mockup stacks them for the same reason — the answer to
 * "should I chase this person" is their piutang next to their last visit, and a tab
 * would hide one of the two.
 *
 * WHAT IS BADGED "Segera" RATHER THAN DRAWN. Jenis pelanggan (Perorangan /
 * Perusahaan), Kategori pelanggan, NPWP, PIC, tag and catatan are all on the
 * mockup and none of them exist on `customer.model.js`. Shown as rows with the
 * badge, because a row that is missing is a field somebody assumes is there and
 * goes looking for in the form.
 */
export function CustomerProfileScreen({ id }: { id: string }) {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);

    customerService
      .getById(id)
      .then((result) => {
        if (!active) return;
        setCustomer(result);
        setError(null);
      })
      .catch((err) => {
        if (!active) return;
        setError(
          err instanceof ApiError
            ? err.message
            : "Data pelanggan ini tidak bisa dimuat.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-16 text-sm text-muted">
        <Spinner /> Memuat pelanggan…
      </div>
    );
  }

  if (error || !customer) {
    return <Alert variant="error">{error ?? "Pelanggan tidak ditemukan."}</Alert>;
  }

  const deleted = customer.deletedAt !== null;
  const chat = whatsAppLink(customer.phone);
  const pinned =
    customer.location?.lat != null && customer.location?.lng != null;

  return (
    <div className="flex flex-col gap-5">
      <Breadcrumb
        items={[
          { label: "Pelanggan", href: "/dashboard/master/customers" },
          { label: customer.name },
        ]}
      />

      {/* ── THE HEADING: who this is, and the two things to do about it ── */}
      <div className="flex flex-wrap items-start gap-4">
        <span
          aria-hidden="true"
          className="flex size-14 flex-none items-center justify-center rounded-2xl bg-secondary text-lg font-extrabold text-secondary-foreground"
        >
          {initials(customer.name)}
        </span>

        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold text-foreground">
            {customer.name}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {[customer.phone, customer.email].filter(Boolean).join(" · ") ||
              "Belum ada kontak tersimpan"}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <CustomerStatusBadge deleted={deleted} />
            {customer.vipTier && <CustomerVipBadge tier={customer.vipTier} />}
            <Badge variant="outline" className="font-normal text-muted">
              Sejak {day(customer.createdAt)}
            </Badge>
          </div>
        </div>

        <div className="ml-auto flex flex-none flex-wrap gap-2">
          {chat && (
            <Button asChild variant="secondary" size="sm">
              <a href={chat} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="size-4" />
                Chat WhatsApp
              </a>
            </Button>
          )}
          <Can feature="customers" action="update">
            <Button asChild size="sm">
              <Link href={`/dashboard/master/customers/${customer._id}/edit`}>
                <Pencil className="size-4" />
                Ubah
              </Link>
            </Button>
          </Can>
        </div>
      </div>

      {deleted && (
        <Alert variant="info">
          Pelanggan ini sudah dihapus. Datanya masih lengkap dan bisa dipulihkan
          dari halaman Ubah.
        </Alert>
      )}

      {/* ── IDENTITAS ── */}
      <Card
        title="Identitas"
        description="Data pemilik. Data hewan diubah dari kartunya masing-masing."
      >
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <Row label="Nama" value={customer.name} />
          <Row label="WhatsApp / telepon" value={customer.phone ?? "—"} />
          <Row label="Email" value={customer.email ?? "—"} />
          <Row label="Tier VIP" value={<CustomerVipBadge tier={customer.vipTier} />} />
          <Row
            label="Alamat"
            value={customer.address ?? "—"}
            className="sm:col-span-2"
          />
          {/*
            THE PIN IS NOT DECORATION. Zona pricing for antar-jemput is quoted from
            the straight-line distance between this point and the transaction's
            branch, so an address with no pin is a customer a zone-priced service
            is refused for — and this row is where somebody finds that out.
          */}
          <Row
            label="Titik lokasi"
            value={
              pinned ? (
                <span className="inline-flex items-center gap-1.5 tabular-nums">
                  <MapPin className="size-3.5 text-muted" />
                  {customer.location?.lat}, {customer.location?.lng}
                </span>
              ) : (
                <span className="text-muted">
                  Belum ditandai — layanan berzona belum bisa dihitung
                </span>
              )
            }
            className="sm:col-span-2"
          />
          <Row label="Terdaftar sejak" value={day(customer.createdAt)} />
          <Row label="Terakhir diubah" value={day(customer.updatedAt)} />

          <PendingRow
            label="Jenis pelanggan"
            blockedBy="Perorangan dan Perusahaan belum dibedakan di sistem"
          />
          <PendingRow
            label="Kategori pelanggan"
            blockedBy="Daftarnya sudah ada di Pengaturan › Tipe pelanggan, tapi pelanggan belum bisa menunjuk salah satunya"
          />
          <PendingRow
            label="NPWP & PIC"
            blockedBy="Menunggu jenis pelanggan Perusahaan"
          />
          <PendingRow
            label="Tag & catatan"
            blockedBy="Belum ada field catatan pelanggan — catatan penanganan per hewan sudah ada di profil hewannya"
          />
        </dl>
      </Card>

      {/* ── HEWAN ── */}
      <Can feature="pets" action="read">
        <Card
          title="Hewan"
          description="Hewan yang terdaftar atas nama pelanggan ini. Yang sudah tidak dirawat tetap ditampilkan — riwayatnya masih di sini."
        >
          <CustomerPetsSection
            customerId={customer._id}
            customerName={customer.name}
            disabled={deleted}
          />
        </Card>
      </Can>

      {/* ── MEMBERSHIP ── */}
      <Card
        title="Membership"
        description="Paket keanggotaan, masa berlaku, dan pengingat perpanjangan."
      >
        <div className="flex flex-wrap items-center gap-3 py-2">
          <Badge variant="outline">Segera</Badge>
          <p className="text-sm text-muted">
            Membership belum ada di sistem. Untuk sekarang tier VIP{" "}
            <span className="font-medium text-foreground">
              {customer.vipTier ?? "belum diisi"}
            </span>{" "}
            yang dipakai sebagai penanda pelanggan istimewa.
          </p>
        </div>
      </Card>

      {/* ── NILAI PELANGGAN ── */}
      <Can feature="customerInvoices" action="read">
        <Card
          title="Nilai pelanggan"
          description="Dari faktur yang sudah terbit, bukan draf."
        >
          <CustomerValueSection customerId={customer._id} />
        </Card>
      </Can>

      {/* ── RIWAYAT ── */}
      <Can feature="posTransactions" action="read">
        <Card
          title="Riwayat"
          description="Transaksi kasir yang sudah lunas, terbaru di atas."
        >
          <CustomerHistorySection customerId={customer._id} />
        </Card>
      </Can>
    </div>
  );
}

function Row({
  label,
  value,
  className,
}: {
  label: string;
  value: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="text-sm text-foreground">{value}</dd>
    </div>
  );
}

/** A field the mockup asks for that this database has no column for. */
function PendingRow({
  label,
  blockedBy,
}: {
  label: string;
  blockedBy: string;
}) {
  return (
    <div aria-disabled="true" className="opacity-60">
      <dt className="flex items-center gap-1.5 text-xs text-muted">
        {label}
        <Badge variant="outline" className="font-normal">
          Segera
        </Badge>
      </dt>
      <dd className="text-xs text-muted">{blockedBy}</dd>
    </div>
  );
}
