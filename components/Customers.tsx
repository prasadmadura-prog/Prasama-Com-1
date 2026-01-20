
import React, { useState, useMemo } from 'react';
import { Customer, Transaction } from '../types';

interface CustomersProps {
  customers: Customer[];
  transactions: Transaction[];
  onUpsertCustomer: (customer: Customer) => void;
  onReceivePayment: (tx: Omit<Transaction, 'id' | 'date'>) => void;
}

const Customers: React.FC<CustomersProps> = ({ customers, transactions, onUpsertCustomer, onReceivePayment }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [selectedForPayment, setSelectedForPayment] = useState<Customer | null>(null);
  const [selectedForHistory, setSelectedForHistory] = useState<Customer | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'BANK'>('CASH');
  
  const [searchTerm, setSearchTerm] = useState('');

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

  const handleReceivePayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedForPayment || !paymentAmount) return;

    onReceivePayment({
      type: 'CREDIT_PAYMENT',
      amount: parseFloat(paymentAmount),
      paymentMethod,
      customerId: selectedForPayment.id,
      description: `Credit Payment from ${selectedForPayment.name}`
    });

    setIsPaymentModalOpen(false);
    setSelectedForPayment(null);
    setPaymentAmount('');
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
    if (!selectedForHistory) return [];
    return transactions
      .filter(t => t.customerId === selectedForHistory.id)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [transactions, selectedForHistory]);

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

      {/* Strategic Card Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
        {filteredCustomers.map(c => {
          const usagePercent = Math.min((c.totalCredit / c.creditLimit) * 100, 100);
          const hasDebt = c.totalCredit > 0;
          
          return (
            <div key={c.id} className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm hover:shadow-2xl hover:border-indigo-100 transition-all space-y-8 group relative overflow-hidden">
              <div className="flex justify-between items-start relative z-10">
                <div className="cursor-pointer" onClick={() => { setSelectedForHistory(c); setIsHistoryModalOpen(true); }}>
                  <h3 className="font-black text-xl text-slate-900 group-hover:text-indigo-600 transition-colors uppercase tracking-tighter leading-none mb-2">{c.name}</h3>
                  <p className="text-[10px] font-black text-slate-400 font-mono tracking-widest">{c.phone}</p>
                </div>
                <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center text-xl text-slate-300 group-hover:bg-indigo-50 group-hover:text-indigo-500 transition-all">👤</div>
              </div>

              <div className="space-y-4 relative z-10">
                <div className="flex justify-between text-[9px] font-black uppercase tracking-[0.2em]">
                  <span className="text-slate-400">Credit Utilization</span>
                  <span className={c.totalCredit >= c.creditLimit ? 'text-rose-500' : 'text-slate-600'}>
                    {usagePercent.toFixed(0)}%
                  </span>
                </div>
                <div className="h-3 bg-slate-100 rounded-full overflow-hidden shadow-inner border border-slate-50">
                  <div className={`h-full rounded-full transition-all duration-1000 ${usagePercent > 90 ? 'bg-rose-500' : 'bg-emerald-500'}`} style={{ width: `${usagePercent}%` }} />
                </div>
                <div className="flex justify-between items-end pt-2">
                  <div className="space-y-1">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">Outstanding</p>
                    <p className={`text-2xl font-black font-mono tracking-tighter leading-none ${hasDebt ? 'text-slate-900' : 'text-slate-300'}`}>Rs. {Number(c.totalCredit).toLocaleString()}</p>
                  </div>
                  <div className="text-right space-y-1">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">Limit</p>
                    <p className="text-[12px] font-black text-slate-400 font-mono tracking-tighter leading-none">Rs. {Number(c.creditLimit).toLocaleString()}</p>
                  </div>
                </div>
              </div>

              <div className="pt-6 flex flex-col gap-3 relative z-10">
                <div className="flex items-center gap-4">
                  {/* Logic: Hide 'Receive Pay' if balance is settled as requested */}
                  {hasDebt ? (
                    <button 
                      onClick={() => { setSelectedForPayment(c); setIsPaymentModalOpen(true); }} 
                      className="flex-[2] bg-emerald-600 text-white text-[10px] font-black py-4 rounded-2xl hover:bg-emerald-700 transition-all active:scale-95 uppercase tracking-[0.2em] shadow-lg shadow-emerald-100"
                    >
                      Receive Pay
                    </button>
                  ) : (
                    <div className="flex-[2] bg-slate-50 text-slate-300 text-[9px] font-black py-4 rounded-2xl text-center uppercase tracking-widest border border-slate-100 italic">
                      Zero Liability
                    </div>
                  )}
                  
                  <button 
                    onClick={() => { setSelectedForHistory(c); setIsHistoryModalOpen(true); }} 
                    className="flex-1 text-indigo-600 text-[9px] font-black uppercase tracking-widest hover:text-indigo-800 transition-colors text-center"
                  >
                    View Ledger
                  </button>
                </div>
                
                <div className="flex justify-center pt-2">
                  <button 
                    onClick={() => { setEditingCustomer(c); setIsModalOpen(true); }} 
                    className="text-slate-400 text-[8px] font-black uppercase tracking-[0.3em] hover:text-slate-900 transition-colors"
                  >
                    Edit Profile
                  </button>
                </div>
              </div>
            </div>
          )})}
        
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
            <div className="p-10 space-y-10 text-center">
              <div className="space-y-2">
                <h3 className="font-black text-2xl text-slate-900 uppercase tracking-tighter">Debt Settlement</h3>
                <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">Authorize incoming capital inflow</p>
              </div>
              
              <div className="bg-emerald-50 p-8 rounded-[2.5rem] border border-emerald-100 flex flex-col items-center">
                <p className="text-[9px] font-black text-emerald-500 uppercase tracking-widest mb-2">Portfolio Outstanding</p>
                <p className="text-4xl font-black text-emerald-700 font-mono tracking-tighter">Rs. {Number(selectedForPayment.totalCredit).toLocaleString()}</p>
              </div>

              <form onSubmit={handleReceivePayment} className="space-y-8 text-left">
                <div className="space-y-3">
                  <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest text-center">Settlement Amount (Rs.)</label>
                  <input 
                    type="number" 
                    step="0.01" 
                    max={selectedForPayment.totalCredit} 
                    required 
                    className="w-full px-8 py-6 rounded-3xl border-2 border-slate-100 outline-none font-black font-mono text-3xl text-center text-emerald-600 focus:border-emerald-500 transition-all" 
                    value={paymentAmount} 
                    onChange={e => setPaymentAmount(e.target.value)}
                    autoFocus
                    placeholder="0.00"
                  />
                </div>
                
                <div className="space-y-3">
                   <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest text-center">Settlement Pipeline</p>
                   <div className="flex gap-2 p-1.5 bg-slate-50 rounded-2xl border border-slate-100">
                     <button type="button" onClick={() => setPaymentMethod('CASH')} className={`flex-1 py-3 rounded-xl font-black text-[10px] uppercase transition-all ${paymentMethod === 'CASH' ? 'bg-white text-indigo-600 shadow-md' : 'text-slate-400'}`}>💵 Cash Inflow</button>
                     <button type="button" onClick={() => setPaymentMethod('BANK')} className={`flex-1 py-3 rounded-xl font-black text-[10px] uppercase transition-all ${paymentMethod === 'BANK' ? 'bg-white text-indigo-600 shadow-md' : 'text-slate-400'}`}>🏦 Bank Wire</button>
                   </div>
                </div>

                <div className="flex gap-4 pt-2">
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
          <div className="bg-white rounded-[3.5rem] shadow-2xl w-full max-w-6xl overflow-hidden flex flex-col animate-in slide-in-from-bottom-8 duration-500 max-h-[90vh]">
            <div className="p-10 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
              <div className="flex items-center gap-6">
                <div className="w-16 h-16 rounded-[1.5rem] bg-indigo-600 text-white flex items-center justify-center text-3xl font-black">📜</div>
                <div>
                  <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">Strategic Ledger Audit</h3>
                  <p className="text-[11px] font-black text-indigo-600 uppercase tracking-[0.3em] mt-1">{selectedForHistory.name}</p>
                </div>
              </div>
              <div className="flex items-center gap-10">
                 <div className="text-right">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Exposure Aggregate</p>
                    <p className="text-3xl font-black text-rose-600 font-mono tracking-tighter leading-none">Rs. {Number(selectedForHistory.totalCredit).toLocaleString()}</p>
                 </div>
                 <button onClick={() => { setIsHistoryModalOpen(false); setSelectedForHistory(null); }} className="text-slate-300 hover:text-slate-950 text-5xl leading-none transition-colors">&times;</button>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-12 custom-scrollbar">
              <div className="bg-white rounded-[2rem] border border-slate-100 overflow-hidden shadow-sm">
                <table className="w-full text-left text-sm border-collapse">
                  <thead className="bg-slate-950 text-slate-400 font-black uppercase tracking-widest text-[9px]">
                    <tr>
                      <th className="px-10 py-6">Date & Chronology</th>
                      <th className="px-10 py-6">Transaction ID</th>
                      <th className="px-10 py-6">Operational Memo</th>
                      <th className="px-10 py-6 text-right">Debit (+)</th>
                      <th className="px-10 py-6 text-right">Credit (-)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 font-medium">
                    {customerHistory.length > 0 ? customerHistory.map(tx => (
                      <tr key={tx.id} className="hover:bg-slate-50/50 transition-colors group">
                        <td className="px-10 py-6">
                          <p className="text-slate-900 font-black text-xs uppercase">{new Date(tx.date).toLocaleDateString()}</p>
                          <p className="text-[9px] text-slate-400 font-mono font-bold mt-1 uppercase tracking-tighter">{new Date(tx.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second: '2-digit'})}</p>
                        </td>
                        <td className="px-10 py-6">
                          <span className="font-mono text-[10px] font-black bg-slate-900 text-white px-3 py-1.5 rounded-lg tracking-widest">{tx.id}</span>
                        </td>
                        <td className="px-10 py-6 text-slate-500 text-[11px] font-bold uppercase leading-relaxed">
                          {tx.description}
                          <div className="flex gap-2 mt-2">
                            <span className="text-[8px] font-black uppercase tracking-widest px-2 py-0.5 bg-indigo-50 border border-indigo-100 rounded-md text-indigo-500">{tx.paymentMethod}</span>
                          </div>
                        </td>
                        <td className="px-10 py-6 text-right font-black font-mono text-rose-600 text-sm">
                          {tx.type === 'SALE' ? `+ ${Number(tx.amount).toLocaleString()}` : '—'}
                        </td>
                        <td className="px-10 py-6 text-right font-black font-mono text-emerald-600 text-sm">
                          {tx.type === 'CREDIT_PAYMENT' ? `- ${Number(tx.amount).toLocaleString()}` : '—'}
                        </td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={5} className="px-8 py-32 text-center text-slate-300 italic">
                           <div className="flex flex-col items-center gap-6 grayscale opacity-20">
                             <div className="text-7xl">📜</div>
                             <p className="text-[10px] font-black uppercase tracking-[0.4em]">Zero Ledger Activity Recorded</p>
                           </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            
            <div className="p-10 bg-slate-50 border-t border-slate-100 flex justify-between items-center no-print">
               <div className="flex gap-4">
                  <button className="px-8 py-3 bg-white border border-slate-200 rounded-xl font-black text-[10px] uppercase tracking-widest text-slate-500 hover:border-slate-400 transition-all shadow-sm">Print Ledger</button>
                  <button className="px-8 py-3 bg-white border border-slate-200 rounded-xl font-black text-[10px] uppercase tracking-widest text-slate-500 hover:border-slate-400 transition-all shadow-sm">Export XML</button>
               </div>
               <p className="text-[8px] font-black text-slate-400 uppercase tracking-[0.3em] italic">Verified Operational Audit - Prasama ERP Intelligence</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Customers;
