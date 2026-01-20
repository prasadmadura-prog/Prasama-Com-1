
import React, { useState, useMemo, useEffect } from 'react';
import { Product, PurchaseOrder, PurchaseOrderItem, POStatus, Vendor, UserProfile, BankAccount, Transaction, Category } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

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

  const handleSavePO = (status: POStatus = 'PENDING') => {
    if (!vendorId || poItems.length === 0) { alert("Supplier and Manifest items required."); return; }
    onUpsertPO({
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
    });
    closePOModal();
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
    onUpsertVendor({
      id: selectedVendor?.id || `VEN-${Date.now()}`,
      name: vName.toUpperCase(),
      contactPerson: vContact,
      email: vEmail,
      phone: vPhone,
      address: vAddress,
      totalBalance: selectedVendor?.totalBalance || 0
    });
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

      <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
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
                {purchaseOrders.map(po => (
                  <tr key={po.id} className="hover:bg-slate-50 transition-colors group">
                    <td className="px-8 py-5 font-mono font-black text-indigo-600 underline cursor-pointer" onClick={() => openPOModal(po)}>{po.id}</td>
                    <td className="px-8 py-5 font-bold text-slate-900 uppercase">{vendors.find(v => v.id === po.vendorId)?.name || 'Unknown'}</td>
                    <td className="px-8 py-5 text-right font-black text-slate-900 font-mono">{po.totalAmount.toLocaleString()}</td>
                    <td className="px-8 py-5">
                      <p className="text-[10px] font-black uppercase text-slate-400">{po.paymentMethod}</p>
                    </td>
                    <td className="px-8 py-5">
                      <span className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest ${po.status === 'RECEIVED' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                        {po.status}
                      </span>
                    </td>
                    <td className="px-8 py-5 text-center">
                      {po.status === 'PENDING' && (
                        <button onClick={() => { setSelectedPO(po); setIsReceiptModalOpen(true); }} className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-emerald-700 shadow-md">Receive</button>
                      )}
                    </td>
                  </tr>
                ))}
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
                {vendors.map(v => (
                  <tr key={v.id} className="hover:bg-slate-50 transition-colors font-medium">
                    <td className="px-8 py-5 font-black text-slate-900 uppercase">{v.name}</td>
                    <td className="px-8 py-5 text-right font-black text-slate-900 font-mono">{v.totalBalance.toLocaleString()}</td>
                    <td className="px-8 py-5 text-center">
                       <button onClick={() => openVendorModal(v)} className="p-2 border border-slate-200 rounded-lg hover:bg-white transition-all shadow-sm">✏️</button>
                    </td>
                  </tr>
                ))}
              </tbody>
             </table>
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
              {/* Left Side: Product Selector */}
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

              {/* Right Side: PO Manifest Details (REDUCED SPACING MORE) */}
              <div className="flex-1 flex flex-col p-10 overflow-hidden">
                <div className="grid grid-cols-2 gap-8 mb-6 shrink-0">
                  <div className="space-y-2">
                    <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">Target Supplier</label>
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
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
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
              <button onClick={() => { onReceivePO(selectedPO.id); setIsReceiptModalOpen(false); }} className="flex-[2] bg-emerald-600 text-white font-black py-4 rounded-2xl shadow-xl hover:bg-emerald-700 transition-all active:scale-95 uppercase tracking-widest text-[9px]">Confirm Receipt</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Purchases;
