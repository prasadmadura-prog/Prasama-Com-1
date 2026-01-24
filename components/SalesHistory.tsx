
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Transaction, Product, Customer, UserProfile, BankAccount } from '../types';
import { buildSalesHistoryReportHtml } from './ReportLayout';
import { buildSaleReceiptHtml } from './ReceiptLayout';

interface SalesHistoryProps {
  transactions: Transaction[];
  products: Product[];
  customers: Customer[];
  userProfile: UserProfile;
  accounts: BankAccount[];
  onUpdateTransaction: (tx: Transaction) => void;
  onDeleteTransaction: (id: string) => void;
}

const SalesHistory: React.FC<SalesHistoryProps> = ({ 
  transactions = [], 
  products = [], 
  customers = [], 
  userProfile, 
  accounts = [],
  onUpdateTransaction,
  onDeleteTransaction
}) => {
  // Helper for consistent Local YYYY-MM-DD
  const getTodayLocal = () => {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };

  const today = getTodayLocal();

  // Helper: Default to last 30 days instead of today only
  const getDefaultFromDate = () => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };

  const defaultStart = getDefaultFromDate();

  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(today);
  const [activeTab, setActiveTab] = useState<'ALL' | 'PAID' | 'DUE' | 'DRAFT'>('ALL');
  const [selectedCashier, setSelectedCashier] = useState<string>('ALL'); // Filter by cashier
  
  // Saved Carts (Drafts) State
  const [savedCarts, setSavedCarts] = useState<any[]>([]);

  // Load drafts from localStorage with guards
  const loadSavedCarts = useCallback(() => {
    try {
      const raw = localStorage.getItem('savedCarts');
      const parsed = raw ? JSON.parse(raw) : [];
      const cleaned = Array.isArray(parsed) ? parsed.filter(c => c && Array.isArray(c.cart)) : [];
      setSavedCarts(cleaned);
    } catch (err) {
      console.error('SalesHistory: failed to read saved carts', err);
      setSavedCarts([]);
    }
  }, []);
  
  // Edit Modal State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [tempItems, setTempItems] = useState<{ productId: string; quantity: number; price: number; discount?: number }[]>([]);
  const [tempTotal, setTempTotal] = useState(0);

  useEffect(() => {
    if (editingTx) {
      setTempItems(editingTx.items || []);
      setTempTotal(editingTx.amount);
    }
  }, [editingTx]);

  // Ensure both start and end default to today on mount
  useEffect(() => {
    const todayLocal = getTodayLocal();
    setStartDate(todayLocal);
    setEndDate(todayLocal);
    
    loadSavedCarts();
    
    // Refresh saved carts every 2 seconds to catch new drafts
    const interval = setInterval(loadSavedCarts, 2000);
    return () => clearInterval(interval);
  }, [loadSavedCarts]);

  // Force-refresh drafts when the Draft tab is opened
  useEffect(() => {
    if (activeTab === 'DRAFT') loadSavedCarts();
  }, [activeTab, loadSavedCarts]);

  // Include Sales and Credit Payments - SHOW ALL BRANCHES
  const ledgerEntries = useMemo(() => {
    if (!Array.isArray(transactions)) return [];
    console.log('SalesHistory - Total transactions received:', transactions.length);
    console.log('SalesHistory - All transactions:', transactions);
    // Remove branch filtering - show all transactions regardless of branch
    const filtered = transactions.filter(t => t && (t.type === 'SALE' || t.type === 'CREDIT_PAYMENT' || t.type === 'sale'));
    console.log('SalesHistory - Filtered SALE transactions:', filtered.length, filtered);
    return filtered;
  }, [transactions]);

  const filteredEntries = useMemo(() => {
    const entries = ledgerEntries.filter(s => {
      // Robust Case-Insensitive Search
      const txId = (s.id || "").toLowerCase();
      const search = searchTerm.toLowerCase();
      const matchesSearch = txId.includes(search);
      
      // Strict Local Date Range Check
      const txDateStr = typeof s.date === 'string' ? s.date.split('T')[0] : '';
      const matchesRange = (!startDate || txDateStr >= startDate) && (!endDate || txDateStr <= endDate);
      
      const isDue = s.paymentMethod === 'CREDIT';
      const matchesTab = activeTab === 'ALL' || (activeTab === 'PAID' && !isDue) || (activeTab === 'DUE' && isDue);
      
      // Cashier filter
      const matchesCashier = selectedCashier === 'ALL' || s.cashierId === selectedCashier;

      return matchesSearch && matchesRange && matchesTab && matchesCashier;
    });

    // Sort newest first so today's entries appear at the top
    return [...entries].sort((a, b) => {
      const aDate = new Date(a?.date || '').getTime() || 0;
      const bDate = new Date(b?.date || '').getTime() || 0;
      return bDate - aDate;
    });
  }, [ledgerEntries, searchTerm, startDate, endDate, activeTab, selectedCashier]);

  // Group transactions by date
  const groupedByDate = useMemo(() => {
    const groups: Record<string, Transaction[]> = {};
    filteredEntries.forEach(tx => {
      const dateKey = new Date(tx.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(tx);
    });
    return groups;
  }, [filteredEntries]);

  const resetFilters = () => {
    setSearchTerm('');
    setStartDate(defaultStart);
    setEndDate(today);
    setActiveTab('ALL');
  };

  const showAllHistory = () => {
    setSearchTerm('');
    setStartDate('');
    setEndDate('');
    setActiveTab('ALL');
  };

  const summaryStats = useMemo(() => {
    // Stats calculation MUST use the same Local date range logic
    const rangeEntries = ledgerEntries.filter(s => {
        const txDateStr = typeof s.date === 'string' ? s.date.split('T')[0] : '';
        return (!startDate || txDateStr >= startDate) && (!endDate || txDateStr <= endDate);
    });

    const realizedInflow = rangeEntries
      .filter(s => (s.type === 'SALE' && s.paymentMethod !== 'CREDIT') || s.type === 'CREDIT_PAYMENT')
      .reduce((a, b) => a + Number(b.amount || 0), 0);

    const dueAmount = rangeEntries
      .filter(s => s.type === 'SALE' && s.paymentMethod === 'CREDIT')
      .reduce((a, b) => a + Number(b.amount || 0), 0);

    // Calculate Total Revenue (all sales)
    const revenue = rangeEntries
      .filter(s => s.type === 'SALE' || s.type === 'sale')
      .reduce((a, b) => a + Number(b.amount || 0), 0);

    // Calculate Total Cost (sum of item quantities * cost price)
    const totalCost = rangeEntries
      .filter(s => s.type === 'SALE' || s.type === 'sale')
      .reduce((acc, tx) => {
        if (tx.items && Array.isArray(tx.items)) {
          const txCost = tx.items.reduce((sum, item) => {
            const product = products.find(p => p.id === item.productId);
            const costPrice = product?.cost || 0;
            return sum + (item.quantity * costPrice);
          }, 0);
          return acc + txCost;
        }
        return acc;
      }, 0);

    // Calculate Profit
    const profit = revenue - totalCost;

    // Calculate Margin %
    const margin = revenue > 0 ? (profit / revenue) * 100 : 0;

    // Calculate Yield on Investment %
    const yieldOnInvestment = totalCost > 0 ? (profit / totalCost) * 100 : 0;

    return { 
      realizedInflow, 
      dueAmount, 
      revenue, 
      profit, 
      margin, 
      yieldOnInvestment 
    };
  }, [ledgerEntries, startDate, endDate, products]);

  const getCustomerName = (id?: string) => {
    if (!id) return 'Walk-in Customer';
    return customers.find(c => c && c.id === id)?.name || 'Credit Client';
  };

  const handleUpdateItem = (index: number, field: string, value: string) => {
    const newItems = [...tempItems];
    const numVal = parseFloat(value) || 0;
    
    newItems[index] = { ...newItems[index], [field]: numVal };
    setTempItems(newItems);
    
    const newTotal = newItems.reduce((acc, item) => acc + (item.quantity * item.price) - (item.discount || 0), 0);
    setTempTotal(newTotal);
  };

  const handleUpdate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingTx) return;
    const fd = new FormData(e.currentTarget);
    
    const updated: Transaction = {
      ...editingTx,
      date: new Date(fd.get('date') as string).toISOString(),
      amount: editingTx.type === 'SALE' ? tempTotal : Number(fd.get('amount')),
      description: (fd.get('description') as string).toUpperCase(),
      paymentMethod: fd.get('paymentMethod') as any,
      accountId: fd.get('accountId') as string,
      chequeNumber: fd.get('chequeNumber') as string || undefined,
      chequeDate: fd.get('chequeDate') as string || undefined,
      items: editingTx.type === 'SALE' ? tempItems : undefined
    };

    onUpdateTransaction(updated);
    setIsEditModalOpen(false);
    setEditingTx(null);
  };

  const handlePrintReceipt = (tx: Transaction) => {
    if (tx.type === 'CREDIT_PAYMENT') {
        const printWindow = window.open('', '_blank');
        if (!printWindow) return;
        printWindow.document.write(`
            <html>
                <body onload="window.print(); window.close();" style="font-family: monospace; text-align: center; padding: 20px;">
                    <h2>${userProfile.name}</h2>
                    <p>CREDIT PAYMENT RECEIPT</p>
                    <hr/>
                    <p>REF: ${tx.id}</p>
                    <p>DATE: ${new Date(tx.date).toLocaleString()}</p>
                    <p>CUSTOMER: ${getCustomerName(tx.customerId)}</p>
                    <h3>AMOUNT: Rs. ${Number(tx.amount).toLocaleString()}</h3>
                    <p>METHOD: ${tx.paymentMethod}</p>
                    <hr/>
                    <p>PRASAMA ERP SOLUTIONS</p>
                </body>
            </html>
        `);
        printWindow.document.close();
        return;
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    const html = buildSaleReceiptHtml(tx as any, products, userProfile);
    printWindow.document.write(html);
    printWindow.document.close();
  };

  const handlePrintReport = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    const html = buildSalesHistoryReportHtml(filteredEntries, products, userProfile, { startDate, endDate });
    printWindow.document.write(html);
    printWindow.document.close();
  };

  return (
    <div className="font-sans bg-neutral-50 min-h-screen animate-in fade-in duration-500 pb-12">
      {/* Header Section */}
      <header className="flex flex-col gap-4 border-b border-neutral-200 pb-4 mb-4 px-2 pt-6">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-2">
          <div>
            <h2 className="text-2xl font-extrabold text-neutral-900 tracking-tight leading-tight uppercase">Sales History & Audit</h2>
            <p className="text-sm text-neutral-500 font-medium mt-1 uppercase tracking-wide">Commercial cycle verification</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handlePrintReport} className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-md hover:bg-indigo-700">Print Report</button>
          </div>
        </div>
        
        {/* Financial Metrics Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {/* Total Yield */}
          <div className="bg-white border border-neutral-200 rounded-lg px-4 py-3 flex flex-col">
            <span className="text-[10px] text-neutral-500 font-semibold uppercase tracking-wider mb-1">Total Yield</span>
            <span className={`text-xl font-bold font-mono ${summaryStats.yieldOnInvestment >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {summaryStats.yieldOnInvestment >= 0 ? '+' : ''}{summaryStats.yieldOnInvestment.toFixed(1)}%
            </span>
            <span className="text-[9px] text-neutral-400 font-medium uppercase mt-0.5">Yield on Investment</span>
          </div>

          {/* Profit */}
          <div className="bg-white border border-neutral-200 rounded-lg px-4 py-3 flex flex-col">
            <span className="text-[10px] text-neutral-500 font-semibold uppercase tracking-wider mb-1">Profit</span>
            <span className={`text-xl font-bold font-mono ${summaryStats.profit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              Rs. {summaryStats.profit.toLocaleString()}
            </span>
            <span className={`text-[9px] font-medium uppercase mt-0.5 ${summaryStats.margin >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              Margin: {summaryStats.margin >= 0 ? '+' : ''}{summaryStats.margin.toFixed(1)}%
            </span>
          </div>

          {/* Revenue */}
          <div className="bg-white border border-neutral-200 rounded-lg px-4 py-3 flex flex-col">
            <span className="text-[10px] text-neutral-500 font-semibold uppercase tracking-wider mb-1">Revenue</span>
            <span className="text-xl font-bold text-indigo-600 font-mono">Rs. {summaryStats.revenue.toLocaleString()}</span>
            <span className="text-[9px] text-neutral-400 font-medium uppercase mt-0.5">Total Sales</span>
          </div>

          {/* Realized Inflow */}
          <div className="bg-white border border-neutral-200 rounded-lg px-4 py-3 flex flex-col">
            <span className="text-[10px] text-neutral-500 font-semibold uppercase tracking-wider mb-1">Realized Inflow</span>
            <span className="text-xl font-bold text-emerald-600 font-mono">Rs. {summaryStats.realizedInflow.toLocaleString()}</span>
            <span className="text-[9px] text-neutral-400 font-medium uppercase mt-0.5">Cash Collected</span>
          </div>
        </div>
      </header>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-2 bg-white border border-neutral-200 rounded-lg px-3 py-2 mb-4 mx-2">
        <div className="relative flex-1 min-w-[180px]">
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-neutral-400 text-sm">🔍</span>
          <input
            type="text"
            placeholder="Search by Transaction ID..."
            className="w-full pl-8 pr-2 py-1.5 rounded-md border border-neutral-200 bg-neutral-50 text-sm font-medium focus:border-indigo-400 outline-none transition-all"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
        <input type="date" className="px-2 py-1.5 rounded-md border border-neutral-200 bg-white text-xs font-semibold outline-none" value={startDate} onChange={e => setStartDate(e.target.value)} />
        <input type="date" className="px-2 py-1.5 rounded-md border border-neutral-200 bg-white text-xs font-semibold outline-none" value={endDate} onChange={e => setEndDate(e.target.value)} />
        <select 
          value={selectedCashier} 
          onChange={e => setSelectedCashier(e.target.value)}
          className="px-2 py-1.5 rounded-md border border-neutral-200 bg-white text-xs font-semibold outline-none"
        >
          <option value="ALL">All Cashiers</option>
          <option value="cashier-1">Cashier 1</option>
          <option value="cashier-2">Cashier 2</option>
        </select>
        <button onClick={resetFilters} className="px-2 py-1.5 rounded-md border border-neutral-200 bg-neutral-50 text-xs font-semibold text-neutral-700 hover:bg-neutral-100 transition-all" title="Reset to Last 30 Days">↺ 30d</button>
        <button onClick={showAllHistory} className="px-2 py-1.5 rounded-md border border-neutral-200 bg-white text-xs font-semibold text-neutral-700 hover:bg-neutral-100 transition-all" title="Show full history">∞ All</button>
        <div className="flex gap-1 ml-2">
          {[
            { id: 'ALL', label: 'All' },
            { id: 'PAID', label: 'Paid' },
            { id: 'DUE', label: 'Due' },
            { id: 'DRAFT', label: `Draft (${savedCarts.length})` }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-2 py-1 rounded font-semibold text-xs border ${activeTab === tab.id ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-neutral-100 text-neutral-600 border-neutral-200 hover:bg-neutral-200'}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Transaction List */}
      {activeTab === 'DRAFT' ? (
        <div className="max-w-5xl mx-auto bg-white border border-neutral-200 rounded-lg shadow-sm p-4">
          <h3 className="text-sm font-bold text-neutral-700 tracking-wide uppercase mb-4">Saved Carts (Draft Transactions)</h3>
          {savedCarts.length === 0 ? (
            <div className="py-20 text-center text-neutral-400">
              <div className="text-4xl mb-2">📋</div>
              <p className="text-xs font-black uppercase tracking-widest">No saved carts</p>
            </div>
          ) : (
            <div className="space-y-2">
              {savedCarts.map((cart, index) => {
                const items = Array.isArray(cart.cart) ? cart.cart : [];
                const cartTotal = items.reduce((sum: number, item: any) => {
                  const itemGross = item.qty * item.price;
                  const itemDiscount = item.discountType === 'PCT' ? (itemGross * item.discount) / 100 : item.discount;
                  return sum + (itemGross - itemDiscount);
                }, 0);
                const globalDiscountAmt = cart.discountPercent > 0 ? (cartTotal * cart.discountPercent) / 100 : cart.discount;
                const finalTotal = cartTotal - globalDiscountAmt;
                
                return (
                  <div key={index} className="border border-neutral-200 rounded-lg p-3 hover:bg-neutral-50">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="text-xs font-bold text-neutral-500 uppercase">Draft #{index + 1}</p>
                        <p className="text-[10px] text-neutral-400">{new Date(cart.savedAt).toLocaleString()}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-black text-indigo-600">Rs. {finalTotal.toLocaleString()}</p>
                        <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded bg-amber-100 text-amber-700">DRAFT</span>
                      </div>
                    </div>
                    <div className="space-y-1">
                      {items.length === 0 ? (
                        <p className="text-[10px] text-neutral-400 italic">Empty draft</p>
                      ) : (
                        items.map((item: any, idx: number) => (
                          <p key={idx} className="text-[10px] text-neutral-600">
                            {idx + 1}. {products.find(p => p.id === item.product.id)?.name || 'Unknown'} × {item.qty}
                          </p>
                        ))
                      )}
                    </div>
                    <div className="mt-2 flex gap-2">
                      <button
                        onClick={() => {
                          const carts = JSON.parse(localStorage.getItem('savedCarts') || '[]');
                          carts.splice(index, 1);
                          localStorage.setItem('savedCarts', JSON.stringify(carts));
                          setSavedCarts(carts);
                        }}
                        className="flex-1 px-3 py-1.5 bg-rose-100 text-rose-700 rounded text-[10px] font-bold uppercase hover:bg-rose-200"
                      >
                        Delete Draft
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
      <div className="max-w-5xl mx-auto bg-white border border-neutral-200 rounded-lg shadow-sm">
        {Object.entries(groupedByDate).map(([dateLabel, txs]) => (
          <div key={dateLabel} className="px-4 pt-4 pb-2">
            {/* Date Header */}
            <div className="pb-1 mb-2 border-b border-neutral-200">
              <h3 className="text-sm font-bold text-neutral-700 tracking-wide uppercase">{dateLabel}</h3>
            </div>
            {/* Transactions under this date */}
            <div>
              {txs.map(tx => (
                <div key={tx.id} className="border-b border-neutral-100 last:border-b-0 py-3 hover:bg-neutral-50 transition-all">
                  <div className="grid grid-cols-12 items-start gap-3">
                    {/* Left: Date/ID */}
                    <div className="col-span-2 flex flex-col min-w-0">
                      <span className="text-[11px] font-bold text-neutral-500 uppercase">{new Date(tx.date).toLocaleDateString()}</span>
                      <button 
                        onClick={() => { setEditingTx(tx); setIsEditModalOpen(true); }} 
                        className="text-[11px] text-indigo-600 font-mono truncate leading-tight text-left hover:underline transition-colors cursor-pointer"
                      >
                        {tx.id}
                      </button>
                    </div>

                    {/* Center: Customer + Items Sold */}
                    <div className="col-span-5 flex flex-col min-w-0">
                      <button 
                        onClick={() => { setEditingTx(tx); setIsEditModalOpen(true); }} 
                        className="font-bold text-neutral-900 truncate leading-tight text-left hover:text-indigo-600 transition-colors cursor-pointer uppercase text-sm mb-1"
                      >
                        {getCustomerName(tx.customerId)}
                      </button>
                      {/* Items with numbers */}
                      {tx.type?.toUpperCase() === 'SALE' && Array.isArray(tx.items) && tx.items.length > 0 && (
                        <div className="space-y-0.5">
                          {tx.items.map((item, idx) => {
                            const product = products.find(p => p.id === item.productId);
                            return (
                              <div key={idx} className="flex items-center gap-2 text-[11px] text-neutral-500">
                                <span className="font-bold text-neutral-400 w-4">{idx + 1}</span>
                                <span className="font-semibold uppercase truncate">{product?.name || 'ITEM'}</span>
                                <span className="text-neutral-400 font-mono">@ {item.quantity}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Value */}
                    <div className="col-span-2 text-right">
                      <span className="font-bold text-neutral-900 font-mono text-base">{Number(tx.amount || 0).toLocaleString()}</span>
                    </div>

                    {/* Type/Method + Actions */}
                    <div className="col-span-3 flex flex-col items-end gap-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${tx.type?.toUpperCase() === 'SALE' ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700'}`}>{tx.type}</span>
                        {tx.cashierName && <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-purple-100 text-purple-700">{tx.cashierName}</span>}
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${tx.paymentMethod === 'CREDIT' ? 'bg-rose-100 text-rose-700' : 'bg-neutral-200 text-neutral-700'}`}>{tx.paymentMethod}</span>
                      <div className="flex gap-1 mt-1">
                        <button onClick={() => { setEditingTx(tx); setIsEditModalOpen(true); }} className="p-1 rounded border border-neutral-200 hover:bg-neutral-100 text-neutral-500 hover:text-indigo-600 transition-all" title="Edit Entry">
                          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19.5 3 21l1.5-4L16.5 3.5z"/></svg>
                        </button>
                        <button onClick={() => handlePrintReceipt(tx)} className="p-1 rounded border border-neutral-200 hover:bg-neutral-100 text-neutral-500 hover:text-indigo-600 transition-all" title="Print Receipt">
                          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="6" y="9" width="12" height="13" rx="2"/><path d="M9 22V12h6v10"/><path d="M9 6V2h6v4"/></svg>
                        </button>
                        <button onClick={() => { if(confirm('Confirm deletion of this record?')) onDeleteTransaction(tx.id); }} className="p-1 rounded border border-neutral-200 hover:bg-rose-50 text-neutral-500 hover:text-rose-600 transition-all" title="Delete">
                          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
        {Object.keys(groupedByDate).length === 0 && (
          <div className="px-8 py-20 text-center text-neutral-300 font-bold uppercase tracking-widest text-[12px] italic">No records match the current filters.</div>
        )}
      </div>
      )}

      {/* Edit Transaction Modal */}
      {isEditModalOpen && editingTx && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md">
           <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in duration-300 max-h-[90vh] flex flex-col">
              <div className="p-8 border-b border-slate-100 bg-slate-50 flex justify-between items-center shrink-0">
                 <div>
                    <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Edit Record</h3>
                    <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest mt-1">Ref: {editingTx.id} ({editingTx.type})</p>
                 </div>
                 <button onClick={() => { setIsEditModalOpen(false); setEditingTx(null); }} className="text-slate-300 hover:text-slate-900 text-4xl leading-none transition-colors">&times;</button>
              </div>
              
              <div className="flex-1 overflow-y-auto custom-scrollbar p-8">
                <form onSubmit={handleUpdate} className="space-y-8">
                   <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-1">
                         <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Entry Date</label>
                         <input name="date" type="date" required className="w-full px-5 py-3 rounded-xl border border-slate-200 font-bold text-xs" defaultValue={editingTx.date.split('T')[0]} />
                      </div>
                      <div className="space-y-1">
                         <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Revenue (Rs.)</label>
                         <input name="amount" type="number" step="0.01" required={editingTx.type !== 'SALE'} readOnly={editingTx.type === 'SALE'} className={`w-full px-5 py-3 rounded-xl border border-slate-200 font-black font-mono text-sm text-indigo-600 ${editingTx.type === 'SALE' ? 'bg-slate-50' : 'bg-white'}`} value={editingTx.type === 'SALE' ? tempTotal : undefined} defaultValue={editingTx.type !== 'SALE' ? editingTx.amount : undefined} />
                      </div>
                   </div>

                   <div className="space-y-1">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Audit Description / Memo</label>
                      <input name="description" required className="w-full px-5 py-3 rounded-xl border border-slate-200 font-bold uppercase text-xs" defaultValue={editingTx.description} />
                   </div>

                   {editingTx.type?.toUpperCase() === 'SALE' && (
                       <div className="space-y-4">
                          <h4 className="text-[10px] font-black text-slate-900 uppercase tracking-widest border-b border-slate-100 pb-2">Transaction Manifest</h4>
                          <div className="space-y-2">
                            {tempItems.map((item, idx) => {
                              const product = products.find(p => p.id === item.productId);
                              return (
                                <div key={idx} className="flex gap-4 items-center p-4 bg-slate-50 rounded-2xl border border-slate-100 hover:border-indigo-100 transition-all">
                                   <div className="flex-1 min-w-0">
                                      <p className="text-[11px] font-black text-slate-800 uppercase truncate">{product?.name || 'Asset'}</p>
                                      <p className="text-[9px] font-bold text-slate-400 font-mono">{product?.sku}</p>
                                   </div>
                                   <div className="w-20">
                                      <label className="block text-[8px] font-black text-slate-400 uppercase mb-1">Qty</label>
                                      <input 
                                        type="number" 
                                        className="w-full px-2 py-2 rounded-lg border border-slate-200 font-black font-mono text-[10px] text-center bg-white" 
                                        value={item.quantity} 
                                        onChange={e => handleUpdateItem(idx, 'quantity', e.target.value)}
                                      />
                                   </div>
                                   <div className="w-24">
                                      <label className="block text-[8px] font-black text-slate-400 uppercase mb-1">Unit Price</label>
                                      <input 
                                        type="number" 
                                        className="w-full px-2 py-2 rounded-lg border border-slate-200 font-black font-mono text-[10px] text-indigo-600 text-right bg-white" 
                                        value={item.price} 
                                        onChange={e => handleUpdateItem(idx, 'price', e.target.value)}
                                      />
                                   </div>
                                   <div className="w-24 text-right">
                                      <label className="block text-[8px] font-black text-slate-400 uppercase mb-1">Subtotal</label>
                                      <p className="text-[11px] font-black font-mono text-slate-900 mt-2">Rs. {(item.quantity * item.price).toLocaleString()}</p>
                                   </div>
                                </div>
                              );
                            })}
                          </div>
                       </div>
                   )}

                   <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-1">
                         <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Settlement Pipe</label>
                         <select name="paymentMethod" className="w-full px-5 py-3 rounded-xl border border-slate-200 font-black uppercase text-[10px] bg-white" defaultValue={editingTx.paymentMethod}>
                            {['CASH', 'BANK', 'CARD', 'CREDIT', 'CHEQUE'].map(m => <option key={m} value={m}>{m}</option>)}
                         </select>
                      </div>
                      <div className="space-y-1">
                         <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Asset Node (Account)</label>
                         <select name="accountId" className="w-full px-5 py-3 rounded-xl border border-slate-200 font-black uppercase text-[10px] bg-white" defaultValue={editingTx.accountId}>
                            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                         </select>
                      </div>
                   </div>

                   <div className="pt-6 border-t border-slate-100 shrink-0">
                      <button type="submit" className="w-full bg-slate-900 text-white font-black py-4 rounded-xl uppercase text-[10px] tracking-widest shadow-xl hover:bg-black transition-all">Update Commercial Ledger</button>
                   </div>
                </form>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default SalesHistory;


