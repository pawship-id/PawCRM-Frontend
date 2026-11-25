"use client";

import { GroomingServiceDetailScreen } from "@/features/grooming/components/GroomingServiceDetailScreen";
import { GroomingServicesScreen } from "@/features/grooming/components/GroomingServicesScreen";

import { HOTEL_LINE } from "../line";

/**
 * Layanan › Hotel › Layanan & Harga, and one service under it — Grooming's two
 * screens for this line (BO, 21 November 2026: "kalau mirip grooming, pakai
 * flow yang sama"). Client wrappers, as Antar-Jemput's.
 */
export function HotelServicesScreen() {
  return <GroomingServicesScreen serviceLine={HOTEL_LINE} />;
}

export function HotelServiceDetailScreen({ serviceId }: { serviceId: string }) {
  return (
    <GroomingServiceDetailScreen
      serviceId={serviceId}
      serviceLine={HOTEL_LINE}
    />
  );
}
