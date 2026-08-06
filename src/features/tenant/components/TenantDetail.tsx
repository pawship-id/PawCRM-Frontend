"use client";

import type { ReactNode } from "react";

import { Alert, Button, Card, Spinner } from "@/components";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/features/auth";
import type { Tenant } from "@/types/api";

import { useTenant } from "../hooks/useTenant";
import { TenantSubscriptionBadge } from "./TenantSubscriptionBadge";

const PLAN_LABELS: Record<Tenant["subscription"]["plan"], string> = {
  free: "Free",
  basic: "Basic",
  pro: "Pro",
  enterprise: "Enterprise",
};

const HOTEL_MODE_LABELS: Record<Tenant["settings"]["hotelMode"], string> = {
  numbered: "Numbered cages",
  zone: "Named zones",
};

const MS_PER_DAY = 86_400_000;

/**
 * Formats an instant IN THE TENANT'S OWN TIMEZONE.
 *
 * This is the whole reason the tenant carries a `timezone`: a business in
 * Asia/Jakarta reading its trial deadline on a laptop still set to UTC would
 * otherwise be shown a date that is a day out at either end of the day. An
 * invalid or unsupported zone falls back to the browser's rather than throwing
 * — a wrong-looking date beats a screen that will not render.
 */
function formatDate(value: string | null, timeZone: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  try {
    return date.toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone,
    });
  } catch {
    return date.toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  }
}

/**
 * The trial deadline as a sentence rather than a bare date, because the number
 * that matters is how many days are LEFT. Deliberately module-level: Date.now()
 * is impure and calling it in a render body trips react-hooks/purity — the same
 * shape utils/date.ts uses for the expiry badges.
 *
 * Past deadlines are reported as such instead of being clamped to zero: a trial
 * that ended last week while the account still says "trialing" is exactly the
 * state an owner needs to see.
 */
function trialSummary(trialEndsAt: string | null, timeZone: string): string {
  if (!trialEndsAt) return "—";

  const ends = new Date(trialEndsAt);
  if (Number.isNaN(ends.getTime())) return "—";

  const days = Math.ceil((ends.getTime() - Date.now()) / MS_PER_DAY);
  const date = formatDate(trialEndsAt, timeZone);

  if (days < 0) return `${date} (ended ${Math.abs(days)} day(s) ago)`;
  if (days === 0) return `${date} (ends today)`;
  return `${date} (${days} day(s) left)`;
}

/**
 * The signed-in user's business, read-only.
 *
 * READ-ONLY ON PURPOSE. Renaming a business, changing its slug or moving its
 * timezone are not per-user preferences: the slug is a public URL identifier
 * that existing links depend on, and the timezone re-anchors every report and
 * every stock movement date the tenant has. Those edits belong behind
 * PATCH /api/tenants/:id, which is platform-owner administration today. This
 * screen answers "what is my business configured as", which is the question
 * staff actually ask, and it never pretends to be more.
 *
 * The user's own account lives on /dashboard/profile; this is its
 * organizational counterpart.
 */
