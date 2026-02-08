
import React, { useState, useMemo, useEffect } from 'react';
import { Transaction, Product, Customer, UserProfile, BankAccount } from '../types';

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
  const getTodayLocal = () => {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };

  const today = getTodayLocal();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [activeTab, setActiveTab] = useState<'ALL' | 'PAID' | 'DUE'>('ALL');
  
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [tempItems, setTempItems] = useState<{ productId: string; quantity: number; price: number; discount?: number }[]>([]);
  const [tempTotal, setTempTotal] = useState(0);
  
  const [showItemPicker, setShowItemPicker] = useState(false);
  const [itemSearch, setItemSearch] = useState('');

  useEffect(() => {
    if (editingTx) {
      setTempItems(editingTx.items || []);
      setTempTotal(editingTx.amount);
    }
  }, [editingTx]);

  useEffect(() => {
    setEndDate(getTodayLocal());
  }, []);

  const ledgerEntries = useMemo(() => {
    if (!Array.isArray(transactions)) return [];
    return transactions.filter(t => t && (t.type === 'SALE' || t.type === 'CREDIT_PAYMENT'));
  }, [transactions]);

  const filteredEntries = useMemo(() => {
    return ledgerEntries
      .filter(s => {
        const txId = (s.id || "").toLowerCase();
        const search = searchTerm.toLowerCase();
        const matchesSearch = txId.includes(search);
        
        const txDateStr = typeof s.date === 'string' ? s.date.split('T')[0] : '';
        const matchesRange = (!startDate || txDateStr >= startDate) && (!endDate || txDateStr <= endDate);
        
        const isDue = s.paymentMethod === 'CREDIT';
        const matchesTab = activeTab === 'ALL' || (activeTab === 'PAID' && !isDue) || (activeTab === 'DUE' && isDue);

        return matchesSearch && matchesRange && matchesTab;
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [ledgerEntries, searchTerm, startDate, endDate, activeTab]);

  const resetFilters = () => {
    setSearchTerm('');
    setStartDate(today);
    setEndDate(today);
    setActiveTab('ALL');
  };

  const getCustomerName = (id?: string) => {
    if (!id) return 'Walk-in Customer';
    return customers.find(c => c && c.id === id)?.name || 'Credit Client';
  };

  const handleExportCSV = () => {
    if (filteredEntries.length === 0) return;

    const headers = [
      'Date', 
      'Reference', 
      'Customer', 
      'Item Name', 
      'SKU', 
      'Qty', 
      'Unit Price', 
      'Line Discount', 
      'Line Net', 
      'Tx Total Amount', 
      'Type', 
      'Method'
    ];

    const rows: (string | number)[][] = [];

    filteredEntries.forEach(tx => {
      const dateStr = new Date(tx.date).toLocaleDateString();
      const customer = getCustomerName(tx.customerId).replace(/,/g, '');
      const txTotal = tx.amount;
      const type = tx.type;
      const method = tx.paymentMethod;

      if (tx.items && tx.items.length > 0) {
        tx.items.forEach(item => {
          const product = products.find(p => p.id === item.productId);
          const itemName = (product?.name || 'Unknown Item').replace(/,/g, '');
          const sku = product?.sku || 'N/A';
          const qty = item.quantity;
          const price = item.price;
          const lineDisc = item.discount || 0;
          const lineNet = (qty * price) - lineDisc;

          rows.push([
            dateStr,
            tx.id,
            customer,
            itemName,
            sku,
            qty,
            price,
            lineDisc,
            lineNet,
            txTotal,
            type,
            method
          ]);
        });
      } else {
        rows.push([
          dateStr,
          tx.id,
          customer,
          tx.description.replace(/,/g, ''),
          'N/A',
          1,
          txTotal,
          0,
          txTotal,
          txTotal,
          type,
          method
        ]);
      }
    });

    const csvContent = [
      headers.join(','),
      ...rows.map(e => e.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `PRASAMA_DETAILED_SALES_${startDate}_TO_${endDate}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const summaryStats = useMemo(() => {
    const rangeEntries = ledgerEntries.filter(s => {
        const txDateStr = typeof s.date === 'string' ? s.date.split('T')[0] : '';
        return (!startDate || txDateStr >= startDate) && (!endDate || txDateStr <= endDate);
    });

    const costOfRevenue = rangeEntries
      .filter(s => s.type === 'SALE')
      .reduce((acc, t) => {
        const itemsCost = t.items?.reduce((itemAcc, item) => {
          const product = products.find(p => p.id === item.productId);
          return itemAcc + (Number(product?.cost || 0) * Number(item.quantity));
        }, 0) || 0;
        return acc + itemsCost;
      }, 0);

    const salesRevenue = rangeEntries
      .filter(s => (s.type === 'SALE' && s.paymentMethod !== 'CREDIT') || s.type === 'CREDIT_PAYMENT')
      .reduce((a, b) => a + Number(b.amount || 0), 0);

    const profit = salesRevenue - costOfRevenue;
    const margin = salesRevenue > 0 ? (profit / salesRevenue) * 100 : 0;
    const roi = costOfRevenue > 0 ? (profit / costOfRevenue) * 100 : 0;

    const dueAmount = rangeEntries
      .filter(s => s.type === 'SALE' && s.paymentMethod === 'CREDIT')
      .reduce((a, b) => a + Number(b.amount || 0), 0);

    return { costOfRevenue, salesRevenue, profit, margin, roi, dueAmount };
  }, [ledgerEntries, startDate, endDate, products]);

  const calculateTempTotal = (items: { productId: string; quantity: number; price: number; discount?: number }[]) => {
    return items.reduce((acc, item) => acc + (Number(item.quantity) * Number(item.price)) - (Number(item.discount) || 0), 0);
  };

  const handleUpdateItemField = (index: number, field: string, value: string) => {
    const newItems = [...tempItems];
    const numVal = parseFloat(value) || 0;
    
    newItems[index] = { ...newItems[index], [field]: numVal };
    setTempItems(newItems);
    setTempTotal(calculateTempTotal(newItems));
  };

  const handleAddItemToManifest = (p: Product) => {
    const newItems = [...tempItems, { productId: p.id, quantity: 1, price: p.price, discount: 0 }];
    setTempItems(newItems);
    setTempTotal(calculateTempTotal(newItems));
    setShowItemPicker(false);
    setItemSearch('');
  };

  const handleRemoveItemFromManifest = (index: number) => {
    const newItems = tempItems.filter((_, i) => i !== index);
    setTempItems(newItems);
    setTempTotal(calculateTempTotal(newItems));
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
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    if (tx.type === 'CREDIT_PAYMENT') {
        printWindow.document.write(`
            <html>
                <body onload="window.print(); window.close();" style="font-family: 'JetBrains Mono', monospace; text-align: center; width: 72mm; padding: 4px; box-sizing: border-box; font-size: 9px;">
                    <h3 style="margin: 1px 0; text-transform: uppercase;">${userProfile.name}</h3>
                    <p style="margin: 1px 0;">CREDIT PAYMENT RECEIPT</p>
                    <div style="border-top: 1px dashed #000; margin: 4px 0;"></div>
                    <p style="text-align: left; margin: 1px 0;">REF: ${tx.id}</p>
                    <p style="text-align: left; margin: 1px 0;">DATE: ${new Date(tx.date).toLocaleString()}</p>
                    <p style="text-align: left; margin: 1px 0; font-weight: 800;">CUS: ${getCustomerName(tx.customerId)}</p>
                    <div style="border-top: 1px dashed #000; margin: 4px 0;"></div>
                    <h2 style="margin: 4px 0; font-size: 14px;">Rs. ${Number(tx.amount).toLocaleString()}</h2>
                    <p style="margin: 1px 0; text-align: right; font-weight: 800;">BY: ${tx.paymentMethod}</p>
                    <div style="border-top: 1px dashed #000; margin: 4px 0;"></div>
                    <p style="font-size: 8px; font-weight: 800; margin-top: 8px;">PRASAMA ERP SOLUTIONS</p>
                </body>
            </html>
        `);
        printWindow.document.close();
        return;
    }

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
    const grossTotalValue = Number(tx.amount) + Number(tx.discount || 0);

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
              <span>GROSS TOTAL:</span>
              <span>${grossTotalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>
            ${(tx.discount || 0) > 0 ? `
            <div class="summary-row">
              <span>SAVINGS:</span>
              <span>-${tx.discount?.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
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

  const filteredPickerProducts = useMemo(() => {
    if (!itemSearch.trim()) return [];
    return products.filter(p => 
      p.name.toLowerCase().includes(itemSearch.toLowerCase()) || 
      p.sku.toLowerCase().includes(itemSearch.toLowerCase())
    ).slice(0, 5);
  }, [products, itemSearch]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tighter">Sales History & Audit</h2>
          <p className="text-slate-500 font-bold uppercase tracking-widest text-[10px]">Commercial cycle verification</p>
        </div>
        <div className="flex gap-4">
           <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex gap-10 overflow-x-auto">
              <div className="text-right shrink-0">
                 <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Sales Revenue</p>
                 <p className="text-xl font-black font-mono text-indigo-600">Rs. {summaryStats.salesRevenue.toLocaleString()}</p>
                 <p className="text-[10px] font-black uppercase text-emerald-500">Margin: {summaryStats.margin.toFixed(1)}%</p>
              </div>
              <div className="text-right border-l border-slate-100 pl-10 shrink-0">
                 <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Profit</p>
                 <p className="text-xl font-black font-mono text-emerald-600">Rs. {summaryStats.profit.toLocaleString()}</p>
                 <p className="text-[10px] font-black uppercase text-indigo-500">Yield/ROI: {summaryStats.roi.toFixed(1)}%</p>
              </div>
              <div className="text-right border-l border-slate-100 pl-10 shrink-0">
                 <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Cost of Revenue</p>
                 <p className="text-xl font-black font-mono text-slate-600">Rs. {summaryStats.costOfRevenue.toLocaleString()}</p>
              </div>
              <div className="text-right border-l border-slate-100 pl-10 shrink-0">
                 <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">New Unsettled Credit</p>
                 <p className="text-xl font-black font-mono text-rose-600">Rs. {summaryStats.dueAmount.toLocaleString()}</p>
              </div>
           </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3 space-y-6">
          <div className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm flex flex-col md:flex-row gap-4 items-center">
            <div className="relative flex-1 w-full">
              <span className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
              <input 
                type="text" 
                placeholder="Search by Transaction ID..." 
                className="w-full pl-14 pr-6 py-4 rounded-2xl border border-slate-200 outline-none bg-slate-50/50 font-bold text-sm focus:border-indigo-500 transition-all" 
                value={searchTerm} 
                onChange={(e) => setSearchTerm(e.target.value)} 
              />
            </div>
            <div className="flex gap-3 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
              <input type="date" className="px-6 py-4 rounded-2xl border border-slate-200 bg-white text-xs font-black outline-none" value={startDate} onChange={e => setStartDate(e.target.value)} />
              <input type="date" className="px-6 py-4 rounded-2xl border border-slate-200 bg-white text-xs font-black outline-none" value={endDate} onChange={e => setEndDate(e.target.value)} />
              <button onClick={resetFilters} className="px-4 py-4 rounded-2xl border border-slate-200 bg-slate-50 text-[10px] font-black uppercase hover:bg-slate-100 transition-all" title="Reset All Filters">↺ Reset</button>
              <button 
                onClick={handleExportCSV} 
                disabled={filteredEntries.length === 0}
                className="px-6 py-4 rounded-2xl bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest shadow-lg shadow-indigo-100 hover:bg-indigo-700 disabled:opacity-30 transition-all whitespace-nowrap"
              >
                📥 Export Detailed CSV
              </button>
            </div>
          </div>

          <div className="bg-white rounded-[3rem] shadow-sm border border-slate-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead className="bg-slate-50 text-slate-400 uppercase tracking-widest text-[9px]">
                  <tr>
                    <th className="px-8 py-3">Date / ID</th>
                    <th className="px-8 py-3">Customer / Items sold</th>
                    <th className="px-8 py-3 text-right">Value (Rs.)</th>
                    <th className="px-8 py-3">Type / Method</th>
                    <th className="px-8 py-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {filteredEntries.map(tx => (
                    <tr key={tx.id} className="hover:bg-indigo-50/30 transition-all group align-top">
                      <td className="px-8 py-4">
                        <p className="font-black text-slate-900 uppercase text-[12px] tracking-tight">{new Date(tx.date).toLocaleDateString()}</p>
                        <p className="text-[10px] text-indigo-500 font-mono font-black uppercase mt-0.5">{tx.id}</p>
                      </td>
                      <td className="px-8 py-4">
                        <p className="font-black text-slate-700 uppercase text-[11px] mb-2">{getCustomerName(tx.customerId)}</p>
                        <div className="space-y-1.5 border-l-2 border-slate-100 pl-3">
                           {tx.items && tx.items.length > 0 ? (
                             tx.items.map((it, idx) => {
                               const p = products.find(prod => prod.id === it.productId);
                               return (
                                 <div key={idx} className="flex items-center gap-2 text-[9px] font-black uppercase text-slate-400 leading-none">
                                    <span className="w-4 h-4 rounded bg-slate-100 flex items-center justify-center text-[7px] text-slate-600 font-bold shrink-0">{it.quantity}</span>
                                    <span className="truncate max-w-[140px]">{p?.name || 'Asset'}</span>
                                    <span className="ml-auto text-slate-300 font-mono text-[8px]">@ {Number(it.price).toLocaleString()}</span>
                                 </div>
                               );
                             })
                           ) : (
                             <p className="text-[9px] text-slate-400 font-bold uppercase truncate max-w-[200px] italic">{tx.description}</p>
                           )}
                        </div>
                      </td>
                      <td className="px-8 py-4 text-right font-black text-slate-900 font-mono text-[13px]">
                        {Number(tx.amount || 0).toLocaleString()}
                      </td>
                      <td className="px-8 py-4">
                         <div className="flex flex-col gap-1">
                            <span className={`px-2 py-0.5 rounded-lg text-[8px] font-black uppercase tracking-widest self-start ${tx.type?.toUpperCase() === 'SALE' ? 'bg-indigo-50 text-indigo-600' : 'bg-emerald-50 text-emerald-600'}`}>
                                {tx.type}
                            </span>
                            <span className={`px-2 py-0.5 rounded-lg text-[8px] font-black uppercase tracking-widest self-start ${tx.paymentMethod === 'CREDIT' ? 'bg-rose-50 text-rose-600' : 'bg-slate-100 text-slate-600'}`}>
                                {tx.paymentMethod}
                            </span>
                         </div>
                      </td>
                      <td className="px-8 py-4 text-center">
                        <div className="flex justify-center gap-2">
                          <button onClick={() => { setEditingTx(tx); setIsEditModalOpen(true); }} className="p-2.5 rounded-xl border border-slate-200 hover:bg-white hover:text-indigo-600 transition-all shadow-sm" title="Edit Entry">✏️</button>
                          <button onClick={() => handlePrintReceipt(tx)} className="p-2.5 rounded-xl border border-slate-200 hover:bg-white hover:text-indigo-600 transition-all shadow-sm" title="Print Receipt">🖨️</button>
                          <button onClick={() => { if(confirm("Confirm deletion of this record?")) onDeleteTransaction(tx.id); }} className="p-2.5 rounded-xl border border-slate-200 hover:bg-rose-50 hover:text-rose-600 transition-all shadow-sm">🗑️</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredEntries.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-8 py-20 text-center text-slate-300 font-black uppercase tracking-widest text-[10px] italic">No records match the current filters.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="space-y-6">
           <div className="bg-slate-900 p-8 rounded-[2.5rem] shadow-xl border border-slate-800">
              <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] mb-6">Filter by Status</h3>
              <div className="space-y-2">
                 {[
                   { id: 'ALL', label: 'Complete Ledger', icon: '📊' },
                   { id: 'PAID', label: 'Realized Revenue', icon: '💰' },
                   { id: 'DUE', label: 'Unsettled Credit', icon: '⏳' }
                 ].map(tab => (
                   <button 
                     key={tab.id} 
                     onClick={() => setActiveTab(tab.id as any)}
                     className={`w-full flex items-center gap-4 px-6 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all ${activeTab === tab.id ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:bg-slate-800/50 hover:text-slate-300'}`}
                   >
                     <span className="text-lg">{tab.icon}</span>
                     {tab.label}
                   </button>
                 ))}
              </div>
           </div>
        </div>
      </div>

      {/* Edit Transaction Modal */}
      {isEditModalOpen && editingTx && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md">
           <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-3xl overflow-hidden animate-in zoom-in duration-300 max-h-[95vh] flex flex-col">
              <div className="p-8 border-b border-slate-100 bg-slate-50 flex justify-between items-center shrink-0">
                 <div>
                    <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Edit Record</h3>
                    <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest mt-1">Ref: {editingTx.id} ({editingTx.type})</p>
                 </div>
                 <button onClick={() => { setIsEditModalOpen(false); setEditingTx(null); setShowItemPicker(false); }} className="text-slate-300 hover:text-slate-900 text-4xl leading-none transition-colors">&times;</button>
              </div>
              
              <div className="flex-1 overflow-y-auto custom-scrollbar p-8">
                <form onSubmit={handleUpdate} className="space-y-6">
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
                          <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                             <h4 className="text-[10px] font-black text-slate-900 uppercase tracking-widest">Transaction Manifest</h4>
                             <button type="button" onClick={() => setShowItemPicker(!showItemPicker)} className="text-[9px] font-black text-indigo-600 uppercase bg-indigo-50 px-3 py-1.5 rounded-lg hover:bg-indigo-100 transition-all">+ Add Asset</button>
                          </div>

                          {showItemPicker && (
                            <div className="p-4 bg-slate-900 rounded-2xl border border-slate-800 space-y-4 animate-in slide-in-from-top-2">
                               <input 
                                 autoFocus
                                 className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-xs font-bold text-white outline-none focus:border-indigo-500" 
                                 placeholder="SEARCH CATALOG TO ADD..." 
                                 value={itemSearch}
                                 onChange={e => setItemSearch(e.target.value)}
                               />
                               <div className="grid grid-cols-1 gap-2">
                                  {filteredPickerProducts.map(p => (
                                    <button 
                                      key={p.id} 
                                      type="button"
                                      onClick={() => handleAddItemToManifest(p)}
                                      className="flex justify-between items-center p-3 bg-slate-800 hover:bg-slate-700 rounded-xl border border-slate-700 transition-all text-left"
                                    >
                                       <span className="text-[10px] font-black text-white uppercase">{p.name}</span>
                                       <span className="text-[9px] font-black text-indigo-400">Rs. {p.price.toLocaleString()}</span>
                                    </button>
                                  ))}
                               </div>
                            </div>
                          )}

                          <div className="space-y-2">
                            {tempItems.map((item, idx) => {
                              const product = products.find(p => p.id === item.productId);
                              return (
                                <div key={idx} className="grid grid-cols-12 gap-3 items-center p-4 bg-slate-50 rounded-2xl border border-slate-100 hover:border-indigo-100 transition-all">
                                   <div className="col-span-4 min-w-0">
                                      <p className="text-[11px] font-black text-slate-800 uppercase truncate leading-tight">{product?.name || 'Asset'}</p>
                                      <p className="text-[9px] font-bold text-slate-400 font-mono">{product?.sku}</p>
                                   </div>
                                   <div className="col-span-2">
                                      <label className="block text-[7px] font-black text-slate-400 uppercase mb-1">Qty</label>
                                      <input 
                                        type="number" 
                                        className="w-full px-2 py-1.5 rounded-lg border border-slate-200 font-black font-mono text-[10px] text-center bg-white" 
                                        value={item.quantity} 
                                        onChange={e => handleUpdateItemField(idx, 'quantity', e.target.value)}
                                      />
                                   </div>
                                   <div className="col-span-2">
                                      <label className="block text-[7px] font-black text-slate-400 uppercase mb-1">Price</label>
                                      <input 
                                        type="number" 
                                        className="w-full px-2 py-1.5 rounded-lg border border-slate-200 font-black font-mono text-[10px] text-indigo-600 text-right bg-white" 
                                        value={item.price} 
                                        onChange={e => handleUpdateItemField(idx, 'price', e.target.value)}
                                      />
                                   </div>
                                   <div className="col-span-2">
                                      <label className="block text-[7px] font-black text-slate-400 uppercase mb-1">Disc (Rs.)</label>
                                      <input 
                                        type="number" 
                                        className="w-full px-2 py-1.5 rounded-lg border border-slate-200 font-black font-mono text-[10px] text-emerald-600 text-right bg-white" 
                                        value={item.discount || 0} 
                                        onChange={e => handleUpdateItemField(idx, 'discount', e.target.value)}
                                      />
                                   </div>
                                   <div className="col-span-1 text-right">
                                      <label className="block text-[7px] font-black text-slate-400 uppercase mb-1">Subtotal</label>
                                      <p className="text-[10px] font-black font-mono text-slate-900">{(item.quantity * item.price - (item.discount || 0)).toLocaleString()}</p>
                                   </div>
                                   <div className="col-span-1 flex justify-end">
                                      <button type="button" onClick={() => handleRemoveItemFromManifest(idx)} className="w-8 h-8 rounded-lg bg-rose-50 text-rose-300 hover:text-rose-600 transition-colors flex items-center justify-center">✕</button>
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
                      <button type="submit" className="w-full bg-slate-950 text-white font-black py-4 rounded-xl uppercase text-[10px] tracking-widest shadow-xl hover:bg-black transition-all">Update Commercial Ledger</button>
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
