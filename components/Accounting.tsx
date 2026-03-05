import React, { useState, useMemo } from 'react';
import { Transaction, BankAccount, Customer, Vendor, Product, Category, PurchaseOrder } from '../types';
import * as XLSX from 'xlsx';

interface AccountingProps {
    transactions: Transaction[];
    accounts: BankAccount[];
    customers: Customer[];
    vendors: Vendor[];
    products: Product[];
    categories: Category[];
    purchaseOrders: PurchaseOrder[];
}

const Accounting: React.FC<AccountingProps> = ({ transactions, accounts, customers, vendors, products, categories, purchaseOrders }) => {
    const [activeReport, setActiveReport] = useState<'BALANCE_SHEET' | 'INCOME_STATEMENT' | 'CATEGORY_REPORT' | 'CRITICAL_STOCK' | 'DAILY_SUMMARY'>('BALANCE_SHEET');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    const getTodayLocal = () => {
        const d = new Date();
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    };

    const getFirstDayOfMonth = () => {
        const d = new Date();
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-01';
    };

    // Initialize with current month
    React.useEffect(() => {
        if (!startDate) setStartDate(getFirstDayOfMonth());
        if (!endDate) setEndDate(getTodayLocal());
    }, []);

    const filteredTransactions = useMemo(() => {
        return transactions.filter(t => {
            const txDate = t.date.split('T')[0];
            return (!startDate || txDate >= startDate) && (!endDate || txDate <= endDate);
        });
    }, [transactions, startDate, endDate]);

    // Helper to identify a reload item robustly
    const isReloadItem = (item: any, product: Product | undefined, category: Category | undefined, txDescription: string = '') => {
        const pName = (product?.name || "").toUpperCase();
        const cName = (category?.name || "").toUpperCase();
        const pId = (item.productId || "").toUpperCase();
        const desc = txDescription.toUpperCase();

        return cName.includes('RELOAD') ||
            pName.includes('RELOAD') ||
            pId.includes('RELOAD') ||
            desc.includes('RELOAD') ||
            // Also check provider names if not explicitly labeled reload
            pName.includes('DIALOG') || pName.includes('MOBITEL') || pName.includes('AIRTEL') || pName.includes('HUTCH') ||
            cName.includes('DIALOG') || cName.includes('MOBITEL') || cName.includes('AIRTEL') || cName.includes('HUTCH');
    };

    const getReloadProfitRate = (item: any, product: Product | undefined, category: Category | undefined, txDescription: string = '') => {
        const pName = (product?.name || "").toUpperCase();
        const cName = (category?.name || "").toUpperCase();
        const desc = txDescription.toUpperCase();

        const isMobitelOrHutch = pName.includes('MOBITEL') || pName.includes('HUTCH') ||
            cName.includes('MOBITEL') || cName.includes('HUTCH') ||
            desc.includes('MOBITEL') || desc.includes('HUTCH');

        return isMobitelOrHutch ? 0.06 : 0.04;
    };

    // Helper to identify a reload purchase robustly
    const isReloadPurchase = (t: Transaction) => {
        if (t.type !== 'PURCHASE') return false;

        // Check description for manual/legacy entries
        if (t.description.toUpperCase().includes('RELOAD')) return true;

        // Check linked Purchase Order
        const poId = t.description?.match(/PO-[A-Z0-9]+/i)?.[0] || t.description?.split(': ').pop();
        if (poId) {
            const po = purchaseOrders.find(p => p.id === poId);
            if (po && po.items) {
                return po.items.some(item => {
                    const product = products.find(p => p.id === item.productId);
                    const category = product?.categoryId ? categories.find(c => c.id === product.categoryId) : undefined;
                    return isReloadItem(item, product, category, '');
                });
            }
        }

        return false;
    };


    // Balance Sheet Calculations
    const balanceSheet = useMemo(() => {
        // ASSETS
        const cashAndBank = accounts.reduce((sum, acc) => sum + Number(acc.balance || 0), 0);
        const accountsReceivable = customers.reduce((sum, c) => sum + Number(c.totalCredit || 0), 0);
        const inventory = products.reduce((sum, p) => sum + (Number(p.stock || 0) * Number(p.cost || 0)), 0);
        const totalAssets = cashAndBank + accountsReceivable + inventory;

        // LIABILITIES
        const accountsPayable = vendors.reduce((sum, v) => sum + Number(v.totalBalance || 0), 0);
        const totalLiabilities = accountsPayable;

        // EQUITY
        const totalEquity = totalAssets - totalLiabilities;

        return {
            assets: {
                cashAndBank,
                accountsReceivable,
                inventory,
                total: totalAssets
            },
            liabilities: {
                accountsPayable,
                total: totalLiabilities
            },
            equity: {
                total: totalEquity
            }
        };
    }, [accounts, customers, vendors, products]);

    // Income Statement Calculations
    const incomeStatement = useMemo(() => {
        const getTxRealizedInflow = (t: Transaction) => {
            if (t.type === 'SALE') return Number(t.paidAmount || (t.paymentMethod !== 'CREDIT' ? t.amount : 0));
            if (t.type === 'CREDIT_PAYMENT' || t.type === 'SALE_HISTORY_IMPORT') return Number(t.amount || 0);
            return 0;
        };

        const getTxCostBasis = (t: Transaction) => {
            if (t.costBasis !== undefined) return t.costBasis;
            let fallback = 0;
            t.items?.forEach(item => {
                const p = products.find(prod => prod.id === item.productId);
                if (p) {
                    const category = categories.find(c => c.id === p.categoryId);
                    if (isReloadItem(item, p, category, t.description)) {
                        // Reload cost approx 96%
                        fallback += (Number(item.price) * Number(item.quantity) * 0.96);
                    } else {
                        fallback += Number(p.cost || 0) * Number(item.quantity);
                    }
                }
            });
            return fallback;
        };

        // REVENUE
        const revenue = filteredTransactions
            .filter(t => t.type === 'SALE' || t.type === 'SALE_HISTORY_IMPORT')
            .reduce((acc, t) => acc + Number(t.amount || 0), 0);

        // COST OF GOODS SOLD
        let cogs = 0;
        filteredTransactions.forEach(tx => {
            if (tx.type === 'SALE') {
                cogs += getTxCostBasis(tx);
            }
        });

        const grossProfit = revenue - cogs;
        const grossMargin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;

        // OPERATING EXPENSES
        const expenseBreakdown: Record<string, number> = {};
        let totalExpenses = 0;

        filteredTransactions
            .filter(t => t.type === 'EXPENSE')
            .forEach(t => {
                const amount = Number(t.amount || 0);
                const category = t.mainCategory || t.category || 'UNCATEGORIZED';
                expenseBreakdown[category] = (expenseBreakdown[category] || 0) + amount;
                totalExpenses += amount;
            });

        const sortedExpenseBreakdown = Object.entries(expenseBreakdown)
            .sort(([, a], [, b]) => b - a);

        const operatingIncome = grossProfit - totalExpenses;
        const netIncome = operatingIncome;
        const netMargin = revenue > 0 ? (netIncome / revenue) * 100 : 0;

        return {
            revenue,
            cogs,
            grossProfit,
            grossMargin,

            expenses: totalExpenses,
            expenseBreakdown: sortedExpenseBreakdown,
            operatingIncome,
            netIncome,
            netMargin
        };
    }, [filteredTransactions, products, categories]);

    // Category Wise Report
    const categoryReport = useMemo(() => {
        const report: Record<string, { revenue: number, cost: number, profit: number, count: number }> = {};

        filteredTransactions.forEach(t => {
            if (t.type === 'SALE' || t.type === 'SALE_HISTORY_IMPORT') {
                if (t.items) {
                    t.items.forEach(item => {
                        const product = products.find(p => p.id === item.productId);
                        const category = product?.categoryId ? categories.find(c => c.id === product.categoryId) : undefined;

                        // Exclude reload items from category report revenue/profit
                        if (isReloadItem(item, product, category, t.description)) return;

                        const categoryName = category?.name || 'Uncategorized';
                        const revenue = (Number(item.quantity) * Number(item.price)) - (Number(item.discount) || 0);
                        const cost = Number(product?.cost || 0) * Number(item.quantity);
                        const profit = revenue - cost;

                        if (!report[categoryName]) {
                            report[categoryName] = { revenue: 0, cost: 0, profit: 0, count: 0 };
                        }
                        report[categoryName].revenue += revenue;
                        report[categoryName].cost += cost;
                        report[categoryName].profit += profit;
                        report[categoryName].count += Number(item.quantity);
                    });
                } else {
                    // Legacy No Item Tx
                    if (t.description.toUpperCase().includes('RELOAD')) return;

                    const categoryName = 'Uncategorized';
                    const revenue = Number(t.amount || 0);
                    if (!report[categoryName]) report[categoryName] = { revenue: 0, cost: 0, profit: 0, count: 0 };
                    report[categoryName].revenue += revenue;
                    report[categoryName].profit += revenue; // Assume 1 00% profit if unknown? Or 0 cost.
                    report[categoryName].count += 1;
                }
            }
        });

        return Object.entries(report)
            .map(([name, stats]) => ({
                name,
                ...stats,
                margin: stats.revenue > 0 ? (stats.profit / stats.revenue) * 100 : 0
            }))
            .sort((a, b) => b.revenue - a.revenue);

    }, [filteredTransactions, products, categories]);

    // Daily Summary Report: Date | Revenue | Reload Rev | Reload Prof | Purchases | Expense | Profit | Total Prof | Cumulative
    const dailySummaryReport = useMemo(() => {
        const dayMap: Record<string, { revenue: number; reloadRevenue: number; reloadProfit: number; purchases: number; expense: number; profit: number }> = {};

        transactions.forEach(t => {
            const txDateKey = t.date.split('T')[0];

            // Define standard date checks for Sales/Expenses
            const isWithinRange = (date: string) => (!startDate || date >= startDate) && (!endDate || date <= endDate);

            // 1. REVENUE/PROFIT/RELOADS (Always on sale date)
            if (t.type === 'SALE' || t.type === 'SALE_HISTORY_IMPORT') {
                if (!isWithinRange(txDateKey)) return;
                if (!dayMap[txDateKey]) dayMap[txDateKey] = { revenue: 0, reloadRevenue: 0, reloadProfit: 0, purchases: 0, expense: 0, profit: 0 };

                if (t.items && t.items.length > 0) {
                    t.items.forEach(item => {
                        const p = products.find(prod => prod.id === item.productId);
                        const category = categories.find(c => c.id === p?.categoryId);
                        const lineTotal = (Number(item.quantity) * Number(item.price)) - (Number(item.discount) || 0);

                        if (isReloadItem(item, p, category, t.description)) {
                            const rate = getReloadProfitRate(item, p, category, t.description);
                            const rProfit = lineTotal * rate;
                            dayMap[txDateKey].reloadRevenue += lineTotal;
                            dayMap[txDateKey].reloadProfit += rProfit;
                        } else {
                            dayMap[txDateKey].revenue += lineTotal;
                            const cost = Number(p?.cost || 0) * Number(item.quantity);
                            dayMap[txDateKey].profit += lineTotal - cost;
                        }
                    });
                } else {
                    const amount = Number(t.amount || 0);
                    if (t.description.toUpperCase().includes('RELOAD')) {
                        const rate = getReloadProfitRate(null, undefined, undefined, t.description);
                        const rProfit = amount * rate;
                        dayMap[txDateKey].reloadRevenue += amount;
                        dayMap[txDateKey].reloadProfit += rProfit;
                    } else {
                        dayMap[txDateKey].revenue += amount;
                        dayMap[txDateKey].profit += amount; // Zero cost assumption for unknown legacy?
                    }
                }
            }

            // 2. EXPENSE (On t.date)
            else if (t.type === 'EXPENSE') {
                if (!isWithinRange(txDateKey)) return;
                if (!dayMap[txDateKey]) dayMap[txDateKey] = { revenue: 0, reloadRevenue: 0, reloadProfit: 0, purchases: 0, expense: 0, profit: 0 };
                dayMap[txDateKey].expense += Number(t.amount || 0);
            }

            // 3. PURCHASES (Rule: On Payment - Cheque Date for cheques, skip Credit, include Settlements)
            else {
                let effectivePurchaseDate = "";
                let isPurchaseRelevant = false;

                if (t.type === 'PURCHASE') {
                    if (t.paymentMethod === 'CHEQUE' && t.chequeDate) {
                        effectivePurchaseDate = t.chequeDate;
                        isPurchaseRelevant = true;
                    } else if (t.paymentMethod === 'CREDIT') {
                        // Skip original credit PO transaction for the "Purchases" account
                        isPurchaseRelevant = false;
                    } else {
                        // CASH or BANK
                        effectivePurchaseDate = txDateKey;
                        isPurchaseRelevant = true;
                    }
                } else if (t.type === 'CREDIT_PAYMENT' && t.vendorId) {
                    // This is us paying a vendor (settling credit)
                    effectivePurchaseDate = txDateKey;
                    isPurchaseRelevant = true;
                }

                if (isPurchaseRelevant && effectivePurchaseDate && isWithinRange(effectivePurchaseDate)) {
                    if (!isReloadPurchase(t)) {
                        if (!dayMap[effectivePurchaseDate]) dayMap[effectivePurchaseDate] = { revenue: 0, reloadRevenue: 0, reloadProfit: 0, purchases: 0, expense: 0, profit: 0 };
                        dayMap[effectivePurchaseDate].purchases += Number(t.amount || 0);
                    }
                }
            }
        });

        const sortedDates = Object.keys(dayMap).sort();
        let cumulative = 0;
        return sortedDates.map(date => {
            const totalProfit = dayMap[date].profit + dayMap[date].reloadProfit;
            cumulative += totalProfit;
            return {
                date,
                revenue: Math.round(dayMap[date].revenue),
                reloadRevenue: Math.round(dayMap[date].reloadRevenue),
                reloadProfit: Math.round(dayMap[date].reloadProfit),
                purchases: Math.round(dayMap[date].purchases),
                expense: Math.round(dayMap[date].expense),
                profit: Math.round(dayMap[date].profit),
                totalProfit: Math.round(totalProfit),
                cumulative: Math.round(cumulative)
            };
        });
    }, [filteredTransactions, products, categories]);

    // Critical Stock Shortfall Report
    const criticalStockItems = useMemo(() => {
        return products
            .filter(p => Number(p.stock || 0) <= (Number(p.lowStockThreshold) || 10))
            .sort((a, b) => Number(a.stock || 0) - Number(b.stock || 0));
    }, [products]);

    const handleExportCriticalStock = () => {
        const data = criticalStockItems.map(item => ({
            'PRODUCT NAME': item.name,
            'CATEGORY': categories.find(c => c.id === item.categoryId)?.name || 'N/A',
            'SKU / BARCODE': item.sku,
            'CURRENT STOCK': Number(item.stock || 0),
            'THRESHOLD': Number(item.lowStockThreshold || 10),
            'STATUS': Number(item.stock || 0) <= 0 ? 'OUT OF STOCK' : 'LOW STOCK'
        }));

        const worksheet = XLSX.utils.json_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Critical Stock");

        // Column widths
        const widths = [
            { wch: 40 }, // Name
            { wch: 20 }, // Category
            { wch: 20 }, // SKU
            { wch: 15 }, // Stock
            { wch: 15 }, // Threshold
            { wch: 15 }  // Status
        ];
        worksheet['!cols'] = widths;

        XLSX.writeFile(workbook, `CRITICAL_STOCK_REPORT_${new Date().toISOString().split('T')[0]}.xlsx`);
    };


    const handleExportDailySummaryExcel = () => {
        const data = dailySummaryReport.map(row => {
            const d = new Date(row.date);
            const displayDate = d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
            return {
                'DATE': displayDate,
                'REVENUE (Rs.)': row.revenue,
                'RELOAD REVENUE (Rs.)': row.reloadRevenue,
                'RELOAD PROFIT (Rs.)': row.reloadProfit,
                'PURCHASES (Rs.)': row.purchases,
                'EXPENSE': row.expense,
                'PROFIT': row.profit,
                'PROFIT + RELOAD PROFIT': row.totalProfit,
                'CUMULATIVE PROFIT': row.cumulative
            };
        });

        const worksheet = XLSX.utils.json_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Daily Summary");

        const widths = [
            { wch: 11 }, // Date
            { wch: 11 }, // Revenue
            { wch: 12 }, // Reload Rev
            { wch: 12 }, // Reload Profit
            { wch: 11 }, // Purchases
            { wch: 11 }, // Expense
            { wch: 11 }, // Profit
            { wch: 12 }, // Total Profit
            { wch: 14 }  // Cumulative
        ];
        worksheet['!cols'] = widths;

        XLSX.writeFile(workbook, `DAILY_SUMMARY_${startDate}_TO_${endDate}.xlsx`);
    };

    const handlePrintDailySummary = () => {
        window.print();
    };

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500 pb-20">
            {/* Print Styling */}
            <style dangerouslySetInnerHTML={{
                __html: `
                @media print {
                    @page { size: A4; margin: 10mm; }
                    body { background: white !important; }
                    .no-print { display: none !important; }
                    .print-only { display: block !important; }
                    .report-card { border: none !important; shadow: none !important; margin: 0 !important; width: 100% !important; padding: 0 !important; }
                    .daily-summary-header { border-bottom: 2px solid #e2e8f0 !important; }
                    body * { visibility: hidden; }
                    .printable-report, .printable-report * { visibility: visible; }
                    .printable-report { position: absolute; left: 0; top: 0; width: 100%; }
                }
            `}} />
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div>
                    <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tighter">Financial Reports</h2>
                    <p className="text-slate-500 font-bold uppercase tracking-widest text-[10px] mt-1">Comprehensive accounting statements</p>
                </div>
            </div>

            {/* Report Selector */}
            <div className="bg-white rounded-3xl border border-slate-200 p-8 shadow-sm no-print">
                <div className="flex flex-col md:flex-row gap-6 items-start md:items-end">
                    <div className="flex gap-3 flex-1 overflow-x-auto w-full pb-2 md:pb-0">
                        <button
                            onClick={() => setActiveReport('BALANCE_SHEET')}
                            className={`flex-1 min-w-[150px] py-4 px-6 rounded-2xl font-black text-xs md:text-sm uppercase tracking-wider transition-all whitespace-nowrap ${activeReport === 'BALANCE_SHEET'
                                ? 'bg-indigo-600 text-white shadow-lg'
                                : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                                }`}
                        >
                            📊 Balance Sheet
                        </button>
                        <button
                            onClick={() => setActiveReport('INCOME_STATEMENT')}
                            className={`flex-1 min-w-[150px] py-4 px-6 rounded-2xl font-black text-xs md:text-sm uppercase tracking-wider transition-all whitespace-nowrap ${activeReport === 'INCOME_STATEMENT'
                                ? 'bg-indigo-600 text-white shadow-lg'
                                : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                                }`}
                        >
                            💰 Income Statement
                        </button>
                        <button
                            onClick={() => setActiveReport('CATEGORY_REPORT')}
                            className={`flex-1 min-w-[150px] py-4 px-6 rounded-2xl font-black text-xs md:text-sm uppercase tracking-wider transition-all whitespace-nowrap ${activeReport === 'CATEGORY_REPORT'
                                ? 'bg-indigo-600 text-white shadow-lg'
                                : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                                }`}
                        >
                            📑 Category Sales
                        </button>
                        <button
                            onClick={() => setActiveReport('CRITICAL_STOCK')}
                            className={`flex-1 min-w-[150px] py-4 px-6 rounded-2xl font-black text-xs md:text-sm uppercase tracking-wider transition-all whitespace-nowrap ${activeReport === 'CRITICAL_STOCK'
                                ? 'bg-rose-600 text-white shadow-lg'
                                : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                                }`}
                        >
                            🛑 CRITICAL STOCK
                        </button>
                        <button
                            onClick={() => setActiveReport('DAILY_SUMMARY')}
                            className={`flex-1 min-w-[150px] py-4 px-6 rounded-2xl font-black text-xs md:text-sm uppercase tracking-wider transition-all whitespace-nowrap ${activeReport === 'DAILY_SUMMARY'
                                ? 'bg-indigo-600 text-white shadow-lg'
                                : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                                }`}
                        >
                            📅 Daily Summary
                        </button>
                    </div>

                    {(activeReport === 'INCOME_STATEMENT' || activeReport === 'CATEGORY_REPORT' || activeReport === 'DAILY_SUMMARY') && (
                        <div className="flex gap-4 items-end">
                            <div>
                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 block">From Date</label>
                                <input
                                    type="date"
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                    className="px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none font-mono text-xs md:text-sm"
                                />
                            </div>
                            <div>
                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 block">To Date</label>
                                <input
                                    type="date"
                                    value={endDate}
                                    onChange={(e) => setEndDate(e.target.value)}
                                    className="px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none font-mono text-xs md:text-sm"
                                />
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Balance Sheet */}
            {activeReport === 'BALANCE_SHEET' && (
                <div className="bg-white rounded-3xl border border-slate-200 p-12 shadow-sm max-w-5xl mx-auto overflow-hidden">
                    <div className="mb-12">
                        <h3 className="text-4xl font-black text-indigo-900 border-b-4 border-indigo-100 pb-4">Statement of Financial Position</h3>
                        <div className="flex justify-between items-end mt-4">
                            <p className="text-slate-500 font-black uppercase tracking-[0.2em] text-xs">As at {getTodayLocal()}</p>
                            <div className="text-right">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Currency: LKR (Rs.)</span>
                                <span className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-full text-[10px] font-black uppercase tracking-widest border border-indigo-100 italic">Audit Ready</span>
                            </div>
                        </div>
                    </div>

                    <div className="w-full">
                        <table className="w-full border-collapse">
                            <thead>
                                <tr className="border-b-2 border-slate-900">
                                    <th className="text-left py-4 text-xs font-black text-slate-400 uppercase tracking-widest w-[60%]">Description</th>
                                    <th className="text-center py-4 text-xs font-black text-slate-400 uppercase tracking-widest w-[10%]">Notes</th>
                                    <th className="text-right py-4 text-xs font-black text-slate-900 uppercase tracking-widest w-[30%]">
                                        <div className="bg-indigo-900 text-white px-6 py-2 rounded-t-xl text-center">
                                            {new Date().getFullYear()} <br /> <span className="text-[8px] opacity-60">Rs.</span>
                                        </div>
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {/* ASSETS */}
                                <tr>
                                    <td colSpan={3} className="py-6">
                                        <span className="text-sm font-black text-indigo-900 uppercase tracking-[0.1em] border-b border-indigo-200 pb-1">Assets</span>
                                    </td>
                                </tr>
                                <tr className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                                    <td className="py-3 text-sm font-bold text-slate-700">Cash and Bank Balances</td>
                                    <td className="py-3 text-center text-[10px] font-black text-slate-400">01</td>
                                    <td className="py-3 text-right font-black font-mono text-slate-900">{Math.round(balanceSheet.assets.cashAndBank).toLocaleString()}</td>
                                </tr>
                                <tr className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                                    <td className="py-3 text-sm font-bold text-slate-700">Accounts Receivable (Customers)</td>
                                    <td className="py-3 text-center text-[10px] font-black text-slate-400">02</td>
                                    <td className="py-3 text-right font-black font-mono text-slate-900">{Math.round(balanceSheet.assets.accountsReceivable).toLocaleString()}</td>
                                </tr>
                                <tr className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                                    <td className="py-3 text-sm font-bold text-slate-700">Inventory Stock Assets (At Cost)</td>
                                    <td className="py-3 text-center text-[10px] font-black text-slate-400">03</td>
                                    <td className="py-3 text-right font-black font-mono text-slate-900">{Math.round(balanceSheet.assets.inventory).toLocaleString()}</td>
                                </tr>
                                <tr className="bg-slate-100/50">
                                    <td className="py-4 text-sm font-black text-slate-900 uppercase tracking-wider">Total assets</td>
                                    <td></td>
                                    <td className="py-4 text-right font-black font-mono text-slate-900 border-b-4 border-double border-slate-400">
                                        {Math.round(balanceSheet.assets.total).toLocaleString()}
                                    </td>
                                </tr>

                                {/* LIABILITIES */}
                                <tr>
                                    <td colSpan={3} className="py-8">
                                        <span className="text-sm font-black text-rose-900 uppercase tracking-[0.1em] border-b border-rose-200 pb-1">Liabilities</span>
                                    </td>
                                </tr>
                                <tr className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                                    <td className="py-3 text-sm font-bold text-slate-700">Accounts Payable (Vendors)</td>
                                    <td className="py-3 text-center text-[10px] font-black text-slate-400">04</td>
                                    <td className="py-3 text-right font-black font-mono text-slate-900">{Math.round(balanceSheet.liabilities.accountsPayable).toLocaleString()}</td>
                                </tr>
                                <tr className="bg-slate-100/50">
                                    <td className="py-4 text-sm font-black text-slate-900 uppercase tracking-wider">Total Liabilities</td>
                                    <td></td>
                                    <td className="py-4 text-right font-black font-mono text-slate-900 border-b-4 border-double border-slate-400">
                                        {Math.round(balanceSheet.liabilities.total).toLocaleString()}
                                    </td>
                                </tr>

                                {/* SHAREHOLDERS FUNDS */}
                                <tr>
                                    <td colSpan={3} className="py-8">
                                        <span className="text-sm font-black text-emerald-900 uppercase tracking-[0.1em] border-b border-emerald-200 pb-1">Shareholders' Funds</span>
                                    </td>
                                </tr>
                                <tr className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                                    <td className="py-3 text-sm font-bold text-slate-700">Retained Earnings / (Loss)</td>
                                    <td className="py-3 text-center text-[10px] font-black text-slate-400">05</td>
                                    <td className="py-3 text-right font-black font-mono text-slate-900">{Math.round(balanceSheet.equity.total).toLocaleString()}</td>
                                </tr>
                                <tr className="bg-indigo-50/50">
                                    <td className="py-4 text-sm font-black text-indigo-900 uppercase tracking-wider">Total Shareholders' Funds</td>
                                    <td></td>
                                    <td className="py-4 text-right font-black font-mono text-indigo-900 border-b-4 border-double border-indigo-400">
                                        {Math.round(balanceSheet.equity.total).toLocaleString()}
                                    </td>
                                </tr>

                                {/* FINAL TOTAL */}
                                <tr className="bg-indigo-900 text-white">
                                    <td className="py-6 px-4 text-base font-black uppercase tracking-[0.1em]">Total Liabilities and Shareholders' Funds</td>
                                    <td></td>
                                    <td className="py-6 px-4 text-right text-xl font-black font-mono border-b-8 border-double border-white/30">
                                        {Math.round(balanceSheet.liabilities.total + balanceSheet.equity.total).toLocaleString()}
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    <div className="mt-16 flex justify-between items-start gap-20">
                        <div className="flex-1 space-y-12">
                            <div className="border-t border-slate-300 pt-3">
                                <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Chief Financial Officer</p>
                                <div className="h-10 mt-2 italic font-serif text-slate-300 select-none">Singature Required</div>
                            </div>
                            <div className="flex justify-between gap-12">
                                <div className="flex-1 border-t border-slate-300 pt-3">
                                    <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Director</p>
                                </div>
                                <div className="flex-1 border-t border-slate-300 pt-3">
                                    <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Director</p>
                                </div>
                            </div>
                        </div>
                        <div className="w-1/3 text-right text-[9px] font-bold text-slate-400 leading-relaxed italic">
                            I certify that these Financial Statements are in compliance with the requirements of the Companies Act No. 07 of 2007. <br />
                            Report Generated on {new Date().toLocaleString()} <br />
                            Enterprise ERP System - Secure Audit Trail
                        </div>
                    </div>

                    {/* Accounting Equation Check */}
                    <div className="mt-12 p-4 bg-slate-50 rounded-2xl border border-slate-200 border-dashed">
                        <div className="flex items-center justify-center gap-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                            <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                                Assets: Rs. {Math.round(balanceSheet.assets.total).toLocaleString()}
                            </div>
                            <span>=</span>
                            <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                                Liabilities: Rs. {Math.round(balanceSheet.liabilities.total).toLocaleString()}
                            </div>
                            <span>+</span>
                            <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                                Equity: Rs. {Math.round(balanceSheet.equity.total).toLocaleString()}
                            </div>
                            {Math.abs(balanceSheet.assets.total - (balanceSheet.liabilities.total + balanceSheet.equity.total)) < 0.1 ? (
                                <span className="ml-6 px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded text-[8px]">✓ PERFECTLY BALANCED</span>
                            ) : (
                                <span className="ml-6 px-2 py-0.5 bg-rose-100 text-rose-700 rounded text-[8px]">⚠ DISCREPANCY DETECTED</span>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Income Statement */}
            {activeReport === 'INCOME_STATEMENT' && (
                <div className="bg-white rounded-3xl border border-slate-200 p-12 shadow-sm max-w-5xl mx-auto overflow-hidden">
                    <div className="mb-12">
                        <h3 className="text-4xl font-black text-emerald-900 border-b-4 border-emerald-100 pb-4">Comprehensive Income Statement</h3>
                        <div className="flex justify-between items-end mt-4">
                            <p className="text-slate-500 font-black uppercase tracking-[0.2em] text-xs">For the period: {startDate || 'Start'} to {endDate || 'End'}</p>
                            <div className="text-right">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Status: Unaudited Draft</span>
                                <span className="px-3 py-1 bg-emerald-50 text-emerald-600 rounded-full text-[10px] font-black uppercase tracking-widest border border-emerald-100 italic">Net Flow Certified</span>
                            </div>
                        </div>
                    </div>

                    <div className="w-full">
                        <table className="w-full border-collapse">
                            <thead>
                                <tr className="border-b-2 border-slate-900">
                                    <th className="text-left py-4 text-xs font-black text-slate-400 uppercase tracking-widest w-[60%]">Description</th>
                                    <th className="text-center py-4 text-xs font-black text-slate-400 uppercase tracking-widest w-[10%]">Notes</th>
                                    <th className="text-right py-4 text-xs font-black text-slate-900 uppercase tracking-widest w-[30%]">
                                        <div className="bg-emerald-900 text-white px-6 py-2 rounded-t-xl text-center">
                                            Current Period <br /> <span className="text-[8px] opacity-60">Rs.</span>
                                        </div>
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {/* REVENUE */}
                                <tr>
                                    <td colSpan={3} className="py-6">
                                        <span className="text-sm font-black text-emerald-900 uppercase tracking-[0.1em] border-b border-emerald-200 pb-1">Earnings and Inflow</span>
                                    </td>
                                </tr>
                                <tr className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                                    <td className="py-3 text-sm font-bold text-slate-700 uppercase tracking-tight">Revenue (Direct Sales)</td>
                                    <td className="py-3 text-center text-[10px] font-black text-slate-400">06</td>
                                    <td className="py-3 text-right font-black font-mono text-slate-900">{Math.round(incomeStatement.revenue).toLocaleString()}</td>
                                </tr>
                                <tr className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                                    <td className="py-3 text-sm font-bold text-slate-500 italic pl-6">Less: Cost of Sales (COGS)</td>
                                    <td className="py-3 text-center text-[10px] font-black text-slate-400">07</td>
                                    <td className="py-3 text-right font-black font-mono text-rose-600">({Math.round(incomeStatement.cogs).toLocaleString()})</td>
                                </tr>
                                <tr className="bg-slate-100/50">
                                    <td className="py-4 text-sm font-black text-slate-900 uppercase tracking-wider">Gross Profit</td>
                                    <td></td>
                                    <td className="py-4 text-right font-black font-mono text-slate-900 border-b border-slate-400">
                                        {Math.round(incomeStatement.grossProfit).toLocaleString()}
                                    </td>
                                </tr>

                                {/* OPERATING EXPENSES */}
                                <tr>
                                    <td colSpan={3} className="py-8">
                                        <span className="text-sm font-black text-rose-900 uppercase tracking-[0.1em] border-b border-rose-200 pb-1">Operating Expenditure</span>
                                    </td>
                                </tr>
                                {incomeStatement.expenseBreakdown.map(([category, amount], idx) => (
                                    <tr key={category} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                                        <td className="py-3 text-sm font-bold text-slate-700 uppercase tracking-tight">{category}</td>
                                        <td className="py-3 text-center text-[10px] font-black text-slate-400">{10 + idx}</td>
                                        <td className="py-3 text-right font-black font-mono text-slate-900">{Math.round(amount).toLocaleString()}</td>
                                    </tr>
                                ))}
                                {incomeStatement.expenseBreakdown.length === 0 && (
                                    <tr>
                                        <td colSpan={3} className="py-4 text-center text-[10px] font-black text-slate-300 uppercase italic">No Expenses Recorded</td>
                                    </tr>
                                )}
                                <tr className="border-t border-slate-200">
                                    <td className="py-4 text-sm font-bold text-slate-400 uppercase tracking-wider italic">Total Operating Expenses</td>
                                    <td></td>
                                    <td className="py-4 text-right font-black font-mono text-rose-600 border-b border-rose-200">
                                        ({Math.round(incomeStatement.expenses || 0).toLocaleString()})
                                    </td>
                                </tr>

                                {/* FINAL TOTALS */}
                                <tr className="bg-emerald-50">
                                    <td className="py-6 px-4 text-base font-black text-emerald-900 uppercase tracking-[0.1em]">Operating Income / (Loss)</td>
                                    <td className="text-center font-black text-emerald-400 text-xs">{incomeStatement.grossMargin.toFixed(1)}% MGN</td>
                                    <td className="py-6 px-4 text-right text-lg font-black font-mono text-emerald-900">
                                        {Math.round(incomeStatement.operatingIncome).toLocaleString()}
                                    </td>
                                </tr>

                                <tr className="bg-emerald-900 text-white">
                                    <td className="py-6 px-4 text-lg font-black uppercase tracking-[0.1em]">Net Comprehensive Income</td>
                                    <td className="text-center font-black text-emerald-300 text-xs">{incomeStatement.netMargin.toFixed(1)}% NET</td>
                                    <td className="py-6 px-4 text-right text-2xl font-black font-mono border-b-8 border-double border-white/30">
                                        {Math.round(incomeStatement.netIncome).toLocaleString()}
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    <div className="mt-16 text-center">
                        <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.4em]">End of Financial Statement</p>
                    </div>
                </div>
            )}

            {/* Category Wise Report */}
            {activeReport === 'CATEGORY_REPORT' && (
                <div className="bg-white rounded-3xl border border-slate-200 p-12 shadow-sm max-w-5xl mx-auto overflow-hidden">
                    <div className="mb-12">
                        <h3 className="text-4xl font-black text-indigo-900 border-b-4 border-indigo-100 pb-4">Category Profitability Analysis</h3>
                        <div className="flex justify-between items-end mt-4">
                            <p className="text-slate-500 font-black uppercase tracking-[0.2em] text-xs">For the period: {startDate || 'Start'} to {endDate || 'End'}</p>
                            <div className="text-right">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Generated On</span>
                                <span className="text-xs font-bold text-slate-600">{new Date().toLocaleString()}</span>
                            </div>
                        </div>
                    </div>

                    <div className="w-full">
                        <table className="w-full border-collapse">
                            <thead>
                                <tr className="bg-slate-50 border-b-2 border-indigo-900">
                                    <th className="text-left py-4 px-4 text-xs font-black text-slate-500 uppercase tracking-widest">Category</th>
                                    <th className="text-right py-4 px-4 text-xs font-black text-slate-500 uppercase tracking-widest">Revenue</th>
                                    <th className="text-right py-4 px-4 text-xs font-black text-slate-500 uppercase tracking-widest text-rose-500">Cost (Approx)</th>
                                    <th className="text-right py-4 px-4 text-xs font-black text-slate-500 uppercase tracking-widest text-emerald-600">Gross Profit</th>
                                    <th className="text-center py-4 px-4 text-xs font-black text-slate-500 uppercase tracking-widest">Margin</th>
                                </tr>
                            </thead>
                            <tbody>
                                {categoryReport.map((item, idx) => (
                                    <tr key={idx} className={`border-b border-slate-50 hover:bg-indigo-50/30 transition-colors group ${idx < 3 ? 'bg-indigo-50/10' : ''}`}>
                                        <td className="py-4 px-4">
                                            <span className={`block font-bold text-sm uppercase tracking-tight ${idx === 0 ? 'text-indigo-600' : 'text-slate-700'}`}>
                                                {item.name}
                                                {idx === 0 && <span className="ml-2 text-[10px] bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full">Top Performer</span>}
                                            </span>
                                        </td>
                                        <td className="py-4 px-4 text-right font-mono font-bold text-slate-900">
                                            {Math.round(item.revenue).toLocaleString()}
                                        </td>
                                        <td className="py-4 px-4 text-right font-mono font-medium text-rose-500 text-sm">
                                            {Math.round(item.cost).toLocaleString()}
                                        </td>
                                        <td className="py-4 px-4 text-right font-mono font-black text-emerald-600 text-base">
                                            {Math.round(item.profit).toLocaleString()}
                                        </td>
                                        <td className="py-4 px-4 text-center">
                                            <span className={`text-xs font-bold px-2 py-1 rounded-md ${item.margin > 20 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                                                {item.margin.toFixed(1)}%
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                                {categoryReport.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="py-10 text-center text-slate-400 font-bold uppercase tracking-widest text-sm">
                                            No sales data found for this period
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                            <tfoot className="bg-indigo-900 text-white">
                                <tr>
                                    <td className="py-5 px-4 font-black uppercase tracking-widest text-sm">Total</td>
                                    <td className="py-5 px-4 text-right font-mono font-black text-lg">
                                        {Math.round(categoryReport.reduce((a, b) => a + b.revenue, 0)).toLocaleString()}
                                    </td>
                                    <td className="py-5 px-4 text-right font-mono font-black text-lg opacity-80">
                                        {Math.round(categoryReport.reduce((a, b) => a + b.cost, 0)).toLocaleString()}
                                    </td>
                                    <td className="py-5 px-4 text-right font-mono font-black text-xl border-l border-white/20 bg-indigo-800">
                                        {Math.round(categoryReport.reduce((a, b) => a + b.profit, 0)).toLocaleString()}
                                    </td>
                                    <td className="py-5 px-4 text-center font-bold text-xs opacity-70">
                                        AVG MARGIN
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>
            )}

            {/* Critical Stock Shortfall Report */}
            {activeReport === 'CRITICAL_STOCK' && (
                <div className="bg-white rounded-3xl border border-slate-200 p-12 shadow-sm max-w-5xl mx-auto overflow-hidden">
                    <div className="mb-12">
                        <div className="flex justify-between items-start border-b-4 border-rose-100 pb-4">
                            <h3 className="text-4xl font-black text-rose-900 uppercase">Critical Stock Shortfall</h3>
                            <span className="bg-rose-600 text-white px-4 py-2 rounded-xl text-xl font-black font-mono shadow-lg shadow-rose-200">{criticalStockItems.length}</span>
                        </div>
                        <div className="flex justify-between items-end mt-4">
                            <p className="text-slate-500 font-black uppercase tracking-[0.2em] text-xs">Immediate inventory procurement required</p>
                            <div className="flex items-end gap-6">
                                <button
                                    onClick={handleExportCriticalStock}
                                    className="px-4 py-2 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all flex items-center gap-2 shadow-lg shadow-slate-200"
                                >
                                    📥 Download Excel
                                </button>
                                <div className="text-right">
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Generated On</span>
                                    <span className="text-xs font-bold text-slate-600">{new Date().toLocaleString()}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="w-full">
                        <div className="overflow-x-auto">
                            <table className="w-full border-collapse">
                                <thead>
                                    <tr className="bg-slate-50 border-b-2 border-rose-900">
                                        <th className="text-left py-4 px-4 text-xs font-black text-slate-500 uppercase tracking-widest">PRODUCT DESCRIPTION</th>
                                        <th className="text-left py-4 px-4 text-xs font-black text-slate-500 uppercase tracking-widest">SKU / BARCODE</th>
                                        <th className="text-right py-4 px-4 text-xs font-black text-slate-500 uppercase tracking-widest">CURRENT STOCK</th>
                                        <th className="text-right py-4 px-4 text-xs font-black text-slate-500 uppercase tracking-widest">THRESHOLD</th>
                                        <th className="text-center py-4 px-4 text-xs font-black text-slate-500 uppercase tracking-widest">URGENCY</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {criticalStockItems.map((item, idx) => {
                                        const threshold = Number(item.lowStockThreshold) || 10;
                                        const stock = Number(item.stock || 0);
                                        const isEmpty = stock <= 0;
                                        return (
                                            <tr key={item.id} className={`border-b border-slate-50 hover:bg-rose-50/30 transition-colors group ${isEmpty ? 'bg-rose-50/20' : ''}`}>
                                                <td className="py-4 px-4">
                                                    <p className="font-bold text-sm uppercase tracking-tight text-slate-800">{item.name}</p>
                                                    <p className="text-[10px] text-slate-400 font-bold uppercase">{categories.find(c => c.id === item.categoryId)?.name || 'UNGROUPED'}</p>
                                                </td>
                                                <td className="py-4 px-4">
                                                    <span className="font-mono text-[10px] bg-slate-100 text-slate-600 px-2 py-1 rounded border border-slate-200">{item.sku}</span>
                                                </td>
                                                <td className="py-4 px-4 text-right">
                                                    <span className={`text-lg font-black font-mono ${isEmpty ? 'text-rose-600' : 'text-rose-500'}`}>
                                                        {stock}
                                                    </span>
                                                </td>
                                                <td className="py-4 px-4 text-right font-mono text-xs text-slate-400">
                                                    {threshold}
                                                </td>
                                                <td className="py-4 px-4 text-center">
                                                    <span className={`text-[9px] font-black uppercase px-3 py-1 rounded-full tracking-widest ${isEmpty ? 'bg-rose-600 text-white animate-pulse' : 'bg-rose-100 text-rose-700'}`}>
                                                        {isEmpty ? 'OUT OF STOCK' : 'LOW STOCK'}
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {criticalStockItems.length === 0 && (
                                        <tr>
                                            <td colSpan={5} className="py-20 text-center">
                                                <div className="flex flex-col items-center gap-4">
                                                    <span className="text-4xl text-emerald-400">🛡️</span>
                                                    <p className="text-slate-400 font-bold uppercase tracking-[0.3em] text-sm">Inventory Levels Healthy</p>
                                                    <p className="text-[10px] text-slate-300 uppercase font-black">All products are above critical thresholds</p>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* Daily Summary Report */}
            {activeReport === 'DAILY_SUMMARY' && (
                <div className="bg-white rounded-3xl border border-slate-200 p-12 shadow-sm max-w-5xl mx-auto overflow-hidden printable-report report-card">
                    <div className="mb-10">
                        <div className="flex justify-between items-start border-b-4 border-indigo-100 pb-4 daily-summary-header">
                            <div>
                                <h3 className="text-4xl font-black text-indigo-900 uppercase">Daily Summary</h3>
                                <p className="text-slate-500 font-black uppercase tracking-[0.2em] text-xs mt-2">For the period: {startDate || 'Start'} to {endDate || 'End'}</p>
                            </div>
                            <div className="flex flex-col items-end gap-3">
                                <div className="flex gap-2 no-print">
                                    <button
                                        onClick={handleExportDailySummaryExcel}
                                        className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 transition-all flex items-center gap-2 shadow-lg shadow-emerald-100"
                                    >
                                        📊 EXCEL
                                    </button>
                                    <button
                                        onClick={handlePrintDailySummary}
                                        className="px-4 py-2 bg-indigo-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-800 transition-all flex items-center gap-2 shadow-lg shadow-indigo-100"
                                    >
                                        📄 PDF / PRINT
                                    </button>
                                </div>
                                <div className="flex flex-col items-end">
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Cumulative Profit</span>
                                    <span className="text-2xl font-black font-mono text-indigo-700">
                                        Rs. {(dailySummaryReport[dailySummaryReport.length - 1]?.cumulative || 0).toLocaleString()}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse">
                            <thead>
                                <tr className="bg-indigo-900 text-white">
                                    <th className="text-left py-4 px-3 text-[9px] font-black uppercase tracking-widest rounded-tl-xl">Date</th>
                                    <th className="text-right py-4 px-3 text-[9px] font-black uppercase tracking-widest">Revenue</th>
                                    <th className="text-right py-4 px-3 text-[9px] font-black uppercase tracking-widest text-indigo-300">Reload Rev</th>
                                    <th className="text-right py-4 px-3 text-[9px] font-black uppercase tracking-widest text-indigo-300 mr-2">Reload Prof</th>
                                    <th className="text-right py-4 px-3 text-[9px] font-black uppercase tracking-widest text-orange-400">Purchases</th>
                                    <th className="text-right py-4 px-3 text-[9px] font-black uppercase tracking-widest text-rose-300">Expense</th>
                                    <th className="text-right py-4 px-3 text-[9px] font-black uppercase tracking-widest">Profit</th>
                                    <th className="text-right py-4 px-3 text-[9px] font-black uppercase tracking-widest text-indigo-100 leading-tight">Profit +<br />Reload Profit</th>
                                    <th className="text-right py-4 px-3 text-[9px] font-black uppercase tracking-widest rounded-tr-xl">Cumulative</th>
                                </tr>
                            </thead>
                            <tbody>
                                {dailySummaryReport.map((row, idx) => {
                                    const d = new Date(row.date);
                                    const displayDate = d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '/');
                                    return (
                                        <tr key={row.date} className={`border-b border-slate-50 hover:bg-indigo-50/30 transition-colors ${idx % 2 === 0 ? '' : 'bg-slate-50/40'}`}>
                                            <td className="py-2 px-3 font-mono font-black text-slate-700 text-[10px]">{displayDate}</td>
                                            <td className="py-2 px-3 text-right font-mono font-bold text-slate-900 text-[10px]">
                                                {row.revenue.toLocaleString()}
                                            </td>
                                            <td className="py-2 px-3 text-right font-mono font-bold text-indigo-600 text-[10px]">
                                                {row.reloadRevenue.toLocaleString()}
                                            </td>
                                            <td className="py-2 px-3 text-right font-mono font-bold text-indigo-500 text-[10px]">
                                                {row.reloadProfit.toLocaleString()}
                                            </td>
                                            <td className="py-2 px-3 text-right font-mono font-bold text-orange-500 text-[10px]">
                                                {row.purchases.toLocaleString()}
                                            </td>
                                            <td className="py-2 px-3 text-right font-mono font-bold text-rose-500 text-[10px]">
                                                {row.expense.toLocaleString()}
                                            </td>
                                            <td className={`py-2 px-3 text-right font-mono font-black text-[10px] ${row.profit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                {row.profit.toLocaleString()}
                                            </td>
                                            <td className={`py-2 px-3 text-right font-mono font-black text-[10px] bg-indigo-50 ${row.totalProfit >= 0 ? 'text-indigo-700' : 'text-rose-700'}`}>
                                                {row.totalProfit.toLocaleString()}
                                            </td>
                                            <td className="py-2 px-3 text-right font-mono font-black text-indigo-700 text-[10px]">
                                                {row.cumulative.toLocaleString()}
                                            </td>
                                        </tr>
                                    );
                                })}
                                {dailySummaryReport.length === 0 && (
                                    <tr>
                                        <td colSpan={9} className="py-20 text-center">
                                            <div className="flex flex-col items-center gap-4">
                                                <span className="text-4xl text-slate-300">📅</span>
                                                <p className="text-slate-400 font-bold uppercase tracking-[0.3em] text-sm">No Sales Data</p>
                                                <p className="text-[10px] text-slate-300 uppercase font-black">No transactions found for the selected period</p>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                            {dailySummaryReport.length > 0 && (
                                <tfoot className="bg-indigo-900 text-white">
                                    <tr>
                                        <td className="py-5 px-3 font-black uppercase tracking-widest text-[10px] rounded-bl-xl">TOTAL</td>
                                        <td className="py-5 px-3 text-right font-mono font-black text-[10px]">
                                            {dailySummaryReport.reduce((a, b) => a + b.revenue, 0).toLocaleString()}
                                        </td>
                                        <td className="py-5 px-3 text-right font-mono font-black text-[10px] text-indigo-300">
                                            {dailySummaryReport.reduce((a, b) => a + b.reloadRevenue, 0).toLocaleString()}
                                        </td>
                                        <td className="py-5 px-3 text-right font-mono font-black text-[10px] text-indigo-300">
                                            {dailySummaryReport.reduce((a, b) => a + b.reloadProfit, 0).toLocaleString()}
                                        </td>
                                        <td className="py-5 px-3 text-right font-mono font-black text-[10px] text-orange-400">
                                            {dailySummaryReport.reduce((a, b) => a + b.purchases, 0).toLocaleString()}
                                        </td>
                                        <td className="py-5 px-3 text-right font-mono font-black text-[10px] text-rose-300">
                                            {dailySummaryReport.reduce((a, b) => a + b.expense, 0).toLocaleString()}
                                        </td>
                                        <td className="py-5 px-3 text-right font-mono font-black text-[10px]">
                                            {dailySummaryReport.reduce((a, b) => a + b.profit, 0).toLocaleString()}
                                        </td>
                                        <td className="py-5 px-3 text-right font-mono font-black text-[10px] text-indigo-100">
                                            {dailySummaryReport.reduce((a, b) => a + b.totalProfit, 0).toLocaleString()}
                                        </td>
                                        <td className="py-5 px-3 text-right font-mono font-black text-[10px] rounded-br-xl">
                                            {(dailySummaryReport[dailySummaryReport.length - 1]?.cumulative || 0).toLocaleString()}
                                        </td>
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Accounting;
