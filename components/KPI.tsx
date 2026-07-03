
import React, { useMemo, useState } from 'react';
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
        if (pName.includes('SIM') || cName.includes('SIM') || desc.includes('SIM')) return false;

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
            
            const isValidStatus = t.status !== 'DRAFT' && t.status !== 'VOID';

            return branchMatch && dateMatch && isValidStatus;
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

            if (!branchMatch || !dateMatch || t.status === 'DRAFT' || t.status === 'VOID') return;

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
            if (t.status === 'DRAFT' || t.status === 'VOID') return;

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
            if (t.status === 'DRAFT' || t.status === 'VOID') return;

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

            if (!branchMatch || !dateMatch || t.status === 'DRAFT' || t.status === 'VOID') return;

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
            if (t.status === 'DRAFT' || t.status === 'VOID') return;

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
            if (t.status === 'DRAFT' || t.status === 'VOID') return;

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
            if (t.status === 'DRAFT' || t.status === 'VOID') return;

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

            {/* Editable Pivot Table: Category × Month Sales Revenue */}
            <PivotTable
                transactions={transactions}
                products={products}
                categories={categories}
                branchFilter={branchFilter}
                normalizeBranch={normalizeBranch}
                isHotReloadItem={isHotReloadItem}
                getReloadRate={getReloadRate}
            />


        </div>
    );
};

export default KPI;

// ─── PivotTable Sub-Component ────────────────────────────────────────

interface PivotTableProps {
    transactions: Transaction[];
    products: Product[];
    categories: Category[];
    branchFilter: string;
    normalizeBranch: (b?: string) => string;
    isHotReloadItem: (item: any, product: Product | undefined, category: Category | undefined, txDescription?: string) => boolean;
    getReloadRate: (txDescription?: string, productName?: string) => number;
}

