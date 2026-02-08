
import React, { useState } from 'react';
import { View, UserProfile, BankAccount } from '../types';

interface SidebarProps {
  currentView: View;
  setView: (v: View) => void;
  userProfile: UserProfile;
  // Added missing accounts and onSwitchBranch props
  accounts: BankAccount[];
  onEditProfile: () => void;
  onLogout: () => void;
  onSwitchBranch?: (branch: string) => void;
}

const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  setView,
  userProfile,
  // Added missing accounts and onSwitchBranch props to destructuring
  accounts,
  onEditProfile,
  onLogout,
  onSwitchBranch
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  const menuItems = [
    { id: 'DASHBOARD', label: 'Dashboard', icon: '📊' },
    { id: 'KPI', label: 'KPI Ledger', icon: '⚡' },
    { id: 'POS', label: 'POS', icon: '🛒' },
    { id: 'QUOTATIONS', label: 'Quotation', icon: '📝' },
    { id: 'SALES_HISTORY', label: 'Sales History', icon: '📜' },
    { id: 'INVENTORY', label: 'Inventory', icon: '📦' },
    { id: 'BARCODE_PRINT', label: 'Barcode Print', icon: '🏷️' },
    { id: 'PURCHASES', label: 'Purchases', icon: '📥' },
    { id: 'CUSTOMERS', label: 'Customers', icon: '👥' },
    { id: 'FINANCE', label: 'Finance', icon: '💰' },
    { id: 'ACCOUNTING', label: 'Accounting', icon: '📈' },
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
    <div className={`${isCollapsed ? 'w-[80px]' : 'w-[260px]'} h-full bg-[#1e1b4b] text-slate-300 flex flex-col border-r border-indigo-900/30 shadow-2xl z-20 transition-all duration-300 ease-in-out relative`}>
      {/* Collapse Toggle */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="absolute -right-3 top-10 w-6 h-6 bg-indigo-600 rounded-full flex items-center justify-center text-white shadow-lg z-50 hover:bg-indigo-700 transition-colors border border-white"
      >
        {isCollapsed ? '→' : '←'}
      </button>

      {/* Header */}
      <div className={`px-4 pt-6 pb-4 ${isCollapsed ? 'items-center' : ''} flex flex-col`}>
        <div className="flex items-center gap-3 mb-4 w-full">
          <div className="w-10 h-10 min-w-[40px] rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-lg">
            <span className="font-black text-xl italic">P</span>
          </div>
          {!isCollapsed && (
            <div className="overflow-hidden flex-1">
              <h1 className="text-xs font-black tracking-tight text-white leading-tight truncate uppercase">{userProfile.companyName || userProfile.name}</h1>
              {userProfile.allBranches && userProfile.allBranches.length > 0 ? (
                <select
                  value={userProfile.branch}
                  onChange={(e) => onSwitchBranch?.(e.target.value)}
                  className="mt-1 block w-full bg-transparent border-none text-[10px] text-indigo-300 font-bold uppercase tracking-widest outline-none cursor-pointer hover:text-indigo-200 transition-colors"
                >
                  {userProfile.allBranches.map(b => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              ) : (
                <p className="text-[10px] text-indigo-300 font-bold uppercase tracking-widest opacity-80">{userProfile.branch}</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 space-y-1 overflow-y-auto custom-scrollbar pt-2">
        {menuItems.map((item) => {
          const isActive = currentView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setView(item.id as View)}
              title={item.label}
              className={`w-full group flex items-center ${isCollapsed ? 'justify-center px-0' : 'px-4'} py-3 text-[11px] font-black uppercase tracking-widest rounded-xl transition-all duration-200 ${isActive
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/50 ring-1 ring-indigo-500/50'
                : 'text-slate-400 hover:bg-white/5 hover:text-indigo-300'
                }`}
            >
              <span className={`text-xl transition-transform group-hover:scale-110 ${isCollapsed ? 'mr-0' : 'mr-3'} ${isActive ? 'opacity-100' : 'opacity-30'}`}>
                {item.icon}
              </span>
              {!isCollapsed && <span>{item.label}</span>}
            </button>
          );
        })}
      </nav>

      {/* Footer Profile */}
      <div className="p-3 mt-auto border-t border-indigo-900/30 space-y-1.5 bg-[#16133a]">
        <button
          onClick={onEditProfile}
          className={`w-full flex items-center ${isCollapsed ? 'justify-center' : 'gap-2.5'} bg-[#1e1b4b] p-2.5 rounded-xl border border-indigo-900/50 hover:border-indigo-500/50 transition-all text-left group shadow-sm`}
        >
          <div className="w-9 h-9 min-w-[36px] rounded-lg bg-indigo-900/50 border border-indigo-800 flex items-center justify-center text-[11px] font-black text-indigo-300">
            {initials}
          </div>
          {!isCollapsed && (
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold text-white truncate uppercase tracking-tighter">{userProfile.userName || userProfile.name}</p>
              <p className="text-[9px] text-slate-400 font-bold uppercase tracking-tight truncate">{userProfile.email || userProfile.loginUsername || 'Enterprise Node'}</p>
            </div>
          )}
        </button>

        <button
          onClick={onLogout}
          className={`w-full flex items-center ${isCollapsed ? 'justify-center' : 'gap-2 px-4'} py-2.5 text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 hover:text-rose-600 transition-all duration-200`}
        >
          <span>🚪</span> {!isCollapsed && 'Exit Terminal'}
        </button>
      </div>
    </div>
  );
};

export default Sidebar;
