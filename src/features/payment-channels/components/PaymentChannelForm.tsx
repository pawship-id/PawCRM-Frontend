"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  Alert,
  Card,
  FilterSelect,
  FormActionBar,
  SelectField,
  Spinner,
  TextField,
  withAll,
} from "@/components";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ApiError } from "@/services/api-error";
import { paymentChannelService } from "@/services/paymentChannel.service";
import { chartOfAccountsService } from "@/services/chartOfAccounts.service";
import { branchService } from "@/services/branch.service";
import { swalToast } from "@/lib/swal";
import type { PaymentChannel, PaymentChannelType } from "@/types/api";

import {
  CHANNEL_TYPE_LABELS,
  CHANNEL_TYPE_ORDER,
} from "../hooks/usePaymentChannels";

const NAME_MAX_LENGTH = 120;
const MAX_MDR_PERCENT = 100;

/** The API's page cap. Asking for more is a 400, not a bigger page. */
const FETCH_LIMIT = 100;

const LIST_PATH = "/dashboard/keuangan/kas-bank";

/** The two types a processor actually deducts a fee from. Mirrors MDR_TYPES. */
const MDR_TYPES: PaymentChannelType[] = ["qris", "edc"];

const TYPE_OPTIONS = CHANNEL_TYPE_ORDER.map((type) => ({
  value: type,
  label: CHANNEL_TYPE_LABELS[type],
}));

/**
 * Create or edit a payment channel — a **Form Entitas** (ui-rules §16).
 *
 * THE MDR FIELD APPEARS ONLY FOR QRIS AND EDC, rather than being shown and
 * refused. Cash arrives whole and a transfer's fee is paid by the sender, so a
 * rate on either is not a mistake the user should be allowed to make and then be
 * told about — it is a field that has no meaning there. The server refuses it
 * too; this is the half that stops it being typed.
 *
 * THE BRANCH FIELD IS REQUIRED FOR CASH under a per-branch tenant, and the form
 * does not know which the tenant is. It says what happens rather than guessing:
 * the server's refusal names the field, and it is bound to it.
 */
