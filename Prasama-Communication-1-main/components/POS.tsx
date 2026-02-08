
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Product, Transaction, Customer, Category, UserProfile, DaySession, BankAccount, POSSession } from '../types';
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

  const today = getTodayLocal();

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
    if (!isDayOpen || product.stock <= 0) return;
    setPosSession((prev: POSSession) => {
      const existing = prev.cart.find((item: any) => item.product.id === product.id);
      if (existing) {
        return { ...prev, cart: prev.cart.map((item: any) => item.product.id === product.id ? { ...item, qty: Math.min(item.qty + 1, product.stock) } : item) };
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
        cart: prev.cart.map((item: any) => item.product.id === id ? { ...item, qty: Math.min(newQty, item.product.stock) } : item)
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
    const txPayload = {
      id: txId,
      type: 'SALE',
      amount: totals.finalTotal,
      discount: totals.lineSavings + totals.globalDiscountAmt,
      paymentMethod,
      accountId: (paymentMethod === 'BANK' || paymentMethod === 'CARD' || paymentMethod === 'CHEQUE') ? accountId : 'cash',
      customerId,
      description: `Sale: ${cart.length} SKUs`,
      date: getTodayLocal() + 'T' + new Date().toTimeString().split(' ')[0],
      chequeNumber: paymentMethod === 'CHEQUE' ? chequeNumber : undefined,
      chequeDate: paymentMethod === 'CHEQUE' ? chequeDate : undefined,
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
    const logoHtml = userProfile.logo
      ? `<div style="text-align: center; margin-bottom: 5px; width: 100%;">
           <img src="${userProfile.logo}" style="max-height: 55px; max-width: 100%; filter: grayscale(100%);" />
         </div>`
      : '';

    const itemsRowsHtml = tx.items?.map((item: any) => {
      const product = products.find(p => p.id === item.productId);
      const rowNet = (item.quantity * item.price) - (item.discount || 0);
      return `
        <tr>
          <td style="padding: 2px 0; font-size: 9px; font-weight: 800; width: 30%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${product?.name || 'Item'}</td>
          <td style="padding: 2px 0; font-size: 9px; font-weight: 800; width: 8%; text-align: center;">${item.quantity}</td>
          <td style="padding: 2px 0; font-size: 9px; font-weight: 800; width: 20%; text-align: right;">${Number(item.price).toLocaleString()}</td>
          <td style="padding: 2px 0; font-size: 9px; font-weight: 800; width: 20%; text-align: right;">-${(item.discount || 0).toLocaleString()}</td>
          <td style="padding: 2px 0; font-size: 9px; font-weight: 800; width: 22%; text-align: right;">${rowNet.toLocaleString()}</td>
        </tr>
      `;
    }).join('');

    const dateStr = new Date(tx.date).toLocaleDateString();
    const timeStr = new Date(tx.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const grossTotalValue = Number(tx.amount) + Number(tx.discount);

    printWindow.document.write(`
      <html>
        <head>
          <title>RECEIPT - ${tx.id}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700;800&display=swap');
            @page { margin: 0; }
            body { 
                font-family: 'JetBrains Mono', monospace; 
                padding: 0; 
                margin: 0; 
                color: #000; 
                width: 72mm; 
                background: #fff; 
                line-height: 1.1; 
                font-size: 9px;
            }
            .receipt-content { padding: 4px; box-sizing: border-box; width: 72mm; }
            .center { text-align: center; }
            .hr { border-top: 1px dashed #000; margin: 4px 0; }
            .biz-name { font-size: 13px; font-weight: 800; text-transform: uppercase; margin: 1px 0; }
            .biz-sub { font-size: 8px; font-weight: 700; text-transform: uppercase; }
            .meta { font-size: 8px; margin: 4px 0; font-weight: 700; }
            table { width: 100%; border-collapse: collapse; table-layout: fixed; }
            th { border-bottom: 0.5px solid #000; padding-bottom: 2px; }
            .summary-row { display: flex; justify-content: space-between; font-weight: 800; margin: 1px 0; font-size: 9px; }
            .total-row { display: flex; justify-content: space-between; font-size: 14px; font-weight: 800; border-top: 1px solid #000; padding-top: 2px; margin-top: 2px; }
            .footer { text-align: center; font-size: 8px; font-weight: 800; margin-top: 10px; border-top: 0.5px dashed #000; padding-top: 4px; }
          </style>
        </head>
        <body onload="window.print(); window.close();">
          <div class="receipt-content">
            <div class="center">
              ${logoHtml}
              <div class="biz-name">${userProfile.name}</div>
              <div class="biz-sub">${userProfile.branch}</div>
              ${userProfile.phone ? `<div class="biz-sub">PH: ${userProfile.phone}</div>` : ''}
            </div>
            <div class="hr"></div>
            <div class="meta">
              REF: ${tx.id}<br/>
              DATE: ${dateStr} | TIME: ${timeStr}
            </div>
            <div class="hr"></div>
            <table>
              <thead>
                <tr>
                  <th style="text-align: left; width: 30%;">ITEM</th>
                  <th style="text-align: center; width: 8%;">QTY</th>
                  <th style="text-align: right; width: 20%;">RATE</th>
                  <th style="text-align: right; width: 20%;">DISC</th>
                  <th style="text-align: right; width: 22%;">AMT</th>
                </tr>
              </thead>
              <tbody>
                ${itemsRowsHtml}
              </tbody>
            </table>
            <div class="hr"></div>
            <div class="summary-row">
              <span>SUBTOTAL:</span>
              <span>${grossTotalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>
            ${tx.discount > 0 ? `
            <div class="summary-row">
              <span>TOTAL DISC:</span>
              <span>-${tx.discount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>` : ''}
            <div class="total-row">
              <span>NET TOTAL:</span>
              <span>${tx.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
            <div class="hr"></div>
            <div style="font-size: 8px; text-align: right; font-weight: 800;">PAID BY: ${tx.paymentMethod}</div>
            <div class="footer">
                THANK YOU - VISIT AGAIN<br/>
                PRASAMA ERP SOLUTIONS
            </div>
          </div>
        </body>
      </html>
    `);
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
        <div className="flex gap-4 flex-1 max-w-2xl">
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
          <button 
            onClick={() => setShowScanner(true)}
            className="px-6 bg-slate-100 rounded-2xl border border-slate-200 hover:bg-indigo-50 hover:text-indigo-600 transition-all font-black text-[10px] uppercase tracking-widest"
          >
            📷 Scan
          </button>
        </div>
        <div className="bg-white p-4 rounded-3xl border border-slate-100 shadow-sm flex gap-8 items-center">
            <div className="text-right">
                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Realized Inflow (Cash+Bank)</p>
                <p className="text-base font-black font-mono text-emerald-600">Rs. {dailySummary.realizedInflow.toLocaleString()}</p>
            </div>
            <div className="w-px h-8 bg-slate-100"></div>
            <div className="text-right">
                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">New Unsettled Credit</p>
                <p className="text-base font-black font-mono text-rose-600">Rs. {dailySummary.dueAmount.toLocaleString()}</p>
            </div>
        </div>
      </div>

      <div className="flex-1 flex gap-8 min-h-0">
        <div className="flex-1 overflow-x-auto bg-white rounded-[2rem] border border-slate-200 shadow-sm">
          <table className="w-full text-left text-sm border-collapse table-fixed">
            <thead className="bg-slate-50/80 sticky top-0 backdrop-blur-md z-10">
              <tr>
                <th className="px-6 py-5 text-[11px] font-black text-slate-400 uppercase tracking-widest w-auto">Asset Details</th>
                <th className="px-2 py-5 text-[11px] font-black text-slate-400 uppercase tracking-widest text-right w-[100px]">Base Price</th>
                <th className="px-2 py-5 text-[11px] font-black text-slate-400 uppercase tracking-widest text-center w-[80px]">Stock</th>
                <th className="px-2 py-5 text-[11px] font-black text-slate-400 uppercase tracking-widest text-center w-[60px]">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredProducts.map(p => {
                const isLowStock = (p.stock || 0) <= (p.lowStockThreshold || 0);
                return (
                  <tr key={p.id} className="hover:bg-slate-50 transition-all group">
                    <td className="px-6 py-0.5 overflow-hidden">
                      <div className="flex items-center gap-2 overflow-hidden max-w-full">
                        <p className="font-black text-slate-900 text-[12px] uppercase truncate shrink leading-none">{p.name}</p>
                        <span className="text-slate-300 shrink-0">•</span>
                        <p className="text-[9px] font-mono font-black text-indigo-500 uppercase truncate opacity-70 shrink-0 leading-none">{p.sku}</p>
                      </div>
                    </td>
                    <td className="px-2 py-0.5 text-right whitespace-nowrap">
                      <span className="font-black text-slate-900 text-[11px] font-mono leading-none">Rs. {(Number(p.price) || 0).toLocaleString()}</span>
                    </td>
                    <td className="px-2 py-0.5 text-center">
                      <div className={`inline-flex flex-col items-center justify-center min-w-[50px] py-0 rounded-lg border ${
                        isLowStock 
                          ? 'bg-rose-50 border-rose-100 text-rose-600' 
                          : 'bg-emerald-50 border-emerald-100 text-emerald-600'
                      }`}>
                        <span className="text-[11px] font-black font-mono leading-tight">{p.stock}</span>
                        <span className="text-[6px] font-black uppercase tracking-tight leading-none">Units</span>
                      </div>
                    </td>
                    <td className="px-2 py-0.5 text-center">
                      <button 
                        onClick={(e) => { e.stopPropagation(); addToCart(p); }}
                        disabled={p.stock <= 0}
                        className="w-7 h-7 rounded-lg bg-slate-900 text-white flex items-center justify-center font-black text-lg hover:bg-black hover:scale-105 active:scale-95 transition-all shadow-lg shadow-slate-200 disabled:bg-slate-100 disabled:text-slate-300 disabled:shadow-none"
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

        <div className="w-[420px] flex flex-col bg-white rounded-[2rem] border border-slate-200 shadow-xl overflow-hidden shrink-0">
          <div className="px-6 py-3 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
            <h3 className="font-black text-slate-900 uppercase tracking-tight text-xs">Checkout Terminal</h3>
            <span className="bg-indigo-600 text-white px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-tighter">{cart.length} SKUs</span>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
            {cart.map(item => {
              const isDiscounting = activeLineDiscountId === item.product.id;
              const isEditing = activeLineEditId === item.product.id;
              const itemGross = item.price * item.qty;
              const itemDiscountAmt = item.discountType === 'PCT' ? (itemGross * item.discount) / 100 : item.discount;
              const itemNet = itemGross - itemDiscountAmt;
              
              return (
                <div key={item.product.id} className="rounded-lg bg-white border border-slate-100 hover:border-indigo-100 transition-all">
                  <div className="flex items-center justify-between p-1.5 gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-black text-slate-800 truncate uppercase leading-none">{item.product.name}</p>
                      <p className="text-[8px] font-mono font-bold text-slate-400 mt-0.5">
                        {item.price !== item.product.price ? `Rs. ${item.price.toLocaleString()}` : `Rs. ${item.product.price.toLocaleString()}`}
                      </p>
                    </div>

                    <div className="flex items-center gap-1 bg-slate-50 rounded-md p-0.5 border border-slate-100 shrink-0">
                      <button onClick={() => startAction(() => updateCartQty(item.product.id, item.qty - 1))} className="w-5 h-5 rounded bg-white flex items-center justify-center font-black text-slate-500 text-[10px]">-</button>
                      <span className="text-[10px] font-black w-4 text-center text-slate-700">{item.qty}</span>
                      <button onClick={() => startAction(() => updateCartQty(item.product.id, item.qty + 1))} className="w-5 h-5 rounded bg-white flex items-center justify-center font-black text-slate-500 text-[10px]">+</button>
                    </div>

                    <div className="w-20 text-right shrink-0">
                      <p className="text-[11px] font-black font-mono text-slate-900 leading-none">Rs. {itemNet.toLocaleString()}</p>
                    </div>

                    <div className="flex gap-0.5 shrink-0">
                      <button 
                        onClick={() => {
                          setActiveLineEditId(isEditing ? null : item.product.id);
                          setActiveLineDiscountId(null);
                        }}
                        className={`w-5 h-5 rounded flex items-center justify-center text-[10px] transition-all ${isEditing ? 'bg-indigo-600 text-white' : 'bg-slate-50 text-slate-300 hover:text-indigo-500'}`}
                      >
                        ✏️
                      </button>
                      <button 
                        onClick={() => {
                          setActiveLineDiscountId(isDiscounting ? null : item.product.id);
                          setActiveLineEditId(null);
                        }}
                        className={`w-5 h-5 rounded flex items-center justify-center text-[10px] transition-all ${item.discount > 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-50 text-slate-300 hover:text-emerald-500'}`}
                      >
                        🏷️
                      </button>
                    </div>
                  </div>

                  {isEditing && (
                    <div className="p-2 bg-slate-900 mx-1 mb-1 rounded-md border border-slate-800 space-y-2 animate-in slide-in-from-top-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-0.5">
                          <label className="text-[7px] font-black text-slate-500 uppercase tracking-widest">Price</label>
                          <input 
                            type="number" 
                            className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-[9px] font-black font-mono text-white outline-none focus:border-indigo-500"
                            value={item.price}
                            onChange={(e) => updateLinePrice(item.product.id, parseFloat(e.target.value) || 0)}
                          />
                        </div>
                        <div className="space-y-0.5">
                          <label className="text-[7px] font-black text-slate-500 uppercase tracking-widest">Qty</label>
                          <input 
                            type="number" 
                            className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-[9px] font-black font-mono text-white outline-none focus:border-indigo-500"
                            value={item.qty}
                            onChange={(e) => updateCartQty(item.product.id, parseInt(e.target.value) || 0)}
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {isDiscounting && (
                    <div className="p-1.5 bg-slate-50 mx-1 mb-1 rounded-md border border-slate-200 flex items-center gap-1.5 animate-in slide-in-from-top-2">
                      <div className="flex bg-white rounded border border-slate-200 overflow-hidden shadow-inner">
                        <button onClick={() => updateLineDiscount(item.product.id, item.discount, 'AMT')} className={`px-1.5 py-0.5 text-[7px] font-black uppercase ${item.discountType === 'AMT' ? 'bg-slate-900 text-white' : 'text-slate-400'}`}>Rs</button>
                        <button onClick={() => updateLineDiscount(item.product.id, item.discount, 'PCT')} className={`px-1.5 py-0.5 text-[7px] font-black uppercase ${item.discountType === 'PCT' ? 'bg-slate-900 text-white' : 'text-slate-400'}`}>%</button>
                      </div>
                      <input 
                        type="number" 
                        className="flex-1 bg-white border border-slate-200 rounded px-1.5 py-0.5 text-[9px] font-black font-mono text-indigo-600 outline-none" 
                        value={item.discount || ''}
                        placeholder="0"
                        onChange={(e) => updateLineDiscount(item.product.id, parseFloat(e.target.value) || 0, item.discountType)}
                        autoFocus
                      />
                      <button onClick={() => setActiveLineDiscountId(null)} className="text-[8px] font-black text-slate-400 hover:text-slate-900">OK</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="p-4 space-y-3 bg-slate-50 border-t border-slate-100">
            <div className="space-y-1 pb-2 border-b border-slate-200/50">
                <div className="flex justify-between items-center text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                    <span>Subtotal</span>
                    <span className="font-mono text-slate-700">Rs. {totals.subtotal.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest">
                    <div className="flex items-center gap-2">
                        <span className="text-slate-500">Invoice Disc.</span>
                        <button 
                            onClick={() => setShowGlobalDiscountEdit(!showGlobalDiscountEdit)}
                            className="w-5 h-5 rounded-md bg-white border border-slate-200 flex items-center justify-center text-[8px] hover:border-indigo-300 transition-all shadow-sm"
                        >
                            🏷️
                        </button>
                    </div>
                    <span className="font-mono text-rose-600">{totals.globalDiscountAmt > 0 ? '-' : ''} Rs. {totals.globalDiscountAmt.toLocaleString()}</span>
                </div>

                {showGlobalDiscountEdit && (
                  <div className="p-2 bg-indigo-900 rounded-xl border border-indigo-800 flex items-center gap-2 animate-in slide-in-from-top-2 my-2">
                    <div className="flex bg-slate-800 rounded-lg border border-slate-700 overflow-hidden shadow-inner">
                      <button onClick={() => updateGlobalDiscount(discountPercent > 0 ? 0 : discount, 'AMT')} className={`px-2 py-1 text-[8px] font-black uppercase transition-colors ${discountPercent === 0 ? 'bg-white text-indigo-900' : 'text-slate-400'}`}>Rs</button>
                      <button onClick={() => updateGlobalDiscount(discount > 0 ? 0 : discountPercent, 'PCT')} className={`px-2 py-1 text-[8px] font-black uppercase transition-colors ${discountPercent > 0 ? 'bg-white text-indigo-900' : 'text-slate-400'}`}>%</button>
                    </div>
                    <input 
                      type="number" 
                      className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-[10px] font-black font-mono text-white outline-none focus:border-indigo-400" 
                      value={discountPercent > 0 ? discountPercent : (discount || '')}
                      placeholder="0"
                      onChange={(e) => updateGlobalDiscount(parseFloat(e.target.value) || 0, discountPercent > 0 ? 'PCT' : 'AMT')}
                      autoFocus
                    />
                    <button onClick={() => setShowGlobalDiscountEdit(false)} className="text-[10px] font-black text-indigo-300 hover:text-white px-1">Done</button>
                  </div>
                )}
            </div>

            <div className="grid grid-cols-5 gap-1">
              {['CASH', 'BANK', 'CARD', 'CREDIT', 'CHEQUE'].map(m => (
                <button key={m} onClick={() => setPosSession((prev: POSSession) => ({...prev, paymentMethod: m as any}))} className={`py-1.5 rounded-lg text-[7px] font-black uppercase transition-all border ${paymentMethod === m ? 'bg-slate-900 border-slate-900 text-white shadow-md' : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'}`}>{m}</button>
              ))}
            </div>

            <div className="pt-2 flex justify-between items-end text-xl font-black text-slate-900 tracking-tighter">
                  <span className="text-[10px] uppercase tracking-[0.2em] mb-1">Net Pay</span>
                  <span className="font-mono">Rs. {totals.finalTotal.toLocaleString()}</span>
            </div>
            <button 
              onClick={() => {
                if (paymentMethod === 'CREDIT') setShowCustomerModal(true);
                else if (paymentMethod === 'CASH') setShowCashModal(true);
                else completeTransaction();
              }} 
              disabled={cart.length === 0 || isProcessing} 
              className="w-full bg-indigo-600 text-white py-3 rounded-2xl font-black uppercase text-[10px] shadow-xl shadow-indigo-600/20 active:scale-[0.98] disabled:bg-slate-200 transition-all tracking-[0.1em]"
            >
              Authorize Payment
            </button>
          </div>
        </div>
      </div>

      {showScanner && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md">
           <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-xl overflow-hidden animate-in zoom-in duration-300">
              <div className="p-8 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                 <div>
                    <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Camera Scanner</h3>
                    <p className="text-[9px] font-black text-indigo-500 uppercase tracking-widest mt-1">Ready for QR / Barcode identification</p>
                 </div>
                 <button onClick={() => setShowScanner(false)} className="text-slate-300 hover:text-slate-900 text-4xl leading-none">&times;</button>
              </div>
              <div className="p-8">
                 <div id="reader" className="w-full overflow-hidden rounded-3xl border-4 border-slate-900 shadow-inner bg-black min-h-[300px]"></div>
                 <button 
                  onClick={() => setShowScanner(false)}
                  className="w-full mt-8 bg-slate-900 text-white font-black py-4 rounded-2xl uppercase text-[10px] tracking-widest shadow-xl hover:bg-black transition-all"
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
                    <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest mt-1">Authorizing Local Flow</p>
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
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Payable</span>
                    <span className="text-2xl font-black text-slate-900 font-mono">Rs. {totals.finalTotal.toLocaleString()}</span>
                 </div>
                 <div className="space-y-4">
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Amount Given</label>
                    <input autoFocus type="number" className="w-full px-8 py-5 rounded-3xl border-2 border-slate-100 text-4xl font-black font-mono text-center text-indigo-600 outline-none" placeholder="0.00" value={cashReceived} onChange={e => setCashReceived(e.target.value)} />
                 </div>
                 {parseFloat(cashReceived) > totals.finalTotal && (
                    <div className="p-6 rounded-3xl bg-indigo-50 border border-indigo-100 flex justify-between items-center animate-in fade-in slide-in-from-top-1">
                      <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Change to Return</span>
                      <span className="text-2xl font-black text-indigo-600 font-mono">Rs. {changeDue.toLocaleString()}</span>
                    </div>
                 )}
                 <div className="flex gap-4">
                    <button 
                      type="button" 
                      onClick={() => { setShowCashModal(false); setCashReceived(''); }}
                      className="flex-1 bg-slate-100 text-slate-900 font-black py-5 rounded-[1.5rem] uppercase tracking-widest text-xs hover:bg-slate-200 transition-all"
                    >
                      Cancel
                    </button>
                    <button 
                      type="submit" 
                      disabled={isProcessing || (parseFloat(cashReceived) || 0) < totals.finalTotal} 
                      className="flex-[2] bg-slate-900 text-white font-black py-5 rounded-[1.5rem] uppercase tracking-widest text-xs shadow-2xl hover:bg-black transition-all"
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
                      className="w-full px-6 py-4 rounded-2xl border border-slate-200 outline-none"
                      placeholder="Search Client..."
                      value={customerSearch}
                      onChange={e => setCustomerSearch(e.target.value)}
                    />
                    <div className="max-h-64 overflow-y-auto space-y-2">
                       {filteredCustomers.map(c => (
                         <button key={c.id} onClick={() => completeTransaction(c.id)} className="w-full flex justify-between items-center p-4 bg-slate-50 rounded-xl hover:bg-indigo-50 transition-all border border-slate-100">
                            <span className="font-black text-xs uppercase">{c.name}</span>
                            <span className="text-[10px] font-mono text-slate-400 tracking-tighter">{c.phone}</span>
                         </button>
                       ))}
                    </div>
                    <button onClick={() => setIsAddingCustomer(true)} className="w-full py-4 text-indigo-600 font-black uppercase text-[10px] tracking-widest border-2 border-dashed border-indigo-100 rounded-xl hover:bg-indigo-50 transition-all">+ New Client Account</button>
                   </>
                 ) : (
                   <div className="space-y-4">
                      <input value={newCusName} onChange={e => setNewCusName(e.target.value)} placeholder="CLIENT NAME" className="w-full px-5 py-3 rounded-xl border border-slate-200 font-bold uppercase" />
                      <input value={newCusPhone} onChange={e => setNewCusPhone(e.target.value)} placeholder="PHONE" className="w-full px-5 py-3 rounded-xl border border-slate-200 font-mono" />
                      <div className="flex gap-2">
                        <button onClick={() => setIsAddingCustomer(false)} className="flex-1 py-3 text-slate-400 font-black uppercase text-[10px]">Back</button>
                        <button onClick={handleRegisterNewCustomer} className="flex-[2] bg-indigo-600 text-white py-3 rounded-xl font-black uppercase text-[10px]">Complete & Charge</button>
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
