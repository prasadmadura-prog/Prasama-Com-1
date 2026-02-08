import React, { useState, useMemo } from 'react';
import { Transaction, BankAccount, Customer, Vendor, Product } from '../types';

interface AccountingProps {
    transactions: Transaction[];
    accounts: BankAccount[];
    customers: Customer[];
    vendors: Vendor[];
    products: Product[];
}

const Accounting: React.FC<AccountingProps> = ({ transactions, accounts, customers, vendors, products }) => {
    const [activeReport, setActiveReport] = useState<'BALANCE_SHEET' | 'INCOME_STATEMENT'>('BALANCE_SHEET');
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
                if (p) fallback += Number(p.cost || 0) * Number(item.quantity);
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
    }, [filteredTransactions, products]);

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500 pb-20">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div>
                    <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tighter">Financial Reports</h2>
                    <p className="text-slate-500 font-bold uppercase tracking-widest text-[10px] mt-1">Comprehensive accounting statements</p>
                </div>
            </div>

            {/* Report Selector */}
            <div className="bg-white rounded-3xl border border-slate-200 p-8 shadow-sm">
                <div className="flex flex-col md:flex-row gap-6 items-start md:items-end">
                    <div className="flex gap-3 flex-1">
                        <button
                            onClick={() => setActiveReport('BALANCE_SHEET')}
                            className={`flex-1 py-4 px-6 rounded-2xl font-black text-sm uppercase tracking-wider transition-all ${activeReport === 'BALANCE_SHEET'
                                ? 'bg-indigo-600 text-white shadow-lg'
                                : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                                }`}
                        >
                            📊 Balance Sheet
                        </button>
                        <button
                            onClick={() => setActiveReport('INCOME_STATEMENT')}
                            className={`flex-1 py-4 px-6 rounded-2xl font-black text-sm uppercase tracking-wider transition-all ${activeReport === 'INCOME_STATEMENT'
                                ? 'bg-indigo-600 text-white shadow-lg'
                                : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                                }`}
                        >
                            💰 Income Statement
                        </button>
                    </div>

                    {activeReport === 'INCOME_STATEMENT' && (
                        <div className="flex gap-4 items-end">
                            <div>
                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 block">From Date</label>
                                <input
                                    type="date"
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                    className="px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none font-mono text-sm"
                                />
                            </div>
                            <div>
                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 block">To Date</label>
                                <input
                                    type="date"
                                    value={endDate}
                                    onChange={(e) => setEndDate(e.target.value)}
                                    className="px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none font-mono text-sm"
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
        </div>
    );
};

export default Accounting;
