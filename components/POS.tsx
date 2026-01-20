
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Product, Transaction, Customer, Category, UserProfile, DaySession, BankAccount, POSSession } from '../types';
import Fuse from 'fuse.js';
import { Html5QrcodeScanner } from 'html5-qrcode';

interface POSProps {
  products: Product[];
  customers: Customer[];
  categories: Category[];
  accounts: BankAccount[];
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
  const [showGlobalDiscountModal, setShowGlobalDiscountModal] = useState(false);
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

  const fuse = useMemo(() => new Fuse(products, { keys: ['sku', 'name'], threshold: 0.2 }), [products]);
  const filteredProducts = useMemo(() => !search.trim() ? products : fuse.search(search).map(r => r.item), [search, fuse, products]);
  const filteredCustomers = useMemo(() => customers.filter(c => c && c.name && (c.name.toLowerCase().includes(customerSearch.toLowerCase()) || (c.phone && c.phone.includes(customerSearch)))), [customers, customerSearch]);

  const getTodayLocal = () => {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };

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

    const netBeforeGlobal = gross - lineSavings;
    let globalDiscountAmt = 0;
    if (discountPercent > 0) {
      globalDiscountAmt = (netBeforeGlobal * discountPercent) / 100;
    } else {
      globalDiscountAmt = discount;
    }

    const finalTotal = Math.max(0, netBeforeGlobal - globalDiscountAmt);
    return { gross, lineSavings, netBeforeGlobal, globalDiscountAmt, finalTotal };
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
      type: 'POS_SALE',
      amount: totals.finalTotal,
      discount: totals.lineSavings + totals.globalDiscountAmt,
      paymentMethod,
      accountId: (paymentMethod === 'BANK' || paymentMethod === 'CARD' || paymentMethod === 'CHEQUE') ? accountId : 'cash',
      customerId,
      description: `Sale: ${cart.length} SKUs`,
      date: new Date().toISOString(),
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
    setShowGlobalDiscountModal(false);
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
      ? `<div style="text-align: center; margin-bottom: 12px; width: 100%;">
           <img src="${userProfile.logo}" style="max-height: 90px; max-width: 220px; filter: grayscale(100%);" />
         </div>`
      : '';

    const itemsHtml = tx.items?.map((item: any) => {
      const product = products.find(p => p.id === item.productId);
      const rowGross = item.quantity * item.price;
      return `
        <div style="margin-bottom: 8px; border-bottom: 1px dashed #444; padding-bottom: 6px;">
          <div style="font-weight: 800; font-size: 13px; color: #000; text-transform: uppercase;">${product?.name || 'Unknown Item'}</div>
          <div style="display: flex; justify-content: space-between; font-size: 12px; font-weight: 700; margin-top: 2px;">
            <span>${item.quantity} x ${Number(item.price).toLocaleString()}</span>
            <span>${rowGross.toLocaleString()}</span>
          </div>
          ${item.discount > 0 ? `<div style="text-align: right; font-size: 10px; color: #444;">DISC: -${item.discount.toLocaleString()}</div>` : ''}
        </div>
      `;
    }).join('');