export function TenantDetail() {
  const { tenant, loading, error, refetch } = useTenant();
  const { user } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
        <Spinner /> Loading business information...
      </div>
    );
  }

  if (error || !tenant) {
    return (
      <div className="flex flex-col items-start gap-3">
        <Alert variant="error">
          {error ?? "Could not load your business information."}
        </Alert>
        <Button variant="secondary" onClick={refetch}>
          Try again
        </Button>
      </div>
    );
  }

  const { subscription, settings, timezone } = tenant;

  return (
    <div className="flex flex-col gap-6">
      <Card title="Business profile" description="Who this workspace belongs to.">
        <div className="flex flex-col gap-6">
          <div className="flex items-center gap-4">
            <TenantLogo tenant={tenant} />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-lg font-semibold text-foreground">
                  {tenant.name}
                </h2>
                <TenantSubscriptionBadge status={subscription.status} />
                {/* A live session on a soft-deleted tenant is a real state — the
                    backend 404s the next read, so say so before it does. */}
                {tenant.deletedAt && (
                  <Badge
                    variant="outline"
                    className="border-transparent bg-danger/12 text-danger"
                  >
                    Deleted
                  </Badge>
                )}
              </div>
              <p className="truncate text-sm text-muted">/{tenant.slug}</p>
            </div>
          </div>

          <DetailList
            rows={[
              { label: "Business name", value: tenant.name },
              {
                label: "Slug",
                value: tenant.slug,
                hint: "The public URL identifier. It is not re-derived when the business is renamed, so existing links keep working.",
              },
              { label: "Timezone", value: timezone },
              { label: "Currency", value: tenant.currency },
              { label: "Tenant ID", value: tenant._id, mono: true },
            ]}
          />
        </div>
      </Card>

      <Card
        title="Subscription"
        description="The plan this workspace runs on."
      >
        <DetailList
          rows={[
            {
              label: "Status",
              value: <TenantSubscriptionBadge status={subscription.status} />,
            },
            {
              label: "Plan",
              value: PLAN_LABELS[subscription.plan] ?? subscription.plan,
            },
            {
              label: "Trial ends",
              value: trialSummary(subscription.trialEndsAt, timezone),
              hint:
                subscription.trialEndsAt === null
                  ? "No trial deadline — this workspace did not start on one."
                  : undefined,
            },
          ]}
        />
      </Card>

      <Card
        title="Settings"
        description="Tenant-wide switches that change how a module behaves."
      >
        <DetailList
          rows={[
            {
              label: "Hotel mode",
              value:
                HOTEL_MODE_LABELS[settings.hotelMode] ?? settings.hotelMode,
              hint: "Whether boarding capacity is addressed by numbered cages or named zones.",
            },
          ]}
        />
      </Card>

      <Card title="Record" description="When this workspace was set up.">
        <DetailList
          rows={[
            { label: "Created", value: formatDate(tenant.createdAt, timezone) },
            {
              label: "Last updated",
              value: formatDate(tenant.updatedAt, timezone),
            },
            {
              label: "Signed in as",
              value: user ? `${user.fullName} (${user.email})` : "—",
              hint: "This page always shows the business of the account you are signed in with.",
            },
          ]}
        />
      </Card>
    </div>
  );
}

/** The tenant's logo, or its initials when it has none. */
function TenantLogo({ tenant }: { tenant: Tenant }) {
  if (tenant.logoUrl) {
    return (
      /* A tenant-supplied absolute URL on an unknown host. next/image would need
         every such host whitelisted in next.config.ts, which is not knowable at
         build time, so a plain <img> is the honest choice here. */
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={tenant.logoUrl}
        alt={`${tenant.name} logo`}
        className="size-14 shrink-0 rounded-xl border border-border object-cover"
      />
    );
  }

  return (
    <span className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-lg font-semibold text-primary">
      {initials(tenant.name)}
    </span>
  );
}

/** Up to two initials from the business name; "?" when it yields none. */
function initials(name: string): string {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");

  return letters || "?";
}

interface DetailRow {
  label: string;
  value: ReactNode;
  /** Optional explanation under the value, for fields whose meaning is not obvious. */
  hint?: string;
  /** Render the value in the mono font — for ids, which are read character by character. */
  mono?: boolean;
}

/**
 * The label/value grid shared by every card on this screen. Same `dl` shape as
 * ProfileSummary, extended with the hint line the tenant fields need: a slug and
 * a hotel mode are not self-explanatory the way an email address is.
 */
function DetailList({ rows }: { rows: DetailRow[] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
      {rows.map((row) => (
        <div key={row.label} className="flex flex-col gap-0.5">
          <dt className="text-xs font-medium uppercase tracking-wide text-muted">
            {row.label}
          </dt>
          <dd
            className={`text-sm text-foreground ${
              row.mono ? "font-mono text-xs" : ""
            }`}
          >
            {row.value}
          </dd>
          {row.hint && <p className="text-xs text-muted">{row.hint}</p>}
        </div>
      ))}
    </dl>
  );
}
