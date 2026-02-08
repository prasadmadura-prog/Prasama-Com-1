import React, { useState, useMemo, useEffect } from 'react';
import { Customer, Transaction, BankAccount, Product } from '../types';

interface CustomersProps {
  customers: Customer[];
  transactions: Transaction[];
  accounts: BankAccount[];
  products: Product[];
  onUpsertCustomer: (customer: Customer) => void;
  onReceivePayment: (tx: Omit<Transaction, 'id' | 'date'>) => void;
  onUpdateTransaction: (tx: Transaction) => void;
  onDeleteTransaction: (id: string) => void;
  jumpTarget?: { type: 'PO' | 'CUSTOMER' | 'VENDOR' | 'SALE'; id: string } | null;
  clearJump?: () => void;
}

const Customers: React.FC<CustomersProps> = ({ customers, transactions, accounts, products, onUpsertCustomer, onReceivePayment, onUpdateTransaction, onDeleteTransaction, jumpTarget, clearJump }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [selectedForPayment, setSelectedForPayment] = useState<Customer | null>(null);
  const [selectedForHistory, setSelectedForHistory] = useState<Customer | null>(null);
  const [targetInvoiceId, setTargetInvoiceId] = useState<string>('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'BANK' | 'CHEQUE'>('CASH');
  const [paymentAccountId, setPaymentAccountId] = useState('cash');
  const [chequeNumber, setChequeNumber] = useState('');
  const [chequeDate, setChequeDate] = useState(new Date().toISOString().split('T')[0]);

  const [searchTerm, setSearchTerm] = useState('');

  // Transaction Editing State
  const [isEditTxModalOpen, setIsEditTxModalOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [tempItems, setTempItems] = useState<{ productId: string; quantity: number; price: number; discount?: number }[]>([]);
  const [tempTotal, setTempTotal] = useState(0);
  const [showItemPicker, setShowItemPicker] = useState(false);
  const [itemSearch, setItemSearch] = useState('');

  // Jump Target Effect
  useEffect(() => {
    if (jumpTarget && jumpTarget.type === 'CUSTOMER') {
      const customer = customers.find(c => c.id === jumpTarget.id);
      if (customer) {
        setSelectedForPayment(customer);
        setIsPaymentModalOpen(true);
      }
      clearJump?.();
    }
  }, [jumpTarget, customers, clearJump]);

  const handleSaveCustomer = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const customerData: Customer = {
      id: editingCustomer?.id || `CUS-${Date.now()}`,
      name: (formData.get('name') as string).toUpperCase(),
      phone: formData.get('phone') as string,
      email: formData.get('email') as string,
      address: formData.get('address') as string,
      creditLimit: parseFloat(formData.get('creditLimit') as string) || 0,
      totalCredit: editingCustomer?.totalCredit || 0,
    };

    onUpsertCustomer(customerData);
    setIsModalOpen(false);
    setEditingCustomer(null);
  };

  const handleReceivePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedForPayment || !paymentAmount) return;

    try {
      const amount = parseFloat(paymentAmount);
      if (isNaN(amount) || amount <= 0) {
        alert("Please enter a valid amount.");
        return;
      }

      await onReceivePayment({
        type: 'CREDIT_PAYMENT',
        amount: amount,
        paymentMethod,
        accountId: paymentAccountId,
        customerId: selectedForPayment.id,
        parentTxId: targetInvoiceId || undefined,
        description: `CREDIT SETTLEMENT: Rs. ${amount.toLocaleString()} RECEIVED VIA ${paymentMethod} ${targetInvoiceId ? `(INV: ${targetInvoiceId.substring(0, 8)})` : ''} ${paymentMethod === 'CHEQUE' ? `(CHQ: ${chequeNumber})` : ''}`,
        ...(paymentMethod === 'CHEQUE' && { chequeNumber, chequeDate }),
      });

      alert("REPAYMENT RECORDED SUCCESSFULLY");
      setIsPaymentModalOpen(false);
      setSelectedForPayment(null);
      setTargetInvoiceId('');
      setPaymentAmount('');
      setChequeNumber('');
      setPaymentMethod('CASH');
      setPaymentAccountId('cash');
    } catch (err: any) {
      alert("FAILED TO RECORD REPAYMENT: " + err.message);
    }
  };

  const filteredCustomers = useMemo(() => {
    if (!searchTerm.trim()) return customers;
    const lowerSearch = searchTerm.toLowerCase();
    return customers.filter(c =>
      c.name.toLowerCase().includes(lowerSearch) ||
      c.phone.includes(searchTerm) ||
      c.email.toLowerCase().includes(lowerSearch)
    );
  }, [customers, searchTerm]);

  const customerHistory = useMemo(() => {
    if (!selectedForHistory && !selectedForPayment) return [];
    const targetId = selectedForHistory?.id || selectedForPayment?.id;
    return transactions
      .filter(t => t.customerId === targetId)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [transactions, selectedForHistory, selectedForPayment]);

  const unpaidInvoices = useMemo(() => {
    return customerHistory.filter(t => t.type === 'SALE' && (t.balanceDue || 0) > 0);
  }, [customerHistory]);

  const exposureAggregate = useMemo(() => {
    return customerHistory.reduce((sum, tx) => {
      if (tx.type === 'SALE') {
        const creditImpact = tx.paymentMethod === 'CREDIT' ? Number(tx.amount) : (Number(tx.balanceDue) || 0);
        return sum - creditImpact;
      }
      if (tx.type === 'CREDIT_PAYMENT') return sum + (Number(tx.amount) || 0);
      return sum;
    }, 0);
  }, [customerHistory]);

  const calculateTempTotal = (items: { productId: string; quantity: number; price: number; discount?: number }[]) => {
    return items.reduce((acc, item) => acc + (Number(item.quantity) * Number(item.price)) - (Number(item.discount) || 0), 0);
  };

  const handleUpdateTx = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingTx) return;
    const fd = new FormData(e.currentTarget);

    const newAmount = editingTx.type === 'SALE' ? tempTotal : Number(fd.get('amount'));
    const newMethod = fd.get('paymentMethod') as any;

    // Maintain internal balance logic during edit
    let newPaidAmount = editingTx.paidAmount;
    let newBalanceDue = editingTx.balanceDue;

    if (editingTx.type === 'SALE') {
      if (newMethod === 'CREDIT') {
        newPaidAmount = 0;
        newBalanceDue = newAmount;
      } else {
        // For CASH/BANK/etc, we assume the payment matches the new total unless it was already a partial payment
        const wasPartial = (editingTx.balanceDue || 0) > 0 && (editingTx.paidAmount || 0) > 0;
        if (wasPartial) {
          newBalanceDue = Math.max(0, newAmount - (editingTx.paidAmount || 0));
        } else {
          newPaidAmount = newAmount;
          newBalanceDue = 0;
        }
      }
    }

    const updated: Transaction = {
      ...editingTx,
      date: new Date(fd.get('date') as string).toISOString(),
      amount: newAmount,
      paidAmount: newPaidAmount,
      balanceDue: newBalanceDue,
      description: (fd.get('description') as string).toUpperCase(),
      paymentMethod: newMethod,
      accountId: fd.get('accountId') as string,
      items: editingTx.type === 'SALE' ? tempItems : undefined
    };

    onUpdateTransaction(updated);
    setIsEditTxModalOpen(false);
    setEditingTx(null);
  };

  const handleUpdateItemField = (index: number, field: string, value: string) => {
    const newItems = [...tempItems];
    const numVal = parseFloat(value) || 0;
    newItems[index] = { ...newItems[index], [field]: numVal };
    setTempItems(newItems);
    setTempTotal(calculateTempTotal(newItems));
  };

  const handleAddItemToManifest = (p: Product) => {
    const newItems = [...tempItems, { productId: p.id, quantity: 1, price: p.price, discount: 0 }];
    setTempItems(newItems);
    setTempTotal(calculateTempTotal(newItems));
    setShowItemPicker(false);
    setItemSearch('');
  };

  const handleRemoveItemFromManifest = (index: number) => {
    const newItems = tempItems.filter((_, i) => i !== index);
    setTempItems(newItems);
    setTempTotal(calculateTempTotal(newItems));
  };

  const filteredPickerProducts = useMemo(() => {
    if (!itemSearch.trim()) return [];
    return products.filter(p =>
      p.name.toLowerCase().includes(itemSearch.toLowerCase()) ||
      p.sku.toLowerCase().includes(itemSearch.toLowerCase())
    ).slice(0, 5);
  }, [products, itemSearch]);

  const handlePrintLedger = () => {
    if (!selectedForHistory) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const rowsHtml = customerHistory.map(tx => {
      const dateStr = new Date(tx.date).toLocaleDateString();
      const debit = tx.type === 'SALE' && ((tx.paymentMethod === 'CREDIT' ? Number(tx.amount) : (Number(tx.balanceDue) || 0)) > 0)
        ? (tx.paymentMethod === 'CREDIT' ? Number(tx.amount) : (Number(tx.balanceDue) || 0))
        : 0;

      const credit = tx.type === 'CREDIT_PAYMENT' ? Number(tx.amount) : 0;

      return `
        <tr>
            <td style="padding: 8px 4px; border-bottom: 1px solid #eee;">${dateStr}</td>
            <td style="padding: 8px 4px; border-bottom: 1px solid #eee;">${tx.id}</td>
            <td style="padding: 8px 4px; border-bottom: 1px solid #eee;">${tx.description}</td>
            <td style="padding: 8px 4px; border-bottom: 1px solid #eee; text-align: right;">${debit > 0 ? Number(debit).toLocaleString(undefined, { minimumFractionDigits: 2 }) : '-'}</td>
             <td style="padding: 8px 4px; border-bottom: 1px solid #eee; text-align: right;">${credit > 0 ? Number(credit).toLocaleString(undefined, { minimumFractionDigits: 2 }) : '-'}</td>
        </tr>
       `;
    }).join('');

    const totalDebit = customerHistory.reduce((sum, tx) => {
      if (tx.type === 'SALE') {
        const amt = tx.paymentMethod === 'CREDIT' ? Number(tx.amount) : (Number(tx.balanceDue) || 0);
        return sum + amt;
      }
      return sum;
    }, 0);

    const totalCredit = customerHistory.reduce((sum, tx) => {
      if (tx.type === 'CREDIT_PAYMENT') return sum + Number(tx.amount);
      return sum;
    }, 0);

    const balanceDue = Math.abs(exposureAggregate);
    // exposureAggregate is (Paid - Taken). So negative means they owe us (Debit Balance).
    const isDebitBalance = exposureAggregate < 0;
    const balanceLabel = isDebitBalance ? 'TOTAL DUE (PLEASE PAY)' : 'CREDIT BALANCE (EXCESS)';

    printWindow.document.write(`
      <html>
        <head>
          <title>STATEMENT - ${selectedForHistory.name}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap');
            body { font-family: 'Inter', sans-serif; padding: 40px; color: #1e293b; max-width: 210mm; margin: 0 auto; }
            h1 { margin: 0 0 5px 0; text-transform: uppercase; letter-spacing: -1px; font-weight: 900; }
            .header { display: flex; justify-content: space-between; margin-bottom: 30px; border-bottom: 2px solid #000; padding-bottom: 20px; }
            .meta { font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; line-height: 1.5; }
            table { width: 100%; border-collapse: collapse; font-size: 10px; font-weight: 500; }
            th { text-align: left; border-bottom: 2px solid #000; padding: 8px 4px; text-transform: uppercase; font-weight: 900; font-size: 9px; letter-spacing: 0.1em; }
            td { font-family: monospace; font-size: 11px; }
            .total-box { margin-top: 30px; margin-left: auto; width: 300px; text-align: right; font-weight: bold; font-size: 12px; font-family: monospace; }
            .grand-total { border-top: 2px solid #000; border-bottom: 2px solid #000; margin-top: 10px; padding: 10px 0; font-size: 14px; font-weight: 900; }
            @media print {
                body { padding: 0; }
                .no-print { display: none; }
            }
          </style>
        </head>
        <body onload="window.print()">
          <div class="header">
            <div>
                <h1>Customer Statement</h1>
                <div class="meta" style="color: #64748b;">STATEMENT OF ACCOUNTS</div>
            </div>
            <div class="meta" style="text-align: right;">
                <b>${selectedForHistory.name}</b><br/>
                ${selectedForHistory.phone}<br/>
                ${selectedForHistory.address || ''}
            </div>
          </div>

          <div class="meta" style="margin-bottom: 20px;">
            GENERATED: ${new Date().toLocaleString()}<br/>
            PERIOD: ALL HISTORY
          </div>
          
          <table>
            <thead>
                <tr>
                    <th style="width: 15%">DATE</th>
                    <th style="width: 20%">REF ID</th>
                    <th style="width: 35%">DESCRIPTION</th>
                    <th style="text-align: right; width: 15%">DEBIT</th>
                    <th style="text-align: right; width: 15%">CREDIT</th>
                </tr>
            </thead>
            <tbody>
                ${rowsHtml}
            </tbody>
          </table>
          <div class="total-box">
             <div style="margin-bottom: 4px;">TOTAL BILLED: Rs. ${totalDebit.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
             <div style="margin-bottom: 4px;">TOTAL PAID: Rs. ${totalCredit.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
             <div class="grand-total">
                ${balanceLabel}: Rs. ${balanceDue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
             </div>
          </div>
          
          <div style="margin-top: 50px; text-align: center; font-size: 9px; text-transform: uppercase; color: #94a3b8; font-weight: bold;">
            Thank you for your business
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-2 duration-500 pb-20">
      {/* Executive Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tighter">Credit Portfolio</h2>
          <p className="text-slate-500 font-bold uppercase tracking-widest text-[10px] mt-1">Strategic debt management and receivable tracking</p>
        </div>
        <button
          onClick={() => { setEditingCustomer(null); setIsModalOpen(true); }}
          className="bg-slate-950 text-white px-8 py-3.5 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-slate-200 hover:bg-black transition-all active:scale-95 flex items-center gap-3"
        >
          <span>👤</span> Add Client Account
        </button>
      </div>

      {/* Filter Terminal */}
      <div className="relative group max-w-2xl">
        <span className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 text-xl transition-colors group-focus-within:text-indigo-500">🔍</span>
        <input
          type="text"
          placeholder="Filter clients by name, phone or email..."
          className="w-full pl-16 pr-8 py-5 rounded-[2rem] border border-slate-200 focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all font-black text-slate-800 bg-white shadow-sm placeholder:text-slate-300 placeholder:uppercase placeholder:tracking-widest placeholder:text-[10px]"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {/* Detailed List View */}
      <div className="space-y-4">
        {filteredCustomers.map(c => {
          const usagePercent = Math.max(0, Math.min((c.totalCredit / c.creditLimit) * 100, 100));
          const hasDebt = c.totalCredit > 0;
          const hasCredit = c.totalCredit < 0;
          const isOverLimit = c.totalCredit > c.creditLimit;

          return (
            <div key={c.id} className={`bg-white p-4 rounded-[1.5rem] border transition-all group hover:shadow-lg ${isOverLimit
              ? 'border-rose-300 bg-rose-50/30'
              : 'border-slate-200 hover:border-indigo-200'
              }`}>
              <div className="flex flex-col md:flex-row items-center gap-4">
                {/* Left: Customer Info */}
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0 ${isOverLimit ? 'bg-rose-100 text-rose-600' : 'bg-slate-100 text-slate-400'}`}>
                    👤
                  </div>
                  <div className="min-w-0 flex-1 cursor-pointer" onClick={() => { setSelectedForHistory(c); setIsHistoryModalOpen(true); }}>
                    <div className="flex items-center gap-2">
                      <h3 className={`font-black text-sm uppercase tracking-tight truncate ${isOverLimit ? 'text-rose-600' : 'text-slate-900'}`}>
                        {c.name}
                      </h3>
                      {isOverLimit && (
                        <span className="bg-rose-600 text-white text-[7px] font-black px-1.5 py-0.5 rounded-full animate-pulse tracking-widest uppercase shrink-0">Over Limit</span>
                      )}
                    </div>
                    <p className="text-[9px] font-bold text-slate-400 font-mono tracking-wide leading-none">{c.phone}</p>
                  </div>
                </div>

                {/* Middle: Credit Utilization */}
                <div className="flex-1 min-w-[200px]">
                  <div className="flex justify-between text-[8px] font-black uppercase tracking-wider mb-1">
                    <span className="text-slate-400">Credit Utilization</span>
                    <span className={isOverLimit ? 'text-rose-600' : 'text-slate-600'}>
                      {usagePercent.toFixed(0)}%
                    </span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${isOverLimit ? 'bg-rose-600' : (usagePercent > 90 ? 'bg-rose-500' : 'bg-emerald-500')}`}
                      style={{ width: `${usagePercent}%` }} />
                  </div>
                </div>

                {/* Right: Outstanding & Limit */}
                <div className="flex items-center gap-6">
                  <div className="text-left">
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-0.5">
                      {hasCredit ? 'Credit Balance' : 'Outstanding'}
                    </p>
                    {hasDebt ? (
                      <p className={`text-sm font-black font-mono tracking-tight ${isOverLimit ? 'text-rose-600' : 'text-slate-900'}`}>
                        Rs. {Number(c.totalCredit).toLocaleString()}
                      </p>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full ${hasCredit ? 'bg-indigo-500 animate-pulse' : 'bg-emerald-500'}`}></span>
                        <span className={`text-[9px] font-black uppercase tracking-wide ${hasCredit ? 'text-indigo-600' : 'text-emerald-600'}`}>
                          {hasCredit ? `Rs. ${Math.abs(c.totalCredit).toLocaleString()} ADVANCE` : 'Settled'}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="text-right border-l border-slate-200 pl-6">
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Limit</p>
                    <p className="text-xs font-black text-slate-500 font-mono">Rs. {Number(c.creditLimit).toLocaleString()}</p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => {
                      setSelectedForPayment(c);
                      setPaymentAccountId('cash');
                      setIsPaymentModalOpen(true);
                    }}
                    className={`text-[9px] font-black px-4 py-2.5 rounded-lg transition-all active:scale-95 uppercase tracking-wider ${isOverLimit ? 'bg-rose-600 text-white hover:bg-rose-700' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}
                  >
                    Receive Pay
                  </button>

                  <button
                    onClick={() => { setSelectedForHistory(c); setIsHistoryModalOpen(true); }}
                    className="text-indigo-600 text-[9px] font-black uppercase tracking-wide hover:text-indigo-800 transition-colors px-3 whitespace-nowrap"
                  >
                    View Ledger
                  </button>

                  <button
                    onClick={() => { setEditingCustomer(c); setIsModalOpen(true); }}
                    className="text-slate-400 text-[9px] font-black uppercase tracking-wide hover:text-slate-900 transition-colors whitespace-nowrap"
                  >
                    Edit Profile
                  </button>
                </div>
              </div>
            </div>
          )
        })}

        {filteredCustomers.length === 0 && (
          <div className="col-span-full py-40 text-center text-slate-300">
            <div className="flex flex-col items-center gap-6">
              <div className="text-8xl grayscale opacity-10">👥</div>
              <p className="text-sm font-black text-slate-400 uppercase tracking-[0.3em]">No match found for "{searchTerm}"</p>
            </div>
          </div>
        )}
      </div>

      {/* Profile Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in duration-300">
            <div className="p-10 border-b border-slate-50 bg-slate-50 flex justify-between items-center">
              <h3 className="font-black text-2xl text-slate-900 uppercase tracking-tighter">Client Infrastructure</h3>
              <button onClick={() => { setIsModalOpen(false); setEditingCustomer(null); }} className="text-slate-300 hover:text-slate-900 text-4xl leading-none">&times;</button>
            </div>
            <form onSubmit={handleSaveCustomer} className="p-10 space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="md:col-span-2 space-y-2">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Legal Entity Name</label>
                  <input name="name" defaultValue={editingCustomer?.name} required className="w-full px-6 py-4 rounded-2xl border border-slate-200 outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 font-black uppercase text-sm bg-slate-50/50" placeholder="STARBUCKS NY" />
                </div>
                <div className="space-y-2">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Contact Node (Phone)</label>
                  <input name="phone" defaultValue={editingCustomer?.phone} required className="w-full px-6 py-4 rounded-2xl border border-slate-200 outline-none font-mono font-black text-indigo-600 bg-slate-50/50" placeholder="+94 ..." />
                </div>
                <div className="space-y-2">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Credit Cap (Rs.)</label>
                  <input name="creditLimit" type="number" defaultValue={editingCustomer?.creditLimit} required className="w-full px-6 py-4 rounded-2xl border border-slate-200 outline-none font-black font-mono text-indigo-600 bg-slate-50/50" placeholder="50000" />
                </div>
                <div className="md:col-span-2 space-y-2">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Email Address</label>
                  <input name="email" type="email" defaultValue={editingCustomer?.email} className="w-full px-6 py-4 rounded-2xl border border-slate-200 outline-none font-bold bg-slate-50/50" placeholder="accounting@entity.com" />
                </div>
                <div className="md:col-span-2 space-y-2">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Billing Headquarters</label>
                  <textarea name="address" defaultValue={editingCustomer?.address} rows={2} className="w-full px-6 py-4 rounded-2xl border border-slate-200 outline-none font-bold bg-slate-50/50" placeholder="OFFICE NO 12, BLD 4..." />
                </div>
              </div>
              <div className="flex gap-4 pt-6 border-t border-slate-50">
                <button type="button" onClick={() => { setIsModalOpen(false); setEditingCustomer(null); }} className="flex-1 py-4 font-black text-slate-400 uppercase tracking-widest text-[10px]">Cancel Operation</button>
                <button type="submit" className="flex-[2] bg-slate-950 text-white font-black py-4 rounded-2xl shadow-xl hover:bg-black transition-all uppercase tracking-[0.2em] text-[10px]">Commit Profile</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Payment Settlement Modal */}
      {isPaymentModalOpen && selectedForPayment && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-xl">
          <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in duration-300">
            <div className="p-10 space-y-8 text-center">
              <div className="space-y-2">
                <h3 className="font-black text-2xl text-slate-900 uppercase tracking-tighter">Debt Settlement</h3>
                <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">Authorize incoming capital inflow</p>
              </div>

              <div className={`${selectedForPayment.totalCredit > selectedForPayment.creditLimit ? 'bg-rose-50 border-rose-100' : 'bg-emerald-50 border-emerald-100'} p-6 rounded-[2.5rem] border flex flex-col items-center`}>
                <p className={`text-[9px] font-black uppercase tracking-widest mb-1 ${selectedForPayment.totalCredit > selectedForPayment.creditLimit ? 'text-rose-500' : 'text-emerald-500'}`}>Portfolio Outstanding</p>
                <p className={`text-3xl font-black font-mono tracking-tighter ${selectedForPayment.totalCredit > selectedForPayment.creditLimit ? 'text-rose-700' : 'text-emerald-700'}`}>Rs. {Number(selectedForPayment.totalCredit).toLocaleString()}</p>
              </div>

              {unpaidInvoices.length > 0 && (
                <div className="space-y-3">
                  <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest text-center">Settlement Target (Select Invoice)</label>
                  <select
                    className="w-full px-4 py-4 rounded-2xl border-2 border-slate-100 outline-none font-bold text-[11px] uppercase bg-white focus:border-indigo-500 transition-all"
                    value={targetInvoiceId}
                    onChange={e => {
                      const invId = e.target.value;
                      setTargetInvoiceId(invId);
                      const inv = unpaidInvoices.find(i => i.id === invId);
                      if (inv) setPaymentAmount(String(inv.balanceDue));
                    }}
                  >
                    <option value="">GENERAL SETTLEMENT (UNLINKED)</option>
                    {unpaidInvoices.map(inv => (
                      <option key={inv.id} value={inv.id}>
                        INV: {inv.id.substring(0, 8)} | DUE: Rs. {Number(inv.balanceDue).toLocaleString()} ({new Date(inv.date).toLocaleDateString()})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <form onSubmit={handleReceivePayment} className="space-y-6 text-left">
                <div className="space-y-3">
                  <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest text-center">Settlement Amount (Rs.)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    className="w-full px-8 py-5 rounded-3xl border-2 border-slate-100 outline-none font-black font-mono text-3xl text-center text-emerald-600 focus:border-emerald-500 transition-all"
                    value={paymentAmount}
                    onChange={e => setPaymentAmount(e.target.value)}
                    autoFocus
                    placeholder="0.00"
                  />
                </div>

                <div className="space-y-3">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest text-center">Settlement Pipeline & Account</p>
                  <div className="flex gap-2 p-1.5 bg-slate-50 rounded-2xl border border-slate-100 mb-2">
                    <button type="button" onClick={() => { setPaymentMethod('CASH'); setPaymentAccountId('cash'); }} className={`flex-1 py-3 rounded-xl font-black text-[9px] uppercase transition-all ${paymentMethod === 'CASH' ? 'bg-white text-indigo-600 shadow-md' : 'text-slate-400'}`}>💵 Cash</button>
                    <button type="button" onClick={() => {
                      setPaymentMethod('BANK');
                      if (paymentAccountId === 'cash' && accounts.length > 0) {
                        setPaymentAccountId(accounts.find(a => a.id !== 'cash')?.id || accounts[0].id);
                      }
                    }} className={`flex-1 py-3 rounded-xl font-black text-[9px] uppercase transition-all ${paymentMethod === 'BANK' ? 'bg-white text-indigo-600 shadow-md' : 'text-slate-400'}`}>🏦 Bank</button>
                    <button type="button" onClick={() => {
                      setPaymentMethod('CHEQUE');
                      if (paymentAccountId === 'cash' && accounts.length > 0) {
                        setPaymentAccountId(accounts.find(a => a.id !== 'cash')?.id || accounts[0].id);
                      }
                    }} className={`flex-1 py-3 rounded-xl font-black text-[9px] uppercase transition-all ${paymentMethod === 'CHEQUE' ? 'bg-white text-indigo-600 shadow-md' : 'text-slate-400'}`}>📜 PDC</button>
                  </div>

                  {paymentMethod !== 'CASH' && (
                    <select
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 font-bold text-[10px] uppercase outline-none focus:border-indigo-500 bg-white"
                      value={paymentAccountId}
                      onChange={e => setPaymentAccountId(e.target.value)}
                    >
                      {accounts.map(acc => (
                        <option key={acc.id} value={acc.id}>{acc.name} (Rs. {acc.balance.toLocaleString()})</option>
                      ))}
                    </select>
                  )}
                </div>

                {paymentMethod === 'CHEQUE' && (
                  <div className="grid grid-cols-2 gap-4 animate-in slide-in-from-top-2">
                    <div className="space-y-1">
                      <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Cheque No</label>
                      <input
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 font-black font-mono text-[11px] outline-none focus:border-indigo-500"
                        value={chequeNumber}
                        onChange={(e) => setChequeNumber(e.target.value.toUpperCase())}
                        placeholder="CHQ-0000"
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Maturity Date</label>
                      <input
                        type="date"
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 font-bold text-[11px] outline-none focus:border-indigo-500"
                        value={chequeDate}
                        onChange={(e) => setChequeDate(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                )}

                <div className="flex gap-4 pt-4">
                  <button type="button" onClick={() => { setIsPaymentModalOpen(false); setSelectedForPayment(null); }} className="flex-1 py-4 font-black text-slate-400 uppercase tracking-widest text-[10px]">Cancel</button>
                  <button type="submit" className="flex-[2] bg-emerald-600 text-white font-black py-5 rounded-2xl shadow-2xl shadow-emerald-100 hover:bg-emerald-700 transition-all uppercase tracking-[0.2em] text-[11px]">Authorize Settlement</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Transaction History / Ledger Modal */}
      {isHistoryModalOpen && selectedForHistory && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md">
          <div className="bg-white rounded-[3.5rem] shadow-2xl w-full max-w-7xl overflow-hidden flex flex-col animate-in slide-in-from-bottom-8 duration-500 max-h-[95vh]">
            <div className="p-10 border-b border-slate-100 bg-white flex justify-between items-center">
              <div className="flex items-center gap-6">
                <div className="w-16 h-16 rounded-[1.2rem] bg-[#6366f1] text-white flex items-center justify-center text-3xl font-black shadow-lg">
                  <span role="img" aria-label="ledger">📜</span>
                </div>
                <div>
                  <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">Strategic Ledger Audit</h3>
                  <p className="text-[14px] font-black text-indigo-600 uppercase tracking-[0.1em] mt-1">{selectedForHistory.phone || '+94 XX XXX XXXX'}</p>
                </div>
              </div>
              <div className="flex items-center gap-12">
                <div className="text-right">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Exposure Aggregate</p>
                  <p className={`text-4xl font-black tracking-tighter leading-none ${exposureAggregate < 0 ? (Math.abs(exposureAggregate) > (selectedForHistory.creditLimit || 0) ? 'text-rose-600' : 'text-indigo-600') : exposureAggregate > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>Rs. {Number(exposureAggregate).toLocaleString()}</p>
                </div>
                {Math.abs(exposureAggregate + selectedForHistory.totalCredit) > 0.01 && (
                  <button onClick={() => {
                    const updated = { ...selectedForHistory, totalCredit: Math.abs(exposureAggregate) };
                    onUpsertCustomer(updated);
                    setSelectedForHistory(updated);
                  }} title="Re-sync profile balance with ledger history" className="px-5 py-3 bg-amber-50 text-amber-600 border border-amber-100 rounded-2xl font-black text-[9px] uppercase tracking-widest hover:bg-amber-100 transition-all flex items-center gap-2 animate-bounce"><span>🔄</span> SYNC BALANCE</button>
                )}
                <button onClick={() => { setIsHistoryModalOpen(false); setSelectedForHistory(null); }} className="text-slate-200 hover:text-slate-950 text-5xl leading-none transition-colors">&times;</button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-10 bg-slate-50/30 custom-scrollbar">
              <div className="bg-white rounded-[2rem] border border-slate-100 overflow-hidden shadow-sm">
                <table className="w-full text-left text-sm border-collapse">
                  <thead className="bg-[#0f172a] text-slate-400 font-black uppercase tracking-widest text-[10px]">
                    <tr>
                      <th className="px-10 py-6">Date & Chronology</th>
                      <th className="px-10 py-6">Transaction ID</th>
                      <th className="px-10 py-6">Operational Memo</th>
                      <th className="px-10 py-6 text-right font-black text-rose-400">Taken (-)</th>
                      <th className="px-10 py-6 text-right font-black text-emerald-400">Paid (+)</th>
                      <th className="px-10 py-6 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {customerHistory.length > 0 ? customerHistory.map(tx => (
                      <tr key={tx.id} className="hover:bg-slate-50/50 transition-colors group align-middle">
                        <td className="px-10 py-6">
                          <p className="text-slate-900 font-black text-sm uppercase">{new Date(tx.date).toLocaleDateString()}</p>
                          <p className="text-[9px] text-slate-400 font-mono font-bold mt-1 uppercase tracking-tighter">{new Date(tx.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</p>
                        </td>
                        <td className="px-10 py-6">
                          <span className="font-mono text-[11px] font-black bg-[#1e293b] text-white px-4 py-2 rounded-xl tracking-tight uppercase shadow-sm">{tx.id}</span>
                        </td>
                        <td className="px-10 py-6 text-slate-500 text-[12px] font-bold uppercase leading-tight">
                          <span className="block mb-2 text-slate-700">{tx.description}</span>
                          <div className="flex gap-2">
                            <span className={`text-[9px] font-black uppercase tracking-widest px-3 py-1 border rounded-lg ${tx.type === 'SALE' ? 'bg-indigo-50 border-indigo-100 text-[#6366f1]' : 'bg-emerald-50 border-emerald-100 text-emerald-600'}`}>
                              {tx.type === 'SALE' ? 'CREDIT TAKEN' : 'CREDIT PAID'}
                            </span>
                            <span className="text-[9px] font-black uppercase tracking-widest px-3 py-1 bg-slate-50 border border-slate-100 rounded-lg text-slate-400">
                              {tx.paymentMethod}
                            </span>
                          </div>
                        </td>
                        <td className={`px-10 py-6 text-right font-black font-mono text-[15px] ${tx.type === 'SALE' ? 'text-rose-600' : 'text-slate-300'}`}>
                          {tx.type === 'SALE' ? (
                            (tx.paymentMethod === 'CREDIT' ? Number(tx.amount) : (Number(tx.balanceDue) || 0)) > 0
                              ? `- ${(tx.paymentMethod === 'CREDIT' ? Number(tx.amount) : (Number(tx.balanceDue) || 0)).toLocaleString()}`
                              : '0'
                          ) : '—'}
                        </td>
                        <td className={`px-10 py-6 text-right font-black font-mono text-[15px] ${tx.type === 'CREDIT_PAYMENT' ? 'text-emerald-600' : 'text-slate-300'}`}>
                          {tx.type === 'CREDIT_PAYMENT' ? `+ ${Number(tx.amount).toLocaleString()}` : '—'}
                        </td>
                        <td className="px-10 py-6 text-center">
                          <div className="flex justify-center gap-2">
                            <button onClick={() => { setEditingTx(tx); setTempItems(tx.items || []); setTempTotal(tx.amount); setIsEditTxModalOpen(true); }} className="p-2.5 rounded-xl border border-slate-200 hover:bg-white hover:text-indigo-600 transition-all shadow-sm" title="Edit">✏️</button>
                            <button onClick={() => { if (confirm("Permanently delete this entry?")) onDeleteTransaction(tx.id); }} className="p-2.5 rounded-xl border border-slate-200 hover:bg-rose-50 text-rose-600 transition-all shadow-sm" title="Delete">🗑️</button>
                          </div>
                        </td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={5} className="px-8 py-32 text-center text-slate-300 italic">
                          <div className="flex flex-col items-center gap-6 grayscale opacity-20">
                            <div className="text-8xl">📜</div>
                            <p className="text-[11px] font-black uppercase tracking-[0.4em]">Zero Ledger Activity Recorded</p>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="p-10 bg-white border-t border-slate-100 flex justify-between items-center no-print">
              <div className="flex gap-4">
                <button onClick={handlePrintLedger} className="px-8 py-3.5 bg-white border border-slate-200 rounded-2xl font-black text-[11px] uppercase tracking-widest text-slate-700 hover:border-slate-400 hover:shadow-lg transition-all shadow-sm">Print Ledger</button>
                <button className="px-8 py-3.5 bg-white border border-slate-200 rounded-2xl font-black text-[11px] uppercase tracking-widest text-slate-700 hover:border-slate-400 hover:shadow-lg transition-all shadow-sm">Export XML</button>
              </div>
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.3em] italic">VERIFIED OPERATIONAL AUDIT - PRASAMA ERP INTELLIGENCE</p>
            </div>
          </div>
        </div>
      )}
      {isEditTxModalOpen && editingTx && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md overflow-y-auto">
          <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-4xl overflow-hidden animate-in zoom-in duration-300 my-10 flex flex-col border border-slate-100">
            <div className="p-10 flex justify-between items-start bg-[#f8fafc]/50">
              <div>
                <h3 className="text-3xl font-black text-slate-900 tracking-tighter mb-1 uppercase">Modify Transaction</h3>
                <p className="text-[11px] font-black text-indigo-500 uppercase tracking-widest">Reference Node: {editingTx.id}</p>
              </div>
              <button onClick={() => { setIsEditTxModalOpen(false); setEditingTx(null); setShowItemPicker(false); }} className="text-slate-300 hover:text-slate-900 text-5xl transition-colors leading-none">&times;</button>
            </div>

            <form onSubmit={handleUpdateTx} className="p-10 space-y-8 flex-1 overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Entry Date</label>
                  <input name="date" type="date" required className="w-full px-6 py-4 rounded-2xl border border-slate-200 font-bold text-sm bg-white outline-none focus:border-indigo-500" defaultValue={editingTx.date.split('T')[0]} />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Transaction Value (Rs.)</label>
                  <input name="amount" type="number" step="0.01" required={editingTx.type !== 'SALE'} readOnly={editingTx.type === 'SALE'} className={`w-full px-6 py-4 rounded-2xl border border-slate-200 font-black font-mono text-lg text-indigo-600 outline-none focus:border-indigo-500 ${editingTx.type === 'SALE' ? 'bg-slate-50' : 'bg-white'}`} value={editingTx.type === 'SALE' ? tempTotal : undefined} defaultValue={editingTx.type !== 'SALE' ? editingTx.amount : undefined} />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Audit Memo / Description</label>
                <input name="description" required className="w-full px-6 py-4 rounded-2xl border border-slate-200 font-bold uppercase text-sm bg-white outline-none focus:border-indigo-500" defaultValue={editingTx.description} />
              </div>

              {editingTx.type === 'SALE' && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center border-b border-slate-50 pb-2">
                    <h4 className="text-[11px] font-black text-slate-900 uppercase tracking-widest">Itemized Manifest</h4>
                    <button type="button" onClick={() => setShowItemPicker(!showItemPicker)} className="text-[9px] font-black text-indigo-600 uppercase hover:underline">+ Quick Add Asset</button>
                  </div>

                  {showItemPicker && (
                    <div className="p-6 bg-slate-900 rounded-[2rem] border border-slate-800 space-y-4 animate-in slide-in-from-top-2">
                      <input autoFocus className="w-full bg-slate-800 border border-slate-700 rounded-xl px-5 py-3 text-xs font-bold text-white outline-none focus:border-indigo-500" placeholder="SEARCH CATALOG..." value={itemSearch} onChange={e => setItemSearch(e.target.value)} />
                      <div className="grid grid-cols-1 gap-2 max-h-40 overflow-y-auto">
                        {filteredPickerProducts.map(p => (
                          <button key={p.id} type="button" onClick={() => handleAddItemToManifest(p)} className="flex justify-between items-center p-3 bg-slate-800 hover:bg-slate-700 rounded-xl border border-slate-700 transition-all text-left">
                            <span className="text-[10px] font-black text-white uppercase">{p.name}</span>
                            <span className="text-[9px] font-black text-indigo-400">Rs. {p.price.toLocaleString()}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    {tempItems.map((item, idx) => {
                      const product = products.find(p => p.id === item.productId);
                      return (
                        <div key={idx} className="flex gap-4 items-center p-4 bg-slate-50 rounded-2xl border border-slate-100 group transition-all hover:bg-white hover:border-indigo-100">
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-black text-slate-900 uppercase truncate leading-tight">{product?.name || 'Asset'}</p>
                            <p className="text-[9px] font-bold text-slate-400 font-mono font-bold mt-0.5 tracking-tight">{product?.sku || 'ID-GEN'}</p>
                          </div>

                          <div className="flex items-center gap-4">
                            <div className="w-16">
                              <input type="number" className="w-full px-2 py-1.5 rounded-lg border border-slate-200 font-black font-mono text-[10px] text-center bg-white" value={item.quantity} onChange={e => handleUpdateItemField(idx, 'quantity', e.target.value)} />
                            </div>
                            <div className="w-24">
                              <input type="number" className="w-full px-2 py-1.5 rounded-lg border border-slate-200 font-black font-mono text-[10px] text-indigo-600 text-right bg-white" value={item.price} onChange={e => handleUpdateItemField(idx, 'price', e.target.value)} />
                            </div>
                            <div className="text-right min-w-[80px]">
                              <p className="text-[11px] font-black font-mono text-slate-900">Rs. {((item.quantity * item.price) - (item.discount || 0)).toLocaleString()}</p>
                            </div>
                            <button type="button" onClick={() => handleRemoveItemFromManifest(idx)} className="p-2 text-rose-300 hover:text-rose-600 transition-colors">&times;</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Settlement Pipeline</label>
                  <select name="paymentMethod" className="w-full px-6 py-4 rounded-2xl border border-slate-200 font-black uppercase text-xs bg-white outline-none cursor-pointer focus:border-indigo-500" defaultValue={editingTx.paymentMethod}>
                    {['CASH', 'BANK', 'CARD', 'CREDIT', 'CHEQUE'].map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Asset Node (Account)</label>
                  <select name="accountId" className="w-full px-6 py-4 rounded-2xl border border-slate-200 font-black uppercase text-xs bg-white outline-none cursor-pointer focus:border-indigo-500" defaultValue={editingTx.accountId}>
                    {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
              </div>

              <div className="pt-6">
                <button type="submit" className="w-full bg-[#0f172a] text-white font-black py-5 rounded-2xl uppercase text-xs tracking-widest shadow-xl hover:bg-black transition-all active:scale-[0.98]">Update Commercial Ledger</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Customers;