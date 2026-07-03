import React, { useState, useEffect } from 'react';
import {
  subscribeToCollection,
  subscribeToDocument,
  upsertDocument,
  deleteDocument,
  bulkUpsert,
  collections as dbCols
} from './services/database';
import { View, Product, Transaction, BankAccount, PurchaseOrder, Vendor, Customer, UserProfile, Category, RecurringExpense, DaySession, POSSession, POStatus, Quotation, FixedAsset } from './types';
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
import Reload from './components/Reload';
import UserControl from './components/UserControl';
import FixedAssets from './components/FixedAssets';

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
  const [fixedAssets, setFixedAssets] = useState<FixedAsset[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);

  const [userProfile, setUserProfile] = useState<UserProfile>({
    name: "PRASAMA ERP",
    branch: "CASHIER 1",
    allBranches: ["CASHIER 1", "CASHIER 2", "CASHIER 3", "CASHIER 4"],
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
    const b = (branch || '').toUpperCase().trim();
    if (b === 'SHOP 2' || b === 'LOCAL NODE' || b === 'BOOKSHOP') return 'CASHIER 1';
    return b || 'CASHIER 1';
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
    if (emailLower === 'salesprasama@gmail.com' || usernameLower === 'salesprasama@gmail.com') {
      newProfile.isAdmin = true;
      newProfile.branch = 'CASHIER 1';
    }

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
      if (newProfile.branch === 'CASHIER 2' || newProfile.isAdmin) {
        if (!newProfile.allBranches.includes('CASHIER 1')) newProfile.allBranches.push('CASHIER 1');
      }
      if (!newProfile.allBranches.includes('CASHIER 2')) newProfile.allBranches.push('CASHIER 2');
      if (!newProfile.allBranches.includes('CASHIER 3')) newProfile.allBranches.push('CASHIER 3');
      if (newProfile.isAdmin || emailLower === 'madupathirana95@gmail.com' || usernameLower === 'madupathirana95@gmail.com') {
        if (!newProfile.allBranches.includes('CASHIER 4')) newProfile.allBranches.push('CASHIER 4');
      }
      if (newProfile.isAdmin && !newProfile.allBranches.includes('ALL')) {
        newProfile.allBranches.unshift('ALL');
      }
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
    // Fetch users for Login check even if not logged in
    const unsub = subscribeToCollection(dbCols.users, (data) => setUsers(data as UserProfile[]));
    return () => unsub();
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
      subscribeToCollection(dbCols.fixedAssets, (data) => setFixedAssets(data as FixedAsset[])),
      subscribeToDocument(dbCols.profile, 'main', (data: any) => {
        if (data) {
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
        }
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

    let costBasis = (partialTx.items || []).reduce((acc: number, item: any) => {
      const product = products.find(p => p.id === item.productId);
      const productCategory = categories.find(c => c.id === product?.categoryId);
      const categoryName = (productCategory?.name || '').toUpperCase();
      const isHotReload = categoryName.includes('RELOAD') && !categoryName.includes('CARD');
      let itemCost = Number(product?.cost || 0);
      if (isHotReload && itemCost === 0) itemCost = Number(item.price) * 0.96;
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
      // Check if we are updating an existing COMPLETED transaction
      const existingTx = transactions.find(t => t.id === tx.id);
      if (existingTx && existingTx.status === 'COMPLETED') {
        const updatedTx = { ...tx, status: 'COMPLETED' as const };
        await handleUpdateGlobalTransaction(updatedTx);
        return;
      }

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
            const categoryName = (productCategory?.name || '').toUpperCase();
            const isHotReload = categoryName.includes('RELOAD') && !categoryName.includes('CARD');

            if (isHotReload) {
              // Deduct Cost (approx 96% of Price) from the Stock Balance
              quantityToDeduct = Number(item.price) * Number(item.quantity) * 0.96;
            }

            const updatedStock = isHotReload ? (Number(currentStock) - quantityToDeduct) : Math.max(0, Number(currentStock) - quantityToDeduct);

            bStocks[stockBranch] = updatedStock;

            await upsertDocument(dbCols.products, product.id, {
              ...product,
              branchStocks: bStocks,
              stock: ['CASHIER 1', 'CASHIER 2', 'CASHIER 3', 'CASHIER 4'].reduce((a, key) => a + (Number(bStocks[key]) || 0), 0)
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
        const categoryName = (productCategory?.name || '').toUpperCase();
        const isHotReload = categoryName.includes('RELOAD') && !categoryName.includes('CARD');

        let itemCost = Number(product?.cost || 0);
        if (isHotReload && itemCost === 0) {
          itemCost = Number(item.price) * 0.96; 
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
    if (oldTx.customerId || tx.customerId) {
      // Handle Customer Change
      if (oldTx.customerId && oldTx.customerId !== tx.customerId) {
        const oldCustomer = customers.find(c => c.id === oldTx.customerId);
        if (oldCustomer) {
          let oldCreditValue = oldTx.paymentMethod === 'CREDIT' ? Number(oldTx.amount) : (Number(oldTx.balanceDue) || 0);
          if (oldTx.type === 'CREDIT_PAYMENT') oldCreditValue = -Number(oldTx.amount);
          await upsertDocument(dbCols.customers, oldCustomer.id, {
            ...oldCustomer,
            totalCredit: (Number(oldCustomer.totalCredit) || 0) - oldCreditValue
          });
        }
      }

      const currentCustomer = customers.find(c => c.id === tx.customerId);
      if (currentCustomer) {
        let oldCreditValue = 0;
        if (oldTx.customerId === tx.customerId) {
          oldCreditValue = oldTx.paymentMethod === 'CREDIT' ? Number(oldTx.amount) : (Number(oldTx.balanceDue) || 0);
          if (oldTx.type === 'CREDIT_PAYMENT') oldCreditValue = -Number(oldTx.amount);
        }

        let newCreditValue = tx.paymentMethod === 'CREDIT' ? Number(tx.amount) : (Number(tx.balanceDue) || 0);
        if (tx.type === 'CREDIT_PAYMENT') newCreditValue = -Number(tx.amount);

        const diff = newCreditValue - oldCreditValue;
        await upsertDocument(dbCols.customers, currentCustomer.id, {
          ...currentCustomer,
          totalCredit: (Number(currentCustomer.totalCredit) || 0) + diff
        });
      }
    }

    // 2. Vendor Balance Delta
    if (oldTx.vendorId || tx.vendorId) {
      // Handle Vendor Change
      if (oldTx.vendorId && oldTx.vendorId !== tx.vendorId) {
        const oldVendor = vendors.find(v => v.id === oldTx.vendorId);
        if (oldVendor) {
          let oldImpact = 0;
          if (oldTx.type === 'PURCHASE' && !oldTx.id.startsWith('PU-')) oldImpact = Number(oldTx.amount);
          else if (oldTx.type === 'CREDIT_PAYMENT') oldImpact = -Number(oldTx.amount);

          await upsertDocument(dbCols.vendors, oldVendor.id, {
            ...oldVendor,
            totalBalance: (Number(oldVendor.totalBalance) || 0) - oldImpact
          });
        }
      }

      const currentVendor = vendors.find(v => v.id === tx.vendorId);
      if (currentVendor) {
        let oldImpact = 0;
        if (oldTx.vendorId === tx.vendorId) {
          // FIX: Only impact vendor balance if it was a CREDIT purchase or a SETTLEMENT
          if (oldTx.type === 'PURCHASE' && !oldTx.id.startsWith('PU-') && oldTx.paymentMethod === 'CREDIT') oldImpact = Number(oldTx.amount);
          else if (oldTx.type === 'CREDIT_PAYMENT') oldImpact = -Number(oldTx.amount);
        }

        let newImpact = 0;
        if (tx.type === 'PURCHASE' && !tx.id.startsWith('PU-') && tx.paymentMethod === 'CREDIT') newImpact = Number(tx.amount);
        else if (tx.type === 'CREDIT_PAYMENT') newImpact = -Number(tx.amount);

        const vDiff = newImpact - oldImpact;
        if (vDiff !== 0) {
          await upsertDocument(dbCols.vendors, currentVendor.id, {
            ...currentVendor,
            totalBalance: (Number(currentVendor.totalBalance) || 0) + vDiff
          });
        }
      }
    }

    // 3. Bank/Cash Account Balance Delta
    if (oldTx.accountId || tx.accountId) {
      // if account changed, restore old and deduct new
      if (oldTx.accountId && oldTx.accountId !== tx.accountId) {
        const oldAcc = accounts.find(a => a.id === oldTx.accountId);
        if (oldAcc) {
          const isOutflow = ['PURCHASE', 'EXPENSE', 'CREDIT_PAYMENT'].includes(oldTx.type);
          const inflow = Number(oldTx.paidAmount) || (oldTx.paymentMethod !== 'CREDIT' ? Number(oldTx.amount) : 0);
          const restoreAmount = isOutflow ? Number(oldTx.amount) : -inflow;
          await upsertDocument(dbCols.accounts, oldAcc.id, { ...oldAcc, balance: Number(oldAcc.balance) + restoreAmount });
        }
      }

      const currentAcc = accounts.find(a => a.id === tx.accountId);
      if (currentAcc) {
        let oldBalDiff = 0;
        if (oldTx.accountId === tx.accountId) {
          const isOutflow = ['PURCHASE', 'EXPENSE', 'CREDIT_PAYMENT'].includes(oldTx.type);
          // FIX: For purchases, only outflow if NOT credit
          let oldAmountToDeduct = 0;
          if (oldTx.type === 'PURCHASE') {
            oldAmountToDeduct = (oldTx.paymentMethod !== 'CREDIT') ? Number(oldTx.amount) : 0;
          } else if (oldTx.type === 'EXPENSE' || oldTx.type === 'CREDIT_PAYMENT') {
            oldAmountToDeduct = Number(oldTx.amount);
          }

          const inflow = Number(oldTx.paidAmount) || (oldTx.type === 'SALE' && oldTx.paymentMethod !== 'CREDIT' ? Number(oldTx.amount) : 0);
          oldBalDiff = isOutflow ? -oldAmountToDeduct : inflow;
        }

        const isOutflowNew = ['PURCHASE', 'EXPENSE', 'CREDIT_PAYMENT'].includes(tx.type);
        let newAmountToDeduct = 0;
        if (tx.type === 'PURCHASE') {
          newAmountToDeduct = (tx.paymentMethod !== 'CREDIT') ? Number(tx.amount) : 0;
        } else if (tx.type === 'EXPENSE' || tx.type === 'CREDIT_PAYMENT') {
          newAmountToDeduct = Number(tx.amount);
        }

        const inflowNew = Number(tx.paidAmount) || (tx.type === 'SALE' && tx.paymentMethod !== 'CREDIT' ? Number(tx.amount) : 0);
        const newBalDiff = isOutflowNew ? -newAmountToDeduct : inflowNew;

        await upsertDocument(dbCols.accounts, currentAcc.id, {
          ...currentAcc,
          balance: Number(currentAcc.balance) + (newBalDiff - oldBalDiff)
        });
      }
    }

    // 4. Stock Adjustment for SALE transactions
    if ((oldTx.type === 'SALE' || tx.type === 'SALE') && (oldTx.items || tx.items)) {
      const activeBranch = userProfile.branch;
      const stockBranch = getStockBranch(activeBranch);

      const stockChanges = new Map<string, number>();

      if (oldTx.type === 'SALE' && oldTx.items) {
        for (const oldItem of oldTx.items) {
          const product = products.find(p => p.id === oldItem.productId);
          const productCategory = categories.find(c => c.id === product?.categoryId);
          const categoryName = (productCategory?.name || '').toUpperCase();
          const isHotReload = categoryName.includes('RELOAD') && !categoryName.includes('CARD');
          const amountToRestore = isHotReload ? (Number(oldItem.price) * Number(oldItem.quantity) * 0.96) : Number(oldItem.quantity);
          stockChanges.set(oldItem.productId, (stockChanges.get(oldItem.productId) || 0) + amountToRestore);
        }
      }

      if (tx.type === 'SALE' && tx.items) {
        for (const newItem of tx.items) {
          const product = products.find(p => p.id === newItem.productId);
          const productCategory = categories.find(c => c.id === product?.categoryId);
          const categoryName = (productCategory?.name || '').toUpperCase();
          const isHotReload = categoryName.includes('RELOAD') && !categoryName.includes('CARD');
          const amountToDeduct = isHotReload ? (Number(newItem.price) * Number(newItem.quantity) * 0.96) : Number(newItem.quantity);
          stockChanges.set(newItem.productId, (stockChanges.get(newItem.productId) || 0) - amountToDeduct);
        }
      }

      for (const [productId, netChange] of stockChanges.entries()) {
        if (netChange !== 0) {
          const product = products.find(p => p.id === productId);
          if (product) {
            const bStocks = { ...(product.branchStocks || {}) };
            const currentStock = bStocks[stockBranch] !== undefined ? bStocks[stockBranch] : product.stock;
            const productCategory = categories.find(c => c.id === product.categoryId);
            const categoryName = (productCategory?.name || '').toUpperCase();
            const isHotReload = categoryName.includes('RELOAD') && !categoryName.includes('CARD');
            bStocks[stockBranch] = isHotReload ? (Number(currentStock) + netChange) : Math.max(0, Number(currentStock) + netChange);
            await upsertDocument(dbCols.products, product.id, {
              ...product,
              branchStocks: bStocks,
              stock: ['CASHIER 1', 'CASHIER 2', 'CASHIER 3', 'CASHIER 4'].reduce((a, key) => a + (Number(bStocks[key]) || 0), 0)
            });
          }
        }
      }
    }

    await upsertDocument(dbCols.transactions, tx.id, sanitizeData(tx));
  };

  const handleResyncBalances = async () => {
    setIsRestoring(true);
    setRestorationPhase('Auditing Ledger Streams...');
    try {
      // 1. Recalculate Vendor Balances
      for (const vendor of vendors) {
        // THE GOLD STANDARD: Balance = (Credit POs sum) + (Manual Credit Purchases sum) - (Settlements sum)
        // FIX: Only include POs with paymentMethod 'CREDIT'
        const vendorPOs = purchaseOrders.filter(po => po.vendorId === vendor.id && po.status !== 'DRAFT' && po.paymentMethod === 'CREDIT');
        const vendorTxs = transactions.filter(t => t.vendorId === vendor.id);

        const totalBookedPO = vendorPOs.reduce((sum, po) => sum + Number(po.totalAmount), 0);

        // Manual purchases are Those that are NOT from the PO system.
        // FIX: Only include transactions with paymentMethod 'CREDIT'
        const totalManualPurchases = vendorTxs
          .filter(t =>
            t.type === 'PURCHASE' &&
            !t.id.startsWith('PU-') &&
            !t.description?.includes('PO-') &&
            !t.description?.includes('Stock Received') &&
            t.paymentMethod === 'CREDIT'
          )
          .reduce((sum, t) => sum + Number(t.amount), 0);

        const totalSettled = vendorTxs
          .filter(t => t.type === 'CREDIT_PAYMENT')
          .reduce((sum, t) => sum + Number(t.amount), 0);

        const newBalance = (totalBookedPO + totalManualPurchases) - totalSettled;
        if (Math.abs(Number(vendor.totalBalance || 0) - newBalance) > 0.1) {
          await upsertDocument(dbCols.vendors, vendor.id, { ...vendor, totalBalance: newBalance });
        }
      }

      // 2. Recalculate Customer Balances
      for (const customer of customers) {
        const customerTxs = transactions.filter(t => t.customerId === customer.id && t.status !== 'DRAFT');

        let totalCredit = 0;
        customerTxs.forEach(t => {
          if (t.type === 'SALE' || t.type === 'LOAN_GIVEN' || t.type === 'SALE_HISTORY_IMPORT') {
            const amount = t.paymentMethod === 'CREDIT' ? Number(t.amount) : (Number(t.balanceDue) || 0);
            totalCredit += amount;
          } else if (t.type === 'CREDIT_PAYMENT') {
            // Only deduct from total credit if the payment is NOT linked 
            // (Linked payments already reduce the balanceDue of the parent SALE)
            if (!t.parentTxId) {
              totalCredit -= Number(t.amount);
            }
          }
        });

        if (Math.abs(Number(customer.totalCredit || 0) - totalCredit) > 0.1) {
          await upsertDocument(dbCols.customers, customer.id, { ...customer, totalCredit });
        }
      }

      alert("Ledger Audit Complete. All balances have been synchronized with the transaction stream.");
    } catch (err: any) {
      alert("Resync Failed: " + err.message);
    } finally {
      setIsRestoring(false);
    }
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
        // FIX: Only reverse if it was a CREDIT purchase or a SETTLEMENT
        if (tx.type === 'PURCHASE' && tx.paymentMethod === 'CREDIT') vDiff = -Number(tx.amount);
        else if (tx.type === 'CREDIT_PAYMENT') vDiff = Number(tx.amount);

        if (vDiff !== 0) {
          await upsertDocument(dbCols.vendors, vendor.id, {
            ...vendor,
            totalBalance: (Number(vendor.totalBalance) || 0) + vDiff
          });
        }
      }
    }

    // 3. Reverse Account Impact
    if (tx.accountId) {
      const acc = accounts.find(a => a.id === tx.accountId);
      if (acc) {
        // Determine if the original transaction was an outflow or inflow
        // Purchases, Expenses, and Vendor Settlements are outflows.
        // Sales and Customer Settlements are inflows.
        const isOutflow = ['PURCHASE', 'EXPENSE'].includes(tx.type) || (tx.type === 'CREDIT_PAYMENT' && tx.vendorId);

        let amountToRestore = 0;
        if (tx.type === 'PURCHASE') {
          amountToRestore = (tx.paymentMethod !== 'CREDIT') ? Number(tx.amount) : 0;
        } else if (tx.type === 'EXPENSE' || tx.type === 'CREDIT_PAYMENT') {
          amountToRestore = Number(tx.amount);
        }

        const inflow = Number(tx.paidAmount) || (tx.type === 'SALE' && tx.paymentMethod !== 'CREDIT' ? Number(tx.amount) : 0);

        // If it was an outflow, we ADD back (restore). If it was an inflow, we SUBTRACT (reverse).
        const aDiff = isOutflow ? amountToRestore : -inflow;

        await upsertDocument(dbCols.accounts, acc.id, {
          ...acc,
          balance: Number(acc.balance) + aDiff
        });
      }
    }

    // 4. Restore/Deduct Stock
    if (tx.type === 'SALE' && tx.items) {
      const activeBranch = userProfile.branch;
      const stockBranch = getStockBranch(activeBranch);

      for (const item of tx.items) {
        const product = products.find(p => p.id === item.productId);
        if (product) {
          const bStocks = { ...(product.branchStocks || {}) };
          const currentStock = bStocks[stockBranch] !== undefined ? bStocks[stockBranch] : product.stock;

          const productCategory = categories.find(c => c.id === product?.categoryId);
          const categoryName = (productCategory?.name || '').toUpperCase();
          const isHotReload = categoryName.includes('RELOAD') && !categoryName.includes('CARD');

          const amountToRestore = isHotReload ? (Number(item.price) * Number(item.quantity) * 0.96) : Number(item.quantity);

          bStocks[stockBranch] = Number(currentStock) + amountToRestore;

          await upsertDocument(dbCols.products, product.id, {
            ...product,
            branchStocks: bStocks,
            stock: ['CASHIER 1', 'CASHIER 2', 'CASHIER 3', 'CASHIER 4'].reduce((a, key) => a + (Number(bStocks[key]) || 0), 0)
          });
        }
      }
    } else if (tx.type === 'PURCHASE') {
      const poId = tx.description?.match(/PO-[A-Z0-9]+/i)?.[0] || tx.description?.split(': ').pop();
      const po = purchaseOrders.find(p => p.id === poId);
      if (po && po.items) {
        const activeBranch = userProfile.branch;
        const stockBranch = getStockBranch(activeBranch);

        for (const item of po.items) {
          const product = products.find(p => p.id === item.productId);
          if (product) {
            const bStocks = { ...(product.branchStocks || {}) };
            const currentStock = bStocks[stockBranch] !== undefined ? bStocks[stockBranch] : product.stock;
            bStocks[stockBranch] = Number(currentStock) - (Number(item.quantity) + (Number(item.freeQuantity) || 0));

            await upsertDocument(dbCols.products, product.id, {
              ...product,
              branchStocks: bStocks,
              stock: ['CASHIER 1', 'CASHIER 2', 'CASHIER 3', 'CASHIER 4'].reduce((a, key) => a + (Number(bStocks[key]) || 0), 0)
            });
          }
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
    const allowedStatuses: POStatus[] = ['PENDING', 'RECEIVED', 'DRAFT'];
    if (!po || !allowedStatuses.includes(po.status)) return;

    // VITAL SAFETY CHECK: Prevent double-receiving if a transaction already exists for this PO
    const existingTx = transactions.find(t =>
      (t.description?.includes(poId) && t.id.startsWith('PU-')) ||
      (t.type === 'PURCHASE' && t.description?.includes(poId))
    );
    if (existingTx) {
      const confirmReplace = window.confirm(`A stock receipt for PO ${poId} already exists in the ledger (${existingTx.id}).\n\nTo prevent duplicate stock, would you like to automatically DELETE the old transaction and re-receive this PO?`);
      if (confirmReplace) {
        await handleDeleteGlobalTransaction(existingTx.id);
      } else {
        return;
      }
    }

    const updatedPO: PurchaseOrder = {
      ...po,
      status: 'RECEIVED' as POStatus,
      receivedDate: new Date().toISOString()
    };
    await upsertDocument(dbCols.purchaseOrders, po.id, updatedPO);

    const activeBranch = userProfile.branch;
    const stockBranch = getStockBranch(activeBranch);

    for (const item of po.items) {
      const product = products.find(p => p.id === item.productId) || products.find(p => p.sku === item.productId) || products.find(p => p.name === item.productId);
      if (product) {
        const bStocks = { ...(product.branchStocks || {}) };
        const currentStock = bStocks[stockBranch] !== undefined ? bStocks[stockBranch] : product.stock;
        bStocks[stockBranch] = Number(currentStock) + Number(item.quantity) + (Number(item.freeQuantity) || 0);

        await upsertDocument(dbCols.products, product.id, {
          ...product,
          branchStocks: bStocks,
          stock: ['CASHIER 1', 'CASHIER 2', 'CASHIER 3', 'CASHIER 4'].reduce((a, key) => a + (Number(bStocks[key]) || 0), 0),
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
      accountId: (po.paymentMethod === 'BANK' || po.paymentMethod === 'CARD' || po.paymentMethod === 'CHEQUE') ? po.accountId : (po.paymentMethod === 'CASH' ? 'cash' : null),
      vendorId: po.vendorId,
      branchId: activeBranch,
      description: `Stock Received against PO: ${po.id}`,
      chequeNumber: po.chequeNumber,
      chequeDate: po.chequeDate,
      mainCategory: po.mainCategory,
      category: po.category,
      updatedAt: new Date().toISOString()
    });
    await upsertDocument(dbCols.transactions, txId, normalizedTx);

    // VITAL FIX: If it's a CASH purchase, deduct from account balance immediately
    if (po.paymentMethod !== 'CREDIT') {
      const accId = normalizedTx.accountId;
      if (accId) {
        const acc = accounts.find(a => a.id === accId);
        if (acc) {
          await upsertDocument(dbCols.accounts, acc.id, {
            ...acc,
            balance: Number(acc.balance) - Number(po.totalAmount)
          });
        }
      }
    }

  };

  const handleUpsertPO = async (po: PurchaseOrder) => {
    const oldPO = purchaseOrders.find(p => p.id === po.id);
    await upsertDocument(dbCols.purchaseOrders, po.id, po);

    // Manage Balance Impact of PO commitment
    // FIX: Updates balance if PO was CREDIT or becomes CREDIT (Correct Ledger Logic)
    const vendorId = po.vendorId || oldPO?.vendorId;
    if (vendorId) {
      // 1. Handle Vendor Change: Revert impact on OLD vendor
      if (oldPO && oldPO.vendorId && oldPO.vendorId !== vendorId && oldPO.paymentMethod === 'CREDIT' && oldPO.status !== 'DRAFT') {
        const oldVendor = vendors.find(v => v.id === oldPO.vendorId);
        if (oldVendor) {
          await upsertDocument(dbCols.vendors, oldVendor.id, {
            ...oldVendor,
            totalBalance: (Number(oldVendor.totalBalance) || 0) - Number(oldPO.totalAmount)
          });
        }
      }

      // 2. Handle Current Vendor Impact (Diff Logic)
      const vendor = vendors.find(v => v.id === vendorId);
      if (vendor) {
        // Calculate Net Effect on the ACTIVE vendor
        // FIX: Only impact if paymentMethod is 'CREDIT'
        const oldAmount = (oldPO && oldPO.status !== 'DRAFT' && oldPO.vendorId === vendorId && oldPO.paymentMethod === 'CREDIT') ? Number(oldPO.totalAmount) : 0;
        const newAmount = (po.status !== 'DRAFT' && po.vendorId === vendorId && po.paymentMethod === 'CREDIT') ? Number(po.totalAmount) : 0;
        const diff = newAmount - oldAmount;

        if (diff !== 0) {
          await upsertDocument(dbCols.vendors, vendor.id, {
            ...vendor,
            totalBalance: (Number(vendor.totalBalance) || 0) + diff
          });
        }
      }
    }
  };

  const handleDeletePO = async (id: string) => {
    const po = purchaseOrders.find(p => p.id === id);
    if (!po) return;

    // 1. Reverse Financial Impact
    // If it was RECEIVED, reverse the transaction (which also reverses stock/cash)
    if (po.status === 'RECEIVED') {
      const linkedTxs = transactions.filter(t => (t.description?.includes(id) && t.id.startsWith('PU-')) || (t.type === 'PURCHASE' && t.description?.includes(id)));
      for (const tx of linkedTxs) {
        await handleDeleteGlobalTransaction(tx.id);
      }
    } else if (po.status === 'PENDING' && po.paymentMethod === 'CREDIT' && po.vendorId) {
      // If it was PENDING CREDIT, reverse the vendor debt
      const vendor = vendors.find(v => v.id === po.vendorId);
      if (vendor) {
        await upsertDocument(dbCols.vendors, vendor.id, {
          ...vendor,
          totalBalance: (Number(vendor.totalBalance) || 0) - Number(po.totalAmount)
        });
      }
    }

    await deleteDocument(dbCols.purchaseOrders, id);
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
        date: tx.date || (getLocalDateString() + 'T12:00:00'),
        branchId: tx.branchId || userProfile.branch,
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
        date: tx.date || (getLocalDateString() + 'T12:00:00'),
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
        if (data.fixedAssets) await bulkUpsert(dbCols.fixedAssets, data.fixedAssets);
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
  const filteredDaySessions = activeBranch === 'ALL' ? daySessions : daySessions.filter(s => s.branchId === activeBranch);
  const branchDaySession = filteredDaySessions.find(s => s.date === getLocalDateString());

  const branchProducts = products.map(p => {
    const stockBranch = getStockBranch(activeBranch);
    if (activeBranch !== 'ALL' && p.branchStocks && p.branchStocks[stockBranch] !== undefined) {
      return { ...p, stock: p.branchStocks[stockBranch] };
    }
    return { ...p, stock: p.stock }; // Default to global sum or master stock
  });
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
    return <Login onLogin={handleLogin} onSignUp={handleLogin} userProfile={userProfile} users={users} />;
  }


  const activeDaySession = daySessions.find(s => s.date === getLocalDateString() && (s.branchId === activeBranch || !s.branchId));
  // Global visibility for History and Dashboard
  const branchFilteredTransactions = transactions;

  const handleResumeDraft = (tx: Transaction) => {
    // Reconstruct POS Cart from Transaction Items
    const restoredCart = (tx.items || []).map(item => {
      const product = products.find(p => p.id === item.productId) || products.find(p => p.name === item.productId);
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
      advanceAmount: 0,
      transactionId: tx.id,
      transactionDate: tx.date
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
              fixedAssets={fixedAssets}
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
          {currentView === 'SALES_HISTORY' && <SalesHistory jumpTarget={jumpTarget} clearJump={() => setJumpTarget(null)} transactions={transactions} products={products} customers={customers} categories={categories} userProfile={userProfile} accounts={accounts} daySessions={daySessions} purchaseOrders={purchaseOrders} onUpdateTransaction={handleUpdateGlobalTransaction} onDeleteTransaction={handleDeleteGlobalTransaction} onResumeDraft={handleResumeDraft} />}
          {currentView === 'INVENTORY' && <Inventory products={branchProducts} categories={categories} vendors={vendors} userProfile={userProfile} onAddCategory={(name) => { const c = { id: `cat-${Date.now()}`, name: name.toUpperCase() }; upsertDocument(dbCols.categories, c.id, c); return c; }} onUpsertCategory={(cat) => upsertDocument(dbCols.categories, cat.id, cat)} onDeleteCategory={(id) => deleteDocument(dbCols.categories, id)} onUpsertVendor={(v) => upsertDocument(dbCols.vendors, v.id, v)} onUpsertProduct={(p) => upsertDocument(dbCols.products, p.id, p)} onBulkUpsertProducts={handleBulkUpsertProducts} onDeleteProduct={(id) => deleteDocument(dbCols.products, id)} />}
          {
            currentView === 'FINANCE' && <Finance accounts={accounts} transactions={transactions} daySessions={filteredDaySessions} products={branchProducts} vendors={vendors} recurringExpenses={recurringExpenses} customers={customers} userProfile={userProfile} onOpenDay={(bal) => upsertDocument(dbCols.daySessions, getLocalDateString() + activeBranch, { date: getLocalDateString(), openingBalance: bal, status: 'OPEN', branchId: activeBranch, id: getLocalDateString() + activeBranch })} onCloseDay={(actual) => upsertDocument(dbCols.daySessions, getLocalDateString() + activeBranch, { actualClosing: actual, status: 'CLOSED', branchId: activeBranch, id: getLocalDateString() + activeBranch })} onAddExpense={handleAddExpense} onAddTransfer={handleAddTransfer}
              onUpdateTransaction={handleUpdateGlobalTransaction} onDeleteTransaction={handleDeleteGlobalTransaction} onAddRecurring={(re) => upsertDocument(dbCols.recurringExpenses, re.id, re)} onDeleteRecurring={(id) => deleteDocument(dbCols.recurringExpenses, id)} onUpsertAccount={(acc) => upsertDocument(dbCols.accounts, acc.id, acc)} onDeleteAccount={handleDeleteAccount} onResumeDraft={handleResumeDraft} onJumpTo={handleJumpTo} />
          }
          {currentView === 'CUSTOMERS' && <Customers jumpTarget={jumpTarget} clearJump={() => setJumpTarget(null)} customers={customers} transactions={transactions} accounts={accounts} products={products} onUpsertCustomer={(c) => upsertDocument(dbCols.customers, c.id, c)} onReceivePayment={handleCustomerPayment} onUpdateTransaction={handleUpdateGlobalTransaction} onDeleteTransaction={handleDeleteGlobalTransaction} />}

          {currentView === 'SETTINGS' && <Settings userProfile={userProfile} setUserProfile={(val) => upsertDocument(dbCols.profile, 'main', val)} onExport={handleExport} onImport={handleImport} onResyncBalances={handleResyncBalances} syncStatus="OFFLINE" />}
          {currentView === 'BARCODE_PRINT' && <BarcodePrint products={branchProducts} categories={categories} />}
          {currentView === 'CHEQUE_PRINT' && <ChequePrint vendors={vendors} />}
          {currentView === 'PURCHASES' && <Purchases jumpTarget={jumpTarget} clearJump={() => setJumpTarget(null)} products={branchProducts} purchaseOrders={purchaseOrders} vendors={vendors} accounts={accounts} transactions={transactions} userProfile={userProfile} categories={categories} onUpsertPO={handleUpsertPO} onReceivePO={handleReceivePO} onDeletePO={handleDeletePO} onUpsertVendor={(v) => upsertDocument(dbCols.vendors, v.id, v)} onPayVendor={handlePayVendor} onUpdateTransaction={handleUpdateGlobalTransaction} onDeleteTransaction={handleDeleteGlobalTransaction} onResyncBalances={handleResyncBalances} />}
          {currentView === 'RELOAD' && <Reload products={branchProducts} categories={categories} userProfile={userProfile} transactions={transactions} customers={customers} onCompleteSale={handleCompleteSale} />}
          {currentView === 'ACCOUNTING' && <Accounting transactions={transactions} accounts={accounts} customers={customers} vendors={vendors} products={products} categories={categories} purchaseOrders={purchaseOrders} fixedAssets={fixedAssets} userProfile={userProfile} />}
          {currentView === 'USER_CONTROL' && <UserControl userProfile={userProfile} />}
          {currentView === 'FIXED_ASSETS' && <FixedAssets assets={fixedAssets} userProfile={userProfile} onUpsertAsset={(a) => upsertDocument(dbCols.fixedAssets, a.id, a)} onDeleteAsset={(id) => deleteDocument(dbCols.fixedAssets, id)} />}

        </div >
      </main >
    </div >
  );
};

export default App;