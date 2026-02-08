import React, { useMemo } from 'react';
import { Transaction, Product, BankAccount, View, PurchaseOrder, DaySession, Customer, Vendor, Category, UserProfile } from '../types';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface DashboardProps {
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
  onUpdateProduct: (p: Product) => void;
  onJumpTo?: (type: 'PO' | 'CUSTOMER' | 'VENDOR' | 'SALE', id: string) => void;
}

const Dashboard: React.FC<DashboardProps> = ({
  transactions = [],
  products = [],
  categories = [],
  accounts = [],
  daySessions = [],
  customers = [],
  vendors = [],
  purchaseOrders = [],
  userProfile,
  onNavigate,
  onUpdateProduct,
  onJumpTo
}) => {
  const [branchFilter, setBranchFilter] = React.useState<'ALL' | string>(userProfile.branch || 'ALL');

  // Sync filter with global branch selection
  React.useEffect(() => {
    if (userProfile.branch) {
      setBranchFilter(userProfile.branch);
    }
  }, [userProfile.branch]);

  // ---- HELPER: Normalize Branch ----
  const normalizeBranch = (b?: string): string => {
    if (!b) return 'CASHIER 1';
    const upper = b.trim().toUpperCase();
    if (upper === 'LOCAL NODE' || upper === 'BOOKSHOP' || upper === 'SHOP 2' || upper === 'MAIN BRANCH' || upper === 'NO 16,KIRULAPANA SUPERMARKET ,COLOMBO 05') {
      return 'CASHIER 1';
    }
    return b;
  };

  const stats = useMemo(() => {
    const d = new Date();
    const todayStr = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

    const todayTxs = transactions.filter(t => {
      const matchDate = t && t.date && t.date.split('T')[0] === todayStr;
      const tBranch = normalizeBranch(t.branchId);
      const target = normalizeBranch(branchFilter);
      return matchDate && (branchFilter === 'ALL' || tBranch === target);
    });

    const getTxCostBasis = (t: Transaction) => {
      if (t.costBasis !== undefined && t.costBasis !== null) return t.costBasis;
      let fallback = 0;
      t.items?.forEach(item => {
        const p = products.find(prod => prod.id === item.productId);
        if (p) {
          const productCategory = categories.find(c => c.id === p.categoryId);
          const isReload = (productCategory?.name || '').toUpperCase().includes('RELOAD') ||
            (p.categoryId && p.categoryId.toUpperCase().includes('RELOAD'));

          let itemCost = Number(p.cost || 0);
          if (isReload) {
            // Reload Cost = 96% of Selling Price
            itemCost = Number(item.price) * 0.96;
          }
          fallback += itemCost * Number(item.quantity);
        }
      });
      return fallback;
    };

    // Calculate revenue (EXCLUDING reload) and reload sales separately
    let revenue = 0;
    let reloadSales = 0;
    let todayCOGS = 0;

    todayTxs
      .filter(t => t.type === 'SALE' || t.type === 'SALE_HISTORY_IMPORT')
      .forEach(t => {
        if (t.items && t.items.length > 0) {
          t.items.forEach(item => {
            const p = products.find(prod => prod.id === item.productId);
            const productCategory = categories.find(c => c.id === p?.categoryId);
            const isReload = productCategory?.name?.toLowerCase() === 'reload';

            const itemTotal = (Number(item.quantity) * Number(item.price)) - (Number(item.discount) || 0);

            if (isReload) {
              reloadSales += itemTotal;
            } else {
              revenue += itemTotal;
              todayCOGS += Number(p?.cost || 0) * Number(item.quantity);
            }
          });
        } else {
          // Fallback for transactions without items
          revenue += Number(t.amount || 0);
          todayCOGS += getTxCostBasis(t);
        }
      });

    // Profit = (Non-Reload Revenue - Cost) + 4% of Reload Sales
    const profit = (revenue - todayCOGS) + (reloadSales * 0.04);
    const margin = revenue > 0 ? (profit / revenue) * 100 : 0;

    // FIX: Sum opening balances for ALL sessions if filter is ALL
    const openingFloat = daySessions
      .filter(s => s.date === todayStr && (branchFilter === 'ALL' || normalizeBranch(s.branchId) === normalizeBranch(branchFilter)))
      .reduce((acc, s) => acc + Number(s.openingBalance || 0), 0);

    // CASH BASIS: Only actual cash that entered the drawer today.
    const cashIn = todayTxs.reduce((acc, t) => {
      if (t.paymentMethod !== 'CASH' && !(t.type === 'TRANSFER' && t.destinationAccountId === 'cash')) return acc;

      let amount = 0;
      if (t.type === 'SALE') amount = Number(t.paidAmount || (t.paymentMethod === 'CASH' ? t.amount : 0));
      else if (t.type === 'CREDIT_PAYMENT' || t.type === 'TRANSFER') amount = Number(t.amount || 0);

      return acc + amount;
    }, 0);

    const cashOut = todayTxs.filter(t =>
      (t.type === 'EXPENSE' || t.type === 'PURCHASE' || (t.type === 'TRANSFER' && t.accountId === 'cash'))
      && t.paymentMethod === 'CASH'
    ).reduce((acc, t) => acc + Number(t.amount || 0), 0);

    const todayCash = openingFloat + cashIn - cashOut;
    const totalStockValue = products.reduce((acc, p) => acc + (Number(p.cost || 0) * Number(p.stock || 0)), 0);

    const burn = todayTxs
      .filter(t => t.type === 'EXPENSE' || t.type === 'PURCHASE')
      .reduce((acc, t) => acc + Number(t.amount || 0), 0);

    return { revenue, profit, todayCash, burn, totalStockValue, margin };
  }, [transactions, products, categories, daySessions, branchFilter]);

  const salesTrend = useMemo(() => {
    // 1. Setup Buckets (Last 30 Days)

    // ---- HELPER: Normalize Amount ----
    const normalizeAmount = (val: any): number => {
      if (typeof val === 'number') return val;
      if (!val) return 0;
      // Handle string currency like "Rs. 1,200.50"
      const str = String(val).replace(/[^0-9.-]+/g, "");
      const num = parseFloat(str);
      return isNaN(num) ? 0 : num;
    };

    // ---- HELPER: Normalize Date to YYYY-MM-DD ----
    const normalizeDateKey = (dateStr: any): string | null => {
      if (!dateStr) return null;
      let d = new Date(dateStr);

      // If invalid, try manual parsing for "MM/DD/YYYY" or "DD/MM/YYYY" if strictly numeric
      if (isNaN(d.getTime())) {
        return null; // Can't map invalid date
      }

      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };

    // 1. Setup Buckets (Last 30 Days)
    const dailyRevenueMap: Record<string, number> = {};
    const dailyProfitMap: Record<string, number> = {};
    const labelMap: Record<string, string> = {};

    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      dailyRevenueMap[key] = 0;
      dailyProfitMap[key] = 0;
      labelMap[key] = d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
    }

    // 2. Aggregate Data
    // Prepare effective filter once
    const rawFilter = branchFilter;
    const targetFilter = rawFilter === 'ALL' ? 'ALL' : normalizeBranch(rawFilter);

    transactions.forEach(t => {
      if (!t || !t.date) return;

      // Filter Logic
      const tBranch = normalizeBranch(t.branchId);
      // History imports without branch are allowed if generic, or if they match the filter
      const isHistory = t.type === 'SALE_HISTORY_IMPORT';
      const isMatch = targetFilter === 'ALL' || tBranch === targetFilter || (isHistory && !t.branchId);

      if (isMatch && (t.type === 'SALE' || t.type === 'SALE_HISTORY_IMPORT')) {
        const key = normalizeDateKey(t.date);
        if (key && dailyRevenueMap[key] !== undefined) {
          // Calculate revenue (excluding reload) and profit (including 4% reload)
          let revenueAmount = 0;
          let costAmount = 0;
          let reloadAmount = 0;

          if (t.items && t.items.length > 0) {
            t.items.forEach(item => {
              const product = products.find(p => p.id === item.productId);
              const category = categories.find(c => c.id === product?.categoryId);
              const isReload = category?.name?.toLowerCase() === 'reload';

              const itemTotal = (Number(item.quantity) * Number(item.price)) - (Number(item.discount) || 0);

              if (isReload) {
                reloadAmount += itemTotal;
              } else {
                revenueAmount += itemTotal;
                costAmount += Number(product?.cost || 0) * Number(item.quantity);
              }
            });
          } else {
            // Fallback for transactions without items
            revenueAmount = normalizeAmount(t.amount);
          }

          dailyRevenueMap[key] += revenueAmount;
          dailyProfitMap[key] += (revenueAmount - costAmount) + (reloadAmount * 0.04);
        }
      }
    });

    // 3. Convert to Array
    return Object.keys(dailyRevenueMap).sort().map(key => ({
      date: labelMap[key],
      revenue: Math.round(dailyRevenueMap[key]),
      profit: Math.round(dailyProfitMap[key])
    }));
  }, [transactions, branchFilter, products, categories]);

  const leaders = useMemo(() => {
    const productMap: Record<string, { name: string, revenue: number, units: number, profit: number }> = {};
    const categoryMap: Record<string, { name: string, revenue: number, units: number }> = {};

    transactions.filter(t => t && (t.type === 'SALE' || t.type === 'SALE_HISTORY_IMPORT') && (branchFilter === 'ALL' || t.branchId === branchFilter)).forEach(tx => {
      tx.items?.forEach(item => {
        const product = products.find(p => p.id === item.productId);
        const revenue = Number(item.quantity) * Number(item.price);
        const units = Number(item.quantity);
        const lineDiscount = Number(item.discount || 0);

        if (product) {
          const productCategory = categories.find(c => c.id === product.categoryId);
          const isReload = (productCategory?.name || '').toUpperCase().includes('RELOAD') ||
            (product.categoryId && product.categoryId.toUpperCase().includes('RELOAD'));

          let unitCost = Number(product.cost || 0);
          if (isReload) unitCost = Number(item.price) * 0.96;

          const cost = units * unitCost;
          const profit = revenue - cost - lineDiscount;

          if (!productMap[product.id]) {
            productMap[product.id] = { name: product.name, revenue: 0, units: 0, profit: 0 };
          }
          productMap[product.id].revenue += revenue;
          productMap[product.id].units += units;
          productMap[product.id].profit += profit;

          const catId = product.categoryId || 'UNCATEGORIZED';
          if (!categoryMap[catId]) {
            const actualCategory = categories.find(c => c.id === catId);
            categoryMap[catId] = {
              name: actualCategory ? actualCategory.name : (catId === 'UNCATEGORIZED' ? 'UNCATEGORIZED' : catId),
              revenue: 0,
              units: 0
            };
          }
          categoryMap[catId].revenue += revenue;
          categoryMap[catId].units += units;
        }
      });
    });

    const topProfitProducts = Object.values(productMap)
      .sort((a, b) => b.profit - a.profit)
      .slice(0, 5);

    return {
      topProfitProducts,
      topProducts: Object.values(productMap).sort((a, b) => b.revenue - a.revenue).slice(0, 5),
      topCategories: Object.values(categoryMap).sort((a, b) => b.revenue - a.revenue).slice(0, 5)
    };
  }, [transactions, products, categories, branchFilter]);

  const futureFinancials = useMemo(() => {
    const events: any[] = [];

    // 1. Map all dated instruments (Cheques) from completed transactions
    transactions.forEach(t => {
      if (t && t.paymentMethod === 'CHEQUE' && t.chequeDate) {
        const isIncoming = t.type === 'SALE' || t.type === 'CREDIT_PAYMENT' || t.type === 'SALE_HISTORY_IMPORT';
        events.push({
          id: t.id,
          date: t.chequeDate,
          amount: t.amount,
          entityId: isIncoming ? t.customerId : t.vendorId,
          entity: isIncoming ? customers.find(c => c.id === t.customerId)?.name || 'Client' : vendors.find(v => v.id === t.vendorId)?.name || 'Supplier',
          type: isIncoming ? 'INCOMING' : 'OUTGOING',
          desc: 'PDC MATURITY',
          method: 'CHEQUE',
          jumpType: isIncoming ? 'SALE' : 'VENDOR' // Actually sales might need sale edit, but generic vendor ledger is safer for outflow
        });
      }
    });

    // 2. Map all unsettled Credit Liabilities (Outstanding Ledger Balances)
    customers.forEach(c => {
      if (Number(c.totalCredit) > 0) {
        events.push({
          id: c.id,
          date: 'OUTSTANDING',
          amount: c.totalCredit,
          entityId: c.id,
          entity: c.name,
          type: 'INCOMING',
          desc: 'CREDIT EXPOSURE',
          method: 'CREDIT',
          jumpType: 'CUSTOMER'
        });
      }
    });

    vendors.forEach(v => {
      if (Number(v.totalBalance) > 0) {
        events.push({
          id: v.id,
          date: 'OUTSTANDING',
          amount: v.totalBalance,
          entityId: v.id,
          entity: v.name,
          type: 'OUTGOING',
          desc: 'CREDIT LIABILITY',
          method: 'CREDIT',
          jumpType: 'VENDOR'
        });
      }
    });

    // 3. Include Pending Purchase Orders (Strictly financial commitment, no intake steps)
    if (purchaseOrders) {
      purchaseOrders.forEach(po => {
        if (po && po.status === 'PENDING') {
          events.push({
            id: po.id,
            date: po.chequeDate || po.date.split('T')[0],
            amount: po.totalAmount,
            entityId: po.vendorId,
            entity: vendors.find(v => v.id === po.vendorId)?.name || 'Supplier',
            type: 'OUTGOING',
            desc: po.paymentMethod === 'CHEQUE' ? 'PO CHEQUE MATURITY' : 'COMMITTED PO',
            method: po.paymentMethod,
            jumpType: 'PO'
          });
        }
      });
    }

    const sorted = events.sort((a, b) => {
      if (a.date === 'OUTSTANDING' && b.date !== 'OUTSTANDING') return -1;
      if (a.date !== 'OUTSTANDING' && b.date === 'OUTSTANDING') return 1;
      if (a.date === 'OUTSTANDING' && b.date === 'OUTSTANDING') return b.amount - a.amount;
      return a.date.localeCompare(b.date);
    });

    const totalIn = sorted.filter(e => e.type === 'INCOMING').reduce((a, b) => a + Number(b.amount), 0);
    const totalOut = sorted.filter(e => e.type === 'OUTGOING').reduce((a, b) => a + Number(b.amount), 0);

    return { list: sorted, totalIn, totalOut };
  }, [transactions, purchaseOrders, customers, vendors]);

  const stockAlerts = useMemo(() =>
    products.filter(p => p.stock <= p.lowStockThreshold).sort((a, b) => a.stock - b.stock)
    , [products]);

  return (
    <div className="space-y-10 animate-in fade-in duration-700 pb-20">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tighter uppercase">Market Intelligence</h1>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mt-1">Unified Financial Core Snapshot</p>
        </div>
        <div className="flex flex-col md:flex-row items-end gap-4">
          {userProfile.allBranches && userProfile.allBranches.length > 0 && (
            <select
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
              className="bg-white px-6 py-3 rounded-2xl border border-slate-100 shadow-sm outline-none text-[10px] font-black uppercase tracking-widest text-indigo-600 hover:border-indigo-200 transition-all cursor-pointer"
            >
              <option value="ALL">All Terminals</option>
              {userProfile.allBranches.map(b => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          )}
          <div className="bg-white px-6 py-3 rounded-full border border-slate-100 shadow-sm flex items-center gap-3">
            <div className={`w-2 h-2 rounded-full bg-emerald-500 animate-pulse`}></div>
            <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Live Cloud Connect</span>
          </div>
        </div>
      </header>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
        {[
          { label: "Today's Revenue", value: stats.revenue, color: 'text-indigo-600', icon: '💰', sub: 'Gross Daily' },
          { label: "Today's Profit", value: stats.profit, color: 'text-emerald-600', icon: '📈', sub: `Margin: ${stats.margin.toFixed(1)}%` },
          { label: "Cash Position", value: stats.todayCash, color: 'text-slate-900', icon: '💵', sub: 'In-Drawer Float' },
          { label: "Asset Valuation", value: stats.totalStockValue, color: 'text-amber-600', icon: '📦', sub: 'Inventory at Cost' },
          { label: "Capital Outflow", value: stats.burn, color: 'text-rose-600', icon: '💸', sub: 'Expenses + Purchases' },
        ].map((item, idx) => (
          <div key={idx} className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm hover:shadow-2xl transition-all duration-500 group">
            <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center text-xl mb-8 shadow-inner border border-slate-100/50 group-hover:scale-110 transition-transform">{item.icon}</div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{item.label}</p>
            {item.label === "Today's Profit" ? (
              <p className="text-3xl font-black text-slate-900 font-mono tracking-tighter shrink-0">{Math.round(stats.profit).toLocaleString()}</p>
            ) : (
              <p className={`text-xl font-black font-mono tracking-tighter ${item.color}`}>Rs. {Math.round(item.value).toLocaleString()}</p>
            )}
            <p className="text-[8px] font-black text-slate-300 uppercase tracking-widest mt-2">{item.sub}</p>
          </div>
        ))}
      </div>

      {/* Future Cheque + Credit + PO Ledger */}
      <div className="bg-white rounded-[3.5rem] p-10 shadow-sm border border-slate-100 relative overflow-hidden animate-in slide-in-from-bottom-2">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8 mb-8 pb-6 border-b border-slate-50">
          <div className="flex items-center gap-6">
            <div className="w-14 h-14 rounded-2xl bg-indigo-600 flex items-center justify-center text-2xl shadow-xl shadow-indigo-600/20">📅</div>
            <div>
              <h2 className="text-2xl font-black uppercase text-slate-900 tracking-tighter leading-none">Future Cheque + Credit + PO Roadmap</h2>
              <p className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.3em] mt-2 opacity-80">Aggregate PDC, Unsettled Portfolio & Committed Orders Manifest</p>
            </div>
          </div>
          <div className="flex gap-6">
            <div className="bg-emerald-50 px-6 py-3 rounded-2xl border border-emerald-100 flex flex-col items-center">
              <p className="text-[8px] font-black uppercase text-emerald-600 mb-1 tracking-widest opacity-80">Total Receivables</p>
              <p className="text-xl font-black font-mono text-emerald-700">Rs. {futureFinancials.totalIn.toLocaleString()}</p>
            </div>
            <div className="bg-rose-50 px-6 py-3 rounded-2xl border border-rose-100 flex flex-col items-center">
              <p className="text-[8px] font-black uppercase text-rose-600 mb-1 tracking-widest opacity-80">Total Commitments</p>
              <p className="text-xl font-black font-mono text-rose-700">Rs. {futureFinancials.totalOut.toLocaleString()}</p>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 max-h-[450px] overflow-y-auto custom-scrollbar pr-4">
          {futureFinancials.list.length > 0 ? futureFinancials.list.map((ev, i) => (
            <div key={i} className="bg-slate-50/50 p-6 rounded-[1.5rem] border border-slate-100 hover:border-indigo-100 hover:bg-white transition-all shadow-sm flex flex-col md:flex-row items-center gap-6 group">
              <div className="w-full md:w-32 shrink-0">
                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Maturity / Status</p>
                <p className={`text-[13px] font-black font-mono tracking-tight ${ev.date === 'OUTSTANDING' ? 'text-indigo-600 animate-pulse' : 'text-slate-900'}`}>{ev.date}</p>
              </div>
              <div className="hidden md:block w-px h-10 bg-slate-200"></div>
              <div className="flex-1 min-w-0 flex items-center gap-4">
                <div className={`w-3 h-3 rounded-full shrink-0 ${ev.type === 'INCOMING' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]'}`}></div>
                <div className="min-w-0">
                  <button
                    onClick={() => onJumpTo?.(ev.jumpType, ev.entityId || ev.id)}
                    className="text-[14px] font-black text-slate-900 uppercase truncate leading-tight group-hover:text-indigo-600 transition-colors text-left hover:underline decoration-indigo-200 underline-offset-4"
                  >
                    {ev.entity}
                  </button>
                  <div className="flex gap-2 items-center mt-1">
                    <span className={`text-[8px] font-black px-1.5 py-0.5 rounded ${ev.method === 'CHEQUE' ? 'bg-indigo-100 text-indigo-600' :
                      ev.method === 'CREDIT' ? 'bg-rose-100 text-rose-600' :
                        'bg-slate-200 text-slate-600'
                      }`}>{ev.method}</span>
                    <button
                      onClick={() => onJumpTo?.(ev.jumpType, ev.id)}
                      className="text-[10px] font-bold text-slate-400 uppercase tracking-widest italic truncate hover:text-indigo-500 transition-colors"
                    >
                      {ev.desc} {ev.id.length > 5 && `(${ev.id.substring(0, 8)})`}
                    </button>
                  </div>
                </div>
              </div>
              <div className="w-full md:w-48 text-right shrink-0">
                <p className="text-[8px] font-black text-slate-300 uppercase tracking-widest mb-1">Value (Rs.)</p>
                <p className={`text-xl font-black font-mono tracking-tighter ${ev.type === 'INCOMING' ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {ev.type === 'INCOMING' ? '+' : '-'} {Number(ev.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </p>
              </div>
            </div>
          )) : (
            <div className="py-20 text-center text-slate-300 bg-slate-50/30 rounded-[2.5rem] border border-dashed border-slate-200">
              <div className="text-5xl mb-4 grayscale opacity-20">📜</div>
              <p className="text-[11px] font-black uppercase tracking-[0.4em]">Zero Unsettled Ledger Entries found</p>
            </div>
          )}
        </div>
      </div>

      {/* Grid: Categories and Item Revenue */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
        <div className="bg-white p-12 rounded-[3.5rem] border border-slate-100 shadow-sm">
          <div className="flex justify-between items-end mb-10">
            <div>
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Category Performance</p>
              <h3 className="text-2xl font-black text-slate-900 tracking-tighter">Top 5 Categories</h3>
            </div>
            <p className="text-[9px] font-black text-indigo-500 uppercase tracking-widest">Revenue</p>
          </div>
          <div className="space-y-8">
            {leaders.topCategories.map((item, idx) => {
              const maxVal = Math.max(...leaders.topCategories.map(c => c.revenue), 1);
              const percent = (item.revenue / maxVal) * 100;
              return (
                <div key={idx} className="space-y-3">
                  <div className="flex justify-between items-end">
                    <div>
                      <p className="text-[12px] font-black text-slate-800 uppercase tracking-tight">{idx + 1}. {item.name}</p>
                      <p className="text-[9px] font-bold text-slate-400 uppercase mt-1 opacity-70">Units: {item.units}</p>
                    </div>
                    <p className="text-[12px] font-black font-mono text-indigo-600">RS. {item.revenue.toLocaleString()}</p>
                  </div>
                  <div className="h-4 w-full bg-slate-50 rounded-full overflow-hidden shadow-inner border border-slate-100">
                    <div
                      className="h-full bg-gradient-to-r from-indigo-500 to-emerald-400 rounded-full transition-all duration-1000 ease-out"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-white p-12 rounded-[3.5rem] border border-slate-100 shadow-sm">
          <div className="flex justify-between items-end mb-10">
            <div>
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Item Leaders</p>
              <h3 className="text-2xl font-black text-slate-900 tracking-tighter">Top 5 Products</h3>
            </div>
            <p className="text-[9px] font-black text-indigo-500 uppercase tracking-widest">Revenue</p>
          </div>
          <div className="space-y-8">
            {leaders.topProducts.map((item, idx) => {
              const maxVal = Math.max(...leaders.topProducts.map(p => p.revenue), 1);
              const percent = (item.revenue / maxVal) * 100;
              return (
                <div key={idx} className="space-y-3">
                  <div className="flex justify-between items-end">
                    <div>
                      <p className="text-[12px] font-black text-slate-800 uppercase tracking-tight">{idx + 1}. {item.name}</p>
                      <p className="text-[9px] font-bold text-slate-400 uppercase mt-1 opacity-70">Units: {item.units}</p>
                    </div>
                    <p className="text-[12px] font-black font-mono text-indigo-600">RS. {item.revenue.toLocaleString()}</p>
                  </div>
                  <div className="h-4 w-full bg-slate-50 rounded-full overflow-hidden shadow-inner border border-slate-100">
                    <div
                      className="h-full bg-gradient-to-r from-indigo-500 to-emerald-400 rounded-full transition-all duration-1000 ease-out"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Profit Contribution Section */}
      <div className="bg-white p-12 rounded-[3.5rem] border border-slate-100 shadow-sm animate-in slide-in-from-bottom-4 duration-700">
        <div className="flex justify-between items-end mb-10">
          <div>
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">PROFIT CONTRIBUTION</p>
            <h3 className="text-3xl font-black text-slate-900 tracking-tighter">Top 5 Products by Profit</h3>
          </div>
          <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">NET PROFIT</p>
        </div>
        <div className="space-y-10">
          {leaders.topProfitProducts.map((item, idx) => {
            const maxProfit = Math.max(...leaders.topProfitProducts.map(p => p.profit), 1);
            const percent = (item.profit / maxProfit) * 100;
            return (
              <div key={idx} className="space-y-3 group">
                <div className="flex justify-between items-end">
                  <div className="min-w-0">
                    <p className="text-[14px] font-black text-slate-800 uppercase tracking-tight truncate">
                      <span className="text-slate-400 mr-2">{idx + 1}.</span> {item.name}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[14px] font-black font-mono text-emerald-600">RS. {item.profit.toLocaleString()}</p>
                  </div>
                </div>
                <div className="h-5 w-full bg-slate-50 rounded-full overflow-hidden shadow-inner border border-slate-100 p-0.5">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-500 via-emerald-600 to-amber-400 rounded-full transition-all duration-1000 ease-out"
                    style={{ width: `${percent}%` }}
                  />
                </div>
                <div className="flex justify-between items-center px-1">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    Units: <span className="text-slate-600">{item.units}</span> · Revenue: <span className="text-slate-600">Rs. {item.revenue.toLocaleString()}</span>
                  </p>
                </div>
              </div>
            );
          })}
          {leaders.topProfitProducts.length === 0 && (
            <div className="py-20 text-center opacity-20">
              <p className="text-xs font-black uppercase tracking-[0.3em]">No profitable sales recorded in cycle</p>
            </div>
          )}
        </div>
      </div>

      {/* STOCK ALERT (PROFESSIONAL GRADIENT SECTION) */}
      {
        stockAlerts.length > 0 && (
          <div className="bg-gradient-to-br from-rose-600 via-rose-700 to-red-900 rounded-[3.5rem] p-12 text-white shadow-2xl relative overflow-hidden animate-in slide-in-from-bottom-4 duration-700">
            <div className="absolute top-0 right-0 p-16 opacity-[0.05] pointer-events-none text-9xl font-black italic tracking-tighter select-none rotate-[-15deg]">ALERT</div>
            <div className="relative z-10">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-12">
                <div className="space-y-4">
                  <p className="text-[11px] font-black uppercase tracking-[0.4em] text-rose-200 opacity-80">INVENTORY DEPLETION ALERT</p>
                  <h2 className="text-4xl font-black uppercase tracking-tighter leading-none">CRITICAL STOCK SHORTFALL</h2>
                </div>
                <div className="bg-white/10 backdrop-blur-md border border-white/20 px-8 py-4 rounded-3xl text-center shadow-lg">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-100">{stockAlerts.length} ITEMS BELOW THRESHOLD</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {stockAlerts.slice(0, 4).map((p, i) => (
                  <div key={i} className="bg-white/10 backdrop-blur-xl p-8 rounded-[2.5rem] border border-white/10 hover:bg-white/20 transition-all duration-300 group shadow-xl">
                    <div className="flex justify-between items-start mb-6">
                      <span className="text-[9px] font-black text-rose-200 font-mono opacity-60">{p.sku}</span>
                      <span className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest ${p.stock === 0 ? 'bg-red-900 text-white' : 'bg-rose-50 text-white'}`}>
                        {p.stock === 0 ? 'OUT OF STOCK' : 'LOW STOCK'}
                      </span>
                    </div>
                    <h4 className="text-[13px] font-black uppercase tracking-tight leading-snug mb-8 h-10 line-clamp-2">{p.name}</h4>
                    <div className="flex justify-between items-end pt-6">
                      <div>
                        <p className="text-[9px] font-black text-rose-200 uppercase tracking-widest opacity-60">Available</p>
                        <p className="text-3xl font-black font-mono">{p.stock}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[9px] font-black text-rose-200 uppercase tracking-widest opacity-60">Threshold</p>
                        <p className="text-xl font-black text-rose-200 font-mono">{p.lowStockThreshold}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-10 text-center">
                <button onClick={() => onNavigate('INVENTORY')} className="text-[10px] font-black uppercase tracking-[0.4em] text-rose-100 hover:text-white transition-all underline underline-offset-8">VIEW ALL {stockAlerts.length} ALERTS IN MASTER CATALOG</button>
              </div>
            </div>
          </div>
        )
      }

      {/* Volume Velocity Chart */}
      <div className="bg-white p-12 rounded-[3.5rem] border border-slate-100 shadow-sm relative overflow-hidden">
        <div className="flex justify-between items-center mb-12">
          <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">Volume Velocity (30 Days)</h3>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Enterprise Revenue Flow</p>
        </div>
        <div className="h-[400px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={salesTrend}>
              <defs>
                <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.15} /><stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} /><stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeights: 900, fill: '#94a3b8' }} dy={15} interval={4} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeights: 900, fill: '#94a3b8' }} tickFormatter={(val) => `Rs.${val / 1000}k`} />
              <Tooltip
                contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', fontWeight: 900, fontSize: '10px' }}
                formatter={(val) => Math.round(Number(val)).toLocaleString()}
              />
              <Area type="monotone" dataKey="revenue" stroke="#6366f1" strokeWidth={5} fillOpacity={1} fill="url(#colorRevenue)" dot={{ r: 4, fill: '#6366f1', strokeWidth: 2, stroke: '#fff' }} name="Revenue" />
              <Area type="monotone" dataKey="profit" stroke="#10b981" strokeWidth={5} fillOpacity={1} fill="url(#colorProfit)" dot={{ r: 4, fill: '#10b981', strokeWidth: 2, stroke: '#fff' }} name="Profit" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div >
  );
};
export default Dashboard;