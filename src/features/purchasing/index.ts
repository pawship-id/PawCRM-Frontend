/**
 * Public surface of the purchasing feature.
 *
 * Pages import from here, never from deep component paths. The entry points map
 * onto the Purchasing dropdown: the hub, then its four sections — suppliers,
 * goods receipts, payables, and returns to supplier.
 */
export { PurchasingHub } from "./components/PurchasingHub";
export { SuppliersScreen } from "./components/SuppliersScreen";
export { SupplierCreateForm } from "./components/SupplierCreateForm";
export { SupplierEditForm } from "./components/SupplierEditForm";
export { SupplierDetail } from "./components/SupplierDetail";
// The picker the receipt and return forms choose a vendor with. Exported here
// because it is the only supported way to list suppliers for selection — it is
// what keeps a deactivated vendor out of a new purchase.
export { SupplierSelect } from "./components/SupplierSelect";
export { ReceiptsScreen } from "./components/ReceiptsScreen";
export { ReceiptForm } from "./components/ReceiptForm";
export { ReceiptDetail } from "./components/ReceiptDetail";
export { PayablesScreen } from "./components/PayablesScreen";
export { InvoiceDetail } from "./components/InvoiceDetail";
export { PurchaseReturnsScreen } from "./components/PurchaseReturnsScreen";
export { PurchaseReturnForm } from "./components/PurchaseReturnForm";
export { PageHeading } from "./components/PageHeading";
export { PURCHASING_CRUMBS, supplierCrumb } from "./crumbs";
