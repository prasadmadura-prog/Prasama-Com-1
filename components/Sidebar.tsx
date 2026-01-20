
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
    <div className="w-[260px] h-full bg-[#0f172a] text-slate-300 flex flex-col border-r border-slate-800/50 shadow-2xl z-20">
      <div className="px-4 pt-6 pb-4">
        <div className="flex items-center gap-2.5 mb-5">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-lg">
            <span className="font-black text-lg italic">P</span>
          </div>
          <div className="overflow-hidden">
            <h1 className="text-xs font-black tracking-tight text-white leading-tight truncate uppercase">{userProfile.name}</h1>
            <p className="text-[9px] text-indigo-400 font-bold uppercase tracking-tight">Strategic Suite</p>
          </div>
        </div>

        {/* Account Summaries - Compact Professional View */}
        <div className="bg-slate-900/40 p-3 rounded-2xl border border-slate-800/50">
          <p className="text-[8px] font-black text-slate-500 uppercase tracking-tight mb-2">Live Liquidity</p>
          <div className="grid grid-cols-2 gap-2">
            {accounts.slice(0, 4).map(acc => (
              <div key={acc.id} className="bg-slate-800/40 p-2 rounded-lg border border-slate-700/30">
                <span className="text-[8px] font-bold text-slate-400 uppercase tracking-tight flex items-center gap-1 mb-1">
                  {acc.id === 'cash' ? '💵' : '🏦'}
                </span>
                <p className="text-[9px] font-black font-mono text-white leading-tight">
                  {Number(acc.balance).toLocaleString(undefined, { minimumFractionDigits: 0 })}
                </p>
                <p className="text-[7px] text-slate-500 uppercase font-bold truncate mt-0.5">
                  {acc.name.split(' ')[0]}
                </p>
              </div>
            ))}
            {accounts.length > 4 && (
              <div className="bg-slate-800/20 p-2 rounded-lg border border-slate-700/20 flex items-center justify-center">
                <p className="text-[8px] text-slate-600 font-bold">+{accounts.length - 4}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto custom-scrollbar">
        {menuItems.map((item) => {
          const isActive = currentView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setView(item.id as View)}
              className={`w-full group flex items-center px-4 py-2.5 text-[11px] font-bold uppercase tracking-tight rounded-xl transition-all duration-200 ${
                isActive 
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' 
                  : 'text-slate-500 hover:bg-slate-800/50 hover:text-slate-200'
              }`}
            >
              <span className={`mr-3 text-base transition-transform group-hover:scale-110 ${isActive ? 'opacity-100' : 'opacity-40'}`}>
                {item.icon}
              </span>
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="p-3 mt-auto border-t border-slate-800/30 space-y-1.5">
        <button 
          onClick={onEditProfile}
          className="w-full flex items-center gap-2.5 bg-slate-900/30 p-3 rounded-xl border border-slate-800/30 hover:bg-slate-800/60 transition-all text-left group"
        >
          <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-black text-indigo-400">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold text-white truncate uppercase tracking-tight">{userProfile.name}</p>
            <p className="text-[8px] text-slate-500 font-bold uppercase tracking-tight truncate">{userProfile.branch}</p>
          </div>
        </button>

        <button 
          onClick={onLogout}
          className="w-full flex items-center gap-2 px-4 py-2 text-[9px] font-black uppercase tracking-tight text-slate-500 hover:text-rose-400 transition-all duration-200"
        >
          <span>🚪</span> Exit Terminal
        </button>
      </div>
    </div>
  );
};

export default Sidebar;
