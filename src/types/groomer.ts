import type { MediaAsset } from "@/types/inventory";
import type { BookingStatus, BookingWorkStatus, SessionMediaKind } from "@/types/api";

/**
 * What `/api/groomer/*` returns — the groomer's phone app.
 *
 * THE UNIT IS A BOOKING (one animal, one service), with its sessions under it.
 * Who does what stays per session: each row has its own status, clock and crew.
 *
 * NOTHING HERE CARRIES AN OWNER, A PRICE, A COMMISSION OR A MEDICAL FILE, and
 * that is the server's doing: the items are built field by field. A type that
 * invented one of those would be a field the API never sends.
 */
export interface GroomerPet {
  name: string | null;
  species: string | null;
  breed: string | null;
  size: string | null;
  furType: string | null;
  weightKg: number | null;
  /** Condition tags, e.g. "trauma dryer". */
  tags: string[];
  /** How the shop handles this animal. */
  handling: string | null;
}

/** A photo already stored on a session — every field the record route needs back. */
export type GroomerMedia = MediaAsset & { _id: string; kind: SessionMediaKind };

/** Every session carries these, whoever holds it. */
export interface GroomerSessionBase {
  sessionId: string;
  sessionName: string;
  /** This session's own share of the service's minutes; null when unknown. */
  estimateMin: number | null;
  status: BookingWorkStatus;
  /** The caller is on this session. */
  mine: boolean;
  /** Nobody is on it and it is not done — it can be taken. */
  open: boolean;
  /** The OTHER people on it, by name: "bersama Rina" on mine, "dipegang Rio" on theirs. */
  others: string[];
}

/** A session the caller is on: the clock and the permission to start it. */
export interface GroomerSession extends GroomerSessionBase {
  startedAt?: string | null;
  finishedAt?: string | null;
  canStart?: boolean;
  /** Why not, in words — null/absent when `canStart`. */
  startBlock?: string | null;
  afterCount?: number;
  /** Only on the detail read. */
  notesSession?: string | null;
  notesInternalSession?: string | null;
  media?: GroomerMedia[];
}

export interface GroomerBooking {
  bookingId: string;
  /** ISO instant. */
  scheduledAt: string;
  /** The visit's status — the dog's, not a session's. */
  status: BookingStatus;
  serviceName: string | null;
  addons: string[];
  /** Today, confirmed, and the caller is on a session: "Hewan sudah datang". */
  canMarkArrived: boolean;
  pet: GroomerPet;
  sessions: GroomerSession[];
}

export interface GroomerSettings {
  showOwnCommission: boolean;
  allowOpenJobClaim: boolean;
}

export interface GroomerWeekDay {
  /** YYYY-MM-DD, Monday first. */
  date: string;
  /** Animals the caller has that day — a booking counts once. */
  mine: number;
  isToday: boolean;
}

export interface GroomerJobs {
  date: string;
  settings: GroomerSettings;
  week: GroomerWeekDay[];
  load: { plannedMin: number; capacityMin: number; offReason: string | null };
  /** Bookings with a session of mine still to do. */
  saya: GroomerBooking[];
  /** Bookings with a session nobody holds. */
  open: GroomerBooking[];
  /** Bookings held entirely by others. */
  lain: GroomerBooking[];
  /** Bookings where every session of mine is done. */
  selesai: GroomerBooking[];
}

export interface GroomerBookingDetail {
  settings: GroomerSettings;
  booking: GroomerBooking;
}