export function PaymentChannelForm({ channelId }: { channelId?: string }) {
  const editing = channelId !== undefined;
  const router = useRouter();

  const [channel, setChannel] = useState<PaymentChannel | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<
    { value: string; label: string }[]
  >([]);
  const [branches, setBranches] = useState<{ value: string; label: string }[]>(
    [],
  );
  const [lookupError, setLookupError] = useState<string | null>(null);

  const [type, setType] = useState<PaymentChannelType>("cash");
  const [name, setName] = useState("");
  const [accountId, setAccountId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [mdrPercent, setMdrPercent] = useState("");
  const [requiresReference, setRequiresReference] = useState(false);
  const [isActive, setIsActive] = useState(true);

  const [nameError, setNameError] = useState<string | null>(null);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [branchError, setBranchError] = useState<string | null>(null);
  const [mdrError, setMdrError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const chargesMdr = MDR_TYPES.includes(type);

  useEffect(() => {
    let active = true;

    Promise.all([
      // Only assets can be a channel's account — the server refuses anything
      // else — so offering the rest would be offering a guaranteed 400.
      chartOfAccountsService.list({
        accountType: "asset",
        isActive: true,
        limit: FETCH_LIMIT,
      }),
      branchService.list({ limit: FETCH_LIMIT }),
    ])
      .then(([accountPage, branchPage]) => {
        if (!active) return;
        setAccounts(
          accountPage.items.map((account) => ({
            value: account._id,
            label: `${account.code} · ${account.name}`,
          })),
        );
        setBranches(
          branchPage.items.map((branch) => ({
            value: branch._id,
            label: branch.name,
          })),
        );
      })
      .catch(() => {
        if (!active) return;
        // Our own sentence, never the server's English.
        setLookupError("Daftar akun dan cabang tidak bisa dimuat. Coba muat ulang.");
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!channelId) return;

    let active = true;

    paymentChannelService
      .getById(channelId)
      .then((result) => {
        if (!active) return;
        setChannel(result);
        setType(result.type);
        setName(result.name);
        setAccountId(result.accountId);
        setBranchId(result.branchId ?? "");
        setMdrPercent(result.mdrPercent > 0 ? String(result.mdrPercent) : "");
        setRequiresReference(result.requiresReference);
        setIsActive(result.isActive);
      })
      .catch((error) => {
        if (!active) return;
        setLoadError(
          error instanceof ApiError
            ? error.message
            : "Data channel ini tidak bisa dimuat.",
        );
      });

    return () => {
      active = false;
    };
  }, [channelId]);

  /**
   * Switching to a type that charges no fee clears the rate.
   *
   * The field disappears, and a value left behind in state would be sent on the
   * next save — a 400 for something the user can no longer see, which is the
   * worst kind of refusal to receive.
   */
  function changeType(next: PaymentChannelType) {
    setType(next);
    setMdrError(null);
    if (!MDR_TYPES.includes(next)) {
      setMdrPercent("");
    }
    // The type-derived default, applied on a change rather than only at mount so
    // moving cash → transfer picks up the reference requirement. Only when the
    // user has not already decided for themselves — hence the create-only guard.
    if (!editing) {
      setRequiresReference(next !== "cash");
    }
  }

  function goBack() {
    router.push(LIST_PATH);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;

    const trimmedName = name.trim();
    let invalid = false;

    if (trimmedName === "") {
      setNameError("Nama channel wajib diisi.");
      invalid = true;
    } else if (trimmedName.length > NAME_MAX_LENGTH) {
      setNameError(`Maksimal ${NAME_MAX_LENGTH} karakter.`);
      invalid = true;
    }
    if (!accountId) {
      setAccountError("Pilih akun yang dicatat saat uang masuk lewat sini.");
      invalid = true;
    }

    const mdr = mdrPercent.trim() === "" ? 0 : Number(mdrPercent.trim());
    if (
      chargesMdr &&
      mdrPercent.trim() !== "" &&
      (Number.isNaN(mdr) || mdr < 0 || mdr > MAX_MDR_PERCENT)
    ) {
      setMdrError(`Isi persen antara 0 dan ${MAX_MDR_PERCENT}. Contoh: 0.7`);
      invalid = true;
    }

    if (invalid) return;

    setSaving(true);
    setFormError(null);

    const payload = {
      type,
      name: trimmedName,
      accountId,
      // "" means tenant-wide, which the API expects as an explicit null rather
      // than an omitted key.
      branchId: branchId || null,
      mdrPercent: chargesMdr ? mdr : 0,
      requiresReference,
    };

    try {
      if (editing) {
        await paymentChannelService.update(channelId, { ...payload, isActive });
      } else {
        await paymentChannelService.create(payload);
      }

      goBack();
      swalToast(
        editing ? "Channel diperbarui." : `Channel ${trimmedName} dibuat.`,
      );
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setNameError(
          `Sudah ada channel ${CHANNEL_TYPE_LABELS[type]} bernama "${trimmedName}".`,
        );
      } else if (error instanceof ApiError && error.status === 400) {
        // The server's four business rules come back attributed to a field, so
        // they belong on that field rather than in a banner.
        const field = error.details?.[0]?.field;
        if (field === "accountId") {
          setAccountError(
            "Akun ini tidak bisa dipakai — harus akun aset yang masih aktif.",
          );
        } else if (field === "branchId") {
          setBranchError(
            "Tenant ini menghitung kas per cabang, jadi channel tunai harus punya cabang.",
          );
        } else if (field === "mdrPercent") {
          setMdrError("MDR cuma berlaku untuk QRIS dan EDC.");
        } else {
          setFormError(error.reason ?? error.message);
        }
      } else {
        setFormError(
          error instanceof ApiError
            ? (error.reason ?? error.message)
            : "Terjadi kesalahan. Coba lagi.",
        );
      }
      setSaving(false);
    }
  }

  if (loadError) {
    return <Alert variant="error">{loadError}</Alert>;
  }

  if (editing && !channel) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
        <Spinner /> Memuat data channel…
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
      <FormActionBar
        title={editing ? "Ubah channel" : "Channel baru"}
        meta={editing ? (channel?.name ?? undefined) : undefined}
        submitLabel={editing ? "Simpan channel" : "Buat channel"}
        submitting={saving}
        onCancel={goBack}
      />

      {formError && <Alert variant="error">{formError}</Alert>}
      {lookupError && <Alert variant="error">{lookupError}</Alert>}

      <Card
        title="Identitas"
        description="Tipe menentukan tab mana channel ini muncul di kasir. Namanya yang dibaca kasir, jadi tulis lengkap dengan nomor rekeningnya."
      >
        <div className="flex flex-col gap-4">
          <SelectField
            label="Tipe"
            value={type}
            onChange={(next) => changeType(next as PaymentChannelType)}
            options={TYPE_OPTIONS}
            disabled={saving}
            required
          />

          <TextField
            label="Nama channel"
            name="name"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setNameError(null);
            }}
            error={nameError ?? undefined}
            placeholder={
              type === "cash" ? "mis. Kas — Toko Pusat" : "mis. BCA — 8730123456"
            }
            maxLength={NAME_MAX_LENGTH}
            hint="Nomor rekening ikut ditulis di sini — itu yang membedakan dua rekening bank yang sama."
            autoFocus
            disabled={saving}
            required
          />
        </div>
      </Card>

      <Card
        title="Akuntansi"
        description="Ke akun mana uang yang masuk lewat channel ini dicatat. Harus akun aset — uang masuk itu debit."
      >
        <div className="flex flex-col gap-4">
          <FilterSelect
            layout="form"
            label="Akun"
            ariaLabel="Pilih akun"
            value={accountId}
            options={accounts}
            onChange={(next) => {
              setAccountId(next);
              setAccountError(null);
            }}
            active={false}
            placeholder="Pilih akun aset"
            searchable
            required
            disabled={saving}
            error={accountError ?? undefined}
          />

          {chargesMdr && (
            <TextField
              label="MDR (%)"
              name="mdrPercent"
              inputMode="decimal"
              value={mdrPercent}
              onChange={(event) => {
                setMdrPercent(event.target.value);
                setMdrError(null);
              }}
              error={mdrError ?? undefined}
              placeholder="0.7"
              hint="Potongan penyedia sebelum uangnya cair. Dicatat sebagai beban terpisah, bukan pengurang penjualan — pelanggan tetap bayar penuh."
              disabled={saving}
            />
          )}
        </div>
      </Card>

      <Card
        title="Cakupan & aturan"
        description="Cabang mana yang boleh memakai channel ini, dan apakah kasir wajib mencatat nomor referensi."
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <FilterSelect
              layout="form"
              label="Cabang"
              ariaLabel="Pilih cabang"
              value={branchId}
              options={withAll(branches, "Semua cabang")}
              onChange={(next) => {
                setBranchId(next);
                setBranchError(null);
              }}
              active={false}
              placeholder="Semua cabang"
              searchable
              disabled={saving}
              error={branchError ?? undefined}
            />
            <p className="text-xs text-muted">
              Rekening bank biasanya dipakai semua cabang. Laci kas justru
              sebaliknya — kalau tenant ini menghitung kas per cabang, channel
              tunai wajib punya cabang.
            </p>
          </div>

          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <Label htmlFor="channel-requires-reference">
                Wajib nomor referensi
              </Label>
              <p className="mt-1 max-w-prose text-xs text-muted">
                Kasir harus mengisi nomor transfer atau approval code sebelum
                pembayaran bisa diselesaikan. Matikan kalau mesinnya memang tidak
                mengeluarkan nomor.
              </p>
            </div>
            <Switch
              id="channel-requires-reference"
              checked={requiresReference}
              onCheckedChange={setRequiresReference}
              disabled={saving}
            />
          </div>
        </div>
      </Card>

      {editing && (
        <Card
          title="Ketersediaan"
          description="Channel nonaktif tidak hilang — cuma berhenti ditawarkan di kasir."
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <Label htmlFor="channel-active">Aktif</Label>
              <p className="mt-1 max-w-prose text-xs text-muted">
                Matikan kalau rekeningnya ditutup atau mesinnya ditarik.
                Transaksi lama yang memakainya tetap utuh dan tetap terbaca.
              </p>
            </div>
            <Switch
              id="channel-active"
              checked={isActive}
              onCheckedChange={setIsActive}
              disabled={saving}
            />
          </div>
        </Card>
      )}
    </form>
  );
}
