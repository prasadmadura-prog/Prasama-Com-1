
import React, { useState, useMemo, useEffect } from 'react';
import { Product, PurchaseOrder, PurchaseOrderItem, POStatus, Vendor, UserProfile, BankAccount, Transaction, Category } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface PurchasesProps {
  products: Product[];
  purchaseOrders: PurchaseOrder[];
  vendors: Vendor[];
  accounts: BankAccount[];
  transactions: Transaction[];
  userProfile: UserProfile;
  categories?: Category[];
  onUpsertPO: (po: PurchaseOrder) => void;
  onReceivePO: (poId: string) => void;
  onUpsertVendor: (vendor: Vendor) => void;
}

const Purchases: React.FC<PurchasesProps> = ({ 
  products = [], 
  purchaseOrders = [], 
  vendors = [], 
  accounts = [],
  transactions = [],
  categories = [],
  userProfile,
  onUpsertPO, 
  onReceivePO,
  onUpsertVendor
}) => {
  const [activeTab, setActiveTab] = useState<'POS' | 'VENDORS' | 'AGING' | 'PERFORMANCE' | 'ANALYTICS'>('POS');
  const [isPOModalOpen, setIsPOModalOpen] = useState(false);
  const [isVendorModalOpen, setIsVendorModalOpen] = useState(false);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null);
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null);
  
  const [vendorId, setVendorId] = useState('');
  const [accountId, setAccountId] = useState('cash');
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'BANK' | 'CARD' | 'CREDIT' | 'CHEQUE'>('BANK');
  const [chequeNumber, setChequeNumber] = useState('');
  const [chequeDate, setChequeDate] = useState(new Date().toISOString().split('T')[0]);
  const [poItems, setPoItems] = useState<PurchaseOrderItem[]>([]);
  
  const [productSearch, setProductSearch] = useState('');
  const [selectedCatId, setSelectedCatId] = useState('All');

  const [vName, setVName] = useState('');
  const [vContact, setVContact] = useState('');
  const [vEmail, setVEmail] = useState('');
  const [vPhone, setVPhone] = useState('');
  const [vAddress, setVAddress] = useState('');

  const [chequePrintPO, setChequePrintPO] = useState<PurchaseOrder | null>(null);
  const [showChequePrompt, setShowChequePrompt] = useState(false);

  const sortedProducts = useMemo(() => {
    return [...products].sort((a, b) => a.name.localeCompare(b.name));
  }, [products]);

  const filteredPickerProducts = useMemo(() => {
    return sortedProducts.filter(p => {
      const matchesSearch = p.name.toLowerCase().includes(productSearch.toLowerCase()) || p.sku.toLowerCase().includes(productSearch.toLowerCase());
      const matchesCat = selectedCatId === 'All' || p.categoryId === selectedCatId;
      return matchesSearch && matchesCat;
    });
  }, [sortedProducts, productSearch, selectedCatId]);

  const totalAmount = useMemo(() => 
    poItems.reduce((sum, item) => sum + (item.quantity * (item.cost || 0)), 0)
  , [poItems]);

  const agingReport = useMemo(() => {
    const report: Record<string, { vendorName: string, balance: number, buckets: number[] }> = {};
    const now = new Date();

    vendors.forEach(v => {
      if (Number(v.totalBalance || 0) > 0) {
        report[v.id] = { vendorName: v.name, balance: Number(v.totalBalance), buckets: [0, 0, 0, 0] };
        
        // Find all credit purchases for this vendor
        const credits = transactions
          .filter(t => t.vendorId === v.id && t.type === 'PURCHASE' && t.paymentMethod === 'CREDIT')
          .sort((a, b) => b.date.localeCompare(a.date));

        let remainingBalance = Number(v.totalBalance);
        
        // Simple FIFO Aging: Distribute current balance across most recent credit purchases
        credits.forEach(c => {
          if (remainingBalance <= 0) return;
          const amountToApply = Math.min(remainingBalance, Number(c.amount));
          const diffDays = Math.floor((now.getTime() - new Date(c.date).getTime()) / (1000 * 3600 * 24));
          
          if (diffDays <= 30) report[v.id].buckets[0] += amountToApply;
          else if (diffDays <= 60) report[v.id].buckets[1] += amountToApply;
          else if (diffDays <= 90) report[v.id].buckets[2] += amountToApply;
          else report[v.id].buckets[3] += amountToApply;

          remainingBalance -= amountToApply;
        });

        // If there's still balance (legacy data), put it in the oldest bucket
        if (remainingBalance > 0) {
          report[v.id].buckets[3] += remainingBalance;
        }
      }
    });

    const list = Object.values(report);
    const summary = [
      { name: '0-30 Days', value: list.reduce((a, b) => a + b.buckets[0], 0), color: '#6366f1' },
      { name: '31-60 Days', value: list.reduce((a, b) => a + b.buckets[1], 0), color: '#f59e0b' },
      { name: '61-90 Days', value: list.reduce((a, b) => a + b.buckets[2], 0), color: '#f97316' },
      { name: '90+ Days', value: list.reduce((a, b) => a + b.buckets[3], 0), color: '#ef4444' },
    ];

    return { list, summary };
  }, [vendors, transactions]);

  const handleAddItemToPO = (product: Product) => {
    const existing = poItems.find(i => i.productId === product.id);
    if (existing) {
      setPoItems(poItems.map(i => i.productId === product.id ? { ...i, quantity: i.quantity + 1 } : i));
    } else {
      setPoItems([{ productId: product.id, quantity: 1, cost: product.cost }, ...poItems]);
    }
  };

  const updatePOItem = (index: number, field: keyof PurchaseOrderItem, value: string | number) => {
    const updated = [...poItems];
    updated[index] = { ...updated[index], [field]: Number(value) };
    setPoItems(updated);
  };

  const removePOItem = (index: number) => setPoItems(poItems.filter((_, i) => i !== index));

  const numberToWords = (num: number): string => {
    if (isNaN(num) || num === 0) return "";
    const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
    const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
    const convert = (n: number): string => {
      if (n < 20) return ones[n];
      if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 !== 0 ? " " + ones[n % 10] : "");
      if (n < 1000) return ones[Math.floor(n / 100)] + " Hundred" + (n % 100 !== 0 ? " and " + convert(n % 100) : "");
      if (n < 1000000) return convert(Math.floor(n / 1000)) + " Thousand" + (n % 1000 !== 0 ? " " + convert(n % 1000) : "");
      if (n < 1000000000) return convert(Math.floor(n / 1000000)) + " Million" + (n % 1000000 !== 0 ? " " + convert(n % 1000000) : "");
      return "Amount too large";
    };
    const mainPart = Math.floor(num);
    const fractionPart = Math.round((num - mainPart) * 100);
    let words = convert(mainPart);
    if (fractionPart > 0) words += " and " + convert(fractionPart) + " Cents";
    return words + " Only";
  };

  const formatDateChars = (dateStr?: string) => {
    if (!dateStr) return Array(8).fill("");
    const parts = dateStr.split("-");
    if (parts.length !== 3) return Array(8).fill("");
    const asEight = parts[2] + parts[1] + parts[0];
    return asEight.split("");
  };

  const handleSavePO = (status: POStatus = 'PENDING') => {
    if (!vendorId || poItems.length === 0) { alert("Supplier and Manifest items required."); return; }
    const poPayload: PurchaseOrder = {
      id: selectedPO?.id || `PO-${Date.now()}`,
      date: selectedPO?.date || new Date().toISOString(),
      vendorId,
      items: poItems,
      status: status,
      totalAmount,
      paymentMethod,
      accountId: (paymentMethod === 'BANK' || paymentMethod === 'CHEQUE' || paymentMethod === 'CARD') ? accountId : 'cash',
      chequeNumber: paymentMethod === 'CHEQUE' ? chequeNumber : undefined,
      chequeDate: paymentMethod === 'CHEQUE' ? chequeDate : undefined,
    };

    onUpsertPO(poPayload);
    closePOModal();

    if (paymentMethod === 'CHEQUE') {
      setChequePrintPO(poPayload);
      setShowChequePrompt(true);
    }
  };

  const handlePrintCheque = (po: PurchaseOrder) => {
    if (!po) return;
    const vendorName = vendors.find(v => v.id === po.vendorId)?.name || "";
    const amountNum = Number(po.totalAmount || 0);
    const amountWords = numberToWords(amountNum);
    const dateStr = po.chequeDate || po.date?.split('T')[0] || new Date().toISOString().split('T')[0];
    const dateChars = formatDateChars(dateStr);
    const formattedAmount = amountNum ? amountNum.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "";

    const html = `<!doctype html>
<html>
<head>
  <style>
    @page { size: landscape; margin: 0; }
    body { margin: 0; padding: 0; font-family: 'Courier New', monospace; }
    .cheque-print-layout { position: relative; width: 210mm; height: 95mm; background: white; color: black; }
    .crossing-line { position: absolute; top: 8mm; left: 15mm; border-top: 2.5pt solid black; border-bottom: 2.5pt solid black; padding: 3px 20px; transform: rotate(-12deg); font-size: 12pt; font-weight: 900; letter-spacing: 2pt; white-space: nowrap; }
    .date-line { position: absolute; top: 8mm; right: 10mm; display: flex; gap: 1mm; }
    .date-char { width: 8mm; text-align: center; font-size: 18pt; display: inline-block; font-weight: 900; }
    .payee-line { position: absolute; top: 28mm; left: 55mm; font-size: 16pt; text-transform: uppercase; font-weight: 900; }
    .words-line { position: absolute; top: 42mm; left: 40mm; width: 150mm; font-size: 12pt; line-height: 2.2; font-style: italic; font-weight: 900; }
    .numeric-line { position: absolute; top: 54mm; right: 12mm; font-size: 20pt; text-align: right; min-width: 50mm; letter-spacing: 0.5pt; font-weight: 900; border: 2px solid black; padding: 5mm; box-sizing: border-box; }
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  </style>
</head>
<body>
  <div class="cheque-print-layout">
    <div class="crossing-line">A/C PAYEE ONLY</div>
    <div class="date-line">${dateChars.map(c => `<span class="date-char">${c}</span>`).join('')}</div>
    <div class="payee-line">${vendorName}</div>
    <div class="words-line">${amountWords}</div>
    <div class="numeric-line">${formattedAmount ? `${formattedAmount}/=` : ''}</div>
  </div>
</body>
</html>`;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 150);
  };

  const openPOModal = (po?: PurchaseOrder) => {
    if (po) {
      setSelectedPO(po);
      setVendorId(po.vendorId);
      setPaymentMethod(po.paymentMethod);
      setAccountId(po.accountId || 'cash');
      setChequeNumber(po.chequeNumber || '');
      setChequeDate(po.chequeDate || new Date().toISOString().split('T')[0]);
      setPoItems(po.items);
    } else {
      setSelectedPO(null);
      setVendorId('');
      setPaymentMethod('BANK');
      setAccountId(accounts.find(a => a.id !== 'cash')?.id || 'cash');
      setChequeNumber('');
      setChequeDate(new Date().toISOString().split('T')[0]);
      setPoItems([]);
    }
    setIsPOModalOpen(true);
  };

  const closePOModal = () => { setIsPOModalOpen(false); setSelectedPO(null); setProductSearch(''); setSelectedCatId('All'); };

  const handleSaveVendor = (e: React.FormEvent) => {
    e.preventDefault();
    if (!vName) return;
    const newVendorId = selectedVendor?.id || `VEN-${Date.now()}`;
    onUpsertVendor({
      id: newVendorId,
      name: vName.toUpperCase(),
      contactPerson: vContact,
      email: vEmail,
      phone: vPhone,
      address: vAddress,
      totalBalance: selectedVendor?.totalBalance || 0
    });
    if (isPOModalOpen) setVendorId(newVendorId);
    closeVendorModal();
  };

  const openVendorModal = (v?: Vendor) => {
    if (v) {
      setSelectedVendor(v); setVName(v.name); setVContact(v.contactPerson); setVEmail(v.email); setVPhone(v.phone); setVAddress(v.address);
    } else {
      setSelectedVendor(null); setVName(''); setVContact(''); setVEmail(''); setVPhone(''); setVAddress('');
    }
    setIsVendorModalOpen(true);
  };

  const closeVendorModal = () => { setIsVendorModalOpen(false); setSelectedVendor(null); };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-black text-slate-900 tracking-tighter uppercase">Supplier Ecosystem</h2>
          <p className="text-slate-500 font-bold uppercase tracking-widest text-[10px]">Accounts Payable & Intake Management</p>
        </div>
        <div className="flex gap-3">
          <div className="bg-slate-100 p-1.5 rounded-[1.2rem] flex shadow-inner border border-slate-200 overflow-x-auto">
            {['POS', 'VENDORS', 'AGING', 'PERFORMANCE', 'ANALYTICS'].map((tab) => (
              <button key={tab} onClick={() => setActiveTab(tab as any)} className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === tab ? 'bg-white text-indigo-600 shadow-sm border border-slate-100' : 'text-slate-400'}`}>{tab}</button>
            ))}
          </div>
          {(activeTab === 'POS' || activeTab === 'VENDORS') && (
            <button onClick={() => activeTab === 'POS' ? openPOModal() : openVendorModal()} className="bg-indigo-600 text-white px-8 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-indigo-600/20 hover:bg-indigo-700 transition-all active:scale-95 whitespace-nowrap">
              + New Entry
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden min-h-[500px] flex flex-col">
        {activeTab === 'POS' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-400">
                <tr>
                  <th className="px-8 py-5 font-black uppercase tracking-widest text-[10px]">PO Reference</th>
                  <th className="px-8 py-5 font-black uppercase tracking-widest text-[10px]">Vendor</th>
                  <th className="px-8 py-5 font-black uppercase tracking-widest text-[10px] text-right">Value (Rs.)</th>
                  <th className="px-8 py-5 font-black uppercase tracking-widest text-[10px]">Method</th>
                  <th className="px-8 py-5 font-black uppercase tracking-widest text-[10px]">Status</th>
                  <th className="px-8 py-5 font-black uppercase tracking-widest text-[10px] text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {(purchaseOrders || []).map(po => (
                  <tr key={po.id} className="hover:bg-slate-50 transition-colors group">
                    <td className="px-8 py-5 font-mono font-black text-indigo-600 underline cursor-pointer" onClick={() => openPOModal(po)}>{po.id}</td>
                    <td className="px-8 py-5 font-bold text-slate-900 uppercase">{vendors.find(v => v.id === po.vendorId)?.name || 'Unknown'}</td>
                    <td className="px-8 py-5 text-right font-black text-slate-900 font-mono">{Number(po.totalAmount || 0).toLocaleString()}</td>
                    <td className="px-8 py-5">
                      <p className="text-[10px] font-black uppercase text-slate-400">{po.paymentMethod}</p>
                    </td>
                    <td className="px-8 py-5">
                      <span className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest ${po.status === 'RECEIVED' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                        {po.status}
                      </span>
                    </td>
                    <td className="px-8 py-5 text-center">
                      <div className="flex items-center justify-center gap-2 flex-wrap">
                        {po.status === 'PENDING' && (
                          <button onClick={() => { setSelectedPO(po); setIsReceiptModalOpen(true); }} className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-emerald-700 shadow-md">Receive</button>
                        )}
                        {po.paymentMethod === 'CHEQUE' && (
                          <button onClick={() => handlePrintCheque(po)} className="px-4 py-2 bg-slate-900 text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-black shadow-md">Print Cheque</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {(!purchaseOrders || purchaseOrders.length === 0) && (
                   <tr>
                     <td colSpan={6} className="px-8 py-20 text-center text-slate-300 font-black uppercase tracking-[0.4em] text-[10px] italic">No Purchase Orders Found</td>
                   </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'VENDORS' && (
          <div className="overflow-x-auto">
             <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-400">
                <tr>
                  <th className="px-8 py-5 font-black uppercase tracking-widest text-[10px]">Supplier Name</th>
                  <th className="px-8 py-5 font-black uppercase tracking-widest text-[10px] text-right">Balance Due</th>
                  <th className="px-8 py-5 text-center font-black uppercase tracking-widest text-[10px]">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {Array.isArray(vendors) && vendors.length > 0 ? vendors.map(v => (
                  <tr key={v.id} className="hover:bg-slate-50 transition-colors font-medium">
                    <td className="px-8 py-5 font-black text-slate-900 uppercase">{v.name}</td>
                    <td className="px-8 py-5 text-right font-black text-slate-900 font-mono">Rs. {Number(v.totalBalance || 0).toLocaleString()}</td>
                    <td className="px-8 py-5 text-center">
                       <button onClick={() => openVendorModal(v)} className="p-2 border border-slate-200 rounded-lg hover:bg-white transition-all shadow-sm">✏️</button>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={3} className="px-8 py-20 text-center text-slate-300 font-black uppercase tracking-[0.4em] text-[10px] italic">No Suppliers Registered</td>
                  </tr>
                )}
              </tbody>
             </table>
          </div>
        )}

        {activeTab === 'AGING' && (
           <div className="p-10 space-y-12">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-10 items-center">
                 <div className="lg:col-span-1 h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                       <BarChart data={agingReport.summary}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 9, fontWeights: 900, fill: '#94a3b8'}} />
                          <YAxis axisLine={false} tickLine={false} tick={{fontSize: 9, fontWeights: 900, fill: '#94a3b8'}} />
                          <Tooltip 
                            contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', fontSize: '10px', fontWeights: 800}} 
                            cursor={{fill: '#f8fafc'}}
                          />
                          <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                             {agingReport.summary.map((entry, index) => (
                               <Cell key={`cell-${index}`} fill={entry.color} />
                             ))}
                          </Bar>
                       </BarChart>
                    </ResponsiveContainer>
                 </div>
                 <div className="lg:col-span-2 grid grid-cols-2 md:grid-cols-4 gap-4">
                    {agingReport.summary.map((item, i) => (
                      <div key={i} className="bg-slate-50 p-6 rounded-3xl border border-slate-100">
                         <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">{item.name}</p>
                         <p className="text-xl font-black font-mono" style={{ color: item.color }}>Rs. {item.value.toLocaleString()}</p>
                      </div>
                    ))}
                 </div>
              </div>

              <div className="bg-slate-50 rounded-[2.5rem] border border-slate-100 overflow-hidden">
                 <table className="w-full text-left text-sm">
                    <thead className="bg-white border-b border-slate-100">
                       <tr className="text-[9px] font-black uppercase text-slate-400">
                          <th className="px-8 py-4">Supplier Portfolio</th>
                          <th className="px-8 py-4 text-center">0-30d</th>
                          <th className="px-8 py-4 text-center">31-60d</th>
                          <th className="px-8 py-4 text-center">61-90d</th>
                          <th className="px-8 py-4 text-center">90d+</th>
                          <th className="px-8 py-4 text-right">Total Payable</th>
                       </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                       {agingReport.list.map((v, i) => (
                         <tr key={i} className="hover:bg-white transition-all">
                            <td className="px-8 py-4 font-black uppercase text-slate-900 text-xs">{v.vendorName}</td>
                            <td className="px-8 py-4 text-center font-mono text-[11px] text-indigo-500 font-bold">{v.buckets[0] > 0 ? v.buckets[0].toLocaleString() : '—'}</td>
                            <td className="px-8 py-4 text-center font-mono text-[11px] text-amber-500 font-bold">{v.buckets[1] > 0 ? v.buckets[1].toLocaleString() : '—'}</td>
                            <td className="px-8 py-4 text-center font-mono text-[11px] text-orange-500 font-bold">{v.buckets[2] > 0 ? v.buckets[2].toLocaleString() : '—'}</td>
                            <td className="px-8 py-4 text-center font-mono text-[11px] text-rose-500 font-bold">{v.buckets[3] > 0 ? v.buckets[3].toLocaleString() : '—'}</td>
                            <td className="px-8 py-4 text-right font-black font-mono text-slate-900">Rs. {v.balance.toLocaleString()}</td>
                         </tr>
                       ))}
                       {agingReport.list.length === 0 && (
                         <tr>
                            <td colSpan={6} className="px-8 py-20 text-center text-slate-300 font-black uppercase tracking-widest text-xs italic">Clear Portfolio - No Outstanding Liabilities</td>
                         </tr>
                       )}
                    </tbody>
                 </table>
              </div>
           </div>
        )}

        {(activeTab === 'PERFORMANCE' || activeTab === 'ANALYTICS') && (
           <div className="flex-1 flex flex-col items-center justify-center py-20 text-slate-400">
              <div className="text-4xl mb-4 grayscale opacity-20">📊</div>
              <p className="text-[10px] font-black uppercase tracking-[0.3em]">Module under development</p>
              <p className="text-[8px] font-bold uppercase tracking-widest mt-1 opacity-50">Extended insights core coming soon</p>
           </div>
        )}
      </div>

      {isPOModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-6xl h-[90vh] overflow-hidden animate-in zoom-in duration-300 flex flex-col">
            <div className="p-10 border-b border-slate-100 bg-slate-50 flex justify-between items-center shrink-0">
              <div>
                <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">Inventory Intake Terminal</h3>
                <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest mt-1">Ref: {selectedPO?.id || 'New Acquisition'}</p>
              </div>
              <button onClick={closePOModal} className="text-slate-300 hover:text-slate-900 text-4xl leading-none transition-colors">&times;</button>
            </div>
            
            <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">
              <div className="w-full lg:w-[450px] bg-slate-50/50 border-r border-slate-100 p-8 flex flex-col gap-6 overflow-hidden">
                <div className="space-y-4">
                  <div className="flex flex-col gap-3">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">Product Lookup & Search</label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
                      <input 
                        className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 bg-white text-xs font-bold outline-none focus:border-indigo-500 shadow-sm"
                        placeholder="SEARCH ITEM FROM LIST..."
                        value={productSearch}
                        onChange={e => setProductSearch(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-3">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">Asset Type (Filter)</label>
                    <select 
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-xs font-black uppercase outline-none focus:border-indigo-500 shadow-sm"
                      value={selectedCatId}
                      onChange={e => setSelectedCatId(e.target.value)}
                    >
                      <option value="All">All Categories</option>
                      {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-1.5">
                   {filteredPickerProducts.length > 0 ? filteredPickerProducts.map(p => (
                     <button 
                       key={p.id} 
                       onClick={() => handleAddItemToPO(p)}
                       className="w-full text-left py-2 px-4 bg-white border border-slate-100 rounded-xl hover:border-indigo-500 hover:shadow-sm transition-all group flex justify-between items-center"
                     >
                       <div className="min-w-0">
                         <p className="text-[11px] font-black text-slate-900 uppercase truncate leading-tight">{p.name}</p>
                         <p className="text-[8px] font-bold text-slate-400 font-mono mt-0.5">{p.sku} | STOCK: {p.stock}</p>
                       </div>
                       <span className="text-lg opacity-0 group-hover:opacity-100 transition-opacity text-indigo-600">⊕</span>
                     </button>
                   )) : (
                     <div className="py-20 text-center opacity-30">
                       <p className="text-xs font-black uppercase tracking-widest">No assets found</p>
                     </div>
                   )}
                </div>
              </div>

              <div className="flex-1 flex flex-col p-10 overflow-hidden">
                <div className="grid grid-cols-2 gap-8 mb-6 shrink-0">
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                       <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">Target Supplier</label>
                       <button onClick={() => openVendorModal()} className="text-[9px] font-black text-indigo-600 uppercase tracking-widest hover:underline">+ New Supplier</button>
                    </div>
                    <select value={vendorId} onChange={e => setVendorId(e.target.value)} className="w-full px-4 py-3 rounded-xl border border-slate-200 font-bold bg-white text-xs outline-none focus:border-indigo-500 uppercase">
                      <option value="" disabled>Select Vendor</option>
                      {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">Settlement Pipeline</label>
                    <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value as any)} className="w-full px-4 py-3 rounded-xl border border-slate-200 font-black bg-white text-[10px] outline-none focus:border-indigo-500 uppercase tracking-widest">
                      <option value="BANK">Bank Transfer</option>
                      <option value="CASH">Cash Drawer</option>
                      <option value="CREDIT">Supplier Credit</option>
                      <option value="CHEQUE">Corporate Cheque</option>
                    </select>
                  </div>
                </div>

                {paymentMethod === 'CHEQUE' && (
                  <div className="grid grid-cols-2 gap-4 mb-4 animate-in slide-in-from-top-2">
                    <div className="space-y-1">
                      <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Cheque No</label>
                      <input 
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 font-black font-mono text-[10px] outline-none"
                        value={chequeNumber}
                        onChange={(e) => setChequeNumber(e.target.value.toUpperCase())}
                        placeholder="CHQ-0000"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Maturity Date</label>
                      <input 
                        type="date"
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 font-bold text-[10px] outline-none"
                        value={chequeDate}
                        onChange={(e) => setChequeDate(e.target.value)}
                      />
                    </div>
                  </div>
                )}

                <div className="flex-1 overflow-y-auto custom-scrollbar pr-4">
                  <div className="space-y-1">
                    {poItems.map((item, idx) => {
                       const product = products.find(p => p.id === item.productId);
                       return (
                        <div key={idx} className="flex gap-4 items-center py-1.5 px-4 bg-slate-50 rounded-xl border border-slate-100 animate-in slide-in-from-right-4 hover:border-indigo-100 transition-all">
                          <div className="flex-1 min-w-0">
                            <p className="text-[10px] font-black text-slate-900 uppercase truncate leading-none mb-1">{product?.name || 'Asset'}</p>
                            <p className="text-[8px] text-slate-400 font-mono font-bold tracking-tight">{product?.sku}</p>
                          </div>
                          <div className="w-16">
                            <input type="number" value={item.quantity} onChange={e => updatePOItem(idx, 'quantity', e.target.value)} className="w-full px-2 py-1 rounded-lg border border-slate-200 font-black font-mono text-[10px] text-center bg-white" placeholder="QTY" />
                          </div>
                          <div className="w-24">
                            <input type="number" value={item.cost} onChange={e => updatePOItem(idx, 'cost', e.target.value)} className="w-full px-2 py-1 rounded-lg border border-slate-200 font-black font-mono text-[10px] text-indigo-600 text-right bg-white" placeholder="COST" />
                          </div>
                          <div className="w-24 text-right">
                             <p className="text-[10px] font-black font-mono">Rs. {(item.quantity * item.cost).toLocaleString()}</p>
                          </div>
                          <button onClick={() => removePOItem(idx)} className="p-1.5 text-rose-300 hover:text-rose-600 transition-colors">✕</button>
                        </div>
                       );
                    })}
                    {poItems.length === 0 && (
                      <div className="py-32 text-center opacity-20">
                         <div className="text-6xl mb-4">🛒</div>
                         <p className="text-xs font-black uppercase tracking-widest italic">Manifest is empty - select assets from list</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="pt-6 mt-6 border-t border-slate-100 flex items-center justify-between shrink-0">
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Manifest Value</p>
                    <p className="text-3xl font-black text-slate-900 font-mono tracking-tighter">Rs. {totalAmount.toLocaleString()}</p>
                  </div>
                  <div className="flex gap-4">
                    <button onClick={() => handleSavePO('DRAFT')} className="px-8 py-3.5 rounded-2xl border-2 border-slate-200 font-black text-slate-400 uppercase tracking-widest text-[10px] hover:bg-slate-50 transition-all">Save Draft</button>
                    <button onClick={() => handleSavePO('PENDING')} className="px-10 py-3.5 rounded-2xl bg-slate-900 text-white font-black uppercase tracking-widest text-[10px] shadow-2xl hover:bg-black transition-all active:scale-95">Commit Intake PO</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {isVendorModalOpen && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
           <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in duration-300">
             <div className="p-10 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
               <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Supplier Registration</h3>
               <button onClick={closeVendorModal} className="text-slate-300 hover:text-slate-900 text-4xl leading-none">&times;</button>
             </div>
             <form onSubmit={handleSaveVendor} className="p-10 space-y-6">
                <input required value={vName} onChange={e => setVName(e.target.value.toUpperCase())} className="w-full px-5 py-4 rounded-2xl border border-slate-200 font-bold uppercase text-sm" placeholder="SUPPLIER LEGAL NAME" />
                <button type="submit" className="w-full bg-indigo-600 text-white font-black py-4 rounded-xl uppercase tracking-widest text-[10px] shadow-lg">Save Profile</button>
             </form>
           </div>
        </div>
      )}

      {isReceiptModalOpen && selectedPO && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-lg p-12 text-center space-y-8">
            <div className="w-20 h-20 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center text-3xl mx-auto border border-emerald-100">📥</div>
            <div>
              <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">Inventory Confirmation</h3>
              <p className="text-slate-500 text-xs font-bold uppercase tracking-widest leading-relaxed px-4 mt-2">Authorizing intake will increment warehouse stocks for {selectedPO.items.length} assets.</p>
            </div>
            <div className="flex gap-4">
              <button onClick={() => setIsReceiptModalOpen(false)} className="flex-1 py-4 font-black text-slate-400 uppercase tracking-widest text-[9px]">Cancel</button>
              <button onClick={() => { onReceivePO(selectedPO.id); setIsReceiptModalOpen(false); if (selectedPO.paymentMethod === 'CHEQUE') { handlePrintCheque(selectedPO); } }} className="flex-[2] bg-emerald-600 text-white font-black py-4 rounded-2xl shadow-xl hover:bg-emerald-700 transition-all active:scale-95 uppercase tracking-widest text-[9px]">Confirm Receipt</button>
            </div>
          </div>
        </div>
      )}

      {showChequePrompt && chequePrintPO && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in duration-300">
            <div className="p-8 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
              <div>
                <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Cheque Ready</h3>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">PO: {chequePrintPO.id}</p>
              </div>
              <button onClick={() => setShowChequePrompt(false)} className="text-slate-300 hover:text-slate-900 text-3xl leading-none">&times;</button>
            </div>
            <div className="p-8 space-y-5">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Payee</p>
                <p className="text-lg font-black text-slate-900">{vendors.find(v => v.id === chequePrintPO.vendorId)?.name || 'Supplier'}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Amount</p>
                  <p className="text-lg font-black text-slate-900">Rs. {Number(chequePrintPO.totalAmount || 0).toLocaleString()}</p>
                </div>
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Cheque Date</p>
                  <p className="text-lg font-black text-slate-900">{(chequePrintPO.chequeDate || chequePrintPO.date?.split('T')[0] || '').trim() || '-'}</p>
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => { handlePrintCheque(chequePrintPO); }} className="flex-1 bg-slate-900 text-white font-black py-3 rounded-xl uppercase tracking-widest text-[11px] shadow-lg hover:bg-black transition-all">Print Now</button>
                <button onClick={() => setShowChequePrompt(false)} className="flex-1 border border-slate-200 text-slate-500 font-black py-3 rounded-xl uppercase tracking-widest text-[11px] hover:bg-slate-50 transition-all">Print Later</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Purchases;
