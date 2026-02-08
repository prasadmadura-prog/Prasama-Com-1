
import React, { useMemo } from 'react';
import { Transaction, Product, BankAccount, View, PurchaseOrder, DaySession, Customer, Vendor, Category, UserProfile } from '../types';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell } from 'recharts';

interface KPIProps {
    transactions: Transaction[];
    products: Product[];
    categories: Category[];
    accounts: BankAccount[];
    vendors: Vendor[];
    customers: Customer[];
    purchaseOrders?: PurchaseOrder[];
    daySessions?: DaySession[];
    userProfile: UserProfile;
    onNavigate: (view: View) => void;
}

const KPI: React.FC<KPIProps> = ({
    transactions = [],
    products = [],
    categories = [],
    accounts = [],
    daySessions = [],
    customers = [],
    vendors = [],
    purchaseOrders = [],
    userProfile,
    onNavigate
}) => {
    const getTodayLocal = () => {
        const d = new Date();
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    };
    const today = getTodayLocal();

    const [branchFilter, setBranchFilter] = React.useState<'ALL' | string>(userProfile.branch || 'ALL');
    const [startDate, setStartDate] = React.useState(today);
    const [endDate, setEndDate] = React.useState(today);

    React.useEffect(() => {
        if (userProfile.branch) {
            setBranchFilter(userProfile.branch);
        }
    }, [userProfile.branch]);

    const normalizeBranch = (b?: string): string => {
        if (!b) return 'CASHIER 1';
        const upper = b.trim().toUpperCase();
        if (upper === 'LOCAL NODE' || upper === 'BOOKSHOP' || upper === 'SHOP 2' || upper === 'MAIN BRANCH' || upper === 'NO 16,KIRULAPANA SUPERMARKET ,COLOMBO 05') {
            return 'CASHIER 1';
        }
        return b;
    };

    const kpiStats = useMemo(() => {
        // Filter transactions
        const filteredTxs = transactions.filter(t => {
            const tBranch = normalizeBranch(t.branchId);
            const target = normalizeBranch(branchFilter);

            // Branch Filter
            const branchMatch = branchFilter === 'ALL' || tBranch === target;

            // Date Filter
            const txDate = t.date.split('T')[0];
            const dateMatch = (!startDate || txDate >= startDate) && (!endDate || txDate <= endDate);

            return branchMatch && dateMatch;
        });

        const totalRevenue = filteredTxs
            .filter(t => t.type === 'SALE' || t.type === 'SALE_HISTORY_IMPORT')
            .reduce((acc, t) => acc + Number(t.amount || 0), 0);

        const totalExpenses = filteredTxs
            .filter(t => t.type === 'EXPENSE')
            .reduce((acc, t) => acc + Number(t.amount || 0), 0);

        // Note: Credit and Payables are usually current snapshots (outstanding), 
        // effectively "as of now", not strictly "generated in this period". 
        // However, if we want "New Credit Issued" vs "Current Total Outstanding", that's different.
        // The user likely wants to see "Revenue in this period", "Expenses in this period".
        // But "Pending Credit" is a balance sheet item, not P&L. 
        // Displaying TOTAL outstanding credit regardless of date filter is usually correct for "Pending Credit" card.
        // But if the user wants "Credit Sales in this period", that's different.
        // The current implementation sums `customers.reduce(...)` which is TOTAL outstanding.
        // I will keep Payables and Receivables as GLOBAL TOTALS (Snapshot) because they come from Customer/Vendor entities, not Transactions.
        // Only Revenue, Expenses, and Profit (Flows) should proceed with date filtering.

        const pendingCredit = customers.reduce((acc, c) => acc + Number(c.totalCredit || 0), 0);
        const vendorPayables = vendors.reduce((acc, v) => acc + Number(v.totalBalance || 0), 0);

        // Calculate Profit (for the filtered period)
        let totalCost = 0;
        filteredTxs.filter(t => t.type === 'SALE').forEach(t => {
            if (t.costBasis) {
                totalCost += t.costBasis;
            } else if (t.items) {
                t.items.forEach(i => {
                    const p = products.find(prod => prod.id === i.productId);
                    if (p) totalCost += Number(p.cost || 0) * Number(i.quantity);
                });
            }
        });

        const profit = totalRevenue - totalCost - totalExpenses; // Simplified Net Profit
        const margin = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0;

        return { totalRevenue, totalExpenses, pendingCredit, vendorPayables, profit, margin };
    }, [transactions, products, customers, vendors, branchFilter, startDate, endDate]);

    const categoryPerformance = useMemo(() => {
        const catMap: Record<string, number> = {};
        transactions.filter(t => t.type === 'SALE').forEach(t => {
            // Apply filters
            const tBranch = normalizeBranch(t.branchId);
            const target = normalizeBranch(branchFilter);

            const branchMatch = branchFilter === 'ALL' || tBranch === target;

            const txDate = t.date.split('T')[0];
            const dateMatch = (!startDate || txDate >= startDate) && (!endDate || txDate <= endDate);

            if (!branchMatch || !dateMatch) return;

            t.items?.forEach(i => {
                const p = products.find(prod => prod.id === i.productId);
                if (p) {
                    const catId = p.categoryId || 'Uncategorized';
                    const catName = categories.find(c => c.id === catId)?.name || 'Uncategorized';
                    catMap[catName] = (catMap[catName] || 0) + (i.quantity * i.price);
                }
            });
        });

        return Object.entries(catMap)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 5);
    }, [transactions, products, categories, branchFilter, startDate, endDate]);

    const hourlyRevenue = useMemo(() => {
        const hours = Array.from({ length: 24 }, (_, i) => ({
            hour: i,
            time: `${i}:00`,
            revenue: 0,
            salesCount: 0
        }));

        transactions.forEach(t => {
            if (t.type !== 'SALE' && t.type !== 'SALE_HISTORY_IMPORT') return;

            // Apply filters
            const tBranch = normalizeBranch(t.branchId);
            const target = normalizeBranch(branchFilter);
            const branchMatch = branchFilter === 'ALL' || tBranch === target;

            const txDate = t.date.split('T')[0];
            const dateMatch = (!startDate || txDate >= startDate) && (!endDate || txDate <= endDate);

            if (!branchMatch || !dateMatch) return;

            // Extract hour
            let hour = 0;
            if (t.date.includes('T')) {
                const timePart = t.date.split('T')[1];
                hour = parseInt(timePart.split(':')[0]);
            } else {
                // Fallback for dates without T
                const d = new Date(t.date);
                hour = d.getHours();
            }

            if (!isNaN(hour) && hour >= 0 && hour < 24) {
                hours[hour].revenue += Number(t.amount || 0);
                hours[hour].salesCount += 1;
            }
        });

        return hours;
    }, [transactions, branchFilter, startDate, endDate]);

    return (
        <div className="space-y-10 animate-in fade-in duration-700 pb-20">
            <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
                <div>
                    <h1 className="text-3xl font-black text-slate-900 tracking-tighter uppercase">KPI Dashboard</h1>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mt-1">Key Performance Indicators & Analytics</p>
                </div>
                <div className="flex flex-col md:flex-row items-end gap-4">
                    {/* Date Filters */}
                    <div className="flex items-center gap-2 bg-white px-2 py-1 rounded-2xl border border-slate-100 shadow-sm">
                        <div className="space-y-1 px-2">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">From</label>
                            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="outline-none text-xs font-bold text-slate-700 uppercase bg-transparent" />
                        </div>
                        <div className="h-8 w-px bg-slate-100"></div>
                        <div className="space-y-1 px-2">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">To</label>
                            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="outline-none text-xs font-bold text-slate-700 uppercase bg-transparent" />
                        </div>
                    </div>

                    {userProfile.allBranches && userProfile.allBranches.length > 0 && (
                        <select
                            value={branchFilter}
                            onChange={(e) => setBranchFilter(e.target.value)}
                            className="bg-white px-6 py-4 rounded-2xl border border-slate-100 shadow-sm outline-none text-[10px] font-black uppercase tracking-widest text-indigo-600 hover:border-indigo-200 transition-all cursor-pointer h-[60px]"
                        >
                            <option value="ALL">All Terminals</option>
                            {userProfile.allBranches.map(b => (
                                <option key={b} value={b}>{b}</option>
                            ))}
                        </select>
                    )}
                </div>
            </header>

            {/* KPI Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                {/* Revenue */}
                <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm hover:shadow-lg transition-all">
                    <div className="flex justify-between items-start mb-4">
                        <div className="p-3 bg-indigo-50 rounded-2xl text-2xl">💰</div>
                        <span className="text-[9px] font-black uppercase bg-indigo-100 text-indigo-700 px-2 py-1 rounded-lg">Total</span>
                    </div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Revenue</p>
                    <p className="text-2xl font-black text-slate-900 font-mono">Rs. {Math.round(kpiStats.totalRevenue).toLocaleString()}</p>
                </div>

                {/* Expenses */}
                <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm hover:shadow-lg transition-all">
                    <div className="flex justify-between items-start mb-4">
                        <div className="p-3 bg-rose-50 rounded-2xl text-2xl">💸</div>
                        <span className="text-[9px] font-black uppercase bg-rose-100 text-rose-700 px-2 py-1 rounded-lg">Outflow</span>
                    </div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Expenses</p>
                    <p className="text-2xl font-black text-rose-600 font-mono">Rs. {Math.round(kpiStats.totalExpenses).toLocaleString()}</p>
                </div>

                {/* Profit */}
                <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm hover:shadow-lg transition-all">
                    <div className="flex justify-between items-start mb-4">
                        <div className="p-3 bg-emerald-50 rounded-2xl text-2xl">📈</div>
                        <span className="text-[9px] font-black uppercase bg-emerald-100 text-emerald-700 px-2 py-1 rounded-lg">Net</span>
                    </div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Approx. Net Profit</p>
                    <p className="text-2xl font-black text-emerald-600 font-mono">Rs. {Math.round(kpiStats.profit).toLocaleString()}</p>
                    <p className="text-[8px] font-bold text-slate-300 mt-2">Margin: {kpiStats.margin.toFixed(1)}%</p>
                </div>

                {/* Pending Credit */}
                <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm hover:shadow-lg transition-all">
                    <div className="flex justify-between items-start mb-4">
                        <div className="p-3 bg-amber-50 rounded-2xl text-2xl">⏳</div>
                        <span className="text-[9px] font-black uppercase bg-amber-100 text-amber-700 px-2 py-1 rounded-lg">Receivable</span>
                    </div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Pending Credit</p>
                    <p className="text-2xl font-black text-amber-600 font-mono">Rs. {Math.round(kpiStats.pendingCredit).toLocaleString()}</p>
                </div>
            </div>

            {/* Hourly Sales Distribution */}
            <div className="bg-white p-10 rounded-[2.5rem] border border-slate-100 shadow-sm">
                <div className="flex justify-between items-center mb-8">
                    <div>
                        <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">Hourly Sales Distribution</h3>
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Identifying peak transaction hours</p>
                    </div>
                    <div className="flex gap-2">
                        <div className="flex items-center gap-1">
                            <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
                            <span className="text-[8px] font-black text-slate-400 uppercase">Revenue</span>
                        </div>
                    </div>
                </div>
                <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={hourlyRevenue} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis
                                dataKey="time"
                                tick={{ fontSize: 9, fontWeight: 700, fill: '#64748b' }}
                                axisLine={false}
                                tickLine={false}
                            />
                            <YAxis
                                tick={{ fontSize: 9, fontWeight: 700, fill: '#64748b' }}
                                axisLine={false}
                                tickLine={false}
                                tickFormatter={(value) => `Rs. ${value > 1000 ? (value / 1000).toFixed(0) + 'k' : value}`}
                            />
                            <Tooltip
                                cursor={{ fill: '#f8fafc' }}
                                contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '12px', fontWeight: 'bold' }}
                                formatter={(value: number) => [`Rs. ${value.toLocaleString()}`, 'Revenue']}
                            />
                            <Bar dataKey="revenue" fill="#6366f1" radius={[6, 6, 0, 0]} barSize={20}>
                                {hourlyRevenue.map((entry, index) => (
                                    <Cell
                                        key={`cell-${index}`}
                                        fill={entry.revenue === Math.max(...hourlyRevenue.map(h => h.revenue)) ? '#6366f1' : '#e2e8f0'}
                                        className="hover:fill-indigo-400 transition-colors cursor-pointer"
                                    />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Category Performance Chart */}
                <div className="bg-white p-10 rounded-[2.5rem] border border-slate-100 shadow-sm">
                    <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight mb-6">Category Performance</h3>
                    <div className="h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={categoryPerformance} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                                <XAxis type="number" hide />
                                <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 10, fontWeight: 700 }} />
                                <Tooltip cursor={{ fill: 'transparent' }} />
                                <Bar dataKey="value" radius={[0, 10, 10, 0]}>
                                    {categoryPerformance.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f59e0b'][index % 5]} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Vendor Payables */}
                <div className="bg-white p-10 rounded-[2.5rem] border border-slate-100 shadow-sm flex flex-col justify-center items-center text-center">
                    <div className="w-20 h-20 bg-rose-50 rounded-full flex items-center justify-center text-4xl mb-6">📉</div>
                    <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Total Vendor Liabilities</p>
                    <h2 className="text-5xl font-black text-slate-900 font-mono tracking-tighter mb-4">Rs. {Math.round(kpiStats.vendorPayables).toLocaleString()}</h2>
                    <p className="text-[10px] font-bold text-rose-500 uppercase tracking-widest bg-rose-50 px-4 py-2 rounded-xl">Outstanding Payments</p>
                </div>
            </div>

        </div>
    );
};

export default KPI;
