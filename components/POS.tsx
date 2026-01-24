
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Product, Transaction, Customer, Category, UserProfile, DaySession, BankAccount, POSSession } from '../types';
import { buildSaleReceiptHtml } from './ReceiptLayout';
import { Html5QrcodeScanner } from 'html5-qrcode';

interface POSProps {
  products: Product[];
  customers: Customer[];
  categories: Category[];
  accounts: BankAccount[];
  transactions: Transaction[];
  userProfile: UserProfile;
  activeSession?: DaySession;
  onUpsertCustomer: (c: Customer) => void;
  onUpdateProduct: (p: Product) => void;
  onCompleteSale: (tx: any) => void;
  onQuickOpenDay: (opening: number) => void;
  posSession: POSSession;
  setPosSession: React.Dispatch<React.SetStateAction<POSSession>>;
  onGoToFinance: () => void;
}

const POS: React.FC<POSProps> = ({ 
  products = [], 
  customers = [], 
  categories = [], 
  accounts = [],
  transactions = [],
  userProfile, 
  activeSession,
  onUpsertCustomer, 
  onUpdateProduct,
  onCompleteSale, 
  onQuickOpenDay,
  posSession,
  setPosSession,
  onGoToFinance
}) => {
  const { cart = [], discount = 0, discountPercent = 0, paymentMethod = 'CASH', accountId = 'cash', search = '', chequeNumber = '', chequeDate = '' } = posSession;
  
  const [lastTx, setLastTx] = useState<any>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [showCashModal, setShowCashModal] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [showGlobalDiscountEdit, setShowGlobalDiscountEdit] = useState(false);
  const [activeLineDiscountId, setActiveLineDiscountId] = useState<string | null>(null);
  const [activeLineEditId, setActiveLineEditId] = useState<string | null>(null);
  
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('walk-in');
  const [customerSearch, setCustomerSearch] = useState('');
  const [cashReceived, setCashReceived] = useState<string>('');
  
  const [isAddingCustomer, setIsAddingCustomer] = useState(false);
  const [newCusName, setNewCusName] = useState('');
  const [newCusPhone, setNewCusPhone] = useState('');
  const [newCusLimit, setNewCusLimit] = useState('50000');

  const holdTimerRef = useRef<number | null>(null);
  const holdIntervalRef = useRef<number | null>(null);
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);

  const filteredProducts = useMemo(() => {
    let result = products;
    if (search.trim()) {
      const lowerSearch = search.toLowerCase();
      result = products.filter(p => 
        (p.name || "").toLowerCase().includes(lowerSearch) || 
        (p.sku || "").toLowerCase().includes(lowerSearch)
      );
    }
    return [...result].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }, [search, products]);

  const filteredCustomers = useMemo(() => customers.filter(c => c && c.name && (c.name.toLowerCase().includes(customerSearch.toLowerCase()) || (c.phone && c.phone.includes(customerSearch)))), [customers, customerSearch]);

  const getTodayLocal = () => {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };

  // Get branch-specific stock for the current branch
  const getBranchStock = (product: Product): number => {
    if (product.branchStocks && product.branchStocks[userProfile.branch] !== undefined) {
      return product.branchStocks[userProfile.branch];
    }
    return product.stock || 0;
  };

  const today = getTodayLocal();

  // Quick preset setter for date ranges
  const setRangePreset = (days: number) => {
    const end = today;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - (days - 1));
    const startStr = startDate.toISOString().split('T')[0];
    setFromDate(startStr);
    setToDate(end);
  };

  // --- Audit Trail State ---
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);
  const [protocolFilter, setProtocolFilter] = useState<string[]>([]);
  const allProtocols = useMemo(() => {
    const protoSet = new Set<string>();
    (transactions || []).forEach(t => protoSet.add(t.type));
    return Array.from(protoSet);
  }, [transactions]);
  const auditTrailEntries = useMemo(() => {
    const filtered = (transactions || []).filter(t => {
      const txDate = t.date.split('T')[0];
      return txDate >= fromDate && txDate <= toDate;
    });
    if (!protocolFilter.length) return filtered;
    return filtered.filter(t => protocolFilter.includes(t.type));
  }, [transactions, fromDate, toDate, protocolFilter]);

  const dailySummary = useMemo(() => {
    const todayEntries = (transactions || []).filter(t => t.date.split('T')[0] === today);
    const realizedInflow = todayEntries
      .filter(s => (s.type === 'SALE' && s.paymentMethod !== 'CREDIT') || s.type === 'CREDIT_PAYMENT')
      .reduce((a, b) => a + Number(b.amount || 0), 0);
    const dueAmount = todayEntries
      .filter(s => s.type === 'SALE' && s.paymentMethod === 'CREDIT')
      .reduce((a, b) => a + Number(b.amount || 0), 0);
    return { realizedInflow, dueAmount };
  }, [transactions, today]);

  const totals = useMemo(() => {
    let gross = 0;
    let lineSavings = 0;
    cart.forEach(item => {
      const itemGross = item.qty * item.price;
      let itemDiscount = 0;
      if (item.discountType === 'PCT') {
        itemDiscount = (itemGross * item.discount) / 100;
      } else {
        itemDiscount = item.discount;
      }
      gross += itemGross;
      lineSavings += itemDiscount;
    });
    const subtotal = gross - lineSavings;
    let globalDiscountAmt = 0;
    if (discountPercent > 0) {
      globalDiscountAmt = (subtotal * discountPercent) / 100;
    } else {
      globalDiscountAmt = discount;
    }
    const finalTotal = Math.max(0, subtotal - globalDiscountAmt);
    return { gross, lineSavings, subtotal, globalDiscountAmt, finalTotal };
  }, [cart, discount, discountPercent]);

  const changeDue = Math.max(0, (parseFloat(cashReceived) || 0) - totals.finalTotal);
  const isDayOpen = activeSession?.status === 'OPEN';

  const startAction = (action: () => void) => {
    action(); 
    stopAction(); 
    holdTimerRef.current = window.setTimeout(() => {
      holdIntervalRef.current = window.setInterval(action, 80);
    }, 400);
  };

  const stopAction = () => {
    if (holdTimerRef.current) window.clearTimeout(holdTimerRef.current);
    if (holdIntervalRef.current) window.clearInterval(holdIntervalRef.current);
    holdTimerRef.current = null;
    holdIntervalRef.current = null;
  };

  const addToCart = (product: Product) => {
    const branchStock = getBranchStock(product);
    if (!isDayOpen || branchStock <= 0) return;
    setPosSession((prev: POSSession) => {
      const existing = prev.cart.find((item: any) => item.product.id === product.id);
      if (existing) {
        const branchStock = getBranchStock(existing.product);
        return { ...prev, cart: prev.cart.map((item: any) => item.product.id === product.id ? { ...item, qty: Math.min(item.qty + 1, branchStock) } : item) };
      }
      return { ...prev, cart: [{ product, qty: 1, price: product.price, discount: 0, discountType: 'AMT' }, ...prev.cart] };
    });
  };

  const updateCartQty = (id: string, newQty: number) => {
    setPosSession((prev: POSSession) => {
      if (newQty <= 0) {
        return { ...prev, cart: prev.cart.filter((item: any) => item.product.id !== id) };
      }
      return {
        ...prev,
        cart: prev.cart.map((item: any) => {
          if (item.product.id === id) {
            const branchStock = getBranchStock(item.product);
            return { ...item, qty: Math.min(newQty, branchStock) };
          }
          return item;
        })
      };
    });
  };

  const updateLinePrice = (id: string, newPrice: number) => {
    setPosSession((prev: POSSession) => ({
      ...prev,
      cart: prev.cart.map((item: any) => item.product.id === id ? { ...item, price: newPrice } : item)
    }));
  };

  const updateLineDiscount = (id: string, value: number, type: 'AMT' | 'PCT') => {
    setPosSession((prev: POSSession) => ({
      ...prev,
      cart: prev.cart.map((item: any) => item.product.id === id ? { ...item, discount: value, discountType: type } : item)
    }));
  };

  const updateGlobalDiscount = (value: number, type: 'AMT' | 'PCT') => {
    setPosSession(prev => ({
      ...prev,
      discount: type === 'AMT' ? value : 0,
      discountPercent: type === 'PCT' ? value : 0
    }));
  };

  const handleScan = (decodedText: string) => {
    const product = products.find(p => p.sku === decodedText || p.id === decodedText);
    if (product) {
      addToCart(product);
      setShowScanner(false);
    }
  };

  useEffect(() => {
    if (showScanner && !scannerRef.current) {
      const scanner = new Html5QrcodeScanner("reader", { fps: 10, qrbox: { width: 250, height: 250 } }, false);
      scanner.render(handleScan, (err) => console.debug(err));
      scannerRef.current = scanner;
    }
    return () => {
      if (scannerRef.current) {
        scannerRef.current.clear().catch(err => console.error("Failed to clear scanner", err));
        scannerRef.current = null;
      }
    };
  }, [showScanner]);

  const completeTransaction = (customerId?: string) => {
    setIsProcessing(true);
    const txId = `TX-${Date.now()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;
    const txPayload: any = {
      id: txId,
      type: 'SALE',
      amount: totals.finalTotal,
      discount: totals.lineSavings + totals.globalDiscountAmt,
      paymentMethod,
      accountId: (paymentMethod === 'BANK' || paymentMethod === 'CARD' || paymentMethod === 'CHEQUE') ? accountId : 'cash',
      description: `Sale: ${cart.length} SKUs`,
      date: getTodayLocal() + 'T' + new Date().toTimeString().split(' ')[0],
      items: cart.map(i => {
        const itemGross = i.qty * i.price;
        const itemDiscount = i.discountType === 'PCT' ? (itemGross * i.discount) / 100 : i.discount;
        return { 
          productId: i.product.id, 
          quantity: i.qty, 
          price: i.price, 
          discount: itemDiscount 
        };
      })
    };
    
    // Only add optional fields if they have values
    const finalCustomerId = customerId || (selectedCustomerId !== 'walk-in' ? selectedCustomerId : undefined);
    if (finalCustomerId) txPayload.customerId = finalCustomerId;
    if (paymentMethod === 'CHEQUE' && chequeNumber) txPayload.chequeNumber = chequeNumber;
    if (paymentMethod === 'CHEQUE' && chequeDate) txPayload.chequeDate = chequeDate;
    onCompleteSale(txPayload);
    setLastTx({ ...txPayload, subtotal: totals.gross, total: totals.finalTotal, globalDiscount: totals.globalDiscountAmt });
    setPosSession({ 
      cart: [], 
      discount: 0, 
      discountPercent: 0, 
      paymentMethod: 'CASH', 
      accountId: 'cash', 
      search: '',
      chequeNumber: '',
      chequeDate: getTodayLocal()
    });
    setSelectedCustomerId('walk-in');
    setShowCustomerModal(false);
    setShowCashModal(false);
    setShowGlobalDiscountEdit(false);
    setCashReceived('');
    setIsProcessing(false);
  };

  const handleRegisterNewCustomer = () => {
    if (!newCusName.trim()) return;
    const newCustomer: Customer = {
      id: `CUS-${Date.now()}`,
      name: newCusName.toUpperCase(),
      phone: newCusPhone,
      email: '',
      address: '',
      totalCredit: 0,
      creditLimit: parseFloat(newCusLimit) || 50000
    };
    onUpsertCustomer(newCustomer);
    completeTransaction(newCustomer.id);
    setIsAddingCustomer(false);
    setNewCusName('');
    setNewCusPhone('');
  };

  const printReceipt = (tx: any) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    const html = buildSaleReceiptHtml(tx, products, userProfile);
    printWindow.document.write(html);
    printWindow.document.close();
  };

  if (!isDayOpen) {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center bg-white rounded-3xl border border-slate-200 shadow-sm text-center">
        <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center text-2xl mb-6">🔒</div>
        <h2 className="text-xl font-bold text-slate-900 uppercase tracking-tight">Terminal Offline</h2>
        <p className="text-slate-400 text-sm mt-1 mb-8">Daily cash balance must be initialized before processing sales.</p>
        <button onClick={() => {
            const balance = prompt("Opening Float (Rs.):", "0");
            if (balance !== null) onQuickOpenDay(parseFloat(balance) || 0);
        }} className="bg-indigo-600 text-white px-8 py-3 rounded-xl font-bold text-sm shadow-lg hover:bg-indigo-700 transition-all">Initialize Float</button>
      </div>
    );
  }

  if (lastTx) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-md p-12 text-center space-y-8 animate-in zoom-in duration-300">
          <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center text-3xl mx-auto">✓</div>
          <h2 className="text-2xl font-bold text-slate-900 uppercase tracking-tighter">Checkout Successful</h2>
          <div className="grid grid-cols-2 gap-4">
            <button onClick={() => setLastTx(null)} className="bg-slate-900 text-white py-4 rounded-xl font-bold text-[10px] uppercase tracking-widest shadow-lg hover:bg-black transition-all">New Transaction</button>
            <button onClick={() => printReceipt(lastTx)} className="bg-indigo-600 text-white py-4 rounded-xl font-bold text-[10px] uppercase tracking-widest shadow-lg hover:bg-indigo-700 transition-all">Print Receipt</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-10rem)] flex flex-col gap-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="flex gap-4 flex-1 max-w-3xl">
          <div className="relative flex-1">
            <input 
              type="text" 
              placeholder="Scan barcode or search master catalog..." 
              className="w-full pl-12 pr-6 py-4 rounded-2xl border border-slate-200 focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none font-semibold text-sm bg-white" 
              value={search} 
              onChange={(e) => setPosSession((prev: POSSession) => ({...prev, search: e.target.value}))} 
            />
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
          </div>
          <select
            value={selectedCustomerId}
            onChange={(e) => setSelectedCustomerId(e.target.value)}
            className="px-4 py-4 rounded-2xl border border-slate-200 bg-white font-bold text-sm outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 min-w-[200px]"
          >
            <option value="walk-in">👤 Walk-in Customer</option>
            {customers.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <button 
            onClick={() => setShowScanner(true)}
            className="px-6 bg-slate-100 rounded-2xl border border-slate-200 hover:bg-indigo-50 hover:text-indigo-600 transition-all font-black text-[10px] uppercase tracking-widest"
          >
            📷 Scan
          </button>
          <button 
            onClick={() => {
              const savedCarts = JSON.parse(localStorage.getItem('savedCarts') || '[]');
              if (savedCarts.length === 0) { alert('No saved carts found'); return; }
              const lastCart = savedCarts[savedCarts.length - 1];
              setPosSession({ ...posSession, cart: lastCart.cart, discount: lastCart.discount, discountPercent: lastCart.discountPercent, paymentMethod: lastCart.paymentMethod, accountId: lastCart.accountId });
              savedCarts.pop();
              localStorage.setItem('savedCarts', JSON.stringify(savedCarts));
            }}
            className="px-6 bg-amber-100 rounded-2xl border border-amber-200 hover:bg-amber-200 transition-all font-black text-[10px] uppercase tracking-widest text-amber-700"
          >
            📂 Load Cart
          </button>
        </div>
        <div className="bg-white p-4 rounded-3xl border border-slate-100 shadow-sm flex gap-8 items-center">
            <div className="text-right">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Realized Inflow (Cash+Bank)</p>
                <p className="text-base font-black font-mono text-emerald-600">Rs. {dailySummary.realizedInflow.toLocaleString()}</p>
            </div>
            <div className="w-px h-8 bg-slate-100"></div>
            <div className="text-right">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">New Unsettled Credit</p>
                <p className="text-base font-black font-mono text-rose-600">Rs. {dailySummary.dueAmount.toLocaleString()}</p>
            </div>
        </div>

        {/* --- AUDIT TRAIL SECTION --- */}
        <div className="mt-16 bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-8 border-b border-slate-50 flex flex-col md:flex-row justify-between items-center bg-slate-50/20 gap-4 md:gap-0">
            <h3 className="font-black text-slate-900 uppercase tracking-tighter text-xs">Audit Trail</h3>
            <div className="flex flex-col md:flex-row items-center gap-4">
              <div className="flex items-center gap-2">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">From</label>
                <input type="date" value={fromDate} max={toDate} onChange={e => setFromDate(e.target.value)} className="px-2 py-1 rounded border border-slate-200 text-[10px] font-bold bg-white outline-none focus:border-indigo-500" />
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">To</label>
                <input type="date" value={toDate} min={fromDate} max={today} onChange={e => setToDate(e.target.value)} className="px-2 py-1 rounded border border-slate-200 text-[10px] font-bold bg-white outline-none focus:border-indigo-500" />
                <div className="flex items-center gap-1 ml-2">
                  <button onClick={() => setRangePreset(1)} className="px-2 py-1 text-[9px] font-black uppercase tracking-widest text-slate-500 hover:text-indigo-600 border border-slate-200 rounded-lg bg-white">Today</button>
                  <button onClick={() => setRangePreset(7)} className="px-2 py-1 text-[9px] font-black uppercase tracking-widest text-slate-500 hover:text-indigo-600 border border-slate-200 rounded-lg bg-white">7d</button>
                  <button onClick={() => setRangePreset(30)} className="px-2 py-1 text-[9px] font-black uppercase tracking-widest text-slate-500 hover:text-indigo-600 border border-slate-200 rounded-lg bg-white">30d</button>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Protocol</label>
                <select
                  multiple
                  className="px-2 py-1 rounded border border-slate-200 text-[10px] font-bold bg-white outline-none focus:border-indigo-500 min-w-[100px]"
                  value={protocolFilter}
                  onChange={e => {
                    const options = Array.from(e.target.selectedOptions).map(o => o.value);
                    setProtocolFilter(options);
                  }}
                  size={Math.min(3, allProtocols.length)}
                  style={{ maxWidth: 120 }}
                >
                  {allProtocols.map(proto => (
                    <option key={proto} value={proto}>{proto}</option>
                  ))}
                </select>
                {protocolFilter.length > 0 && (
                  <button onClick={() => setProtocolFilter([])} className="text-[9px] text-slate-400 hover:text-rose-500 mt-1">Clear</button>
                )}
              </div>
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{auditTrailEntries.length} ENTRIES RECORDED</span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-400">
                <tr>
                  <th className="px-6 py-4 font-black uppercase tracking-widest text-[9px]">Date</th>
                  <th className="px-6 py-4 font-black uppercase tracking-widest text-[9px]">Operation / Entity</th>
                  <th className="px-6 py-4 font-black uppercase tracking-widest text-[9px]">Protocol</th>
                  <th className="px-6 py-4 font-black uppercase tracking-widest text-[9px]">Source Node</th>
                  <th className="px-6 py-4 font-black uppercase tracking-widest text-[9px]">Value (Rs.)</th>
                </tr>
              </thead>
              <tbody>
                {auditTrailEntries.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center text-slate-400 py-8 text-xs">No entries found for selected range.</td>
                  </tr>
                ) : (
                  auditTrailEntries.map((t, idx) => (
                    <tr key={t.id || idx} className="border-b border-slate-50">
                      <td className="px-6 py-3 text-[11px] font-mono">{t.date.split('T')[0]}</td>
                      <td className="px-6 py-3 text-[11px]">{t.entity || t.operation || '-'}</td>
                      <td className="px-6 py-3 text-[11px]">{t.type}</td>
                      <td className="px-6 py-3 text-[11px]">{t.sourceNode || '-'}</td>
                      <td className="px-6 py-3 text-[11px] font-mono">{Number(t.amount).toLocaleString()}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    );
  };

  export default POS;
              <input
                type="text"
                placeholder="Search items by name or SKU"
                className="w-full pl-11 pr-4 py-3 rounded-2xl border border-slate-200 focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none font-semibold text-sm bg-white shadow-sm"
                value={search}
                onChange={(e) => setPosSession((prev: POSSession) => ({ ...prev, search: e.target.value }))}
              />
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
            </div>
          </div>
          <table className="w-full text-left text-sm border-collapse table-fixed">
            <thead className="bg-slate-50/80 sticky top-20 backdrop-blur-md z-10">
              <tr>
                <th className="px-6 py-5 text-[11px] font-black text-slate-400 uppercase tracking-widest w-auto">Asset Details</th>
                <th className="px-2 py-5 text-[11px] font-black text-slate-400 uppercase tracking-widest text-right w-[110px]">Base Price</th>
                <th className="px-2 py-5 text-[11px] font-black text-slate-400 uppercase tracking-widest text-center w-[90px]">Stock</th>
                <th className="px-2 py-5 text-[11px] font-black text-slate-400 uppercase tracking-widest text-center w-[80px]">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredProducts.map(p => {
                const branchStock = getBranchStock(p);
                const isLowStock = branchStock <= (p.lowStockThreshold || 0);
                return (
                  <tr key={p.id} className="hover:bg-slate-50 transition-all group">
                    <td className="px-4 py-1 overflow-hidden">
                      <div className="flex items-center gap-2 overflow-hidden max-w-full">
                        <p className="font-black text-slate-900 text-[12px] uppercase truncate shrink leading-none">{p.name}</p>
                        <span className="text-slate-300 shrink-0">•</span>
                        <p className="text-[9px] font-mono font-black text-indigo-500 uppercase truncate opacity-70 shrink-0 leading-none">{p.sku}</p>
                      </div>
                    </td>
                    <td className="px-2 py-1 text-right whitespace-nowrap">
                      <span className="font-black text-slate-900 text-[11px] font-mono leading-none">Rs. {(Number(p.price) || 0).toLocaleString()}</span>
                    </td>
                    <td className="px-1 py-1 text-center">
                      <div className={`inline-flex flex-col items-center justify-center min-w-[35px] py-0.5 px-1 rounded border ${
                        isLowStock 
                          ? 'bg-rose-50 border-rose-100 text-rose-600' 
                          : 'bg-emerald-50 border-emerald-100 text-emerald-600'
                      }`}>
                        <span className="text-[9px] font-black font-mono leading-none">{branchStock}</span>
                        <span className="text-[6px] font-black uppercase tracking-tight leading-none">Units</span>
                      </div>
                    </td>
                    <td className="px-1 py-1 text-center">
                      <button 
                        onClick={(e) => { e.stopPropagation(); addToCart(p); }}
                        disabled={branchStock <= 0}
                        className="w-6 h-6 rounded-md bg-slate-900 text-white flex items-center justify-center font-black text-sm hover:bg-black hover:scale-105 active:scale-95 transition-all shadow-sm disabled:bg-slate-100 disabled:text-slate-300 disabled:shadow-none"
                      >
                        +
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filteredProducts.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-20 text-center opacity-30">
                    <div className="text-4xl mb-2">🔍</div>
                    <p className="text-xs font-black uppercase tracking-widest">No matching assets found in catalog</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="w-full md:w-[380px] lg:w-[420px] flex flex-col bg-white rounded-[2rem] border border-slate-200 shadow-xl overflow-hidden shrink-0">
          <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
            <h3 className="font-black text-slate-900 uppercase tracking-tight text-[11px]">Checkout Terminal</h3>
            <span className="bg-indigo-600 text-white px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter">{cart.length} SKUs</span>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-1">
            {cart.map(item => {
              const isDiscounting = activeLineDiscountId === item.product.id;
              const isEditing = activeLineEditId === item.product.id;
              const itemGross = item.price * item.qty;
              const itemDiscountAmt = item.discountType === 'PCT' ? (itemGross * item.discount) / 100 : item.discount;
              const itemNet = itemGross - itemDiscountAmt;
              
              return (
                <div key={item.product.id} className="rounded-xl bg-white border border-slate-100 hover:border-indigo-100 transition-all">
                  <div className="flex items-center justify-between p-2 gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-black text-slate-800 truncate uppercase leading-none">{item.product.name}</p>
                      <p className="text-[9px] font-mono font-bold text-slate-400 mt-1">
                        {item.price !== item.product.price ? `Rs. ${item.price.toLocaleString()}` : `Rs. ${item.product.price.toLocaleString()}`}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 bg-slate-50 rounded-lg p-1 border border-slate-100 shrink-0">
                      <button onClick={() => startAction(() => updateCartQty(item.product.id, item.qty - 1))} className="w-7 h-7 rounded bg-white flex items-center justify-center font-black text-slate-500 text-[14px] shadow-sm">-</button>
                      <input
                        type="number"
                        className="w-12 text-center text-[12px] font-black text-slate-700 bg-white border border-slate-200 rounded-md px-1 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                        value={item.qty}
                        onChange={(e) => updateCartQty(item.product.id, parseInt(e.target.value) || 0)}
                        onFocus={(e) => e.target.select()}
                        min={0}
                      />
                      <button onClick={() => startAction(() => updateCartQty(item.product.id, item.qty + 1))} className="w-7 h-7 rounded bg-white flex items-center justify-center font-black text-slate-500 text-[14px] shadow-sm">+</button>
                    </div>

                    <div className="w-20 text-right shrink-0">
                      <p className="text-[12px] font-black font-mono text-slate-900 leading-none">Rs. {itemNet.toLocaleString()}</p>
                    </div>

                    <div className="flex gap-1 shrink-0">
                      <button 
                        onClick={() => {
                          setActiveLineEditId(isEditing ? null : item.product.id);
                          setActiveLineDiscountId(null);
                        }}
                        className={`w-7 h-7 rounded-lg flex items-center justify-center text-[12px] transition-all shadow-sm ${isEditing ? 'bg-indigo-600 text-white' : 'bg-slate-50 text-slate-300 hover:text-indigo-500'}`}
                      >
                        ✏️
                      </button>
                      <button 
                        onClick={() => {
                          setActiveLineDiscountId(isDiscounting ? null : item.product.id);
                          setActiveLineEditId(null);
                        }}
                        className={`w-7 h-7 rounded-lg flex items-center justify-center text-[12px] transition-all shadow-sm ${item.discount > 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-50 text-slate-300 hover:text-emerald-500'}`}
                      >
                        🏷️
                      </button>
                    </div>
                  </div>

                  {isEditing && (
                    <div className="p-3 bg-slate-900 mx-2 mb-2 rounded-xl border border-slate-800 space-y-3 animate-in slide-in-from-top-2">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Price</label>
                          <input 
                            type="number" 
                            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-[11px] font-black font-mono text-white outline-none focus:border-indigo-500"
                            value={item.price}
                            onChange={(e) => updateLinePrice(item.product.id, parseFloat(e.target.value) || 0)}
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Qty</label>
                          <input 
                            type="number" 
                            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-[11px] font-black font-mono text-white outline-none focus:border-indigo-500"
                            value={item.qty}
                            onChange={(e) => updateCartQty(item.product.id, parseInt(e.target.value) || 0)}
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {isDiscounting && (
                    <div className="p-2.5 bg-slate-50 mx-2 mb-2 rounded-xl border border-slate-200 flex items-center gap-2 animate-in slide-in-from-top-2">
                      <div className="flex bg-white rounded-lg border border-slate-200 overflow-hidden shadow-inner">
                        <button onClick={() => updateLineDiscount(item.product.id, item.discount, 'AMT')} className={`px-2.5 py-1.5 text-[9px] font-black uppercase ${item.discountType === 'AMT' ? 'bg-slate-900 text-white' : 'text-slate-400'}`}>Rs</button>
                        <button onClick={() => updateLineDiscount(item.product.id, item.discount, 'PCT')} className={`px-2.5 py-1.5 text-[9px] font-black uppercase ${item.discountType === 'PCT' ? 'bg-slate-900 text-white' : 'text-slate-400'}`}>%</button>
                      </div>
                      <input 
                        type="number" 
                        className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-[11px] font-black font-mono text-indigo-600 outline-none shadow-sm" 
                        value={item.discount || ''}
                        placeholder="0"
                        onChange={(e) => updateLineDiscount(item.product.id, parseFloat(e.target.value) || 0, item.discountType)}
                        autoFocus
                      />
                      <button onClick={() => setActiveLineDiscountId(null)} className="text-[10px] font-black text-slate-400 hover:text-slate-900 px-1">OK</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="p-5 space-y-4 bg-slate-50 border-t border-slate-100">
            <div className="space-y-1.5 pb-2.5 border-b border-slate-200/50">
                <div className="flex justify-between items-center text-[11px] font-bold text-slate-500 uppercase tracking-widest">
                    <span>Subtotal</span>
                    <span className="font-mono text-slate-700">Rs. {totals.subtotal.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center text-[11px] font-black uppercase tracking-widest">
                    <div className="flex items-center gap-2.5">
                        <span className="text-slate-500">Invoice Disc.</span>
                        <button 
                            onClick={() => setShowGlobalDiscountEdit(!showGlobalDiscountEdit)}
                            className="w-6 h-6 rounded-md bg-white border border-slate-200 flex items-center justify-center text-[10px] hover:border-indigo-300 transition-all shadow-sm"
                        >
                            🏷️
                        </button>
                    </div>
                    <span className="font-mono text-rose-600">{totals.globalDiscountAmt > 0 ? '-' : ''} Rs. {totals.globalDiscountAmt.toLocaleString()}</span>
                </div>

                {showGlobalDiscountEdit && (
                  <div className="p-2.5 bg-indigo-900 rounded-2xl border border-indigo-800 flex items-center gap-2.5 animate-in slide-in-from-top-2 my-2.5">
                    <div className="flex bg-slate-800 rounded-xl border border-slate-700 overflow-hidden shadow-inner">
                      <button onClick={() => updateGlobalDiscount(discountPercent > 0 ? 0 : discount, 'AMT')} className={`px-3 py-2 text-[10px] font-black uppercase transition-colors ${discountPercent === 0 ? 'bg-white text-indigo-900' : 'text-slate-400'}`}>Rs</button>
                      <button onClick={() => updateGlobalDiscount(discount > 0 ? 0 : discountPercent, 'PCT')} className={`px-3 py-2 text-[10px] font-black uppercase transition-colors ${discountPercent > 0 ? 'bg-white text-indigo-900' : 'text-slate-400'}`}>%</button>
                    </div>
                    <input 
                      type="number" 
                      className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-[12px] font-black font-mono text-white outline-none focus:border-indigo-400 shadow-inner" 
                      value={discountPercent > 0 ? discountPercent : (discount || '')}
                      placeholder="0"
                      onChange={(e) => updateGlobalDiscount(parseFloat(e.target.value) || 0, discountPercent > 0 ? 'PCT' : 'AMT')}
                      autoFocus
                    />
                    <button onClick={() => setShowGlobalDiscountEdit(false)} className="text-[11px] font-black text-indigo-300 hover:text-white px-2">Done</button>
                  </div>
                )}
            </div>

            <div className="grid grid-cols-5 gap-1.5">
              {['CASH', 'BANK', 'CARD', 'CREDIT', 'CHEQUE'].map(m => (
                <button key={m} onClick={() => setPosSession((prev: POSSession) => ({...prev, paymentMethod: m as any}))} className={`py-2 rounded-xl text-[9px] font-black uppercase transition-all border ${paymentMethod === m ? 'bg-slate-900 border-slate-900 text-white shadow-md' : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'}`}>{m}</button>
              ))}
            </div>

            <div className="pt-2 flex justify-between items-end text-2xl font-black text-slate-900 tracking-tighter">
                  <span className="text-[11px] uppercase tracking-[0.2em] mb-1.5">Net Pay</span>
                  <span className="font-mono">Rs. {totals.finalTotal.toLocaleString()}</span>
            </div>
            <div className="flex gap-3">
              <button 
                onClick={() => {
                  const savedCart = { cart, discount, discountPercent, paymentMethod, accountId, savedAt: new Date().toISOString() };
                  const existingCarts = JSON.parse(localStorage.getItem('savedCarts') || '[]');
                  existingCarts.push(savedCart);
                  localStorage.setItem('savedCarts', JSON.stringify(existingCarts));
                  setPosSession({ cart: [], discount: 0, discountPercent: 0, paymentMethod: 'CASH', accountId: 'cash', search: '', chequeNumber: '', chequeDate: getTodayLocal() });
                  alert('Cart saved for later!');
                }}
                disabled={cart.length === 0}
                className="flex-1 bg-slate-200 text-slate-700 py-4 rounded-[1.5rem] font-black uppercase text-[10px] shadow-lg active:scale-[0.98] disabled:bg-slate-100 disabled:text-slate-300 transition-all tracking-[0.1em]"
              >
                Save Cart
              </button>
              <button 
                onClick={() => {
                  if (paymentMethod === 'CREDIT') setShowCustomerModal(true);
                  else if (paymentMethod === 'CASH') setShowCashModal(true);
                  else completeTransaction();
                }} 
                disabled={cart.length === 0 || isProcessing} 
                className="flex-[2] bg-indigo-600 text-white py-4 rounded-[1.5rem] font-black uppercase text-[11px] shadow-2xl shadow-indigo-600/20 active:scale-[0.98] disabled:bg-slate-200 transition-all tracking-[0.1em]"
              >
                Authorize Payment
              </button>
            </div>
          </div>
        </div>
      </div>

      {showScanner && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md">
           <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-xl overflow-hidden animate-in zoom-in duration-300">
              <div className="p-8 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                 <div>
                    <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Camera Scanner</h3>
                    <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest mt-1">Ready for QR / Barcode identification</p>
                 </div>
                 <button onClick={() => setShowScanner(false)} className="text-slate-300 hover:text-slate-900 text-4xl leading-none">&times;</button>
              </div>
              <div className="p-8">
                 <div id="reader" className="w-full overflow-hidden rounded-3xl border-4 border-slate-900 shadow-inner bg-black min-h-[300px]"></div>
                 <button 
                  onClick={() => setShowScanner(false)}
                  className="w-full mt-8 bg-slate-900 text-white font-black py-4 rounded-2xl uppercase text-[11px] tracking-widest shadow-xl hover:bg-black transition-all"
                 >
                   Discard & Return
                 </button>
              </div>
           </div>
        </div>
      )}

      {showCashModal && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-xl cursor-pointer"
          onClick={(e) => { if(e.target === e.currentTarget) { setShowCashModal(false); setCashReceived(''); } }}
        >
           <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in duration-300 cursor-default">
              <div className="p-10 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                 <div>
                    <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Cash Tender</h3>
                    <p className="text-[11px] font-black text-indigo-500 uppercase tracking-widest mt-1">Authorizing Local Flow</p>
                 </div>
                 <button 
                   type="button"
                   onClick={() => { setShowCashModal(false); setCashReceived(''); }} 
                   className="w-12 h-12 flex items-center justify-center rounded-full bg-slate-900 text-white hover:bg-rose-600 transition-all text-4xl leading-none shadow-xl active:scale-90"
                   aria-label="Close window"
                 >
                   &times;
                 </button>
              </div>
              <form onSubmit={(e) => {
                 e.preventDefault();
                 if (!isProcessing && (parseFloat(cashReceived) || 0) >= totals.finalTotal) {
                    completeTransaction();
                 }
              }} className="p-10 space-y-8">
                 <div className="bg-slate-50 p-6 rounded-[2rem] border border-slate-100 flex justify-between items-center">
                    <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Total Payable</span>
                    <span className="text-2xl font-black text-slate-900 font-mono">Rs. {totals.finalTotal.toLocaleString()}</span>
                 </div>
                 <div className="space-y-4">
                    <label className="block text-[11px] font-black text-slate-400 uppercase tracking-widest mb-3">Amount Given</label>
                    <input autoFocus type="number" className="w-full px-8 py-5 rounded-3xl border-2 border-slate-100 text-4xl font-black font-mono text-center text-indigo-600 outline-none focus:border-indigo-500 transition-all" placeholder="0.00" value={cashReceived} onChange={e => setCashReceived(e.target.value)} />
                 </div>
                 {parseFloat(cashReceived) > totals.finalTotal && (
                    <div className="p-6 rounded-3xl bg-indigo-50 border border-indigo-100 flex justify-between items-center animate-in fade-in slide-in-from-top-1">
                      <span className="text-[11px] font-black text-indigo-400 uppercase tracking-widest">Change to Return</span>
                      <span className="text-2xl font-black text-indigo-600 font-mono">Rs. {changeDue.toLocaleString()}</span>
                    </div>
                 )}
                 <div className="flex gap-4">
                    <button 
                      type="button" 
                      onClick={() => { setShowCashModal(false); setCashReceived(''); }}
                      className="flex-1 bg-slate-100 text-slate-900 font-black py-5 rounded-[1.5rem] uppercase tracking-widest text-[11px] hover:bg-slate-200 transition-all"
                    >
                      Cancel
                    </button>
                    <button 
                      type="submit" 
                      disabled={isProcessing || (parseFloat(cashReceived) || 0) < totals.finalTotal} 
                      className="flex-[2] bg-slate-900 text-white font-black py-5 rounded-[1.5rem] uppercase tracking-widest text-[11px] shadow-2xl hover:bg-black transition-all"
                    >
                      Finalize Sale
                    </button>
                 </div>
              </form>
           </div>
        </div>
      )}
      
      {showCustomerModal && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-xl cursor-pointer"
          onClick={(e) => { if(e.target === e.currentTarget) setShowCustomerModal(false); }}
        >
           <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in duration-300 cursor-default">
              <div className="p-8 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                 <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Charge Credit Account</h3>
                 <button 
                   onClick={() => setShowCustomerModal(false)} 
                   className="w-10 h-10 flex items-center justify-center rounded-full bg-slate-900 text-white hover:bg-rose-600 transition-all text-3xl shadow-lg"
                 >
                   &times;
                 </button>
              </div>
              <div className="p-8 space-y-6">
                 {!isAddingCustomer ? (
                   <>
                    <input 
                      type="text" 
                      className="w-full px-6 py-4 rounded-2xl border border-slate-200 outline-none focus:border-indigo-500 shadow-sm"
                      placeholder="Search Client..."
                      value={customerSearch}
                      onChange={e => setCustomerSearch(e.target.value)}
                    />
                    <div className="max-h-64 overflow-y-auto space-y-2 custom-scrollbar">
                       {filteredCustomers.map(c => (
                         <button key={c.id} onClick={() => completeTransaction(c.id)} className="w-full flex justify-between items-center p-4 bg-slate-50 rounded-xl hover:bg-indigo-50 transition-all border border-slate-100 shadow-sm">
                            <span className="font-black text-xs uppercase">{c.name}</span>
                            <span className="text-[11px] font-mono text-slate-400 tracking-tighter font-bold">{c.phone}</span>
                         </button>
                       ))}
                    </div>
                    <button onClick={() => setIsAddingCustomer(true)} className="w-full py-4 text-indigo-600 font-black uppercase text-[11px] tracking-widest border-2 border-dashed border-indigo-100 rounded-xl hover:bg-indigo-50 transition-all">+ New Client Account</button>
                   </>
                 ) : (
                   <div className="space-y-4">
                      <input value={newCusName} onChange={e => setNewCusName(e.target.value)} placeholder="CLIENT NAME" className="w-full px-5 py-3 rounded-xl border border-slate-200 font-bold uppercase" />
                      <input value={newCusPhone} onChange={e => setNewCusPhone(e.target.value)} placeholder="PHONE" className="w-full px-5 py-3 rounded-xl border border-slate-200 font-mono" />
                      <div className="flex gap-2">
                        <button onClick={() => setIsAddingCustomer(false)} className="flex-1 py-3 text-slate-400 font-black uppercase text-[11px]">Back</button>
                        <button onClick={handleRegisterNewCustomer} className="flex-[2] bg-indigo-600 text-white py-3 rounded-xl font-black uppercase text-[11px]">Complete & Charge</button>
                      </div>
                   </div>
                 )}
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default POS;

