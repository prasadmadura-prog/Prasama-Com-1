import React, { useState, useEffect } from 'react';
import {
  subscribeToCollection,
  subscribeToDocument,
  upsertDocument,
  deleteDocument,
  bulkUpsert,
  collections as dbCols
} from './services/database';
import { View, Product, Transaction, BankAccount, PurchaseOrder, Vendor, Customer, UserProfile, Category, RecurringExpense, DaySession, POSSession, POStatus, Quotation } from './types';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import POS from './components/POS';
import Inventory from './components/Inventory';
import Purchases from './components/Purchases';
import Finance from './components/Finance';
import Customers from './components/Customers';
import ChequePrint from './components/ChequePrint';
import BarcodePrint from './components/BarcodePrint';
import SalesHistory from './components/SalesHistory';
import Quotations from './components/Quotations';
import Settings from './components/Settings';
import Login from './components/Login';
import Accounting from './components/Accounting';
import KPI from './components/KPI';

const App: React.FC = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restorationPhase, setRestorationPhase] = useState('');
  const [currentView, setCurrentView] = useState<View>('LOGIN');

  // Jump/Deep-link state
  const [jumpTarget, setJumpTarget] = useState<{ type: 'PO' | 'CUSTOMER' | 'VENDOR' | 'SALE'; id: string } | null>(null);

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [quotations, setQuotations] = useState<Quotation[]>([]);

  const [userProfile, setUserProfile] = useState<UserProfile>({
    name: "PRASAMA ERP",
    branch: "CASHIER 1",
    allBranches: ["CASHIER 1", "CASHIER 2"],
    phone: "",
    isAdmin: false
  });
  const [recurringExpenses, setRecurringExpenses] = useState<RecurringExpense[]>([]);
  const [daySessions, setDaySessions] = useState<DaySession[]>([]);

  const getLocalDateString = () => {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };

  const getLocalTimestamp = () => {
    const d = new Date();
    const date = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const time = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') + ':' + String(d.getSeconds()).padStart(2, '0');
    return `${date}T${time}`;
  };

  const sanitizeData = (obj: any): any => {
    return JSON.parse(JSON.stringify(obj, (k, v) => v === undefined ? null : v));
  };

  // Helper to enforce Shared Inventory: CASHIER 1 is the Master Inventory Node
  // Any sale from CASHIER 2 or others will deduct from CASHIER 1's stock
  const getStockBranch = (branch: string) => {
    const b = (branch || '').toUpperCase();
    if (b === 'CASHIER 2' || b === 'SHOP 2' || b === 'LOCAL NODE') return 'CASHIER 1';
    return branch || 'CASHIER 1';
  };

  const [posSession, setPosSession] = useState<POSSession>({
    cart: [],
    discount: 0,
    discountPercent: 0,
    globalDiscountType: 'AMT',
    paymentMethod: 'CASH',
    accountId: 'cash',
    search: '',
    categoryId: 'All',
    chequeNumber: '',
    chequeDate: getLocalDateString(),
    isAdvance: false,
    advanceAmount: 0
  });

  const sanitizeProfile = (profile: UserProfile): UserProfile => {
    let newProfile = { ...profile };

    // ENFORCE CASHIER 2 FOR SPECIFIC USERS
    const emailLower = (newProfile.email || '').toLowerCase();
    const usernameLower = (newProfile.loginUsername || '').toLowerCase();
    if (emailLower === 'madupathirana95@gmail.com' || usernameLower === 'madupathirana95@gmail.com') {
      newProfile.branch = 'CASHIER 2';
    } else {
      // REPLACE 'LOCAL NODE' with 'CASHIER 1' - CASE INSENSITIVE
      const branchUpper = (newProfile.branch || '').toUpperCase();
      if (branchUpper === 'LOCAL NODE' || branchUpper === 'BOOKSHOP') {
        newProfile.branch = 'CASHIER 1';
      }
    }

    if (newProfile.allBranches) {
      newProfile.allBranches = newProfile.allBranches.map(b => {
        const bUp = (b || '').toUpperCase();
        return (bUp === 'LOCAL NODE' || bUp === 'BOOKSHOP') ? 'CASHIER 1' : b;
      });
      // Ensure we have our core branches
      if (!newProfile.allBranches.includes('CASHIER 2')) newProfile.allBranches.push('CASHIER 2');
      newProfile.allBranches = [...new Set(newProfile.allBranches)]; // Filter unique
    }
    return newProfile;
  };

  useEffect(() => {
    const savedProfile = localStorage.getItem('prasama_local_auth');
    if (savedProfile) {
      const p = JSON.parse(savedProfile);
      const cleanProfile = sanitizeProfile(p);

      // If we modified it, save it back
      if (JSON.stringify(p) !== JSON.stringify(cleanProfile)) {
        localStorage.setItem('prasama_local_auth', JSON.stringify(cleanProfile));
      }

      setUserProfile(cleanProfile);
      setCurrentView('DASHBOARD');
    } else {
      setCurrentView('LOGIN');
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (currentView === 'LOGIN' || isLoading) return;

    const unsubscribes = [
      subscribeToCollection(dbCols.products, (data) => setProducts(data as Product[])),
      subscribeToCollection(dbCols.categories, (data) => setCategories(data as Category[])),
      subscribeToCollection(dbCols.transactions, (data) => setTransactions(data as Transaction[])),
      subscribeToCollection(dbCols.accounts, (data) => setAccounts(data as BankAccount[])),
      subscribeToCollection(dbCols.vendors, (data) => setVendors(data as Vendor[])),
      subscribeToCollection(dbCols.customers, (data) => setCustomers(data as Customer[])),
      subscribeToCollection(dbCols.recurringExpenses, (data) => setRecurringExpenses(data as RecurringExpense[])),
      subscribeToCollection(dbCols.daySessions, (data) => setDaySessions(data as DaySession[])),
      subscribeToCollection(dbCols.purchaseOrders, (data) => setPurchaseOrders(data as PurchaseOrder[])),
      subscribeToCollection(dbCols.quotations, (data) => setQuotations(data as Quotation[])),
      subscribeToDocument(dbCols.profile, 'main', (data: any) => {
        setUserProfile(prev => ({
          ...prev,
          // Preserve local user-specific identity
          name: prev.name,
          branch: prev.branch,
          loginUsername: prev.loginUsername,
          // Sync global branding/corporate identity
          companyName: data.companyName || prev.companyName,
          companyAddress: data.companyAddress || prev.companyAddress,
          logo: data.logo || prev.logo,
          phone: data.phone || prev.phone,
        }));
      })
    ];

    return () => unsubscribes.forEach(unsub => unsub());
  }, [currentView, isLoading]);

  const handleLogout = () => {
    localStorage.removeItem('prasama_local_auth');
    setCurrentView('LOGIN');
  };

  const handleLogin = (profile: UserProfile) => {
    const cleanProfile = sanitizeProfile(profile);
    localStorage.setItem('prasama_local_auth', JSON.stringify(cleanProfile));
    setUserProfile(cleanProfile);
    setCurrentView('DASHBOARD');
  };

  const handleSaveDraftSale = async (partialTx: any) => {
    // Only save if there are items or meaningful data
    if (!partialTx.items || partialTx.items.length === 0) return;

    // Use provided ID or generate
    const txId = partialTx.id || `TX-${Date.now()}`;

    // Calculate generic cost basis (purely for record, not deduction yet)
    let costBasis = (partialTx.items || []).reduce((acc: number, item: any) => {
      const product = products.find(p => p.id === item.productId);
      const productCategory = categories.find(c => c.id === product?.categoryId);
      const isReload = (productCategory?.name || '').toUpperCase().includes('RELOAD') ||
        (product?.categoryId && product.categoryId.toUpperCase().includes('RELOAD'));
      let itemCost = Number(product?.cost || 0);
      if (isReload && itemCost === 0) itemCost = Number(item.price) * 0.96;
      return acc + (itemCost * Number(item.quantity));
    }, 0);

    const draftTx = sanitizeData({
      ...partialTx,
      id: txId,
      date: partialTx.date || getLocalTimestamp(),
      type: 'SALE' as const,
      status: 'DRAFT' as const, // MARK AS DRAFT
      branchId: userProfile.branch || 'CASHIER 1',
      userId: userProfile.email || userProfile.loginUsername || userProfile.name,
      updatedAt: new Date().toISOString(),
      customerId: partialTx.customerId || null,
      vendorId: null,
      costBasis,
      amount: Number(partialTx.amount || 0)
    });

    try {
      // Just save to DB, NO SIDE EFFECTS (Stock/Cash/Credit)
      await upsertDocument(dbCols.transactions, txId, draftTx);
      return txId;
    } catch (e) {
      console.error("Draft Auto-Save Failed", e);
    }
  };

  const handleCompleteSale = async (tx: Transaction) => {
    try {
      // FIX: Map pseudo 'LOCAL NODE' to real 'CASHIER 1' for consistency
      const rawBranch = (tx.branchId || userProfile.branch || 'CASHIER 1').toUpperCase().trim();
      const activeBranch = (rawBranch === 'LOCAL NODE' || rawBranch === 'BOOKSHOP' || rawBranch === 'SHOP 2' || rawBranch === 'MAIN BRANCH' || !rawBranch) ? 'CASHIER 1' : rawBranch;
      const stockBranch = getStockBranch(activeBranch);

      if (tx.items) {
        for (const item of tx.items) {
          const product = products.find(p => p.id === item.productId);
          if (product) {
            const bStocks = { ...(product.branchStocks || {}) };
            const currentStock = bStocks[stockBranch] !== undefined ? bStocks[stockBranch] : product.stock;

            // FIX: For Hot Reloads, deduct the COST VALUE (wallet balance) instead of quantity
            let quantityToDeduct = Number(item.quantity);
            const productCategory = categories.find(c => c.id === product.categoryId);
            const isReload = (productCategory?.name || '').toUpperCase().includes('RELOAD') ||
              (product.categoryId && product.categoryId.toUpperCase().includes('RELOAD'));

            if (isReload) {
              // Deduct Cost (approx 96% of Price) from the Stock Balance
              // Example: Sale 100 -> Cost 96. Stock 1000 -> 904.
              quantityToDeduct = Number(item.price) * Number(item.quantity) * 0.96;
            }

            const updatedStock = isReload ? (Number(currentStock) - quantityToDeduct) : Math.max(0, Number(currentStock) - quantityToDeduct);

            bStocks[stockBranch] = updatedStock;

            await upsertDocument(dbCols.products, product.id, {
              ...product,
              branchStocks: bStocks,
              stock: (Object.values(bStocks) as number[]).reduce((a, b) => a + b, 0)
            });
          }
        }
      }

      // VITAL FIX: Account for balanceDue from advance payments in Credit Portfolio
      const amountToChargeCustomer = tx.paymentMethod === 'CREDIT' ? Number(tx.amount) : (Number(tx.balanceDue) || 0);

      if (amountToChargeCustomer !== 0 && tx.customerId) {
        const customer = customers.find(c => c.id === tx.customerId);
        if (customer) {
          await upsertDocument(dbCols.customers, customer.id, {
            ...customer,
            totalCredit: (Number(customer.totalCredit) || 0) + amountToChargeCustomer
          });
        }
      }


      let costBasis = (tx.items || []).reduce((acc, item) => {
        const product = products.find(p => p.id === item.productId);
        const productCategory = categories.find(c => c.id === product?.categoryId);
        const isReload = (productCategory?.name || '').toUpperCase().includes('RELOAD') ||
          (product?.categoryId && product.categoryId.toUpperCase().includes('RELOAD'));

        // If it's a reload, the cost is 96% of the selling price (unless specific cost is set)
        let itemCost = Number(product?.cost || 0);
        if (isReload && itemCost === 0) {
          itemCost = Number(item.price) * 0.96; // Cost per unit
        }

        return acc + (itemCost * Number(item.quantity));
      }, 0);

      // FIX: Use provided costBasis if DB lookup yields zero (e.g. for Hot Reloads)
      if (costBasis === 0 && tx.costBasis && tx.costBasis > 0) {
        costBasis = tx.costBasis;
      }
      const normalizedTx = sanitizeData({
        ...tx,
        type: 'SALE' as const,
        status: 'COMPLETED' as const, // MARK AS COMPLETED
        date: tx.date || getLocalTimestamp(),
        branchId: activeBranch,
        userId: userProfile.email || userProfile.loginUsername || userProfile.name, // Track the actual user
        costBasis,
        updatedAt: new Date().toISOString(),
        customerId: tx.customerId || null,
        vendorId: tx.vendorId || null,
        accountId: tx.accountId || null
      });

      await upsertDocument(dbCols.transactions, tx.id, normalizedTx);

      const realizedInflow = Number(tx.paidAmount) || (tx.paymentMethod !== 'CREDIT' ? Number(tx.amount) : 0);

      if (realizedInflow > 0) {
        const acc = accounts.find(a => a.id === normalizedTx.accountId);
        if (acc) {
          await upsertDocument(dbCols.accounts, acc.id, {
            ...acc,
            balance: Number(acc.balance) + realizedInflow
          });
        }
      }

    } catch (error) {
      console.error("TRANSACTION_FAILED:", error);
      alert(`A critical error occurred while saving the sale: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const handleUpdateGlobalTransaction = async (tx: Transaction) => {
    const oldTx = transactions.find(t => t.id === tx.id);
    if (!oldTx) return;

    // If updating a DRAFT, just update the document without side effects
    if (oldTx.status === 'DRAFT' && tx.status === 'DRAFT') {
      await upsertDocument(dbCols.transactions, tx.id, sanitizeData(tx));
      return;
    }

    // 1. Customer Credit Delta (Crucial for Settlement Tracking)
    if (oldTx.customerId) {
      const customer = customers.find(c => c.id === oldTx.customerId);
      if (customer) {
        let oldCreditValue = oldTx.paymentMethod === 'CREDIT' ? Number(oldTx.amount) : (Number(oldTx.balanceDue) || 0);
        let newCreditValue = tx.paymentMethod === 'CREDIT' ? Number(tx.amount) : (Number(tx.balanceDue) || 0);

        if (oldTx.type === 'CREDIT_PAYMENT') {
          oldCreditValue = -Number(oldTx.amount);
          newCreditValue = -Number(tx.amount);
        }

        const diff = newCreditValue - oldCreditValue;
        await upsertDocument(dbCols.customers, customer.id, {
          ...customer,
          totalCredit: (Number(customer.totalCredit) || 0) + diff
        });
      }
    }

    // 2. Vendor Balance Delta
    if (oldTx.vendorId) {
      const vendor = vendors.find(v => v.id === oldTx.vendorId);
      if (vendor) {
        let vDiff = 0;
        if (oldTx.type === 'PURCHASE') {
          vDiff = (Number(tx.amount) || 0) - (Number(oldTx.amount) || 0);
        } else if (oldTx.type === 'CREDIT_PAYMENT') {
          vDiff = (Number(oldTx.amount) || 0) - (Number(tx.amount) || 0);
        }
        await upsertDocument(dbCols.vendors, vendor.id, {
          ...vendor,
          totalBalance: (Number(vendor.totalBalance) || 0) + vDiff
        });
      }
    }

    // 3. Bank/Cash Account Balance Delta
    if (oldTx.accountId) {
      const acc = accounts.find(a => a.id === oldTx.accountId);
      if (acc) {
        const isOutflow = ['PURCHASE', 'EXPENSE', 'CREDIT_PAYMENT'].includes(oldTx.type);
        let aDiff = 0;
        if (isOutflow) {
          aDiff = (Number(oldTx.amount) || 0) - (Number(tx.amount) || 0);
        } else {
          const oldInflow = Number(oldTx.paidAmount) || (oldTx.paymentMethod !== 'CREDIT' ? Number(oldTx.amount) : 0);
          const newInflow = Number(tx.paidAmount) || (tx.paymentMethod !== 'CREDIT' ? Number(tx.amount) : 0);
          aDiff = newInflow - oldInflow;
        }
        await upsertDocument(dbCols.accounts, acc.id, {
          ...acc,
          balance: Number(acc.balance) + aDiff
        });
      }
    }

    // 4. Stock Adjustment for SALE transactions
    if (oldTx.type === 'SALE' && oldTx.items && tx.items) {
      const activeBranch = userProfile.branch;
      const stockBranch = getStockBranch(activeBranch);

      // Calculate net stock changes per product
      const stockChanges = new Map<string, number>();

      // Add back old quantities/values
      for (const oldItem of oldTx.items) {
        const product = products.find(p => p.id === oldItem.productId);
        const productCategory = categories.find(c => c.id === product?.categoryId);
        const isReload = (productCategory?.name || '').toUpperCase().includes('RELOAD') ||
          (product?.categoryId && product.categoryId.toUpperCase().includes('RELOAD'));

        const amountToRestore = isReload ? (Number(oldItem.price) * Number(oldItem.quantity) * 0.96) : Number(oldItem.quantity);
        const current = stockChanges.get(oldItem.productId) || 0;
        stockChanges.set(oldItem.productId, current + amountToRestore);
      }

      // Subtract new quantities/values
      for (const newItem of tx.items) {
        const product = products.find(p => p.id === newItem.productId);
        const productCategory = categories.find(c => c.id === product?.categoryId);
        const isReload = (productCategory?.name || '').toUpperCase().includes('RELOAD') ||
          (product?.categoryId && product.categoryId.toUpperCase().includes('RELOAD'));

        const amountToDeduct = isReload ? (Number(newItem.price) * Number(newItem.quantity) * 0.96) : Number(newItem.quantity);
        const current = stockChanges.get(newItem.productId) || 0;
        stockChanges.set(newItem.productId, current - amountToDeduct);
      }

      // Apply net changes to each product
      for (const [productId, netChange] of stockChanges.entries()) {
        if (netChange !== 0) {
          const product = products.find(p => p.id === productId);
          if (product) {
            const bStocks = { ...(product.branchStocks || {}) };
            const currentStock = bStocks[stockBranch] !== undefined ? bStocks[stockBranch] : product.stock;
            const productCategory = categories.find(c => c.id === product.categoryId);
            const isReload = (productCategory?.name || '').toUpperCase().includes('RELOAD') ||
              (product.categoryId && product.categoryId.toUpperCase().includes('RELOAD'));

            bStocks[stockBranch] = isReload ? (Number(currentStock) + netChange) : Math.max(0, Number(currentStock) + netChange);

            await upsertDocument(dbCols.products, product.id, {
              ...product,
              branchStocks: bStocks,
              stock: (Object.values(bStocks) as number[]).reduce((a, b) => a + b, 0)
            });
          }
        }
      }
    }

    await upsertDocument(dbCols.transactions, tx.id, sanitizeData(tx));
  };

  const handleDeleteGlobalTransaction = async (id: string) => {
    const tx = transactions.find(t => t.id === id);
    if (!tx) return;

    // If deleting a DRAFT, just delete the document without reversals
    if (tx.status === 'DRAFT') {
      await deleteDocument(dbCols.transactions, id);
      return;
    }

    // 1. Reverse Customer Impact
    if (tx.customerId) {
      const customer = customers.find(c => c.id === tx.customerId);
      if (customer) {
        let creditToReverse = tx.paymentMethod === 'CREDIT' ? Number(tx.amount) : (Number(tx.balanceDue) || 0);
        if (tx.type === 'CREDIT_PAYMENT') creditToReverse = -Number(tx.amount);

        await upsertDocument(dbCols.customers, customer.id, {
          ...customer,
          totalCredit: (Number(customer.totalCredit) || 0) - creditToReverse
        });
      }
    }

    // 2. Reverse Vendor Impact
    if (tx.vendorId) {
      const vendor = vendors.find(v => v.id === tx.vendorId);
      if (vendor) {
        let vDiff = 0;
        if (tx.type === 'PURCHASE') vDiff = -Number(tx.amount);
        else if (tx.type === 'CREDIT_PAYMENT') vDiff = Number(tx.amount);
        await upsertDocument(dbCols.vendors, vendor.id, {
          ...vendor,
          totalBalance: (Number(vendor.totalBalance) || 0) + vDiff
        });
      }
    }

    // 3. Reverse Account Impact
    if (tx.accountId) {
      const acc = accounts.find(a => a.id === tx.accountId);
      if (acc) {
        const isOutflow = ['PURCHASE', 'EXPENSE', 'CREDIT_PAYMENT'].includes(tx.type);
        const inflow = Number(tx.paidAmount) || (tx.paymentMethod !== 'CREDIT' ? Number(tx.amount) : 0);
        const aDiff = isOutflow ? Number(tx.amount) : -inflow;
        await upsertDocument(dbCols.accounts, acc.id, {
          ...acc,
          balance: Number(acc.balance) + aDiff
        });
      }
    }

    // 4. Restore Stock for SALE transactions
    if (tx.type === 'SALE' && tx.items) {
      const activeBranch = userProfile.branch;
      const stockBranch = getStockBranch(activeBranch);

      for (const item of tx.items) {
        const product = products.find(p => p.id === item.productId);
        if (product) {
          const bStocks = { ...(product.branchStocks || {}) };
          const currentStock = bStocks[stockBranch] !== undefined ? bStocks[stockBranch] : product.stock;

          const productCategory = categories.find(c => c.id === product?.categoryId);
          const isReload = (productCategory?.name || '').toUpperCase().includes('RELOAD') ||
            (product?.categoryId && product.categoryId.toUpperCase().includes('RELOAD'));

          const amountToRestore = isReload ? (Number(item.price) * Number(item.quantity) * 0.96) : Number(item.quantity);

          bStocks[stockBranch] = Number(currentStock) + amountToRestore;

          await upsertDocument(dbCols.products, product.id, {
            ...product,
            branchStocks: bStocks,
            stock: (Object.values(bStocks) as number[]).reduce((a, b) => a + b, 0)
          });
        }
      }
    }

    await deleteDocument(dbCols.transactions, id);
  };

  const handleCustomerPayment = async (tx: Omit<Transaction, 'id' | 'date'>) => {
    try {
      const txId = `CP-${Date.now()}`;
      const updatedTx = sanitizeData({
        ...tx,
        id: txId,
        date: getLocalTimestamp(),
        branchId: userProfile.branch,
        updatedAt: new Date().toISOString()
      });
      await upsertDocument(dbCols.transactions, txId, updatedTx);

      if (tx.customerId) {
        const customer = customers.find(c => c.id === tx.customerId);
        if (customer) {
          const currentCredit = Number(customer.totalCredit) || 0;
          const paymentAmt = Number(tx.amount) || 0;
          const newCredit = currentCredit - paymentAmt;
          await upsertDocument(dbCols.customers, customer.id, { ...customer, totalCredit: newCredit });
        }
      }

      const accId = tx.accountId || (tx.paymentMethod === 'CASH' ? 'cash' : undefined);
      const acc = accounts.find(a => a.id === accId || (tx.paymentMethod === 'CASH' && a.id === 'cash'));

      if (acc) {
        const currentBalance = Number(acc.balance) || 0;
        const paymentAmt = Number(tx.amount) || 0;
        await upsertDocument(dbCols.accounts, acc.id, { ...acc, balance: currentBalance + paymentAmt });
      }

      // 4. Link to Invoice and Resolve parent balance if applicable
      if (tx.parentTxId) {
        const parent = transactions.find(t => t.id === tx.parentTxId);
        if (parent) {
          const paymentAmt = Number(tx.amount) || 0;
          const updatedParent = sanitizeData({
            ...parent,
            paidAmount: (Number(parent.paidAmount) || 0) + paymentAmt,
            balanceDue: Math.max(0, (Number(parent.balanceDue) || 0) - paymentAmt),
            updatedAt: new Date().toISOString()
          });
          await upsertDocument(dbCols.transactions, parent.id, updatedParent);
        }
      }
    } catch (err: any) {
      console.error("REPAYMENT FAILURE:", err);
      alert(`SYSTEM ERROR: Unable to process repayment. ${err.message}`);
    }
  };

  const handlePayVendor = async (tx: Omit<Transaction, 'id'>) => {
    try {
      const txId = (tx as any).id || `PV-${Date.now()}`;
      const finalTx = sanitizeData({
        ...tx,
        id: txId,
        branchId: userProfile.branch,
        updatedAt: new Date().toISOString()
      });
      await upsertDocument(dbCols.transactions, txId, finalTx);

      // Update Vendor Balance
      if (tx.vendorId) {
        const vendor = vendors.find(v => v.id === tx.vendorId);
        if (vendor) {
          const currentBal = Number(vendor.totalBalance) || 0;
          const amt = Number(tx.amount) || 0;
          // If it's a payment, it REDUCES what we owe (outflow)
          // Type is CREDIT_PAYMENT for settlements
          const newBal = (tx.type === 'CREDIT_PAYMENT') ? currentBal - amt : currentBal + amt;
          await upsertDocument(dbCols.vendors, vendor.id, { ...vendor, totalBalance: newBal });
        }
      }

      // Update Account Balance
      if (tx.accountId) {
        const acc = accounts.find(a => a.id === tx.accountId);
        if (acc) {
          const bal = Number(acc.balance) || 0;
          const amt = Number(tx.amount) || 0;
          const isOutflow = ['PURCHASE', 'EXPENSE', 'CREDIT_PAYMENT'].includes(tx.type);
          await upsertDocument(dbCols.accounts, acc.id, {
            ...acc,
            balance: isOutflow ? bal - amt : bal + amt
          });
        }
      }
    } catch (err: any) {
      console.error("VENDOR_PAYMENT_FAILED:", err);
      alert(`System Error: ${err.message}`);
    }
  };

  const handleReceivePO = async (poId: string) => {
    const po = purchaseOrders.find(p => p.id === poId);
    if (!po || po.status !== 'PENDING') return;

    const updatedPO: PurchaseOrder = {
      ...po,
      status: 'RECEIVED' as POStatus,
      receivedDate: new Date().toISOString()
    };
    await upsertDocument(dbCols.purchaseOrders, po.id, updatedPO);

    const activeBranch = userProfile.branch;
    const stockBranch = getStockBranch(activeBranch);

    for (const item of po.items) {
      const product = products.find(p => p.id === item.productId);
      if (product) {
        const bStocks = { ...(product.branchStocks || {}) };
        const currentStock = bStocks[stockBranch] !== undefined ? bStocks[stockBranch] : product.stock;
        bStocks[stockBranch] = Number(currentStock) + Number(item.quantity);

        await upsertDocument(dbCols.products, product.id, {
          ...product,
          branchStocks: bStocks,
          stock: (Object.values(bStocks) as number[]).reduce((a, b) => a + b, 0),
          cost: Number(item.cost)
        });
      }
    }

    const txId = `PU-${Date.now()}`;
    const normalizedTx = sanitizeData({
      id: txId,
      date: getLocalTimestamp(),
      type: 'PURCHASE',
      amount: po.totalAmount,
      paymentMethod: po.paymentMethod,
      accountId: po.accountId,
      vendorId: po.vendorId,
      branchId: activeBranch,
      description: `Stock Received against PO: ${po.id}`,
      chequeNumber: po.chequeNumber,
      chequeDate: po.chequeDate,
      updatedAt: new Date().toISOString()
    });
    await upsertDocument(dbCols.transactions, txId, normalizedTx);

    if (po.paymentMethod === 'CREDIT') {
      const vendor = vendors.find(v => v.id === po.vendorId);
      if (vendor) {
        await upsertDocument(dbCols.vendors, vendor.id, {
          ...vendor,
          totalBalance: (Number(vendor.totalBalance) || 0) + po.totalAmount
        });
      }
    } else {
      const acc = accounts.find(a => a.id === po.accountId);
      if (acc) {
        await upsertDocument(dbCols.accounts, acc.id, {
          ...acc,
          balance: Number(acc.balance) - po.totalAmount
        });
      }
    }
  };

  const handleBulkUpsertProducts = async (productsToUpsert: Product[]) => {
    await bulkUpsert(dbCols.products, productsToUpsert);
  };

  const handleConvertQuoteToSale = (q: Quotation) => {
    // 1. Load items into POS Session
    const cartItems = q.items.map(item => ({
      product: products.find(p => p.id === item.productId),
      quantity: item.quantity,
      price: item.price,
      discount: item.discount
    })).filter(i => i.product) as { product: Product, quantity: number, price: number, discount: number }[];

    setPosSession(prev => ({
      ...prev,
      // FIX: Correctly structure cart items to match POSSession interface { product, qty, price, ... }
      cart: cartItems.map(i => ({
        product: i.product,
        qty: i.quantity,
        price: i.price,
        discount: i.discount,
        discountType: 'AMT'
      })),
      discount: 0,
      discountPercent: 0,
      customerId: q.customerId || 'WALK_IN',
    }));

    // 2. Switch to POS View
    setCurrentView('POS');
  };

  const handleAddExpense = async (tx: any) => {
    try {
      const txId = `EX-${Date.now()}`;
      const finalTx = sanitizeData({
        ...tx,
        id: txId,
        date: getLocalDateString() + 'T12:00:00',
        branchId: userProfile.branch,
        updatedAt: new Date().toISOString()
      });

      await upsertDocument(dbCols.transactions, txId, finalTx);

      // Update Account Balance
      if (tx.accountId) {
        const acc = accounts.find(a => a.id === tx.accountId);
        if (acc) {
          const newBalance = Number(acc.balance) - Number(tx.amount);
          await upsertDocument(dbCols.accounts, acc.id, { ...acc, balance: newBalance });
        }
      }
    } catch (error) {
      console.error("EXPENSE_FAILED:", error);
      alert("Failed to record expense. Please try again.");
    }
  };

  const handleAddTransfer = async (tx: any) => {
    try {
      const txId = `TR-${Date.now()}`;
      const finalTx = sanitizeData({
        ...tx,
        id: txId,
        date: getLocalDateString() + 'T12:00:00',
        branchId: userProfile.branch,
        updatedAt: new Date().toISOString()
      });

      await upsertDocument(dbCols.transactions, txId, finalTx);

      // Deduct from Source
      if (tx.accountId) {
        const sourceAcc = accounts.find(a => a.id === tx.accountId);
        if (sourceAcc) {
          await upsertDocument(dbCols.accounts, sourceAcc.id, {
            ...sourceAcc,
            balance: Number(sourceAcc.balance) - Number(tx.amount)
          });
        }
      }

      // Add to Destination
      if (tx.destinationAccountId) {
        const destAcc = accounts.find(a => a.id === tx.destinationAccountId);
        if (destAcc) {
          await upsertDocument(dbCols.accounts, destAcc.id, {
            ...destAcc,
            balance: Number(destAcc.balance) + Number(tx.amount)
          });
        }
      }
    } catch (error) {
      console.error("TRANSFER_FAILED:", error);
      alert("Failed to record transfer.");
    }
  };

  const handleExport = () => {
    const data = {
      products, categories, transactions, accounts, vendors, customers,
      purchaseOrders, quotations, recurringExpenses, daySessions, userProfile,
      version: "16.0_STABLE",
      timestamp: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `PRASAMA_BACKUP_GLOBAL_${getLocalDateString()}.json`;
    link.click();
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const rawContent = event.target?.result as string;
        const data = JSON.parse(rawContent);
        setIsRestoring(true);
        setRestorationPhase('Synchronizing Global Core...');

        if (data.products) await bulkUpsert(dbCols.products, data.products);
        if (data.categories) await bulkUpsert(dbCols.categories, data.categories);
        if (data.transactions) await bulkUpsert(dbCols.transactions, data.transactions);
        if (data.accounts) await bulkUpsert(dbCols.accounts, data.accounts);
        if (data.vendors) await bulkUpsert(dbCols.vendors, data.vendors);
        if (data.customers) await bulkUpsert(dbCols.customers, data.customers);
        if (data.purchaseOrders) await bulkUpsert(dbCols.purchaseOrders, data.purchaseOrders);
        if (data.quotations) await bulkUpsert(dbCols.quotations, data.quotations);
        if (data.recurringExpenses) await bulkUpsert(dbCols.recurringExpenses, data.recurringExpenses);
        if (data.daySessions) await bulkUpsert(dbCols.daySessions, data.daySessions);
        if (data.userProfile) {
          await upsertDocument(dbCols.profile, 'main', data.userProfile);
        }

        setRestorationPhase('Recovery Complete.');
        setTimeout(() => {
          setIsRestoring(false);
          window.location.reload();
        }, 800);
      } catch (err: any) {
        alert(`IMPORT FAILED: ${err.message}`);
        setIsRestoring(false);
      }
    };
    reader.readAsText(file);
  };

  const handleJumpTo = (type: 'PO' | 'CUSTOMER' | 'VENDOR' | 'SALE', id: string) => {
    setJumpTarget({ type, id });
    if (type === 'PO' || type === 'VENDOR') setCurrentView('PURCHASES');
    else if (type === 'CUSTOMER') setCurrentView('CUSTOMERS');
    else if (type === 'SALE') setCurrentView('SALES_HISTORY');
  };

  const handleDeleteAccount = async (id: string) => {
    const acc = accounts.find(a => a.id === id);
    if (!acc) return;

    if (acc.balance !== 0) {
      const balance = Number(acc.balance);
      const isPositive = balance > 0;
      const txId = `TR-CLOSE-${Date.now()}`;

      // Auto-generated audit transaction for the transfer
      const auditTx = {
        id: txId,
        date: getLocalDateString() + 'T12:00:00',
        amount: Math.abs(balance),
        description: `ACCOUNT CLOSURE: ${acc.name} MERGED TO CASH`,
        type: 'TRANSFER',
        accountId: isPositive ? id : 'cash',
        destinationAccountId: isPositive ? 'cash' : id,
        paymentMethod: 'CASH',
        updatedAt: new Date().toISOString(),
        branchId: userProfile.branch
      };

      await upsertDocument(dbCols.transactions, txId, sanitizeData(auditTx));

      // Update Cash Balance
      const cashAcc = accounts.find(a => a.id === 'cash');
      if (cashAcc) {
        await upsertDocument(dbCols.accounts, 'cash', {
          ...cashAcc,
          balance: Number(cashAcc.balance) + balance
        });
      }
    }

    await deleteDocument(dbCols.accounts, id);
  };

  const activeBranch = userProfile.branch;
  const filteredDaySessions = daySessions.filter(s => s.branchId === activeBranch);
  const branchDaySession = filteredDaySessions.find(s => s.date === getLocalDateString());

  const branchProducts = products.map(p => ({
    ...p,
    stock: p.stock
  }));
  if (isLoading || isRestoring) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center p-6">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-white font-black text-xs uppercase tracking-[0.5em]">{restorationPhase || 'Initializing...'}</p>
        </div>
      </div>
    );
  }

  if (currentView === 'LOGIN') {
    return <Login onLogin={handleLogin} onSignUp={handleLogin} userProfile={userProfile} />;
  }


  const activeDaySession = daySessions.find(s => s.date === getLocalDateString() && (s.branchId === activeBranch || !s.branchId));
  // Global visibility for History and Dashboard
  const branchFilteredTransactions = transactions;

  const handleResumeDraft = (tx: Transaction) => {
    // Reconstruct POS Cart from Transaction Items
    const restoredCart = (tx.items || []).map(item => {
      const product = products.find(p => p.id === item.productId);
      // Fallback if product deleted, but usually safer to skip or placeholder
      if (!product) return null;
      return {
        product: product,
        qty: Number(item.quantity),
        price: Number(item.price),
        discount: Number(item.discount || 0),
        discountType: 'AMT' as const
      };
    }).filter(i => i !== null) as any[];

    setPosSession({
      cart: restoredCart,
      discount: tx.discount || 0,
      discountPercent: 0,
      globalDiscountType: 'AMT',
      paymentMethod: tx.paymentMethod || 'CASH',
      accountId: tx.accountId || 'cash',
      search: '',
      categoryId: 'All',
      chequeNumber: tx.chequeNumber || '',
      chequeDate: tx.chequeDate || getLocalDateString(),
      isAdvance: false,
      advanceAmount: 0
    });

    // Switch to POS
    setCurrentView('POS');
  };

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 selection:bg-indigo-100 selection:text-indigo-700">
      <Sidebar
        currentView={currentView}
        setView={setCurrentView}
        userProfile={userProfile}
        onEditProfile={() => setCurrentView('SETTINGS')}
        onLogout={handleLogout}
        onSwitchBranch={(b) => {
          const updated = { ...userProfile, branch: b };
          setUserProfile(updated);
          upsertDocument(dbCols.profile, 'main', updated);
        }}
      />
      <main className="flex-1 overflow-y-auto bg-[#fcfcfc]">
        <div className={`${currentView === 'POS' ? 'max-w-[1920px] mx-auto px-4 py-4' : 'max-w-7xl mx-auto px-6 py-8 md:px-10 md:py-12'} transition-all`}>
          {currentView === 'DASHBOARD' && (
            <Dashboard
              transactions={transactions}
              products={branchProducts}
              categories={categories}
              accounts={accounts}
              vendors={vendors}
              customers={customers}
              daySessions={filteredDaySessions}
              purchaseOrders={purchaseOrders}
              userProfile={userProfile}
              onNavigate={setCurrentView}
              onUpdateProduct={(p) => upsertDocument(dbCols.products, p.id, p)}
              onJumpTo={handleJumpTo}
            />
          )}
          {currentView === 'KPI' && (
            <KPI
              transactions={branchFilteredTransactions}
              products={branchProducts}
              categories={categories}
              accounts={accounts}
              vendors={vendors}
              customers={customers}
              purchaseOrders={purchaseOrders}
              daySessions={daySessions}
              userProfile={userProfile}
              onNavigate={setCurrentView}
            />
          )}
          {currentView === 'POS' && <POS accounts={accounts} products={branchProducts} customers={customers} transactions={transactions} categories={categories} userProfile={userProfile} onUpsertCustomer={(c) => upsertDocument(dbCols.customers, c.id, c)} onUpdateProduct={(p) => upsertDocument(dbCols.products, p.id, p)} onCompleteSale={handleCompleteSale} onSaveDraftSale={handleSaveDraftSale} posSession={posSession} setPosSession={setPosSession} onQuickOpenDay={(bal) => upsertDocument(dbCols.daySessions, getLocalDateString() + activeBranch, { date: getLocalDateString(), openingBalance: bal, status: 'OPEN', branchId: activeBranch, id: getLocalDateString() + activeBranch })} onGoToFinance={() => setCurrentView('FINANCE')} activeSession={branchDaySession} />}
          {currentView === 'QUOTATIONS' && <Quotations products={branchProducts} customers={customers} categories={categories} userProfile={userProfile} quotations={quotations} onUpsertQuotation={(q) => upsertDocument(dbCols.quotations, q.id, q)} onDeleteQuotation={(id) => deleteDocument(dbCols.quotations, id)} onConvertQuotation={handleConvertQuoteToSale} />}
          {currentView === 'SALES_HISTORY' && <SalesHistory jumpTarget={jumpTarget} clearJump={() => setJumpTarget(null)} transactions={transactions} products={products} customers={customers} categories={categories} userProfile={userProfile} accounts={accounts} daySessions={daySessions} onUpdateTransaction={handleUpdateGlobalTransaction} onDeleteTransaction={handleDeleteGlobalTransaction} onResumeDraft={handleResumeDraft} />}
          {currentView === 'INVENTORY' && <Inventory products={branchProducts} categories={categories} vendors={vendors} userProfile={userProfile} onAddCategory={(name) => { const c = { id: `cat-${Date.now()}`, name: name.toUpperCase() }; upsertDocument(dbCols.categories, c.id, c); return c; }} onUpsertCategory={(cat) => upsertDocument(dbCols.categories, cat.id, cat)} onDeleteCategory={(id) => deleteDocument(dbCols.categories, id)} onUpsertVendor={(v) => upsertDocument(dbCols.vendors, v.id, v)} onUpsertProduct={(p) => upsertDocument(dbCols.products, p.id, p)} onBulkUpsertProducts={handleBulkUpsertProducts} onDeleteProduct={(id) => deleteDocument(dbCols.products, id)} />}
          {
            currentView === 'FINANCE' && <Finance accounts={accounts} transactions={transactions} daySessions={filteredDaySessions} products={branchProducts} vendors={vendors} recurringExpenses={recurringExpenses} customers={customers} userProfile={userProfile} onOpenDay={(bal) => upsertDocument(dbCols.daySessions, getLocalDateString() + activeBranch, { date: getLocalDateString(), openingBalance: bal, status: 'OPEN', branchId: activeBranch, id: getLocalDateString() + activeBranch })} onCloseDay={(actual) => upsertDocument(dbCols.daySessions, getLocalDateString() + activeBranch, { actualClosing: actual, status: 'CLOSED', branchId: activeBranch, id: getLocalDateString() + activeBranch })} onAddExpense={handleAddExpense} onAddTransfer={handleAddTransfer}
              onUpdateTransaction={handleUpdateGlobalTransaction} onDeleteTransaction={handleDeleteGlobalTransaction} onAddRecurring={(re) => upsertDocument(dbCols.recurringExpenses, re.id, re)} onDeleteRecurring={(id) => deleteDocument(dbCols.recurringExpenses, id)} onUpsertAccount={(acc) => upsertDocument(dbCols.accounts, acc.id, acc)} onDeleteAccount={handleDeleteAccount} />
          }
          {currentView === 'CUSTOMERS' && <Customers jumpTarget={jumpTarget} clearJump={() => setJumpTarget(null)} customers={customers} transactions={transactions} accounts={accounts} products={products} onUpsertCustomer={(c) => upsertDocument(dbCols.customers, c.id, c)} onReceivePayment={handleCustomerPayment} onUpdateTransaction={handleUpdateGlobalTransaction} onDeleteTransaction={handleDeleteGlobalTransaction} />}

          {currentView === 'SETTINGS' && <Settings userProfile={userProfile} setUserProfile={(val) => upsertDocument(dbCols.profile, 'main', val)} onExport={handleExport} onImport={handleImport} syncStatus="OFFLINE" />}
          {currentView === 'BARCODE_PRINT' && <BarcodePrint products={branchProducts} categories={categories} />}
          {currentView === 'CHEQUE_PRINT' && <ChequePrint vendors={vendors} />}
          {currentView === 'PURCHASES' && <Purchases jumpTarget={jumpTarget} clearJump={() => setJumpTarget(null)} products={branchProducts} purchaseOrders={purchaseOrders} vendors={vendors} accounts={accounts} transactions={transactions} userProfile={userProfile} categories={categories} onUpsertPO={(po) => upsertDocument(dbCols.purchaseOrders, po.id, po)} onReceivePO={handleReceivePO} onUpsertVendor={(v) => upsertDocument(dbCols.vendors, v.id, v)} onPayVendor={handlePayVendor} onUpdateTransaction={handleUpdateGlobalTransaction} onDeleteTransaction={handleDeleteGlobalTransaction} />}
          {currentView === 'ACCOUNTING' && <Accounting transactions={transactions} accounts={accounts} customers={customers} vendors={vendors} products={products} />}

        </div >
      </main >
    </div >
  );
};

export default App;