const PivotTable: React.FC<PivotTableProps> = ({
    transactions, products, categories, branchFilter, normalizeBranch, isHotReloadItem, getReloadRate
}) => {
    const [editOverrides, setEditOverrides] = useState<Record<string, number>>({});
    const [editingCell, setEditingCell] = useState<string | null>(null);
    const [editValue, setEditValue] = useState('');
    const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
    const [selectedMonths, setSelectedMonths] = useState<Set<number>>(new Set());
    const [selectedTerminals, setSelectedTerminals] = useState<Set<string>>(new Set());
    const [showCatFilter, setShowCatFilter] = useState(false);
    const [showMonthFilter, setShowMonthFilter] = useState(false);
    const [showTerminalFilter, setShowTerminalFilter] = useState(false);

    // Compute pivot data
    const pivotData = useMemo(() => {
        const map: Record<string, Record<number, number>> = {};
        const revMap: Record<string, Record<number, number>> = {};
        const profitMap: Record<string, Record<number, number>> = {};
        const terminalRevMap: Record<string, Record<number, number>> = {};
        const monthSet = new Set<number>();
        const terminalSet = new Set<string>();

        transactions.filter(t => (t.type === 'SALE' || t.type === 'SALE_HISTORY_IMPORT') && t.status !== 'DRAFT' && t.status !== 'VOID').forEach(t => {
            const tBranch = normalizeBranch(t.branchId);
            const target = normalizeBranch(branchFilter);
            if (branchFilter !== 'ALL' && tBranch !== target) return;

            terminalSet.add(tBranch);

            if (selectedTerminals.size > 0 && !selectedTerminals.has(tBranch)) return;

            const txDate = new Date(t.date);
            const month = txDate.getMonth() + 1;
            monthSet.add(month);

            if (!terminalRevMap[tBranch]) terminalRevMap[tBranch] = {};

            if (t.items) {
                t.items.forEach(item => {
                    const product = products.find(p => p.id === item.productId);
                    const catId = product?.categoryId || 'Uncategorized';
                    const categoryObj = categories.find(c => c.id === catId);
                    const catName = categoryObj?.name || 'Uncategorized';
                    const lineTotal = (Number(item.quantity) * Number(item.price)) - (Number(item.discount) || 0);
                    
                    let rev = lineTotal;
                    let profit = 0;
                    const cost = Number(product?.cost || 0) * Number(item.quantity);
                    
                    if (isHotReloadItem(item, product, categoryObj, t.description)) {
                        rev = lineTotal * getReloadRate(t.description, product?.name);
                        profit = rev;
                    } else {
                        profit = lineTotal - cost;
                    }

                    if (!map[catName]) map[catName] = {};
                    map[catName][month] = (map[catName][month] || 0) + lineTotal;

                    if (!revMap[catName]) revMap[catName] = {};
                    revMap[catName][month] = (revMap[catName][month] || 0) + rev;

                    if (!profitMap[catName]) profitMap[catName] = {};
                    profitMap[catName][month] = (profitMap[catName][month] || 0) + profit;

                    terminalRevMap[tBranch][month] = (terminalRevMap[tBranch][month] || 0) + rev;
                });
            } else {
                const catName = (t.category || t.mainCategory || 'Uncategorized').toUpperCase();
                if (!map[catName]) map[catName] = {};
                map[catName][month] = (map[catName][month] || 0) + Number(t.amount || 0);

                if (!revMap[catName]) revMap[catName] = {};
                revMap[catName][month] = (revMap[catName][month] || 0) + Number(t.amount || 0);

                if (!profitMap[catName]) profitMap[catName] = {};
                const isReload = catName.includes('RELOAD');
                const amt = Number(t.amount || 0);
                profitMap[catName][month] = (profitMap[catName][month] || 0) + (isReload ? amt * 0.05 : amt);

                const rev = Number(t.amount || 0);
                terminalRevMap[tBranch][month] = (terminalRevMap[tBranch][month] || 0) + rev;
            }
        });

        const allMonths = Array.from(monthSet).sort((a, b) => a - b);
        const allCategories = Object.keys(map).sort();
        const allTerminals = Array.from(terminalSet).sort();

        const months = selectedMonths.size > 0 ? allMonths.filter(m => selectedMonths.has(m)) : allMonths;
        const rows = Object.entries(map)
            .filter(([cat]) => selectedCategories.size === 0 || selectedCategories.has(cat))
            .map(([category, monthData]) => {
                const rowTotal = months.reduce((sum, m) => sum + (monthData[m] || 0), 0);
                return { category, monthData, rowTotal };
            })
            .sort((a, b) => b.rowTotal - a.rowTotal);

        const columnTotals: Record<number, number> = {};
        const revenueTotals: Record<number, number> = {};
        const profitTotals: Record<number, number> = {};

        months.forEach(m => {
            let colSum = 0;
            let revSum = 0;
            let profitSum = 0;
            rows.forEach(r => {
                const key = `${r.category}-${m}`;
                const originalVal = r.monthData[m] || 0;
                const val = editOverrides[key] !== undefined ? editOverrides[key] : originalVal;
                colSum += val;

                const originalRev = revMap[r.category]?.[m] || 0;
                const originalProfit = profitMap[r.category]?.[m] || 0;

                if (val === originalVal) {
                    revSum += originalRev;
                    profitSum += originalProfit;
                } else {
                    if (originalVal > 0) {
                        revSum += val * (originalRev / originalVal);
                        profitSum += val * (originalProfit / originalVal);
                    } else {
                        const isReload = r.category.toUpperCase().includes('RELOAD');
                        revSum += isReload ? val * 0.05 : val;
                        profitSum += isReload ? val * 0.05 : val;
                    }
                }
            });
            columnTotals[m] = colSum;
            revenueTotals[m] = revSum;
            profitTotals[m] = profitSum;
        });

        const scaledTerminalRev: Record<string, Record<number, number>> = {};
        allTerminals.forEach(t => {
            scaledTerminalRev[t] = {};
            months.forEach(m => {
                const originalTermRev = terminalRevMap[t]?.[m] || 0;
                const origTotal = rows.reduce((sum, r) => sum + (revMap[r.category]?.[m] || 0), 0);
                const scale = origTotal > 0 ? (revenueTotals[m] || 0) / origTotal : 1;
                scaledTerminalRev[t][m] = originalTermRev * scale;
            });
        });

        const grandTotal = Object.values(columnTotals).reduce((a, b) => a + b, 0);
        const grandRevenueTotal = Object.values(revenueTotals).reduce((a, b) => a + b, 0);
        const grandProfitTotal = Object.values(profitTotals).reduce((a, b) => a + b, 0);

        return { rows, months, columnTotals, grandTotal, revenueTotals, grandRevenueTotal, profitTotals, grandProfitTotal, allCategories, allMonths, allTerminals, scaledTerminalRev };
    }, [transactions, products, categories, branchFilter, editOverrides, selectedCategories, selectedMonths, selectedTerminals]);

    const getCellValue = (category: string, month: number, originalValue: number) => {
        const key = `${category}-${month}`;
        return editOverrides[key] !== undefined ? editOverrides[key] : originalValue;
    };

    const handleStartEdit = (category: string, month: number, value: number) => {
        const key = `${category}-${month}`;
        setEditingCell(key);
        setEditValue(value.toFixed(2));
    };

    const handleSaveEdit = (category: string, month: number) => {
        const key = `${category}-${month}`;
        const newVal = parseFloat(editValue);
        if (!isNaN(newVal)) setEditOverrides(prev => ({ ...prev, [key]: newVal }));
        setEditingCell(null);
        setEditValue('');
    };

    const handleCancelEdit = () => { setEditingCell(null); setEditValue(''); };
    const handleResetOverrides = () => { setEditOverrides({}); };

    const toggleCategory = (cat: string) => {
        setSelectedCategories(prev => {
            const next = new Set(prev);
            next.has(cat) ? next.delete(cat) : next.add(cat);
            return next;
        });
    };

    const toggleMonth = (m: number) => {
        setSelectedMonths(prev => {
            const next = new Set(prev);
            next.has(m) ? next.delete(m) : next.add(m);
            return next;
        });
    };

    const toggleTerminal = (t: string) => {
        setSelectedTerminals(prev => {
            const next = new Set(prev);
            next.has(t) ? next.delete(t) : next.add(t);
            return next;
        });
    };

    const handleExportCSV = () => {
        const { rows, months, columnTotals, grandTotal, revenueTotals, grandRevenueTotal, profitTotals, grandProfitTotal } = pivotData;
        const mn = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const headers = ['CATEGORY', ...months.map(m => mn[m]), 'ROW TOTAL'];
        const csvRows = rows.map(r => {
            const vals = months.map(m => getCellValue(r.category, m, r.monthData[m] || 0).toFixed(2));
            const rowTotal = months.reduce((sum, m) => sum + getCellValue(r.category, m, r.monthData[m] || 0), 0);
            return [r.category, ...vals, rowTotal.toFixed(2)];
        });
        const totalsRow = ['Grand Total', ...months.map(m => columnTotals[m].toFixed(2)), grandTotal.toFixed(2)];
        const revRow = ['Revenue', ...months.map(m => revenueTotals[m].toFixed(2)), grandRevenueTotal.toFixed(2)];
        const profitRow = ['Profit', ...months.map(m => profitTotals[m].toFixed(2)), grandProfitTotal.toFixed(2)];
        const csvContent = [headers.join(','), ...csvRows.map(r => r.join(',')), totalsRow.join(','), revRow.join(','), profitRow.join(',')].join('\n');
        const blob = new Blob(["\ufeff" + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `pivot_category_monthly_${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
    };

    const monthNames = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const { rows, months, columnTotals, grandTotal, revenueTotals, grandRevenueTotal, profitTotals, grandProfitTotal, allCategories, allMonths, allTerminals, scaledTerminalRev } = pivotData;
    const hasOverrides = Object.keys(editOverrides).length > 0;
    const hasFilters = selectedCategories.size > 0 || selectedMonths.size > 0 || selectedTerminals.size > 0;

    return (
        <div className="bg-white p-10 rounded-[2.5rem] border border-slate-100 shadow-sm">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                <div>
                    <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">Sales Pivot Table</h3>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Sum of Line Total (Rs) × Month # — Click cells to edit</p>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                    {/* Terminal Filter */}
                    <div className="relative">
                        <button
                            onClick={() => { setShowTerminalFilter(!showTerminalFilter); setShowCatFilter(false); setShowMonthFilter(false); }}
                            className={`px-4 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all active:scale-95 flex items-center gap-2 ${selectedTerminals.size > 0 ? 'bg-sky-50 text-sky-700 border-sky-200' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}
                        >
                            🏪 Terminal {selectedTerminals.size > 0 && <span className="bg-sky-600 text-white px-1.5 py-0.5 rounded-md text-[8px]">{selectedTerminals.size}</span>}
                            <span className="text-[8px]">▼</span>
                        </button>
                        {showTerminalFilter && (
                            <div className="absolute top-full left-0 mt-2 w-[200px] bg-white rounded-2xl border border-slate-200 shadow-xl z-50 p-3 max-h-[300px] overflow-y-auto">
                                <div className="flex justify-between items-center mb-2 pb-2 border-b border-slate-100">
                                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Filter Terminals</span>
                                    <button onClick={() => setSelectedTerminals(new Set())} className="text-[8px] font-black text-sky-500 uppercase hover:text-sky-700">Clear All</button>
                                </div>
                                {allTerminals.map(t => (
                                    <label key={t} className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-slate-50 cursor-pointer">
                                        <input type="checkbox" checked={selectedTerminals.has(t)} onChange={() => toggleTerminal(t)} className="rounded accent-sky-600" />
                                        <span className="text-[10px] font-bold text-slate-700 uppercase truncate">{t}</span>
                                    </label>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Category Filter */}
                    <div className="relative">
                        <button
                            onClick={() => { setShowCatFilter(!showCatFilter); setShowMonthFilter(false); setShowTerminalFilter(false); }}
                            className={`px-4 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all active:scale-95 flex items-center gap-2 ${selectedCategories.size > 0 ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}
                        >
                            🏷️ Category {selectedCategories.size > 0 && <span className="bg-indigo-600 text-white px-1.5 py-0.5 rounded-md text-[8px]">{selectedCategories.size}</span>}
                            <span className="text-[8px]">▼</span>
                        </button>
                        {showCatFilter && (
                            <div className="absolute top-full left-0 mt-2 w-[220px] bg-white rounded-2xl border border-slate-200 shadow-xl z-50 p-3 max-h-[300px] overflow-y-auto">
                                <div className="flex justify-between items-center mb-2 pb-2 border-b border-slate-100">
                                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Filter Categories</span>
                                    <button onClick={() => setSelectedCategories(new Set())} className="text-[8px] font-black text-indigo-500 uppercase hover:text-indigo-700">Clear All</button>
                                </div>
                                {allCategories.map(cat => (
                                    <label key={cat} className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-slate-50 cursor-pointer">
                                        <input type="checkbox" checked={selectedCategories.has(cat)} onChange={() => toggleCategory(cat)} className="rounded accent-indigo-600" />
                                        <span className="text-[10px] font-bold text-slate-700 uppercase truncate">{cat}</span>
                                    </label>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Month Filter */}
                    <div className="relative">
                        <button
                            onClick={() => { setShowMonthFilter(!showMonthFilter); setShowCatFilter(false); setShowTerminalFilter(false); }}
                            className={`px-4 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all active:scale-95 flex items-center gap-2 ${selectedMonths.size > 0 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}
                        >
                            📅 Month {selectedMonths.size > 0 && <span className="bg-emerald-600 text-white px-1.5 py-0.5 rounded-md text-[8px]">{selectedMonths.size}</span>}
                            <span className="text-[8px]">▼</span>
                        </button>
                        {showMonthFilter && (
                            <div className="absolute top-full left-0 mt-2 w-[180px] bg-white rounded-2xl border border-slate-200 shadow-xl z-50 p-3">
                                <div className="flex justify-between items-center mb-2 pb-2 border-b border-slate-100">
                                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Filter Months</span>
                                    <button onClick={() => setSelectedMonths(new Set())} className="text-[8px] font-black text-emerald-500 uppercase hover:text-emerald-700">Clear All</button>
                                </div>
                                {allMonths.map(m => (
                                    <label key={m} className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-slate-50 cursor-pointer">
                                        <input type="checkbox" checked={selectedMonths.has(m)} onChange={() => toggleMonth(m)} className="rounded accent-emerald-600" />
                                        <span className="text-[10px] font-bold text-slate-700 uppercase">{monthNames[m]}</span>
                                    </label>
                                ))}
                            </div>
                        )}
                    </div>

                    {hasFilters && (
                        <button onClick={() => { setSelectedCategories(new Set()); setSelectedMonths(new Set()); setSelectedTerminals(new Set()); }} className="px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest bg-rose-50 text-rose-600 border border-rose-200 hover:bg-rose-100 transition-all active:scale-95">
                            ✕ Clear Filters
                        </button>
                    )}
                    {hasOverrides && (
                        <button onClick={handleResetOverrides} className="px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest bg-amber-50 text-amber-600 border border-amber-200 hover:bg-amber-100 transition-all active:scale-95">
                            ↺ Reset Edits
                        </button>
                    )}
                    <button onClick={handleExportCSV} className="px-5 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest bg-indigo-600 text-white hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 active:scale-95">
                        📥 Export CSV
                    </button>
                </div>
            </div>

            {rows.length > 0 && (
                <div className="mb-10 w-full h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={months.map(m => {
                            const dataPoint: any = { name: monthNames[m], sales: revenueTotals[m] || 0 };
                            allTerminals.forEach(t => {
                                dataPoint[t] = scaledTerminalRev[t]?.[m] || 0;
                            });
                            return dataPoint;
                        })} margin={{ top: 20, right: 20, left: 0, bottom: 20 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={true} stroke="#f8fafc" />
                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} dy={10} />
                            <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} dx={-10} tickFormatter={(value) => value >= 1000 ? `${(value/1000).toFixed(0)}k` : value} />
                            <Tooltip
                                cursor={{ fill: '#f8fafc' }}
                                contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)' }}
                                itemStyle={{ color: '#0f172a', fontWeight: 900, fontSize: '12px' }}
                                formatter={(value: number, name: string) => [`Rs. ${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, name === 'sales' ? 'ALL' : name]}
                            />
                            <Legend wrapperStyle={{ fontSize: '10px', fontWeight: '800', textTransform: 'uppercase', bottom: -10 }} />
                            <Line
                                name="ALL"
                                type="linear"
                                dataKey="sales"
                                stroke="#f97316"
                                strokeWidth={4}
                                dot={{ fill: '#ffffff', stroke: '#f97316', strokeWidth: 3, r: 5 }}
                                activeDot={{ r: 7, fill: '#f97316', stroke: '#ffffff', strokeWidth: 3 }}
                            />
                            {allTerminals.includes('CASHIER 1') && (
                                <Line
                                    name="CASHIER 1"
                                    type="linear"
                                    dataKey="CASHIER 1"
                                    stroke="#3b82f6"
                                    strokeWidth={2}
                                    dot={{ fill: '#ffffff', stroke: '#3b82f6', strokeWidth: 2, r: 4 }}
                                />
                            )}
                            {allTerminals.includes('CASHIER 2') && (
                                <Line
                                    name="CASHIER 2"
                                    type="linear"
                                    dataKey="CASHIER 2"
                                    stroke="#10b981"
                                    strokeWidth={2}
                                    dot={{ fill: '#ffffff', stroke: '#10b981', strokeWidth: 2, r: 4 }}
                                />
                            )}
                            {allTerminals.includes('CASHIER 3') && (
                                <Line
                                    name="CASHIER 3"
                                    type="linear"
                                    dataKey="CASHIER 3"
                                    stroke="#8b5cf6"
                                    strokeWidth={2}
                                    dot={{ fill: '#ffffff', stroke: '#8b5cf6', strokeWidth: 2, r: 4 }}
                                />
                            )}
                            {allTerminals.includes('CASHIER 4') && (
                                <Line
                                    name="CASHIER 4"
                                    type="linear"
                                    dataKey="CASHIER 4"
                                    stroke="#ec4899"
                                    strokeWidth={2}
                                    dot={{ fill: '#ffffff', stroke: '#ec4899', strokeWidth: 2, r: 4 }}
                                />
                            )}
                            {allTerminals.filter(t => !['CASHIER 1', 'CASHIER 2', 'CASHIER 3', 'CASHIER 4'].includes(t)).map((t, i) => {
                                const colors = ['#06b6d4', '#eab308', '#ef4444', '#6366f1'];
                                const color = colors[i % colors.length];
                                return (
                                    <Line
                                        key={t}
                                        name={t}
                                        type="linear"
                                        dataKey={t}
                                        stroke={color}
                                        strokeWidth={2}
                                        dot={{ fill: '#ffffff', stroke: color, strokeWidth: 2, r: 4 }}
                                    />
                                );
                            })}
                        </ComposedChart>
                    </ResponsiveContainer>
                </div>
            )}

            {rows.length > 0 ? (
                <div className="overflow-x-auto rounded-2xl border border-slate-100">
                    <table className="w-full text-left text-sm border-collapse">
                        <thead>
                            <tr className="bg-[#1e293b]">
                                <th className="px-5 py-4 text-[10px] font-black text-white uppercase tracking-widest sticky left-0 bg-[#1e293b] z-10 min-w-[160px]">Category</th>
                                {months.map(m => (
                                    <th key={m} className="px-5 py-4 text-[10px] font-black text-white uppercase tracking-widest text-right min-w-[110px]">
                                        {monthNames[m]}
                                    </th>
                                ))}
                                <th className="px-5 py-4 text-[10px] font-black text-amber-300 uppercase tracking-widest text-right min-w-[120px] bg-[#0f172a]">Row Total</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {rows.map((row, rowIdx) => {
                                const adjustedRowTotal = months.reduce((sum, m) => sum + getCellValue(row.category, m, row.monthData[m] || 0), 0);
                                return (
                                    <tr key={row.category} className={`group hover:bg-indigo-50/30 transition-all ${rowIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}`}>
                                        <td className="px-5 py-3 text-[11px] font-black text-slate-800 uppercase tracking-tight sticky left-0 bg-inherit z-10 border-r border-slate-100">
                                            {row.category}
                                        </td>
                                        {months.map(m => {
                                            const originalVal = row.monthData[m] || 0;
                                            const cellVal = getCellValue(row.category, m, originalVal);
                                            const cellKey = `${row.category}-${m}`;
                                            const isEditing = editingCell === cellKey;
                                            const isOverridden = editOverrides[cellKey] !== undefined;

                                            if (isEditing) {
                                                return (
                                                    <td key={m} className="px-2 py-1 text-right">
                                                        <input
                                                            type="number"
                                                            step="0.01"
                                                            autoFocus
                                                            value={editValue}
                                                            onChange={e => setEditValue(e.target.value)}
                                                            onBlur={() => handleSaveEdit(row.category, m)}
                                                            onKeyDown={e => {
                                                                if (e.key === 'Enter') handleSaveEdit(row.category, m);
                                                                if (e.key === 'Escape') handleCancelEdit();
                                                            }}
                                                            className="w-full px-2 py-1 text-right text-[11px] font-mono font-black border-2 border-indigo-500 rounded-lg outline-none bg-indigo-50 text-indigo-800"
                                                        />
                                                    </td>
                                                );
                                            }

                                            return (
                                                <td
                                                    key={m}
                                                    onClick={() => handleStartEdit(row.category, m, cellVal)}
                                                    className={`px-5 py-3 text-right font-mono text-[11px] font-bold cursor-pointer transition-all hover:bg-indigo-100/50 ${
                                                        cellVal === 0
                                                            ? 'text-slate-200'
                                                            : isOverridden
                                                                ? 'text-indigo-700 bg-indigo-50/50'
                                                                : 'text-slate-700'
                                                    }`}
                                                >
                                                    {cellVal > 0 ? cellVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ''}
                                                </td>
                                            );
                                        })}
                                        <td className="px-5 py-3 text-right font-mono text-[11px] font-black text-slate-900 bg-slate-50 border-l border-slate-200">
                                            {adjustedRowTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                        <tfoot>
                            <tr className="bg-[#0f172a]">
                                <td className="px-5 py-4 text-[10px] font-black text-white uppercase tracking-widest sticky left-0 bg-[#0f172a] z-10 border-b border-slate-700/50">Grand Total</td>
                                {months.map(m => (
                                    <td key={m} className="px-5 py-4 text-right font-mono text-[11px] font-black text-emerald-300 border-b border-slate-700/50">
                                        {columnTotals[m].toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </td>
                                ))}
                                <td className="px-5 py-4 text-right font-mono text-[12px] font-black text-amber-300 bg-[#0f172a] border-l border-slate-700 border-b border-slate-700/50">
                                    {grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </td>
                            </tr>
                            <tr className="bg-[#0f172a]">
                                <td className="px-5 py-4 text-[10px] font-black text-white uppercase tracking-widest sticky left-0 bg-[#0f172a] z-10">Revenue</td>
                                {months.map(m => (
                                    <td key={m} className="px-5 py-4 text-right font-mono text-[11px] font-black text-indigo-300">
                                        {revenueTotals[m].toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </td>
                                ))}
                                <td className="px-5 py-4 text-right font-mono text-[12px] font-black text-indigo-400 bg-[#0f172a] border-l border-slate-700">
                                    {grandRevenueTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </td>
                            </tr>
                            <tr className="bg-[#0f172a]">
                                <td className="px-5 py-4 text-[10px] font-black text-white uppercase tracking-widest sticky left-0 bg-[#0f172a] z-10">Profit</td>
                                {months.map(m => (
                                    <td key={m} className="px-5 py-4 text-right font-mono text-[11px] font-black text-emerald-300">
                                        {profitTotals[m].toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </td>
                                ))}
                                <td className="px-5 py-4 text-right font-mono text-[12px] font-black text-emerald-400 bg-[#0f172a] border-l border-slate-700">
                                    {grandProfitTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            ) : (
                <div className="h-[200px] flex flex-col items-center justify-center text-slate-300">
                    <span className="text-4xl mb-2">📊</span>
                    <p className="text-[10px] font-black uppercase tracking-widest">No sales data available for pivot analysis</p>
                </div>
            )}

            {hasOverrides && (
                <div className="mt-4 flex items-center gap-2 bg-amber-50 px-4 py-2 rounded-xl border border-amber-100">
                    <span className="text-[9px] font-black text-amber-600 uppercase tracking-widest">⚠️ {Object.keys(editOverrides).length} cell(s) have been manually edited</span>
                </div>
            )}
        </div>
    );
};
