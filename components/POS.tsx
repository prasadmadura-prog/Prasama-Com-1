
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Product, Transaction, Customer, Category, UserProfile, DaySession, BankAccount, POSSession } from '../types';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList } from 'recharts';
import { formatDate } from '../utils/dateFormatter';

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
  onSaveDraftSale?: (tx: any) => Promise<string | void>;
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
  onGoToFinance,
  onSaveDraftSale
}) => {
  const { cart = [], discount = 0, discountPercent = 0, globalDiscountType = 'AMT', paymentMethod = 'CASH', accountId = 'cash', search = '', categoryId = 'All', chequeNumber = '', chequeDate = '', isAdvance = false, advanceAmount = 0 } = posSession;

  const [currentDraftId, setCurrentDraftId] = useState<string | null>(null);
  const [lastTx, setLastTx] = useState<any>(null);
  const [activeTerminal, setActiveTerminal] = useState(userProfile.branch || 'CASHIER 1'); // State for active terminal

  useEffect(() => {
    if (userProfile.branch) setActiveTerminal(userProfile.branch);
  }, [userProfile.branch]);

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
    return products.filter(p => {
      const matchesSearch = !search.trim() ||
        (p.name || "").toLowerCase().includes(search.toLowerCase()) ||
        (p.sku || "").toLowerCase().includes(search.toLowerCase());

      const matchesCat = !categoryId || categoryId === 'All' || p.categoryId === categoryId;

      return matchesSearch && matchesCat;
    }).sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }, [search, categoryId, products]);

  const filteredCustomers = useMemo(() => customers.filter(c => c && c.name && (c.name.toLowerCase().includes(customerSearch.toLowerCase()) || (c.phone && c.phone.includes(customerSearch)))), [customers, customerSearch]);

  const getTodayLocal = () => {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };

  const today = getTodayLocal();

  const dailySummary = useMemo(() => {
    const todayEntries = (transactions || []).filter(t => t.date.split('T')[0] === today && t.status !== 'DRAFT' && t.status !== 'VOID');

    // Calculate reload sales separately
    const reloadSales = todayEntries
      .filter(t => t.type === 'SALE' || t.type === 'SALE_HISTORY_IMPORT')
      .reduce((acc, t) => {
        if (!t.items) return acc;
        const reloadAmount = t.items.reduce((itemAcc, item) => {
          const product = products.find(p => p.id === item.productId);
          const category = categories.find(c => c.id === product?.categoryId);
          if (category?.name?.toLowerCase() === 'reload') {
            return itemAcc + (Number(item.quantity) * Number(item.price)) - (Number(item.discount) || 0);
          }
          return itemAcc;
        }, 0);
        return acc + reloadAmount;
      }, 0);

    // Revenue EXCLUDING reload category
    const revenue = todayEntries
      .filter(t => t.type === 'SALE' || t.type === 'SALE_HISTORY_IMPORT')
      .reduce((acc, t) => {
        if (!t.items) return acc + Number(t.amount || 0);
        const nonReloadAmount = t.items.reduce((itemAcc, item) => {
          const product = products.find(p => p.id === item.productId);
          const category = categories.find(c => c.id === product?.categoryId);
          if (category?.name?.toLowerCase() !== 'reload') {
            return itemAcc + (Number(item.quantity) * Number(item.price)) - (Number(item.discount) || 0);
          }
          return itemAcc;
        }, 0);
        return acc + nonReloadAmount;
      }, 0);

    // Cost of goods sold (COGS) for non-reload items only
    const cogs = todayEntries
      .filter(t => t.type === 'SALE' || t.type === 'SALE_HISTORY_IMPORT')
      .reduce((acc, t) => {
        if (!t.items) return acc;
        const cost = t.items.reduce((itemAcc, item) => {
          const product = products.find(p => p.id === item.productId);
          const category = categories.find(c => c.id === product?.categoryId);
          if (category?.name?.toLowerCase() !== 'reload') {
            return itemAcc + (Number(product?.cost || 0) * Number(item.quantity));
          }
          return itemAcc;
        }, 0);
        return acc + cost;
      }, 0);

    // Profit = (Revenue - COGS) + 4% of reload sales
    const reloadProfit = reloadSales * 0.04;
    const profit = (revenue - cogs) + reloadProfit;

    // Realized Inflow (Cash+Bank) = Revenue (excluding reload) + 4% of reload
    const realizedInflow = todayEntries
      .filter(s => (s.type === 'SALE' && s.paymentMethod !== 'CREDIT') || s.type === 'CREDIT_PAYMENT')
      .reduce((acc, t) => {
        if (t.type === 'CREDIT_PAYMENT') {
          return acc + Number(t.amount || 0);
        }
        // For sales, calculate excluding reload + 4% of reload
        if (!t.items) return acc + Number(t.amount || 0);

        let nonReloadAmount = 0;
        let reloadAmount = 0;

        t.items.forEach(item => {
          const product = products.find(p => p.id === item.productId);
          const category = categories.find(c => c.id === product?.categoryId);
          const itemTotal = (Number(item.quantity) * Number(item.price)) - (Number(item.discount) || 0);

          if (category?.name?.toLowerCase() === 'reload') {
            reloadAmount += itemTotal;
          } else {
            nonReloadAmount += itemTotal;
          }
        });

        return acc + nonReloadAmount + (reloadAmount * 0.04);
      }, 0);

    const dueAmount = todayEntries
      .filter(s => s.type === 'SALE' && s.paymentMethod === 'CREDIT')
      .reduce((a, b) => a + Number(b.amount || 0), 0);

    // Branch Performance for chart
    const branchBreakdown: Record<string, number> = {};
    todayEntries.filter(s => s.type === 'SALE' || s.type === 'SALE_HISTORY_IMPORT').forEach(s => {
      const b = (s.branchId || 'CASHIER 1').toUpperCase().trim();
      const normalizeB = (b === 'LOCAL NODE' || b === 'BOOKSHOP' || b === 'SHOP 2' || b === 'MAIN BRANCH' || b === 'NO 16,KIRULAPANA SUPERMARKET ,COLOMBO 05') ? 'CASHIER 1' : b;
      branchBreakdown[normalizeB] = (branchBreakdown[normalizeB] || 0) + Number(s.amount || 0);
    });

    return { realizedInflow, dueAmount, profit, reloadSales, branchBreakdown };
  }, [transactions, today, products, categories]);

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
    const globalDiscountAmt = globalDiscountType === 'PCT'
      ? (subtotal * discountPercent) / 100
      : discount;
    const finalTotal = Math.max(0, subtotal - globalDiscountAmt);
    const remainingDue = isAdvance ? Math.max(0, finalTotal - advanceAmount) : 0;
    return { gross, lineSavings, subtotal, globalDiscountAmt, finalTotal, remainingDue };
  }, [cart, discount, discountPercent, globalDiscountType, isAdvance, advanceAmount]);

  const changeDue = Math.max(0, (parseFloat(cashReceived) || 0) - (isAdvance ? advanceAmount : totals.finalTotal));
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
      // Generate transaction ID ONLY when cart is empty (new transaction starting)
      if (prev.cart.length === 0 && !currentDraftId) {
        const newTxId = `TX-${Date.now()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;
        setCurrentDraftId(newTxId);
      }

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
      discountPercent: type === 'PCT' ? value : 0,
      globalDiscountType: type
    }));
  };

  const handleQuickReload = (provider: string) => {
    const amountStr = prompt(`ENTER RELOAD AMOUNT FOR ${provider}:`);
    if (!amountStr) return;
    const amount = parseFloat(amountStr);
    if (isNaN(amount) || amount <= 0) return alert("Invalid Amount");

    // 4% Profit Margin Logic: Cost is 96% of the Sales Price
    const costPrice = amount * 0.96;

    // Search for existing Inventory Product
    const targetName = `RELOAD ${provider}`;
    const existingProduct = products.find(p => p.name === targetName);

    const reloadProduct: Product = existingProduct ? {
      ...existingProduct,
      price: amount,
      cost: costPrice, // Override cost logic for this transaction to ensure margin
      // We perform a trick here: we use the existing product ID so stock attempts to deduct.
      // However, if we change price from 1 to 100, we need to ensure the quantity logic aligns.
      // If "Stock" is currency value, then we should sell 'amount' quantity at Price 1.
      // But typically for receipt clarity, we want "1 x RELOAD (Rs 100)".
      // Let's stick to: Qty 1, Price = Amount. This decrements 1 unit of stock.
      // If the user wants to decrement value, they must ensure their stock count = # of transactions, OR they must configure the product as Price=1.
      // Given the ambiguity, we'll proceed with "Sale Item" logic (Qty 1) but use the real ID.
    } : {
      id: `RELOAD-${provider}-${Date.now()}`,
      name: targetName,
      sku: `RELOAD_${provider}`,
      price: amount,
      cost: costPrice,
      stock: 999999,
      categoryId: `RELOAD ${provider}`,

      lowStockThreshold: 0,
      branchStocks: {},
      vendorId: 'RELOAD-VENDOR'
    };

    addToCart(reloadProduct);
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

  // AUTO-SAVE DRAFT EFFECT - Uses consistent transaction ID throughout
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (cart.length > 0 && onSaveDraftSale && currentDraftId) {
        // Calculate Totals for Draft
        const subtotal = cart.reduce((acc, i) => acc + (i.price * i.qty), 0);
        const lineSavings = cart.reduce((acc, i) => acc + (i.discountType === 'PCT' ? (i.price * i.qty * i.discount / 100) : i.discount), 0);
        const globalDiscountAmt = globalDiscountType === 'PCT' ? ((subtotal - lineSavings) * discountPercent / 100) : discount;
        const finalTotal = subtotal - lineSavings - globalDiscountAmt;

        const draftPayload = {
          id: currentDraftId, // Always use the existing transaction ID
          type: 'SALE',
          branchId: activeTerminal,
          amount: finalTotal,
          discount: lineSavings + globalDiscountAmt,
          paymentMethod,
          accountId: (paymentMethod === 'BANK' || paymentMethod === 'CARD' || paymentMethod === 'CHEQUE') ? accountId : 'cash',
          customerId: posSession.customerId,
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

        await onSaveDraftSale(draftPayload);
        // No need to update currentDraftId since we're using the same one
      }
    }, 1500); // 1.5s debounce

    return () => clearTimeout(timer);
  }, [cart, discount, discountPercent, paymentMethod, accountId, posSession.customerId, currentDraftId, activeTerminal, onSaveDraftSale, globalDiscountType]);

  const completeTransaction = (customerId?: string) => {
    setIsProcessing(true);
    // MUST use the existing Draft ID to promote DRAFT → COMPLETED status
    const txId = currentDraftId || `TX-${Date.now()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;

    const effectivePaidAmount = isAdvance ? advanceAmount : (paymentMethod === 'CREDIT' ? 0 : totals.finalTotal);
    const effectiveBalanceDue = isAdvance ? (totals.finalTotal - (advanceAmount || 0)) : (paymentMethod === 'CREDIT' ? totals.finalTotal : 0);

    const txCostBasis = cart.reduce((acc, item) => acc + (item.product.cost || 0) * item.qty, 0);
    const txPayload = {
      id: txId,
      type: 'SALE',
      branchId: activeTerminal, // Enforce selected terminal
      amount: totals.finalTotal,
      paidAmount: effectivePaidAmount,
      balanceDue: effectiveBalanceDue,
      discount: totals.lineSavings + totals.globalDiscountAmt,
      paymentMethod,
      accountId: (paymentMethod === 'BANK' || paymentMethod === 'CARD' || paymentMethod === 'CHEQUE') ? accountId : 'cash',
      customerId,
      description: isAdvance ? `Advance Sale: Rs. ${effectivePaidAmount} Paid` : `Sale: ${cart.length} SKUs`,
      date: getTodayLocal() + 'T' + new Date().toTimeString().split(' ')[0],
      chequeNumber: paymentMethod === 'CHEQUE' ? chequeNumber : undefined,
      chequeDate: paymentMethod === 'CHEQUE' ? chequeDate : undefined,
      costBasis: txCostBasis,
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
      globalDiscountType: 'AMT',
      paymentMethod: 'CASH',
      accountId: 'cash',
      search: '',
      categoryId: 'All',
      chequeNumber: '',
      chequeDate: getTodayLocal(),
      isAdvance: false,
      advanceAmount: 0
    });
    setCurrentDraftId(null); // Clear draft ID
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

    const dateStr = formatDate(tx.date);
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
            .total-row { display: flex; justify-content: space-between; font-size: 20px; font-weight: 800; border-top: 1px solid #000; padding-top: 4px; margin-top: 4px; }
            .footer { text-align: center; font-size: 8px; font-weight: 800; margin-top: 10px; border-top: 0.5px dashed #000; padding-top: 4px; }
          </style>
        </head>
        <body onload="window.print(); window.close();">
          <div class="receipt-content">
            <div class="center">
              ${logoHtml}
              <div class="biz-name">${userProfile.companyName || userProfile.name}</div>
              ${userProfile.companyAddress ? `<div class="biz-sub" style="margin-bottom: 2px; font-weight: 500;">${userProfile.companyAddress}</div>` : ''}
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
            ${(tx.balanceDue || 0) > 0 ? `
            <div class="summary-row" style="margin-top: 5px;">
              <span>AMOUNT PAID:</span>
              <span>${Number(tx.paidAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>
            <div class="summary-row" style="color: #000; border-bottom: 0.5px solid #000; padding-bottom: 2px;">
              <span>BALANCE DUE:</span>
              <span>${Number(tx.balanceDue).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>` : ''}
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
    <div className="h-[calc(100vh-6rem)] flex flex-col gap-3">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
        <div className="flex gap-2 flex-1 max-w-3xl">
          <div className="relative flex-[2]">
            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1 ml-2">Product Lookup & Search</p>
            <input
              type="text"
              placeholder="Scan barcode or search name/SKU..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none font-semibold text-xs bg-white"
              value={search}
              onChange={(e) => setPosSession((prev: POSSession) => ({ ...prev, search: e.target.value }))}
            />
            <span className="absolute left-3.5 top-8 text-slate-400 text-xs">🔍</span>
          </div>
          <div className="flex-1">
            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1 ml-2">Asset Type</p>
            <select
              className="w-full px-4 py-2.5 rounded-xl border border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 outline-none bg-white text-[10px] font-black uppercase shadow-sm cursor-pointer"
              value={categoryId}
              onChange={(e) => setPosSession((prev: POSSession) => ({ ...prev, categoryId: e.target.value }))}
            >
              <option value="All">All Categories</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="w-28">
            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1 ml-2">Terminal</p>
            <select
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-4 focus:ring-indigo-500/10 outline-none bg-white text-[10px] font-black uppercase shadow-sm cursor-pointer text-indigo-900"
              value={activeTerminal}
              onChange={(e) => setActiveTerminal(e.target.value)}
            >
              {userProfile.allBranches?.map(b => (
                <option key={b} value={b}>{b}</option>
              )) || (
                  <>
                    <option value="CASHIER 1">CASHIER 1</option>
                    <option value="CASHIER 2">CASHIER 2</option>
                  </>
                )}
            </select>
          </div>
          <div className="flex items-end mb-0.5">
            <button
              onClick={() => setShowScanner(true)}
              className="px-4 py-2.5 bg-slate-100 rounded-xl border border-slate-200 hover:bg-indigo-50 hover:text-indigo-600 transition-all font-black text-[9px] uppercase tracking-widest"
            >
              📷 Scan
            </button>
          </div>
        </div>
        <div className="bg-white p-2.5 rounded-2xl border border-slate-100 shadow-sm flex gap-5 items-center">
          <div className="text-right">
            <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Inflow</p>
            <p className="text-sm font-black font-mono text-emerald-600 leading-none">Rs. {Math.round(dailySummary.realizedInflow).toLocaleString()}</p>
          </div>
          <div className="w-px h-6 bg-slate-100"></div>
          <div className="text-right">
            <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Profit Today</p>
            <p className="text-sm font-black font-mono text-indigo-600 leading-none">Rs. {Math.round(dailySummary.profit).toLocaleString()}</p>
          </div>
          <div className="w-px h-6 bg-slate-100"></div>
          <div className="text-right">
            <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Reload Sales</p>
            <p className="text-sm font-black font-mono text-rose-600 leading-none">Rs. {Math.round(dailySummary.reloadSales || 0).toLocaleString()}</p>
          </div>
        </div>
      </div>

      <div className="flex-1 flex gap-4 min-h-0">
        {/* LEFT COLUMN: RELOAD CARDS + PRODUCT GRID */}
        <div className="flex-1 flex flex-col gap-3 min-h-0">
          {/* QUICK RELOAD ACTION BAR */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 animate-in slide-in-from-top-4 shrink-0">
            {[
              { id: 'DIALOG', color: 'bg-[#b90000] text-white border-[#b90000]', hover: 'hover:bg-[#8a0000]' },
              { id: 'MOBITEL', color: 'bg-[#0056b3] text-white border-[#0056b3]', hover: 'hover:bg-[#004494]' },
              { id: 'AIRTEL', color: 'bg-[#e53935] text-white border-[#e53935]', hover: 'hover:bg-[#c62828]' },
              { id: 'HUTCH', color: 'bg-[#ff9800] text-white border-[#ff9800]', hover: 'hover:bg-[#f57c00]' }
            ].map(p => {
              // Attempt to find a "Master Stock" product for this provider to show balance
              // Matching exactly what handleQuickReload looks for: "RELOAD [PROVIDER]"
              const targetName = `RELOAD ${p.id}`;
              const masterStock = products.find(prod => prod.name === targetName);
              const balance = masterStock ? masterStock.stock : 0;

              return (
                <button
                  key={p.id}
                  onClick={() => handleQuickReload(p.id)}
                  className={`${p.color} ${p.hover} border p-2 rounded-lg shadow-sm transition-all group text-left relative overflow-hidden`}
                >
                  <div className="absolute top-0 right-0 p-2 opacity-10 text-2xl transform rotate-12">📶</div>
                  <div className="relative z-10">
                    <div className="flex justify-between items-start mb-1">
                      <p className="text-[8px] font-black uppercase tracking-widest opacity-80">Hot Reload</p>
                      <span className="bg-white/20 px-1 py-0.5 rounded text-[7px] font-black backdrop-blur-sm">4%</span>
                    </div >
                    <p className="text-sm font-black uppercase tracking-tight mb-1.5">{p.id}</p>
                    <div className="bg-black/20 rounded p-1.5 backdrop-blur-sm border border-white/10">
                      <p className="text-[7px] font-black uppercase tracking-widest opacity-70 mb-0.5 leading-none">Bal.</p>
                      <p className="text-[10px] font-black font-mono leading-none">Rs. {balance.toLocaleString()}</p>
                    </div>
                  </div >
                </button >
              );
            })}
          </div >

          <div className="flex-1 overflow-x-auto bg-white rounded-2xl border border-slate-200 shadow-sm">
            <table className="w-full text-left text-sm border-collapse table-fixed">
              <thead className="bg-slate-50/80 sticky top-0 backdrop-blur-md z-10">
                <tr>
                  <th className="px-3 py-1.5 text-[9px] font-black text-slate-400 uppercase tracking-widest w-auto border-b border-slate-100">Asset Details</th>
                  <th className="px-1.5 py-1.5 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right w-[70px] border-b border-slate-100">Price</th>
                  <th className="px-1.5 py-1.5 text-[9px] font-black text-slate-400 uppercase tracking-widest text-center w-[60px] border-b border-slate-100">Stock</th>
                  <th className="px-1.5 py-1.5 text-[9px] font-black text-slate-400 uppercase tracking-widest text-center w-[40px] border-b border-slate-100">Add</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredProducts.map(p => {
                  const isLowStock = (p.stock || 0) <= (p.lowStockThreshold || 0);
                  return (
                    <tr key={p.id} className="hover:bg-slate-50 transition-all group">
                      <td className="px-3 py-0 overflow-hidden leading-none">
                        <div className="flex items-center gap-1.5 overflow-hidden max-w-full">
                          <p className="font-black text-slate-800 text-[10px] uppercase truncate shrink leading-tight">{p.name}</p>
                          <span className="text-slate-200 shrink-0 text-[8px]">•</span>
                          <p className="text-[7px] font-mono font-bold text-indigo-400 uppercase truncate opacity-70 shrink-0 leading-tight">{p.sku}</p>
                        </div>
                      </td>
                      <td className="px-2 py-0.5 text-right whitespace-nowrap">
                        <span className="font-bold text-slate-800 text-[10px] font-mono leading-none">{Number(p.price).toLocaleString()}</span>
                      </td>
                      <td className={`px-1.5 py-0 text-center leading-none`}>
                        <div className={`inline-flex items-center gap-1 px-1 py-0.5 rounded border ${isLowStock
                          ? 'bg-rose-50 border-rose-100 text-rose-500'
                          : 'bg-emerald-50 border-emerald-100 text-emerald-500'
                          }`}>
                          <span className="text-[9px] font-black font-mono leading-none">{p.stock}</span>
                          <span className="text-[5px] font-black uppercase opacity-50 leading-none">U</span>
                        </div>
                      </td>
                      <td className="px-2 py-0.5 text-center">
                        <button
                          onClick={(e) => { e.stopPropagation(); addToCart(p); }}
                          disabled={p.stock <= 0}
                          className="w-6 h-6 rounded-lg bg-slate-900 text-white flex items-center justify-center font-black text-sm hover:bg-black hover:scale-105 active:scale-95 transition-all shadow-md disabled:bg-slate-100 disabled:text-slate-200"
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
        </div >

        <div className="w-[35%] flex flex-col gap-2 shrink-0 min-h-0">
          {/* 1. TERMINAL PERFORMANCE (REORDERED TO TOP) */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 shrink-0">
            <div className="flex justify-between items-center mb-3">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Terminal IQ</p>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            </div>
            <div className="space-y-2">
              {Object.entries(dailySummary.branchBreakdown).map(([name, revenue]) => (
                <div key={name} className="flex items-center gap-3">
                  <div className={`flex-1 px-4 py-2.5 rounded-lg ${name === 'CASHIER 2' ? 'bg-orange-500' : 'bg-indigo-600'}`}>
                    <p className="text-[9px] font-black text-white uppercase tracking-wide">{name}</p>
                  </div>
                  <p className="text-[9px] font-black text-slate-900 font-mono whitespace-nowrap">Rs. {Math.round(Number(revenue)).toLocaleString()}</p>
                </div>
              ))}
            </div>
          </div>




          {/* 2. CHECKOUT TERMINAL (FIXED SIZE / AUTO GROWTH) */}
          <div className="flex-1 flex flex-col bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden min-h-0">
            <div className="px-5 py-2.5 border-b border-slate-100 flex justify-between items-center bg-slate-50/80 backdrop-blur-sm sticky top-0 z-10">
              <div className="flex items-center gap-2">
                <span className="text-xs">🛒</span>
                <h3 className="font-black text-slate-900 uppercase tracking-tight text-[10px]">Active Invoice</h3>
              </div>
              <span className="bg-slate-900 text-white px-2 py-0.5 rounded-lg text-[8px] font-black uppercase">{cart.length} ITEMS</span>
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
                        <input
                          type="number"
                          value={item.qty}
                          onChange={(e) => updateCartQty(item.product.id, parseInt(e.target.value) || 0)}
                          className="w-8 text-[10px] font-black text-center text-slate-700 bg-transparent border-none outline-none appearance-none"
                          min="0"
                        />
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

            <div className="p-4 space-y-2 bg-slate-50 border-t border-slate-100 sticky bottom-0 z-20">
              <div className="space-y-1 pb-1 border-b border-slate-200/50">
                <div className="flex justify-between items-center text-[9px] font-bold text-slate-500 uppercase tracking-widest">
                  <span>Gross Total</span>
                  <span className="font-mono text-slate-700">Rs. {totals.subtotal.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center text-[9px] font-black uppercase tracking-widest">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500">Universal Disc.</span>
                    <button
                      onClick={() => setShowGlobalDiscountEdit(!showGlobalDiscountEdit)}
                      className="w-4 h-4 rounded-md bg-white border border-slate-200 flex items-center justify-center text-[7px] hover:border-indigo-300 transition-all shadow-sm"
                    >
                      🏷️
                    </button>
                  </div>
                  <span className="font-mono text-rose-600">{totals.globalDiscountAmt > 0 ? '-' : ''} Rs. {totals.globalDiscountAmt.toLocaleString()}</span>
                </div>

                {showGlobalDiscountEdit && (
                  <div className="p-2 bg-slate-900 rounded-xl border border-slate-800 flex items-center gap-2 animate-in slide-in-from-top-2 my-1">
                    <div className="flex bg-slate-800 rounded-lg border border-slate-700 overflow-hidden shadow-inner shrink-0">
                      <button
                        onClick={() => setPosSession(p => ({ ...p, globalDiscountType: 'AMT' }))}
                        className={`px-2 py-1 text-[7px] font-black uppercase transition-colors ${globalDiscountType === 'AMT' ? 'bg-white text-slate-950' : 'text-slate-400'}`}
                      >
                        Rs
                      </button>
                      <button
                        onClick={() => setPosSession(p => ({ ...p, globalDiscountType: 'PCT' }))}
                        className={`px-2 py-1 text-[7px] font-black uppercase transition-colors ${globalDiscountType === 'PCT' ? 'bg-white text-slate-950' : 'text-slate-400'}`}
                      >
                        %
                      </button>
                    </div>
                    <input
                      type="number"
                      className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-[10px] font-black font-mono text-white outline-none focus:border-indigo-400"
                      value={globalDiscountType === 'PCT' ? (discountPercent || '') : (discount || '')}
                      placeholder="0"
                      onChange={(e) => updateGlobalDiscount(parseFloat(e.target.value) || 0, globalDiscountType)}
                      autoFocus
                    />
                  </div>
                )}
              </div>

              {/* PAYMENT PIPELINE */}
              <div className="grid grid-cols-5 gap-1">
                {['CASH', 'BANK', 'CARD', 'CREDIT', 'CHEQUE'].map(m => (
                  <button
                    key={m}
                    disabled={isAdvance && m === 'CREDIT'}
                    onClick={() => setPosSession((prev: POSSession) => ({ ...prev, paymentMethod: m as any }))}
                    className={`py-1.5 rounded-lg text-[6px] font-black uppercase transition-all border ${paymentMethod === m ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg' : 'bg-white text-slate-400 border-slate-200 hover:border-indigo-200'} disabled:opacity-20`}
                  >
                    {m}
                  </button>
                ))}
              </div>

              <div className="pt-1">
                <div className="flex justify-between items-center mb-1">
                  <button
                    onClick={() => setPosSession(prev => ({ ...prev, isAdvance: !prev.isAdvance }))}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[7px] font-black uppercase transition-all ${isAdvance ? 'bg-indigo-600 text-white shadow-md' : 'bg-white text-slate-400 border border-slate-100 hover:border-indigo-200'}`}
                  >
                    {isAdvance ? '⚡ Advance ACTIVE' : '⊕ SPLIT/ADVANCE'}
                  </button>
                  {isAdvance && (
                    <div className="text-right">
                      <p className="text-[6px] font-black text-slate-400 uppercase tracking-widest leading-none mb-0.5">Residual</p>
                      <p className="text-[9px] font-black font-mono text-rose-500 leading-none">Rs. {totals.remainingDue.toLocaleString()}</p>
                    </div>
                  )}
                </div>
                {isAdvance && (
                  <div className="flex items-center gap-2 p-1.5 bg-indigo-50/50 border border-indigo-100 rounded-xl animate-in slide-in-from-bottom-1">
                    <span className="text-[7px] font-black text-indigo-400 uppercase shrink-0">Collection (Rs):</span>
                    <input
                      type="number"
                      className="flex-1 bg-white border border-indigo-100 rounded-lg px-2 py-1 text-[10px] font-black font-mono text-indigo-600 outline-none"
                      value={advanceAmount || ''}
                      onChange={(e) => setPosSession(prev => ({ ...prev, advanceAmount: parseFloat(e.target.value) || 0 }))}
                      autoFocus
                    />
                  </div>
                )}
              </div>

              <div className="pt-2 flex justify-between items-end border-t border-slate-200/50">
                <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-0.5">NET AUTHORIZATION value</span>
                <span className="text-xl font-black text-slate-950 font-mono leading-none tracking-tighter">Rs. {totals.finalTotal.toLocaleString()}</span>
              </div>

              <button
                onClick={() => {
                  if (paymentMethod === 'CREDIT' || isAdvance) setShowCustomerModal(true);
                  else if (paymentMethod === 'CASH') setShowCashModal(true);
                  else completeTransaction();
                }}
                disabled={cart.length === 0 || isProcessing || (isAdvance && ((advanceAmount || 0) <= 0 || (advanceAmount || 0) >= totals.finalTotal))}
                className="w-full bg-slate-950 text-white py-3.5 rounded-2xl font-black uppercase text-[10px] shadow-2xl hover:bg-black active:scale-[0.97] disabled:bg-slate-200 transition-all tracking-[0.2em] relative overflow-hidden group"
              >
                <span className="relative z-10">{isAdvance ? 'Commit Partial Authorization' : 'Authorize Full Settlement'}</span>
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>
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
                <p className="text-[9px] font-black text-indigo-500 uppercase tracking-widest mt-1">Ready for QR / Barcode identification</p>
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
          onClick={(e) => { if (e.target === e.currentTarget) { setShowCashModal(false); setCashReceived(''); } }}
        >
          <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in duration-300 cursor-default">
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
              const requiredAmount = isAdvance ? (advanceAmount || 0) : totals.finalTotal;
              if (!isProcessing && (parseFloat(cashReceived) || 0) >= requiredAmount) {
                completeTransaction();
              }
            }} className="p-10 space-y-8">
              <div className="bg-slate-50 p-6 rounded-[2rem] border border-slate-100 flex justify-between items-center">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{isAdvance ? 'Advance Payable' : 'Total Payable'}</span>
                <span className="text-2xl font-black text-slate-900 font-mono">Rs. {(isAdvance ? (advanceAmount || 0) : totals.finalTotal).toLocaleString()}</span>
              </div>
              <div className="space-y-4">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Amount Given</label>
                <input autoFocus type="number" className="w-full px-8 py-5 rounded-3xl border-2 border-slate-100 text-4xl font-black font-mono text-center text-indigo-600 outline-none" placeholder="0.00" value={cashReceived} onChange={e => setCashReceived(e.target.value)} />
              </div>
              {parseFloat(cashReceived) > (isAdvance ? (advanceAmount || 0) : totals.finalTotal) && (
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
                  disabled={isProcessing || (parseFloat(cashReceived) || 0) < (isAdvance ? (advanceAmount || 0) : totals.finalTotal)}
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
          onClick={(e) => { if (e.target === e.currentTarget) setShowCustomerModal(false); }}
        >
          <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in duration-300 cursor-default">
            <div className="p-8 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
              <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter">
                {isAdvance ? 'Client Binding (Debt Auto-Gen)' : 'Charge Credit Account'}
              </h3>
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
                      <button key={c.id} onClick={() => {
                        if (paymentMethod === 'CASH') setShowCashModal(true);
                        else completeTransaction(c.id);
                      }} className="w-full flex justify-between items-center p-4 bg-slate-50 rounded-xl hover:bg-indigo-50 transition-all border border-slate-100 text-left">
                        <div>
                          <span className="font-black text-xs uppercase block">{c.name}</span>
                          <span className="text-[10px] font-mono text-slate-400 tracking-tighter">{c.phone}</span>
                        </div>
                        {isAdvance && (
                          <div className="text-right">
                            <span className="text-[8px] font-black text-rose-500 uppercase block">Pending Due</span>
                            <span className="text-[10px] font-black font-mono">Rs. {totals.remainingDue.toLocaleString()}</span>
                          </div>
                        )}
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

