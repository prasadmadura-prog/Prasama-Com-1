
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
  const [userProfile, setUserProfile] = useState<UserProfile>({ name: "PRASAMA ERP", branch: "Main Terminal", isAdmin: false });
  const [recurringExpenses, setRecurringExpenses] = useState<RecurringExpense[]>([]);
  const [daySessions, setDaySessions] = useState<DaySession[]>([]);
  
  // Helper to get local date ISO string
  const getLocalDateString = () => {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
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

  // Handle Local Auth
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

  // Continuous Local Synchronization
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
    localStorage.setItem('prasama_local_auth', JSON.stringify(profile));
    setUserProfile(profile);
    setCurrentView('DASHBOARD');
  };

  const handleCompleteSale = async (tx: Transaction) => {
    try {
      // 1. Process Stock Reduction
      if (tx.items) {
        for (const item of tx.items) {
          const product = products.find(p => p.id === item.productId);
          if (product) {
            const updatedStock = Math.max(0, Number(product.stock) - Number(item.quantity));
            await upsertDocument(dbCols.products, product.id, {
              ...product,
              stock: updatedStock
            });
          }
        }
      }

      // 2. Update Customer Credit
      if (tx.paymentMethod === 'CREDIT' && tx.customerId) {
        const customer = customers.find(c => c.id === tx.customerId);
        if (customer) {
          await upsertDocument(dbCols.customers, customer.id, {
            ...customer,
            totalCredit: (Number(customer.totalCredit) || 0) + Number(tx.amount)
          });
        }
      }

      // 3. Save Transaction with normalized Type
      const normalizedTx = {
        ...tx,
        type: 'SALE' as const, // Explicitly enforce SALE type
        updatedAt: new Date().toISOString()
      };
      
      await upsertDocument(dbCols.transactions, tx.id, normalizedTx);
      console.log("SALE_COMMITTED:", tx.id);
    } catch (error) {
      console.error("TRANSACTION_FAILED:", error);
      alert("A critical error occurred while saving the sale. Ledger records may be incomplete.");
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

    for (const item of po.items) {
      const product = products.find(p => p.id === item.productId);
      if (product) {
        await upsertDocument(dbCols.products, product.id, {
          ...product,
          stock: Number(product.stock) + Number(item.quantity),
          cost: Number(item.cost)
        });
      }
    }

    const txId = `PU-${Date.now()}`;
    await upsertDocument(dbCols.transactions, txId, {
      id: txId,
      date: new Date().toISOString(),
      type: 'PURCHASE',
      amount: po.totalAmount,
      paymentMethod: po.paymentMethod,
      accountId: po.accountId,
      vendorId: po.vendorId,
      description: `Stock Received against PO: ${po.id}`,
      chequeNumber: po.chequeNumber,
      chequeDate: po.chequeDate
    });

    if (po.paymentMethod === 'CREDIT') {
      const vendor = vendors.find(v => v.id === po.vendorId);
      if (vendor) {
        await upsertDocument(dbCols.vendors, vendor.id, {
          ...vendor,
          totalBalance: (Number(vendor.totalBalance) || 0) + po.totalAmount
        });
      }
    }
  };

  const handleExport = () => {
    const data = {
      products, categories, transactions, accounts, vendors, customers,
      purchaseOrders, quotations, recurringExpenses, daySessions, userProfile,
      version: "9.3_LOCAL",
      timestamp: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `PRASAMA_BACKUP_${getLocalDateString()}.json`;
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
        setRestorationPhase('Synchronizing Local Store...');

        await bulkUpsert(dbCols.products, data.products || []);
        await bulkUpsert(dbCols.transactions, data.transactions || []);
        await bulkUpsert(dbCols.accounts, data.accounts || []);
        await bulkUpsert(dbCols.vendors, data.vendors || []);
        await bulkUpsert(dbCols.customers, data.customers || []);
        await bulkUpsert(dbCols.daySessions, data.daySessions || []);
        await bulkUpsert(dbCols.categories, data.categories || []);
        await bulkUpsert(dbCols.purchaseOrders, data.purchaseOrders || []);
        await bulkUpsert(dbCols.quotations, data.quotations || []);
        await bulkUpsert(dbCols.recurringExpenses, data.recurringExpenses || []);
        
        if (data.userProfile) await upsertDocument(dbCols.profile, 'main', data.userProfile);

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

  if (isLoading || isRestoring) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center">
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

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Sidebar 
        currentView={currentView} 
        setView={setCurrentView} 
        userProfile={userProfile} 
        accounts={accounts} 
        onEditProfile={() => setCurrentView('SETTINGS')}
        onLogout={handleLogout}
      />
      <main className="flex-1 overflow-y-auto bg-[#fcfcfc]">
        <div className="max-w-7xl mx-auto px-6 py-8 md:px-10 md:py-12">
            {currentView === 'DASHBOARD' && <Dashboard transactions={transactions} products={products} accounts={accounts} vendors={vendors} customers={customers} daySessions={daySessions} purchaseOrders={purchaseOrders} onNavigate={setCurrentView} onUpdateProduct={(p) => upsertDocument(dbCols.products, p.id, p)} />}
            {currentView === 'POS' && <POS accounts={accounts} products={products} customers={customers} categories={categories} userProfile={userProfile} onUpsertCustomer={(c) => upsertDocument(dbCols.customers, c.id, c)} onUpdateProduct={(p) => upsertDocument(dbCols.products, p.id, p)} onCompleteSale={handleCompleteSale} posSession={posSession} setPosSession={setPosSession} onQuickOpenDay={(bal) => upsertDocument(dbCols.daySessions, getLocalDateString(), { date: getLocalDateString(), openingBalance: bal, status: 'OPEN' })} onGoToFinance={() => setCurrentView('FINANCE')} activeSession={daySessions.find(s => s.date === getLocalDateString())} />}
            {currentView === 'QUOTATIONS' && <Quotations products={products} customers={customers} categories={categories} userProfile={userProfile} quotations={quotations} onUpsertQuotation={(q) => upsertDocument(dbCols.quotations, q.id, q)} onDeleteQuotation={(id) => deleteDocument(dbCols.quotations, id)} />}
            {currentView === 'SALES_HISTORY' && <SalesHistory transactions={transactions} products={products} customers={customers} userProfile={userProfile} accounts={accounts} onUpdateTransaction={(tx) => upsertDocument(dbCols.transactions, tx.id, tx)} onDeleteTransaction={(id) => deleteDocument(dbCols.transactions, id)} />}
            {currentView === 'INVENTORY' && <Inventory products={products} categories={categories} vendors={vendors} userProfile={userProfile} onAddCategory={(name) => { const c = {id: `cat-${Date.now()}`, name: name.toUpperCase()}; upsertDocument(dbCols.categories, c.id, c); return c; }} onDeleteCategory={(id) => deleteDocument(dbCols.categories, id)} onUpsertVendor={(v) => upsertDocument(dbCols.vendors, v.id, v)} onUpsertProduct={(p) => upsertDocument(dbCols.products, p.id, p)} onDeleteProduct={(id) => deleteDocument(dbCols.products, id)} />}
            {currentView === 'FINANCE' && <Finance accounts={accounts} transactions={transactions} daySessions={daySessions} products={products} vendors={vendors} recurringExpenses={recurringExpenses} userProfile={userProfile} onOpenDay={(bal) => upsertDocument(dbCols.daySessions, getLocalDateString(), { date: getLocalDateString(), openingBalance: bal, status: 'OPEN' })} onCloseDay={(actual) => upsertDocument(dbCols.daySessions, getLocalDateString(), { actualClosing: actual, status: 'CLOSED' })} onAddExpense={(tx) => upsertDocument(dbCols.transactions, `EX-${Date.now()}`, { ...tx, date: new Date().toISOString() })} onAddTransfer={(tx) => upsertDocument(dbCols.transactions, `TR-${Date.now()}`, { ...tx, date: new Date().toISOString() })} onUpdateTransaction={(tx) => upsertDocument(dbCols.transactions, tx.id, tx)} onDeleteTransaction={(id) => deleteDocument(dbCols.transactions, id)} onAddRecurring={(re) => upsertDocument(dbCols.recurringExpenses, re.id, re)} onDeleteRecurring={(id) => deleteDocument(dbCols.recurringExpenses, id)} onUpsertAccount={(acc) => upsertDocument(dbCols.accounts, acc.id, acc)} />}
            {currentView === 'CUSTOMERS' && <Customers customers={customers} transactions={transactions} onUpsertCustomer={(c) => upsertDocument(dbCols.customers, c.id, c)} onReceivePayment={(tx) => upsertDocument(dbCols.transactions, `CP-${Date.now()}`, { ...tx, date: new Date().toISOString() })} />}
            {currentView === 'AI_ADVISOR' && <AIAdvisor transactions={transactions} products={products} vendors={vendors} accounts={accounts} userProfile={userProfile} />}
            {currentView === 'SETTINGS' && <Settings userProfile={userProfile} setUserProfile={(val) => upsertDocument(dbCols.profile, 'main', val)} onExport={handleExport} onImport={handleImport} syncStatus="OFFLINE" />}
            {currentView === 'BARCODE_PRINT' && <BarcodePrint products={products} categories={categories} />}
            {currentView === 'CHEQUE_PRINT' && <ChequePrint />}
            {currentView === 'PURCHASES' && <Purchases products={products} purchaseOrders={purchaseOrders} vendors={vendors} accounts={accounts} transactions={transactions} userProfile={userProfile} onUpsertPO={(po) => upsertDocument(dbCols.purchaseOrders, po.id, po)} onReceivePO={handleReceivePO} onUpsertVendor={(v) => upsertDocument(dbCols.vendors, v.id, v)} />}
        </div>
      </main>
    </div>
  );
};

export default App;
