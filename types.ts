
export interface ProductBatch {
  id: string;
  batchNumber?: string;
  purchaseOrderId?: string;
  timestamp: number;
  date?: string;
  purchaseCost: number;        // Cost price for this specific batch
  initialQuantity: number;    // Quantity originally purchased in this batch
  remainingQuantity: number;  // Available unsold quantity in this batch
  supplierName?: string;
}

export interface ProductVariant {
  id: string;                 // Unique variant ID, e.g. "var-10001-M"
  size: string;               // e.g. "S", "M", "L", "XL", "XXL"
  sku: string;                // Barcode for this exact size/variation
  price: number;              // Selling price for this size
  cost: number;               // Latest cost price or default cost price
  costPrice?: number;         // Compatibility alias
  stock: number;              // Current total in-stock quantity for this size
  branchStocks?: Record<string, number>; // Cashier 1, Cashier 2, etc.
  batches?: ProductBatch[];   // Purchase batches with costs & remaining stock
}

export interface BatchAllocation {
  batchId: string;
  quantity: number;
  costPrice: number;
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  price: number;
  cost: number;
  costPrice?: number;
  stock: number;
  branchStocks?: Record<string, number>;
  categoryId: string;
  vendorId?: string;
  lowStockThreshold: number;
  userId?: string;
  internalNotes?: string;
  extraDetails?: string;
  sinhalaName?: string;
  c4FreeText?: string;
  c4FreeTextSinhala?: string;
  imageUrl?: string;
  hasSizes?: boolean;
  variants?: ProductVariant[];
  batches?: ProductBatch[];
  costingMethod?: 'FIFO' | 'WEIGHTED_AVG';
}

export interface Category {
  id: string;
  name: string;
  userId?: string;
}

export interface Vendor {
  id: string;
  name: string;
  contactPerson: string;
  email: string;
  phone: string;
  address: string;
  totalBalance: number;
  userId?: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  totalCredit: number;
  creditLimit: number;
  userId?: string;
}

export type POStatus = 'DRAFT' | 'PENDING' | 'RECEIVED' | 'CANCELLED';

export interface PurchaseOrderItem {
  productId: string;
  productName?: string; // Store product name at time of PO creation
  productSku?: string;  // Store SKU at time of PO creation
  quantity: number;
  freeQuantity?: number; // Support for free issue items
  cost: number;
  discount?: number; // Line item discount
  discountPercent?: number; // Line item discount percentage
  variantId?: string; // For sized products
  size?: string;      // e.g. "S", "M", "L"
  sellingPrice?: number; // Configurable new selling price
}

export interface ChequeItem {
  chequeNumber: string;
  chequeDate: string;
  amount?: number;
}

export interface PurchaseOrder {
  id: string;
  date: string;
  receivedDate?: string;
  vendorId: string;
  items: PurchaseOrderItem[];
  status: POStatus;
  totalAmount: number;
  paymentMethod: 'CASH' | 'BANK' | 'CARD' | 'CREDIT' | 'CHEQUE';
  accountId?: string;
  chequeNumber?: string;
  chequeDate?: string;
  chequeNumber2?: string;
  chequeDate2?: string;
  chequeAmount1?: number;
  chequeAmount2?: number;
  cheques?: ChequeItem[];
  userId?: string;
  branchId?: string;
  notes?: string;
  mainCategory?: string;
  category?: string;
}

export interface QuotationItem {
  productId: string;
  quantity: number;
  price: number;
  discount: number;
}

export interface Quotation {
  id: string;
  date: string;
  validUntil: string;
  customerId?: string;
  customerName?: string;
  items: QuotationItem[];
  totalAmount: number;
  notes?: string;
  status: 'DRAFT' | 'FINALIZED';
  userId?: string;
}

export interface TransactionItem {
  productId: string;
  quantity: number;
  price: number;
  discount?: number;
  variantId?: string;
  size?: string;
  costBasis?: number;
  batchAllocations?: BatchAllocation[];
}

