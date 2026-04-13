
import React, { useMemo } from 'react';
import { Transaction, Product, BankAccount, View, PurchaseOrder, DaySession, Customer, Vendor, Category, UserProfile } from '../types';
import { ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell, Legend, PieChart, Pie } from 'recharts';

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

    const getMonthFirst = () => {
        const d = new Date();
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-01';
    };
    const monthFirst = getMonthFirst();

    const [branchFilter, setBranchFilter] = React.useState<'ALL' | string>('ALL');
    const [startDate, setStartDate] = React.useState(monthFirst);
    const [endDate, setEndDate] = React.useState(today);

    // Removed auto-sync to userProfile.branch to default to 'ALL'

    const normalizeBranch = (b?: string): string => {
        if (!b) return 'CASHIER 1';
        const upper = b.trim().toUpperCase();
        if (upper === 'LOCAL NODE' || upper === 'BOOKSHOP' || upper === 'SHOP 2' || upper === 'MAIN BRANCH' || upper === 'NO 16,KIRULAPANA SUPERMARKET ,COLOMBO 05') {
            return 'CASHIER 1';
        }
        return b;
    };



    // Helper to get reload commission rate based on provider
    const getReloadRate = (txDescription: string = '', productName: string = '') => {
        const desc = txDescription.toUpperCase();
        const name = productName.toUpperCase();
        const isMobitelOrHutch =
            desc.includes('MOBITEL') || desc.includes('HUTCH') ||
            name.includes('MOBITEL') || name.includes('HUTCH');
        return isMobitelOrHutch ? 0.06 : 0.04;
    };

    // Helper to identify a hot reload item robustly (Digital only, excludes RELOAD CARD)
    const isHotReloadItem = (item: any, product: Product | undefined, category: Category | undefined, txDescription: string = '') => {
        const pName = (product?.name || "").toUpperCase();
        const cName = (category?.name || "").toUpperCase();
        const pId = (item.productId || "").toUpperCase();
        const desc = txDescription.toUpperCase();

        if (cName.includes('CARD')) return false;

        return cName.includes('RELOAD') ||
            pName.includes('RELOAD') ||
            pId.includes('RELOAD') ||
            desc.includes('RELOAD') ||
            pName.includes('DIALOG') || pName.includes('MOBITEL') || pName.includes('AIRTEL') || pName.includes('HUTCH') ||
            cName.includes('DIALOG') || cName.includes('MOBITEL') || cName.includes('AIRTEL') || cName.includes('HUTCH');
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
            .reduce((acc, t) => {
                if (!t.items) return acc + Number(t.amount || 0);

                const txRev = t.items.reduce((itemAcc, item) => {
                    const product = products.find(p => p.id === item.productId);
                    const category = categories.find(c => c.id === product?.categoryId);
                    const lineTotal = (Number(item.quantity) * Number(item.price)) - (Number(item.discount) || 0);

                    if (isHotReloadItem(item, product, category, t.description)) {
                        return itemAcc + (lineTotal * getReloadRate(t.description, product?.name));
                    }
                    return itemAcc + lineTotal;
                }, 0);
                return acc + txRev;
            }, 0);

        const manualPurchases = filteredTxs
            .filter(t => t.type === 'PURCHASE' && !t.id.startsWith('PU-'))
            .reduce((acc, t) => acc + Number(t.amount || 0), 0);

        const poPurchases = (purchaseOrders || []).filter(po => {
            const poBranch = normalizeBranch(po.branchId);
            const target = normalizeBranch(branchFilter);
            const branchMatch = branchFilter === 'ALL' || poBranch === target;
            const txDate = po.date.split('T')[0];
            const dateMatch = (!startDate || txDate >= startDate) && (!endDate || txDate <= endDate);
            return branchMatch && dateMatch && po.status !== 'DRAFT';
        }).reduce((acc, po) => acc + Number(po.totalAmount || 0), 0);

        const totalPurchases = manualPurchases + poPurchases;

        const totalExpenses = filteredTxs
            .filter(t => t.type === 'EXPENSE')
            .reduce((acc, t) => acc + Number(t.amount || 0), 0);

        const pendingCredit = customers.reduce((acc, c) => acc + Number(c.totalCredit || 0), 0);
        const vendorPayables = vendors.reduce((acc, v) => acc + Number(v.totalBalance || 0), 0);

        // Calculate Profit (for the filtered period)
        let totalCost = 0;
        filteredTxs.filter(t => t.type === 'SALE').forEach(t => {
            // Must rely on items to exclude Reload Cost (because Net Revenue model used)
            if (t.items) {
                t.items.forEach(i => {
                    const p = products.find(prod => prod.id === i.productId);
                    const category = categories.find(c => c.id === p?.categoryId);
                    if (p && !isHotReloadItem(i, p, category, t.description)) {
                        totalCost += Number(p.cost || 0) * Number(i.quantity);
                    }
                });
            } else if (t.costBasis) {
                totalCost += t.costBasis;
            }
        });

        const netRevenue = totalRevenue - totalPurchases;
        const profit = totalRevenue - totalCost - totalExpenses; // Purchases now deducted from Revenue, not Profit
        const margin = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0;

        return { totalRevenue, totalExpenses, totalPurchases, pendingCredit, vendorPayables, profit, margin };
    }, [transactions, products, customers, vendors, branchFilter, startDate, endDate, categories]);

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
                    const category = categories.find(c => c.id === catId);
                    const lineTotal = i.quantity * i.price; // Gross
                    const value = isHotReloadItem(i, p, category, t.description) ? lineTotal * getReloadRate(t.description, p?.name) : lineTotal;

                    catMap[catName] = (catMap[catName] || 0) + value;
                }
            });
        });

        return Object.entries(catMap)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 5);
    }, [transactions, products, categories, branchFilter, startDate, endDate]);

    const profitContributionByCategory = useMemo(() => {
        const catProfitMap: Record<string, number> = {};

        transactions.filter(t => t.type === 'SALE' || t.type === 'SALE_HISTORY_IMPORT').forEach(t => {
            const tBranch = normalizeBranch(t.branchId);
            const target = normalizeBranch(branchFilter);
            if (branchFilter !== 'ALL' && tBranch !== target) return;

            const txDate = t.date.split('T')[0];
            if ((startDate && txDate < startDate) || (endDate && txDate > endDate)) return;

            if (t.items) {
                t.items.forEach(item => {
                    const product = products.find(p => p.id === item.productId);
                    const catId = product?.categoryId || 'Uncategorized';
                    const catName = categories.find(c => c.id === catId)?.name || 'Uncategorized';
                    const category = categories.find(c => c.id === catId);

                    const lineTotal = (Number(item.quantity) * Number(item.price)) - (Number(item.discount) || 0);

                    const cost = Number(product?.cost || 0) * Number(item.quantity);
                    let profit = 0;
                    if (isHotReloadItem(item, product, category, t.description)) {
                        profit = lineTotal * getReloadRate(t.description, product?.name);
                    } else {
                        profit = lineTotal - cost;
                    }

                    catProfitMap[catName] = (catProfitMap[catName] || 0) + profit;
                });
            }
        });

        const totalProfitInCategory = Object.values(catProfitMap).reduce((acc, v) => acc + v, 0);

        return Object.entries(catProfitMap)
            .map(([name, value]) => ({
                name,
                value: Math.max(0, value), // Ensure no negative values for pie chart
                percentage: totalProfitInCategory > 0 ? (value / totalProfitInCategory) * 100 : 0
            }))
            .sort((a, b) => b.value - a.value);
    }, [transactions, products, categories, branchFilter, startDate, endDate]);

    const topProductsByProfit = useMemo(() => {
        const productProfitMap: Record<string, { name: string; profit: number }> = {};

        transactions.filter(t => t.type === 'SALE' || t.type === 'SALE_HISTORY_IMPORT').forEach(t => {
            const tBranch = normalizeBranch(t.branchId);
            const target = normalizeBranch(branchFilter);
            if (branchFilter !== 'ALL' && tBranch !== target) return;

            const txDate = t.date.split('T')[0];
            if ((startDate && txDate < startDate) || (endDate && txDate > endDate)) return;

            if (t.items) {
                t.items.forEach(item => {
                    const product = products.find(p => p.id === item.productId);
                    if (!product) return;

                    const category = categories.find(c => c.id === product.categoryId);
                    const lineTotal = (Number(item.quantity) * Number(item.price)) - (Number(item.discount) || 0);

                    const cost = Number(product.cost || 0) * Number(item.quantity);
                    let profit = 0;
                    if (isHotReloadItem(item, product, category, t.description)) {
                        profit = lineTotal * getReloadRate(t.description, product.name);
                    } else {
                        profit = lineTotal - cost;
                    }

                    if (!productProfitMap[product.id]) {
                        productProfitMap[product.id] = { name: product.name, profit: 0 };
                    }
                    productProfitMap[product.id].profit += profit;
                });
            }
        });

        return Object.values(productProfitMap)
            .sort((a, b) => b.profit - a.profit)
            .slice(0, 10);
    }, [transactions, products, categories, branchFilter, startDate, endDate]);


    const hourlyRevenue = useMemo(() => {
        const hours = Array.from({ length: 24 }, (_, i) => ({
            hour: i,
            time: `${i}:00`,
            generalRevenue: 0,
            reloadRevenue: 0,
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
                if (t.items) {
                    t.items.forEach(item => {
                        const product = products.find(p => p.id === item.productId);
                        const category = categories.find(c => c.id === product?.categoryId);
                        const lineTotal = (Number(item.quantity) * Number(item.price)) - (Number(item.discount) || 0);

                        if (isHotReloadItem(item, product, category, t.description)) {
                            hours[hour].reloadRevenue += (lineTotal * getReloadRate(t.description, product?.name));
                        } else {
                            hours[hour].generalRevenue += lineTotal;
                        }
                    });
                } else {
                    // Fallback for old transactions without items
                    hours[hour].generalRevenue += Number(t.amount || 0);
                }
                hours[hour].salesCount += 1;
            }
        });

        return hours;
    }, [transactions, branchFilter, startDate, endDate, products, categories]);

    const last30DaysProfit = useMemo(() => {
        const stats: Record<string, number> = {};
        const dates: string[] = [];

        // Initialize last 30 days
        for (let i = 29; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().split('T')[0];
            stats[dateStr] = 0;
            dates.push(dateStr);
        }

        transactions.forEach(t => {
            const tDate = t.date.split('T')[0];
            if (!stats.hasOwnProperty(tDate)) return;

            // Branch filter
            const tBranch = normalizeBranch(t.branchId);
            const target = normalizeBranch(branchFilter);
            if (branchFilter !== 'ALL' && tBranch !== target) return;

            if (t.type === 'SALE' || t.type === 'SALE_HISTORY_IMPORT') {
                if (t.items) {
                    t.items.forEach(i => {
                        const p = products.find(prod => prod.id === i.productId);
                        const category = categories.find(c => c.id === p?.categoryId);
                        const lineTotal = (Number(i.quantity) * Number(i.price)) - (Number(i.discount) || 0);

                        if (isHotReloadItem(i, p, category, t.description)) {
                            stats[tDate] += (lineTotal * getReloadRate(t.description, p?.name));
                        } else {
                            const cost = Number(p?.cost || 0) * Number(i.quantity);
                            stats[tDate] += (lineTotal - cost);
                        }
                    });
                } else {
                    stats[tDate] += Number(t.amount || 0);
                }
            } else if (t.type === 'EXPENSE') {
                stats[tDate] -= Number(t.amount || 0);
            }
        });

        let runningTotal = 0;
        return dates.map(date => {
            const d = new Date(date);
            runningTotal += stats[date];
            return {
                date: `${d.getDate()}/${d.getMonth() + 1}`,
                profit: stats[date],
                cumulative: runningTotal
            };
        });
    }, [transactions, products, categories, branchFilter]);

    const dailyFinancials = useMemo(() => {
        const stats: Record<string, { sales: number; profit: number; expense: number; purchase: number }> = {};
        const dates: string[] = [];

        // Initialize last 30 days
        for (let i = 29; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().split('T')[0];
            stats[dateStr] = { sales: 0, profit: 0, expense: 0, purchase: 0 };
            dates.push(dateStr);
        }

        transactions.forEach(t => {
            const tDate = t.date.split('T')[0];
            if (!stats.hasOwnProperty(tDate)) return;

            // Branch filter
            const tBranch = normalizeBranch(t.branchId);
            const target = normalizeBranch(branchFilter);
            if (branchFilter !== 'ALL' && tBranch !== target) return;

            if (t.type === 'SALE' || t.type === 'SALE_HISTORY_IMPORT') {
                const amount = Number(t.amount || 0);
                stats[tDate].sales += amount;

                if (t.items && t.items.length > 0) {
                    t.items.forEach(i => {
                        const p = products.find(prod => prod.id === i.productId);
                        const category = categories.find(c => c.id === p?.categoryId);
                        const lineTotal = (Number(i.quantity) * Number(i.price)) - (Number(i.discount) || 0);

                        if (isHotReloadItem(i, p, category, t.description)) {
                            stats[tDate].profit += (lineTotal * getReloadRate(t.description, p?.name));
                        } else {
                            const cost = Number(p?.cost || 0) * Number(i.quantity);
                            stats[tDate].profit += (lineTotal - cost);
                        }
                    });
                } else {
                    if (t.costBasis) {
                        stats[tDate].profit += (amount - t.costBasis);
                    } else {
                        stats[tDate].profit += amount;
                    }
                }
            } else if (t.type === 'EXPENSE') {
                const amount = Number(t.amount || 0);
                stats[tDate].expense += amount;
                stats[tDate].profit -= amount;
            } else if (t.type === 'PURCHASE' && !t.id.startsWith('PU-')) {
                const amount = Number(t.amount || 0);
                stats[tDate].purchase += amount;
                stats[tDate].sales -= amount; // Deduct from sales/revenue per user request
            }
        });

        // Add POs to daily financials
        (purchaseOrders || []).forEach(po => {
            const poDate = po.date.split('T')[0];
            if (!stats.hasOwnProperty(poDate)) return;

            const tBranch = normalizeBranch(po.branchId);
            const target = normalizeBranch(branchFilter);
            if (branchFilter !== 'ALL' && tBranch !== target) return;

            if (po.status !== 'DRAFT') {
                const amount = Number(po.totalAmount || 0);
                stats[poDate].purchase += amount;
                stats[poDate].sales -= amount; // Deduct from sales/revenue per user request
            }
        });

        let cumulativeProfit = 0;
        return dates.map(date => {
            const d = new Date(date);
            cumulativeProfit += stats[date].profit;
            return {
                date: d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' }),
                sales: stats[date].sales,
                profit: stats[date].profit,
                cumulativeProfit: cumulativeProfit
            };
        });
    }, [transactions, products, categories, branchFilter]);

    // Reload Sales by Day (Last 30 Days fixed window) - Grouped by Provider
    const reloadSalesByDay = useMemo(() => {
        const stats: Record<string, { dialog: number; mobitel: number; airtel: number; hutch: number }> = {};
        const dates: string[] = [];

        // Always show last 30 days (independent of KPI date filter)
        for (let i = 29; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().split('T')[0];
            stats[dateStr] = { dialog: 0, mobitel: 0, airtel: 0, hutch: 0 };
            dates.push(dateStr);
        }

        transactions.forEach(t => {
            const tDate = t.date.split('T')[0];
            if (!stats.hasOwnProperty(tDate)) return;

            // Branch filter
            const tBranch = normalizeBranch(t.branchId);
            const target = normalizeBranch(branchFilter);
            if (branchFilter !== 'ALL' && tBranch !== target) return;

            if (t.type === 'SALE') {
                const desc = (t.description || '').toUpperCase();

                if (t.items) {
                    t.items.forEach(i => {
                        const p = products.find(prod => prod.id === i.productId);
                        const category = categories.find(c => c.id === p?.categoryId);

                        if (isHotReloadItem(i, p, category, t.description)) {
                            const lineTotal = (Number(i.quantity) * Number(i.price)) - (Number(i.discount) || 0);

                            // Determine provider from product name first, then description
                            const pName = (p?.name || '').toUpperCase();
                            if (desc.includes('DIALOG') || pName.includes('DIALOG')) {
                                stats[tDate].dialog += lineTotal;
                            } else if (desc.includes('MOBITEL') || pName.includes('MOBITEL')) {
                                stats[tDate].mobitel += lineTotal;
                            } else if (desc.includes('AIRTEL') || pName.includes('AIRTEL')) {
                                stats[tDate].airtel += lineTotal;
                            } else if (desc.includes('HUTCH') || pName.includes('HUTCH')) {
                                stats[tDate].hutch += lineTotal;
                            } else {
                                // Generic reload — bucket into dialog as fallback
                                stats[tDate].dialog += lineTotal;
                            }
                        }
                    });
                } else {
                    // Fallback for old transactions without items: check if it looks like a reload
                    if (desc.includes('RELOAD')) {
                        const amount = Number(t.amount || 0);
                        if (desc.includes('DIALOG')) {
                            stats[tDate].dialog += amount;
                        } else if (desc.includes('MOBITEL')) {
                            stats[tDate].mobitel += amount;
                        } else if (desc.includes('AIRTEL')) {
                            stats[tDate].airtel += amount;
                        } else if (desc.includes('HUTCH')) {
                            stats[tDate].hutch += amount;
                        } else {
                            stats[tDate].dialog += amount;
                        }
                    }
                }
            }
        });

        return dates.map(date => {
            return {
                date: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                dialog: Math.round(stats[date].dialog),
                mobitel: Math.round(stats[date].mobitel),
                airtel: Math.round(stats[date].airtel),
                hutch: Math.round(stats[date].hutch)
            };
        });
    }, [transactions, branchFilter, products, categories]);

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
                            {userProfile.isAdmin && <option value="ALL">All Terminals</option>}
                            {userProfile.allBranches
                                .filter(b => {
                                    if (!userProfile.isAdmin && userProfile.branch === 'CASHIER 2' && b === 'CASHIER 1') return false;
                                    return true;
                                })
                                .map(b => (
                                    <option key={b} value={b}>{b}</option>
                                ))}
                        </select>
                    )}
                </div>
            </header>

            {/* KPI Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
                {/* Revenue */}
                <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm hover:shadow-lg transition-all">
                    <div className="flex justify-between items-start mb-4">
                        <div className="p-3 bg-indigo-50 rounded-2xl text-2xl">💰</div>
                        <span className="text-[9px] font-black uppercase bg-indigo-100 text-indigo-700 px-2 py-1 rounded-lg">Total</span>
                    </div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Revenue</p>
                    <p className="text-2xl font-black text-slate-900 font-mono">Rs. {Math.round(kpiStats.totalRevenue).toLocaleString()}</p>
                </div>

                {/* Expenses */}
                <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm hover:shadow-lg transition-all">
                    <div className="flex justify-between items-start mb-4">
                        <div className="p-3 bg-rose-50 rounded-2xl text-2xl">💸</div>
                        <span className="text-[9px] font-black uppercase bg-rose-100 text-rose-700 px-2 py-1 rounded-lg">Expenses</span>
                    </div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Expenses</p>
                    <p className="text-2xl font-black text-rose-600 font-mono">Rs. {Math.round(kpiStats.totalExpenses).toLocaleString()}</p>
                </div>

                {/* Purchases */}
                <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm hover:shadow-lg transition-all">
                    <div className="flex justify-between items-start mb-4">
                        <div className="p-3 bg-orange-50 rounded-2xl text-2xl">📦</div>
                        <span className="text-[9px] font-black uppercase bg-orange-100 text-orange-700 px-2 py-1 rounded-lg">Purchases</span>
                    </div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Purchases</p>
                    <p className="text-2xl font-black text-orange-600 font-mono">Rs. {Math.round(kpiStats.totalPurchases).toLocaleString()}</p>
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



            {/* Daily Financial Performance Chart */}
            <div className="bg-white p-10 rounded-[2.5rem] border border-slate-100 shadow-sm">
                <div className="flex justify-between items-center mb-8">
                    <div>
                        <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">Daily Financial Trend</h3>
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Revenue vs Net Profit & Cumulative Growth</p>
                    </div>
                    <div className="flex flex-col items-end bg-purple-50 px-4 py-2 rounded-2xl border border-purple-100">
                        <span className="text-[8px] font-black text-purple-400 uppercase tracking-widest">30-Day Cumulative Profit</span>
                        <span className="text-xl font-black font-mono text-purple-600 tracking-tight">Rs. {Math.round(dailyFinancials[dailyFinancials.length - 1]?.cumulativeProfit || 0).toLocaleString()}</span>
                    </div>
                </div>
                <div className="h-[350px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={dailyFinancials} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis dataKey="date" tick={{ fontSize: 9, fontWeight: 700, fill: '#64748b' }} axisLine={false} tickLine={false} />
                            <YAxis yAxisId="left" tick={{ fontSize: 9, fontWeight: 700, fill: '#64748b' }} axisLine={false} tickLine={false} tickFormatter={(value) => `Rs.${(value / 1000).toFixed(0)}k`} />
                            <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 9, fontWeight: 700, fill: '#8b5cf6' }} axisLine={false} tickLine={false} tickFormatter={(value) => `Rs.${(value / 1000).toFixed(0)}k`} />
                            <Tooltip
                                cursor={{ fill: '#f8fafc' }}
                                contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '11px', fontWeight: 'bold' }}
                                formatter={(value: number) => `Rs. ${Math.round(value).toLocaleString()}`}
                            />
                            <Legend wrapperStyle={{ fontSize: '10px', fontWeight: '800', textTransform: 'uppercase', paddingTop: '10px' }} />
                            <Bar yAxisId="left" dataKey="sales" name="Sales Revenue" fill="#e2e8f0" radius={[4, 4, 0, 0]} barSize={12} />
                            <Bar yAxisId="left" dataKey="profit" name="Net Profit" fill="#10b981" radius={[4, 4, 0, 0]} barSize={12} />
                            <Line yAxisId="right" type="monotone" dataKey="cumulativeProfit" name="Cumulative Profit" stroke="#8b5cf6" strokeWidth={3} dot={false} />
                        </ComposedChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Reload Performance Chart */}
            <div className="bg-white p-10 rounded-[2.5rem] border border-slate-100 shadow-sm">
                <div className="flex justify-between items-center mb-8">
                    <div>
                        <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">Reload Performance</h3>
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Provider Breakdown by Date</p>
                    </div>
                    <div className="flex items-center gap-6">
                        <div className="flex flex-col items-end bg-emerald-50 px-4 py-2 rounded-2xl border border-emerald-100">
                            <span className="text-[8px] font-black text-emerald-400 uppercase tracking-widest">30-Day Sales Revenue</span>
                            <span className="text-xl font-black font-mono text-emerald-600 tracking-tight">Rs. {Math.round(reloadSalesByDay.reduce((acc, d) => acc + d.dialog + d.mobitel + d.airtel + d.hutch, 0)).toLocaleString()}</span>
                        </div>
                        <div className="flex gap-4">
                            <div className="flex items-center gap-1">
                                <div className="w-2 h-2 rounded-full bg-[#b90000]"></div>
                                <span className="text-[8px] font-black text-slate-400 uppercase">Dialog</span>
                            </div>
                            <div className="flex items-center gap-1">
                                <div className="w-2 h-2 rounded-full bg-[#0056b3]"></div>
                                <span className="text-[8px] font-black text-slate-400 uppercase">Mobitel</span>
                            </div>
                            <div className="flex items-center gap-1">
                                <div className="w-2 h-2 rounded-full bg-[#10b981]"></div>
                                <span className="text-[8px] font-black text-slate-400 uppercase">Airtel</span>
                            </div>
                            <div className="flex items-center gap-1">
                                <div className="w-2 h-2 rounded-full bg-[#eab308]"></div>
                                <span className="text-[8px] font-black text-slate-400 uppercase">Hutch</span>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={reloadSalesByDay} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis
                                dataKey="date"
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
                                formatter={(value: number, name: string) => {
                                    const providerLabels: Record<string, string> = {
                                        dialog: 'Dialog',
                                        mobitel: 'Mobitel',
                                        airtel: 'Airtel',
                                        hutch: 'Hutch'
                                    };
                                    return [`Rs. ${value.toLocaleString()}`, providerLabels[name] || name];
                                }}
                            />
                            <Bar dataKey="dialog" stackId="a" fill="#b90000" radius={[0, 0, 0, 0]} />
                            <Bar dataKey="mobitel" stackId="a" fill="#0056b3" radius={[0, 0, 0, 0]} />
                            <Bar dataKey="airtel" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} />
                            <Bar dataKey="hutch" stackId="a" fill="#eab308" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Hourly Sales Distribution */}
            <div className="bg-white p-10 rounded-[2.5rem] border border-slate-100 shadow-sm">
                <div className="flex justify-between items-center mb-8">
                    <div>
                        <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">Hourly Sales Distribution</h3>
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Identifying peak transaction hours</p>
                    </div>
                    <div className="flex gap-4">
                        <div className="flex items-center gap-1">
                            <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
                            <span className="text-[8px] font-black text-slate-400 uppercase">General Revenue</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <div className="w-2 h-2 rounded-full bg-orange-500"></div>
                            <span className="text-[8px] font-black text-slate-400 uppercase">Reload / Airtime</span>
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
                                formatter={(value: number, name: string) => [`Rs. ${value.toLocaleString()}`, name === 'generalRevenue' ? 'General' : 'Reload']}
                            />
                            <Bar dataKey="generalRevenue" name="General" fill="#6366f1" radius={[4, 4, 0, 0]} barSize={12} />
                            <Bar dataKey="reloadRevenue" name="Reload" fill="#f97316" radius={[4, 4, 0, 0]} barSize={12} />
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

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Profit Contribution Chart */}
                <div className="bg-white p-10 rounded-[2.5rem] border border-slate-100 shadow-sm">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">Profit Contribution</h3>
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Share of Total Profit by Category</p>
                    </div>
                    {profitContributionByCategory.length > 0 ? (
                        <div className="flex flex-col md:flex-row items-center gap-8">
                            <div className="h-[250px] w-full md:w-1/2">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={profitContributionByCategory}
                                            dataKey="value"
                                            nameKey="name"
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={60}
                                            outerRadius={80}
                                            paddingAngle={5}
                                        >
                                            {profitContributionByCategory.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f59e0b', '#10b981', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6'][index % 10]} />
                                            ))}
                                        </Pie>
                                        <Tooltip
                                            contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '11px', fontWeight: 'bold' }}
                                            formatter={(value: number) => `Rs. ${Math.round(value).toLocaleString()}`}
                                        />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                            <div className="w-full md:w-1/2 space-y-3">
                                {profitContributionByCategory.slice(0, 5).map((cat, idx) => (
                                    <div key={cat.name} className="flex justify-between items-center bg-slate-50 p-3 rounded-xl border border-slate-100">
                                        <div className="flex items-center gap-3">
                                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f59e0b'][idx % 5] }}></div>
                                            <span className="text-[10px] font-black text-slate-600 uppercase tracking-tight truncate max-w-[100px]">{cat.name}</span>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-[10px] font-black text-slate-900 font-mono">Rs. {Math.round(cat.value).toLocaleString()}</p>
                                            <p className="text-[8px] font-bold text-slate-400">{cat.percentage.toFixed(1)}%</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="h-[250px] flex flex-col items-center justify-center text-slate-300">
                            <span className="text-4xl mb-2">🥧</span>
                            <p className="text-[10px] font-black uppercase tracking-widest">No profit data available for this range</p>
                        </div>
                    )}
                </div>

                {/* Top 10 Products by Profit */}
                <div className="bg-white p-10 rounded-[2.5rem] border border-slate-100 shadow-sm">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">Top 10 Products by Profit</h3>
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Highest profit yielding items</p>
                    </div>
                    <div className="space-y-4 max-h-[250px] overflow-y-auto pr-2">
                        {topProductsByProfit.length > 0 ? topProductsByProfit.map((prod, idx) => (
                            <div key={idx} className="flex justify-between items-center group">
                                <div className="flex items-center gap-4">
                                    <span className="w-6 h-6 flex items-center justify-center bg-slate-100 text-[10px] font-black text-slate-400 rounded-lg group-hover:bg-indigo-600 group-hover:text-white transition-all">{idx + 1}</span>
                                    <span className="text-xs font-bold text-slate-700 group-hover:text-indigo-600 transition-all truncate max-w-[180px]">{prod.name}</span>
                                </div>
                                <div className="bg-emerald-50 px-3 py-1 rounded-lg">
                                    <span className="text-[10px] font-black text-emerald-600 font-mono">Rs. {Math.round(prod.profit).toLocaleString()}</span>
                                </div>
                            </div>
                        )) : (
                            <div className="h-full flex flex-col items-center justify-center text-slate-300 py-10">
                                <span className="text-4xl mb-2">📊</span>
                                <p className="text-[10px] font-black uppercase tracking-widest">No data available</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>


        </div>
    );
};

export default KPI;
