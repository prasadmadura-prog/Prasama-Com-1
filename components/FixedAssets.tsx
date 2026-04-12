
import React, { useState, useMemo } from 'react';
import { FixedAsset, UserProfile } from '../types';

interface FixedAssetsProps {
    assets: FixedAsset[];
    userProfile: UserProfile;
    onUpsertAsset: (asset: FixedAsset) => void;
    onDeleteAsset: (id: string) => void;
}

const FixedAssets: React.FC<FixedAssetsProps> = ({
    assets = [],
    userProfile,
    onUpsertAsset,
    onDeleteAsset
}) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingAsset, setEditingAsset] = useState<FixedAsset | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('ALL');

    const categories = useMemo(() => {
        const cats = new Set(assets.map(a => a.category).filter(Boolean));
        return ['ALL', ...Array.from(cats)];
    }, [assets]);

    const filteredAssets = assets.filter(a => {
        const matchesSearch = a.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                             (a.serialNumber || '').toLowerCase().includes(searchTerm.toLowerCase());
        const matchesCategory = categoryFilter === 'ALL' || a.category === categoryFilter;
        return matchesSearch && matchesCategory;
    });

    const totalValue = assets.reduce((acc, a) => acc + Number(a.currentValue || 0), 0);
    const totalPurchase = assets.reduce((acc, a) => acc + Number(a.purchasePrice || 0), 0);

    const handleSave = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        
        const asset: FixedAsset = {
            id: editingAsset?.id || `ASSET-${Date.now()}`,
            name: formData.get('name') as string,
            category: formData.get('category') as string,
            purchaseDate: formData.get('purchaseDate') as string,
            purchasePrice: Number(formData.get('purchasePrice')),
            currentValue: Number(formData.get('currentValue')),
            depreciationRate: Number(formData.get('depreciationRate')) || 0,
            location: formData.get('location') as string,
            serialNumber: formData.get('serialNumber') as string,
            notes: formData.get('notes') as string,
            userId: userProfile.email || 'system'
        };

        onUpsertAsset(asset);
        setIsModalOpen(false);
        setEditingAsset(null);
    };

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
            <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
                <div>
                    <h1 className="text-3xl font-black text-slate-900 tracking-tighter uppercase">Fixed Assets</h1>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mt-1">Management & Valuation of Company Assets</p>
                </div>
                <button
                    onClick={() => { setEditingAsset(null); setIsModalOpen(true); }}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all shadow-lg hover:shadow-indigo-200 active:scale-95 flex items-center gap-2"
                >
                    <span className="text-lg">+</span> Add New Asset
                </button>
            </header>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm hover:shadow-lg transition-all">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Assets Value</p>
                    <p className="text-2xl font-black text-slate-900 font-mono">Rs. {Math.round(totalValue).toLocaleString()}</p>
                    <div className="mt-2 text-[8px] font-bold text-emerald-500 uppercase tracking-tighter">Current Valuation</div>
                </div>
                <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm hover:shadow-lg transition-all">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Initial Investment</p>
                    <p className="text-2xl font-black text-slate-900 font-mono">Rs. {Math.round(totalPurchase).toLocaleString()}</p>
                    <div className="mt-2 text-[8px] font-bold text-slate-400 uppercase tracking-tighter">Total Purchase Price</div>
                </div>
                <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm hover:shadow-lg transition-all">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Asset Count</p>
                    <p className="text-2xl font-black text-indigo-600 font-mono">{assets.length}</p>
                    <div className="mt-2 text-[8px] font-bold text-slate-400 uppercase tracking-tighter">Total Active Items</div>
                </div>
            </div>

            {/* Filter Bar */}
            <div className="flex flex-col md:flex-row gap-4 bg-white p-4 rounded-3xl border border-slate-100 shadow-sm">
                <div className="flex-1 relative">
                    <input
                        type="text"
                        placeholder="SEARCH ASSETS BY NAME OR SERIAL..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="w-full bg-slate-50 border-none rounded-2xl px-6 py-4 text-[10px] font-bold uppercase tracking-widest focus:ring-2 ring-indigo-500 outline-none"
                    />
                </div>
                <select
                    value={categoryFilter}
                    onChange={e => setCategoryFilter(e.target.value)}
                    className="bg-slate-50 border-none rounded-2xl px-6 py-4 text-[10px] font-bold uppercase tracking-widest focus:ring-2 ring-indigo-500 outline-none cursor-pointer min-w-[200px]"
                >
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
            </div>

            {/* Assets Table */}
            <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden">
                <table className="w-full text-left">
                    <thead>
                        <tr className="bg-slate-50/50 border-b border-slate-100">
                            <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Asset Details</th>
                            <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Valuation</th>
                            <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Location / Info</th>
                            <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                        {filteredAssets.length === 0 ? (
                            <tr>
                                <td colSpan={4} className="px-8 py-20 text-center">
                                    <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">No assets found</p>
                                </td>
                            </tr>
                        ) : (
                            filteredAssets.map(asset => (
                                <tr key={asset.id} className="hover:bg-slate-50/50 transition-colors group">
                                    <td className="px-8 py-6">
                                        <div className="flex flex-col">
                                            <span className="text-sm font-black text-slate-900 uppercase tracking-tight">{asset.name}</span>
                                            <span className="text-[9px] font-bold text-indigo-500 uppercase tracking-widest mt-0.5">{asset.category}</span>
                                            <span className="text-[8px] font-bold text-slate-400 uppercase mt-1">SN: {asset.serialNumber || 'N/A'}</span>
                                        </div>
                                    </td>
                                    <td className="px-8 py-6">
                                        <div className="flex flex-col">
                                            <span className="text-sm font-black text-slate-900 font-mono">Rs. {asset.currentValue.toLocaleString()}</span>
                                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Purchased: Rs. {asset.purchasePrice.toLocaleString()}</span>
                                        </div>
                                    </td>
                                    <td className="px-8 py-6">
                                        <div className="flex flex-col">
                                            <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">{asset.location || 'Not Specified'}</span>
                                            <span className="text-[9px] font-bold text-slate-400 uppercase mt-0.5">Date: {asset.purchaseDate}</span>
                                        </div>
                                    </td>
                                    <td className="px-8 py-6">
                                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={() => { setEditingAsset(asset); setIsModalOpen(true); }}
                                                className="p-2 hover:bg-indigo-50 text-indigo-600 rounded-lg transition-colors"
                                            >
                                                ✏️
                                            </button>
                                            <button
                                                onClick={() => { if(confirm('Delete this asset?')) onDeleteAsset(asset.id); }}
                                                className="p-2 hover:bg-rose-50 text-rose-600 rounded-lg transition-colors"
                                            >
                                                🗑️
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Add/Edit Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-300">
                    <div className="bg-white w-full max-w-2xl rounded-[3rem] shadow-2xl overflow-hidden border border-slate-100 animate-in zoom-in-95 duration-300">
                        <div className="p-10 border-b border-slate-50 flex justify-between items-center">
                            <div>
                                <h2 className="text-xl font-black text-slate-900 tracking-tighter uppercase">{editingAsset ? 'Edit Asset' : 'New Asset Registration'}</h2>
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mt-1">Register hardware or property assets</p>
                            </div>
                            <button onClick={() => setIsModalOpen(false)} className="text-2xl hover:bg-slate-50 w-12 h-12 rounded-full transition-all">×</button>
                        </div>
                        
                        <form onSubmit={handleSave} className="p-10 space-y-8">
                            <div className="grid grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-4">Asset Name</label>
                                    <input required name="name" defaultValue={editingAsset?.name} className="w-full bg-slate-50 rounded-2xl px-6 py-4 text-xs font-bold uppercase tracking-widest outline-none focus:ring-2 ring-indigo-500 border-none" placeholder="E.G. OFFICE LAPTOP" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-4">Category</label>
                                    <input required name="category" defaultValue={editingAsset?.category} className="w-full bg-slate-50 rounded-2xl px-6 py-4 text-xs font-bold uppercase tracking-widest outline-none focus:ring-2 ring-indigo-500 border-none" placeholder="E.G. ELECTRONICS" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-4">Purchase Date</label>
                                    <input type="date" required name="purchaseDate" defaultValue={editingAsset?.purchaseDate || new Date().toISOString().split('T')[0]} className="w-full bg-slate-50 rounded-2xl px-6 py-4 text-xs font-bold uppercase tracking-widest outline-none focus:ring-2 ring-indigo-500 border-none" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-4">Purchase Price (Rs)</label>
                                    <input type="number" required name="purchasePrice" defaultValue={editingAsset?.purchasePrice} className="w-full bg-slate-50 rounded-2xl px-6 py-4 text-xs font-bold uppercase tracking-widest outline-none focus:ring-2 ring-indigo-500 border-none font-mono" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-4">Current Value (Rs)</label>
                                    <input type="number" required name="currentValue" defaultValue={editingAsset?.currentValue} className="w-full bg-slate-50 rounded-2xl px-6 py-4 text-xs font-bold uppercase tracking-widest outline-none focus:ring-2 ring-indigo-500 border-none font-mono" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-4">Location</label>
                                    <input name="location" defaultValue={editingAsset?.location} className="w-full bg-slate-50 rounded-2xl px-6 py-4 text-xs font-bold uppercase tracking-widest outline-none focus:ring-2 ring-indigo-500 border-none" placeholder="MAIN OFFICE" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-4">Serial Number</label>
                                    <input name="serialNumber" defaultValue={editingAsset?.serialNumber} className="w-full bg-slate-50 rounded-2xl px-6 py-4 text-xs font-bold uppercase tracking-widest outline-none focus:ring-2 ring-indigo-500 border-none" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-4">Annual Depreciation %</label>
                                    <input type="number" name="depreciationRate" defaultValue={editingAsset?.depreciationRate} className="w-full bg-slate-50 rounded-2xl px-6 py-4 text-xs font-bold uppercase tracking-widest outline-none focus:ring-2 ring-indigo-500 border-none" />
                                </div>
                            </div>
                            <div className="space-y-2">
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-4">Notes</label>
                                    <textarea name="notes" defaultValue={editingAsset?.notes} className="w-full bg-slate-50 rounded-2xl px-6 py-4 text-xs font-bold uppercase tracking-widest outline-none focus:ring-2 ring-indigo-500 border-none h-24 resize-none" />
                            </div>

                            <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-6 rounded-3xl font-black text-[10px] uppercase tracking-[0.3em] shadow-xl shadow-indigo-100 transition-all hover:-translate-y-1 active:scale-95">
                                {editingAsset ? 'Update Asset Record' : 'Register Asset'}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default FixedAssets;