export interface Transaction {
  id: string;
  date: string;
  type: 'SALE' | 'PURCHASE' | 'EXPENSE' | 'CREDIT_PAYMENT' | 'TRANSFER' | 'SALE_HISTORY_IMPORT' | 'LOAN_GIVEN' | 'JOURNAL';
  amount: number;
  paidAmount?: number;
  balanceDue?: number;
  discount?: number;
  items?: TransactionItem[];
  description: string;
  paymentMethod: 'CASH' | 'BANK' | 'CARD' | 'CREDIT' | 'CHEQUE';
  accountId?: string;
  destinationAccountId?: string;
  customerId?: string;
  vendorId?: string;
  chequeNumber?: string;
  chequeDate?: string;
  chequeNumber2?: string;
  chequeDate2?: string;
  chequeAmount1?: number;
  chequeAmount2?: number;
  cheques?: ChequeItem[];
  userId?: string;
  branchId?: string;
  parentTxId?: string;
  costBasis?: number;
  category?: string;
  mainCategory?: string;
  status?: 'COMPLETED' | 'DRAFT' | 'VOID';
  attachment?: string;
  attachmentName?: string;
  cashReceived?: number;
  changeGiven?: number;
}

export interface DaySession {
  id: string;
  date: string;
  openingBalance: number;
  expectedClosing: number;
  actualClosing?: number;
  status: 'OPEN' | 'CLOSED';
  userId?: string;
  branchId?: string;
}

export interface RecurringExpense {
  id: string;
  description: string;
  amount: number;
  paymentMethod: 'CASH' | 'BANK';
  accountId?: string;
  frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  startDate: string;
  lastProcessedDate?: string;
  userId?: string;
}

export interface BankAccount {
  id: string;
  name: string;
  balance: number;
  accountNumber?: string;
  userId?: string;
}

export interface UserProfile {
  name: string;      // This will be the Individual Name (e.g. Madura)
  userName?: string; // Legacy/Utility
  companyName?: string; // Global branding name
  companyAddress?: string; // Global headquarters
  branch: string;     // Local assigned branch (e.g. Cashier 2)
  allBranches?: string[];
  phone?: string;
  logo?: string;
  loginUsername?: string;
  loginPassword?: string;
  isAdmin?: boolean;
  email?: string;
}

export interface FixedAsset {
  id: string;
  name: string;
  category: string;
  purchaseDate: string;
  purchasePrice: number;
  currentValue: number;
  depreciationRate?: number; // Annual %
  location?: string;
  serialNumber?: string;
  notes?: string;
  userId?: string;
}

export type View = 'LOGIN' | 'DASHBOARD' | 'POS' | 'QUOTATIONS' | 'SALES_HISTORY' | 'KPI' | 'INVENTORY' | 'PURCHASES' | 'FINANCE' | 'CUSTOMERS' | 'CHEQUE_PRINT' | 'BARCODE_PRINT' | 'SETTINGS' | 'ACCOUNTING' | 'RELOAD' | 'USER_CONTROL' | 'FIXED_ASSETS' | 'ACCOUNTING_LIABILITIES' | 'REPORTS';

export interface POSCartItem {
  product: Product;
  qty: number;
  price: number;
  discount: number;
  discountType: 'AMT' | 'PCT';
  variantId?: string;
  selectedSize?: string;
  costBasis?: number;
}

export interface POSSession {
  cart: POSCartItem[];
  discount: number;
  discountPercent: number;
  globalDiscountType: 'AMT' | 'PCT';
  paymentMethod: 'CASH' | 'BANK' | 'CARD' | 'CREDIT' | 'CHEQUE';
  accountId: string;
  search: string;
  categoryId?: string;
  chequeNumber?: string;
  chequeDate?: string;
  isAdvance?: boolean;
  advanceAmount?: number;
  transactionId?: string;
  transactionDate?: string;
  selectedPOSCustomerId?: string;
}
