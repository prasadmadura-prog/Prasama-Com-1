
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

  // Quick Category Add State
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCategoryInput, setNewCategoryInput] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');

  useEffect(() => {
    if (editingProduct) {
      setSelectedCategoryId(editingProduct.categoryId || '');
    } else if (categories.length > 0 && !selectedCategoryId) {
      setSelectedCategoryId(categories[0].id);
    }
  }, [editingProduct, categories]);

  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchesCategory = filterCategoryId === 'All' || p.categoryId === filterCategoryId;
      const matchesSearch = (p.name || "").toLowerCase().includes(searchTerm.toLowerCase()) || 
                           (p.sku || "").toLowerCase().includes(searchTerm.toLowerCase());
      
      return matchesCategory && matchesSearch;
    });
  }, [products, filterCategoryId, searchTerm]);

  const handleSaveProduct = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaveStatus('SAVING');
    const formData = new FormData(e.currentTarget);
    
    const productData: Product = {
      id: editingProduct?.id || `P-${Date.now()}`,
      name: (formData.get('name') as string).toUpperCase(),
      sku: (formData.get('sku') as string).toUpperCase(),
      categoryId: selectedCategoryId,
      vendorId: formData.get('vendorId') as string || '',
      cost: parseFloat(formData.get('cost') as string) || 0,
      price: parseFloat(formData.get('price') as string) || 0,
      stock: parseInt(formData.get('stock') as string) || 0,
      lowStockThreshold: parseInt(formData.get('lowStockThreshold') as string) || 5,
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
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-400">
                <tr>
                  <th className="px-8 py-6 font-black uppercase tracking-widest text-[10px]">Asset Info</th>
                  <th className="px-8 py-6 font-black uppercase tracking-widest text-[10px]">Category</th>
                  <th className="px-8 py-6 font-black uppercase tracking-widest text-[10px] text-right">Unit Price</th>
                  <th className="px-8 py-6 font-black uppercase tracking-widest text-[10px] text-center">In-Stock</th>
                  <th className="px-8 py-6 font-black uppercase tracking-widest text-[10px] text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredProducts.map(p => (
                  <tr key={p.id} className="hover:bg-indigo-50/30 transition-all group">
                    <td className="px-8 py-6">
                      <p className="font-black text-slate-900 text-[13px] leading-tight uppercase mb-1">{p.name}</p>
                      <p className="font-mono text-[10px] font-bold text-indigo-500 tracking-tighter">{p.sku}</p>
                    </td>
                    <td className="px-8 py-6">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{getCategoryName(p.categoryId)}</p>
                    </td>
                    <td className="px-8 py-6 text-right font-black text-slate-900 font-mono text-[13px]">
                      Rs. {Number(p.price).toLocaleString()}
                    </td>
                    <td className="px-8 py-6 text-center">
                       <span className={`px-4 py-1.5 rounded-xl text-[10px] font-black ${p.stock <= p.lowStockThreshold ? 'bg-rose-50 text-rose-600 animate-pulse' : 'text-slate-900'}`}>
                          {p.stock} Units
                       </span>
                    </td>
                    <td className="px-8 py-6 text-center">
                      <div className="flex justify-center gap-2">
                        <button onClick={() => { setEditingProduct(p); setIsModalOpen(true); }} className="p-3 rounded-xl border border-slate-200 hover:bg-white hover:text-indigo-600 hover:border-indigo-200 transition-all shadow-sm">
                          ✏️
                        </button>
                        <button onClick={() => setIsDeletingId(p.id)} className="p-3 rounded-xl border border-slate-200 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 transition-all shadow-sm">
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
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
           <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-sm p-10 text-center space-y-8 animate-in zoom-in duration-300">
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
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-xl overflow-y-auto">
          <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in duration-300 my-8">
            <div className="p-10 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div>
                <h3 className="font-black text-2xl text-slate-900 uppercase tracking-tighter">{editingProduct ? 'Modify Asset' : 'New Inventory Record'}</h3>
                <p className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.3em] mt-1">Cloud Synchronization Enabled</p>
              </div>
              <button onClick={() => { setIsModalOpen(false); setEditingProduct(null); setIsAddingCategory(false); }} className="text-slate-300 hover:text-slate-900 text-4xl leading-none">&times;</button>
            </div>
            
            <form onSubmit={handleSaveProduct} className="p-10 space-y-8">
              <div className="grid grid-cols-2 gap-x-6 gap-y-8">
                <div className="col-span-2 space-y-2">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Product / Asset Name</label>
                  <input name="name" placeholder="E.G. ORGANIC HARVEST COFFEE" defaultValue={editingProduct?.name} required className="w-full px-6 py-4 rounded-2xl border border-slate-200 font-bold outline-none bg-slate-50/30 uppercase text-[13px] focus:border-indigo-500 transition-all" />
                </div>
                
                <div className="space-y-2">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">SKU / Unique Identifier</label>
                  <input name="sku" placeholder="E.G. 12345" defaultValue={editingProduct?.sku} required className="w-full px-6 py-4 rounded-2xl border border-slate-200 font-mono font-bold outline-none uppercase text-[13px] focus:border-indigo-500 transition-all" />
                </div>
                
                <div className="space-y-2">
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Asset Category</label>
                    <button 
                      type="button" 
                      onClick={() => setIsAddingCategory(!isAddingCategory)}
                      className="text-[10px] font-black text-indigo-600 uppercase tracking-widest"
                    >
                      {isAddingCategory ? '× Cancel' : '+ New Category'}
                    </button>
                  </div>
                  {isAddingCategory ? (
                    <div className="flex gap-2">
                      <input 
                        autoFocus
                        placeholder="CATEGORY NAME..."
                        className="flex-1 px-4 py-4 rounded-2xl border-2 border-indigo-100 bg-indigo-50/30 text-[12px] font-black uppercase outline-none focus:border-indigo-500"
                        value={newCategoryInput}
                        onChange={(e) => setNewCategoryInput(e.target.value.toUpperCase())}
                      />
                      <button 
                        type="button"
                        onClick={handleQuickAddCategory}
                        className="px-6 py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase text-[10px] shadow-lg"
                      >
                        Add
                      </button>
                    </div>
                  ) : (
                    <select 
                      className="w-full px-6 py-4 rounded-2xl border border-slate-200 font-bold bg-white outline-none cursor-pointer uppercase text-[12px] focus:border-indigo-500 transition-all"
                      value={selectedCategoryId}
                      onChange={(e) => setSelectedCategoryId(e.target.value)}
                    >
                      <option value="">Uncategorized</option>
                      {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                    </select>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Unit Landing Cost</label>
                  <div className="relative">
                    <span className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">Rs.</span>
                    <input name="cost" type="number" step="0.01" defaultValue={editingProduct?.cost} required className="w-full pl-14 pr-6 py-4 rounded-2xl border border-slate-200 font-black font-mono text-[14px] outline-none focus:border-indigo-500 transition-all" />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Sale Retail Price</label>
                  <div className="relative">
                    <span className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">Rs.</span>
                    <input name="price" type="number" step="0.01" defaultValue={editingProduct?.price} required className="w-full pl-14 pr-6 py-4 rounded-2xl border border-indigo-100 font-black font-mono text-[14px] text-indigo-600 outline-none focus:border-indigo-500 transition-all" />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Stock On-Hand</label>
                  <input name="stock" type="number" defaultValue={editingProduct?.stock || 0} required className="w-full px-6 py-4 rounded-2xl border border-slate-200 font-black font-mono text-[14px] outline-none focus:border-indigo-500 transition-all" />
                </div>

                <div className="space-y-2">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Low Stock Alert Level</label>
                  <input name="lowStockThreshold" type="number" defaultValue={editingProduct?.lowStockThreshold || 5} required className="w-full px-6 py-4 rounded-2xl border border-slate-200 font-black font-mono text-[14px] outline-none focus:border-indigo-500 transition-all" />
                </div>

                <div className="col-span-2 space-y-2">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Associated Vendor (Optional)</label>
                  <select name="vendorId" className="w-full px-6 py-4 rounded-2xl border border-slate-200 font-bold bg-white outline-none cursor-pointer uppercase text-[11px] focus:border-indigo-500 transition-all" defaultValue={editingProduct?.vendorId}>
                    <option value="">Internal Stock / Local Source</option>
                    {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                </div>
              </div>

              <div className="pt-6 border-t border-slate-50">
                <button 
                  type="submit" 
                  disabled={saveStatus !== 'IDLE'}
                  className={`w-full font-black py-5 rounded-[2rem] shadow-2xl transition-all uppercase tracking-[0.2em] text-xs flex items-center justify-center gap-3 ${
                    saveStatus === 'SUCCESS' ? 'bg-emerald-600 text-white' : 'bg-slate-900 text-white hover:bg-black'
                  }`}
                >
                  {saveStatus === 'SAVING' ? (
                    <><div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div> Syncing Assets...</>
                  ) : saveStatus === 'SUCCESS' ? (
                    <>✓ Cloud Synchronized</>
                  ) : (
                    editingProduct ? 'Commit Changes' : 'Commit to Cloud Ledger'
                  )}
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