    const dateStr = new Date(tx.date).toLocaleDateString();
    const timeStr = new Date(tx.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    printWindow.document.write(`
      <html>
        <head>
          <title>RECEIPT - ${tx.id}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700;800&display=swap');
            body { font-family: 'JetBrains Mono', monospace; padding: 10px; color: #000; max-width: 280px; margin: 0 auto; background: #fff; line-height: 1.2; }
            .center { text-align: center; }
            .header-info { margin-bottom: 15px; border-bottom: 2px solid #000; padding-bottom: 10px; }
            .biz-name { font-size: 18px; font-weight: 800; text-transform: uppercase; margin: 4px 0; }
            .biz-branch { font-size: 10px; font-weight: 700; text-transform: uppercase; color: #333; }
            .meta { font-size: 10px; font-weight: 700; margin: 10px 0; border-bottom: 1px solid #000; padding-bottom: 10px; }
            .total-section { margin-top: 15px; border-top: 3px double #000; padding-top: 10px; }
            .total-row { display: flex; justify-content: space-between; font-size: 18px; font-weight: 800; }
            .footer { text-align: center; font-size: 10px; margin-top: 25px; font-weight: 800; border-top: 1px dashed #000; padding-top: 10px; }
          </style>
        </head>
        <body onload="window.print(); window.close();">
          <div class="center">
            ${logoHtml}
            <div class="header-info">
               <div class="biz-name">${userProfile.name}</div>
               <div class="biz-branch">${userProfile.branch}</div>
            </div>
          </div>
          <div class="meta">
            REF: ${tx.id}<br/>
            DATE: ${dateStr} | TIME: ${timeStr}
          </div>
          <div style="margin-top: 10px;">${itemsHtml}</div>
          <div class="total-section">
             ${tx.discount > 0 ? `
             <div style="display: flex; justify-content: space-between; font-size: 12px; font-weight: 700;">
                <span>SAVINGS:</span>
                <span>-${tx.discount.toLocaleString()}</span>
             </div>` : ''}
             <div class="total-row">
                <span>NET TOTAL:</span>
                <span>${tx.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
             </div>
             <div style="font-size: 10px; text-align: right; margin-top: 4px; font-weight: 700;">PAID BY: ${tx.paymentMethod}</div>
          </div>
          <div class="footer">THANK YOU FOR YOUR BUSINESS<br/>PRASAMA ERP SOLUTIONS</div>
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
        <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-md p-12 text-center space-y-8 animate-in zoom-in duration-300">
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
    <div className="h-[calc(100vh-10rem)] flex gap-8">
      <div className="flex-1 flex flex-col gap-6">
        <div className="flex gap-4">
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
        
        <div className="flex-1 overflow-y-auto bg-white rounded-3xl border border-slate-200 shadow-sm">
          <table className="w-full text-left text-sm border-collapse">
            <thead className="bg-slate-50/50 sticky top-0 backdrop-blur-md z-10">
              <tr>
                <th className="px-8 py-5 text-[11px] font-bold text-slate-400 uppercase tracking-widest">Asset Details</th>
                <th className="px-8 py-5 text-[11px] font-bold text-slate-400 uppercase tracking-widest text-right">Base Price</th>
                <th className="px-8 py-5 text-[11px] font-bold text-slate-400 uppercase tracking-widest text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredProducts.map(p => (
                <tr key={p.id} onClick={() => addToCart(p)} className="cursor-pointer hover:bg-indigo-50/30 transition-all group">
                  <td className="px-8 py-5">
                    <p className="font-bold text-slate-800 text-[13px] uppercase">{p.name}</p>
                    <p className="text-[10px] font-mono font-bold text-indigo-500 mt-0.5">{p.sku}</p>
                  </td>
                  <td className="px-8 py-5 text-right font-bold text-slate-900">Rs. {(Number(p.price) || 0).toLocaleString()}</td>
                  <td className="px-8 py-5 text-center">
                    <button className="w-8 h-8 rounded-lg bg-slate-900 text-white font-bold hover:bg-black transition-colors">+</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="w-[380px] flex flex-col bg-white rounded-[2rem] border border-slate-200 shadow-xl overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <h3 className="font-black text-slate-900 uppercase tracking-tight text-xs">Checkout Terminal</h3>
          <span className="bg-indigo-600 text-white px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-tighter">{cart.length} SKUs</span>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {cart.map(item => {
            const isDiscounting = activeLineDiscountId === item.product.id;
            const isEditing = activeLineEditId === item.product.id;
            const itemGross = item.price * item.qty;
            const itemDiscountAmt = item.discountType === 'PCT' ? (itemGross * item.discount) / 100 : item.discount;
            const itemNet = itemGross - itemDiscountAmt;
            
            return (
              <div key={item.product.id} className="p-4 rounded-2xl bg-white border border-slate-100 shadow-sm hover:border-indigo-100 transition-all space-y-3">
                <div className="flex justify-between items-start">
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-black text-slate-800 truncate uppercase leading-tight">{item.product.name}</p>
                    <p className="text-[10px] font-mono font-bold text-slate-400 mt-0.5">
                      {item.price !== item.product.price ? (
                         <span className="text-amber-600">Manual Price: Rs. {item.price.toLocaleString()}</span>
                      ) : (
                        item.discount > 0 ? (
                          <>
                            <span className="line-through">Rs. {item.price.toLocaleString()}</span>
                            <span className="text-emerald-500 ml-2 font-black">Rs. {(itemNet / item.qty).toLocaleString()}</span>
                          </>
                        ) : `Rs. ${item.price.toLocaleString()}`
                      )}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <button 
                      onClick={() => {
                        setActiveLineEditId(isEditing ? null : item.product.id);
                        setActiveLineDiscountId(null);
                      }}
                      className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${isEditing ? 'bg-indigo-600 text-white' : 'bg-slate-50 text-slate-400 border border-slate-100 hover:border-indigo-200'}`}
                    >
                      ✏️
                    </button>
                    <button 
                      onClick={() => {
                        setActiveLineDiscountId(isDiscounting ? null : item.product.id);
                        setActiveLineEditId(null);
                      }}
                      className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${item.discount > 0 ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-slate-50 text-slate-400 border border-slate-100'}`}
                      title="Item Discount"
                    >
                      🏷️
                    </button>
                  </div>
                </div>

                {isEditing && (
                  <div className="p-4 bg-slate-900 rounded-2xl border border-slate-800 space-y-3 animate-in slide-in-from-top-2">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Unit Price</label>
                        <input 
                          type="number" 
                          className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs font-black font-mono text-white outline-none focus:border-indigo-500"
                          value={item.price}
                          onChange={(e) => updateLinePrice(item.product.id, parseFloat(e.target.value) || 0)}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Quantity</label>
                        <input 
                          type="number" 
                          className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs font-black font-mono text-white outline-none focus:border-indigo-500"
                          value={item.qty}
                          onChange={(e) => updateCartQty(item.product.id, parseInt(e.target.value) || 0)}
                        />
                      </div>
                    </div>
                    <button onClick={() => setActiveLineEditId(null)} className="w-full bg-indigo-600 text-white text-[9px] font-black py-2 rounded-xl uppercase tracking-widest">Confirm Edit</button>
                  </div>
                )}

                {isDiscounting && (
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center gap-2 animate-in slide-in-from-top-2">
                    <div className="flex bg-white rounded-lg border border-slate-200 overflow-hidden shadow-inner">
                      <button onClick={() => updateLineDiscount(item.product.id, item.discount, 'AMT')} className={`px-2 py-1 text-[8px] font-black uppercase ${item.discountType === 'AMT' ? 'bg-slate-900 text-white' : 'text-slate-400'}`}>Rs</button>
                      <button onClick={() => updateLineDiscount(item.product.id, item.discount, 'PCT')} className={`px-2 py-1 text-[8px] font-black uppercase ${item.discountType === 'PCT' ? 'bg-slate-900 text-white' : 'text-slate-400'}`}>%</button>
                    </div>
                    <input 
                      type="number" 
                      className="flex-1 bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-black font-mono text-indigo-600 outline-none" 
                      value={item.discount || ''}
                      placeholder="0"
                      onChange={(e) => updateLineDiscount(item.product.id, parseFloat(e.target.value) || 0, item.discountType)}
                      autoFocus
                    />
                    <button onClick={() => setActiveLineDiscountId(null)} className="text-[10px] font-black text-slate-400 hover:text-slate-900 px-1">OK</button>
                  </div>
                )}

                <div className="flex justify-between items-center pt-2 border-t border-slate-50">
                  <div className="flex items-center gap-1 bg-slate-50 rounded-lg p-0.5 border border-slate-100">
                    <button onClick={() => startAction(() => updateCartQty(item.product.id, item.qty - 1))} className="w-7 h-7 rounded-md bg-white flex items-center justify-center font-black text-slate-500 text-xs">-</button>
                    <span className="text-[11px] font-black w-6 text-center text-slate-700">{item.qty}</span>
                    <button onClick={() => startAction(() => updateCartQty(item.product.id, item.qty + 1))} className="w-7 h-7 rounded-md bg-white flex items-center justify-center font-black text-slate-500 text-xs">+</button>
                  </div>
                  <span className="text-[13px] font-black font-mono text-slate-900">Rs. {itemNet.toLocaleString()}</span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="p-6 space-y-4 bg-slate-50 border-t border-slate-100">
          <div className="grid grid-cols-5 gap-1.5">
            {['CASH', 'BANK', 'CARD', 'CREDIT', 'CHEQUE'].map(m => (
              <button key={m} onClick={() => setPosSession((prev: POSSession) => ({...prev, paymentMethod: m as any}))} className={`py-2 rounded-lg text-[8px] font-black uppercase transition-all border ${paymentMethod === m ? 'bg-slate-900 border-slate-900 text-white shadow-md' : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'}`}>{m}</button>
            ))}
          </div>

          <div className="pt-3 border-t border-slate-200 flex justify-between items-end text-2xl font-black text-slate-900 tracking-tighter">
                <span className="text-xs uppercase tracking-[0.2em] mb-1.5">Net Pay</span>
                <span className="font-mono">Rs. {totals.finalTotal.toLocaleString()}</span>
          </div>
          <button 
            onClick={() => {
              if (paymentMethod === 'CREDIT') setShowCustomerModal(true);
              else if (paymentMethod === 'CASH') setShowCashModal(true);
              else completeTransaction();
            }} 
            disabled={cart.length === 0 || isProcessing} 
            className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-black uppercase text-[11px] shadow-xl shadow-indigo-600/20 active:scale-[0.98] disabled:bg-slate-200 transition-all tracking-[0.1em]"
          >
            Authorize Payment
          </button>
        </div>
      </div>

      {showCashModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-xl">
           <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in duration-300">
              <div className="p-10 border-b border-slate-50 bg-slate-50 flex justify-between items-center">
                 <div>
                    <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Cash Tender</h3>
                 </div>
                 <button onClick={() => { setShowCashModal(false); setCashReceived(''); }} className="text-slate-300 hover:text-slate-900 text-4xl leading-none">&times;</button>
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
                 <button type="submit" disabled={isProcessing || (parseFloat(cashReceived) || 0) < totals.finalTotal} className="w-full bg-slate-900 text-white font-black py-5 rounded-[1.5rem] uppercase tracking-widest text-xs shadow-2xl hover:bg-black transition-all">Finalize Sale</button>
              </form>
           </div>
        </div>
      )}
      
      {showCustomerModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-xl">
           <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in duration-300">
              <div className="p-8 border-b border-slate-50 bg-slate-50 flex justify-between items-center">
                 <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Charge Credit Account</h3>
                 <button onClick={() => setShowCustomerModal(false)} className="text-slate-300 hover:text-slate-900 text-4xl leading-none">&times;</button>
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
