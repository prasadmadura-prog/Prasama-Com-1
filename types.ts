
// Audit Trail Entry for logging user actions
export interface AuditTrailEntry {
  id: string;
  userId: string;
  action: string; // e.g., 'CREATE', 'UPDATE', 'DELETE', 'LOGIN', etc.
  entityType: string; // e.g., 'Product', 'Transaction', etc.
  entityId?: string;
  timestamp: string; // ISO string
  details?: any; // Optional: extra info about the action
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  price: number;
  cost: number;
  stock: number; // This acts as "Total Stock" or "Main Warehouse"
  branchStocks?: Record<string, number>; // New: Stock level per branch name/ID
  categoryId: string;
  vendorId?: string;
  lowStockThreshold: number;
  userId?: string; 
  internalNotes?: string;
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
  quantity: number;
  cost: number;
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
  userId?: string;
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

export interface Transaction {
  id: string;
  date: string;
  type: 'SALE' | 'PURCHASE' | 'EXPENSE' | 'CREDIT_PAYMENT' | 'TRANSFER';
  amount: number;
  discount?: number;
  items?: { productId: string; quantity: number; price: number; discount?: number; discountType?: 'AMT' | 'PCT' }[];
  description: string;
  paymentMethod: 'CASH' | 'BANK' | 'CARD' | 'CREDIT' | 'CHEQUE';
  accountId?: string;
  destinationAccountId?: string;
  customerId?: string;
  vendorId?: string;
  chequeNumber?: string;
  chequeDate?: string;
  userId?: string;
  branchId?: string; // New: Tracking which shop location generated the record
  cashierId?: string; // Cashier who made the transaction (e.g., 'cashier-1', 'cashier-2')
  cashierName?: string; // Cashier display name for easy reference
}

export interface DaySession {
  date: string;
  openingBalance: number;
  expectedClosing: number;
  actualClosing?: number;
  status: 'OPEN' | 'CLOSED';
  userId?: string;
  branchId?: string; // Sessions are now branch-specific
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
  name: string;
  branch: string; // This is the "Current Active Branch"
  allBranches?: string[]; // List of available shop locations
  phone?: string;
  logo?: string;
  loginUsername?: string;
  loginPassword?: string;
  userId?: string; // Unique identifier for cashier/user
  role?: 'ADMIN' | 'CASHIER'; // User role
  email?: string; // User email
  isAdmin?: boolean;
}

export type View = 'LOGIN' | 'DASHBOARD' | 'POS' | 'QUOTATIONS' | 'SALES_HISTORY' | 'INVENTORY' | 'PURCHASES' | 'FINANCE' | 'CUSTOMERS' | 'CHEQUE_PRINT' | 'BARCODE_PRINT' | 'SETTINGS' | 'AI_ADVISOR';

export interface POSSession {
  cart: { 
    product: Product; 
    qty: number; 
    price: number; 
    discount: number; 
    discountType: 'AMT' | 'PCT' 
  }[];
  discount: number;
  discountPercent: number;
  paymentMethod: 'CASH' | 'BANK' | 'CARD' | 'CREDIT' | 'CHEQUE';
  accountId: string;
  search: string;
  chequeNumber?: string;
  chequeDate?: string;
}
