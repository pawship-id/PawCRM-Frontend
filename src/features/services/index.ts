/**
 * Public surface of the services feature (Master Data → Layanan).
 *
 * Pages import from here, never from deep component paths. The screen entry
 * points map onto the three routes: list, create, edit.
 */
export { ServicesScreen } from "./components/ServicesScreen";
export { ServiceForm } from "./components/ServiceForm";
export { useServices, type ServicesQuery } from "./hooks/useServices";
