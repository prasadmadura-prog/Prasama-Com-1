import React, { useState, useMemo, useRef } from 'react';
import { BankAccount, Transaction, UserProfile, Vendor, Category } from '../types';
import { upsertDocument, deleteDocument, collections as dbCols } from '../services/database';

interface AccountingLiabilitiesProps {
    accounts: BankAccount[];
    transactions: Transaction[];
    vendors: Vendor[];
    categories: Category[];
    userProfile: UserProfile;
    onUpsertAccount: (acc: BankAccount) => void;
    onDeleteAccount: (id: string) => void;
    onAddTransaction: (tx: any) => void;
    onDeleteTransaction: (id: string) => void;
}

const AccountingLiabilities: React.FC<AccountingLiabilitiesProps> = ({
    accounts,
    transactions,
    vendors,
    categories = [],
    userProfile,
    onUpsertAccount,
    onDeleteAccount,
    onAddTransaction,
    onDeleteTransaction
}) => {
    // --- STATES ---
    const [activeSection, setActiveSection] = useState<'ACCOUNTS' | 'LIABILITIES'>('ACCOUNTS');
    const [selectedBranchFilter, setSelectedBranchFilter] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<'LIST' | 'CALENDAR'>('LIST');
    const [calendarDate, setCalendarDate] = useState<Date>(new Date());
    const [selectedCalendarTx, setSelectedCalendarTx] = useState<Transaction | null>(null);

    // Account Form States
    const [editingAccount, setEditingAccount] = useState<BankAccount | null>(null);
    const [accName, setAccName] = useState('');
    const [accNumber, setAccNumber] = useState('');
    const [accBalance, setAccBalance] = useState('');

    // Accrual Form States
    const [liabilityAmount, setLiabilityAmount] = useState('');
    const [liabilityDesc, setLiabilityDesc] = useState('');
    const [liabilityCat, setLiabilityCat] = useState('Utilities');
    const [liabilityDate, setLiabilityDate] = useState(
        new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0') + '-' + String(new Date().getDate()).padStart(2, '0')
    );
    const [liabilityBranch, setLiabilityBranch] = useState(userProfile.branch === 'ALL' ? 'CASHIER 1' : userProfile.branch);
    const [liabilityAttachment, setLiabilityAttachment] = useState('');
    const [liabilityAttachmentName, setLiabilityAttachmentName] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Settle Modal/Action States
    const [settlingTx, setSettlingTx] = useState<Transaction | null>(null);
    const [settleAccountId, setSettleAccountId] = useState('cash');

    // Edit Modal/Action States
    const [editingTx, setEditingTx] = useState<Transaction | null>(null);
    const [editAmount, setEditAmount] = useState('');
    const [editDesc, setEditDesc] = useState('');
    const [editCat, setEditCat] = useState('Utilities');
    const [editDate, setEditDate] = useState('');
    const [editBranch, setEditBranch] = useState('CASHIER 1');
    const [editAttachment, setEditAttachment] = useState('');
    const [editAttachmentName, setEditAttachmentName] = useState('');
    const editFileInputRef = useRef<HTMLInputElement>(null);

    // --- MEMOS & COMPUTATIONS ---
    const uniqueCategories = useMemo(() => {
        const defaults = ['Utilities', 'Rent', 'Electricity', 'Water', 'Telecom & Dialog', 'Insurance', 'Admin', 'Uncategorized'];
        const historyCategories = transactions
            .filter(t => t.type === 'EXPENSE' && t.category)
            .map(t => t.category!);
        const productCategories = categories.map(c => c.name);

        const seen = new Set<string>();
        const result: string[] = [];

        const formatCat = (cat: string) => {
            return cat.trim().split(' ')
                .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
                .join(' ');
        };

        [...defaults, ...historyCategories, ...productCategories].forEach(cat => {
            if (!cat) return;
            const formatted = formatCat(cat);
            const key = formatted.toUpperCase();
            if (!seen.has(key)) {
                seen.add(key);
                result.push(formatted);
            }
        });

        return result.sort((a, b) => a.localeCompare(b));
    }, [transactions, categories]);

    // List of accrued, unpaid liabilities (EXPENSE transactions with paymentMethod 'CREDIT')
    const accruedLiabilities = useMemo(() => {
        return transactions.filter(t => t.type === 'EXPENSE' && t.paymentMethod === 'CREDIT' && t.status !== 'VOID');
    }, [transactions]);

    const totalOutstandingAccrued = useMemo(() => {
        return accruedLiabilities.reduce((sum, t) => sum + Number(t.amount || 0), 0);
    }, [accruedLiabilities]);

    const branches = useMemo(() => {
        return userProfile.allBranches && userProfile.allBranches.length > 0
            ? userProfile.allBranches.filter(b => b !== 'ALL')
            : ['CASHIER 1', 'CASHIER 2', 'CASHIER 3', 'CASHIER 4'];
    }, [userProfile.allBranches]);

    const branchTotals = useMemo(() => {
        return branches.map(branch => {
            const branchLiabs = accruedLiabilities.filter(t => (t.branchId || 'CASHIER 1').toUpperCase() === branch.toUpperCase());
            const totalAmount = branchLiabs.reduce((sum, t) => sum + Number(t.amount || 0), 0);
            return {
                branch,
                totalAmount,
                count: branchLiabs.length
            };
        });
    }, [branches, accruedLiabilities]);

    const filteredLiabilities = useMemo(() => {
        if (!selectedBranchFilter) return accruedLiabilities;
        return accruedLiabilities.filter(t => (t.branchId || 'CASHIER 1').toUpperCase() === selectedBranchFilter.toUpperCase());
    }, [accruedLiabilities, selectedBranchFilter]);

    const calendarCells = useMemo(() => {
        try {
            const year = calendarDate.getFullYear();
            const month = calendarDate.getMonth();

            // First day of the month
            const firstDayOfMonth = new Date(year, month, 1);
            const startDayOfWeek = firstDayOfMonth.getDay(); // 0 = Sunday, 1 = Monday, ...

            // Days in this month
            const daysInMonth = new Date(year, month + 1, 0).getDate();

            // Days in previous month
            const daysInPrevMonth = new Date(year, month, 0).getDate();

            const cells = [];
            // Prev month prefix
            for (let i = startDayOfWeek - 1; i >= 0; i--) {
                cells.push({
                    day: daysInPrevMonth - i,
                    isCurrentMonth: false,
                    date: new Date(year, month - 1, daysInPrevMonth - i)
                });
            }
            // Current month
            for (let i = 1; i <= daysInMonth; i++) {
                cells.push({
                    day: i,
                    isCurrentMonth: true,
                    date: new Date(year, month, i)
                });
            }
            // Next month suffix
            const totalCells = cells.length > 35 ? 42 : 35;
            const nextMonthDaysNeeded = totalCells - cells.length;
            for (let i = 1; i <= nextMonthDaysNeeded; i++) {
                cells.push({
                    day: i,
                    isCurrentMonth: false,
                    date: new Date(year, month + 1, i)
                });
            }
            return cells;
        } catch (error) {
            console.error("Error computing calendar cells:", error);
            return [];
        }
    }, [calendarDate]);

    const liabilitiesByDate = useMemo(() => {
        const map: Record<string, Transaction[]> = {};
        filteredLiabilities.forEach(tx => {
            const dateKey = tx.date.split('T')[0]; // "YYYY-MM-DD"
            if (!map[dateKey]) map[dateKey] = [];
            map[dateKey].push(tx);
        });
        return map;
    }, [filteredLiabilities]);

    const formatDateKey = (date: any) => {
        try {
            if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
                return '';
            }
            const y = date.getFullYear();
            const m = String(date.getMonth() + 1).padStart(2, '0');
            const d = String(date.getDate()).padStart(2, '0');
            return `${y}-${m}-${d}`;
        } catch (e) {
            console.error("formatDateKey error:", e);
            return '';
        }
    };

    const getCategoryColor = (category: any) => {
        const cat = String(category || '').toUpperCase().trim();
        switch (cat) {
            case 'RENT':
                return 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100/70';
            case 'ELECTRICITY':
                return 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100/70';
            case 'WATER':
                return 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100/70';
            case 'TELECOM & DIALOG':
                return 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100/70';
            case 'INSURANCE':
                return 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100/70';
            case 'ADMIN':
                return 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100/70';
            default:
                return 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100/70';
        }
    };

    // --- HANDLERS ---
    const handleAccountSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!accName.trim()) return;

        const newAccount: BankAccount = {
            id: editingAccount?.id || `acc-${Date.now()}`,
            name: accName.toUpperCase().trim(),
            accountNumber: accNumber.trim() || undefined,
            balance: Number(accBalance) || 0
        };

        onUpsertAccount(newAccount);
        setEditingAccount(null);
        setAccName('');
        setAccNumber('');
        setAccBalance('');
    };

    const handleEditAccount = (acc: BankAccount) => {
        setEditingAccount(acc);
        setAccName(acc.name);
        setAccNumber(acc.accountNumber || '');
        setAccBalance(String(acc.balance));
    };

    const handleAccrueLiabilitySubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const amt = Number(liabilityAmount);
        if (isNaN(amt) || amt <= 0 || !liabilityDesc.trim()) {
            alert('Please enter a valid amount and description.');
            return;
        }

        const txId = `EX-CREDIT-${Date.now()}`;
        const newTx: Transaction = {
            id: txId,
            date: liabilityDate + 'T12:00:00',
            type: 'EXPENSE',
            amount: amt,
            paymentMethod: 'CREDIT',
            description: liabilityDesc.trim(),
            category: liabilityCat,
            mainCategory: liabilityCat.toUpperCase(),
            branchId: liabilityBranch,
            attachment: liabilityAttachment || undefined,
            attachmentName: liabilityAttachmentName || undefined,
            status: 'COMPLETED'
        };

        // Save new accrued liability transaction
        await upsertDocument(dbCols.transactions, txId, newTx);
        
        // Reset form
        setLiabilityAmount('');
        setLiabilityDesc('');
        setLiabilityAttachment('');
        setLiabilityAttachmentName('');
        if (fileInputRef.current) fileInputRef.current.value = '';
        alert('Liability accrued successfully.');
    };

    const handleSettleLiability = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!settlingTx) return;

        const payingAcc = accounts.find(a => a.id === settleAccountId);
        if (!payingAcc) {
            alert('Please select a valid account to pay from.');
            return;
        }

        // Deduct payment from the selected account
        const updatedAcc = {
            ...payingAcc,
            balance: Number(payingAcc.balance) - Number(settlingTx.amount)
        };
        await onUpsertAccount(updatedAcc);

        // Convert the credit liability transaction into a paid cash/bank expense
        const updatedTx: Transaction = {
            ...settlingTx,
            paymentMethod: (settleAccountId === 'cash' ? 'CASH' : 'BANK') as any,
            accountId: settleAccountId,
            updatedAt: new Date().toISOString()
        };
        await upsertDocument(dbCols.transactions, settlingTx.id, updatedTx);

        alert('Liability settled successfully.');
        setSettlingTx(null);
    };

    const handleEditLiability = (tx: Transaction) => {
        setEditingTx(tx);
        setEditAmount(String(tx.amount));
        setEditDesc(tx.description);
        setEditCat(tx.category || 'Uncategorized');
        setEditDate(tx.date.split('T')[0]);
        setEditBranch(tx.branchId || 'CASHIER 1');
        setEditAttachment(tx.attachment || '');
        setEditAttachmentName(tx.attachmentName || '');
    };

    const handleSaveLiabilityEdit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingTx) return;

        const amt = Number(editAmount);
        if (isNaN(amt) || amt <= 0 || !editDesc.trim()) {
            alert('Please enter a valid amount and description.');
            return;
        }

        const updatedTx: Transaction = {
            ...editingTx,
            amount: amt,
            description: editDesc.trim(),
            category: editCat,
            mainCategory: editCat.toUpperCase(),
            date: editDate + 'T12:00:00',
            branchId: editBranch,
            attachment: editAttachment || undefined,
            attachmentName: editAttachmentName || undefined,
            updatedAt: new Date().toISOString()
        };

        await upsertDocument(dbCols.transactions, editingTx.id, updatedTx);
        alert('Liability updated successfully.');
        setEditingTx(null);
    };

    const handleDeleteLiability = async (id: string) => {
        if (confirm('Are you sure you want to delete this accrued liability?')) {
            await deleteDocument(dbCols.transactions, id);
            alert('Liability deleted successfully.');
        }
    };

    const viewAttachment = (tx: Transaction) => {
        if (!tx.attachment) return;
        
        // Open base64 attachment in a new browser window/iframe
        const newWindow = window.open();
        if (newWindow) {
            newWindow.document.write(
                `<iframe src="${tx.attachment}" frameborder="0" style="border:0; top:0px; left:0px; bottom:0px; right:0px; width:100%; height:100%;" allowfullscreen></iframe>`
            );
            newWindow.document.title = tx.attachmentName || 'Attachment';
            newWindow.document.close();
        } else {
            // Fallback download if popup blocked
            const link = document.createElement('a');
            link.href = tx.attachment;
            link.download = tx.attachmentName || 'attachment';
            link.click();
        }
    };

    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div>
                    <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tighter">Ledger & Liabilities</h2>
                    <p className="text-slate-500 font-bold uppercase tracking-widest text-[10px] mt-1">Manage accounts and outstanding utility commitments</p>
                </div>
                <div className="flex gap-4">
                    <button
                        onClick={() => setActiveSection('ACCOUNTS')}
                        className={`px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${activeSection === 'ACCOUNTS' ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                    >
                        🏛️ Ledger Accounts
                    </button>
                    <button
                        onClick={() => setActiveSection('LIABILITIES')}
                        className={`px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${activeSection === 'LIABILITIES' ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                    >
                        💸 Accrued Liabilities
                    </button>
                </div>
            </div>

            {/* SECTION 1: LEDGER ACCOUNTS */}
            {activeSection === 'ACCOUNTS' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Add/Edit Account Form */}
                    <div className="bg-white rounded-3xl border border-slate-200 p-8 shadow-sm h-fit">
                        <h3 className="text-base font-black text-slate-800 uppercase tracking-wider mb-6">
                            {editingAccount ? '✏️ Edit Ledger Account' : '➕ Create Ledger Account'}
                        </h3>
                        <form onSubmit={handleAccountSubmit} className="space-y-5">
                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-2">Account Name</label>
                                <input
                                    type="text"
                                    required
                                    value={accName}
                                    onChange={(e) => setAccName(e.target.value)}
                                    placeholder="e.g. Commercial Bank, Main Cash Drawer"
                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none font-bold text-xs uppercase"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-2">Account Number (Optional)</label>
                                <input
                                    type="text"
                                    value={accNumber}
                                    onChange={(e) => setAccNumber(e.target.value)}
                                    placeholder="e.g. 1000-xxxx-xxxx"
                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none font-mono text-xs"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-2">Starting Balance (Rs.)</label>
                                <input
                                    type="number"
                                    required
                                    value={accBalance}
                                    onChange={(e) => setAccBalance(e.target.value)}
                                    placeholder="0"
                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none font-mono text-xs"
                                />
                            </div>
                            <div className="flex gap-4 pt-3">
                                <button
                                    type="submit"
                                    className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all"
                                >
                                    {editingAccount ? 'Save Changes' : 'Create Account'}
                                </button>
                                {editingAccount && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setEditingAccount(null);
                                            setAccName('');
                                            setAccNumber('');
                                            setAccBalance('');
                                        }}
                                        className="px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-xl text-xs font-black uppercase tracking-wider transition-all"
                                    >
                                        Cancel
                                    </button>
                                )}
                            </div>
                        </form>
                    </div>

                    {/* Accounts List */}
                    <div className="lg:col-span-2 bg-white rounded-3xl border border-slate-200 p-8 shadow-sm">
                        <h3 className="text-base font-black text-slate-800 uppercase tracking-wider mb-6">Active Ledger Accounts</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {accounts.map(acc => (
                                <div key={acc.id} className="border border-slate-200 p-5 rounded-2xl flex flex-col justify-between hover:shadow-md transition-shadow">
                                    <div>
                                        <div className="flex justify-between items-start">
                                            <span className="text-xs font-black text-slate-800 uppercase tracking-tight block">{acc.name}</span>
                                            <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded text-[8.5px] font-bold uppercase tracking-wider">
                                                {acc.id === 'cash' ? 'Main Cash' : 'Ledger'}
                                            </span>
                                        </div>
                                        {acc.accountNumber && (
                                            <span className="text-[10px] font-mono text-slate-400 block mt-1">Num: {acc.accountNumber}</span>
                                        )}
                                    </div>
                                    <div className="mt-6 flex justify-between items-end">
                                        <div>
                                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">Available Balance</span>
                                            <span className="text-lg font-black font-mono text-slate-900">Rs. {acc.balance.toLocaleString()}</span>
                                        </div>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => handleEditAccount(acc)}
                                                className="p-2 bg-slate-50 hover:bg-indigo-50 text-slate-500 hover:text-indigo-600 rounded-lg border border-slate-200 transition-colors text-xs"
                                                title="Edit Account"
                                            >
                                                ✏️
                                            </button>
                                            {acc.id !== 'cash' && (
                                                <button
                                                    onClick={() => {
                                                        if (confirm(`Are you sure you want to delete account: ${acc.name}?`)) {
                                                            onDeleteAccount(acc.id);
                                                        }
                                                    }}
                                                    className="p-2 bg-slate-50 hover:bg-rose-50 text-slate-500 hover:text-rose-600 rounded-lg border border-slate-200 transition-colors text-xs"
                                                    title="Delete Account"
                                                >
                                                    🗑️
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* SECTION 2: ACCRUED LIABILITIES */}
            {activeSection === 'LIABILITIES' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Form to Accrue New Liability */}
                    <div className="bg-white rounded-3xl border border-slate-200 p-8 shadow-sm h-fit">
                        <h3 className="text-base font-black text-slate-800 uppercase tracking-wider mb-6">➕ Accrue Utility / Expense Liability</h3>
                        <form onSubmit={handleAccrueLiabilitySubmit} className="space-y-5">
                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-2">Category</label>
                                <select
                                    value={liabilityCat}
                                    onChange={(e) => setLiabilityCat(e.target.value)}
                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none font-bold text-xs uppercase"
                                >
                                    {uniqueCategories.map(cat => (
                                        <option key={cat} value={cat}>{cat}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-2">Responsible Cashier / Branch</label>
                                <select
                                    value={liabilityBranch}
                                    onChange={(e) => setLiabilityBranch(e.target.value)}
                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none font-bold text-xs uppercase"
                                >
                                    {(userProfile.allBranches && userProfile.allBranches.length > 0
                                        ? userProfile.allBranches.filter(b => b !== 'ALL')
                                        : ['CASHIER 1', 'CASHIER 2', 'CASHIER 3', 'CASHIER 4']
                                    ).map(b => (
                                        <option key={b} value={b}>{b}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-2">Liability Description</label>
                                <input
                                    type="text"
                                    required
                                    value={liabilityDesc}
                                    onChange={(e) => setLiabilityDesc(e.target.value)}
                                    placeholder="e.g. February CEB Electricity Bill"
                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none font-bold text-xs"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-2">Outstanding Amount (Rs.)</label>
                                <input
                                    type="number"
                                    required
                                    value={liabilityAmount}
                                    onChange={(e) => setLiabilityAmount(e.target.value)}
                                    placeholder="0"
                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none font-mono text-xs"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-2">Bill / Invoice Date</label>
                                <input
                                    type="date"
                                    required
                                    value={liabilityDate}
                                    onChange={(e) => setLiabilityDate(e.target.value)}
                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none font-mono text-xs"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-2">Invoice / Receipt Attachment</label>
                                <div className="flex items-center gap-3">
                                    <button
                                        type="button"
                                        onClick={() => fileInputRef.current?.click()}
                                        className="px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 border border-slate-200"
                                    >
                                        📎 {liabilityAttachment ? 'Change File' : 'Attach File'}
                                    </button>
                                    <input
                                        type="file"
                                        ref={fileInputRef}
                                        className="hidden"
                                        onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            if (file) {
                                                const r = new FileReader();
                                                r.onload = (ev) => {
                                                    setLiabilityAttachment(ev.target?.result as string);
                                                    setLiabilityAttachmentName(file.name);
                                                };
                                                r.readAsDataURL(file);
                                            }
                                        }}
                                    />
                                    {liabilityAttachment && (
                                        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-xl">
                                            <span className="text-[10px] font-bold text-emerald-800 truncate max-w-[150px]">{liabilityAttachmentName}</span>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setLiabilityAttachment('');
                                                    setLiabilityAttachmentName('');
                                                    if (fileInputRef.current) fileInputRef.current.value = '';
                                                }}
                                                className="text-rose-600 hover:text-rose-800 font-bold text-xs"
                                                title="Remove file"
                                            >
                                                ✕
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                            <button
                                type="submit"
                                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all pt-3"
                            >
                                Accrue Liability
                            </button>
                        </form>
                    </div>

                    {/* Outstanding Liabilities List */}
                    <div className="lg:col-span-2 space-y-6">
                        {/* Summary Cards Grid */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                            {/* Card for Total */}
                            <div
                                onClick={() => setSelectedBranchFilter(null)}
                                className={`cursor-pointer p-5 rounded-2xl border transition-all duration-200 flex flex-col justify-between shadow-sm hover:shadow-md hover:-translate-y-0.5 ${
                                    selectedBranchFilter === null
                                        ? 'bg-gradient-to-br from-indigo-50 to-indigo-100/40 border-indigo-300 ring-2 ring-indigo-500/20'
                                        : 'bg-white border-slate-200 hover:border-slate-300'
                                }`}
                            >
                                <div>
                                    <span className={`text-[10px] font-black uppercase tracking-wider block mb-1 ${
                                        selectedBranchFilter === null ? 'text-indigo-800' : 'text-slate-400'
                                    }`}>
                                        Total Outstanding Accrued
                                    </span>
                                    <span className={`text-2xl font-black font-mono ${
                                        selectedBranchFilter === null ? 'text-indigo-950' : 'text-slate-900'
                                    }`}>
                                        Rs. {totalOutstandingAccrued.toLocaleString()}
                                    </span>
                                </div>
                                <div className="mt-4 flex justify-between items-center">
                                    <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider ${
                                        selectedBranchFilter === null ? 'bg-indigo-200 text-indigo-800' : 'bg-slate-100 text-slate-500'
                                    }`}>
                                        {accruedLiabilities.length} Bills Due
                                    </span>
                                    {selectedBranchFilter === null && (
                                        <span className="text-[10px] font-black uppercase tracking-wider text-indigo-600 animate-pulse">● Active</span>
                                    )}
                                </div>
                            </div>

                            {/* Cards for each Cashier/Branch */}
                            {branchTotals.map(({ branch, totalAmount, count }) => {
                                const isActive = selectedBranchFilter?.toUpperCase() === branch.toUpperCase();
                                return (
                                    <div
                                        key={branch}
                                        onClick={() => setSelectedBranchFilter(branch)}
                                        className={`cursor-pointer p-5 rounded-2xl border transition-all duration-200 flex flex-col justify-between shadow-sm hover:shadow-md hover:-translate-y-0.5 ${
                                            isActive
                                                ? 'bg-gradient-to-br from-rose-50 to-rose-100/40 border-rose-300 ring-2 ring-rose-500/20'
                                                : 'bg-white border-slate-200 hover:border-slate-300'
                                        }`}
                                    >
                                        <div>
                                            <span className={`text-[10px] font-black uppercase tracking-wider block mb-1 ${
                                                isActive ? 'text-rose-800' : 'text-slate-400'
                                            }`}>
                                                {branch} Outstanding
                                            </span>
                                            <span className={`text-2xl font-black font-mono ${
                                                isActive ? 'text-rose-950' : 'text-slate-900'
                                            }`}>
                                                Rs. {totalAmount.toLocaleString()}
                                            </span>
                                        </div>
                                        <div className="mt-4 flex justify-between items-center">
                                            <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider ${
                                                isActive ? 'bg-rose-200 text-rose-800' : 'bg-slate-100 text-slate-500'
                                            }`}>
                                                {count} Bills Due
                                            </span>
                                            {isActive && (
                                                <span className="text-[10px] font-black uppercase tracking-wider text-rose-600 animate-pulse">● Active</span>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Liabilities Container */}
                        <div className="bg-white rounded-3xl border border-slate-200 p-8 shadow-sm">
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                                <h3 className="text-base font-black text-slate-800 uppercase tracking-wider">Accrued Bills & Obligations</h3>
                                <div className="flex gap-1.5 bg-slate-100 p-1 rounded-xl shrink-0">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            console.log("Setting viewMode to LIST");
                                            setViewMode('LIST');
                                        }}
                                        className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                                            viewMode === 'LIST' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400 hover:text-slate-600'
                                        }`}
                                    >
                                        📋 List
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            console.log("Setting viewMode to CALENDAR");
                                            setViewMode('CALENDAR');
                                        }}
                                        className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                                            viewMode === 'CALENDAR' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400 hover:text-slate-600'
                                        }`}
                                    >
                                        📅 Calendar
                                    </button>
                                </div>
                            </div>

                            {viewMode === 'CALENDAR' ? (
                                <div className="space-y-6">
                                    {/* Calendar Header / Navigation */}
                                    <div className="flex justify-between items-center bg-slate-50 p-4 rounded-2xl border border-slate-100">
                                        <div className="flex gap-2">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1, 1));
                                                }}
                                                className="px-2.5 py-1.5 hover:bg-slate-200 text-slate-600 font-bold rounded-lg text-[10px] transition-colors border border-slate-200 bg-white"
                                            >
                                                ◀ Prev
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setCalendarDate(new Date());
                                                }}
                                                className="px-3 py-1.5 hover:bg-slate-200 text-slate-700 font-black uppercase tracking-wider text-[10px] rounded-lg transition-colors border border-slate-200 bg-white"
                                            >
                                                Today
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 1));
                                                }}
                                                className="px-2.5 py-1.5 hover:bg-slate-200 text-slate-600 font-bold rounded-lg text-[10px] transition-colors border border-slate-200 bg-white"
                                            >
                                                Next ▶
                                            </button>
                                        </div>
                                        <h4 className="text-[11px] font-black text-slate-800 uppercase tracking-widest">
                                            {calendarDate.toLocaleString('default', { month: 'long' })} {calendarDate.getFullYear()}
                                        </h4>
                                    </div>

                                    {/* Calendar Grid */}
                                    <div className="border border-slate-200 rounded-2xl overflow-hidden bg-slate-50">
                                        {/* Weekdays */}
                                        <div className="border-b border-slate-200 bg-slate-100/50" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}>
                                            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                                                <div key={day} className="p-3 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest border-r border-slate-200/50 last:border-r-0">
                                                    {day}
                                                </div>
                                            ))}
                                        </div>

                                        {/* Days Grid */}
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}>
                                            {calendarCells.map((cell, idx) => {
                                                const dateKey = formatDateKey(cell.date);
                                                const cellLiabs = liabilitiesByDate[dateKey] || [];
                                                const isToday = formatDateKey(new Date()) === dateKey;
                                                
                                                return (
                                                    <div
                                                        key={idx}
                                                        className={`p-2 bg-white border-b border-r border-slate-100 last:border-r-0 flex flex-col justify-between hover:bg-slate-50/30 transition-colors ${
                                                            !cell.isCurrentMonth ? 'opacity-40 bg-slate-50/20' : ''
                                                        }`}
                                                        style={{ minHeight: '110px' }}
                                                    >
                                                        <div className="flex justify-between items-start">
                                                            <span className={`text-[10px] font-bold ${
                                                                isToday
                                                                    ? 'bg-indigo-600 text-white w-5 h-5 rounded-full flex items-center justify-center font-black shadow-sm'
                                                                    : cell.isCurrentMonth ? 'text-slate-700' : 'text-slate-300'
                                                            }`}>
                                                                {cell.day}
                                                            </span>
                                                            {cellLiabs.length > 0 && (
                                                                <span className="px-1.5 py-0.5 bg-rose-100 text-rose-800 rounded text-[8px] font-black uppercase tracking-wider">
                                                                    {cellLiabs.length}
                                                                </span>
                                                            )}
                                                        </div>

                                                        {/* Bills in this day */}
                                                        <div className="mt-2 space-y-1 overflow-y-auto max-h-[80px] custom-scrollbar flex-1">
                                                            {cellLiabs.map(tx => (
                                                                <div
                                                                    key={tx.id}
                                                                    onClick={() => setSelectedCalendarTx(tx)}
                                                                    className={`cursor-pointer px-2 py-1 rounded text-[9px] font-bold border transition-all truncate flex flex-col gap-0.5 ${getCategoryColor(tx.category || '')}`}
                                                                    title={`${tx.description} - Rs. ${tx.amount.toLocaleString()}`}
                                                                >
                                                                    <span className="font-black uppercase tracking-wide text-[7.5px] truncate block opacity-80">{tx.category}</span>
                                                                    <span className="truncate block">{tx.description}</span>
                                                                    <span className="font-mono text-[8px] font-black">Rs. {tx.amount.toLocaleString()}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="border border-slate-200 rounded-2xl overflow-hidden">
                                <table className="w-full border-collapse">
                                    <thead>
                                        <tr className="bg-slate-50 border-b border-slate-200">
                                            <th className="text-left p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest w-[40%]">Obligation Description</th>
                                            <th className="text-center p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest w-[30%]">Amount Owed</th>
                                            <th className="text-right p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest w-[30%]">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredLiabilities.map(tx => (
                                            <tr key={tx.id} className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                                                <td className="p-4">
                                                    <span className="text-xs font-black text-rose-800 uppercase tracking-wider">{tx.category}</span>
                                                    <span className="text-sm font-bold text-slate-800 block mt-0.5">{tx.description}</span>
                                                    <span className="text-[10px] text-slate-400 font-mono block mt-0.5">Billed on {tx.date.split('T')[0]} • {tx.branchId || 'GLOBAL'}</span>
                                                </td>
                                                <td className="p-4 text-center">
                                                    <span className="font-black font-mono text-slate-900 text-sm">Rs. {tx.amount.toLocaleString()}</span>
                                                </td>
                                                <td className="p-4 text-right">
                                                    <div className="flex justify-end gap-2">
                                                        {tx.attachment && (
                                                            <button
                                                                onClick={() => viewAttachment(tx)}
                                                                className="px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-600 text-indigo-700 hover:text-white rounded-xl text-[10px] font-black uppercase tracking-wider border border-indigo-200 transition-all flex items-center gap-1"
                                                                title="View Invoice Attachment"
                                                            >
                                                                📎 View
                                                            </button>
                                                        )}
                                                        <button
                                                            onClick={() => handleEditLiability(tx)}
                                                            className="px-2.5 py-1.5 bg-slate-50 hover:bg-indigo-50 text-slate-500 hover:text-indigo-600 rounded-xl text-[10px] font-black uppercase tracking-wider border border-slate-200 transition-all flex items-center gap-1"
                                                            title="Edit Obligation"
                                                        >
                                                            ✏️ Edit
                                                        </button>
                                                        <button
                                                            onClick={() => handleDeleteLiability(tx.id)}
                                                            className="px-2.5 py-1.5 bg-slate-50 hover:bg-rose-50 text-rose-500 hover:text-rose-600 rounded-xl text-[10px] font-black uppercase tracking-wider border border-slate-200 transition-all flex items-center gap-1"
                                                            title="Delete Obligation"
                                                        >
                                                            🗑️ Delete
                                                        </button>
                                                        <button
                                                            onClick={() => setSettlingTx(tx)}
                                                            className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-600 text-emerald-700 hover:text-white rounded-xl text-[10px] font-black uppercase tracking-wider border border-emerald-200 transition-all flex items-center gap-1"
                                                        >
                                                            ✅ Settle Bill
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                        {filteredLiabilities.length === 0 && (
                                            <tr>
                                                <td colSpan={3} className="p-8 text-center text-xs font-bold text-slate-400 italic">
                                                    No accrued liabilities outstanding{selectedBranchFilter ? ` for ${selectedBranchFilter}` : ''}.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* SETTLE LIABILITY MODAL */}
            {settlingTx && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl border border-slate-200 p-8 shadow-2xl w-full max-w-md">
                        <div className="flex justify-between items-start mb-6">
                            <div>
                                <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Settle Liability Bill</h3>
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">Record payment for outstanding obligation</p>
                            </div>
                            <button
                                onClick={() => setSettlingTx(null)}
                                className="text-slate-400 hover:text-slate-700 text-xl font-bold"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="bg-rose-50 border border-rose-200 p-4 rounded-2xl mb-6">
                            <span className="text-[10px] font-bold text-rose-700 uppercase tracking-wider block">{settlingTx.description}</span>
                            <span className="text-2xl font-black font-mono text-rose-950">Rs. {settlingTx.amount.toLocaleString()}</span>
                        </div>

                        <form onSubmit={handleSettleLiability} className="space-y-5">
                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-2">Pay From Ledger Account</label>
                                <select
                                    value={settleAccountId}
                                    onChange={(e) => setSettleAccountId(e.target.value)}
                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none font-bold text-xs uppercase"
                                >
                                    {accounts.map(acc => (
                                        <option key={acc.id} value={acc.id}>
                                            {acc.name} (Rs. {acc.balance.toLocaleString()})
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="flex gap-4 pt-3">
                                <button
                                    type="submit"
                                    className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all"
                                >
                                    Confirm Payment
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setSettlingTx(null)}
                                    className="px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-xl text-xs font-black uppercase tracking-wider transition-all"
                                >
                                    Cancel
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* EDIT LIABILITY MODAL */}
            {editingTx && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl border border-slate-200 p-8 shadow-2xl w-full max-w-md">
                        <div className="flex justify-between items-start mb-6">
                            <div>
                                <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Edit Accrued Liability</h3>
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">Modify liability details</p>
                            </div>
                            <button
                                onClick={() => setEditingTx(null)}
                                className="text-slate-400 hover:text-slate-700 text-xl font-bold"
                            >
                                ✕
                            </button>
                        </div>

                        <form onSubmit={handleSaveLiabilityEdit} className="space-y-5">
                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-2">Category</label>
                                <select
                                    value={editCat}
                                    onChange={(e) => setEditCat(e.target.value)}
                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none font-bold text-xs uppercase"
                                >
                                    {uniqueCategories.map(cat => (
                                        <option key={cat} value={cat}>{cat}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-2">Responsible Cashier / Branch</label>
                                <select
                                    value={editBranch}
                                    onChange={(e) => setEditBranch(e.target.value)}
                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none font-bold text-xs uppercase"
                                >
                                    {(userProfile.allBranches && userProfile.allBranches.length > 0
                                        ? userProfile.allBranches.filter(b => b !== 'ALL')
                                        : ['CASHIER 1', 'CASHIER 2', 'CASHIER 3', 'CASHIER 4']
                                    ).map(b => (
                                        <option key={b} value={b}>{b}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-2">Description</label>
                                <input
                                    type="text"
                                    required
                                    value={editDesc}
                                    onChange={(e) => setEditDesc(e.target.value)}
                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none font-bold text-xs"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-2">Amount Owed (Rs.)</label>
                                <input
                                    type="number"
                                    required
                                    value={editAmount}
                                    onChange={(e) => setEditAmount(e.target.value)}
                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none font-mono text-xs"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-2">Bill Date</label>
                                <input
                                    type="date"
                                    required
                                    value={editDate}
                                    onChange={(e) => setEditDate(e.target.value)}
                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none font-mono text-xs"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-2">Invoice / Receipt Attachment</label>
                                <div className="flex items-center gap-3">
                                    <button
                                        type="button"
                                        onClick={() => editFileInputRef.current?.click()}
                                        className="px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 border border-slate-200"
                                    >
                                        📎 {editAttachment ? 'Change File' : 'Attach File'}
                                    </button>
                                    <input
                                        type="file"
                                        ref={editFileInputRef}
                                        className="hidden"
                                        onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            if (file) {
                                                const r = new FileReader();
                                                r.onload = (ev) => {
                                                    setEditAttachment(ev.target?.result as string);
                                                    setEditAttachmentName(file.name);
                                                };
                                                r.readAsDataURL(file);
                                            }
                                        }}
                                    />
                                    {editAttachment && (
                                        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-xl">
                                            <span className="text-[10px] font-bold text-emerald-800 truncate max-w-[150px]">{editAttachmentName}</span>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setEditAttachment('');
                                                    setEditAttachmentName('');
                                                    if (editFileInputRef.current) editFileInputRef.current.value = '';
                                                }}
                                                className="text-rose-600 hover:text-rose-800 font-bold text-xs"
                                                title="Remove file"
                                            >
                                                ✕
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="flex gap-4 pt-3">
                                <button
                                    type="submit"
                                    className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all"
                                >
                                    Save Changes
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setEditingTx(null)}
                                    className="px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-xl text-xs font-black uppercase tracking-wider transition-all"
                                >
                                    Cancel
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* CALENDAR TRANSACTION DETAIL MODAL */}
            {selectedCalendarTx && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl border border-slate-200 p-8 shadow-2xl w-full max-w-md animate-in zoom-in-95 duration-200">
                        <div className="flex justify-between items-start mb-6">
                            <div>
                                <span className="px-2.5 py-1 bg-rose-100 text-rose-800 rounded-full text-[9px] font-black uppercase tracking-widest">
                                    {selectedCalendarTx.category || 'Liability'}
                                </span>
                                <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter mt-2">{selectedCalendarTx.description}</h3>
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">
                                    Billed on {selectedCalendarTx.date.split('T')[0]} • {selectedCalendarTx.branchId || 'GLOBAL'}
                                </p>
                            </div>
                            <button
                                onClick={() => setSelectedCalendarTx(null)}
                                className="text-slate-400 hover:text-slate-700 text-xl font-bold"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="bg-rose-50 border border-rose-200 p-5 rounded-2xl mb-6">
                            <span className="text-[9px] font-black text-rose-700 uppercase tracking-wider block mb-1">Outstanding Liability Amount</span>
                            <span className="text-3xl font-black font-mono text-rose-950">Rs. {selectedCalendarTx.amount.toLocaleString()}</span>
                        </div>

                        {selectedCalendarTx.attachmentName && (
                            <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl mb-6 flex justify-between items-center">
                                <div>
                                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Attachment</span>
                                    <span className="text-xs font-bold text-slate-700 truncate max-w-[200px] block mt-0.5">{selectedCalendarTx.attachmentName}</span>
                                </div>
                                <button
                                    onClick={() => viewAttachment(selectedCalendarTx)}
                                    className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-600 text-indigo-700 hover:text-white rounded-xl text-[10px] font-black uppercase tracking-wider border border-indigo-200 transition-all flex items-center gap-1"
                                >
                                    📎 View
                                </button>
                            </div>
                        )}

                        <div className="grid grid-cols-3 gap-3">
                            <button
                                onClick={() => {
                                    handleEditLiability(selectedCalendarTx);
                                    setSelectedCalendarTx(null);
                                }}
                                className="py-3 bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-600 border border-slate-200 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5"
                            >
                                ✏️ Edit
                            </button>
                            <button
                                onClick={() => {
                                    handleDeleteLiability(selectedCalendarTx.id);
                                    setSelectedCalendarTx(null);
                                }}
                                className="py-3 bg-slate-100 hover:bg-rose-50 text-slate-700 hover:text-rose-600 border border-slate-200 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5"
                            >
                                🗑️ Delete
                            </button>
                            <button
                                onClick={() => {
                                    setSettlingTx(selectedCalendarTx);
                                    setSelectedCalendarTx(null);
                                }}
                                className="py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-600/10"
                            >
                                ✅ Settle
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AccountingLiabilities;
