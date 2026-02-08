import React, { useState, useMemo, useEffect } from 'react';
import { Transaction, Product, Customer, UserProfile, BankAccount, DaySession, Category } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList } from 'recharts';
import { getBackendURL } from '../services/config';
import { formatDateTime, formatDate } from '../utils/dateFormatter';
import * as XLSX from 'xlsx';

interface SalesHistoryProps {
  transactions: Transaction[];
  products: Product[];
  customers: Customer[];
  categories: Category[];
  userProfile: UserProfile;
  accounts: BankAccount[];
  daySessions: DaySession[];
  onUpdateTransaction: (tx: Transaction) => void;
  onDeleteTransaction: (id: string) => void;
  jumpTarget?: { type: 'PO' | 'CUSTOMER' | 'VENDOR' | 'SALE'; id: string } | null;
  clearJump?: () => void;
  onResumeDraft?: (tx: Transaction) => void;
}

const SalesHistory: React.FC<SalesHistoryProps> = ({
  transactions = [],
  products = [],
  customers = [],
  categories = [],
  userProfile,
  accounts = [],
  daySessions = [],
  onUpdateTransaction,
  onDeleteTransaction,
  jumpTarget,
  clearJump,
  onResumeDraft
}) => {
  const getTodayLocal = () => {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };

  const today = getTodayLocal();

  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState(today); // Defaulted to today
  const [endDate, setEndDate] = useState(today);
  const [activeTab, setActiveTab] = useState<'ALL' | 'PAID' | 'DUE' | 'DRAFTS'>('ALL');

  // Special handling for salesprasama@gmail.com - default to ALL TERMINALS
  const getDefaultCashierFilter = () => {
    const userEmail = userProfile.email || userProfile.loginUsername || '';
    if (userEmail.toLowerCase() === 'salesprasama@gmail.com') {
      return 'ALL';
    }
    return userProfile.branch || 'ALL';
  };

  const [cashierFilter, setCashierFilter] = useState<'ALL' | string>(getDefaultCashierFilter());

  // Sync filter with global branch selection (except for salesprasama@gmail.com)
  useEffect(() => {
    const userEmail = userProfile.email || userProfile.loginUsername || '';
    if (userEmail.toLowerCase() !== 'salesprasama@gmail.com' && userProfile.branch) {
      setCashierFilter(userProfile.branch);
    }
  }, [userProfile.branch, userProfile.email, userProfile.loginUsername]);

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [tempItems, setTempItems] = useState<{ productId: string; quantity: number; price: number; discount?: number }[]>([]);
  const [tempTotal, setTempTotal] = useState(0);

  const [showItemPicker, setShowItemPicker] = useState(false);
  const [itemSearch, setItemSearch] = useState('');

  // Jump Target Effect
  useEffect(() => {
    if (jumpTarget && jumpTarget.type === 'SALE') {
      const tx = transactions.find(t => t.id === jumpTarget.id);
      if (tx) {
        setSearchTerm(tx.id);
        setEditingTx(tx);
        setIsEditModalOpen(true);
      }
      clearJump?.();
    }
  }, [jumpTarget, transactions, clearJump]);

  useEffect(() => {
    if (editingTx) {
      setTempItems(editingTx.items || []);
      setTempTotal(editingTx.amount);
    }
  }, [editingTx]);

  const ledgerEntries = useMemo(() => {
    if (!Array.isArray(transactions)) return [];
    return transactions.filter(t => t && (t.type === 'SALE' || t.type === 'CREDIT_PAYMENT' || t.type === 'SALE_HISTORY_IMPORT'));
  }, [transactions]);

  // ---- HELPER: Normalize Branch ----
  const normalizeBranch = (b?: string): string => {
    if (!b) return 'CASHIER 1'; // Default undefined to CASHIER 1 for safety? Or stick to strict? 
    // Let's stick to the Dashboard logic exactly, but maybe safer defaults if undefined
    const upper = b.trim().toUpperCase();
    if (upper === 'LOCAL NODE' || upper === 'BOOKSHOP' || upper === 'SHOP 2' || upper === 'MAIN BRANCH' || upper === 'NO 16,KIRULAPANA SUPERMARKET ,COLOMBO 05') {
      return 'CASHIER 1';
    }
    return b;
  };

  const filteredEntries = useMemo(() => {
    return ledgerEntries
      .filter(s => {
        const search = searchTerm.toLowerCase();
        const txId = (s.id || "").toLowerCase();
        const customerName = (customers.find(c => c.id === s.customerId)?.name || "Walk-in").toLowerCase();

        const matchesProduct = s.items?.some(it => {
          const p = products.find(prod => prod.id === it.productId);
          return p?.name.toLowerCase().includes(search);
        }) || false;

        const matchesSearch = !searchTerm || txId.includes(search) || customerName.includes(search) || matchesProduct;

        const txDateStr = typeof s.date === 'string' ? s.date.split('T')[0] : '';
        // If searching specifically for a Jump ID, ignore date filters
        const isJumpSearch = jumpTarget && jumpTarget.id === searchTerm;
        const matchesRange = isJumpSearch || ((!startDate || txDateStr >= startDate) && (!endDate || txDateStr <= endDate));

        const isDue = s.paymentMethod === 'CREDIT';
        const isDraft = s.status === 'DRAFT';

        // NEW FILTER LOGIC:
        // 1. DRAFTS tab shows ONLY drafts.
        // 2. ALL/PAID/DUE tabs shows ONLY posted/completed transactions.
        let matchesTab = false;
        if (activeTab === 'DRAFTS') {
          matchesTab = isDraft;
        } else {
          // If not in Drafts tab, we hide drafts completely
          const baseMatch = !isDraft;
          matchesTab = baseMatch && (activeTab === 'ALL' || (activeTab === 'PAID' && !isDue) || (activeTab === 'DUE' && isDue));
        }

        const sBranch = normalizeBranch(s.branchId);
        const targetFilter = normalizeBranch(cashierFilter);

        // If filter is ALL, match everything. 
        // If filter is specific, match normalized branch.
        const matchesCashier = cashierFilter === 'ALL' || (sBranch === targetFilter);

        return matchesSearch && matchesRange && matchesTab && matchesCashier;
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [ledgerEntries, searchTerm, startDate, endDate, activeTab, products, customers, jumpTarget, cashierFilter]);

  const getCustomerName = (id?: string) => {
    if (!id) return 'Walk-in Customer';
    return customers.find(c => c && c.id === id)?.name || 'Credit Client';
  };

  const handleUpdate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingTx) return;
    const fd = new FormData(e.currentTarget);

    const updated: Transaction = {
      ...editingTx,
      date: new Date(fd.get('date') as string).toISOString(),
      amount: editingTx.type === 'SALE' ? tempTotal : Number(fd.get('amount')),
      description: (fd.get('description') as string).toUpperCase(),
      paymentMethod: fd.get('paymentMethod') as any,
      accountId: fd.get('accountId') as string,
      branchId: fd.get('branchId') as string,
      items: editingTx.type === 'SALE' ? tempItems : undefined
    };

    onUpdateTransaction(updated);
    setIsEditModalOpen(false);
    setEditingTx(null);
  };

  const calculateTempTotal = (items: { productId: string; quantity: number; price: number; discount?: number }[]) => {
    return items.reduce((acc, item) => acc + (Number(item.quantity) * Number(item.price)) - (Number(item.discount) || 0), 0);
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

  const handlePrintReceipt = (tx: Transaction) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    if (tx.type === 'CREDIT_PAYMENT') {
      printWindow.document.write(`
            <html>
                <body onload="window.print(); window.close();" style="font-family: 'JetBrains Mono', monospace; text-align: center; width: 72mm; padding: 4px; box-sizing: border-box; font-size: 9px;">
                     <h3 style="margin: 1px 0; text-transform: uppercase;">${userProfile.companyName || userProfile.name}</h3>
                     ${userProfile.companyAddress ? `<p style="margin: 0 0 2px 0; font-size: 8px;">${userProfile.companyAddress}</p>` : ''}
                    <p style="margin: 1px 0;">CREDIT PAYMENT RECEIPT</p>
                    <div style="border-top: 1px dashed #000; margin: 4px 0;"></div>
                    <p style="text-align: left; margin: 1px 0;">REF: ${tx.id}</p>
                    <p style="text-align: left; margin: 1px 0;">DATE: ${formatDateTime(tx.date)}</p>
                    <p style="text-align: left; margin: 1px 0; font-weight: 800;">CUS: ${getCustomerName(tx.customerId)}</p>
                    <div style="border-top: 1px dashed #000; margin: 4px 0;"></div>
                    <h2 style="margin: 4px 0; font-size: 14px;">Rs. ${Number(tx.amount).toLocaleString()}</h2>
                    <p style="margin: 1px 0; text-align: right; font-weight: 800;">BY: ${tx.paymentMethod}</p>
                    <div style="border-top: 1px dashed #000; margin: 4px 0;"></div>
                    <p style="font-size: 8px; font-weight: 800; margin-top: 8px;">PRASAMA ERP SOLUTIONS</p>
                </body>
            </html>
        `);
      printWindow.document.close();
      return;
    }

    const logoHtml = userProfile.logo
      ? `<div style="text-align: center; margin-bottom: 5px; width: 100%;">
           <img src="${userProfile.logo}" style="max-height: 55px; max-width: 100%; filter: grayscale(100%);" />
         </div>`
      : '';

    const itemsRowsHtml = tx.items?.map((item: any) => {
      const product = products.find(p => p.id === item.productId);
      const rowNet = (item.quantity * item.price) - (item.discount || 0);
      return `
        <tr>
          <td style="padding: 2px 0; font-size: 9px; font-weight: 800; width: 30%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${product?.name || 'Item'}</td>
          <td style="padding: 2px 0; font-size: 9px; font-weight: 800; width: 8%; text-align: center;">${item.quantity}</td>
          <td style="padding: 2px 0; font-size: 9px; font-weight: 800; width: 20%; text-align: right;">${Number(item.price).toLocaleString()}</td>
          <td style="padding: 2px 0; font-size: 9px; font-weight: 800; width: 20%; text-align: right;">-${(item.discount || 0).toLocaleString()}</td>
          <td style="padding: 2px 0; font-size: 9px; font-weight: 800; width: 22%; text-align: right;">${rowNet.toLocaleString()}</td>
        </tr>
      `;
    }).join('');

    const dateStr = formatDate(tx.date);
    const timeStr = new Date(tx.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const grossTotalValue = Number(tx.amount) + Number(tx.discount || 0);

    printWindow.document.write(`
      <html>
        <head>
          <title>RECEIPT - ${tx.id}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700;800&display=swap');
            @page { margin: 0; }
            body { 
                font-family: 'JetBrains Mono', monospace; 
                padding: 0; 
                margin: 0; 
                color: #000; 
                width: 72mm; 
                background: #fff; 
                line-height: 1.1; 
                font-size: 9px;
            }
            .receipt-content { padding: 4px; box-sizing: border-box; width: 72mm; }
            .center { text-align: center; }
            .hr { border-top: 1px dashed #000; margin: 4px 0; }
            .biz-name { font-size: 13px; font-weight: 800; text-transform: uppercase; margin: 1px 0; }
            .biz-sub { font-size: 8px; font-weight: 700; text-transform: uppercase; }
            .meta { font-size: 8px; margin: 4px 0; font-weight: 700; }
            table { width: 100%; border-collapse: collapse; table-layout: fixed; }
            th { border-bottom: 0.5px solid #000; padding-bottom: 2px; }
            .summary-row { display: flex; justify-content: space-between; font-weight: 800; margin: 1px 0; font-size: 9px; }
            .total-row { display: flex; justify-content: space-between; font-size: 14px; font-weight: 800; border-top: 1px solid #000; padding-top: 2px; margin-top: 2px; }
            .footer { text-align: center; font-size: 8px; font-weight: 800; margin-top: 10px; border-top: 0.5px dashed #000; padding-top: 4px; }
          </style>
        </head>
        <body onload="window.print(); window.close();">
          <div class="receipt-content">
            <div class="center">
              ${logoHtml}
              <div class="biz-name">${userProfile.companyName || userProfile.name}</div>
              ${userProfile.companyAddress ? `<div class="biz-sub" style="margin-bottom: 2px;">${userProfile.companyAddress}</div>` : ''}
              <div class="biz-sub">${userProfile.branch}</div>
            </div>
            <div class="hr"></div>
            <div class="meta">
              REF: ${tx.id}<br/>
              DATE: ${dateStr} | TIME: ${timeStr}
            </div>
            <div class="hr"></div>
            <table>
              <thead>
                <tr>
                  <th style="text-align: left; width: 30%;">ITEM</th>
                  <th style="text-align: center; width: 8%;">QTY</th>
                  <th style="text-align: right; width: 20%;">RATE</th>
                  <th style="text-align: right; width: 20%;">DISC</th>
                  <th style="text-align: right; width: 22%;">AMT</th>
                </tr>
              </thead>
              <tbody>
                ${itemsRowsHtml}
              </tbody>
            </table>
            <div class="hr"></div>
            <div class="summary-row">
              <span>GROSS TOTAL:</span>
              <span>${grossTotalValue.toLocaleString()}</span>
            </div>
            ${(tx.discount || 0) > 0 ? `
            <div class="summary-row">
              <span>DISCOUNT:</span>
              <span>-${tx.discount?.toLocaleString()}</span>
            </div>` : ''}
            <div class="total-row">
              <span>NET TOTAL:</span>
              <span>${tx.amount.toLocaleString()}</span>
            </div>
            <div class="hr"></div>
            <div style="font-size: 8px; text-align: right; font-weight: 800;">PAID BY: ${tx.paymentMethod}</div>
            <div class="footer">
                THANK YOU - VISIT AGAIN<br/>
                PRASAMA ERP SOLUTIONS
            </div>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const filteredPickerProducts = useMemo(() => {
    if (!itemSearch.trim()) return [];
    return products.filter(p =>
      p.name.toLowerCase().includes(itemSearch.toLowerCase()) ||
      p.sku.toLowerCase().includes(itemSearch.toLowerCase())
    ).slice(0, 5);
  }, [products, itemSearch]);

  const handleExportExcel = () => {
    // Create product-level detailed export - one row per line item
    const data: any[] = [];

    filteredEntries.forEach(tx => {
      const customerName = getCustomerName(tx.customerId);
      const accountName = accounts.find(a => a.id === tx.accountId)?.name || 'N/A';
      const terminal = normalizeBranch(tx.branchId);
      const txType = tx.status === 'DRAFT' ? 'DRAFT SALE' : tx.type;

      // Base transaction info for all rows
      const baseInfo = {
        'REFERENCE ID': tx.id,
        'DATE & TIME': formatDateTime(tx.date),
        'TYPE': txType,
        'CUSTOMER': customerName,
        'TERMINAL': terminal,
        'PAYMENT METHOD': tx.paymentMethod || 'N/A',
        'ACCOUNT': accountName,
        'USER': tx.userId || 'N/A',
      };

      // If transaction has items (SALE), create one row per line item
      if (tx.items && tx.items.length > 0) {
        tx.items.forEach((item, index) => {
          const product = products.find(p => p.id === item.productId);
          const category = categories.find(c => c.id === product?.categoryId);
          const lineGross = Number(item.quantity) * Number(item.price);
          const lineDiscount = Number(item.discount || 0);
          const lineTotal = lineGross - lineDiscount;

          data.push({
            ...baseInfo,
            'LINE #': index + 1,
            'PRODUCT NAME': product?.name || 'Unknown Product',
            'PRODUCT SKU': product?.sku || 'N/A',
            'CATEGORY': category?.name || 'N/A',
            'QUANTITY': Number(item.quantity),
            'UNIT PRICE (RS)': Number(item.price),
            'LINE GROSS (RS)': lineGross,
            'LINE DISCOUNT (RS)': lineDiscount,
            'LINE TOTAL (RS)': lineTotal,
            'PRODUCT COST (RS)': Number(product?.cost || 0),
            'LINE MARGIN (RS)': lineTotal - (Number(product?.cost || 0) * Number(item.quantity)),
            'TRANSACTION TOTAL (RS)': index === 0 ? Number(tx.amount || 0) : '', // Show total only on first line
            'TX DISCOUNT (RS)': index === 0 ? Number(tx.discount || 0) : '',
            'DESCRIPTION': index === 0 ? (tx.description || '') : ''
          });
        });
      } else {
        // For non-SALE transactions (CREDIT_PAYMENT, EXPENSE, etc.), create single row
        data.push({
          ...baseInfo,
          'LINE #': '',
          'PRODUCT NAME': 'N/A',
          'PRODUCT SKU': 'N/A',
          'CATEGORY': 'N/A',
          'QUANTITY': '',
          'UNIT PRICE (RS)': '',
          'LINE GROSS (RS)': '',
          'LINE DISCOUNT (RS)': '',
          'LINE TOTAL (RS)': '',
          'PRODUCT COST (RS)': '',
          'LINE MARGIN (RS)': '',
          'TRANSACTION TOTAL (RS)': Number(tx.amount || 0),
          'TX DISCOUNT (RS)': Number(tx.discount || 0),
          'DESCRIPTION': tx.description || ''
        });
      }
    });

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Sales Details");

    // Format column widths for better readability
    const widths = [
      { wch: 22 }, // Ref ID
      { wch: 20 }, // Date
      { wch: 15 }, // Type
      { wch: 25 }, // Customer
      { wch: 12 }, // Terminal
      { wch: 15 }, // Payment Method
      { wch: 18 }, // Account
      { wch: 20 }, // User
      { wch: 8 },  // Line #
      { wch: 35 }, // Product Name
      { wch: 15 }, // SKU
      { wch: 15 }, // Category
      { wch: 10 }, // Quantity
      { wch: 12 }, // Unit Price
      { wch: 12 }, // Line Gross
      { wch: 15 }, // Line Discount
      { wch: 12 }, // Line Total
      { wch: 12 }, // Product Cost
      { wch: 12 }, // Line Margin
      { wch: 15 }, // Transaction Total
      { wch: 12 }, // TX Discount
      { wch: 30 }  // Description
    ];
    worksheet['!cols'] = widths;

    XLSX.writeFile(workbook, `PRASAMA_PRODUCT_DETAILS_${startDate}_TO_${endDate}.xlsx`);
  };

  const summaryStats = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    const todaySessionFloat = daySessions
      .filter(s => s.date === todayStr && (cashierFilter === 'ALL' || normalizeBranch(s.branchId) === normalizeBranch(cashierFilter)))
      .reduce((acc, s) => acc + Number(s.openingBalance || 0), 0);
    const openingFloat = todaySessionFloat;

    const rangeEntries = ledgerEntries.filter(s => {
      const txDateStr = typeof s.date === 'string' ? s.date.split('T')[0] : '';
      const matchesDate = (!startDate || txDateStr >= startDate) && (!endDate || txDateStr <= endDate);

      const sBranch = normalizeBranch(s.branchId);
      const targetFilter = normalizeBranch(cashierFilter);
      const matchesCashier = cashierFilter === 'ALL' || sBranch === targetFilter;

      return matchesDate && matchesCashier;
    });

    const costOfRevenue = rangeEntries
      .filter(s => s.type === 'SALE')
      .reduce((acc, t) => {
        const itemsCost = t.items?.reduce((itemAcc, item) => {
          const product = products.find(p => p.id === item.productId);
          return itemAcc + (Number(product?.cost || 0) * Number(item.quantity));
        }, 0) || 0;
        return acc + itemsCost;
      }, 0);

    // Calculate reload sales separately
    const reloadSales = rangeEntries
      .filter(s => s.type === 'SALE' || s.type === 'SALE_HISTORY_IMPORT')
      .reduce((acc, t) => {
        if (!t.items) return acc;
        const reloadAmount = t.items.reduce((itemAcc, item) => {
          const product = products.find(p => p.id === item.productId);
          const category = categories.find(c => c.id === product?.categoryId);
          if (category?.name?.toLowerCase() === 'reload') {
            return itemAcc + (Number(item.quantity) * Number(item.price)) - (Number(item.discount) || 0);
          }
          return itemAcc;
        }, 0);
        return acc + reloadAmount;
      }, 0);

    // Total revenue EXCLUDING reload category
    const totalRevenue = rangeEntries
      .filter(s => s.type === 'SALE' || s.type === 'SALE_HISTORY_IMPORT')
      .reduce((acc, t) => {
        if (!t.items) return acc + Number(t.amount || 0);
        const nonReloadAmount = t.items.reduce((itemAcc, item) => {
          const product = products.find(p => p.id === item.productId);
          const category = categories.find(c => c.id === product?.categoryId);
          if (category?.name?.toLowerCase() !== 'reload') {
            return itemAcc + (Number(item.quantity) * Number(item.price)) - (Number(item.discount) || 0);
          }
          return itemAcc;
        }, 0);
        return acc + nonReloadAmount;
      }, 0);

    const realizedInflow = rangeEntries
      .filter(s => (s.type === 'SALE' && s.paymentMethod !== 'CREDIT') || s.type === 'CREDIT_PAYMENT' || s.type === 'SALE_HISTORY_IMPORT')
      .reduce((a, b) => a + Number(b.amount || 0), 0);

    // Profit = (Revenue - Cost) + 4% of reload sales
    const reloadProfit = reloadSales * 0.04;
    const profit = (totalRevenue - costOfRevenue) + reloadProfit;
    const margin = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0;
    const roi = costOfRevenue > 0 ? (profit / costOfRevenue) * 100 : 0;

    // Real-time Cash Position Calculation for the selected terminal
    const filteredTxs = transactions.filter(t => {
      const isToday = t.date.split('T')[0] === todayStr;
      const sBranch = normalizeBranch(t.branchId);
      const targetFilter = normalizeBranch(cashierFilter);
      const matchesCashier = cashierFilter === 'ALL' || sBranch === targetFilter;
      return isToday && matchesCashier;
    });

    const cashIn = filteredTxs.filter(t =>
      (t.type === 'SALE' || t.type === 'CREDIT_PAYMENT' || (t.type === 'TRANSFER' && t.destinationAccountId === 'cash'))
      && t.paymentMethod === 'CASH'
    ).reduce((acc, t) => acc + Number(t.amount || 0), 0);

    const cashOut = filteredTxs.filter(t =>
      (t.type === 'EXPENSE' || t.type === 'PURCHASE' || (t.type === 'TRANSFER' && t.accountId === 'cash'))
      && t.paymentMethod === 'CASH'
    ).reduce((acc, t) => acc + Number(t.amount || 0), 0);

    const cashPosition = openingFloat + cashIn - cashOut;


    const totalExpenses = rangeEntries
      .filter(s => s.type === 'EXPENSE')
      .reduce((a, b) => a + Number(b.amount || 0), 0);

    const creditDue = rangeEntries
      .filter(s => s.type === 'SALE' && s.paymentMethod === 'CREDIT')
      .reduce((a, b) => a + Number(b.amount || 0), 0);

    // Branch Breakdown
    const branchBreakdown: Record<string, { revenue: number, count: number }> = {};
    rangeEntries.filter(s => s.type === 'SALE' || s.type === 'SALE_HISTORY_IMPORT').forEach(s => {
      const b = normalizeBranch(s.branchId);
      if (!branchBreakdown[b]) branchBreakdown[b] = { revenue: 0, count: 0 };
      branchBreakdown[b].revenue += Number(s.amount || 0);
      branchBreakdown[b].count += 1;
    });

    return {
      costOfRevenue,
      totalRevenue,
      realizedInflow,
      profit,
      margin,
      roi,
      cashPosition,
      totalExpenses,
      creditDue,
      branchBreakdown
    };
  }, [ledgerEntries, transactions, daySessions, startDate, endDate, products, cashierFilter]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">
      <header className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-8">
        <div>
          <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tighter">Transaction Ledger</h2>
          <p className="text-slate-500 font-bold uppercase tracking-widest text-[10px] mt-1">Audit trail & history records</p>
        </div>

        {/* Branch Performance Summary - Bar Chart */}
        <div className="bg-white border border-slate-100 rounded-[2rem] p-8 shadow-sm min-w-[500px] flex-1">
          <p className="text-[12px] font-black text-slate-400 uppercase tracking-widest mb-6">Terminal Performance</p>
          <div className="h-[120px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                layout="vertical"
                data={Object.entries(summaryStats.branchBreakdown || {}).map(([name, stats]: [string, any]) => ({
                  name,
                  revenue: stats.revenue || 0,
                  count: stats.count || 0
                }))}
                margin={{ top: 0, right: 20, left: 10, bottom: 0 }}
              >
                <XAxis type="number" hide />
                <YAxis
                  dataKey="name"
                  type="category"
                  hide
                />
                <Tooltip
                  cursor={{ fill: 'transparent' }}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '10px' }}
                  formatter={(value: number) => [`Rs. ${value.toLocaleString()}`, 'Revenue']}
                />
                <Bar dataKey="revenue" radius={[0, 6, 6, 0]} barSize={28}>
                  {Object.entries(summaryStats.branchBreakdown || {}).map(([branch], index) => (
                    <Cell key={`cell-${index}`} fill={branch === 'CASHIER 2' ? '#f97316' : '#6366f1'} />
                  ))}
                  <LabelList
                    dataKey="name"
                    position="insideLeft"
                    offset={15}
                    style={{ fontSize: '11px', fontWeight: '900', fill: '#ffffff', textTransform: 'uppercase' }}
                  />
                  <LabelList
                    dataKey="revenue"
                    position="insideRight"
                    offset={15}
                    formatter={(value: number) => `Rs. ${Math.round(value).toLocaleString()}`}
                    style={{ fontSize: '12px', fontWeight: '900', fill: '#ffffff' }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </header>

      {/* STRATEGIC SUMMARY CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-7 gap-4">
        <div className="bg-white p-6 rounded-[1.5rem] border border-slate-100 shadow-sm space-y-4">
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Yield %</p>
          <p className="text-2xl font-black text-emerald-600 font-mono tracking-tighter">+{summaryStats.roi.toFixed(1)}%</p>
          <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Return on Cost</p>
        </div>
        <div className="bg-white p-6 rounded-[1.5rem] border border-slate-100 shadow-sm space-y-4">
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Profit</p>
          <p className="text-2xl font-black text-emerald-600 font-mono tracking-tighter">Rs. {Math.round(summaryStats.profit).toLocaleString()}</p>
          <p className="text-[8px] font-black text-emerald-500 uppercase tracking-widest">Margin: +{summaryStats.margin.toFixed(1)}%</p>
        </div>
        <div className="bg-white p-6 rounded-[1.5rem] border border-slate-100 shadow-sm space-y-4">
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Revenue</p>
          <p className="text-2xl font-black text-indigo-600 font-mono tracking-tighter">Rs. {Math.round(summaryStats.totalRevenue).toLocaleString()}</p>
          <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Total Sales</p>
        </div>

        {/* CASH POSITION CARD (REQUESTED) */}
        <div className="bg-white p-6 rounded-[1.5rem] border border-slate-100 shadow-sm space-y-4">
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Cash Position</p>
          <p className={`text-2xl font-black font-mono tracking-tighter ${summaryStats.cashPosition < 0 ? 'text-rose-600' : 'text-slate-900'}`}>
            Rs. {Math.round(summaryStats.cashPosition).toLocaleString()}
          </p>
          <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">In-Drawer Float</p>
        </div>

        <div className="bg-white p-6 rounded-[1.5rem] border border-slate-100 shadow-sm space-y-4">
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Realized Inflow</p>
          <p className="text-2xl font-black text-emerald-600 font-mono tracking-tighter">Rs. {Math.round(summaryStats.realizedInflow).toLocaleString()}</p>
          <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Cash Collected</p>
        </div>

        {/* Expenses KPI */}
        <div className="bg-white p-6 rounded-[1.5rem] border border-slate-100 shadow-sm space-y-4">
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Expenses</p>
          <p className="text-2xl font-black text-rose-500 font-mono tracking-tighter">Rs. {Math.round(summaryStats.totalExpenses).toLocaleString()}</p>
          <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Operational outflow</p>
        </div>

        {/* Credit Due KPI */}
        <div className="bg-white p-6 rounded-[1.5rem] border border-slate-100 shadow-sm space-y-4">
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Pending Credit</p>
          <p className="text-2xl font-black text-amber-500 font-mono tracking-tighter">Rs. {Math.round(summaryStats.creditDue).toLocaleString()}</p>
          <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">To be collected</p>
        </div>
      </div>

      <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200 shadow-inner">
        {[
          { id: 'ALL', label: 'All Sales' },
          { id: 'PAID', label: 'Paid' },
          { id: 'DUE', label: 'Credit' },
          { id: 'DRAFTS', label: 'Drafts' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === tab.id ? 'bg-white text-indigo-600 shadow-md' : 'text-slate-400 hover:text-slate-600'}`}
          >
            {tab.label}
            {tab.id === 'DRAFTS' && ledgerEntries.filter(t => t.status === 'DRAFT').length > 0 && (
              <span className="ml-2 bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded-full text-[8px]">{ledgerEntries.filter(t => t.status === 'DRAFT').length}</span>
            )}
          </button>
        ))}
      </div>

      <div className="flex gap-4 items-center">
        {activeTab === 'DRAFTS' && (
          <button
            onClick={() => {
              if (confirm("Delete ALL draft entries? This cannot be undone.")) {
                ledgerEntries.filter(t => t.status === 'DRAFT').forEach(t => onDeleteTransaction(t.id));
              }
            }}
            className="px-6 py-3 bg-rose-50 border border-rose-100 text-rose-600 rounded-2xl text-[9px] font-black uppercase tracking-widest hover:bg-rose-100 transition-all"
          >
            🗑️ Clear All Drafts
          </button>
        )}
        <button
          onClick={handleExportExcel}
          className="flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all shadow-xl shadow-emerald-500/20 active:scale-95 group"
        >
          <span className="text-lg group-hover:bounce">📥</span>
          DOWNLOAD EXCEL DATA
        </button>
      </div>
      {/* SEARCH & FILTER TERMINAL */}
      <div className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm flex flex-col md:flex-row gap-4 items-center">
        <div className="relative flex-1 w-full">
          <span className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
          <input
            type="text"
            placeholder="Search Reference, Product, or Customer..."
            className="w-full pl-14 pr-6 py-4 rounded-2xl border border-slate-200 outline-none bg-slate-50/50 font-bold text-sm focus:border-indigo-500 transition-all"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex gap-3 w-full md:w-auto">
          <select
            value={cashierFilter}
            onChange={(e) => setCashierFilter(e.target.value)}
            className="px-6 py-4 rounded-2xl border border-slate-200 bg-white text-xs font-black outline-none uppercase cursor-pointer hover:border-indigo-500 transition-all text-indigo-900"
          >
            <option value="ALL">All Terminals</option>
            {userProfile.allBranches && userProfile.allBranches.length > 0 ? (
              userProfile.allBranches.map(b => <option key={b} value={b}>{b}</option>)
            ) : (
              <>
                <option value="CASHIER 1">Cashier 1</option>
                <option value="CASHIER 2">Cashier 2</option>
              </>
            )}
          </select>
          <input type="date" className="px-6 py-4 rounded-2xl border border-slate-200 bg-white text-xs font-black outline-none" value={startDate} onChange={e => setStartDate(e.target.value)} />
          <input type="date" className="px-6 py-4 rounded-2xl border border-slate-200 bg-white text-xs font-black outline-none" value={endDate} onChange={e => setEndDate(e.target.value)} />
          <button onClick={() => { setSearchTerm(''); setStartDate(today); setEndDate(today); setCashierFilter('ALL'); }} className="px-4 py-4 rounded-2xl border border-slate-200 bg-slate-50 text-[10px] font-black uppercase hover:bg-slate-100 transition-all">↺ Reset</button>
        </div>
      </div>

      <div className="bg-white rounded-[2rem] border border-slate-100 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <tbody className="divide-y divide-slate-50 font-medium">
              {filteredEntries.map(tx => {
                const isInflow = tx.type === 'SALE' || tx.type === 'CREDIT_PAYMENT' || (tx.type === 'TRANSFER' && tx.destinationAccountId === 'cash');
                const isOutflow = tx.type === 'EXPENSE' || tx.type === 'PURCHASE' || tx.type === 'REFUND';
                const account = accounts.find(a => a.id === tx.accountId);
                const customerName = getCustomerName(tx.customerId);
                const itemsSummary = tx.items?.map(i => products.find(p => p.id === i.productId)?.name).join(', ').substring(0, 50);

                let description = tx.description;
                if (tx.type === 'SALE') description = `SALE TO ${customerName}`;
                if (tx.type === 'CREDIT_PAYMENT') description = `CREDIT SETTLEMENT: RS. ${Number(tx.amount).toLocaleString()} RECEIVED VIA ${tx.paymentMethod}`;

                return (
                  <tr key={tx.id} className="hover:bg-slate-50 transition-all group align-middle">
                    <td className="px-6 py-4 w-[40%]">
                      <div className="flex flex-col">
                        <span className="font-black text-slate-800 uppercase text-[11px] truncate tracking-tight">{description}</span>
                        <div className="flex items-center gap-2 mt-1">
                          {tx.type === 'SALE' && <span className="text-[9px] font-black text-indigo-500 uppercase tracking-wider">{customerName}</span>}
                          <span className="text-[9px] text-slate-400 font-mono font-bold uppercase tracking-wider border-l border-slate-200 pl-2">{tx.id} | {formatDateTime(tx.date)}</span>
                        </div>
                        {tx.type === 'SALE' && tx.items && (
                          <div className="mt-2.5 space-y-1 border-l-2 border-indigo-50 pl-3">
                            {tx.items.map((it, idx) => {
                              const p = products.find(prod => prod.id === it.productId);
                              return (
                                <div key={idx} className="flex items-center gap-2 text-[9px] font-bold text-slate-500 uppercase leading-none">
                                  <span className="text-[8px] text-indigo-400 font-mono w-4">{it.quantity}x</span>
                                  <span className="truncate max-w-[200px]">{p?.name || 'Unknown Item'}</span>
                                  <span className="text-[8px] text-slate-400 font-mono ml-auto">@ Rs. {Number(it.price).toLocaleString()}</span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </td>

                    <td className="px-4 py-4 w-[15%] text-center">
                      <span className={`px-2 py-1 rounded-md text-[8px] font-black uppercase tracking-widest ${tx.status === 'DRAFT' ? 'bg-amber-100 text-amber-700 border border-amber-200' :
                        tx.type === 'SALE' || tx.type === 'CREDIT_PAYMENT' ? 'bg-emerald-50 text-emerald-600' :
                          tx.type === 'EXPENSE' ? 'bg-rose-50 text-rose-600' : 'bg-slate-100 text-slate-500'
                        }`}>
                        {tx.status === 'DRAFT' ? 'DRAFT SALE' : tx.type}
                      </span>
                    </td>

                    <td className="px-4 py-4 w-[20%]">
                      <div className="flex items-center gap-2 text-slate-500">
                        <span className="text-lg">🏪</span>
                        <span className={`text-[9px] font-black uppercase tracking-wide truncate ${normalizeBranch(tx.branchId) === 'CASHIER 2' ? 'text-orange-600' : ''}`}>{normalizeBranch(tx.branchId)}</span>
                      </div>
                    </td>

                    <td className={`px-6 py-4 w-[15%] text-right font-black font-mono text-[13px] tracking-tight ${isInflow ? 'text-emerald-700' : isOutflow ? 'text-rose-600' : 'text-slate-900'
                      }`}>
                      {isInflow ? '+' : '-'} Rs. {Number(tx.amount || 0).toLocaleString()}
                      {tx.branchId && (
                        <div className="text-[9px] font-black text-slate-300 uppercase tracking-widest mt-1 text-right">
                          {normalizeBranch(tx.branchId)}
                        </div>
                      )}
                    </td>

                    <td className="px-4 py-4 w-[10%] text-right">
                      <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => {
                          if (tx.status === 'DRAFT' && onResumeDraft) {
                            onResumeDraft(tx);
                          } else {
                            setEditingTx(tx); setIsEditModalOpen(true);
                          }
                        }} className="p-2 rounded-lg hover:bg-indigo-50 text-indigo-600 transition-all" title="Edit">✏️</button>
                        <button onClick={() => handlePrintReceipt(tx)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-600 transition-all" title="Print">🖨️</button>
                        <button onClick={() => { if (confirm("Permanently delete this entry?")) onDeleteTransaction(tx.id); }} className="p-2 rounded-lg hover:bg-rose-50 text-rose-600 transition-all" title="Delete">🗑️</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {filteredEntries.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-40 text-center opacity-30">
                    <div className="text-6xl mb-4">📜</div>
                    <p className="text-xs font-black uppercase tracking-[0.4em]">No matching transactions found</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isEditModalOpen && editingTx && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md overflow-y-auto">
          <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-4xl overflow-hidden animate-in zoom-in duration-300 my-10 flex flex-col border border-slate-100">
            <div className="p-10 flex justify-between items-start bg-[#f8fafc]/50">
              <div>
                <h3 className="text-3xl font-black text-slate-900 tracking-tighter mb-1 uppercase">Modify Transaction</h3>
                <p className="text-[11px] font-black text-indigo-500 uppercase tracking-widest">Reference Node: {editingTx.id}</p>
              </div>
              <button onClick={() => { setIsEditModalOpen(false); setEditingTx(null); setShowItemPicker(false); }} className="text-slate-300 hover:text-slate-900 text-5xl transition-colors leading-none">&times;</button>
            </div>

            <form onSubmit={handleUpdate} className="p-10 space-y-8 flex-1 overflow-y-auto">
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

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Source Terminal (Branch)</label>
                  <select name="branchId" className="w-full px-6 py-4 rounded-2xl border border-slate-200 font-black uppercase text-xs bg-white outline-none cursor-pointer focus:border-indigo-500" defaultValue={editingTx.branchId}>
                    {userProfile.allBranches?.map(b => (
                      <option key={b} value={b}>{b}</option>
                    )) || (
                        <>
                          <option value="CASHIER 1">CASHIER 1</option>
                          <option value="CASHIER 2">CASHIER 2</option>
                        </>
                      )}
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
export default SalesHistory;