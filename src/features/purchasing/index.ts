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
// Filing the vendor's bill against a delivery. Its own entry point because it is
// its own route — the payable already exists by the time this screen is opened.
export { FileInvoiceForm } from "./components/FileInvoiceForm";
export { PurchaseReturnsScreen } from "./components/PurchaseReturnsScreen";
export { PurchaseReturnForm } from "./components/PurchaseReturnForm";
// A return has a life before it posts, so unlike a receipt it has a detail
// screen that can still change it: edit the draft, preview, submit, discard.
export { PurchaseReturnDetail } from "./components/PurchaseReturnDetail";
export { PageHeading } from "./components/PageHeading";
/**
 * Exported because the REPORTS feature drills into it too. Consigned stock is a
 * purchasing concept — it belongs to a vendor relationship — so the table lives
 * here and the report borrows it, rather than a second copy growing over there
 * with its own idea of what "still on the shelf" means.
 */
export { ConsignmentProductsTable } from "./components/ConsignmentProductsTable";
export { PURCHASING_CRUMBS, supplierCrumb } from "./crumbs";
