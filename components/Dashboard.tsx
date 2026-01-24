
import React, { useMemo } from 'react';
import { Transaction, Product, BankAccount, Category, Vendor, Customer, View, PurchaseOrder, DaySession } from '../types';
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
  onNavigate: (view: View) => void;
  onUpdateProduct: (p: Product) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ 
  transactions = [], 
  products = [], 
  categories = [],
  accounts = [], 
  vendors = [], 
  customers = [],
  purchaseOrders = [],
  daySessions = [],
  onNavigate
}) => {
  const stats = useMemo(() => {
    // Calculate ALL-TIME sales metrics (not just today)
    const allSalesTotal = transactions
      .filter(t => t.type && t.type.toUpperCase() === 'SALE')
      .reduce((acc, t) => acc + Number(t.amount), 0);

    const allCostOfRevenue = transactions
      .filter(t => t.type && t.type.toUpperCase() === 'SALE')
      .reduce((acc, t) => {
        const itemsCost = t.items?.reduce((itemAcc, item) => {
          const product = products.find(p => p.id === item.productId);
          return itemAcc + (Number(product?.cost || 0) * Number(item.quantity));
        }, 0) || 0;
        return acc + itemsCost;
      }, 0);

    const todayProfit = allSalesTotal - allCostOfRevenue;
    const todayMargin = allSalesTotal > 0 ? (todayProfit / allSalesTotal) * 100 : 0;
// All-time realized outflow (expenses, purchases, transfers)
    const realizedOutflow = transactions
      .filter(t => t.type === 'EXPENSE' || t.type === 'PURCHASE' || (t.type === 'TRANSFER' && t.accountId))
      .reduce((acc, t) => acc + Number(t.amount), 0);

    const stockValuation = products.reduce((acc, p) => acc + (Number(p.cost) * Number(p.stock)), 0);
    
    return { todaySalesTotal: allSalesTotal, todayCostOfRevenue: allCostOfRevenue, todayProfit, todayMargin, realizedOutflow, stockValuation };
  }, [transactions, products]);

  const upcomingFinancials = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const events: { type: 'CHEQUE_IN' | 'CHEQUE_OUT', ref: string, amount: number, entity: string, description: string, date: string, source: View }[] = [];

    transactions.forEach(t => {
      if (t.paymentMethod === 'CHEQUE' && t.chequeDate && t.chequeDate >= today) {
        if (t.type === 'SALE' || (t.type === 'CREDIT_PAYMENT' && t.customerId)) {
          events.push({ 
            type: 'CHEQUE_IN', ref: t.id, amount: Number(t.amount), 
            entity: customers.find(c => c.id === t.customerId)?.name || 'Walk-in Client',
            description: t.type === 'SALE' ? 'Sales Cheque Maturity' : 'Credit Settlement Receipt', 
            date: t.chequeDate, source: 'SALES_HISTORY'
          });
        } else if (t.type === 'PURCHASE' || t.type === 'EXPENSE' || (t.type === 'CREDIT_PAYMENT' && t.vendorId)) {
          events.push({ 
            type: 'CHEQUE_OUT', ref: t.id, amount: Number(t.amount), 
            entity: vendors.find(v => v.id === t.vendorId)?.name || 'Payee',
            description: t.type === 'EXPENSE' ? 'Overhead Maturity' : 'Settlement Maturity', 
            date: t.chequeDate, source: 'FINANCE'
          });
        }
      }
    });

    if (purchaseOrders) {
      purchaseOrders.forEach(po => {
        if (po.status !== 'RECEIVED' && po.paymentMethod === 'CHEQUE' && po.chequeDate && po.chequeDate >= today) {
          events.push({ 
            type: 'CHEQUE_OUT', ref: po.id, amount: Number(po.totalAmount), 
            entity: vendors.find(v => v.id === po.vendorId)?.name || 'Supplier',
            description: 'Inventory Purchase Cheque', date: po.chequeDate, source: 'PURCHASES'
          });
        }
      });
    }

    const sorted = events.sort((a, b) => a.date.localeCompare(b.date));
    const totalIn = sorted.filter(e => e.type === 'CHEQUE_IN').reduce((a, b) => a + b.amount, 0);
    const totalOut = sorted.filter(e => e.type === 'CHEQUE_OUT').reduce((a, b) => a + b.amount, 0);
    return { list: sorted.slice(0, 10), totalIn, totalOut };
  }, [transactions, purchaseOrders, vendors, customers]);

  const stockAlerts = useMemo(() => 
    products.filter(p => p.stock <= p.lowStockThreshold).sort((a, b) => a.stock - b.stock)
  , [products]);

  const salesTrend = useMemo(() => {
    const daily: Record<string, number> = {};
    const last7Days = Array.from({length: 7}, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - i);
      return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
    }).reverse();

    last7Days.forEach(day => daily[day] = 0);
    transactions.filter(t => t.type && t.type.toUpperCase() === 'SALE').forEach(t => {
      const d = new Date(t.date).toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
      if (daily[d] !== undefined) daily[d] += Number(t.amount);
    });
    return Object.entries(daily).map(([date, amount]) => ({ date, amount }));
  }, [transactions]);

  // Top 5 Categories and Items by revenue (net of line discounts) and profit contribution
  const { topCategories, topItems, topProfitItems } = useMemo(() => {
    const categoryTotals: Record<string, { name: string; revenue: number; qty: number }> = {};
    const itemTotals: Record<string, { name: string; revenue: number; qty: number }> = {};
    const itemProfitTotals: Record<string, { name: string; profit: number; revenue: number; qty: number }> = {};

    transactions
      .filter(t => t.type && t.type.toUpperCase() === 'SALE')
      .forEach(t => {
        (t.items || []).forEach(item => {
          const product = products.find(p => p.id === item.productId);
          if (!product) return;

          const lineGross = Number(item.price || 0) * Number(item.quantity || 0);
          const lineDiscount = item.discountType === 'PCT' ? (lineGross * Number(item.discount || 0)) / 100 : Number(item.discount || 0);
          const lineNet = Math.max(0, lineGross - lineDiscount);
          const lineQty = Number(item.quantity || 0);
          const lineCost = Number(product.cost || 0) * lineQty;
          const lineProfit = lineNet - lineCost;

          // Item aggregation
          if (!itemTotals[product.id]) {
            itemTotals[product.id] = { name: product.name || 'Item', revenue: 0, qty: 0 };
          }
          itemTotals[product.id].revenue += lineNet;
          itemTotals[product.id].qty += lineQty;

          // Item profit aggregation
          if (!itemProfitTotals[product.id]) {
            itemProfitTotals[product.id] = { name: product.name || 'Item', profit: 0, revenue: 0, qty: 0 };
          }
          itemProfitTotals[product.id].profit += lineProfit;
          itemProfitTotals[product.id].revenue += lineNet;
          itemProfitTotals[product.id].qty += lineQty;

          // Category aggregation
          const catId = product.categoryId || 'uncat';
          const catName = categories.find(c => c.id === catId)?.name || 'Uncategorized';
          if (!categoryTotals[catId]) {
            categoryTotals[catId] = { name: catName, revenue: 0, qty: 0 };
          }
          categoryTotals[catId].revenue += lineNet;
          categoryTotals[catId].qty += lineQty;
        });
      });

    const sortedCats = Object.values(categoryTotals).sort((a, b) => b.revenue - a.revenue).slice(0, 5);
    const sortedItems = Object.values(itemTotals).sort((a, b) => b.revenue - a.revenue).slice(0, 5);
      const sortedProfitItems = Object.values(itemProfitTotals).sort((a, b) => b.profit - a.profit).slice(0, 5);
      return { topCategories: sortedCats, topItems: sortedItems, topProfitItems: sortedProfitItems };
  }, [transactions, products, categories]);

  return (
    <div className="space-y-10 animate-in fade-in duration-700 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tighter uppercase">Executive Summary</h1>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mt-1">PERFORMANCE METRICS FOR THE CURRENT CYCLE</p>
        </div>
        <div className="flex gap-4">
          <div className="bg-white px-5 py-2.5 rounded-full border border-slate-100 shadow-sm flex items-center gap-3">
             <div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></div>
             <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">{stockAlerts.length} STOCK ALERTS</span>
          </div>
        </div>
      </div>

      {/* Leaders: Categories & Items */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm p-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Category Performance</p>
              <h3 className="text-xl font-black text-slate-900 tracking-tight">Top 5 Categories</h3>
            </div>
            <span className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">Revenue</span>
          </div>
          <div className="space-y-3">
            {topCategories.length === 0 && (
              <div className="text-center text-slate-400 text-xs font-black uppercase tracking-[0.2em] py-8 border border-dashed border-slate-200 rounded-2xl">No sales data yet</div>
            )}
            {topCategories.map((c, idx) => {
              const max = topCategories[0]?.revenue || 1;
              const pct = Math.round((c.revenue / max) * 100);
              return (
                <div key={idx} className="space-y-1">
                  <div className="flex justify-between text-[11px] font-black text-slate-600 uppercase tracking-widest">
                    <span>{idx + 1}. {c.name}</span>
                    <span className="font-mono text-indigo-600">Rs. {c.revenue.toLocaleString()}</span>
                  </div>
                  <div className="h-3 w-full rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-indigo-500 to-emerald-500" style={{ width: `${pct}%` }}></div>
                  </div>
                  <p className="text-[10px] text-slate-400 font-semibold">Units: {c.qty.toLocaleString()}</p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm p-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Item Leaders</p>
              <h3 className="text-xl font-black text-slate-900 tracking-tight">Top 5 Products</h3>
            </div>
            <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Revenue</span>
          </div>
          <div className="space-y-3">
            {topItems.length === 0 && (
              <div className="text-center text-slate-400 text-xs font-black uppercase tracking-[0.2em] py-8 border border-dashed border-slate-200 rounded-2xl">No sales data yet</div>
            )}
            {topItems.map((it, idx) => {
              const max = topItems[0]?.revenue || 1;
              const pct = Math.round((it.revenue / max) * 100);
              return (
                <div key={idx} className="space-y-1">
                  <div className="flex justify-between text-[11px] font-black text-slate-600 uppercase tracking-widest">
                    <span>{idx + 1}. {it.name}</span>
                    <span className="font-mono text-emerald-600">Rs. {it.revenue.toLocaleString()}</span>
                  </div>
                  <div className="h-3 w-full rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-emerald-500 to-indigo-500" style={{ width: `${pct}%` }}></div>
                  </div>
                  <p className="text-[10px] text-slate-400 font-semibold">Units: {it.qty.toLocaleString()}</p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm p-8 lg:col-span-2">
          <div className="flex items-center justify-between mb-6">
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Profit Contribution</p>
              <h3 className="text-xl font-black text-slate-900 tracking-tight">Top 5 Products by Profit</h3>
            </div>
            <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Net Profit</span>
          </div>
          <div className="space-y-3">
            {topProfitItems.length === 0 && (
              <div className="text-center text-slate-400 text-xs font-black uppercase tracking-[0.2em] py-8 border border-dashed border-slate-200 rounded-2xl">No sales data yet</div>
            )}
            {topProfitItems.map((it, idx) => {
              const max = topProfitItems[0]?.profit || 1;
              const pct = Math.round((it.profit / max) * 100);
              return (
                <div key={idx} className="space-y-1">
                  <div className="flex justify-between text-[11px] font-black text-slate-600 uppercase tracking-widest">
                    <span>{idx + 1}. {it.name}</span>
                    <span className="font-mono text-emerald-700">Rs. {it.profit.toLocaleString()}</span>
                  </div>
                  <div className="h-3 w-full rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-emerald-500 to-amber-500" style={{ width: `${pct}%` }}></div>
                  </div>
                  <p className="text-[10px] text-slate-400 font-semibold">Units: {it.qty.toLocaleString()} · Revenue: Rs. {it.revenue.toLocaleString()}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* KPI GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
        {[
          { label: "Sales Revenue", value: stats.todaySalesTotal, extra: `Margin: ${stats.todayMargin.toFixed(1)}%`, sub: 'GROSS', color: 'text-indigo-600', icon: '💰' },
          { label: "Profit", value: stats.todayProfit, sub: 'NET MARGIN', color: 'text-emerald-600', icon: '📈' },
          { label: "Cost of Revenue", value: stats.todayCostOfRevenue, sub: 'COGS', color: 'text-slate-600', icon: '🏷️' },
          { label: 'Asset Value', value: stats.stockValuation, sub: 'INVENTORY', color: 'text-amber-600', icon: '📦' },
        ].map((item, idx) => (
          <div key={idx} className="bg-white p-10 rounded-[2.5rem] border border-slate-50 shadow-sm flex flex-col justify-between hover:shadow-2xl hover:-translate-y-1 transition-all duration-500">
            <div className="flex justify-between items-start mb-8">
               <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center text-xl shadow-inner border border-slate-100/50">{item.icon}</div>
               <span className={`text-[10px] font-black uppercase tracking-widest text-slate-400 opacity-60`}>{item.sub}</span>
            </div>
            <div className="space-y-2">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{item.label}</p>
              <p className={`text-2xl font-black font-mono tracking-tighter ${item.color}`}>
                Rs. {item.value.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </p>
              {item.extra && (
                <p className="text-[10px] font-black uppercase tracking-widest text-emerald-500">
                  {item.extra}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* SCHEDULED EVENTS (ANCHOR SECTION) */}
      <div className="bg-[#0f172a] rounded-[3.5rem] p-12 text-white shadow-2xl relative overflow-hidden border border-white/5 animate-in slide-in-from-top-4 duration-700">
          <div className="absolute top-0 right-0 p-20 opacity-[0.03] text-9xl font-black italic tracking-tighter select-none rotate-12 pointer-events-none">LEDGER</div>
          <div className="relative z-10">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8 mb-12 pb-10 border-b border-white/10">
                <div className="flex items-center gap-6">
                  <div className="w-16 h-16 rounded-2xl bg-indigo-600 flex items-center justify-center text-3xl shadow-2xl shadow-indigo-600/20">📅</div>
                  <div>
                    <h2 className="text-3xl font-black uppercase tracking-tighter leading-none">Scheduled Events</h2>
                    <p className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.4em] mt-3 opacity-60">PROJECTED CHEQUE LIQUIDITY (MATURITY ROADMAP)</p>
                  </div>
                </div>
                <div className="bg-white/5 backdrop-blur-xl px-10 py-5 rounded-3xl border border-white/10 flex gap-12 shadow-inner">
                   <div className="text-center">
                      <p className="text-[9px] font-black uppercase text-emerald-400 mb-2 tracking-widest opacity-80">Scheduled Inflow</p>
                      <p className="text-2xl font-black font-mono">Rs. {upcomingFinancials.totalIn.toLocaleString()}</p>
                   </div>
                   <div className="w-px bg-white/10"></div>
                   <div className="text-center">
                      <p className="text-[9px] font-black uppercase text-rose-400 mb-2 tracking-widest opacity-80">Scheduled Outflow</p>
                      <p className="text-2xl font-black font-mono">Rs. {upcomingFinancials.totalOut.toLocaleString()}</p>
                   </div>
                </div>
              </div>
              
              <div className="space-y-2">
                {upcomingFinancials.list.length > 0 ? (
                  <>
                    <div className="grid grid-cols-12 gap-6 px-10 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-white/30 border-b border-white/5 mb-4">
                       <div className="col-span-1 text-center">DIR</div>
                       <div className="col-span-3">ENTITY</div>
                       <div className="col-span-4">DESCRIPTION</div>
                       <div className="col-span-2 text-center">MATURITY</div>
                       <div className="col-span-2 text-right">VALUE (Rs.)</div>
                    </div>
                    {upcomingFinancials.list.map((ev, i) => (
                      <div key={i} className="grid grid-cols-12 gap-6 px-10 py-5 bg-white/5 hover:bg-white/10 border border-white/5 rounded-2xl transition-all items-center group mb-2 backdrop-blur-sm">
                        <div className="col-span-1 flex justify-center">
                           <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-black ${ev.type === 'CHEQUE_IN' ? 'bg-emerald-500/20 text-emerald-500 shadow-lg shadow-emerald-500/10' : 'bg-rose-50 text-rose-500 shadow-lg shadow-rose-500/10'}`}>
                             {ev.type === 'CHEQUE_IN' ? '↙' : '↗'}
                           </span>
                        </div>
                        <div className="col-span-3">
                           <p className="text-sm font-black uppercase truncate text-white tracking-tight">{ev.entity}</p>
                           <p className="text-[9px] font-bold text-slate-500 font-mono tracking-widest opacity-60">{ev.ref}</p>
                        </div>
                        <div className="col-span-4">
                           <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest opacity-80">{ev.description}</p>
                        </div>
                        <div className="col-span-2 text-center">
                           <span className="text-[10px] font-black text-indigo-300 font-mono bg-indigo-500/20 px-4 py-1.5 rounded-lg border border-indigo-500/20">{ev.date}</span>
                        </div>
                        <div className="col-span-2 text-right">
                           <p className={`text-xl font-black font-mono tracking-tighter ${ev.type === 'CHEQUE_IN' ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {ev.amount.toLocaleString()}
                           </p>
                        </div>
                      </div>
                    ))}
                  </>
                ) : (
                  <div className="py-24 text-center bg-white/5 rounded-[3rem] border border-white/5 border-dashed">
                     <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.5em] italic">No active ledger events for the upcoming cycle</p>
                  </div>
                )}
              </div>
          </div>
      </div>

      {/* STOCK ALERT (PROFESSIONAL GRADIENT SECTION) */}
      {stockAlerts.length > 0 && (
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
                  <div className="flex justify-between items-end border-t border-white/10 pt-6">
                    <div>
                      <p className="text-[9px] font-black text-rose-200 uppercase tracking-widest opacity-60">Available</p>
                      <p className="text-2xl font-black font-mono">{p.stock}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[9px] font-black text-rose-200 uppercase tracking-widest opacity-60">Threshold</p>
                      <p className="text-sm font-black text-rose-200">{p.lowStockThreshold}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {stockAlerts.length > 4 && (
              <div className="mt-10 text-center">
                <button onClick={() => onNavigate('INVENTORY')} className="text-[10px] font-black uppercase tracking-[0.4em] text-rose-100 hover:text-white transition-all underline underline-offset-8">VIEW ALL {stockAlerts.length} ALERTS IN MASTER CATALOG</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TREND ANALYSIS */}
      <div className="bg-white p-12 rounded-[3.5rem] border border-slate-50 shadow-sm">
          <div className="flex justify-between items-center mb-12">
              <div className="flex items-center gap-6">
                  <div className="w-14 h-14 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center text-3xl shadow-inner border border-indigo-100/50">📈</div>
                  <div>
                      <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">REVENUE VELOCITY</h3>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mt-1">LAST 7 DAYS PERFORMANCE</p>
                  </div>
              </div>
          </div>
          <div className="h-[400px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={salesTrend}>
                      <defs>
                          <linearGradient id="colorAmt" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#6366f1" stopOpacity={0.15}/>
                              <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                          </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeights: 900, fill: '#94a3b8', letterSpacing: '1px'}} dy={15} />
                      <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeights: 900, fill: '#94a3b8'}} tickFormatter={(val) => `Rs.${val/1000}k`} />
                      <Tooltip 
                          contentStyle={{borderRadius: '1.5rem', border: 'none', boxShadow: '0 25px 50px -12px rgb(0 0 0 / 0.15)', fontWeights: 900, fontSize: '11px', textTransform: 'uppercase'}}
                          itemStyle={{color: '#6366f1', fontWeights: 900}}
                      />
                      <Area type="monotone" dataKey="amount" stroke="#6366f1" strokeWidth={5} fillOpacity={1} fill="url(#colorAmt)" dot={{ r: 6, fill: '#6366f1', strokeWidth: 3, stroke: '#fff' }} activeDot={{ r: 10, strokeWidth: 0 }} />
                  </AreaChart>
              </ResponsiveContainer>
          </div>
      </div>
    </div>
  );
};

export default Dashboard;
