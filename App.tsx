
import React, { useState, useEffect } from 'react';
import { 
  subscribeToCollection, 
  subscribeToDocument, 
  upsertDocument, 
  deleteDocument,
  bulkUpsert,
  collections as dbCols 
} from './services/database';
import { v4 as uuidv4 } from 'uuid';
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
import AIAdvisor from './components/AIAdvisor';

const App: React.FC = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restorationPhase, setRestorationPhase] = useState('');
  const [currentView, setCurrentView] = useState<View>('LOGIN');
  
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [userProfile, setUserProfile] = useState<UserProfile>({ 
    name: "PRASAMA ERP", 
    branch: "Bookshop", 
    allBranches: ["Bookshop", "Shop 2"], 
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

  const [posSession, setPosSession] = useState<POSSession>({ 
    cart: [], 
    discount: 0, 
    discountPercent: 0, 
    paymentMethod: 'CASH', 
    accountId: 'cash', 
    search: '',
    chequeNumber: '',
    chequeDate: getLocalDateString()
  });

  useEffect(() => {
    const savedProfile = localStorage.getItem('prasama_local_auth');
    if (savedProfile) {
      setUserProfile(JSON.parse(savedProfile));
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
      subscribeToDocument(dbCols.profile, 'main', (data) => setUserProfile(prev => ({ ...prev, ...data })))
    ];

    return () => unsubscribes.forEach(unsub => unsub());
  }, [currentView, isLoading]);

  const handleLogout = () => {
    localStorage.removeItem('prasama_local_auth');
    setCurrentView('LOGIN');
  };

  const handleLogin = (profile: UserProfile) => {
    const defaultProfile = {
      ...profile,
      allBranches: profile.allBranches || ["Bookshop", "Shop 2"],
      branch: (profile.branch === "Local Node" || profile.branch === "Shop 1") ? "Bookshop" : (profile.branch || "Bookshop")
    };
    localStorage.setItem('prasama_local_auth', JSON.stringify(defaultProfile));
    setUserProfile(defaultProfile);
    setCurrentView('DASHBOARD');
  };

  const handleCompleteSale = async (tx: Transaction) => {
    try {
      const activeBranch = userProfile.branch;
      if (tx.items) {
        for (const item of tx.items) {
          const product = products.find(p => p.id === item.productId);
          if (product) {
            const bStocks = { ...(product.branchStocks || {}) };
            const currentStock = bStocks[activeBranch] !== undefined ? bStocks[activeBranch] : product.stock;
            const updatedStock = Math.max(0, Number(currentStock) - Number(item.quantity));
            bStocks[activeBranch] = updatedStock;
            await upsertDocument(dbCols.products, product.id, {
              ...product,
              branchStocks: bStocks,
              stock: (Object.values(bStocks) as number[]).reduce((a, b) => a + b, 0)
            });
          }
        }
      }

      if (tx.paymentMethod === 'CREDIT' && tx.customerId) {
        const customer = customers.find(c => c.id === tx.customerId);
        if (customer) {
          await upsertDocument(dbCols.customers, customer.id, {
            ...customer,
            totalCredit: (Number(customer.totalCredit) || 0) + Number(tx.amount)
          });
        }
      }

      const normalizedTx = {
        ...tx,
        type: 'SALE' as const,
        date: getLocalTimestamp(),
        branchId: activeBranch,
        updatedAt: new Date().toISOString()
      };
      await upsertDocument(dbCols.transactions, tx.id, normalizedTx);
      await logAuditTrail('CREATE', 'Transaction', tx.id, { type: 'SALE', amount: tx.amount });

      const acc = accounts.find(a => a.id === normalizedTx.accountId);
      if (acc && normalizedTx.paymentMethod !== 'CREDIT') {
        await upsertDocument(dbCols.accounts, acc.id, {
          ...acc,
          balance: Number(acc.balance) + Number(normalizedTx.amount)
        });
      }

    } catch (error) {
      console.error("TRANSACTION_FAILED:", error);
      alert("A critical error occurred while saving the sale.");
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
    await logAuditTrail('UPDATE', 'PurchaseOrder', po.id, { status: 'RECEIVED' });

    const activeBranch = userProfile.branch;

    for (const item of po.items) {
      const product = products.find(p => p.id === item.productId);
      if (product) {
        const bStocks = { ...(product.branchStocks || {}) };
        const currentStock = bStocks[activeBranch] !== undefined ? bStocks[activeBranch] : product.stock;
        bStocks[activeBranch] = Number(currentStock) + Number(item.quantity);

        await upsertDocument(dbCols.products, product.id, {
          ...product,
          branchStocks: bStocks,
          stock: (Object.values(bStocks) as number[]).reduce((a, b) => a + b, 0),
          cost: Number(item.cost)
        });
      }
    }

    const txId = `PU-${Date.now()}`;
    await upsertDocument(dbCols.transactions, txId, {
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
      chequeDate: po.chequeDate
    });
    await logAuditTrail('CREATE', 'Transaction', txId, { type: 'PURCHASE', amount: po.totalAmount });

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

  const handleExport = () => {
    const data = {
      products, categories, transactions, accounts, vendors, customers,
      purchaseOrders, quotations, recurringExpenses, daySessions, userProfile,
      version: "12.1_LIVE_STABLE",
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
        setRestorationPhase('Synchronizing Multibranch Core...');
        
        const migrateBranch = (bId?: string) => {
          const s = String(bId || '').trim();
          if (!s || s === "Shop 1" || s === "Local Node" || s === "undefined" || s === "null") return "Bookshop";
          return s;
        };

        const migratedTransactions = (data.transactions || []).map((t: any) => ({
          ...t,
          branchId: migrateBranch(t.branchId || t.branch)
        }));

        const migratedProducts = (data.products || []).map((p: any) => {
          let bStocks = p.branchStocks || {};
          if (Object.keys(bStocks).length === 0 && Number(p.stock) > 0) {
            bStocks["Bookshop"] = Number(p.stock);
          }
          const newBStocks: Record<string, number> = {};
          Object.entries(bStocks).forEach(([key, val]) => {
            newBStocks[migrateBranch(key)] = Number(val);
          });
          return { ...p, branchStocks: newBStocks };
        });

        const migratedSessions = (data.daySessions || []).map((s: any) => ({
          ...s,
          branchId: migrateBranch(s.branchId)
        }));

        await bulkUpsert(dbCols.products, migratedProducts);
        await bulkUpsert(dbCols.transactions, migratedTransactions);
        await bulkUpsert(dbCols.accounts, data.accounts || []);
        await bulkUpsert(dbCols.vendors, data.vendors || []);
        await bulkUpsert(dbCols.customers, data.customers || []);
        await bulkUpsert(dbCols.daySessions, migratedSessions);
        await bulkUpsert(dbCols.categories, data.categories || []);
        await bulkUpsert(dbCols.purchaseOrders, data.purchaseOrders || []);
        await bulkUpsert(dbCols.quotations, data.quotations || []);
        await bulkUpsert(dbCols.recurringExpenses, data.recurringExpenses || []);
        
        if (data.userProfile) {
          const profile = { 
            ...data.userProfile, 
            branch: migrateBranch(data.userProfile.branch),
            allBranches: data.userProfile.allBranches?.map((b: string) => migrateBranch(b)) || ["Bookshop", "Shop 2"]
          };
          await upsertDocument(dbCols.profile, 'main', profile);
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

  const handleCustomerPayment = async (tx: Omit<Transaction, 'id' | 'date'>) => {
    const txId = `CP-${Date.now()}`;
    await upsertDocument(dbCols.transactions, txId, { ...tx, id: txId, date: getLocalTimestamp(), branchId: userProfile.branch });
    await logAuditTrail('CREATE', 'Transaction', txId, { type: 'CREDIT_PAYMENT', amount: tx.amount });
    if (tx.customerId) {
      const customer = customers.find(c => c.id === tx.customerId);
      if (customer) {
        const newCredit = Math.max(0, Number(customer.totalCredit) - Number(tx.amount));
        await upsertDocument(dbCols.customers, customer.id, { ...customer, totalCredit: newCredit });
      }
    }
    const acc = accounts.find(a => a.id === tx.accountId || (tx.paymentMethod === 'CASH' && a.id === 'cash'));
    if (acc) {
      await upsertDocument(dbCols.accounts, acc.id, { ...acc, balance: Number(acc.balance) + Number(tx.amount) });
    }
  };

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

  const activeBranch = userProfile.branch;

  // Permissive Branch Filtering: Include legacy/null branches as the default branch to prevent "Zero Data"
  const isTargetBranch = (bId?: string) => {
    if (!bId || bId === "Shop 1" || bId === "Local Node" || bId === "undefined" || bId === "null") {
        return activeBranch === "Bookshop";
    }
    return bId === activeBranch;
  };

  const filteredDaySessions = daySessions.filter(s => isTargetBranch(s.branchId));
  const filteredTransactions = transactions.filter(t => isTargetBranch(t.branchId));
  const branchDaySession = filteredDaySessions.find(s => s.date === getLocalDateString());

  const branchProducts = products.map(p => ({
    ...p,
    stock: p.branchStocks && p.branchStocks[activeBranch] !== undefined ? p.branchStocks[activeBranch] : (activeBranch === "Bookshop" ? p.stock : 0)
  }));

  // Calculate today's metrics for Sidebar
  const todayDate = getLocalDateString();
  const todayTransactions = filteredTransactions.filter(t => {
    const txDate = t.date ? t.date.split('T')[0] : '';
    return txDate === todayDate;
  });

  const todayRevenue = todayTransactions
    .filter(t => t.type && t.type.toUpperCase() === 'SALE')
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);

  const todayCostOfRevenue = todayTransactions
    .filter(t => t.type && t.type.toUpperCase() === 'SALE')
    .reduce((sum, t) => {
      const itemsCost = (t.items || []).reduce((itemSum, item) => {
        const product = products.find(p => p.id === item.productId);
        return itemSum + (Number(product?.cost || 0) * Number(item.quantity || 0));
      }, 0);
      return sum + itemsCost;
    }, 0);

  const todayProfit = todayRevenue - todayCostOfRevenue;

  const todayCash = todayTransactions
    .filter(t => {
      const txType = t.type ? t.type.toUpperCase() : '';
      return (txType === 'SALE' && t.paymentMethod === 'CASH') || txType === 'CREDIT_PAYMENT';
    })
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 selection:bg-indigo-100 selection:text-indigo-700">
      <Sidebar 
        currentView={currentView} 
        setView={setCurrentView} 
        userProfile={userProfile} 
        accounts={accounts}
        todayRevenue={todayRevenue}
        todayProfit={todayProfit}
        todayCash={todayCash}
        onEditProfile={() => setCurrentView('SETTINGS')}
        onLogout={handleLogout}
        onSwitchBranch={(b) => {
          const updated = { ...userProfile, branch: b };
          setUserProfile(updated);
          upsertDocument(dbCols.profile, 'main', updated);
        }}
      />
      <main className="flex-1 overflow-y-auto bg-[#fcfcfc] custom-scrollbar">
        <div className="max-w-[1600px] mx-auto px-4 py-6 md:px-8 md:py-10 lg:px-12 lg:py-12">
            {currentView === 'DASHBOARD' && <Dashboard transactions={filteredTransactions} products={branchProducts} accounts={accounts} vendors={vendors} customers={customers} daySessions={filteredDaySessions} purchaseOrders={purchaseOrders} onNavigate={setCurrentView} onUpdateProduct={(p) => upsertDocument(dbCols.products, p.id, p)} />}
            {currentView === 'POS' && <POS accounts={accounts} products={branchProducts} customers={customers} transactions={filteredTransactions} categories={categories} userProfile={userProfile} onUpsertCustomer={(c) => upsertDocument(dbCols.customers, c.id, c)} onUpdateProduct={(p) => upsertDocument(dbCols.products, p.id, p)} onCompleteSale={handleCompleteSale} posSession={posSession} setPosSession={setPosSession} onQuickOpenDay={(bal) => upsertDocument(dbCols.daySessions, getLocalDateString() + activeBranch, { date: getLocalDateString(), openingBalance: bal, status: 'OPEN', branchId: activeBranch, id: getLocalDateString() + activeBranch })} onGoToFinance={() => setCurrentView('FINANCE')} activeSession={branchDaySession} />}
            {currentView === 'QUOTATIONS' && <Quotations products={branchProducts} customers={customers} categories={categories} userProfile={userProfile} quotations={quotations} onUpsertQuotation={(q) => upsertDocument(dbCols.quotations, q.id, q)} onDeleteQuotation={(id) => deleteDocument(dbCols.quotations, id)} />}
            {currentView === 'SALES_HISTORY' && <SalesHistory transactions={filteredTransactions} products={branchProducts} customers={customers} userProfile={userProfile} accounts={accounts} onUpdateTransaction={(tx) => upsertDocument(dbCols.transactions, tx.id, tx)} onDeleteTransaction={(id) => deleteDocument(dbCols.transactions, id)} />}
            {currentView === 'INVENTORY' && <Inventory products={products} categories={categories} vendors={vendors} userProfile={userProfile} onAddCategory={(name) => { const c = {id: `cat-${Date.now()}`, name: name.toUpperCase()}; upsertDocument(dbCols.categories, c.id, c); return c; }} onDeleteCategory={(id) => deleteDocument(dbCols.categories, id)} onUpsertVendor={(v) => upsertDocument(dbCols.vendors, v.id, v)} onUpsertProduct={(p) => upsertDocument(dbCols.products, p.id, p)} onDeleteProduct={(id) => deleteDocument(dbCols.products, id)} />}
            {currentView === 'FINANCE' && <Finance accounts={accounts} transactions={filteredTransactions} daySessions={filteredDaySessions} products={branchProducts} vendors={vendors} recurringExpenses={recurringExpenses} userProfile={userProfile} onOpenDay={(bal) => upsertDocument(dbCols.daySessions, getLocalDateString() + activeBranch, { date: getLocalDateString(), openingBalance: bal, status: 'OPEN', branchId: activeBranch, id: getLocalDateString() + activeBranch })} onCloseDay={(actual) => upsertDocument(dbCols.daySessions, getLocalDateString() + activeBranch, { actualClosing: actual, status: 'CLOSED', branchId: activeBranch, id: getLocalDateString() + activeBranch })} onAddExpense={(tx) => upsertDocument(dbCols.transactions, `EX-${Date.now()}`, { ...tx, date: getLocalDateString() + 'T12:00:00', branchId: activeBranch })} onAddTransfer={(tx) => upsertDocument(dbCols.transactions, `TR-${Date.now()}`, { ...tx, date: getLocalDateString() + 'T12:00:00', branchId: activeBranch })} onUpdateTransaction={(tx) => upsertDocument(dbCols.transactions, tx.id, tx)} onDeleteTransaction={(id) => deleteDocument(dbCols.transactions, id)} onAddRecurring={(re) => upsertDocument(dbCols.recurringExpenses, re.id, re)} onDeleteRecurring={(id) => deleteDocument(dbCols.recurringExpenses, id)} onUpsertAccount={(acc) => upsertDocument(dbCols.accounts, acc.id, acc)} />}
            {currentView === 'CUSTOMERS' && <Customers customers={customers} transactions={filteredTransactions} onUpsertCustomer={(c) => upsertDocument(dbCols.customers, c.id, c)} onReceivePayment={handleCustomerPayment} />}
            {currentView === 'AI_ADVISOR' && <AIAdvisor transactions={filteredTransactions} products={branchProducts} vendors={vendors} accounts={accounts} userProfile={userProfile} />}
            {currentView === 'SETTINGS' && <Settings userProfile={userProfile} setUserProfile={(val) => upsertDocument(dbCols.profile, 'main', val)} onExport={handleExport} onImport={handleImport} syncStatus="IDLE" />}
            {currentView === 'BARCODE_PRINT' && <BarcodePrint products={branchProducts} categories={categories} />}
            {currentView === 'CHEQUE_PRINT' && <ChequePrint />}
            {currentView === 'PURCHASES' && <Purchases products={branchProducts} purchaseOrders={purchaseOrders} vendors={vendors} accounts={accounts} transactions={filteredTransactions} userProfile={userProfile} onUpsertPO={(po) => upsertDocument(dbCols.purchaseOrders, po.id, po)} onReceivePO={handleReceivePO} onUpsertVendor={(v) => upsertDocument(dbCols.vendors, v.id, v)} />}
        </div>
      </main>
    </div>
  );
};

export default App;
