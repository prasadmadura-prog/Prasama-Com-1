
import React from 'react';
import { View, UserProfile, BankAccount } from '../types';

interface SidebarProps {
  currentView: View;
  setView: (v: View) => void;
  userProfile: UserProfile;
  accounts: BankAccount[];
  onEditProfile: () => void;
  onLogout: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ currentView, setView, userProfile, accounts, onEditProfile, onLogout }) => {
  const menuItems = [
    { id: 'DASHBOARD', label: 'Dashboard', icon: '📊' },
    { id: 'AI_ADVISOR', label: 'AI Advisor', icon: '✨' },
    { id: 'POS', label: 'POS', icon: '🛒' },
    { id: 'QUOTATIONS', label: 'Quotation', icon: '📝' },
    { id: 'SALES_HISTORY', label: 'Sales History', icon: '📜' },
    { id: 'INVENTORY', label: 'Inventory', icon: '📦' },
    { id: 'BARCODE_PRINT', label: 'Barcode Print', icon: '🏷️' },
    { id: 'PURCHASES', label: 'Purchases', icon: '📥' },
    { id: 'CUSTOMERS', label: 'Customers', icon: '👥' },
    { id: 'FINANCE', label: 'Finance', icon: '💰' },
    { id: 'CHEQUE_PRINT', label: 'Cheque Print', icon: '✍️' },
    { id: 'SETTINGS', label: 'Settings', icon: '⚙️' },
  ];

  const initials = userProfile.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="w-[280px] h-full bg-[#0f172a] text-slate-300 flex flex-col border-r border-slate-800/50 shadow-2xl z-20">
      <div className="px-8 pt-10 pb-6">
        <div className="flex items-center gap-3 mb-10">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-[0_0_20px_rgba(79,70,229,0.4)]">
            <span className="font-black text-xl italic">P</span>
          </div>
          <div className="overflow-hidden">
            <h1 className="text-sm font-black tracking-tight text-white leading-tight truncate uppercase">{userProfile.name}</h1>
            <p className="text-[10px] text-indigo-400 font-bold uppercase tracking-[0.1em]">Strategic Suite</p>
          </div>
        </div>

        {/* Account Summaries - Persistent Top-Left View */}
        <div className="space-y-4 bg-slate-900/40 p-5 rounded-3xl border border-slate-800/50">
          <p className="text-[9px] font-black text-slate-500 uppercase tracking-[0.3em] mb-2">Live Liquidity</p>
          <div className="space-y-3">
            {accounts.map(acc => (
              <div key={acc.id} className="flex flex-col">
                <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5 mb-0.5">
                  {acc.id === 'cash' ? '💵' : '🏦'} {acc.name}
                </span>
                <span className="text-[13px] font-black font-mono text-white">
                  Rs. {Number(acc.balance).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </div>
            ))}
            {accounts.length === 0 && (
              <p className="text-[10px] font-black text-slate-600 uppercase italic">No Active Nodes</p>
            )}
          </div>
        </div>
      </div>

      <nav className="flex-1 px-4 space-y-1 overflow-y-auto custom-scrollbar pt-2">
        {menuItems.map((item) => {
          const isActive = currentView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setView(item.id as View)}
              className={`w-full group flex items-center px-5 py-4 text-[12px] font-black uppercase tracking-widest rounded-2xl transition-all duration-300 ${
                isActive 
                  ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-600/20' 
                  : 'text-slate-500 hover:bg-slate-800/50 hover:text-slate-200'
              }`}
            >
              <span className={`mr-4 text-lg transition-transform group-hover:scale-110 ${isActive ? 'opacity-100' : 'opacity-40'}`}>
                {item.icon}
              </span>
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="p-4 mt-auto border-t border-slate-800/30 space-y-2">
        <button 
          onClick={onEditProfile}
          className="w-full flex items-center gap-3 bg-slate-900/30 p-4 rounded-2xl border border-slate-800/30 hover:bg-slate-800/60 transition-all text-left group"
        >
          <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-black text-indigo-400">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-white truncate uppercase tracking-tighter">{userProfile.name}</p>
            <p className="text-[9px] text-slate-500 font-bold uppercase tracking-tight truncate">{userProfile.branch}</p>
          </div>
        </button>

        <button 
          onClick={onLogout}
          className="w-full flex items-center gap-3 px-5 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 hover:text-rose-400 transition-all duration-200"
        >
          <span>🚪</span> Exit Terminal
        </button>
      </div>
    </div>
  );
};

export default Sidebar;
