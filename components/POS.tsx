
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
        <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center text-2xl mb-6">ðŸ”’</div>
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
          <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center text-3xl mx-auto">âœ“</div>
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
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">ðŸ”</span>
          </div>
          <select
            value={selectedCustomerId}
            onChange={(e) => setSelectedCustomerId(e.target.value)}
            className="px-4 py-4 rounded-2xl border border-slate-200 bg-white font-bold text-sm outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 min-w-[200px]"
          >
            <option value="walk-in">ðŸ‘¤ Walk-in Customer</option>
            {customers.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <button 
            onClick={() => setShowScanner(true)}
            className="px-6 bg-slate-100 rounded-2xl border border-slate-200 hover:bg-indigo-50 hover:text-indigo-600 transition-all font-black text-[10px] uppercase tracking-widest"
          >
            ðŸ“· Scan
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
            ðŸ“‚ Load Cart
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
