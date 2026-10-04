import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import JsBarcode from 'jsbarcode';
import { Product, ProductVariant, ProductBatch, Category, Vendor, UserProfile } from '../types';
import { recalculateProductSummary, createNewBatch } from '../utils/batchInventoryUtils';

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
  onLoadMore?: () => void;
  hasMore?: boolean;
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
  onDeleteProduct,
  onLoadMore,
  hasMore = false
}) => {
  const [filterCategoryId, setFilterCategoryId] = useState<string>('All');
  const [searchTerm, setSearchTerm] = useState('');
  const [categorySearchTerm, setCategorySearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [activeTab, setActiveTab] = useState<'ITEMS' | 'CATEGORIES'>('ITEMS');
  const [saveStatus, setSaveStatus] = useState<'IDLE' | 'SAVING' | 'SUCCESS'>('IDLE');
  const [selectedBranch, setSelectedBranch] = useState<string>('ALL CASHIERS');

  // Pagination State - Products
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 20;

  // Pagination State - Categories
  const [currentCategoryPage, setCurrentCategoryPage] = useState(1);

  // Reset page when search or category filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterCategoryId]);

  useEffect(() => {
    setCurrentCategoryPage(1);
  }, [categorySearchTerm]);

  const [costValue, setCostValue] = useState<number>(0);
  const [priceValue, setPriceValue] = useState<number>(0);
  const [skuValue, setSkuValue] = useState('');
  const [imageUrlValue, setImageUrlValue] = useState<string>('');
  const [branchStocksState, setBranchStocksState] = useState<Record<string, number>>({});
  const [selectedStoreForStock, setSelectedStoreForStock] = useState<string>('CASHIER 1');

  // Size Variations & Batch History State
  const [hasSizesState, setHasSizesState] = useState<boolean>(false);
  const [variantsState, setVariantsState] = useState<ProductVariant[]>([]);
  const [batchesState, setBatchesState] = useState<ProductBatch[]>([]);
  const [showBatchHistory, setShowBatchHistory] = useState<boolean>(false);
  const [customSizeInput, setCustomSizeInput] = useState<string>('');

  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [newCategoryInput, setNewCategoryInput] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [viewingCategory, setViewingCategory] = useState<Category | null>(null);

  const importInputRef = useRef<HTMLInputElement>(null);
  const imageFileInputRef = useRef<HTMLInputElement>(null);
  const barcodeCanvasRef = useRef<HTMLCanvasElement>(null);

  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_SIZE = 400;
        let width = img.width;
        let height = img.height;
        if (width > height) {
          if (width > MAX_SIZE) {
            height *= MAX_SIZE / width;
            width = MAX_SIZE;
          }
        } else {
          if (height > MAX_SIZE) {
            width *= MAX_SIZE / height;
            height = MAX_SIZE;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.75);
        setImageUrlValue(dataUrl);
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    if (isModalOpen && skuValue) {
      const timer = setTimeout(() => {
        if (barcodeCanvasRef.current) {
          try {
            const isNumeric = /^\d+$/.test(skuValue);
            const isEAN = skuValue.length === 13 && isNumeric;
            const isUPC = skuValue.length === 12 && isNumeric;
            const format = isEAN ? 'EAN13' : (isUPC ? 'UPC' : 'CODE128');

            let valueToRender = skuValue;
            if (isEAN) {
              valueToRender = skuValue.slice(0, 12);
            } else if (isUPC) {
              valueToRender = skuValue.slice(0, 11);
            }

            JsBarcode(barcodeCanvasRef.current, valueToRender, {
              format: format,
              width: 1.8,
              height: 35,
              displayValue: true,
              fontSize: 12,
              margin: 5,
              background: '#ffffff',
              lineColor: '#000000'
            });
          } catch (err) {
            // Ignore rendering errors
          }
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [skuValue, isModalOpen]);

  useEffect(() => {
    if (editingProduct) {
      setSelectedCategoryId(editingProduct.categoryId || '');
      setCostValue(editingProduct.cost || 0);
      setPriceValue(editingProduct.price || 0);
      setSkuValue(editingProduct.sku);
      setImageUrlValue(editingProduct.imageUrl || '');
      const initialStocks = editingProduct.branchStocks ? { ...editingProduct.branchStocks } : {
        'CASHIER 1': editingProduct.stock || 0,
        'CASHIER 2': 0,
        'CASHIER 3': 0,
        'CASHIER 4': 0
      };
      setBranchStocksState(initialStocks);
      setSelectedStoreForStock('CASHIER 1');
      setHasSizesState(Boolean(editingProduct.hasSizes && Array.isArray(editingProduct.variants) && editingProduct.variants.length > 0));
      setVariantsState(editingProduct.variants ? JSON.parse(JSON.stringify(editingProduct.variants)) : []);
      setBatchesState(editingProduct.batches ? JSON.parse(JSON.stringify(editingProduct.batches)) : []);
      setShowBatchHistory(false);
    } else {
      setCostValue(0);
      setPriceValue(0);
      setImageUrlValue('');
      setBranchStocksState({
        'CASHIER 1': 0,
        'CASHIER 2': 0,
        'CASHIER 3': 0,
        'CASHIER 4': 0
      });
      setSelectedStoreForStock('CASHIER 1');
      setHasSizesState(false);
      setVariantsState([]);
      setBatchesState([]);
      setShowBatchHistory(false);
      if ((categories || []).length > 0 && !selectedCategoryId) {
        setSelectedCategoryId(categories[0]?.id || '');
      }
      if (isModalOpen) {
        setSkuValue(getNextSku());
      }
    }
  }, [editingProduct, categories, isModalOpen]);

  const handleAddPresetSizes = (presetSizes: string[]) => {
    const existingSizes = new Set(variantsState.map(v => (v.size || '').toUpperCase()));
    const newVariants: ProductVariant[] = [...variantsState];

    presetSizes.forEach(size => {
      const upperSize = size.toUpperCase();
      if (!existingSizes.has(upperSize)) {
        newVariants.push({
          id: `var-${Date.now()}-${upperSize.toLowerCase()}-${Math.random().toString(36).substr(2, 4)}`,
          size: upperSize,
          sku: `${skuValue.trim() || 'ITEM'}-${upperSize}`,
          price: priceValue || 0,
          cost: costValue || 0,
          stock: 0,
          branchStocks: { 'CASHIER 1': 0, 'CASHIER 2': 0, 'CASHIER 3': 0, 'CASHIER 4': 0 },
          batches: []
        });
      }
    });

    setVariantsState(newVariants);
  };

  const handleAddCustomSize = () => {
    const trimmed = customSizeInput.trim().toUpperCase();
    if (!trimmed) return;
    const existing = variantsState.find(v => (v.size || '').toUpperCase() === trimmed);
    if (existing) {
      alert(`Size ${trimmed} already exists!`);
      return;
    }
    const newVariant: ProductVariant = {
      id: `var-${Date.now()}-${trimmed.toLowerCase()}-${Math.random().toString(36).substr(2, 4)}`,
      size: trimmed,
      sku: `${skuValue.trim() || 'ITEM'}-${trimmed}`,
      price: priceValue || 0,
      cost: costValue || 0,
      stock: 0,
      branchStocks: { 'CASHIER 1': 0, 'CASHIER 2': 0, 'CASHIER 3': 0, 'CASHIER 4': 0 },
      batches: []
    };
    setVariantsState([...variantsState, newVariant]);
    setCustomSizeInput('');
  };

  const handleUpdateVariant = (varId: string, field: keyof ProductVariant, value: any) => {
    setVariantsState(prev => prev.map(v => {
      if (v.id === varId) {
        return { ...v, [field]: value };
      }
      return v;
    }));
  };

  const handleRemoveVariant = (varId: string) => {
    setVariantsState(prev => prev.filter(v => v.id !== varId));
  };

  const storeOptions = useMemo(() => {
    const defaults = ['CASHIER 1', 'CASHIER 2', 'CASHIER 3', 'CASHIER 4', 'MAIN STORE'];
    const userBranches = userProfile?.allBranches || [];
    const existingKeys = Object.keys(branchStocksState || {});
    const combined = Array.from(new Set([...defaults, ...userBranches, ...existingKeys]));
    return combined.filter(Boolean);
  }, [userProfile?.allBranches, branchStocksState]);

  const handleBranchStockChange = (store: string, qty: number) => {
    setBranchStocksState(prev => ({
      ...prev,
      [store]: qty < 0 ? 0 : qty
    }));
  };

  const handleCostChange = (val: number) => {
    setCostValue(val);
  };

  const handlePriceChange = (val: number) => {
    setPriceValue(val);
  };

  const getNextSku = () => {
    const numericSkus = (products || [])
      .map(p => (p && p.sku ? parseInt(p.sku) : NaN))
      .filter(n => !isNaN(n));
    const maxSku = numericSkus.length > 0 ? Math.max(...numericSkus) : 1000;
    return (maxSku + 1).toString();
  };

  const getCategoryName = (id: string) => (categories || []).find(c => c && c.id === id)?.name || 'Uncategorized';

  const handleDownloadSample = () => {
    const headers = ['Name', 'SKU', 'Cost', 'Price', 'Stock', 'Category', 'Primary Vendor', 'Alert Threshold'];
    const sampleRows = [
      ['EXAMPLE ITEM A', '1001', '125.00', '250.00', '100', 'GENERAL', 'SUPPLIER X', '10'],
      ['EXAMPLE ITEM B', '1002', '50.00', '90.00', '50', 'STATIONERY', 'SUPPLIER Y', '5']
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
    const headers = ['Name', 'SKU', 'Cost', 'Price', 'Global Stock', 'Cashier 1', 'Cashier 2', 'Cashier 3', 'Cashier 4', 'Total Cost Value', 'Total Sales Value', 'Category', 'Primary Vendor', 'Alert Threshold'];
    const rows = products.map(p => {
      const cost = Number(p.cost) || 0;
      const price = Number(p.price) || 0;
      const stock = p.branchStocks ? ['CASHIER 1', 'CASHIER 2', 'CASHIER 3', 'CASHIER 4'].reduce((a, b) => a + (Number(p.branchStocks![b]) || 0), 0) : (Number(p.stock) || 0);
      
      return [
        p.name.replace(/,/g, ''),
        `\t${p.sku}`, // Force text mode for Excel to prevent scientific notation
        cost,
        price,
        stock,
        p.branchStocks?.['CASHIER 1'] || 0,
        p.branchStocks?.['CASHIER 2'] || 0,
        p.branchStocks?.['CASHIER 3'] || 0,
        p.branchStocks?.['CASHIER 4'] || 0,
        (cost * stock).toFixed(2),
        (price * stock).toFixed(2),
        getCategoryName(p.categoryId).replace(/,/g, ''),
        (vendors.find(v => v.id === p.vendorId)?.name || 'INTERNAL').replace(/,/g, ''),
        p.lowStockThreshold
      ];
    });
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob(["\ufeff" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `prasama_catalog_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const filteredProducts = useMemo(() => {
    return (products || [])
      .filter(p => {
        if (!p) return false;
        const matchesCategory = filterCategoryId === 'All' || p.categoryId === filterCategoryId;
        const sTerm = (searchTerm || '').toLowerCase();
        const matchesSearch = (p.name || "").toLowerCase().includes(sTerm) ||
          (p.sku || "").toLowerCase().includes(sTerm);
        
        // Filter by selected cashier's stock (> 0) if a specific cashier is selected
        const branchStock = p.branchStocks ? (Number(p.branchStocks[selectedBranch]) || 0) : (Number(p.stock) || 0);
        const matchesBranch = selectedBranch === 'ALL CASHIERS' || branchStock > 0;

        return matchesCategory && matchesSearch && matchesBranch;
      })
      .sort((a, b) => (a?.name || "").localeCompare(b?.name || ""));
  }, [products, filterCategoryId, searchTerm, selectedBranch]);

  const totalPages = Math.ceil(filteredProducts.length / ITEMS_PER_PAGE);
  const paginatedProducts = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredProducts.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredProducts, currentPage]);

  const filteredCategories = useMemo(() => {
    const sTerm = (categorySearchTerm || '').toLowerCase();
    return (categories || [])
      .filter(c => c && typeof c.name === 'string' && c.name.toLowerCase().includes(sTerm))
      .sort((a, b) => (a?.name || '').localeCompare(b?.name || ''));
  }, [categories, categorySearchTerm]);

  const totalCategoryPages = Math.ceil(filteredCategories.length / ITEMS_PER_PAGE);
  const paginatedCategories = useMemo(() => {
    const start = (currentCategoryPage - 1) * ITEMS_PER_PAGE;
    return filteredCategories.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredCategories, currentCategoryPage]);

  const handleSaveProduct = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaveStatus('SAVING');
    const formData = new FormData(e.currentTarget);
    const finalSku = skuValue.trim() || getNextSku();


    const bStocks: Record<string, number> = { ...branchStocksState };
    ['CASHIER 1', 'CASHIER 2', 'CASHIER 3', 'CASHIER 4'].forEach(b => {
      if (bStocks[b] === undefined) bStocks[b] = 0;
    });

    const totalCalculatedStock = Object.values(bStocks).reduce((a, b) => a + (Number(b) || 0), 0);

    let productData: Product = {
      id: editingProduct?.id || `P-${Date.now()}`,
      name: (formData.get('name') as string).toUpperCase(),
      sku: finalSku.toUpperCase(),
      categoryId: selectedCategoryId,
      vendorId: formData.get('vendorId') as string || '',
      cost: costValue,
      price: priceValue,
      branchStocks: bStocks,
      stock: totalCalculatedStock,
      lowStockThreshold: parseInt(formData.get('lowStockThreshold') as string) || 5,
      internalNotes: (formData.get('internalNotes') as string) || '',
      extraDetails: (formData.get('extraDetails') as string) || '',
      sinhalaName: (formData.get('sinhalaName') as string) || '',
      c4FreeText: (formData.get('c4FreeText') as string) || '',
      c4FreeTextSinhala: (formData.get('c4FreeTextSinhala') as string) || '',
      imageUrl: imageUrlValue.trim() || undefined,
      hasSizes: hasSizesState,
      variants: hasSizesState ? variantsState : undefined,
      batches: batchesState && batchesState.length > 0 ? batchesState : (editingProduct?.batches || []),
      costingMethod: 'FIFO'
    };

    if (hasSizesState && variantsState.length > 0) {
      productData = recalculateProductSummary(productData);
    }

    try {
      await onUpsertProduct(productData);
      setSaveStatus('SUCCESS');
      setTimeout(() => {
        setIsModalOpen(false);
        setEditingProduct(null);
        setSaveStatus('IDLE');
      }, 800);
    } catch (err: any) {
      console.error(err);
      alert("Synchronization Failed: " + (err.message || "Unknown error"));
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
          const foundCat = categories.find(c => c && ((c.name || '').toUpperCase() === String(catId || '').toUpperCase() || c.id === catId));

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
            stock: ['CASHIER 1', 'CASHIER 2', 'CASHIER 3', 'CASHIER 4'].reduce((a, b) => a + (Number(bStocks[b]) || 0), 0),
            categoryId: catId,
            vendorId: vendors.find(v => v && (v.name || '').toUpperCase() === String(item['primary vendor'] || item.vendor || '').toUpperCase())?.id || item.vendor_id || '',
            lowStockThreshold: parseInt(item.alert_threshold || item.threshold) || 5,
            internalNotes: `Imported: ${new Date().toLocaleDateString()}`,
            extraDetails: item.extraDetails || item.extra_details || ''
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
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row gap-4 items-center bg-white p-6 rounded-[3rem] border border-slate-100 shadow-sm">
            <div className="relative flex-1 w-full">
              <input type="text" placeholder="Search Master Catalog (Name, SKU)..." className="w-full pl-12 pr-6 py-4 rounded-[2rem] border border-slate-200 outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all font-black text-slate-800 uppercase text-xs" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
              <span className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 text-lg">🔍</span>
            </div>
            <select value={filterCategoryId} onChange={(e) => setFilterCategoryId(e.target.value)} className="px-8 py-4 rounded-[2rem] border border-slate-200 text-xs font-black uppercase bg-white cursor-pointer focus:border-indigo-500 transition-all">
              <option value="All">All Categories</option>
              {(categories || []).filter(c => c && c.id).map(cat => <option key={cat.id} value={cat.id}>{cat.name || 'Unnamed'}</option>)}
            </select>
            <select value={selectedBranch} onChange={(e) => setSelectedBranch(e.target.value)} className="px-8 py-4 rounded-[2rem] border border-slate-200 text-xs font-black uppercase bg-white cursor-pointer focus:border-indigo-500 transition-all">
              <option value="ALL CASHIERS">ALL CASHIERS</option>
              {(userProfile.allBranches || ['CASHIER 1', 'CASHIER 2', 'CASHIER 3', 'CASHIER 4']).map(branch => (
                <option key={branch} value={branch}>{branch}</option>
              ))}
            </select>
          </div>

          {/* Inventory Valuation Summary Bar */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 animate-in slide-in-from-top-2">
            {(() => {
              const stats = filteredProducts.reduce((acc, p) => {
                const isAll = selectedBranch === 'ALL CASHIERS';
                const gStock = p.branchStocks ? ['CASHIER 1', 'CASHIER 2', 'CASHIER 3', 'CASHIER 4'].reduce((a, b) => a + (Number(p.branchStocks![b]) || 0), 0) : (Number(p.stock) || 0);
                const bStock = isAll ? gStock : (p.branchStocks ? (Number(p.branchStocks[selectedBranch]) || 0) : (Number(p.stock) || 0));

                return {
                  unitsBranch: acc.unitsBranch + bStock,
                  unitsGlobal: acc.unitsGlobal + gStock,
                  valueRetailBranch: acc.valueRetailBranch + (bStock * (Number(p.price) || 0)),
                  valueCostBranch: acc.valueCostBranch + (bStock * (Number(p.cost) || 0)),
                  valueRetailGlobal: acc.valueRetailGlobal + (gStock * (Number(p.price) || 0)),
                  valueCostGlobal: acc.valueCostGlobal + (gStock * (Number(p.cost) || 0))
                };
              }, { unitsBranch: 0, unitsGlobal: 0, valueRetailBranch: 0, valueCostBranch: 0, valueRetailGlobal: 0, valueCostGlobal: 0 });

              return (
                <>
                  <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex flex-col justify-center">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Items Categorized</p>
                    <p className="text-xl font-black text-slate-900 leading-none">{filteredProducts.length} <span className="text-xs text-slate-400">Products</span></p>
                  </div>
                  <div className="bg-indigo-600 p-6 rounded-[2rem] shadow-xl shadow-indigo-100 flex flex-col justify-center text-white">
                    <p className="text-[9px] font-black uppercase tracking-widest mb-1 opacity-70">Filtered Stock ({selectedBranch})</p>
                    <p className="text-xl font-black leading-none">{stats.unitsBranch.toLocaleString()} <span className="text-xs opacity-60">Units</span></p>
                    <p className="text-[8px] font-black uppercase mt-1 opacity-50">Global: {stats.unitsGlobal.toLocaleString()} Units</p>
                  </div>
                  <div className="bg-emerald-600 p-6 rounded-[2rem] shadow-xl shadow-emerald-100 flex flex-col justify-center text-white">
                    <p className="text-[9px] font-black uppercase tracking-widest mb-1 opacity-70">Retail Value ({selectedBranch})</p>
                    <p className="text-xl font-black leading-none">Rs. {Math.round(stats.valueRetailBranch).toLocaleString()}</p>
                    <p className="text-[8px] font-black uppercase mt-1 opacity-50">Global: Rs. {Math.round(stats.valueRetailGlobal).toLocaleString()}</p>
                  </div>
                  <div className="bg-amber-500 p-6 rounded-[2rem] shadow-xl shadow-amber-100 flex flex-col justify-center text-white">
                    <p className="text-[9px] font-black uppercase tracking-widest mb-1 opacity-70">Cost Valuation ({selectedBranch})</p>
                    <p className="text-xl font-black leading-none">Rs. {Math.round(stats.valueCostBranch).toLocaleString()}</p>
                    <p className="text-[8px] font-black uppercase mt-1 opacity-50">Global: Rs. {Math.round(stats.valueCostGlobal).toLocaleString()}</p>
                  </div>
                </>
              );
            })()}
          </div>

          <div className="bg-white rounded-[3.5rem] shadow-sm border border-slate-100 overflow-hidden">
            <table className="w-full text-left text-sm border-collapse">
              <thead className="bg-slate-50/50 text-slate-400 uppercase tracking-widest text-[10px] font-black">
                <tr>
                  <th className="px-10 py-6">Identity / SKU</th>
                  <th className="px-10 py-6">Classification</th>
                  <th className="px-10 py-6 text-right">LKR Value</th>
                  {selectedBranch === 'ALL CASHIERS' ? (
                    <>
                      <th className="px-4 py-6 text-center">Cashier 1</th>
                      <th className="px-4 py-6 text-center">Cashier 2</th>
                      <th className="px-4 py-6 text-center">Cashier 3</th>
                      <th className="px-4 py-6 text-center">Cashier 4</th>
                    </>
                  ) : (
                    <th className="px-8 py-6 text-center">{selectedBranch}</th>
                  )}
                  <th className="px-6 py-6 text-center">Total</th>
                  <th className="px-10 py-6 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {paginatedProducts.map(p => (
                  <tr key={p.id} className="hover:bg-indigo-50/30 transition-all group">
                    <td className="px-10 py-4">
                      <div className="flex items-center gap-3">
                        {p.imageUrl ? (
                          <img src={p.imageUrl} alt={p.name} className="w-10 h-10 object-cover rounded-xl border border-slate-200 shrink-0 bg-white shadow-sm" />
                        ) : (
                          <div className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0 text-slate-400 font-black text-xs">
                            {p.name?.[0] || '📦'}
                          </div>
                        )}
                        <div>
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <p className="font-black text-slate-900 text-[13px] uppercase tracking-tight leading-none">{p.name}</p>
                            {p.hasSizes && p.variants && p.variants.length > 0 && (
                              <span className="px-2 py-0.5 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 font-black text-[8px] uppercase tracking-wider">
                                👕 {p.variants.length} SIZES ({p.variants.map(v => v.size).join(', ')})
                              </span>
                            )}
                            {p.batches && p.batches.length > 1 && (
                              <span className="px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 font-black text-[8px] uppercase tracking-wider">
                                📦 {p.batches.length} BATCHES
                              </span>
                            )}
                          </div>
                          <div className="flex gap-2 items-center">
                            <p className="font-mono text-[10px] font-black text-indigo-500 tracking-tighter opacity-80">{p.sku}</p>
                            {p.internalNotes && <span className="text-[8px] font-black text-rose-400 uppercase tracking-widest pl-2 border-l border-slate-200">Note: {p.internalNotes}</span>}
                            {p.extraDetails && <span className="text-[8px] font-black text-indigo-400 uppercase tracking-widest pl-2 border-l border-slate-200">Extra: {p.extraDetails}</span>}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-10 py-4">
                      <span className="text-[10px] font-black text-slate-400 uppercase bg-slate-50 px-3 py-1 rounded-lg border border-slate-100">{getCategoryName(p.categoryId)}</span>
                    </td>
                    <td className="px-10 py-4 text-right font-black text-slate-900 font-mono text-[13px]">
                      {p.hasSizes && p.variants && p.variants.length > 1 ? (
                        <div>
                          <p className="leading-tight">Rs. {Math.min(...p.variants.map(v => Number(v.price) || 0)).toLocaleString()} - {Math.max(...p.variants.map(v => Number(v.price) || 0)).toLocaleString()}</p>
                          <p className="text-[8px] text-slate-400 font-normal uppercase">Size Prices</p>
                        </div>
                      ) : (
                        `Rs. ${Number(p.price).toLocaleString()}`
                      )}
                    </td>
                    {selectedBranch === 'ALL CASHIERS' ? (
                      <>
                        <td className="px-4 py-4 text-center">
                          <span className={`px-3 py-1 rounded-lg text-[11px] font-black ${((p.branchStocks?.['CASHIER 1'] ?? p.stock) || 0) <= p.lowStockThreshold ? 'bg-rose-50 text-rose-600' : 'bg-slate-50 text-slate-900'}`}>
                            {p.branchStocks?.['CASHIER 1'] ?? p.stock}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-center">
                          <span className={`px-3 py-1 rounded-lg text-[11px] font-black ${(p.branchStocks?.['CASHIER 2'] || 0) <= p.lowStockThreshold ? 'bg-rose-50 text-rose-600' : 'bg-slate-50 text-slate-900'}`}>
                            {p.branchStocks?.['CASHIER 2'] || 0}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-center">
                          <span className={`px-3 py-1 rounded-lg text-[11px] font-black ${(p.branchStocks?.['CASHIER 3'] || 0) <= p.lowStockThreshold ? 'bg-rose-50 text-rose-600' : 'bg-slate-50 text-slate-900'}`}>
                            {p.branchStocks?.['CASHIER 3'] || 0}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-center">
                          <span className={`px-3 py-1 rounded-lg text-[11px] font-black ${(p.branchStocks?.['CASHIER 4'] || 0) <= p.lowStockThreshold ? 'bg-rose-50 text-rose-600' : 'bg-slate-50 text-slate-900'}`}>
                            {p.branchStocks?.['CASHIER 4'] || 0}
                          </span>
                        </td>
                      </>
                    ) : (
                      <td className="px-8 py-4 text-center">
                        <span className={`px-3 py-1 rounded-lg text-[11px] font-black ${(p.branchStocks?.[selectedBranch] || 0) <= p.lowStockThreshold ? 'bg-rose-50 text-rose-600' : 'bg-slate-50 text-slate-900'}`}>
                          {p.branchStocks?.[selectedBranch] || 0}
                        </span>
                      </td>
                    )}
                    <td className="px-6 py-4 text-center">
                      <div className="flex flex-col items-center">
                        {(() => {
                          const totalStock = p.branchStocks ? ['CASHIER 1', 'CASHIER 2', 'CASHIER 3', 'CASHIER 4'].reduce((a, b) => a + (Number(p.branchStocks![b]) || 0), 0) : (p.stock || 0);

                          return (
                            <>
                              <span className={`px-4 py-1.5 rounded-xl text-[11px] font-black tracking-tight ${totalStock <= p.lowStockThreshold ? 'bg-rose-100 text-rose-700 animate-pulse border border-rose-200' : 'bg-indigo-50 text-indigo-700 border border-indigo-100'}`}>
                                {totalStock} <span className="opacity-40 ml-1 text-[9px] uppercase">Units</span>
                              </span>
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
                  paginatedProducts.length === 0 && (
                    <tr><td colSpan={5} className="py-40 text-center opacity-30 text-xs font-black uppercase tracking-[0.4em] italic">No Assets matched search criteria</td></tr>
                  )
                }
              </tbody >
            </table >

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="px-10 py-6 bg-slate-50/50 border-t border-slate-50 flex items-center justify-between">
                <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">
                  Showing Page {currentPage} of {totalPages} ({filteredProducts.length} Records)
                </p>
                <div className="flex gap-2">
                  <button
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    className="px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all bg-white border border-slate-200 text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-50 shadow-sm"
                  >
                    ← Previous
                  </button>
                  <button
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    className="px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all bg-white border border-slate-200 text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-50 shadow-sm"
                  >
                    Next →
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
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
            {paginatedCategories.map(cat => (
              <div
                key={cat.id}
                className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm flex justify-between items-center group hover:border-indigo-500 hover:shadow-2xl hover:shadow-indigo-500/5 transition-all duration-500 cursor-pointer"
                onClick={() => setViewingCategory(cat)}
              >
                <div className="min-w-0 flex-1 pr-4">
                  <h3 className="font-black text-slate-900 uppercase tracking-tighter text-lg leading-none truncate mb-2">{cat.name}</h3>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] opacity-80">
                    {(products || []).filter(p => p && p.categoryId === cat.id).length} Products Linked
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={(e) => { e.stopPropagation(); setEditingCategory(cat); setNewCategoryInput(cat.name); setIsCategoryModalOpen(true); }} className="w-10 h-10 rounded-[1rem] bg-slate-50 text-slate-300 flex items-center justify-center hover:bg-indigo-600 hover:text-white transition-all shadow-inner border border-slate-100">✏️</button>
                  <button onClick={(e) => { e.stopPropagation(); setIsDeletingId(`CAT-${cat.id}`); }} className="w-10 h-10 rounded-[1rem] bg-slate-50 text-slate-300 flex items-center justify-center hover:bg-rose-600 hover:text-white transition-all shadow-inner border border-slate-100">🗑️</button>
                </div>
              </div>
            ))}

            {paginatedCategories.length === 0 && (
              <div className="col-span-full py-40 text-center text-slate-200">
                <div className="text-8xl mb-4 grayscale opacity-10">📂</div>
                <p className="text-xs font-black uppercase tracking-[0.5em]">Category Vault is Empty</p>
              </div>
            )}
          </div>

          {/* Category Pagination Controls */}
          {totalCategoryPages > 1 && (
            <div className="mt-8 px-10 py-6 bg-white rounded-[2rem] border border-slate-100 flex items-center justify-between shadow-sm">
              <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">
                Showing Page {currentCategoryPage} of {totalCategoryPages} ({filteredCategories.length} Categories)
              </p>
              <div className="flex gap-2">
                <button
                  disabled={currentCategoryPage === 1}
                  onClick={() => setCurrentCategoryPage(p => Math.max(1, p - 1))}
                  className="px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all bg-white border border-slate-200 text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-50 shadow-sm"
                >
                  ← Previous
                </button>
                <button
                  disabled={currentCategoryPage === totalCategoryPages}
                  onClick={() => setCurrentCategoryPage(p => Math.min(totalCategoryPages, p + 1))}
                  className="px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all bg-white border border-slate-200 text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-50 shadow-sm"
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </div>
      )
      }

      {/* Product Asset Modal */}
      {
        isModalOpen && (
          <div className="fixed inset-0 z-[100] flex justify-center items-start p-4 bg-slate-950/95 backdrop-blur-xl overflow-y-auto">
            <div className="bg-white rounded-[3.5rem] shadow-2xl w-full max-w-xl overflow-hidden animate-in zoom-in duration-300 my-8">
              <div className="p-10 border-b border-slate-50 flex justify-between items-start bg-slate-50/50">
                <div className="flex-1">
                  <h3 className="font-black text-2xl text-slate-900 uppercase tracking-tighter">
                    {editingProduct ? 'Update Manifest' : 'Global Asset Intake'}
                  </h3>
                  <p className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.4em] mt-2">Enterprise Master Synchronization</p>
                </div>
                <div className="flex items-center gap-6">
                  <button
                    onClick={closeModal}
                    className="w-12 h-12 shrink-0 flex items-center justify-center rounded-full bg-[#0f172a] text-white hover:bg-rose-600 transition-all text-xl shadow-xl active:scale-90"
                  >
                    &times;
                  </button>
                </div>
              </div>

              <form onSubmit={handleSaveProduct} className="p-8 space-y-4">
                <div className="space-y-3">
                  
                  {/* Generated Barcode Display Positioned Above Nomenclature */}
                  <div className="flex justify-center items-center w-full py-1 bg-white rounded-2xl border border-slate-100 border-dashed mb-1 h-20">
                     <canvas ref={barcodeCanvasRef} />
                  </div>

                  {/* Asset Thumbnail / Image Attachment */}
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">
                      📷 Asset Thumbnail / Product Image
                    </label>
                    <div className="flex items-center gap-4">
                      {imageUrlValue ? (
                        <div className="relative group shrink-0">
                          <img
                            src={imageUrlValue}
                            alt="Thumbnail"
                            className="w-16 h-16 object-cover rounded-2xl border-2 border-indigo-500 shadow-md bg-white"
                          />
                          <button
                            type="button"
                            onClick={() => setImageUrlValue('')}
                            className="absolute -top-2 -right-2 bg-rose-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold shadow hover:bg-rose-700"
                            title="Remove Image"
                          >
                            ×
                          </button>
                        </div>
                      ) : (
                        <div className="w-16 h-16 rounded-2xl border-2 border-dashed border-slate-300 flex items-center justify-center bg-white shrink-0 text-slate-300">
                          <span className="text-2xl">🖼️</span>
                        </div>
                      )}

                      <div className="flex-1 space-y-2">
                        <input
                          type="file"
                          ref={imageFileInputRef}
                          onChange={handleImageFileChange}
                          accept="image/*"
                          className="hidden"
                        />
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => imageFileInputRef.current?.click()}
                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[10px] font-black uppercase tracking-wider transition-all shadow-sm flex items-center gap-1.5"
                          >
                            <span>📁</span> Attach Image / Photo
                          </button>
                          {imageUrlValue && (
                            <button
                              type="button"
                              onClick={() => setImageUrlValue('')}
                              className="px-3 py-2 bg-slate-200 hover:bg-rose-100 hover:text-rose-600 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                        <input
                          type="text"
                          placeholder="OR PASTE IMAGE URL..."
                          value={imageUrlValue}
                          onChange={(e) => setImageUrlValue(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 text-[11px] font-mono outline-none bg-white text-slate-700 focus:border-indigo-500 transition-all"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Asset Nomenclature</label>
                    <input name="name" placeholder="E.G. A4 DOUBLE A 80GSM" defaultValue={editingProduct?.name} required className="w-full px-4 py-3 rounded-2xl border border-slate-200 font-black outline-none bg-white text-slate-800 uppercase text-[13px] focus:border-indigo-500 transition-all shadow-sm" />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Universal SKU (Barcode)</label>
                      <input
                        name="sku"
                        value={skuValue}
                        onChange={(e) => setSkuValue(e.target.value.toUpperCase())}
                        placeholder="BARCODE / SKU"
                        className="w-full px-4 py-3 rounded-2xl border border-slate-200 font-mono font-black outline-none uppercase text-[12px] bg-white text-slate-800 focus:border-indigo-500 transition-all shadow-sm"
                      />
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between items-center mb-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Classification</label>
                        <button type="button" onClick={() => setIsCategoryModalOpen(true)} className="text-[9px] font-black text-indigo-600 uppercase tracking-widest hover:underline">+ Manage</button>
                      </div>
                      <select className="w-full px-4 py-3 rounded-2xl border border-slate-200 font-black bg-white outline-none cursor-pointer uppercase text-[12px] focus:border-indigo-500 transition-all" value={selectedCategoryId} onChange={(e) => setSelectedCategoryId(e.target.value)}>
                        <option value="">UNCATEGORIZED</option>
                        {(categories || []).filter(c => c && c.id).map(cat => <option key={cat.id} value={cat.id}>{cat.name || 'Unnamed'}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                        {hasSizesState ? 'Default / Base Cost' : 'Unit Cost'}
                      </label>
                      <input type="number" step="0.01" value={costValue} onChange={e => handleCostChange(parseFloat(e.target.value) || 0)} required className="w-full px-4 py-3 rounded-2xl border border-slate-200 font-black font-mono text-[14px] outline-none text-slate-800 bg-white" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 text-right">
                        {hasSizesState ? 'Default / Base Price' : 'Selling Price'}
                      </label>
                      <input type="number" step="0.01" value={priceValue} onChange={e => handlePriceChange(parseFloat(e.target.value) || 0)} required className="w-full px-4 py-3 rounded-2xl border border-indigo-200 font-black font-mono text-[14px] text-indigo-700 outline-none text-right bg-white" />
                    </div>
                  </div>

                  {/* SIZE VARIATIONS ACCORDION / TOGGLE */}
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">👕</span>
                        <div>
                          <h4 className="text-[11px] font-black uppercase text-slate-900 tracking-wide">
                            Size Variations (S, M, L, XL, etc.)
                          </h4>
                          <p className="text-[8px] font-bold text-slate-400 uppercase">
                            Each size gets its own barcode, stock, purchase cost & selling price
                          </p>
                        </div>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={hasSizesState}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setHasSizesState(checked);
                            if (checked && variantsState.length === 0) {
                              handleAddPresetSizes(['S', 'M', 'L', 'XL']);
                            }
                          }}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                      </label>
                    </div>

                    {hasSizesState && (
                      <div className="space-y-3 pt-2 border-t border-slate-200/60 animate-in fade-in duration-200">
                        {/* Quick Preset Buttons */}
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[8px] font-black uppercase tracking-wider text-slate-400">Add Presets:</span>
                          <button
                            type="button"
                            onClick={() => handleAddPresetSizes(['S', 'M', 'L', 'XL', 'XXL'])}
                            className="px-2.5 py-1 bg-white border border-slate-200 hover:border-indigo-400 rounded-lg text-[9px] font-black uppercase text-slate-700 shadow-sm"
                          >
                            + S - XXL
                          </button>
                          <button
                            type="button"
                            onClick={() => handleAddPresetSizes(['XS', 'S', 'M', 'L', 'XL'])}
                            className="px-2.5 py-1 bg-white border border-slate-200 hover:border-indigo-400 rounded-lg text-[9px] font-black uppercase text-slate-700 shadow-sm"
                          >
                            + XS - XL
                          </button>
                          <button
                            type="button"
                            onClick={() => handleAddPresetSizes(['28', '30', '32', '34', '36', '38'])}
                            className="px-2.5 py-1 bg-white border border-slate-200 hover:border-indigo-400 rounded-lg text-[9px] font-black uppercase text-slate-700 shadow-sm"
                          >
                            + 28 - 38 Waist
                          </button>
                          
                          <div className="flex items-center gap-1 ml-auto">
                            <input
                              type="text"
                              value={customSizeInput}
                              onChange={(e) => setCustomSizeInput(e.target.value.toUpperCase())}
                              placeholder="Custom Size..."
                              className="w-24 px-2 py-1 rounded-lg border border-slate-200 text-[10px] font-bold uppercase outline-none bg-white"
                            />
                            <button
                              type="button"
                              onClick={handleAddCustomSize}
                              className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[9px] font-black uppercase shadow-sm"
                            >
                              + Add
                            </button>
                          </div>
                        </div>

                        {/* Variations Table */}
                        {variantsState.length > 0 ? (
                          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                            <table className="w-full text-left text-xs">
                              <thead className="bg-slate-50 text-[8px] font-black uppercase text-slate-400 tracking-wider">
                                <tr>
                                  <th className="px-2.5 py-2">Size</th>
                                  <th className="px-2 py-2">Barcode (SKU)</th>
                                  <th className="px-2 py-2 text-right">Cost (Rs.)</th>
                                  <th className="px-2 py-2 text-right">Selling (Rs.)</th>
                                  <th className="px-2 py-2 text-center">Stock</th>
                                  <th className="px-2 py-2 text-center"></th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {variantsState.map((v) => (
                                  <tr key={v.id} className="hover:bg-slate-50/50">
                                    <td className="px-2.5 py-2">
                                      <span className="w-7 h-7 rounded-lg bg-slate-900 text-white font-black text-[11px] flex items-center justify-center">
                                        {v.size}
                                      </span>
                                    </td>
                                    <td className="px-2 py-2">
                                      <input
                                        type="text"
                                        value={v.sku}
                                        onChange={(e) => handleUpdateVariant(v.id, 'sku', e.target.value.toUpperCase())}
                                        className="w-full px-2 py-1 rounded border border-slate-200 font-mono text-[10px] font-bold outline-none"
                                      />
                                    </td>
                                    <td className="px-2 py-2 text-right">
                                      <input
                                        type="number"
                                        step="0.01"
                                        value={v.cost}
                                        onChange={(e) => handleUpdateVariant(v.id, 'cost', parseFloat(e.target.value) || 0)}
                                        className="w-20 px-2 py-1 rounded border border-slate-200 font-mono text-[10px] font-bold text-right outline-none"
                                      />
                                    </td>
                                    <td className="px-2 py-2 text-right">
                                      <input
                                        type="number"
                                        step="0.01"
                                        value={v.price}
                                        onChange={(e) => handleUpdateVariant(v.id, 'price', parseFloat(e.target.value) || 0)}
                                        className="w-20 px-2 py-1 rounded border border-indigo-200 font-mono text-[10px] font-bold text-indigo-700 text-right outline-none"
                                      />
                                    </td>
                                    <td className="px-2 py-2 text-center">
                                      <input
                                        type="number"
                                        min="0"
                                        value={v.stock}
                                        onChange={(e) => {
                                          const newStock = parseInt(e.target.value) || 0;
                                          handleUpdateVariant(v.id, 'stock', newStock);
                                          const bStocks = { ...(v.branchStocks || {}) };
                                          bStocks['CASHIER 1'] = newStock;
                                          handleUpdateVariant(v.id, 'branchStocks', bStocks);
                                        }}
                                        className="w-14 px-1.5 py-1 rounded border border-slate-200 font-mono text-[10px] font-bold text-center outline-none"
                                      />
                                    </td>
                                    <td className="px-2 py-2 text-center">
                                      <button
                                        type="button"
                                        onClick={() => handleRemoveVariant(v.id)}
                                        className="text-rose-500 hover:text-rose-700 font-black text-sm"
                                        title="Remove size"
                                      >
                                        &times;
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <div className="py-4 text-center text-[10px] font-bold text-slate-400 bg-white rounded-xl border border-dashed border-slate-200">
                            No sizes added yet. Click a preset above or type a custom size.
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* BATCHES & COST HISTORY ACCORDION */}
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-2">
                    <button
                      type="button"
                      onClick={() => setShowBatchHistory(!showBatchHistory)}
                      className="w-full flex items-center justify-between text-left"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xl">📦</span>
                        <div>
                          <h4 className="text-[11px] font-black uppercase text-slate-900 tracking-wide">
                            Purchase Batches & Cost History (FIFO)
                          </h4>
                          <p className="text-[8px] font-bold text-slate-400 uppercase">
                            Historical purchase costs are locked per batch and never overwritten
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-black text-[9px]">
                          {batchesState.length} Batches
                        </span>
                        <span className="text-xs text-slate-400">{showBatchHistory ? '▲' : '▼'}</span>
                      </div>
                    </button>

                    {showBatchHistory && (
                      <div className="pt-2 border-t border-slate-200/60 space-y-2 animate-in fade-in duration-200">
                        {batchesState.length > 0 ? (
                          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                            <table className="w-full text-left text-[10px]">
                              <thead className="bg-slate-50 text-[8px] font-black uppercase text-slate-400 tracking-wider">
                                <tr>
                                  <th className="px-2.5 py-1.5">Batch #</th>
                                  <th className="px-2.5 py-1.5">Date</th>
                                  <th className="px-2.5 py-1.5 text-right">Cost Price</th>
                                  <th className="px-2.5 py-1.5 text-center">Remaining</th>
                                  <th className="px-2.5 py-1.5">Supplier / PO</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 font-mono">
                                {batchesState.map((b) => (
                                  <tr key={b.id} className="hover:bg-slate-50">
                                    <td className="px-2.5 py-1.5 font-bold text-slate-800">{b.batchNumber}</td>
                                    <td className="px-2.5 py-1.5 text-slate-500">{b.date ? b.date.split('T')[0] : 'N/A'}</td>
                                    <td className="px-2.5 py-1.5 text-right font-black text-indigo-700">Rs. {Number(b.purchaseCost).toLocaleString()}</td>
                                    <td className="px-2.5 py-1.5 text-center font-bold text-slate-800">
                                      <span className={b.remainingQuantity > 0 ? 'text-emerald-600' : 'text-slate-400'}>
                                        {b.remainingQuantity} / {b.initialQuantity}
                                      </span>
                                    </td>
                                    <td className="px-2.5 py-1.5 text-[9px] text-slate-500 font-sans truncate max-w-[120px]">
                                      {b.supplierName || b.purchaseOrderId || 'Initial Stock'}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <div className="p-3 bg-white rounded-xl border border-dashed border-slate-200 text-center text-[9px] font-bold text-slate-500">
                            No purchase batches recorded yet. Batches will be automatically generated as stock is received through purchase orders.
                          </div>
                        )}
                        <p className="text-[8px] text-slate-400 italic font-medium leading-relaxed">
                          🔒 When new stock arrives at a new price, a new batch is created. Old stock will continue to sell at the historical cost until depleted (FIFO).
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-3 col-span-2">
                       <div className="flex justify-between items-center">
                         <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Stock Distribution</label>
                         <span className="text-[10px] font-black text-indigo-600 uppercase tracking-wider bg-indigo-50 px-2.5 py-0.5 rounded-full border border-indigo-100">
                           Total: {Object.values(branchStocksState).reduce((a, b) => a + (Number(b) || 0), 0)} Units
                         </span>
                       </div>

                       <div className="grid grid-cols-2 gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-200/80">
                         <div className="space-y-1">
                           <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1 block">
                             🏪 Store Select
                           </label>
                           <select
                             value={selectedStoreForStock}
                             onChange={(e) => setSelectedStoreForStock(e.target.value)}
                             className="w-full px-4 py-2.5 rounded-xl border border-slate-200 font-bold font-mono text-[13px] outline-none bg-white text-slate-800 focus:border-indigo-500 transition-all cursor-pointer uppercase shadow-sm"
                           >
                             {storeOptions.map(store => (
                               <option key={store} value={store}>
                                 {store} ({branchStocksState[store] || 0} units)
                               </option>
                             ))}
                           </select>
                         </div>

                         <div className="space-y-1">
                           <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1 block">
                             📦 Qty Box ({selectedStoreForStock})
                           </label>
                           <input
                             type="number"
                             min="0"
                             value={branchStocksState[selectedStoreForStock] ?? 0}
                             onChange={(e) => handleBranchStockChange(selectedStoreForStock, parseInt(e.target.value) || 0)}
                             placeholder="Enter Qty..."
                             required
                             className="w-full px-4 py-2.5 rounded-xl border border-slate-200 font-black font-mono text-[14px] outline-none bg-white text-slate-900 focus:border-indigo-500 transition-all shadow-sm"
                           />
                         </div>

                         <div className="col-span-2 pt-2 flex flex-wrap gap-2 border-t border-slate-200/60 mt-1">
                           {storeOptions.map(store => {
                             const qty = branchStocksState[store] || 0;
                             const isSelected = selectedStoreForStock === store;
                             return (
                               <button
                                 type="button"
                                 key={store}
                                 onClick={() => setSelectedStoreForStock(store)}
                                 className={`px-3 py-1.5 rounded-xl text-[11px] font-black transition-all flex items-center gap-1.5 ${
                                   isSelected
                                     ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200 scale-105'
                                     : 'bg-white text-slate-700 border border-slate-200 hover:border-indigo-300'
                                 }`}
                               >
                                 <span>{store}</span>
                                 <span className={`px-1.5 py-0.5 rounded-md text-[10px] ${
                                   isSelected ? 'bg-indigo-700 text-white' : 'bg-slate-100 text-slate-800'
                                 }`}>
                                   {qty}
                                 </span>
                               </button>
                             );
                           })}
                         </div>
                       </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Alert Threshold</label>
                      <input name="lowStockThreshold" type="number" defaultValue={editingProduct?.lowStockThreshold || 5} required className="w-full px-4 py-3 rounded-2xl border border-slate-200 font-black font-mono text-[14px] outline-none bg-white" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Internal Notes</label>
                      <textarea name="internalNotes" defaultValue={editingProduct?.internalNotes} rows={2} placeholder="INTERNAL MEMOS..." className="w-full px-4 py-3 rounded-2xl border border-slate-200 font-bold outline-none bg-white text-slate-800 uppercase text-[12px] focus:border-indigo-500 transition-all shadow-sm resize-y" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Extra Details</label>
                      <textarea name="extraDetails" defaultValue={editingProduct?.extraDetails} rows={2} placeholder="PRINTS ON BARCODE..." className="w-full px-4 py-3 rounded-2xl border border-slate-200 font-bold outline-none bg-white text-slate-800 uppercase text-[12px] focus:border-indigo-500 transition-all shadow-sm resize-y" />
                    </div>
                  </div>

                  <div className="bg-indigo-50/40 p-5 rounded-[1.8rem] border border-indigo-100/50 space-y-4">
                    <h4 className="text-[10px] font-black text-indigo-700 uppercase tracking-wider">Cashier 4 Label Settings</h4>
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Sinhala Name</label>
                        <input name="sinhalaName" placeholder="e.g. කොණ්ඩ කඩල" defaultValue={editingProduct?.sinhalaName} className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-200 font-bold outline-none text-slate-800 text-[12px] focus:border-indigo-500 transition-all shadow-sm" />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Free Text (Eng)</label>
                          <input name="c4FreeText" placeholder="e.g. Specially Packed" defaultValue={editingProduct?.c4FreeText} className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-200 font-bold outline-none text-slate-800 text-[12px] focus:border-indigo-500 transition-all shadow-sm" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Free Text (Sin)</label>
                          <input name="c4FreeTextSinhala" placeholder="e.g. විශේෂයෙන් ඇසුරුම් කරන ලදී" defaultValue={editingProduct?.c4FreeTextSinhala} className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-200 font-bold outline-none text-slate-800 text-[12px] focus:border-indigo-500 transition-all shadow-sm" />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Primary Vendor</label>
                    <select name="vendorId" className="w-full px-4 py-3 rounded-2xl border border-slate-200 font-black bg-white outline-none cursor-pointer uppercase text-[12px] focus:border-indigo-500" defaultValue={editingProduct?.vendorId}>
                      <option value="">INTERNAL POOL / LOCAL SOURCE</option>
                      {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                    </select>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100 flex gap-4">
                  <button type="button" onClick={closeModal} className="flex-1 bg-slate-100 text-slate-900 font-black py-4 rounded-[1.25rem] transition-all uppercase tracking-widest text-xs">Discard</button>
                  <button type="submit" disabled={saveStatus !== 'IDLE'} className={`flex-[2] font-black py-4 rounded-[1.25rem] shadow-2xl transition-all uppercase tracking-widest text-xs text-white ${saveStatus === 'SUCCESS' ? 'bg-emerald-600' : 'bg-slate-950 hover:bg-black'}`}>
                    {saveStatus === 'SAVING' ? 'Synchronizing Ledger...' : saveStatus === 'SUCCESS' ? '✓ Master Record Committed' : editingProduct ? 'Synchronize Updates' : 'Commit New Asset'}
                  </button>
                </div>
              </form>
            </div>
          </div >
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