/**
 * Public surface of the Hotel module — Layanan › Hotel (21 November 2026,
 * PLAN-Hotel-V1.md). Tabs as Grooming's: Ringkasan, Booking, Layanan & Harga,
 * Pengaturan (with Tipe kamar under it).
 */
export {
  HotelServiceDetailScreen,
  HotelServicesScreen,
} from "./components/HotelCatalogScreens";
export { HotelSettingsScreen } from "./components/HotelSettingsScreen";
export { HotelRoomTypesScreen } from "./components/HotelRoomTypesScreen";
export { HotelRoomTypeForm } from "./components/HotelRoomTypeForm";
export { HotelSummaryScreen } from "./components/HotelSummaryScreen";
export { HotelBookingsScreen } from "./components/HotelBookingsScreen";
export { HotelStayCreateScreen } from "./components/HotelStayCreateScreen";
export { HotelStayDetailScreen } from "./components/HotelStayDetailScreen";
export { HotelStayEditScreen } from "./components/HotelStayEditScreen";
export { PetHotelHistory } from "./components/PetHotelHistory";
export { HotelDayStrip } from "./components/HotelDayStrip";
export { HOTEL_LINE } from "./line";
export * from "./paths";
