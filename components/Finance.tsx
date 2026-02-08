
import React, { useState, useMemo } from 'react';
import { Transaction, Product, BankAccount, Vendor, UserProfile, DaySession, RecurringExpense, Customer } from '../types';

interface FinanceProps {
   accounts: BankAccount[];
   customers: Customer[];
   transactions: Transaction[];
   daySessions: DaySession[];
   products: Product[];
   vendors: Vendor[];
   recurringExpenses: RecurringExpense[];
   userProfile: UserProfile;
   onOpenDay: (bal: number) => void;
   onCloseDay: (actual: number) => void;
   onAddExpense: (tx: any) => void;
   onAddTransfer: (tx: any) => void;
   onUpdateTransaction: (tx: Transaction) => void;
   onDeleteTransaction: (id: string) => void;
   onAddRecurring: (re: RecurringExpense) => void;
   onDeleteRecurring: (id: string) => void;
   onUpsertAccount: (acc: BankAccount) => void;
   onDeleteAccount: (id: string) => void;
}

const Finance: React.FC<FinanceProps> = ({
   accounts = [], transactions = [], daySessions = [], products = [], vendors = [], recurringExpenses = [], customers = [], userProfile,
   onOpenDay, onCloseDay, onAddExpense, onAddTransfer, onUpdateTransaction, onDeleteTransaction,
   onAddRecurring, onDeleteRecurring, onUpsertAccount, onDeleteAccount
}) => {
   const today = new Date().toISOString().split('T')[0];
   const currentSession = daySessions.find(s => s.date === today);
   const dayTransactions = transactions.filter(t => t.date.split('T')[0] === today);

   // Modals State
   const [showExpenseModal, setShowExpenseModal] = useState(false);
   const [showTransferModal, setShowTransferModal] = useState(false);
   const [showAccountsModal, setShowAccountsModal] = useState(false);
   const [showRecurringModal, setShowRecurringModal] = useState(false);

   // Edit State
   const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);

   // Filter State for Date Range
   const [startDate, setStartDate] = useState(today);
   const [endDate, setEndDate] = useState(today);
   const filterActive = startDate !== today || endDate !== today;

   // Form States
   const [expAmount, setExpAmount] = useState('');
   const [expDesc, setExpDesc] = useState('');
   const [expCategory, setExpCategory] = useState('');
   const [expMainCategory, setExpMainCategory] = useState('');
   const [expSource, setExpSource] = useState('cash');
   const [expIsLoan, setExpIsLoan] = useState(false);
   const [expCustomerId, setExpCustomerId] = useState('');

   const [transAmount, setTransAmount] = useState('');
   const [transSource, setTransSource] = useState('cash');
   const [transTarget, setTransTarget] = useState('');

   const [accName, setAccName] = useState('');
   const [accNum, setAccNum] = useState('');
   const [accBal, setAccBal] = useState('');

   // Filtered transactions based on date range
   // 1. Transactions for the selected period (Date Range or Today)
   const periodTransactions = useMemo(() => {
      const isFiltering = startDate !== today || endDate !== today;
      if (!isFiltering) return dayTransactions;
      return transactions.filter(t => {
         const txDate = t.date.split('T')[0];
         return txDate >= startDate && txDate <= endDate;
      });
   }, [transactions, startDate, endDate, dayTransactions, today]);

   // Column Filters
   const [filterEntity, setFilterEntity] = useState('');
   const [filterProtocol, setFilterProtocol] = useState('');
   const [filterSource, setFilterSource] = useState('');

   // 2. Final filtered transactions for display
   const filteredTransactions = useMemo(() => {
      return periodTransactions.filter(t => {
         const matchEntity = (t.description || '').toLowerCase().includes(filterEntity.toLowerCase()) ||
            (t.category || '').toLowerCase().includes(filterEntity.toLowerCase()) ||
            (t.mainCategory || '').toLowerCase().includes(filterEntity.toLowerCase());
         const matchProtocol = (t.type || '').toLowerCase().includes(filterProtocol.toLowerCase());
         const sourceName = accounts.find(a => a.id === t.accountId)?.name || 'Direct';
         const destName = t.destinationAccountId ? (accounts.find(a => a.id === t.destinationAccountId)?.name || '') : '';
         const matchSource = sourceName.toLowerCase().includes(filterSource.toLowerCase()) ||
            destName.toLowerCase().includes(filterSource.toLowerCase());
         return matchEntity && matchProtocol && matchSource;
      });
   }, [periodTransactions, filterEntity, filterProtocol, filterSource, accounts]);

   const dayStats = useMemo(() => {
      const dataToUse = periodTransactions;
      const totalInflow = dataToUse
         .filter(t => (t.type === 'SALE' || t.type === 'CREDIT_PAYMENT') && t.paymentMethod !== 'CREDIT')
         .reduce((acc, t) => acc + (Number(t.amount) || 0), 0);

      const totalOutflow = dataToUse
         .filter(t => t.type === 'EXPENSE' || t.type === 'PURCHASE' || (t.type === 'TRANSFER' && t.accountId))
         .reduce((acc, t) => acc + (Number(t.amount) || 0), 0);

      const cashIn = dataToUse
         .filter(t => (t.type === 'SALE' || t.type === 'CREDIT_PAYMENT' || (t.type === 'TRANSFER' && t.destinationAccountId === 'cash')) && t.paymentMethod === 'CASH')
         .reduce((acc, t) => acc + (Number(t.amount) || 0), 0);

      const cashOut = dataToUse
         .filter(t => (t.type === 'EXPENSE' || t.type === 'PURCHASE' || (t.type === 'TRANSFER' && t.accountId === 'cash')) && t.paymentMethod === 'CASH')
         .reduce((acc, t) => acc + (Number(t.amount) || 0), 0);

      const totalExpenses = dataToUse
         .filter(t => t.type === 'EXPENSE')
         .reduce((acc, t) => acc + (Number(t.amount) || 0), 0);

      const opening = Number(currentSession?.openingBalance) || 0;
      const expectedCash = opening + cashIn - cashOut;

      return { cashIn, cashOut, expectedCash, totalInflow, totalOutflow, totalExpenses };
   }, [periodTransactions, currentSession]);

   const uniqueCategories = useMemo(() => {
      const historyCategories = transactions
         .filter(t => t.type === 'EXPENSE' && t.category)
         .map(t => t.category!);
      const defaults = ['UTILITIES', 'RENT', 'SALARY', 'SUPPLIES', 'MAINTENANCE', 'TRANSPORT', 'MARKETING', 'OTHER'];
      return Array.from(new Set([...defaults, ...historyCategories])).sort();
   }, [transactions]);

   const uniqueMainCategories = useMemo(() => {
      const historyMain = transactions
         .filter(t => t.type === 'EXPENSE' && t.mainCategory)
         .map(t => t.mainCategory!);
      const defaults = ['FIXED OPS', 'VARIABLE OPS', 'COGS', 'MARKETING', 'ADMIN', 'PERSONNEL', 'FINANCIAL'];
      return Array.from(new Set([...defaults, ...historyMain])).sort();
   }, [transactions]);

   const handleExpenseSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (!expAmount) return;
      if (!expIsLoan && !expDesc) return;
      if (expIsLoan && !expCustomerId) return;

      const finalDesc = expIsLoan
         ? (expDesc || `LOAN GIVEN TO ${customers.find(c => c.id === expCustomerId)?.name || 'CUSTOMER'}`).toUpperCase()
         : expDesc.toUpperCase();

      const finalType = expIsLoan ? 'LOAN_GIVEN' : 'EXPENSE';

      if (editingTransaction) {
         onUpdateTransaction({
            ...editingTransaction,
            amount: parseFloat(expAmount),
            description: finalDesc,
            category: expCategory.toUpperCase(),
            mainCategory: expMainCategory.toUpperCase(),
            paymentMethod: expSource === 'cash' ? 'CASH' : 'BANK',
            accountId: expSource,
            type: finalType,
            customerId: expIsLoan ? expCustomerId : undefined
         });
      } else {
         onAddExpense({
            amount: parseFloat(expAmount),
            description: finalDesc,
            category: expCategory.toUpperCase(),
            mainCategory: expMainCategory.toUpperCase(),
            paymentMethod: expSource === 'cash' ? 'CASH' : 'BANK',
            accountId: expSource,
            type: finalType,
            customerId: expIsLoan ? expCustomerId : undefined
         });
      }

      setExpAmount('');
      setExpDesc('');
      setExpCategory('');
      setExpMainCategory('');
      setExpIsLoan(false);
      setExpCustomerId('');
      setEditingTransaction(null);
      setShowExpenseModal(false);
   };

   const handleTransferSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (!transAmount || !transTarget || transSource === transTarget) return;
      onAddTransfer({
         amount: parseFloat(transAmount),
         description: `INTERNAL TRANSFER: ${transSource.toUpperCase()} TO ${transTarget.toUpperCase()}`,
         accountId: transSource,
         destinationAccountId: transTarget,
         paymentMethod: (transSource === 'cash' || transTarget === 'cash') ? 'CASH' : 'BANK',
         type: 'TRANSFER'
      });
      setTransAmount('');
      setTransTarget('');
      setShowTransferModal(false);
   };

   const handleAccountSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (!accName) return;
      onUpsertAccount({
         id: `ACC-${Date.now()}`,
         name: accName.toUpperCase(),
         accountNumber: accNum,
         balance: parseFloat(accBal) || 0
      });
      setAccName('');
      setAccNum('');
      setAccBal('');
   };

   const openEditExpense = (tx: Transaction) => {
      setEditingTransaction(tx);
      setExpAmount(tx.amount.toString());
      setExpDesc(tx.description);
      setExpCategory(tx.category || '');
      setExpMainCategory(tx.mainCategory || '');
      setExpSource(tx.accountId || 'cash');
      setExpIsLoan(tx.type === 'LOAN_GIVEN');
      setExpCustomerId(tx.customerId || '');
      setShowExpenseModal(true);
   };

   return (
      <div className="space-y-10 animate-in fade-in duration-500 pb-20">
         <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8">
            <div>
               <h2 className="text-4xl font-black text-slate-900 uppercase tracking-tighter">Finance Terminal</h2>
               <div className="flex gap-6 mt-3">
                  <div className="flex items-center gap-2">
                     <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                     <p className="text-slate-500 font-black uppercase tracking-widest text-[10px]">IN: Rs. {dayStats.totalInflow.toLocaleString()}</p>
                  </div>
                  <div className="flex items-center gap-2">
                     <div className="w-2 h-2 rounded-full bg-rose-500"></div>
                     <p className="text-slate-500 font-black uppercase tracking-widest text-[10px]">OUT: Rs. {dayStats.totalOutflow.toLocaleString()}</p>
                  </div>
                  {(startDate !== today || endDate !== today) && (
                     <div className="flex items-center gap-2 ml-4 pl-4 border-l border-slate-300">
                        <div className="w-2 h-2 rounded-full bg-purple-500"></div>
                        <p className="text-slate-500 font-black uppercase tracking-widest text-[10px]">EXPENSES: Rs. {dayStats.totalExpenses.toLocaleString()}</p>
                     </div>
                  )}
               </div>
            </div>

            <div className="flex flex-wrap gap-4 items-center">
               {/* Date Range Filter */}
               <div className="flex gap-3 items-center">
                  <div className="relative">
                     <input
                        type="date"
                        value={startDate}
                        onChange={e => setStartDate(e.target.value)}
                        className="px-6 py-3 rounded-2xl border border-slate-200 font-semibold text-sm text-slate-900 outline-none focus:border-slate-400 transition-all bg-white w-48 appearance-none"
                        style={{ backgroundImage: 'url(data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2220%22 height=%2220%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%23334155%22 stroke-width=%222%22%3E%3Crect x=%224%22 y=%222%22 width=%2216%22 height=%2216%22 rx=%222%22/%3E%3Cpath d=%22M16 2v4M8 2v4M4 10h16%22/%3E%3C/svg%3E)', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', backgroundSize: '20px', paddingRight: '40px' }}
                     />
                  </div>

                  <div className="relative">
                     <input
                        type="date"
                        value={endDate}
                        onChange={e => setEndDate(e.target.value)}
                        className="px-6 py-3 rounded-2xl border border-slate-200 font-semibold text-sm text-slate-900 outline-none focus:border-slate-400 transition-all bg-white w-48 appearance-none"
                        style={{ backgroundImage: 'url(data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2220%22 height=%2220%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%23334155%22 stroke-width=%222%22%3E%3Crect x=%224%22 y=%222%22 width=%2216%22 height=%2216%22 rx=%222%22/%3E%3Cpath d=%22M16 2v4M8 2v4M4 10h16%22/%3E%3C/svg%3E)', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', backgroundSize: '20px', paddingRight: '40px' }}
                     />
                  </div>

                  <button
                     onClick={() => {
                        setStartDate(today);
                        setEndDate(today);
                     }}
                     className="px-6 py-3 rounded-2xl border border-slate-200 text-slate-900 font-black text-[10px] uppercase tracking-widest hover:bg-slate-50 transition-all shadow-sm"
                  >
                     Reset
                  </button>
               </div>

               <div className="w-px h-10 bg-slate-200 hidden md:block"></div>

               <button onClick={() => setShowAccountsModal(true)} className="bg-white border border-slate-200 text-slate-900 px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 transition-all shadow-sm">Manage Accounts</button>
               <button onClick={() => setShowTransferModal(true)} className="bg-slate-900 text-white px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-black transition-all shadow-xl">Internal Transfer</button>
               <button onClick={() => {
                  setEditingTransaction(null);
                  setExpAmount('');
                  setExpDesc('');
                  setExpCategory('');
                  setExpCategory('');
                  setExpMainCategory('');
                  setExpSource('cash');
                  setExpIsLoan(false);
                  setExpCustomerId('');
                  setShowExpenseModal(true);
               }} className="bg-rose-600 text-white px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-rose-700 transition-all shadow-xl shadow-rose-200">Record Expense</button>

               <div className="w-px h-10 bg-slate-200 mx-2 hidden md:block"></div>

               {!currentSession || currentSession.status === 'CLOSED' ? (
                  <button onClick={() => {
                     const bal = prompt("Enter Opening Float (Cash Drawer):", "0");
                     if (bal !== null) onOpenDay(parseFloat(bal) || 0);
                  }} className="bg-indigo-600 text-white px-8 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-indigo-200 hover:bg-indigo-700 transition-all">Initialize Float</button>
               ) : (
                  <button onClick={() => {
                     const actual = prompt("Actual Closing Cash in Drawer:", dayStats.expectedCash.toString());
                     if (actual !== null) onCloseDay(parseFloat(actual) || 0);
                  }} className="bg-amber-500 text-white px-8 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl hover:bg-amber-600 transition-all">Close Register</button>
               )}
            </div>
         </header>

         {/* Financial Health Snapshot */}
         {/* Financial Health Snapshot */}
         <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm relative overflow-hidden group">
               <div className="absolute -right-4 -top-4 w-24 h-24 bg-slate-50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"></div>
               <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Opening Cash Float</p>
               <p className="text-2xl font-black font-mono text-slate-900 tracking-tighter">Rs. {Number(currentSession?.openingBalance || 0).toLocaleString()}</p>
               <p className="text-[8px] font-bold text-slate-300 mt-1 uppercase">Initial Liquidity Entry</p>
            </div>
            <div className="bg-indigo-600 p-6 rounded-2xl shadow-xl shadow-indigo-100 relative overflow-hidden">
               <div className="absolute right-0 bottom-0 p-2 opacity-10 text-5xl font-black italic select-none">CASH</div>
               <p className="text-[9px] font-black text-indigo-200 uppercase tracking-widest mb-2">Expected Drawer Balance</p>
               <p className="text-2xl font-black font-mono text-white tracking-tighter">Rs. {dayStats.expectedCash.toLocaleString()}</p>
               <p className="text-[8px] font-bold text-indigo-300 mt-1 uppercase">Based on Real-Time Inflow/Outflow</p>
            </div>
            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm relative overflow-hidden group">
               <div className="absolute -right-4 -top-4 w-24 h-24 bg-emerald-50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"></div>
               <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Combined Bank Reserves</p>
               <p className="text-2xl font-black font-mono text-emerald-600 tracking-tighter">Rs. {accounts.filter(a => a.id !== 'cash').reduce((acc, a) => acc + Number(a.balance), 0).toLocaleString()}</p>
               <p className="text-[8px] font-bold text-slate-300 mt-1 uppercase tracking-tight">{accounts.length - 1} External Nodes Linked</p>
            </div>
         </div>

         {/* Ledger Audit Table */}
         <div className="bg-white rounded-[3.5rem] shadow-sm border border-slate-100 overflow-hidden">
            <div className="p-10 border-b border-slate-50 flex justify-between items-center bg-slate-50/20">
               <h3 className="font-black text-slate-900 uppercase tracking-tighter text-xs">
                  {filterActive ? `Expenses: ${startDate} to ${endDate}` : "Today's Audit Trail"}
               </h3>
               <div className="flex gap-4">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{filteredTransactions.length} ENTRIES RECORDED</span>
               </div>
            </div>
            <div className="overflow-x-auto">
               <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-slate-400">
                     <tr>
                        <th className="px-6 py-3 font-black uppercase tracking-widest text-[9px] align-bottom">
                           Operation / Entity
                           <input
                              className="mt-2 w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-[9px] text-slate-900 outline-none focus:border-indigo-500 uppercase"
                              placeholder="Filter..."
                              value={filterEntity}
                              onChange={e => setFilterEntity(e.target.value)}
                           />
                        </th>
                        <th className="px-6 py-3 font-black uppercase tracking-widest text-[9px] text-center align-bottom">
                           Protocol
                           <input
                              className="mt-2 w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-[9px] text-slate-900 outline-none focus:border-indigo-500 uppercase text-center"
                              placeholder="Type..."
                              value={filterProtocol}
                              onChange={e => setFilterProtocol(e.target.value)}
                           />
                        </th>
                        <th className="px-6 py-3 font-black uppercase tracking-widest text-[9px] align-bottom">
                           Source Node
                           <input
                              className="mt-2 w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-[9px] text-slate-900 outline-none focus:border-indigo-500 uppercase"
                              placeholder="Account..."
                              value={filterSource}
                              onChange={e => setFilterSource(e.target.value)}
                           />
                        </th>
                        <th className="px-6 py-3 font-black uppercase tracking-widest text-[9px] text-right align-bottom">Value (Rs.)</th>
                     </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                     {filteredTransactions.length > 0 ? filteredTransactions.map(t => (
                        <tr key={t.id} className="hover:bg-slate-50 transition-colors group">
                           <td className="px-3 py-2">
                              <div className="flex items-center justify-between gap-4">
                                 <div className="flex flex-col gap-0.5">
                                    <div className="flex items-baseline gap-2">
                                       <p className="font-black text-slate-900 uppercase text-[11px] leading-none tracking-tight truncate max-w-[300px] xl:max-w-none">
                                          {t.description}
                                       </p>
                                       <p className="text-[9px] font-mono text-slate-400 uppercase tracking-tighter font-bold whitespace-nowrap opacity-60 leading-none">
                                          {t.id} <span className="mx-1">|</span> {new Date(t.date).toLocaleString()}
                                       </p>
                                    </div>
                                    {t.category && <span className="block text-[9px] font-bold text-indigo-500 leading-none">{t.mainCategory ? `${t.mainCategory} > ` : ''}{t.category}</span>}
                                 </div>
                                 {t.type === 'EXPENSE' && (
                                    <button
                                       onClick={() => openEditExpense(t)}
                                       className="text-[9px] font-black uppercase tracking-widest text-indigo-500 hover:text-indigo-700 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap"
                                    >
                                       ✏️ EDIT
                                    </button>
                                 )}
                              </div>
                           </td>
                           <td className="px-3 py-2 text-center whitespace-nowrap">
                              <span className={`px-2 py-1 rounded text-[8px] font-black uppercase tracking-widest shadow-sm ${t.type === 'SALE' || t.type === 'CREDIT_PAYMENT'
                                 ? 'bg-emerald-50 text-emerald-600'
                                 : t.type === 'TRANSFER'
                                    ? 'bg-indigo-50 text-indigo-600'
                                    : 'bg-rose-50 text-rose-600'
                                 }`}>{t.type === 'EXPENSE' && t.mainCategory ? `${t.mainCategory}` : t.type}</span>
                           </td>
                           <td className="px-3 py-2 whitespace-nowrap">
                              <div className="flex items-center gap-2">
                                 <span className="text-[12px]">{t.accountId === 'cash' ? '💵' : '🏦'}</span>
                                 <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                                    {accounts.find(a => a.id === t.accountId)?.name || 'Direct'}
                                    {t.destinationAccountId && ` ➔ ${accounts.find(a => a.id === t.destinationAccountId)?.name}`}
                                 </p>
                              </div>
                           </td>
                           <td className="px-3 py-2 text-right whitespace-nowrap">
                              <p className={`text-sm font-black font-mono tracking-tighter ${t.type === 'SALE' || t.type === 'CREDIT_PAYMENT' || (t.type === 'TRANSFER' && t.destinationAccountId)
                                 ? 'text-slate-900'
                                 : 'text-rose-600'
                                 }`}>
                                 {t.type === 'SALE' || t.type === 'CREDIT_PAYMENT' ? '+' : t.type === 'TRANSFER' ? '•' : '-'} Rs. {Number(t.amount).toLocaleString()}
                              </p>
                           </td>
                        </tr>
                     )) : (
                        <tr>
                           <td colSpan={4} className="px-10 py-32 text-center">
                              <div className="opacity-10 text-6xl mb-4 grayscale">💰</div>
                              <p className="text-slate-300 font-black uppercase tracking-[0.4em] text-[10px]">Zero commercial activity recorded for this period</p>
                           </td>
                        </tr>
                     )}
                  </tbody>
               </table>
            </div>
         </div>

         {/* Expense Modal */}
         {/* Expense Modal */}
         {showExpenseModal && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-xl">
               <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in duration-300 max-h-[85vh] flex flex-col">
                  <div className="p-5 border-b border-slate-50 bg-slate-50 flex justify-between items-center shrink-0">
                     <div>
                        <h3 className="text-lg font-black text-slate-900 uppercase tracking-tighter">
                           {editingTransaction ? 'Edit Expense' : 'Record Expense'}
                        </h3>
                        <p className="text-[8px] font-black text-rose-500 uppercase tracking-widest mt-0.5">Capital Expenditure Entry</p>
                     </div>
                     <button onClick={() => {
                        setShowExpenseModal(false);
                        setEditingTransaction(null);
                        setExpAmount('');
                        setExpDesc('');
                        setExpCategory('');
                        setExpMainCategory('');
                        setExpIsLoan(false);
                        setExpCustomerId('');
                     }} className="text-slate-300 hover:text-slate-900 text-2xl leading-none">&times;</button>
                  </div>
                  <form onSubmit={handleExpenseSubmit} className="p-5 space-y-3 overflow-y-auto">
                     <div className="space-y-0.5">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Source Account</label>
                        <select value={expSource} onChange={e => setExpSource(e.target.value)} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 font-black uppercase text-[10px] bg-white outline-none focus:border-indigo-500">
                           {accounts.map(acc => <option key={acc.id} value={acc.id}>{acc.name} (Rs. {acc.balance.toLocaleString()})</option>)}
                        </select>
                     </div>
                     <div className="space-y-0.5">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Amount (Rs.)</label>
                        <input required type="number" step="0.01" className="w-full px-4 py-2.5 rounded-xl border border-slate-200 font-black font-mono text-lg text-indigo-600 outline-none focus:border-indigo-500" placeholder="0.00" value={expAmount} onChange={e => setExpAmount(e.target.value)} />
                     </div>
                     <div className="flex items-center gap-1.5">
                        <input id="loan-toggle" type="checkbox" className="w-4 h-4 accent-indigo-600" checked={expIsLoan} onChange={e => setExpIsLoan(e.target.checked)} />
                        <label htmlFor="loan-toggle" className="text-[10px] font-black text-slate-700 uppercase tracking-wider cursor-pointer select-none">Issue as Loan to Customer?</label>
                     </div>

                     {expIsLoan ? (
                        <div className="space-y-2 animate-in fade-in zoom-in duration-300">
                           <label className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">Select Beneficiary (Customer)</label>
                           <input list="customer-list-loan" required className="w-full px-4 py-2.5 rounded-xl border-2 border-indigo-100 font-bold uppercase text-[10px] outline-none focus:border-indigo-500 text-indigo-900" placeholder="SEARCH CUSTOMER..." value={expCustomerId} onChange={e => {
                              const val = e.target.value;
                              const match = customers.find(c => c.name === val);
                              if (match) setExpCustomerId(match.id);
                              else setExpCustomerId(val);
                           }} />
                           <datalist id="customer-list-loan">
                              {customers.map(c => <option key={c.id} value={c.name} />)}
                           </datalist>
                           <select required value={customers.find(c => c.id === expCustomerId || c.name === expCustomerId)?.id || ''} onChange={e => setExpCustomerId(e.target.value)} className="w-full px-4 py-2.5 rounded-xl border-2 border-indigo-100 font-bold uppercase text-[10px] outline-none focus:border-indigo-500 text-indigo-900 mt-1">
                              <option value="">-- CONFIRM CUSTOMER --</option>
                              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                           </select>
                        </div>
                     ) : (
                        <>
                           <div className="space-y-0.5">
                              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Description / Purpose</label>
                              <input required className="w-full px-4 py-2.5 rounded-xl border border-slate-200 font-bold uppercase text-[10px] outline-none focus:border-indigo-500" placeholder="E.G. OFFICE RENT JUNE" value={expDesc} onChange={e => setExpDesc(e.target.value)} />
                           </div>
                           <div className="space-y-0.5">
                              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Main Category (Optional)</label>
                              <input list="expense-main-categories" className="w-full px-4 py-2.5 rounded-xl border border-slate-200 font-bold uppercase text-[10px] outline-none focus:border-indigo-500" placeholder="E.G. OPS, MARKETING" value={expMainCategory} onChange={e => setExpMainCategory(e.target.value)} />
                              <datalist id="expense-main-categories">
                                 {uniqueMainCategories.map(c => <option key={c} value={c} />)}
                              </datalist>
                           </div>
                           <div className="space-y-0.5">
                              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Sub Expense / Category (Optional)</label>
                              <input list="expense-categories" className="w-full px-4 py-2.5 rounded-xl border border-slate-200 font-bold uppercase text-[10px] outline-none focus:border-indigo-500" placeholder="SELECT OR TYPE NEW..." value={expCategory} onChange={e => setExpCategory(e.target.value)} />
                              <datalist id="expense-categories">
                                 {uniqueCategories.map(c => <option key={c} value={c} />)}
                              </datalist>
                           </div>
                        </>
                     )}

                     <button type="submit" className="w-full bg-rose-600 text-white font-black py-3.5 rounded-xl uppercase tracking-widest text-[10px] shadow-xl shadow-rose-200 hover:bg-rose-700 transition-all">
                        {expIsLoan ? 'Authorize Loan Disbursal' : 'Authorize Expenditure'}
                     </button>
                  </form>
               </div>
            </div>
         )}

         {/* Transfer Modal */}
         {showTransferModal && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-xl">
               <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in duration-300">
                  <div className="p-10 border-b border-slate-50 bg-slate-50 flex justify-between items-center">
                     <div>
                        <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">Internal Transfer</h3>
                        <p className="text-[9px] font-black text-indigo-500 uppercase tracking-widest mt-1">Cross-Node Asset Movement</p>
                     </div>
                     <button onClick={() => setShowTransferModal(false)} className="text-slate-300 hover:text-slate-900 text-4xl leading-none">&times;</button>
                  </div>
                  <form onSubmit={handleTransferSubmit} className="p-10 space-y-6">
                     <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                           <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">From</label>
                           <select value={transSource} onChange={e => setTransSource(e.target.value)} className="w-full px-4 py-3 rounded-xl border border-slate-200 font-black uppercase text-[10px] bg-white">
                              {accounts.map(acc => <option key={acc.id} value={acc.id}>{acc.name}</option>)}
                           </select>
                        </div>
                        <div className="space-y-2">
                           <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">To</label>
                           <select value={transTarget} onChange={e => setTransTarget(e.target.value)} className="w-full px-4 py-3 rounded-xl border border-slate-200 font-black uppercase text-[10px] bg-white">
                              <option value="" disabled>Target Node</option>
                              {accounts.map(acc => <option key={acc.id} value={acc.id}>{acc.name}</option>)}
                           </select>
                        </div>
                     </div>
                     <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Transfer Amount (Rs.)</label>
                        <input required type="number" step="0.01" className="w-full px-6 py-4 rounded-2xl border border-slate-200 font-black font-mono text-xl text-center text-indigo-600 outline-none" placeholder="0.00" value={transAmount} onChange={e => setTransAmount(e.target.value)} />
                     </div>
                     <button type="submit" className="w-full bg-slate-900 text-white font-black py-5 rounded-3xl uppercase tracking-widest text-[10px] shadow-2xl hover:bg-black transition-all">Confirm Transfer</button>
                  </form>
               </div>
            </div>
         )}

         {/* Accounts Management Modal */}
         {showAccountsModal && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-xl">
               <div className="bg-white rounded-[4rem] shadow-2xl w-full max-w-4xl overflow-hidden animate-in zoom-in duration-300 max-h-[90vh] flex flex-col">
                  <div className="p-10 border-b border-slate-100 bg-slate-50 flex justify-between items-center shrink-0">
                     <div>
                        <h3 className="text-3xl font-black text-slate-900 uppercase tracking-tighter">Bank Repository</h3>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Manage External Liquidity Nodes</p>
                     </div>
                     <button onClick={() => setShowAccountsModal(false)} className="text-slate-300 hover:text-slate-900 text-5xl leading-none">&times;</button>
                  </div>

                  <div className="flex-1 overflow-y-auto p-12 custom-scrollbar flex flex-col lg:flex-row gap-12">
                     {/* Current Accounts List */}
                     <div className="flex-1 space-y-4">
                        <h4 className="text-[10px] font-black text-slate-900 uppercase tracking-widest border-b border-slate-100 pb-2">Active Linked Accounts</h4>
                        <div className="space-y-3">
                           {accounts.map(acc => (
                              <div key={acc.id} className="p-6 bg-slate-50 rounded-3xl border border-slate-100 flex justify-between items-center group hover:border-indigo-200 transition-all">
                                 <div>
                                    <p className="text-sm font-black text-slate-900 uppercase tracking-tight">{acc.name}</p>
                                    <p className="text-[9px] font-bold text-slate-400 font-mono tracking-widest">{acc.accountNumber || 'INTERNAL DRAWER'}</p>
                                 </div>
                                 <div className="flex items-center gap-6">
                                    <div className="text-right">
                                       <p className="text-xl font-black font-mono text-slate-900 tracking-tighter">Rs. {acc.balance.toLocaleString()}</p>
                                       <p className="text-[8px] font-black text-emerald-500 uppercase tracking-widest">Liquid Reserve</p>
                                    </div>
                                    {acc.id !== 'cash' && (
                                       <button
                                          onClick={() => {
                                             if (window.confirm("Are you sure you want to delete this account? Any remaining balance will be transferred to the Main Cash Drawer.")) {
                                                onDeleteAccount(acc.id);
                                             }
                                          }}
                                          className="w-8 h-8 flex items-center justify-center rounded-full bg-rose-100 text-rose-600 hover:bg-rose-600 hover:text-white transition-all opacity-0 group-hover:opacity-100"
                                          title="Delete Account & Merge Balance"
                                       >
                                          &times;
                                       </button>
                                    )}
                                 </div>
                              </div>
                           ))}
                        </div>
                     </div>

                     {/* Add New Account Form */}
                     <div className="w-full lg:w-80 space-y-6">
                        <h4 className="text-[10px] font-black text-slate-900 uppercase tracking-widest border-b border-slate-100 pb-2">Link New Account</h4>
                        <form onSubmit={handleAccountSubmit} className="space-y-4">
                           <input required className="w-full px-5 py-3 rounded-xl border border-slate-200 font-bold uppercase text-xs" placeholder="BANK NAME" value={accName} onChange={e => setAccName(e.target.value)} />
                           <input className="w-full px-5 py-3 rounded-xl border border-slate-200 font-mono text-xs" placeholder="ACCOUNT NUMBER" value={accNum} onChange={e => setAccNum(e.target.value)} />
                           <input required type="number" className="w-full px-5 py-3 rounded-xl border border-slate-200 font-black font-mono text-xs text-indigo-600" placeholder="INITIAL BALANCE" value={accBal} onChange={e => setAccBal(e.target.value)} />
                           <button type="submit" className="w-full bg-indigo-600 text-white font-black py-4 rounded-xl uppercase tracking-widest text-[9px] shadow-lg hover:bg-indigo-700 transition-all">Add To Ledger</button>
                        </form>
                        <div className="p-4 bg-indigo-50 rounded-2xl border border-indigo-100">
                           <p className="text-[9px] font-black text-indigo-600 uppercase leading-relaxed text-center">Linked accounts will appear in all payment source menus across the terminal.</p>
                        </div>
                     </div>
                  </div>
               </div>
            </div>
         )}
      </div>
   );
};

export default Finance;
