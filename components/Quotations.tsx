
import React, { useState, useMemo } from 'react';
import { Product, Quotation, QuotationItem, Customer, UserProfile, Category } from '../types';
import { formatDate } from '../utils/dateFormatter';

interface QuotationsProps {
  products: Product[];
  customers: Customer[];
  categories: Category[];
  userProfile: UserProfile;
  quotations: Quotation[];
  onUpsertQuotation: (q: Quotation) => void;
  onDeleteQuotation: (id: string) => void;
  onConvertQuotation: (q: Quotation) => void;
}

const Quotations: React.FC<QuotationsProps> = ({
  products = [],
  customers = [],
  categories = [],
  userProfile,
  quotations = [],
  onUpsertQuotation,
  onDeleteQuotation,
  onConvertQuotation
}) => {
  const [activeTab, setActiveTab] = useState<'LIST' | 'CREATE'>('LIST');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedItems, setSelectedItems] = useState<QuotationItem[]>([]);
  const [targetCustomer, setTargetCustomer] = useState<string>('');
  const [customCustomerName, setCustomCustomerName] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [validDays, setValidDays] = useState<number>(14);

  const filteredProducts = useMemo(() => {
    if (!searchTerm.trim()) return products.slice(0, 10);
    return products.filter(p =>
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.sku.toLowerCase().includes(searchTerm.toLowerCase())
    ).slice(0, 10);
  }, [products, searchTerm]);

  const totalAmount = useMemo(() =>
    selectedItems.reduce((acc, item) => acc + (item.quantity * item.price) - item.discount, 0)
    , [selectedItems]);

  const totalDiscountValue = useMemo(() =>
    selectedItems.reduce((acc, item) => acc + item.discount, 0)
    , [selectedItems]);

  const handleAddItem = (p: Product) => {
    const existing = selectedItems.find(i => i.productId === p.id);
    if (existing) {
      setSelectedItems(selectedItems.map(i =>
        i.productId === p.id ? { ...i, quantity: i.quantity + 1 } : i
      ));
    } else {
      setSelectedItems([...selectedItems, { productId: p.id, quantity: 1, price: p.price, discount: 0 }]);
    }
  };

  const handleUpdateItem = (productId: string, field: keyof QuotationItem, value: number) => {
    setSelectedItems(selectedItems.map(i =>
      i.productId === productId ? { ...i, [field]: value } : i
    ));
  };

  const handleRemoveItem = (productId: string) => {
    setSelectedItems(selectedItems.filter(i => i.productId !== productId));
  };

  const handleEditQuotation = (q: Quotation) => {
    setEditingId(q.id);
    setSelectedItems(q.items);
    setTargetCustomer(q.customerId || '');
    setCustomCustomerName(q.customerName && !q.customerId ? q.customerName : '');
    setNotes(q.notes || '');
    // Calculate valid days roughly
    const diff = new Date(q.validUntil).getTime() - new Date(q.date).getTime();
    setValidDays(Math.ceil(diff / (1000 * 3600 * 24)));
    setActiveTab('CREATE');
  };

  const handleSaveQuotation = (status: 'DRAFT' | 'FINALIZED') => {
    if (selectedItems.length === 0) return alert("Please add items to the quotation.");

    const validUntilDate = new Date();
    validUntilDate.setDate(validUntilDate.getDate() + validDays);

    const newQuotation: Quotation = {
      id: editingId || `QT-${Date.now()}`,
      date: new Date().toISOString(),
      validUntil: validUntilDate.toISOString(),
      ...(targetCustomer && { customerId: targetCustomer }),
      customerName: targetCustomer ? customers.find(c => c.id === targetCustomer)?.name : customCustomerName,
      items: selectedItems,
      totalAmount,
      notes,
      status
    };

    onUpsertQuotation(newQuotation);
    setActiveTab('LIST');
    resetForm();
  };

  const resetForm = () => {
    setSelectedItems([]);
    setTargetCustomer('');
    setCustomCustomerName('');
    setNotes('');
    setEditingId(null);
    setValidDays(14);
  };

  const printQuotation = (q: Quotation) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const logoHtml = userProfile.logo
      ? `<div style="text-align: left; margin-bottom: 20px;">
           <img src="${userProfile.logo}" style="max-height: 80px;" />
         </div>`
      : '';

    const itemsHtml = q.items.map((item, index) => {
      const product = products.find(p => p.id === item.productId);
      const lineTotal = (item.quantity * item.price) - item.discount;
      return `
        <tr>
          <td style="padding: 12px; border-bottom: 1px solid #eee;">${index + 1}</td>
          <td style="padding: 12px; border-bottom: 1px solid #eee;">
            <div style="font-weight: 800; text-transform: uppercase;">${product?.name || 'Item'}</div>
            <div style="font-size: 10px; color: #666;">SKU: ${product?.sku || 'N/A'}</div>
          </td>
          <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: right;">${item.quantity}</td>
          <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: right;">${Number(item.price).toLocaleString()}</td>
          <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: right;">${item.discount > 0 ? `-${item.discount.toLocaleString()}` : '0.00'}</td>
          <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: right; font-weight: 800;">${lineTotal.toLocaleString()}</td>
        </tr>
      `;
    }).join('');

    const grossTotal = q.items.reduce((acc, item) => acc + (item.quantity * item.price), 0);
    const totalDiscount = q.items.reduce((acc, item) => acc + item.discount, 0);

    printWindow.document.write(`
      <html>
        <head>
          <title>QUOTATION - ${q.id}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;800&display=swap');
            body { font-family: 'Plus Jakarta Sans', sans-serif; padding: 40px; color: #1e293b; max-width: 800px; margin: 0 auto; line-height: 1.5; }
            .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; }
            .biz-details { text-align: right; }
            .title { font-size: 32px; font-weight: 800; color: #4f46e5; margin: 0; text-transform: uppercase; letter-spacing: -1px; }
            .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-bottom: 40px; }
            .info-box h4 { margin: 0 0 10px 0; font-size: 10px; font-weight: 800; text-transform: uppercase; color: #94a3b8; letter-spacing: 1px; }
            .info-box p { margin: 0; font-weight: 600; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 40px; }
            th { text-align: left; padding: 12px; background: #f8fafc; font-size: 10px; font-weight: 800; text-transform: uppercase; color: #64748b; }
            .totals { margin-left: auto; width: 300px; }
            .total-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #f1f5f9; font-weight: 700; }
            .grand-total { font-size: 20px; font-weight: 800; border-bottom: 0; color: #4f46e5; margin-top: 5px; padding-top: 15px; border-top: 2px solid #4f46e5; }
            .notes { margin-top: 40px; padding: 20px; background: #f8fafc; border-radius: 12px; font-size: 12px; }
            .footer { margin-top: 60px; text-align: center; font-size: 10px; color: #94a3b8; border-top: 1px solid #f1f5f9; padding-top: 20px; text-transform: uppercase; font-weight: 800; }
            @media print { .no-print { display: none; } }
          </style>
        </head>
        <body onload="window.print();">
          <div class="header">
            <div>
              ${logoHtml}
              <h1 class="title">Quotation</h1>
              <p style="font-size: 14px; font-weight: 600; color: #64748b;">Ref: ${q.id}</p>
            </div>
            <div class="biz-details">
              <p style="font-weight: 800; margin: 0;">${userProfile.name}</p>
              <p style="font-size: 12px; color: #64748b; margin: 4px 0;">${userProfile.branch}</p>
              ${userProfile.phone ? `<p style="font-size: 12px; color: #64748b; margin: 4px 0; font-weight: 800;">Contact: ${userProfile.phone}</p>` : ''}
              <p style="font-size: 12px; color: #64748b; margin: 4px 0;">Date: ${formatDate(q.date)}</p>
              <p style="font-size: 12px; color: #ef4444; margin: 4px 0; font-weight: 800;">Valid Until: ${formatDate(q.validUntil)}</p>
            </div>
          </div>

          <div class="info-grid">
            <div class="info-box">
              <h4>Quotation Prepared For</h4>
              <p>${q.customerName || 'Valued Customer'}</p>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th style="width: 40px;">#</th>
                <th>Description</th>
                <th style="text-align: right;">Qty</th>
                <th style="text-align: right;">Unit Price</th>
                <th style="text-align: right;">Disc.</th>
                <th style="text-align: right;">Total</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>

          <div class="totals">
            <div class="total-row">
              <span>Gross Subtotal</span>
              <span>Rs. ${grossTotal.toLocaleString()}</span>
            </div>
            ${totalDiscount > 0 ? `
            <div class="total-row" style="color: #ef4444;">
              <span>Total Discount</span>
              <span>- Rs. ${totalDiscount.toLocaleString()}</span>
            </div>` : ''}
            <div class="total-row grand-total">
              <span>Amount Payable</span>
              <span>Rs. ${q.totalAmount.toLocaleString()}</span>
            </div>
          </div>

          ${q.notes ? `<div class="notes"><h4>Special Notes:</h4><p>${q.notes}</p></div>` : ''}

          <div class="footer">
            Thank you for considering our proposal. This is a computer generated document.
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div>
          <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tighter">Quotation Management</h2>
          <p className="text-slate-500 font-bold uppercase tracking-widest text-[10px] mt-1">Professional Client Proposals</p>
        </div>
        <div className="flex bg-slate-100 p-1.5 rounded-2xl border border-slate-200 shadow-inner">
          <button onClick={() => { setActiveTab('LIST'); resetForm(); }} className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'LIST' ? 'bg-white text-indigo-600 shadow-sm border border-slate-100' : 'text-slate-400'}`}>Saved Quotes</button>
          <button onClick={() => { setActiveTab('CREATE'); resetForm(); }} className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'CREATE' && !editingId ? 'bg-white text-indigo-600 shadow-sm border border-slate-100' : 'text-slate-400'}`}>+ Generate New</button>
        </div>
      </header>

      {activeTab === 'LIST' ? (
        <div className="bg-white rounded-[3rem] shadow-sm border border-slate-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead className="bg-slate-50 text-slate-400 uppercase tracking-widest text-[9px]">
                <tr>
                  <th className="px-8 py-5">Ref / Date</th>
                  <th className="px-8 py-5">Client</th>
                  <th className="px-8 py-5 text-right">Value</th>
                  <th className="px-8 py-5">Status / Validity</th>
                  <th className="px-8 py-5 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {quotations.map(q => (
                  <tr key={q.id} className="hover:bg-slate-50 transition-all">
                    <td className="px-8 py-5">
                      <p className="font-black text-indigo-600">{q.id}</p>
                      <p className="text-[9px] text-slate-400">{formatDate(q.date)}</p>
                    </td >
                    <td className="px-8 py-5 uppercase font-bold text-slate-800">{q.customerName || 'N/A'}</td>
                    <td className="px-8 py-5 text-right font-black font-mono">Rs. {q.totalAmount.toLocaleString()}</td>
                    <td className="px-8 py-5">
                      <div className="flex flex-col gap-1">
                        <span className={`px-3 py-1 rounded-lg text-[8px] font-black uppercase self-start ${q.status === 'DRAFT' ? 'bg-amber-50 text-amber-600' : 'bg-indigo-50 text-indigo-600'}`}>
                          {q.status || 'FINALIZED'}
                        </span>
                        <span className={`px-3 py-1 rounded-lg text-[8px] font-black uppercase self-start ${new Date(q.validUntil) < new Date() ? 'bg-rose-50 text-rose-500' : 'bg-emerald-50 text-emerald-500'}`}>
                          Val: {formatDate(q.validUntil)}
                        </span >
                      </div >
                    </td >
                    <td className="px-8 py-5 text-center">
                      <div className="flex justify-center gap-3">
                        <button onClick={() => handleEditQuotation(q)} className="p-2 border border-slate-200 rounded-lg hover:bg-white transition-all shadow-sm" title="Edit">✏️</button>
                        <button onClick={() => printQuotation(q)} className="p-2 border border-slate-200 rounded-lg hover:bg-white transition-all shadow-sm" title="Print">🖨️</button>
                        <button onClick={() => {
                          if (confirm("Proceed to convert this quotation into a live Sales Invoice? This will transfer all items to the POS terminal.")) {
                            onConvertQuotation(q);
                          }
                        }} className="p-2 border border-slate-200 rounded-lg hover:bg-indigo-50 text-indigo-600 transition-all shadow-sm" title="Convert to Invoice">⚡</button>
                        <button onClick={() => onDeleteQuotation(q.id)} className="p-2 border border-slate-200 rounded-lg hover:bg-rose-50 text-rose-300 hover:text-rose-600 transition-all">🗑️</button>
                      </div>
                    </td>
                  </tr >
                ))}
                {
                  quotations.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-8 py-20 text-center text-slate-300 italic uppercase tracking-widest text-xs font-black">No proposals found in vault</td>
                    </tr>
                  )
                }
              </tbody >
            </table >
          </div >
        </div >
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 h-[75vh]">
          {/* Item Picker */}
          <div className="lg:col-span-5 bg-white p-8 rounded-[3rem] border border-slate-100 shadow-sm flex flex-col gap-6">
            <div className="space-y-1">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Asset Catalog</h3>
              <div className="relative">
                <span className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
                <input
                  type="text"
                  placeholder="Search Products..."
                  className="w-full pl-14 pr-6 py-4 rounded-2xl border border-slate-200 outline-none bg-slate-50/50 font-bold focus:border-indigo-500"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
              {filteredProducts.map(p => (
                <div key={p.id} className="p-4 rounded-2xl border border-slate-50 hover:border-indigo-100 hover:bg-indigo-50/30 cursor-pointer transition-all flex justify-between items-center group" onClick={() => handleAddItem(p)}>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-black uppercase text-slate-900 truncate">{p.name}</p>
                    <p className="text-[9px] font-mono text-slate-400">{p.sku} | Rs. {p.price.toLocaleString()}</p>
                  </div>
                  <span className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity ml-2 shrink-0">+</span>
                </div>
              ))}
            </div>
          </div>

          {/* Quotation Builder */}
          <div className="lg:col-span-7 bg-white p-10 rounded-[3rem] border border-slate-100 shadow-xl flex flex-col gap-6">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-tighter">Drafting Manifest {editingId && <span className="text-indigo-600 ml-2">(Edit: {editingId})</span>}</h3>
              {editingId && <button onClick={resetForm} className="text-[9px] font-black text-rose-500 uppercase tracking-widest">Discard Changes</button>}
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Linked Client Profile</label>
                <select value={targetCustomer} onChange={e => { setTargetCustomer(e.target.value); if (e.target.value) setCustomCustomerName(''); }} className="w-full px-5 py-3 rounded-xl border border-slate-200 bg-white font-bold text-xs outline-none">
                  <option value="">One-time Customer (Custom Name)</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              {!targetCustomer && (
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Customer Entity Name</label>
                  <input value={customCustomerName} onChange={e => setCustomCustomerName(e.target.value.toUpperCase())} className="w-full px-5 py-3 rounded-xl border border-slate-200 font-bold uppercase text-xs" placeholder="E.G. JOHN DOE" />
                </div>
              )}
              <div className="space-y-2">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Validity (Days)</label>
                <input type="number" value={validDays} onChange={e => setValidDays(parseInt(e.target.value) || 0)} className="w-full px-5 py-3 rounded-xl border border-slate-200 font-bold text-xs" />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto pr-4 space-y-3 custom-scrollbar">
              {selectedItems.map((item, idx) => {
                const product = products.find(p => p.id === item.productId);
                return (
                  <div key={idx} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-center gap-4 group hover:bg-white transition-all">
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-black text-slate-800 uppercase truncate">{product?.name || 'Asset'}</p>
                      <p className="text-[9px] font-mono text-slate-400">{product?.sku}</p>
                    </div>
                    <div className="w-16">
                      <input type="number" value={item.quantity} onChange={e => handleUpdateItem(item.productId, 'quantity', parseInt(e.target.value) || 0)} className="w-full px-2 py-1.5 rounded-lg border border-slate-200 text-center font-black text-[10px]" />
                    </div>
                    <div className="w-24">
                      <input type="number" value={item.price} onChange={e => handleUpdateItem(item.productId, 'price', parseFloat(e.target.value) || 0)} className="w-full px-2 py-1.5 rounded-lg border border-slate-200 text-right font-black text-indigo-600 text-[10px]" />
                    </div>
                    <div className="w-20 text-right">
                      <p className="text-[10px] font-black font-mono">Rs. {(item.quantity * item.price).toLocaleString()}</p>
                    </div>
                    <button onClick={() => handleRemoveItem(item.productId)} className="text-rose-300 hover:text-rose-600 transition-colors">✕</button>
                  </div>
                );
              })}
              {selectedItems.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center opacity-10 py-20">
                  <div className="text-8xl">📝</div>
                  <p className="text-xs font-black uppercase tracking-[0.4em] mt-4 text-center px-10">Select assets from the catalog to build proposal</p>
                </div>
              )}
            </div>

            <div className="pt-6 border-t border-slate-100 flex flex-col md:flex-row items-end justify-between gap-6">
              <div className="space-y-4 flex-1 w-full">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Operational Notes / Terms</label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="w-full p-4 bg-slate-50 rounded-2xl border border-slate-100 outline-none text-[11px] font-medium" placeholder="E.G. Payment terms: 50% Advance..."></textarea>
              </div>
              <div className="text-right space-y-4 shrink-0">
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Proposal Gross Value</p>
                  <p className="text-4xl font-black text-slate-900 tracking-tighter">Rs. {totalAmount.toLocaleString()}</p>
                </div>
                <div className="flex gap-3">
                  <button onClick={() => handleSaveQuotation('DRAFT')} className="px-6 py-4 rounded-2xl border-2 border-slate-200 font-black uppercase tracking-widest text-[9px] hover:bg-slate-50 transition-all text-slate-500">Save as Draft</button>
                  <button onClick={() => handleSaveQuotation('FINALIZED')} className="bg-indigo-600 text-white px-8 py-4 rounded-2xl font-black uppercase tracking-[0.15em] text-[10px] shadow-2xl hover:bg-indigo-700 transition-all active:scale-95">Finalize Proposal</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div >
  );
};

export default Quotations;
