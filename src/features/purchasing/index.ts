/**
 * Public surface of the purchasing feature.
 *
 * Pages import from here, never from deep component paths. The entry points map
 * onto the Purchasing dropdown: the hub, then its four sections — suppliers,
 * goods receipts, payables, and returns to supplier.
 */
export { PurchasingHub } from "./components/PurchasingHub";
export { SuppliersScreen } from "./components/SuppliersScreen";
export { SupplierForm } from "./components/SupplierForm";
export { SupplierDetail } from "./components/SupplierDetail";
export { ReceiptsScreen } from "./components/ReceiptsScreen";
export { ReceiptForm } from "./components/ReceiptForm";
export { ReceiptDetail } from "./components/ReceiptDetail";
export { PayablesScreen } from "./components/PayablesScreen";
export { InvoiceDetail } from "./components/InvoiceDetail";
export { PurchaseReturnsScreen } from "./components/PurchaseReturnsScreen";
export { PurchaseReturnForm } from "./components/PurchaseReturnForm";
export { PageHeading } from "./components/PageHeading";
export { PURCHASING_CRUMBS, supplierCrumb } from "./crumbs";
