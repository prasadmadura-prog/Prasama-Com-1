import React, { useState, useMemo, useEffect } from 'react';
import { Product, Category, Vendor, UserProfile } from '../types';

interface InventoryProps {
  products: Product[];
  categories: Category[];
  vendors: Vendor[];
  userProfile: UserProfile;
  onAddCategory: (name: string) => Category | void;
  onDeleteCategory: (id: string) => void;
  onUpsertVendor: (vendor: Vendor) => void;
  onUpsertProduct: (product: Product) => void;
  onDeleteProduct: (id: string) => void;
}

const Inventory: React.FC<InventoryProps> = ({ 
  products, 
  categories, 
  vendors, 
  userProfile,
  onAddCategory, 
  onDeleteCategory,
  onUpsertVendor,
  onUpsertProduct,
  onDeleteProduct
}) => {
  const [filterCategoryId, setFilterCategoryId] = useState<string>('All');
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [activeTab, setActiveTab] = useState<'ITEMS' | 'CATEGORIES'>('ITEMS');
  const [saveStatus, setSaveStatus] = useState<'IDLE' | 'SAVING' | 'SUCCESS'>('IDLE');

  // Interactive Pricing State
  const [costValue, setCostValue] = useState<number>(0);
  const [priceValue, setPriceValue] = useState<number>(0);
  const [marginValue, setMarginValue] = useState<number>(0);

  // Quick Category Add State
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCategoryInput, setNewCategoryInput] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');

  useEffect(() => {
    if (editingProduct) {
      setSelectedCategoryId(editingProduct.categoryId || '');
      setCostValue(editingProduct.cost || 0);
      setPriceValue(editingProduct.price || 0);
      const margin = editingProduct.cost > 0 
        ? ((editingProduct.price - editingProduct.cost) / editingProduct.cost) * 100 
        : 0;
      setMarginValue(parseFloat(margin.toFixed(2)));
    } else {
      setCostValue(0);
      setPriceValue(0);
      setMarginValue(0);
      if (categories.length > 0 && !selectedCategoryId) {
        setSelectedCategoryId(categories[0].id);
      }
    }
  }, [editingProduct, categories]);

  const handleCostChange = (val: number) => {
    setCostValue(val);
    const newPrice = val + (val * marginValue) / 100;
    setPriceValue(parseFloat(newPrice.toFixed(2)));
  };

  const handleMarginChange = (val: number) => {
    setMarginValue(val);
    const newPrice = costValue + (costValue * val) / 100;
    setPriceValue(parseFloat(newPrice.toFixed(2)));
  };

  const handlePriceChange = (val: number) => {
    setPriceValue(val);
    if (costValue > 0) {
      const newMargin = ((val - costValue) / costValue) * 100;
      setMarginValue(parseFloat(newMargin.toFixed(2)));
    }
  };

  const getNextSku = () => {
    const numericSkus = products
      .map(p => parseInt(p.sku))
      .filter(n => !isNaN(n));
    const maxSku = numericSkus.length > 0 ? Math.max(...numericSkus) : 1000;
    return (maxSku + 1).toString();
  };

  const filteredProducts = useMemo(() => {
    return products
      .filter(p => {
        const matchesCategory = filterCategoryId === 'All' || p.categoryId === filterCategoryId;
        const matchesSearch = (p.name || "").toLowerCase().includes(searchTerm.toLowerCase()) || 
                             (p.sku || "").toLowerCase().includes(searchTerm.toLowerCase());
        
        return matchesCategory && matchesSearch;
      })
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }, [products, filterCategoryId, searchTerm]);

  const handleSaveProduct = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaveStatus('SAVING');
    const formData = new FormData(e.currentTarget);
    
    const finalSku = editingProduct ? editingProduct.sku : getNextSku();
    const activeBranch = userProfile.branch;

    // Maintain branch stocks
    const bStocks = editingProduct?.branchStocks ? { ...editingProduct.branchStocks } : {};
    bStocks[activeBranch] = parseInt(formData.get('stock') as string) || 0;

    // Fix: Cast Object.values to number[] to resolve 'unknown' type error in reduce
    const productData: Product = {
      id: editingProduct?.id || `P-${Date.now()}`,
      name: (formData.get('name') as string).toUpperCase(),
      sku: finalSku.toUpperCase(),
      categoryId: selectedCategoryId,
      vendorId: formData.get('vendorId') as string || '',
      cost: costValue,
      price: priceValue,
      branchStocks: bStocks,
      stock: (Object.values(bStocks) as number[]).reduce((a, b) => a + b, 0),
      lowStockThreshold: parseInt(formData.get('lowStockThreshold') as string) || 5,
      internalNotes: (formData.get('internalNotes') as string) || '',
    };
    
    try {
      await onUpsertProduct(productData);
      setSaveStatus('SUCCESS');
      setTimeout(() => {
        setIsModalOpen(false);
        setEditingProduct(null);
        setSaveStatus('IDLE');
      }, 800);
    } catch (err) {
      console.error(err);
      setSaveStatus('IDLE');
    }
  };

  const handleQuickAddCategory = () => {
    if (newCategoryInput.trim()) {
      const newCat = onAddCategory(newCategoryInput.trim());
      if (newCat) {
        setSelectedCategoryId(newCat.id);
      }
      setNewCategoryInput('');
      setIsAddingCategory(false);
    }
  };

  const getCategoryName = (id: string) => categories.find(c => c.id === id)?.name || 'Uncategorized';

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingProduct(null);
    setIsAddingCategory(false);
    setSaveStatus('IDLE');
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tighter">Inventory Control</h2>
          <div className="flex gap-4 mt-2">
            <button 
              onClick={() => setActiveTab('ITEMS')}
              className={`text-[10px] font-black uppercase tracking-widest px-4 py-1.5 rounded-lg border transition-all ${activeTab === 'ITEMS' ? 'bg-slate-900 text-white border-slate-900 shadow-md' : 'text-slate-400 border-slate-200 hover:border-slate-300'}`}
            >
              Master Catalog
            </button>
            <button 
              onClick={() => setActiveTab('CATEGORIES')}
              className={`text-[10px] font-black uppercase tracking-widest px-4 py-1.5 rounded-lg border transition-all ${activeTab === 'CATEGORIES' ? 'bg-slate-900 text-white border-slate-900 shadow-md' : 'text-slate-400 border-slate-200 hover:border-slate-300'}`}
            >
              Category Manager
            </button>
          </div>
        </div>
        <button onClick={() => { setEditingProduct(null); setIsModalOpen(true); }} className="bg-indigo-600 text-white px-10 py-4 rounded-2xl font-black uppercase tracking-widest text-[11px] shadow-2xl shadow-indigo-200 hover:bg-indigo-700 transition-all active:scale-95">
          + New Asset Entry
        </button>
      </header>

      {activeTab === 'ITEMS' ? (
        <>
          <div className="flex flex-col md:flex-row gap-4 items-center bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm">
            <div className="relative flex-1 w-full">
              <span className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 text-xl">🔍</span>
              <input 
                type="text" 
                placeholder="Search catalog by SKU or Name..." 
                className="w-full pl-14 pr-6 py-4 rounded-[1.5rem] border border-slate-200 outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all font-bold text-slate-800 bg-slate-50/50"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <select 
              value={filterCategoryId}
              onChange={(e) => setFilterCategoryId(e.target.value)}
              className="flex-1 md:w-64 px-8 py-4 rounded-[1.5rem] border border-slate-200 text-xs font-black uppercase tracking-widest bg-white outline-none cursor-pointer focus:border-indigo-500 transition-all"
            >
              <option value="All">All Categories</option>
              {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
            </select>
          </div>

          <div className="bg-white rounded-[3rem] shadow-sm border border-slate-100 overflow-hidden">
            <table className="w-full text-left text-sm border-collapse">
              <thead className="bg-slate-50 text-slate-400">
                <tr>
                  <th className="px-8 py-3 font-black uppercase tracking-widest text-[10px]">Asset Info</th>
                  <th className="px-8 py-3 font-black uppercase tracking-widest text-[10px]">Category</th>
                  <th className="px-8 py-3 font-black uppercase tracking-widest text-[10px] text-right">Unit Price</th>
                  <th className="px-8 py-3 font-black uppercase tracking-widest text-[10px] text-center">In-Stock ({userProfile.branch})</th>
                  <th className="px-8 py-3 font-black uppercase tracking-widest text-[10px] text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredProducts.map(p => {
                  const bStock = p.branchStocks && p.branchStocks[userProfile.branch] !== undefined ? p.branchStocks[userProfile.branch] : p.stock;
                  return (
                    <tr key={p.id} className="hover:bg-indigo-50/30 transition-all group">
                      <td className="px-8 py-1.5">
                        <p className="font-black text-slate-900 text-[12px] leading-tight uppercase mb-0.5">{p.name}</p>
                        <p className="font-mono text-[9px] font-bold text-indigo-500 tracking-tighter">{p.sku}</p>
                      </td>
                      <td className="px-8 py-1.5">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{getCategoryName(p.categoryId)}</p>
                      </td>
                      <td className="px-8 py-1.5 text-right font-black text-slate-900 font-mono text-[12px]">
                        Rs. {Number(p.price).toLocaleString()}
                      </td>
                      <td className="px-8 py-1.5 text-center">
                        <span className={`px-4 py-1 rounded-lg text-[10px] font-black ${bStock <= p.lowStockThreshold ? 'bg-rose-50 text-rose-600 animate-pulse' : 'text-slate-900'}`}>
                            {bStock} Units
                        </span>
                      </td>
                      <td className="px-8 py-1.5 text-center">
                        <div className="flex justify-center gap-1.5">
                          <button onClick={() => { setEditingProduct(p); setIsModalOpen(true); }} className="p-2 rounded-lg border border-slate-200 hover:bg-white hover:text-indigo-600 hover:border-indigo-200 transition-all shadow-sm text-sm">
                            ✏️
                          </button>
                          <button onClick={() => setIsDeletingId(p.id)} className="p-2 rounded-lg border border-slate-200 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 transition-all shadow-sm text-sm">
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {categories.map(cat => (
            <div key={cat.id} className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm flex justify-between items-center group hover:border-indigo-200 transition-all">
               <div>
                  <h3 className="font-black text-slate-900 uppercase tracking-tight">{cat.name}</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                     {products.filter(p => p.categoryId === cat.id).length} Products Assigned
                  </p>
               </div>
               <button 
                onClick={() => setIsDeletingId(`CAT-${cat.id}`)}
                className="w-10 h-10 rounded-xl bg-slate-50 text-slate-300 flex items-center justify-center hover:bg-rose-50 hover:text-rose-500 transition-all"
               >
                 🗑️
               </button>
            </div>
          ))}
          <div className="bg-slate-50 p-8 rounded-[2.5rem] border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-center space-y-4">
             <span className="text-3xl">📂</span>
             <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Add a new taxonomic group</p>
             <button onClick={() => { setEditingProduct(null); setIsModalOpen(true); setIsAddingCategory(true); }} className="bg-white border border-slate-200 px-6 py-2 rounded-xl text-[10px] font-black uppercase hover:border-indigo-500 transition-all shadow-sm">+ Create Category</button>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {isDeletingId && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
           <div className="bg-white rounded-[3rem] shadow-2xl w-full max-sm p-10 text-center space-y-8 animate-in zoom-in duration-300">
              <div className="w-16 h-16 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center text-3xl mx-auto shadow-inner">🗑️</div>
              <div>
                 <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Confirm Deletion</h3>
                 <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-2 leading-relaxed px-4">
                    Are you sure you want to permanently remove this record?
                 </p>
              </div>
              <div className="flex gap-4">
                 <button onClick={() => setIsDeletingId(null)} className="flex-1 py-4 font-black text-slate-400 uppercase tracking-widest text-[10px] hover:text-slate-600 transition-colors">Cancel</button>
                 <button 
                  onClick={() => {
                    if (isDeletingId.startsWith('CAT-')) onDeleteCategory(isDeletingId.replace('CAT-', ''));
                    else onDeleteProduct(isDeletingId);
                    setIsDeletingId(null);
                  }}
                  className="flex-[2] bg-rose-600 text-white py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl shadow-rose-600/20 hover:bg-rose-700 active:scale-95 transition-all"
                 >
                   Delete Permanently
                 </button>
              </div>
           </div>
        </div>
      )}

      {isModalOpen && (
        <div 
          className="fixed inset-0 z-[100] flex justify-center items-start md:items-center p-4 bg-slate-950/90 backdrop-blur-xl overflow-y-auto cursor-pointer"
          onClick={(e) => { if(e.target === e.currentTarget) closeModal(); }}
        >
          <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in duration-300 my-8 cursor-default">
            <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div>
                <h3 className="font-black text-xl text-slate-900 uppercase tracking-tighter">{editingProduct ? 'Modify Asset' : 'New Inventory Record'}</h3>
                <p className="text-[9px] font-black text-indigo-500 uppercase tracking-[0.3em] mt-1">Global Catalog Synchronization</p>
              </div>
              <button 
                type="button"
                onClick={closeModal} 
                className="w-10 h-10 flex items-center justify-center rounded-full bg-slate-900 text-white hover:bg-rose-600 transition-all text-2xl leading-none shadow-xl active:scale-90"
                aria-label="Close window"
              >
                &times;
              </button>
            </div>
            
            <form onSubmit={handleSaveProduct} className="p-8 space-y-5">
              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">Product / Asset Name</label>
                  <input name="name" placeholder="E.G. ORGANIC HARVEST COFFEE" defaultValue={editingProduct?.name} required className="w-full px-5 py-3 rounded-2xl border border-slate-200 font-bold outline-none bg-slate-50/30 uppercase text-[12px] focus:border-indigo-500 transition-all" />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">SKU / ID</label>
                    <input name="sku" placeholder={editingProduct ? editingProduct.sku : "AUTO-GENERATED"} defaultValue={editingProduct?.sku} readOnly className="w-full px-5 py-3 rounded-2xl border border-slate-200 font-mono font-black outline-none uppercase text-[12px] bg-slate-100/80 text-slate-500 cursor-not-allowed" />
                  </div>
                  
                  <div className="space-y-1">
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Category</label>
                      <button type="button" onClick={() => setIsAddingCategory(!isAddingCategory)} className="text-[8px] font-black text-indigo-600 uppercase">
                        {isAddingCategory ? '× Cancel' : '+ New'}
                      </button>
                    </div>
                    {isAddingCategory ? (
                      <div className="flex gap-1.5">
                        <input autoFocus placeholder="NAME..." className="flex-1 px-3 py-2.5 rounded-xl border border-indigo-100 bg-indigo-50/30 text-[11px] font-black uppercase outline-none focus:border-indigo-500" value={newCategoryInput} onChange={(e) => setNewCategoryInput(e.target.value.toUpperCase())} />
                        <button type="button" onClick={handleQuickAddCategory} className="px-3 bg-indigo-600 text-white rounded-xl font-black uppercase text-[8px]">Add</button>
                      </div>
                    ) : (
                      <select className="w-full px-5 py-3 rounded-2xl border border-slate-200 font-bold bg-white outline-none cursor-pointer uppercase text-[11px] focus:border-indigo-500" value={selectedCategoryId} onChange={(e) => setSelectedCategoryId(e.target.value)}>
                        <option value="">Uncategorized</option>
                        {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                      </select>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">Landing Cost</label>
                    <input type="number" step="0.01" value={costValue} onChange={e => handleCostChange(parseFloat(e.target.value) || 0)} required className="w-full px-4 py-3 rounded-2xl border border-slate-200 font-black font-mono text-[13px] outline-none focus:border-indigo-500" />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">Margin %</label>
                    <input type="number" step="0.1" value={marginValue} onChange={e => handleMarginChange(parseFloat(e.target.value) || 0)} className="w-full px-4 py-3 rounded-2xl border border-indigo-100 bg-indigo-50/30 font-black font-mono text-[13px] text-indigo-600 outline-none focus:border-indigo-500" />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">Retail Price</label>
                    <input type="number" step="0.01" value={priceValue} onChange={e => handlePriceChange(parseFloat(e.target.value) || 0)} required className="w-full px-4 py-3 rounded-2xl border border-indigo-100 font-black font-mono text-[13px] text-indigo-600 outline-none focus:border-indigo-500" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">Stock ({userProfile.branch})</label>
                    <input name="stock" type="number" defaultValue={editingProduct?.branchStocks ? editingProduct.branchStocks[userProfile.branch] : editingProduct?.stock || 0} required className="w-full px-5 py-3 rounded-2xl border border-slate-200 font-black font-mono text-[13px] outline-none focus:border-indigo-500" />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">Alert Level</label>
                    <input name="lowStockThreshold" type="number" defaultValue={editingProduct?.lowStockThreshold || 5} required className="w-full px-5 py-3 rounded-2xl border border-slate-200 font-black font-mono text-[13px] outline-none focus:border-indigo-500" />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">Vendor (Optional)</label>
                  <select name="vendorId" className="w-full px-5 py-3 rounded-2xl border border-slate-200 font-bold bg-white outline-none cursor-pointer uppercase text-[11px] focus:border-indigo-500" defaultValue={editingProduct?.vendorId}>
                    <option value="">Internal Stock / Local Source</option>
                    {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">Staff Notes</label>
                  <textarea name="internalNotes" defaultValue={editingProduct?.internalNotes} className="w-full px-5 py-3 rounded-2xl border border-slate-200 font-bold outline-none bg-slate-50/30 text-[11px] focus:border-indigo-500 h-16" placeholder="OPTIONAL PRIVATE NOTES..." />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-50 flex gap-3">
                <button type="button" onClick={closeModal} className="flex-1 bg-slate-100 text-slate-900 font-black py-4 rounded-[1.5rem] transition-all uppercase tracking-widest text-[9px] border border-slate-200">Discard</button>
                <button type="submit" disabled={saveStatus !== 'IDLE'} className={`flex-[2] font-black py-4 rounded-[1.5rem] shadow-xl transition-all uppercase tracking-widest text-[9px] text-white ${saveStatus === 'SUCCESS' ? 'bg-emerald-600' : 'bg-slate-900 hover:bg-black'}`}>
                  {saveStatus === 'SAVING' ? 'Syncing...' : saveStatus === 'SUCCESS' ? '✓ Cloud Sync' : editingProduct ? 'Commit Changes' : 'Commit Record'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Inventory;