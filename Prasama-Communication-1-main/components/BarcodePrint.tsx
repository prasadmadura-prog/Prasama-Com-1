import React, { useState, useMemo, useRef, useEffect } from 'react';
import JsBarcode from 'jsbarcode';
import { Product, Category } from '../types';

interface BarcodePrintProps {
  products: Product[];
  categories: Category[];
}

type LabelSize = 'SMALL' | 'MEDIUM' | 'LARGE';
type PaperSize = 'A4' | 'LETTER' | 'ROLL';

interface PrintSettings {
  labelSize: LabelSize;
  columns: number;
  showPrice: boolean;
  showSKU: boolean;
  showName: boolean;
  paperSize: PaperSize;
}

const BarcodePrint: React.FC<BarcodePrintProps> = ({ products = [], categories = [] }) => {
  const [selections, setSelections] = useState<Record<string, number>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategoryId, setFilterCategoryId] = useState('All');
  
  const [settings, setSettings] = useState<PrintSettings>({
    labelSize: 'MEDIUM',
    columns: 3,
    showPrice: true,
    showSKU: true,
    showName: true,
    paperSize: 'A4'
  });

  const holdTimerRef = useRef<number | null>(null);

  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchesSearch = (p.name || "").toLowerCase().includes(searchTerm.toLowerCase()) || 
                           (p.sku || "").toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = filterCategoryId === 'All' || p.categoryId === filterCategoryId;
      return matchesSearch && matchesCategory;
    });
  }, [products, searchTerm, filterCategoryId]);

  const totalLabels = useMemo(() => 
    Object.values(selections).reduce((a: number, b: number) => a + b, 0)
  , [selections]);

  const updateSelection = (productId: string, copies: number) => {
    setSelections(prev => ({
      ...prev,
      [productId]: Math.max(0, copies)
    }));
  };

  const startContinuousAction = (action: () => void) => {
    action();
    holdTimerRef.current = window.setTimeout(() => {
      holdTimerRef.current = window.setInterval(action, 80);
    }, 400);
  };

  const stopContinuousAction = () => {
    if (holdTimerRef.current) {
      window.clearTimeout(holdTimerRef.current);
      window.clearInterval(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  };

  const handlePrint = () => {
    const itemsToPrint = products.filter(p => (selections[p.id] || 0) > 0);
    if (itemsToPrint.length === 0) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const labelDim = {
      SMALL: { h: '30mm', f: '10px', bh: 30 },
      MEDIUM: { h: '45mm', f: '12px', bh: 45 },
      LARGE: { h: '60mm', f: '16px', bh: 60 }
    }[settings.labelSize];

    const paperWidth = settings.paperSize === 'ROLL' ? '80mm' : '210mm';

    let html = `
      <html>
      <head>
        <title>Barcode Print Manifest</title>
        <style>
          @page { size: ${settings.paperSize === 'ROLL' ? '80mm auto' : settings.paperSize.toLowerCase()}; margin: 5mm; }
          body { margin: 0; padding: 0; font-family: 'Inter', sans-serif; background: white; }
          .grid {
            display: grid;
            grid-template-columns: repeat(${settings.columns}, 1fr);
            gap: 2mm;
            width: ${paperWidth};
          }
          .label {
            border: 0.1mm solid #eee;
            height: ${labelDim.h};
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            text-align: center;
            padding: 2mm;
            box-sizing: border-box;
            overflow: hidden;
            page-break-inside: avoid;
          }
          .name { font-weight: 800; text-transform: uppercase; font-size: ${labelDim.f}; margin-bottom: 1mm; max-width: 100%; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
          .barcode-svg { max-width: 90%; height: auto; margin-top: 1mm; }
          .price { font-weight: 900; font-size: calc(${labelDim.f} + 2px); margin-top: 1.5mm; }
        </style>
        <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"></script>
      </head>
      <body>
        <div class="grid">
    `;

    itemsToPrint.forEach(p => {
      const count = selections[p.id];
      for(let i=0; i<count; i++) {
        html += `<div class="label">
          ${settings.showName ? `<div class="name">${p.name}</div>` : ''}
          <svg class="barcode-svg" 
            jsbarcode-value="${p.sku}" 
            jsbarcode-format="CODE128"
            jsbarcode-height="${labelDim.bh}"
            jsbarcode-fontSize="10"
            jsbarcode-displayValue="${settings.showSKU}"
          ></svg>
          ${settings.showPrice ? `<div class="price">Rs. ${p.price.toLocaleString()}</div>` : ''}
        </div>`;
      }
    });

    html += `
        </div>
        <script>
          window.onload = function() {
            JsBarcode(".barcode-svg").init();
            setTimeout(function() {
              window.print();
              window.close();
            }, 500);
          }
        </script>
      </body>
      </html>
    `;
    
    printWindow.document.write(html);
    printWindow.document.close();
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div>
          <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tighter">Barcode Terminal</h2>
          <p className="text-slate-500 font-bold uppercase tracking-widest text-[10px] mt-1">Ready for {totalLabels} Output Units</p>
        </div>
        <button 
          onClick={handlePrint} 
          disabled={totalLabels === 0}
          className="bg-slate-900 text-white px-12 py-4 rounded-2xl font-black uppercase text-[11px] tracking-[0.2em] shadow-2xl hover:bg-black transition-all active:scale-95 disabled:opacity-20 flex items-center gap-3"
        >
          <span>🖨️</span> Execute Manifest
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Settings Column */}
        <div className="lg:col-span-4 bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-8">
          <div className="space-y-1">
            <h3 className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.3em]">Layout Engine</h3>
            <p className="text-xs font-bold text-slate-400">Configure label dimensions and visibility</p>
          </div>

          <div className="space-y-6">
            <div>
              <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3">Label Dimensions</label>
              <div className="grid grid-cols-3 gap-2">
                {(['SMALL', 'MEDIUM', 'LARGE'] as LabelSize[]).map(s => (
                  <button 
                    key={s} 
                    onClick={() => setSettings({...settings, labelSize: s})}
                    className={`py-2.5 rounded-xl text-[9px] font-black uppercase transition-all border ${settings.labelSize === s ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg' : 'bg-slate-50 border-slate-100 text-slate-400 hover:border-slate-300'}`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3">Paper Standard</label>
              <div className="grid grid-cols-3 gap-2">
                {(['A4', 'LETTER', 'ROLL'] as PaperSize[]).map(p => (
                  <button 
                    key={p} 
                    onClick={() => setSettings({...settings, paperSize: p})}
                    className={`py-2.5 rounded-xl text-[9px] font-black uppercase transition-all border ${settings.paperSize === p ? 'bg-slate-900 border-slate-900 text-white shadow-lg' : 'bg-slate-50 border-slate-100 text-slate-400 hover:border-slate-300'}`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-2">
              <div>
                <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3">Cols per Row</label>
                <input 
                  type="number" 
                  min="1" 
                  max="10" 
                  value={settings.columns} 
                  onChange={e => setSettings({...settings, columns: parseInt(e.target.value) || 1})} 
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 font-black text-center text-indigo-600 outline-none focus:border-indigo-500"
                />
              </div>
              <div className="flex flex-col justify-end gap-2">
                <button 
                  onClick={() => setSettings({...settings, showName: !settings.showName})}
                  className={`flex items-center gap-2 text-[9px] font-black uppercase tracking-widest ${settings.showName ? 'text-emerald-600' : 'text-slate-300'}`}
                >
                  <span className="text-sm">{settings.showName ? '☑' : '☐'}</span> Name
                </button>
                <button 
                  onClick={() => setSettings({...settings, showPrice: !settings.showPrice})}
                  className={`flex items-center gap-2 text-[9px] font-black uppercase tracking-widest ${settings.showPrice ? 'text-emerald-600' : 'text-slate-300'}`}
                >
                  <span className="text-sm">{settings.showPrice ? '☑' : '☐'}</span> Price
                </button>
                <button 
                  onClick={() => setSettings({...settings, showSKU: !settings.showSKU})}
                  className={`flex items-center gap-2 text-[9px] font-black uppercase tracking-widest ${settings.showSKU ? 'text-emerald-600' : 'text-slate-300'}`}
                >
                  <span className="text-sm">{settings.showSKU ? '☑' : '☐'}</span> SKU
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* List Column */}
        <div className="lg:col-span-8 space-y-4">
          <div className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <span className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
              <input 
                type="text" 
                placeholder="Search inventory assets..." 
                className="w-full pl-14 pr-6 py-4 rounded-2xl border border-slate-200 outline-none bg-slate-50/50 font-bold text-sm focus:border-indigo-500 transition-all" 
                value={searchTerm} 
                onChange={(e) => setSearchTerm(e.target.value)} 
              />
            </div>
            <select 
              value={filterCategoryId}
              onChange={(e) => setFilterCategoryId(e.target.value)}
              className="px-8 py-4 rounded-2xl border border-slate-200 bg-white text-[10px] font-black uppercase tracking-widest outline-none cursor-pointer focus:border-indigo-500"
            >
              <option value="All">All Categories</option>
              {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
            </select>
          </div>

          <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead className="bg-slate-50 text-slate-500 uppercase tracking-widest text-[9px]">
                  <tr>
                    <th className="px-8 py-5">Product Details</th>
                    <th className="px-8 py-5 text-center">Print Quantity</th>
                    <th className="px-8 py-5 text-right">LKR Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {filteredProducts.map(p => (
                    <tr key={p.id} className="hover:bg-indigo-50/30 transition-all group">
                      <td className="px-8 py-5">
                        <p className="font-black text-slate-900 uppercase text-[12px] tracking-tight">{p.name}</p>
                        <p className="text-[10px] text-indigo-500 font-mono font-black uppercase mt-0.5">{p.sku}</p>
                      </td>
                      <td className="px-8 py-5">
                        <div className="flex items-center justify-center gap-4">
                          <button 
                            onMouseDown={() => startContinuousAction(() => updateSelection(p.id, (selections[p.id] || 0) - 1))}
                            onMouseUp={stopContinuousAction}
                            onMouseLeave={stopContinuousAction}
                            onTouchStart={(e) => { e.preventDefault(); startContinuousAction(() => updateSelection(p.id, (selections[p.id] || 0) - 1)); }}
                            onTouchEnd={stopContinuousAction}
                            className="w-9 h-9 rounded-xl border border-slate-200 bg-white flex items-center justify-center font-black text-slate-500 hover:bg-rose-50 hover:text-rose-600 transition-all active:scale-90 shadow-sm"
                          >-</button>
                          <span className="w-10 text-center font-black text-slate-900 font-mono text-lg">{selections[p.id] || 0}</span>
                          <button 
                            onMouseDown={() => startContinuousAction(() => updateSelection(p.id, (selections[p.id] || 0) + 1))}
                            onMouseUp={stopContinuousAction}
                            onMouseLeave={stopContinuousAction}
                            onTouchStart={(e) => { e.preventDefault(); startContinuousAction(() => updateSelection(p.id, (selections[p.id] || 0) + 1)); }}
                            onTouchEnd={stopContinuousAction}
                            className="w-9 h-9 rounded-xl border border-slate-200 bg-white flex items-center justify-center font-black text-slate-500 hover:bg-indigo-50 hover:text-indigo-600 transition-all active:scale-90 shadow-sm"
                          >+</button>
                        </div>
                      </td>
                      <td className="px-8 py-5 text-right">
                        <p className="font-black text-slate-900 font-mono">{(Number(p.price) || 0).toLocaleString()}</p>
                      </td>
                    </tr>
                  ))}
                  {filteredProducts.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-8 py-20 text-center text-slate-300 font-black uppercase tracking-widest text-[10px] italic">No inventory assets matched your search query.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BarcodePrint;