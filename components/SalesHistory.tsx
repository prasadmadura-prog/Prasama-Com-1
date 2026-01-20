
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
  // Helper for consistent Local YYYY-MM-DD
  const getTodayLocal = () => {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };

  const today = getTodayLocal();
  
  // Default to showing the last 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const defaultStart = thirtyDaysAgo.getFullYear() + '-' + String(thirtyDaysAgo.getMonth() + 1).padStart(2, '0') + '-' + String(thirtyDaysAgo.getDate()).padStart(2, '0');

  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(today);
  const [activeTab, setActiveTab] = useState<'ALL' | 'PAID' | 'DUE'>('ALL');
  
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

  // Include Sales and Credit Payments (excludes POS sales)
  const ledgerEntries = useMemo(() => {
    if (!Array.isArray(transactions)) return [];
    return transactions.filter(t => t && (t.type === 'SALE' || t.type === 'CREDIT_PAYMENT' || t.type === 'sale') && t.type !== 'POS_SALE');
  }, [transactions]);

  const filteredEntries = useMemo(() => {
    return ledgerEntries.filter(s => {
      // Robust Case-Insensitive Search
      const txId = (s.id || "").toLowerCase();
      const search = searchTerm.toLowerCase();
      const matchesSearch = txId.includes(search);
      
      // Strict Local Date Range Check
      const txDateStr = typeof s.date === 'string' ? s.date.split('T')[0] : '';
      const matchesRange = (!startDate || txDateStr >= startDate) && (!endDate || txDateStr <= endDate);
      
      const isDue = s.paymentMethod === 'CREDIT';
      const matchesTab = activeTab === 'ALL' || (activeTab === 'PAID' && !isDue) || (activeTab === 'DUE' && isDue);

      return matchesSearch && matchesRange && matchesTab;
    });
  }, [ledgerEntries, searchTerm, startDate, endDate, activeTab]);

  const resetFilters = () => {
    setSearchTerm('');
    setStartDate(defaultStart);
    setEndDate(today);
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

    return { realizedInflow, dueAmount };
  }, [ledgerEntries, startDate, endDate]);

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
          ${(item.discount || 0) > 0 ? `<div style="text-align: right; font-size: 10px; color: #444;">DISC: -${item.discount.toLocaleString()}</div>` : ''}
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
             ${(tx.discount || 0) > 0 ? `
             <div style="display: flex; justify-content: space-between; font-size: 12px; font-weight: 700;">
                <span>SAVINGS:</span>
                <span>-${tx.discount?.toLocaleString()}</span>
             </div>` : ''}
             <div class="total-row">
                <span>NET TOTAL:</span>
                <span>${Number(tx.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
             </div>
             <div style="font-size: 10px; text-align: right; margin-top: 4px; font-weight: 700;">PAID BY: ${tx.paymentMethod}</div>
          </div>
          <div class="footer">THANK YOU FOR YOUR BUSINESS<br/>PRASAMA ERP SOLUTIONS</div>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tighter">Sales History & Audit</h2>
          <p className="text-slate-500 font-bold uppercase tracking-widest text-[10px]">Commercial cycle verification</p>
        </div>
        <div className="flex gap-4">
           <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex gap-10">
              <div className="text-right">
                 <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Realized Inflow (Cash+Bank)</p>
                 <p className="text-xl font-black font-mono text-emerald-600">Rs. {summaryStats.realizedInflow.toLocaleString()}</p>
              </div>
              <div className="text-right border-l border-slate-100 pl-10">
                 <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">New Unsettled Credit</p>
                 <p className="text-xl font-black font-mono text-rose-600">Rs. {summaryStats.dueAmount.toLocaleString()}</p>
              </div>
           </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3 space-y-6">
          <div className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <span className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
              <input 
                type="text" 
                placeholder="Search by Transaction ID..." 
                className="w-full pl-14 pr-6 py-4 rounded-2xl border border-slate-200 outline-none bg-slate-50/50 font-bold text-sm focus:border-indigo-500 transition-all" 
                value={searchTerm} 
                onChange={(e) => setSearchTerm(e.target.value)} 
              />
            </div>
            <div className="flex gap-3">
              <input type="date" className="px-6 py-4 rounded-2xl border border-slate-200 bg-white text-xs font-black outline-none" value={startDate} onChange={e => setStartDate(e.target.value)} />
              <input type="date" className="px-6 py-4 rounded-2xl border border-slate-200 bg-white text-xs font-black outline-none" value={endDate} onChange={e => setEndDate(e.target.value)} />
              <button onClick={resetFilters} className="px-4 py-4 rounded-2xl border border-slate-200 bg-slate-50 text-[10px] font-black uppercase hover:bg-slate-100 transition-all" title="Reset All Filters">↺ Reset</button>
            </div>
          </div>

          <div className="bg-white rounded-[3rem] shadow-sm border border-slate-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead className="bg-slate-50 text-slate-400 uppercase tracking-widest text-[9px]">
                  <tr>
                    <th className="px-8 py-5">Date / ID</th>
                    <th className="px-8 py-5">Customer / Memo</th>
                    <th className="px-8 py-5 text-right">Value (Rs.)</th>
                    <th className="px-8 py-5">Type / Method</th>
                    <th className="px-8 py-5 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {filteredEntries.map(tx => (
                    <tr key={tx.id} className="hover:bg-indigo-50/30 transition-all group">
                      <td className="px-8 py-5">
                        <p className="font-black text-slate-900 uppercase text-[12px] tracking-tight">{new Date(tx.date).toLocaleDateString()}</p>
                        <p className="text-[10px] text-indigo-500 font-mono font-black uppercase mt-0.5">{tx.id}</p>
                      </td>
                      <td className="px-8 py-5">
                        <p className="font-bold text-slate-700 uppercase text-[11px]">{getCustomerName(tx.customerId)}</p>
                        <p className="text-[9px] text-slate-400 font-bold uppercase truncate max-w-[150px]">{tx.description}</p>
                      </td>
                      <td className="px-8 py-5 text-right font-black text-slate-900 font-mono text-[13px]">
                        {Number(tx.amount || 0).toLocaleString()}
                      </td>
                      <td className="px-8 py-5">
                         <div className="flex flex-col gap-1">
                            <span className={`px-2 py-0.5 rounded-lg text-[8px] font-black uppercase tracking-widest self-start ${tx.type?.toUpperCase() === 'SALE' ? 'bg-indigo-50 text-indigo-600' : 'bg-emerald-50 text-emerald-600'}`}>
                                {tx.type}
                            </span>
                            <span className={`px-2 py-0.5 rounded-lg text-[8px] font-black uppercase tracking-widest self-start ${tx.paymentMethod === 'CREDIT' ? 'bg-rose-50 text-rose-600' : 'bg-slate-100 text-slate-600'}`}>
                                {tx.paymentMethod}
                            </span>
                         </div>
                      </td>
                      <td className="px-8 py-5 text-center">
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
