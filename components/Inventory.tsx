import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Product, Category, Vendor, UserProfile } from '../types';

interface InventoryProps {
  products: Product[];
  categories: Category[];
  vendors: Vendor[];
  userProfile: UserProfile;
  onAddCategory: (name: string) => Category | void;
  onUpsertCategory: (category: Category) => void;
  onDeleteCategory: (id: string) => void;
  onUpsertVendor: (vendor: Vendor) => void;
  onUpsertProduct: (product: Product) => void;
  onBulkUpsertProducts: (products: Product[]) => void;
  onDeleteProduct: (id: string) => void;
}

const Inventory: React.FC<InventoryProps> = ({
  products,
  categories,
  vendors,
  userProfile,
  onAddCategory,
  onUpsertCategory,
  onDeleteCategory,
  onUpsertProduct,
  onBulkUpsertProducts,
  onDeleteProduct
}) => {
  const [filterCategoryId, setFilterCategoryId] = useState<string>('All');
  const [searchTerm, setSearchTerm] = useState('');
  const [categorySearchTerm, setCategorySearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [activeTab, setActiveTab] = useState<'ITEMS' | 'CATEGORIES'>('ITEMS');
  const [saveStatus, setSaveStatus] = useState<'IDLE' | 'SAVING' | 'SUCCESS'>('IDLE');

  const [costValue, setCostValue] = useState<number>(0);
  const [priceValue, setPriceValue] = useState<number>(0);


  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [newCategoryInput, setNewCategoryInput] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [viewingCategory, setViewingCategory] = useState<Category | null>(null);

  const importInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingProduct) {
      setSelectedCategoryId(editingProduct.categoryId || '');
      setCostValue(editingProduct.cost || 0);
      setPriceValue(editingProduct.price || 0);
    } else {
      setCostValue(0);
      setPriceValue(0);
      if (categories.length > 0 && !selectedCategoryId) {
        setSelectedCategoryId(categories[0].id);
      }
    }
  }, [editingProduct, categories]);

  const handleCostChange = (val: number) => {
    setCostValue(val);
  };

  const handlePriceChange = (val: number) => {
    setPriceValue(val);
  };

  const getNextSku = () => {
    const numericSkus = products
      .map(p => parseInt(p.sku))
      .filter(n => !isNaN(n));
    const maxSku = numericSkus.length > 0 ? Math.max(...numericSkus) : 1000;
    return (maxSku + 1).toString();
  };

  const getCategoryName = (id: string) => categories.find(c => c.id === id)?.name || 'Uncategorized';

  const handleDownloadSample = () => {
    const headers = ['Name', 'SKU', 'Cost', 'Price', 'Stock', 'Category', 'Alert Threshold'];
    const sampleRows = [
      ['EXAMPLE ITEM A', '1001', '125.00', '250.00', '100', 'GENERAL', '10'],
      ['EXAMPLE ITEM B', '1002', '50.00', '90.00', '50', 'STATIONERY', '5']
    ];
    const csvContent = [headers.join(','), ...sampleRows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'prasama_inventory_template.csv';
    link.click();
  };

  const handleExportCatalog = () => {
    if (products.length === 0) return alert("Catalog is empty.");
    const headers = ['Name', 'SKU', 'Cost', 'Price', 'Stock', 'Category', 'Alert Threshold'];
    const rows = products.map(p => [
      p.name.replace(/,/g, ''),
      p.sku,
      p.cost,
      p.price,
      p.stock,
      getCategoryName(p.categoryId).replace(/,/g, ''),
      p.lowStockThreshold
    ]);
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `prasama_catalog_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
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

  const filteredCategories = useMemo(() => {
    return categories
      .filter(c => c.name.toLowerCase().includes(categorySearchTerm.toLowerCase()))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [categories, categorySearchTerm]);

  const handleSaveProduct = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaveStatus('SAVING');
    const formData = new FormData(e.currentTarget);
    const finalSku = editingProduct ? editingProduct.sku : getNextSku();


    const bStocks = { ...(editingProduct?.branchStocks || {}) };
    bStocks[userProfile.branch] = parseInt(formData.get('stock') as string) || 0;

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

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSaveStatus('SAVING');
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const content = event.target?.result as string;
        let importedItems: any[] = [];

        if (file.name.endsWith('.json')) {
          importedItems = JSON.parse(content);
        } else if (file.name.endsWith('.csv')) {
          const lines = content.split('\n');
          const headers = lines[0].split(',').map(h => h.trim().toLowerCase());

          importedItems = lines.slice(1).filter(l => l.trim()).map(line => {
            const values = line.split(',').map(v => v.trim());
            const obj: any = {};
            headers.forEach((h, i) => obj[h] = values[i]);
            return obj;
          });
        }

        const currentActiveBranch = userProfile.branch;
        const productsToUpsert: Product[] = importedItems.map((item, idx) => {
          let catId = item.category_id || item.category;
          const foundCat = categories.find(c => c.name.toUpperCase() === String(catId || '').toUpperCase() || c.id === catId);

          if (!foundCat && catId) {
            catId = categories[0]?.id || 'uncategorized';
          } else {
            catId = foundCat?.id || categories[0]?.id || 'uncategorized';
          }

          const existingProduct = products.find(p => p.sku === item.sku);
          const bStocks = existingProduct?.branchStocks ? { ...existingProduct.branchStocks } : {};
          bStocks[currentActiveBranch] = parseFloat(item.stock) || 0;

          return {
            id: existingProduct?.id || `P-IMP-${Date.now()}-${idx}`,
            name: String(item.name || item.item || 'IMPORTED ASSET').toUpperCase(),
            sku: String(item.sku || `SKU-${Date.now()}-${idx}`).toUpperCase(),
            price: parseFloat(item.price || item.selling_price) || 0,
            cost: parseFloat(item.cost || item.unit_cost) || 0,
            branchStocks: bStocks,
            stock: (Object.values(bStocks) as number[]).reduce((a, b) => a + b, 0),
            categoryId: catId,
            vendorId: item.vendor_id || '',
            lowStockThreshold: parseInt(item.alert_threshold || item.threshold) || 5,
            internalNotes: `Imported: ${new Date().toLocaleDateString()}`
          };
        });

        await onBulkUpsertProducts(productsToUpsert);
        setSaveStatus('SUCCESS');
        setTimeout(() => setSaveStatus('IDLE'), 2000);
      } catch (err) {
        console.error("IMPORT_ERROR:", err);
        alert("Manifest Import Failed: Verify file format (CSV/JSON).");
        setSaveStatus('IDLE');
      }
    };
    reader.readAsText(file);
    if (importInputRef.current) importInputRef.current.value = '';
  };

  const handleSaveCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (newCategoryInput.trim()) {
      if (editingCategory) {
        onUpsertCategory({ ...editingCategory, name: newCategoryInput.trim().toUpperCase() });
      } else {
        onAddCategory(newCategoryInput.trim());
      }
      setNewCategoryInput('');
      setIsCategoryModalOpen(false);
      setEditingCategory(null);
    }
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingProduct(null);
    setIsCategoryModalOpen(false);
    setEditingCategory(null);
    setNewCategoryInput('');
    setSaveStatus('IDLE');
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tighter">Inventory Control</h2>
          <div className="flex gap-4 mt-2">
            <button onClick={() => setActiveTab('ITEMS')} className={`text-[10px] font-black uppercase tracking-widest px-6 py-2 rounded-xl border transition-all ${activeTab === 'ITEMS' ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg' : 'text-slate-400 bg-white border-slate-100 hover:border-slate-300'}`}>Product Catalog</button>
            <button onClick={() => setActiveTab('CATEGORIES')} className={`text-[10px] font-black uppercase tracking-widest px-6 py-2 rounded-xl border transition-all ${activeTab === 'CATEGORIES' ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg' : 'text-slate-400 bg-white border-slate-100 hover:border-slate-300'}`}>Category Vault</button>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleDownloadSample}
            className="px-6 py-4 rounded-[1.8rem] border border-slate-200 text-slate-500 font-black uppercase tracking-widest text-[10px] hover:bg-slate-50 transition-all active:scale-95"
          >
            📋 Sample Template
          </button>
          <button
            onClick={handleExportCatalog}
            className="px-6 py-4 rounded-[1.8rem] border border-slate-200 text-slate-500 font-black uppercase tracking-widest text-[10px] hover:bg-slate-50 transition-all active:scale-95"
          >
            📥 Export Catalog
          </button>
          <input type="file" ref={importInputRef} onChange={handleImportFile} accept=".csv,.json" className="hidden" />
          <button
            onClick={() => importInputRef.current?.click()}
            disabled={saveStatus === 'SAVING'}
            className="px-8 py-4 rounded-[1.8rem] border-2 border-indigo-600 text-indigo-600 font-black uppercase tracking-widest text-[11px] hover:bg-indigo-50 transition-all active:scale-95 disabled:opacity-50"
          >
            {saveStatus === 'SAVING' ? 'Processing...' : saveStatus === 'SUCCESS' ? '✓ Imported' : 'Bulk Import'}
          </button>
          <button onClick={() => { setEditingProduct(null); setIsModalOpen(true); }} className="bg-slate-900 text-white px-10 py-4 rounded-[1.8rem] font-black uppercase tracking-widest text-[11px] shadow-2xl hover:bg-black transition-all active:scale-95">
            + Global Asset Intake
          </button>
        </div>
      </header>

      {activeTab === 'ITEMS' ? (
        <>
          <div className="flex flex-col md:flex-row gap-4 items-center bg-white p-6 rounded-[3rem] border border-slate-100 shadow-sm">
            <div className="relative flex-1 w-full">
              <input type="text" placeholder="Search Master Catalog (Name, SKU)..." className="w-full pl-12 pr-6 py-4 rounded-[2rem] border border-slate-200 outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all font-black text-slate-800 uppercase text-xs" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
              <span className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 text-lg">🔍</span>
            </div>
            <select value={filterCategoryId} onChange={(e) => setFilterCategoryId(e.target.value)} className="px-8 py-4 rounded-[2rem] border border-slate-200 text-xs font-black uppercase bg-white cursor-pointer focus:border-indigo-500 transition-all">
              <option value="All">All Categories</option>
              {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
            </select>
          </div>

          <div className="bg-white rounded-[3.5rem] shadow-sm border border-slate-100 overflow-hidden">
            <table className="w-full text-left text-sm border-collapse">
              <thead className="bg-slate-50/50 text-slate-400 uppercase tracking-widest text-[10px] font-black">
                <tr>
                  <th className="px-10 py-6">Identity / SKU</th>
                  <th className="px-10 py-6">Classification</th>
                  <th className="px-10 py-6 text-right">LKR Value</th>
                  <th className="px-10 py-6 text-center">Branch Stock ({userProfile.branch})</th>
                  <th className="px-10 py-6 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredProducts.map(p => (
                  <tr key={p.id} className="hover:bg-indigo-50/30 transition-all group">
                    <td className="px-10 py-4">
                      <p className="font-black text-slate-900 text-[13px] uppercase mb-1 tracking-tight leading-none">{p.name}</p>
                      <p className="font-mono text-[10px] font-black text-indigo-500 tracking-tighter opacity-80">{p.sku}</p>
                    </td>
                    <td className="px-10 py-4">
                      <span className="text-[10px] font-black text-slate-400 uppercase bg-slate-50 px-3 py-1 rounded-lg border border-slate-100">{getCategoryName(p.categoryId)}</span>
                    </td>
                    <td className="px-10 py-4 text-right font-black text-slate-900 font-mono text-[13px]">Rs. {Number(p.price).toLocaleString()}</td>
                    <td className="px-10 py-4 text-center">
                      <div className="flex flex-col items-center">
                        {(() => {
                          const currentBranchStock = p.branchStocks ? (p.branchStocks[userProfile.branch] || 0) : p.stock;
                          const totalStock = p.branchStocks ? (Object.values(p.branchStocks) as number[]).reduce((a, b) => a + b, 0) : p.stock;

                          return (
                            <>
                              <span className={`px-4 py-1.5 rounded-xl text-[11px] font-black tracking-tight ${currentBranchStock <= p.lowStockThreshold ? 'bg-rose-50 text-rose-600 animate-pulse border border-rose-100' : 'bg-slate-50 text-slate-900 border border-slate-100'}`}>
                                {currentBranchStock} <span className="opacity-40 ml-1 text-[9px] uppercase">Units</span>
                              </span>
                              <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-1">Total: {totalStock} Units</p>
                            </>
                          );
                        })()}
                      </div>
                    </td>
                    <td className="px-10 py-4 text-center">
                      <div className="flex justify-center gap-2">
                        <button onClick={() => { setEditingProduct(p); setIsModalOpen(true); }} className="w-9 h-9 rounded-xl bg-white border border-slate-200 flex items-center justify-center hover:text-indigo-600 hover:border-indigo-600 transition-all shadow-sm">✏️</button>
                        <button onClick={() => setIsDeletingId(p.id)} className="w-9 h-9 rounded-xl bg-white border border-slate-200 flex items-center justify-center hover:text-rose-600 hover:border-rose-600 transition-all shadow-sm">🗑️</button>
                      </div>
                    </td>
                  </tr >
                ))}
                {
                  filteredProducts.length === 0 && (
                    <tr><td colSpan={5} className="py-40 text-center opacity-30 text-xs font-black uppercase tracking-[0.4em] italic">No Assets matched search criteria</td></tr>
                  )
                }
              </tbody >
            </table >
          </div >
        </>
      ) : (
        <div className="space-y-8">
          <div className="flex flex-col md:flex-row gap-4 items-center bg-white p-6 rounded-[3rem] border border-slate-100 shadow-sm">
            <div className="relative flex-1 w-full">
              <input type="text" placeholder="Filter Categories by Name..." className="w-full pl-12 pr-6 py-4 rounded-[2rem] border border-slate-200 outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all font-black text-slate-800 uppercase text-xs" value={categorySearchTerm} onChange={(e) => setCategorySearchTerm(e.target.value)} />
              <span className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 text-lg">🔍</span>
            </div>
            <button onClick={() => { setIsCategoryModalOpen(true); }} className="bg-indigo-600 text-white px-8 py-4 rounded-[2rem] font-black uppercase tracking-widest text-[10px] shadow-xl shadow-indigo-100 transition-all active:scale-95">
              + New Category
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredCategories.map(cat => (
              <div
                key={cat.id}
                className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm flex justify-between items-center group hover:border-indigo-500 hover:shadow-2xl hover:shadow-indigo-500/5 transition-all duration-500 cursor-pointer"
                onClick={() => setViewingCategory(cat)}
              >
                <div className="min-w-0 flex-1 pr-4">
                  <h3 className="font-black text-slate-900 uppercase tracking-tighter text-lg leading-none truncate mb-2">{cat.name}</h3>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] opacity-80">
                    {products.filter(p => p.categoryId === cat.id).length} Products Linked
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={(e) => { e.stopPropagation(); setEditingCategory(cat); setNewCategoryInput(cat.name); setIsCategoryModalOpen(true); }} className="w-10 h-10 rounded-[1rem] bg-slate-50 text-slate-300 flex items-center justify-center hover:bg-indigo-600 hover:text-white transition-all shadow-inner border border-slate-100">✏️</button>
                  <button onClick={(e) => { e.stopPropagation(); setIsDeletingId(`CAT-${cat.id}`); }} className="w-10 h-10 rounded-[1rem] bg-slate-50 text-slate-300 flex items-center justify-center hover:bg-rose-600 hover:text-white transition-all shadow-inner border border-slate-100">🗑️</button>
                </div>
              </div>
            ))}

            {filteredCategories.length === 0 && (
              <div className="col-span-full py-40 text-center text-slate-200">
                <div className="text-8xl mb-4 grayscale opacity-10">📂</div>
                <p className="text-xs font-black uppercase tracking-[0.5em]">Category Vault is Empty</p>
              </div>
            )}
          </div>
        </div>
      )
      }

      {/* Product Asset Modal */}
      {
        isModalOpen && (
          <div className="fixed inset-0 z-[100] flex justify-center items-center p-4 bg-slate-950/95 backdrop-blur-xl overflow-y-auto">
            <div className="bg-white rounded-[3.5rem] shadow-2xl w-full max-w-xl overflow-hidden animate-in zoom-in duration-300 my-8">
              <div className="p-10 border-b border-slate-50 flex justify-between items-start bg-slate-50/50">
                <div>
                  <h3 className="font-black text-2xl text-slate-900 uppercase tracking-tighter">
                    {editingProduct ? 'Update Manifest' : 'Global Asset Intake'}
                  </h3>
                  <p className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.4em] mt-2">Enterprise Master Synchronization</p>
                </div>
                <button
                  onClick={closeModal}
                  className="w-12 h-12 flex items-center justify-center rounded-full bg-[#0f172a] text-white hover:bg-rose-600 transition-all text-xl shadow-xl active:scale-90"
                >
                  &times;
                </button>
              </div>

              <form onSubmit={handleSaveProduct} className="p-10 space-y-6">
                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Asset Nomenclature</label>
                    <input name="name" placeholder="E.G. A4 DOUBLE A 80GSM" defaultValue={editingProduct?.name} required className="w-full px-6 py-4 rounded-2xl border border-slate-200 font-black outline-none bg-white text-slate-800 uppercase text-[13px] focus:border-indigo-500 transition-all shadow-sm" />
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Universal SKU (Read-Only)</label>
                      <input name="sku" placeholder={editingProduct ? editingProduct.sku : "SYSTEM ASSIGNED"} defaultValue={editingProduct?.sku} readOnly className="w-full px-6 py-4 rounded-2xl border border-slate-100 font-mono font-black outline-none uppercase text-[12px] bg-slate-50 text-slate-400 cursor-not-allowed" />
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between items-center mb-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Classification</label>
                        <button type="button" onClick={() => setIsCategoryModalOpen(true)} className="text-[9px] font-black text-indigo-600 uppercase tracking-widest hover:underline">+ Manage</button>
                      </div>
                      <select className="w-full px-6 py-4 rounded-2xl border border-slate-200 font-black bg-white outline-none cursor-pointer uppercase text-[12px] focus:border-indigo-500 transition-all" value={selectedCategoryId} onChange={(e) => setSelectedCategoryId(e.target.value)}>
                        <option value="">UNCATEGORIZED</option>
                        {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Unit Cost</label>
                      <input type="number" step="0.01" value={costValue} onChange={e => handleCostChange(parseFloat(e.target.value) || 0)} required className="w-full px-4 py-4 rounded-2xl border border-slate-200 font-black font-mono text-[14px] outline-none text-slate-800 bg-white" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 text-right">Selling Price</label>
                      <input type="number" step="0.01" value={priceValue} onChange={e => handlePriceChange(parseFloat(e.target.value) || 0)} required className="w-full px-4 py-4 rounded-2xl border border-indigo-200 font-black font-mono text-[14px] text-indigo-700 outline-none text-right bg-white" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Initial Stock ({userProfile.branch})</label>
                      <input
                        name="stock"
                        type="number"
                        defaultValue={editingProduct ? (editingProduct.branchStocks ? (editingProduct.branchStocks[userProfile.branch] || 0) : editingProduct.stock) : 0}
                        required
                        className="w-full px-6 py-4 rounded-2xl border border-slate-200 font-black font-mono text-[14px] outline-none bg-white"
                      />
                      {editingProduct && editingProduct.branchStocks && (() => {
                        const total = Object.values(editingProduct.branchStocks).reduce((a, b) => a + Number(b), 0);
                        const current = editingProduct.branchStocks[userProfile.branch] || 0;
                        const others = total - current;
                        if (others > 0) {
                          return (
                            <div className="mt-2 flex items-center justify-between bg-amber-50 p-2 rounded-xl border border-amber-100">
                              <span className="text-[9px] font-bold text-amber-700 uppercase tracking-wide">⚠️ {others} Units in other branches</span>
                              <button
                                type="button"
                                onClick={() => {
                                  if (!confirm("Clear all stock from other branches? This cannot be undone.")) return;
                                  const updatedStocks = { [userProfile.branch]: current };
                                  setEditingProduct({ ...editingProduct, branchStocks: updatedStocks });
                                }}
                                className="text-[9px] font-black bg-white text-amber-600 border border-amber-200 px-2 py-1 rounded-lg hover:bg-amber-100"
                              >
                                Clear Others
                              </button>
                            </div>
                          )
                        }
                        return null;
                      })()}
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Alert Threshold</label>
                      <input name="lowStockThreshold" type="number" defaultValue={editingProduct?.lowStockThreshold || 5} required className="w-full px-6 py-4 rounded-2xl border border-slate-200 font-black font-mono text-[14px] outline-none bg-white" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Primary Vendor</label>
                    <select name="vendorId" className="w-full px-6 py-4 rounded-2xl border border-slate-200 font-black bg-white outline-none cursor-pointer uppercase text-[12px] focus:border-indigo-500" defaultValue={editingProduct?.vendorId}>
                      <option value="">INTERNAL POOL / LOCAL SOURCE</option>
                      {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                    </select>
                  </div>
                </div>

                <div className="pt-8 border-t border-slate-100 flex gap-4">
                  <button type="button" onClick={closeModal} className="flex-1 bg-slate-100 text-slate-900 font-black py-5 rounded-3xl transition-all uppercase tracking-widest text-xs">Discard</button>
                  <button type="submit" disabled={saveStatus !== 'IDLE'} className={`flex-[2] font-black py-5 rounded-3xl shadow-2xl transition-all uppercase tracking-widest text-xs text-white ${saveStatus === 'SUCCESS' ? 'bg-emerald-600' : 'bg-slate-950 hover:bg-black'}`}>
                    {saveStatus === 'SAVING' ? 'Synchronizing Ledger...' : saveStatus === 'SUCCESS' ? '✓ Master Record Committed' : editingProduct ? 'Synchronize Updates' : 'Commit New Asset'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )
      }

      {/* Category Modal - Overlay */}
      {
        isCategoryModalOpen && (
          <div className="fixed inset-0 z-[110] flex justify-center items-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <div className="bg-white rounded-[3.5rem] shadow-2xl w-full max-w-xl overflow-hidden animate-in zoom-in duration-300">
              <div className="p-10 border-b border-slate-50 flex justify-between items-start bg-slate-50/50">
                <div>
                  <h3 className="font-black text-2xl text-slate-900 uppercase tracking-tighter">
                    {editingCategory ? 'Modify Taxonomy' : 'Global Classification'}
                  </h3>
                  <p className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.4em] mt-2">Enterprise Master Synchronization</p>
                </div>
                <button
                  onClick={() => { setIsCategoryModalOpen(false); setEditingCategory(null); setNewCategoryInput(''); }}
                  className="w-12 h-12 flex items-center justify-center rounded-full bg-[#0f172a] text-white hover:bg-rose-600 transition-all text-xl shadow-xl active:scale-90"
                >
                  &times;
                </button>
              </div>
              <form onSubmit={handleSaveCategory} className="p-10 space-y-8">
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Classification Identity</label>
                  <input
                    autoFocus
                    placeholder="E.G. OFFICE STATIONERY"
                    value={newCategoryInput}
                    onChange={(e) => setNewCategoryInput(e.target.value.toUpperCase())}
                    required
                    className="w-full px-8 py-5 rounded-3xl border-2 border-slate-100 font-black outline-none bg-white text-slate-800 uppercase text-[15px] focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/5 transition-all shadow-sm"
                  />
                </div>
                <div className="flex gap-4">
                  <button type="button" onClick={() => { setIsCategoryModalOpen(false); setEditingCategory(null); setNewCategoryInput(''); }} className="flex-1 bg-slate-100 text-slate-900 font-black py-5 rounded-3xl transition-all uppercase tracking-widest text-xs">Cancel</button>
                  <button type="submit" className="flex-[2] bg-[#0f172a] text-white font-black py-5 rounded-3xl shadow-2xl transition-all uppercase tracking-widest text-xs hover:bg-black">
                    {editingCategory ? 'Update Classification' : 'Commit Category'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )
      }

      {/* Viewing Category Modal */}
      {
        viewingCategory && (
          <div className="fixed inset-0 z-[120] flex justify-center items-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <div className="bg-white rounded-[3.5rem] shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in duration-300 flex flex-col max-h-[85vh]">
              <div className="p-10 border-b border-slate-50 flex justify-between items-start bg-slate-50/50 shrink-0">
                <div>
                  <h3 className="font-black text-2xl text-slate-900 uppercase tracking-tighter">
                    {viewingCategory.name}
                  </h3>
                  <p className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.4em] mt-2">Category Content Viewer</p>
                </div>
                <button
                  onClick={() => setViewingCategory(null)}
                  className="w-12 h-12 flex items-center justify-center rounded-full bg-[#0f172a] text-white hover:bg-rose-600 transition-all text-xl shadow-xl active:scale-90"
                >
                  &times;
                </button>
              </div>

              <div className="p-10 overflow-y-auto custom-scrollbar space-y-4">
                {products.filter(p => p.categoryId === viewingCategory.id).length > 0 ? (
                  products.filter(p => p.categoryId === viewingCategory.id).map(p => (
                    <div key={p.id} className="flex justify-between items-center bg-slate-50 p-6 rounded-3xl border border-slate-100 hover:border-indigo-200 transition-all group">
                      <div>
                        <p className="font-black text-slate-900 text-sm uppercase leading-none mb-1">{p.name}</p>
                        <p className="font-mono text-[10px] font-black text-slate-400">{p.sku}</p>
                      </div>
                      <div className="flex items-center gap-6">
                        <div className="text-right">
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Stock</p>
                          <p className="font-mono text-sm font-black text-slate-900">{p.stock}</p>
                        </div>
                        <button
                          onClick={() => {
                            setViewingCategory(null);
                            setEditingProduct(p);
                            setIsModalOpen(true);
                          }}
                          className="px-6 py-3 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-900 hover:text-white transition-all shadow-sm group-hover:bg-indigo-600 group-hover:text-white group-hover:border-indigo-600"
                        >
                          Edit / Move
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-20 opacity-40">
                    <p className="text-xs font-black uppercase tracking-widest">No products in this category</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      }
      {
        isDeletingId && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md">
            <div className="bg-white rounded-[3.5rem] shadow-2xl w-full max-sm p-12 text-center space-y-10 animate-in zoom-in duration-300">
              <div className="w-24 h-24 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center text-4xl mx-auto shadow-inner border border-rose-100">🗑️</div>
              <div>
                <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">Authorize Purge</h3>
                <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-3 leading-relaxed px-6">
                  This will permanently remove the record from the global database. All linked metrics will be recalculated.
                </p>
              </div>
              <div className="flex gap-4">
                <button onClick={() => setIsDeletingId(null)} className="flex-1 py-5 font-black text-slate-400 uppercase tracking-widest text-xs">Cancel</button>
                <button
                  onClick={() => {
                    if (isDeletingId.startsWith('CAT-')) onDeleteCategory(isDeletingId.replace('CAT-', ''));
                    else onDeleteProduct(isDeletingId);
                    setIsDeletingId(null);
                  }}
                  className="flex-[2] bg-rose-600 text-white py-5 rounded-3xl font-black uppercase text-xs tracking-widest shadow-xl shadow-rose-200 hover:bg-rose-700 transition-all active:scale-95"
                >
                  Delete Record
                </button>
              </div>
            </div>
          </div>
        )
      }
    </div >
  );
};

export default Inventory;