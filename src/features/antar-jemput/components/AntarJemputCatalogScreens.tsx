"use client";

import { GroomingServiceDetailScreen } from "@/features/grooming/components/GroomingServiceDetailScreen";
import { GroomingServicesScreen } from "@/features/grooming/components/GroomingServicesScreen";

import { ANTAR_JEMPUT_LINE } from "../line";

/**
 * Layanan › Antar-Jemput › Layanan & Harga, and one service under it — Grooming's
 * two screens, for this line (BO's note 7: "persis grooming").
 *
 * CLIENT WRAPPERS, because a line carries a function (`pick`) and a server page
 * cannot hand a function to a client component.
 */
export function AntarJemputServicesScreen() {
  return <GroomingServicesScreen serviceLine={ANTAR_JEMPUT_LINE} />;
}

export function AntarJemputServiceDetailScreen({ serviceId }: { serviceId: string }) {
  return <GroomingServiceDetailScreen serviceId={serviceId} serviceLine={ANTAR_JEMPUT_LINE} />;
}
