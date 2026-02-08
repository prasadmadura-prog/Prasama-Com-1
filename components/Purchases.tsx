import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Product, PurchaseOrder, PurchaseOrderItem, POStatus, Vendor, UserProfile, BankAccount, Transaction, Category } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface PurchasesProps {
  products: Product[];
  purchaseOrders: PurchaseOrder[];
  vendors: Vendor[];
  accounts: BankAccount[];
  transactions: Transaction[];
  userProfile: UserProfile;
  categories?: Category[];
  onUpsertPO: (po: PurchaseOrder) => void;
  onReceivePO: (poId: string) => void;
  onUpsertVendor: (vendor: Vendor) => void;
  onPayVendor: (tx: Omit<Transaction, 'id'>) => void;
  onUpdateTransaction?: (tx: Transaction) => void;
  onDeleteTransaction?: (id: string) => void;
  jumpTarget?: { type: 'PO' | 'CUSTOMER' | 'VENDOR' | 'SALE'; id: string } | null;
  clearJump?: () => void;
}

const Purchases: React.FC<PurchasesProps> = ({
  products = [],
  purchaseOrders = [],
  vendors = [],
  accounts = [],
  transactions = [],
  categories = [],
  userProfile,
  onUpsertPO,
  onReceivePO,
  onUpsertVendor,
  onPayVendor,
  onUpdateTransaction,
  onDeleteTransaction,
  jumpTarget,
  clearJump
}) => {
  const [activeTab, setActiveTab] = useState<'POS' | 'VENDORS' | 'SETTLEMENTS' | 'AGING' | 'PERFORMANCE' | 'ANALYTICS'>('POS');
  const [isPOModalOpen, setIsPOModalOpen] = useState(false);
  const [isVendorModalOpen, setIsVendorModalOpen] = useState(false);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [isSettlementModalOpen, setIsSettlementModalOpen] = useState(false);
  const [isEditTxModalOpen, setIsEditTxModalOpen] = useState(false);
  const [vendorLedgerId, setVendorLedgerId] = useState<string | null>(null);

  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null);
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);

  const [vendorId, setVendorId] = useState('');
  const [accountId, setAccountId] = useState('cash');
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'BANK' | 'CARD' | 'CREDIT' | 'CHEQUE'>('BANK');
  const [chequeNumber, setChequeNumber] = useState('');
  const [chequeDate, setChequeDate] = useState(new Date().toISOString().split('T')[0]);
  const [poDate, setPoDate] = useState(new Date().toISOString().split('T')[0]);
  const [poItems, setPoItems] = useState<PurchaseOrderItem[]>([]);

  const [productSearch, setProductSearch] = useState('');
  const [selectedCatId, setSelectedCatId] = useState('All');

  const [settlementAmount, setSettlementAmount] = useState('');
  const [settlementSource, setSettlementSource] = useState('cash');
  const [settlementDate, setSettlementDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedInvoices, setSelectedInvoices] = useState<string[]>([]);

  const [vName, setVName] = useState('');
  const [vContact, setVContact] = useState('');
  const [vEmail, setVEmail] = useState('');
  const [vPhone, setVPhone] = useState('');
  const [vAddress, setVAddress] = useState('');

  const [inModalSettleAmount, setInModalSettleAmount] = useState('');
  const [inModalSettleDate, setInModalSettleDate] = useState(new Date().toISOString().split('T')[0]);
  const [poSearch, setPoSearch] = useState('');
  const [vendorSearch, setVendorSearch] = useState('');

  // Auto-save logic
  const [syncStatus, setSyncStatus] = useState<'IDLE' | 'SAVING' | 'SYNCED'>('IDLE');
  const [currentPOId, setCurrentPOId] = useState<string | null>(null);
  const autoSaveTimerRef = useRef<number | null>(null);

  // Jump Target Effect
  useEffect(() => {
    if (jumpTarget) {
      if (jumpTarget.type === 'PO') {
        const po = purchaseOrders.find(p => p.id === jumpTarget.id);
        if (po) {
          setActiveTab('POS');
          openPOModal(po);
        }
      } else if (jumpTarget.type === 'VENDOR') {
        const vendor = vendors.find(v => v.id === jumpTarget.id);
        if (vendor) {
          setActiveTab('VENDORS');
          setVendorLedgerId(vendor.id);
        }
      }
      clearJump?.();
    }
  }, [jumpTarget, purchaseOrders, vendors, clearJump]);

  const getVendorName = (id?: string) => {
    if (!id) return 'UNKNOWN VENDOR';
    const v = vendors.find(ven => ven.id.trim().toUpperCase() === id.trim().toUpperCase());
    return v ? v.name : 'UNKNOWN VENDOR';
  };

  const sortedProducts = useMemo(() => {
    return [...products].sort((a, b) => a.name.localeCompare(b.name));
  }, [products]);

  // Sort POs by date descending (latest at top) and filter by search
  const filteredPOs = useMemo(() => {
    let list = [...purchaseOrders];
    if (poSearch) {
      const q = poSearch.toLowerCase();
      list = list.filter(po => {
        const vName = getVendorName(po.vendorId).toLowerCase();
        return po.id.toLowerCase().includes(q) || vName.includes(q);
      });
    }
    return list.sort((a, b) => b.date.localeCompare(a.date));
  }, [purchaseOrders, poSearch, vendors]);

  const filteredPickerProducts = useMemo(() => {
    return sortedProducts.filter(p => {
      const matchesSearch = p.name.toLowerCase().includes(productSearch.toLowerCase()) || p.sku.toLowerCase().includes(productSearch.toLowerCase());
      const matchesCat = selectedCatId === 'All' || p.categoryId === selectedCatId;
      return matchesSearch && matchesCat;
    });
  }, [sortedProducts, productSearch, selectedCatId]);

  const totalAmount = useMemo(() =>
    poItems.reduce((sum, item) => sum + (item.quantity * (item.cost || 0)), 0)
    , [poItems]);

  // Auto-save effect
  useEffect(() => {
    if (!isPOModalOpen || !currentPOId || poItems.length === 0) return;

    setSyncStatus('SAVING');
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);

    autoSaveTimerRef.current = window.setTimeout(() => {
      const currentPOStatus = selectedPO?.status || 'DRAFT';
      onUpsertPO({
        id: currentPOId,
        date: new Date(poDate).toISOString(),
        vendorId,
        items: poItems,
        status: currentPOStatus,
        totalAmount,
        paymentMethod,
        accountId: (paymentMethod === 'BANK' || paymentMethod === 'CHEQUE' || paymentMethod === 'CARD') ? accountId : 'cash',
        ...(paymentMethod === 'CHEQUE' && { chequeNumber, chequeDate }),
      });
      setSyncStatus('SYNCED');
    }, 1200);

    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [poItems, vendorId, poDate, paymentMethod, accountId, chequeNumber, chequeDate, isPOModalOpen, currentPOId, selectedPO]);

  // Financial tracking for current PO
  const poFinancials = useMemo(() => {
    const linked = selectedPO
      ? transactions.filter(t => t.vendorId === selectedPO.vendorId && (t.description?.includes(selectedPO.id) || t.id.includes(selectedPO.id)))
      : [];
    const paid = linked
      .filter(t => t.type === 'CREDIT_PAYMENT' || (t.type === 'PURCHASE' && t.paymentMethod !== 'CREDIT'))
      .reduce((acc, t) => acc + Number(t.amount || 0), 0);
    return {
      totalPaid: paid,
      balance: Math.max(0, totalAmount - paid),
      linkedTxs: linked.sort((a, b) => b.date.localeCompare(a.date))
    };
  }, [selectedPO, transactions, totalAmount]);



  const agingReport = useMemo(() => {
    const report: Record<string, { vendorName: string, balance: number, buckets: number[] }> = {};
    const now = new Date();

    vendors.forEach(v => {
      if (Number(v.totalBalance || 0) > 0) {
        report[v.id] = { vendorName: v.name, balance: Number(v.totalBalance), buckets: [0, 0, 0, 0] };

        const credits = transactions
          .filter(t => t.vendorId === v.id && t.type === 'PURCHASE' && t.paymentMethod === 'CREDIT')
          .sort((a, b) => b.date.localeCompare(a.date));

        let remainingBalance = Number(v.totalBalance);

        credits.forEach(c => {
          if (remainingBalance <= 0) return;
          const amountToApply = Math.min(remainingBalance, Number(c.amount));
          const diffDays = Math.floor((now.getTime() - new Date(c.date).getTime()) / (1000 * 3600 * 24));

          if (diffDays <= 30) report[v.id].buckets[0] += amountToApply;
          else if (diffDays <= 60) report[v.id].buckets[1] += amountToApply;
          else if (diffDays <= 90) report[v.id].buckets[2] += amountToApply;
          else report[v.id].buckets[3] += amountToApply;

          remainingBalance -= amountToApply;
        });

        if (remainingBalance > 0) {
          report[v.id].buckets[3] += remainingBalance;
        }
      }
    });

    const list = Object.values(report);
    const summary = [
      { name: '0-30 Days', value: list.reduce((a, b) => a + b.buckets[0], 0), color: '#6366f1' },
      { name: '31-60 Days', value: list.reduce((a, b) => a + b.buckets[1], 0), color: '#f59e0b' },
      { name: '61-90 Days', value: list.reduce((a, b) => a + b.buckets[2], 0), color: '#f97316' },
      { name: '90+ Days', value: list.reduce((a, b) => a + b.buckets[3], 0), color: '#ef4444' },
    ];

    return { list, summary };
  }, [vendors, transactions]);

  const outstandingInvoices = useMemo(() => {
    if (!selectedVendor) return [];
    return purchaseOrders.filter(po => {
      if (po.vendorId !== selectedVendor.id) return false;
      const linkedPayments = transactions
        .filter(t => t.vendorId === po.vendorId && (t.description?.includes(po.id) || t.id.includes(po.id)))
        .filter(t => t.type === 'CREDIT_PAYMENT' || (t.type === 'PURCHASE' && t.paymentMethod !== 'CREDIT'));
      const totalPaid = linkedPayments.reduce((acc, curr) => acc + Number(curr.amount || 0), 0);
      return Number(po.totalAmount) - totalPaid > 0.01;
    });
  }, [selectedVendor, purchaseOrders, transactions]);

  const vendorLedgerData = useMemo(() => {
    if (!vendorLedgerId) return null;
    const vendor = vendors.find(v => v.id === vendorLedgerId);
    if (!vendor) return null;

    const pos = purchaseOrders.filter(p => p.vendorId === vendorLedgerId);

    // STRATEGIC FIX: Filter out redundant 'Stock Received' transactions (PU- prefix) 
    // to focus solely on the financial PO commitment and Settlements.
    const txs = transactions.filter(t =>
      t.vendorId === vendorLedgerId &&
      (t.type === 'CREDIT_PAYMENT' || (t.type === 'PURCHASE' && !t.id.startsWith('PU-')))
    );

    const stream = [
      ...pos.map(p => ({ ...p, ledgerType: 'PO' as const })),
      ...txs.map(t => ({ ...t, ledgerType: 'TX' as const }))
    ].sort((a, b) => a.date.localeCompare(b.date));

    return { vendor, stream };
  }, [vendorLedgerId, vendors, purchaseOrders, transactions]);

  const handleAddItemToPO = (product: Product) => {
    const existing = poItems.find(i => i.productId === product.id);
    if (existing) {
      setPoItems(poItems.map(i => i.productId === product.id ? { ...i, quantity: i.quantity + 1 } : i));
    } else {
      setPoItems([{ productId: product.id, quantity: 1, cost: product.cost }, ...poItems]);
    }
  };

  const updatePOItem = (index: number, field: keyof PurchaseOrderItem, value: string | number) => {
    const updated = [...poItems];
    updated[index] = { ...updated[index], [field]: Number(value) };
    setPoItems(updated);
  };

  const removePOItem = (index: number) => setPoItems(poItems.filter((_, i) => i !== index));

  const handleSavePO = async (status: POStatus = 'PENDING') => {
    if (!vendorId || poItems.length === 0) { alert("Supplier and Manifest items required."); return; }

    // Cancel any pending auto-save immediately
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }

    // FIX: Ensure we use the correct ID.
    const finalId = selectedPO?.id || currentPOId || `PO-${Date.now()}`;

    // DATE SAFETY: Prevent Invalid Date crash
    let safeDate = new Date().toISOString();
    try {
      if (poDate) safeDate = new Date(poDate).toISOString();
    } catch (e) {
      console.warn("Invalid PO Date, defaulting to now");
    }

    try {
      setSyncStatus('SAVING');
      await onUpsertPO({
        id: finalId,
        date: safeDate,
        vendorId,
        items: poItems.map(i => ({
          productId: i.productId,
          quantity: Number(i.quantity) || 0,
          cost: Number(i.cost) || 0
        })),
        status: status,
        totalAmount: Number(totalAmount) || 0,
        paymentMethod,
        accountId: (paymentMethod === 'BANK' || paymentMethod === 'CHEQUE' || paymentMethod === 'CARD') ? accountId : 'cash',
        ...(paymentMethod === 'CHEQUE' && { chequeNumber, chequeDate }),
        branchId: userProfile.branch
      });
      setSyncStatus('SYNCED');
      closePOModal();
    } catch (error: any) {
      console.error("PO SAVE FAILED:", error);
      alert(`Failed to save Purchase Order. System Error: ${error?.message || 'Unknown Error'}`);
      setSyncStatus('IDLE');
    }
  };

  const openPOModal = (po?: PurchaseOrder) => {
    const idToUse = po?.id || `PO-${Date.now()}`;
    setCurrentPOId(idToUse);
    setSyncStatus('IDLE');

    if (po) {
      setSelectedPO(po);
      setVendorId(po.vendorId);
      setPaymentMethod(po.paymentMethod);
      setAccountId(po.accountId || 'cash');
      setChequeNumber(po.chequeNumber || '');
      setChequeDate(po.chequeDate || new Date().toISOString().split('T')[0]);
      setPoDate(po.date.split('T')[0]);
      setPoItems(po.items);
      setInModalSettleAmount('');
    } else {
      setSelectedPO(null);
      setVendorId('');
      setPaymentMethod('BANK');
      setAccountId(accounts.find(a => a.id !== 'cash')?.id || 'cash');
      setChequeNumber('');
      setChequeDate(new Date().toISOString().split('T')[0]);
      setPoDate(new Date().toISOString().split('T')[0]);
      setPoItems([]);
      setInModalSettleAmount('');
    }
    setIsPOModalOpen(true);
  };

  const closePOModal = () => {
    setIsPOModalOpen(false);
    setSelectedPO(null);
    setCurrentPOId(null);
    setSyncStatus('IDLE');
    setProductSearch('');
    setSelectedCatId('All');
  };

  const handleSaveVendor = (e: React.FormEvent) => {
    e.preventDefault();
    if (!vName) return;
    const newVendorId = selectedVendor?.id || `VEN-${Date.now()}`;
    onUpsertVendor({
      id: newVendorId,
      name: vName.toUpperCase(),
      contactPerson: vContact,
      email: vEmail,
      phone: vPhone,
      address: vAddress,
      totalBalance: selectedVendor?.totalBalance || 0
    });
    if (isPOModalOpen) setVendorId(newVendorId);
    closeVendorModal();
  };

  const openVendorModal = (v?: Vendor) => {
    if (v) {
      setSelectedVendor(v); setVName(v.name); setVContact(v.contactPerson); setVEmail(v.email); setVPhone(v.phone); setVAddress(v.address);
    } else {
      setSelectedVendor(null); setVName(''); setVContact(''); setVEmail(''); setVPhone(''); setVAddress('');
    }
    setIsVendorModalOpen(true);
  };

  const closeVendorModal = () => { setIsVendorModalOpen(false); setSelectedVendor(null); };

  const toggleInvoiceSelection = (id: string, amount: number) => {
    setSelectedInvoices(prev => {
      const has = prev.includes(id);
      const newList = has ? prev.filter(x => x !== id) : [...prev, id];

      const newAmount = newList.reduce((sum, poId) => {
        const po = purchaseOrders.find(x => x.id === poId);
        return sum + (po?.totalAmount || 0);
      }, 0);
      setSettlementAmount(newAmount.toString());

      return newList;
    });
  };

  const handleExecuteSettlement = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVendor || !settlementAmount) return;

    const desc = selectedInvoices.length > 0
      ? `SETTLEMENT FOR: ${selectedInvoices.join(', ')}`
      : `GENERAL SETTLEMENT FOR ${selectedVendor.name}`;

    onPayVendor({
      type: 'CREDIT_PAYMENT',
      amount: parseFloat(settlementAmount),
      paymentMethod: settlementSource === 'cash' ? 'CASH' : 'BANK',
      accountId: settlementSource,
      vendorId: selectedVendor.id,
      description: desc,
      date: new Date(settlementDate).toISOString()
    });
    setIsSettlementModalOpen(false);
    setSelectedVendor(null);
    setSettlementAmount('');
    setSelectedInvoices([]);
  };

  const handleUpdateSettlement = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTx || !onUpdateTransaction) return;
    const fd = new FormData(e.currentTarget as HTMLFormElement);

    const updated: Transaction = {
      ...editingTx,
      amount: parseFloat(fd.get('amount') as string),
      date: new Date(fd.get('date') as string).toISOString(),
      accountId: fd.get('accountId') as string,
      description: (fd.get('description') as string).toUpperCase()
    };

    onUpdateTransaction(updated);
    setIsEditTxModalOpen(false);
    setEditingTx(null);
  };

  const handleInModalSettle = () => {
    if (!selectedPO || !inModalSettleAmount) return;
    onPayVendor({
      type: 'CREDIT_PAYMENT',
      amount: parseFloat(inModalSettleAmount),
      paymentMethod: 'BANK',
      accountId: accounts.find(a => a.id !== 'cash')?.id || 'cash',
      vendorId: selectedPO.vendorId,
      description: `DIRECT SETTLEMENT FOR PO: ${selectedPO.id}`,
      date: new Date(inModalSettleDate).toISOString()
    });
    setInModalSettleAmount('');
  };

  const printPurchaseOrder = (po: PurchaseOrder) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    const vendor = vendors.find(v => v.id === po.vendorId);

    const linkedPayments = transactions
      .filter(t => t.vendorId === po.vendorId && (t.description?.includes(po.id) || t.id.includes(po.id)))
      .filter(t => t.type === 'CREDIT_PAYMENT' || (t.type === 'PURCHASE' && t.paymentMethod !== 'CREDIT'));

    const totalPaidValue = linkedPayments.reduce((acc, curr) => acc + Number(curr.amount || 0), 0);
    const balanceRemaining = Math.max(0, Number(po.totalAmount) - totalPaidValue);

    const itemsHtml = po.items.map((it, idx) => {
      // Robust lookup: Try finding by ID
      const prod = products.find(p => p.id === it.productId);

      // Fallback: If product not found in prop, try local search or show ID to distinguish
      const displayName = prod ? prod.name : (it.productId || 'Unknown Item');
      const displaySku = prod ? prod.sku : 'N/A';

      return `
        <tr>
          <td style="text-align: center; border: none; padding: 12px 14px;">${idx + 1}</td>
          <td style="text-transform: uppercase; font-weight: 800; font-size: 11px; border: none; padding: 12px 14px;">${displayName}</td>
          <td style="font-family: monospace; font-size: 11px; color: #4f46e5; border: none; padding: 12px 14px;">${displaySku}</td>
          <td style="text-align: center; border: none; padding: 12px 14px;">${it.quantity}</td>
          <td style="text-align: right; border: none; padding: 12px 14px;">${Number(it.cost).toLocaleString()}</td>
          <td style="text-align: right; font-weight: 800; border: none; padding: 12px 14px;">${(it.quantity * it.cost).toLocaleString()}</td>
        </tr>
      `;
    }).join('');

    const settlementBreakdownHtml = linkedPayments.length > 0 ? linkedPayments.map(p => `
      <div style="display: flex; justify-content: space-between; font-size: 9px; color: #1e293b; font-weight: 700; padding: 3px 0; border-bottom: 0.5px solid #f1f5f9;">
        <span>${new Date(p.date).toLocaleDateString()} - ${p.paymentMethod} [${p.id}]</span>
        <span style="font-family: 'JetBrains Mono', monospace;">Rs. ${Number(p.amount).toLocaleString()}</span>
      </div>
    `).join('') : '<div style="font-size: 9px; color: #94a3b8; font-style: italic; padding: 5px 0;">No direct payments recorded for this manifest.</div>';

    printWindow.document.write(`
      <html>
        <head>
          <title>PURCHASE MANIFEST - ${po.id}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
            @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@700;800&display=swap');
            body { font-family: 'Inter', sans-serif; padding: 30px; color: #1e293b; max-width: 900px; margin: 0 auto; line-height: 1.4; background: #fff; }
            .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 50px; }
            .title { font-size: 42px; font-weight: 900; color: #1e293b; text-transform: uppercase; margin: 0; letter-spacing: -2px; }
            .biz-head { text-align: right; }
            .biz-head h2 { font-size: 20px; font-weight: 900; margin: 0; color: #0f172a; text-transform: uppercase; }
            .biz-head p { font-size: 11px; color: #64748b; margin: 2px 0; font-weight: 700; }
            
            .meta-bar { display: flex; flex-direction: column; gap: 5px; margin-top: 15px; }
            .meta-bar h4 { font-size: 16px; font-weight: 800; margin: 0; }
            .meta-bar p { font-size: 11px; font-weight: 800; color: #64748b; text-transform: uppercase; margin: 0; }

            .supplier-pipeline { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-bottom: 50px; border-top: 1px solid #f1f5f9; padding-top: 25px; }
            .box h5 { font-size: 10px; font-weight: 800; text-transform: uppercase; color: #94a3b8; margin: 0 0 8px 0; letter-spacing: 0.5px; }
            .box h3 { font-size: 18px; font-weight: 900; color: #0f172a; margin: 0; text-transform: uppercase; }
            .box p { font-size: 12px; color: #64748b; margin: 4px 0; font-weight: 700; }
            
            table { width: 100%; border-collapse: collapse; margin-bottom: 40px; }
            th { text-align: left; padding: 16px 14px; background: #fff; font-size: 10px; font-weight: 900; text-transform: uppercase; color: #1e293b; letter-spacing: 1px; border-bottom: 1.5px solid #e2e8f0; }
            tr:nth-child(even) { background: #fcfcfd; }
            
            .summary-container { display: flex; justify-content: flex-end; margin-top: 20px; }
            .summary { width: 420px; }
            .summary-row { display: flex; justify-content: space-between; align-items: center; padding: 12px 0; font-size: 14px; font-weight: 800; color: #1e293b; }
            .summary-row.sub { padding: 4px 0; font-weight: 700; color: #64748b; }
            
            .breakdown-block { margin: 15px 0; padding: 18px; background: #f8fafc; border-radius: 14px; border: 1.5px solid #f1f5f9; }
            .breakdown-block h6 { font-size: 9px; font-weight: 900; text-transform: uppercase; color: #94a3b8; margin: 0 0 10px 0; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; letter-spacing: 1px; }
            
            .payable-row { display: flex; justify-content: space-between; align-items: baseline; padding: 25px 0; border-top: 2.5px solid #0f172a; margin-top: 15px; }
            .payable-row span:first-child { font-size: 20px; font-weight: 900; color: #0f172a; text-transform: uppercase; letter-spacing: -0.5px; }
            .payable-row span:last-child { font-size: 28px; font-weight: 900; color: #4f46e5; font-family: 'JetBrains Mono', monospace; letter-spacing: -1px; }
            
            .footer { margin-top: 100px; text-align: center; font-size: 11px; color: #94a3b8; border-top: 1px solid #f1f5f9; padding-top: 30px; font-weight: 800; text-transform: uppercase; letter-spacing: 2.5px; }
            @media print { body { padding: 0; } }
          </style>
        </head>
        <body onload="window.print();">
          <div class="header">
            <div>
              <h1 class="title">Purchase Manifest</h1>
              <div class="meta-bar">
                <h4>Ref: ${po.id}</h4>
                <p>STATUS: ${po.status}</p>
              </div>
            </div>
            <div class="biz-head">
              <h2>${userProfile.name}</h2>
              <p>${userProfile.branch}</p>
              <p>Date: ${new Date(po.date).toLocaleDateString()}</p>
            </div>
          </div>

          <div class="supplier-pipeline">
            <div class="box">
              <h5>Supplier Details</h5>
              <h3>${vendor?.name || 'N/A'}</h3>
              <p>PH: ${vendor?.phone || 'N/A'}</p>
            </div>
            <div class="box" style="text-align: right;">
              <h5>Settlement Pipeline</h5>
              <h3 style="color: #4f46e5;">${po.paymentMethod}</h3>
              ${po.chequeNumber ? `<p>CHQ: ${po.chequeNumber}</p>` : ''}
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th style="width: 40px; text-align: center;">#</th>
                <th>Description</th>
                <th>SKU</th>
                <th style="text-align: center; width: 60px;">Qty</th>
                <th style="text-align: right; width: 100px;">Cost</th>
                <th style="text-align: right; width: 130px;">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>

          <div class="summary-container">
            <div class="summary">
              <div class="summary-row">
                <span>Manifest Total</span>
                <span style="font-family: 'JetBrains Mono', monospace;">Rs. ${Number(po.totalAmount).toLocaleString()}</span>
              </div>
              
              <div class="summary-row sub">
                <span>Payment Paid (Aggregate)</span>
                <span style="color: #ef4444; font-family: 'JetBrains Mono', monospace;">- Rs. ${totalPaidValue.toLocaleString()}</span>
              </div>

              <!-- DETAILED BREAKDOWN SECTION -->
              <div class="breakdown-block">
                <h6>Detailed Settlement Breakdown</h6>
                ${settlementBreakdownHtml}
              </div>

              <div style="border-top: 1px dashed #e2e8f0; margin: 10px 0;"></div>

              <div class="summary-row">
                <span style="font-size: 12px; color: #64748b;">Net Balance Due</span>
                <span style="font-size: 16px; color: #1e293b; font-family: 'JetBrains Mono', monospace;">Rs. ${balanceRemaining.toLocaleString()}</span>
              </div>

              <div class="payable-row">
                <span>Net Payable</span>
                <span>Rs. ${Number(po.totalAmount).toLocaleString()}</span>
              </div>
            </div>
          </div>

          <div class="footer">PRASAMA ERP SOLUTIONS – INVENTORY INTELLIGENCE CORE</div>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const printVendorStatement = () => {
    if (!vendorLedgerData) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    const { vendor, stream } = vendorLedgerData;

    const rowsHtml = stream.map((item: any) => {
      const isPO = item.ledgerType === 'PO';
      const isCharge = isPO || (item.ledgerType === 'TX' && item.type === 'PURCHASE');
      return `
        <tr>
          <td>${new Date(item.date).toLocaleDateString()}</td>
          <td><span style="font-family: monospace; background: #f1f5f9; padding: 2px 4px; border-radius: 4px;">${item.id}</span></td>
          <td style="text-transform: uppercase; font-size: 11px;">${isPO ? `Purchase Commitment` : item.description}</td>
          <td style="text-align: right; color: ${isCharge ? '#ef4444' : '#64748b'};">${isCharge ? Number(item.totalAmount || item.amount).toLocaleString() : '—'}</td>
          <td style="text-align: right; color: ${!isCharge ? '#10b981' : '#64748b'};">${!isCharge ? Number(item.amount).toLocaleString() : '—'}</td>
        </tr>
      `;
    }).join('');

    printWindow.document.write(`
      <html>
        <head>
          <title>VENDOR STATEMENT - ${vendor.name}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;800&display=swap');
            body { font-family: 'Plus Jakarta Sans', sans-serif; padding: 40px; color: #1e293b; }
            .header { display: flex; justify-content: space-between; border-bottom: 2px solid #4f46e5; padding-bottom: 20px; margin-bottom: 40px; }
            .title { font-size: 24px; font-weight: 800; text-transform: uppercase; }
            table { width: 100%; border-collapse: collapse; }
            th { text-align: left; padding: 12px; background: #f8fafc; font-size: 10px; font-weight: 800; text-transform: uppercase; }
            td { padding: 12px; border-bottom: 1px solid #f1f5f9; font-size: 12px; }
            .summary { background: #f8fafc; padding: 20px; border-radius: 12px; margin-top: 40px; text-align: right; }
          </style>
        </head>
        <body onload="window.print();">
          <div class="header">
            <div><h1 class="title">Supplier Statement</h1><p style="font-weight: 800; text-transform: uppercase;">${vendor.name}</p></div>
            <div style="text-align: right;"><p style="font-weight: 800;">${userProfile.name}</p><p style="font-size: 12px;">As of ${new Date().toLocaleDateString()}</p></div>
          </div>
          <table>
            <thead><tr><th>Date</th><th>Reference</th><th>Narrative</th><th style="text-align: right;">Payable (In)</th><th style="text-align: right;">Settled (Out)</th></tr></thead>
            <tbody>${rowsHtml}</tbody>
          </table>
          <div class="summary">
            <p style="font-size: 10px; font-weight: 800; text-transform: uppercase; color: #94a3b8; margin: 0;">Outstanding Balance</p>
            <p style="font-size: 24px; font-weight: 800; color: #ef4444; margin: 5px 0;">Rs. ${Number(vendor.totalBalance).toLocaleString()}</p>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-black text-slate-900 tracking-tighter uppercase">Supplier Ecosystem</h2>
          <p className="text-slate-500 font-bold uppercase tracking-widest text-[10px]">Accounts Payable & Intake Management</p>
        </div>
        <div className="flex gap-3">
          <div className="bg-slate-100 p-1.5 rounded-[1.2rem] flex shadow-inner border border-slate-200 overflow-x-auto">
            {['POS', 'VENDORS', 'SETTLEMENTS', 'AGING', 'PERFORMANCE', 'ANALYTICS'].map((tab) => (
              <button key={tab} onClick={() => setActiveTab(tab as any)} className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === tab ? 'bg-white text-indigo-600 shadow-sm border border-slate-100' : 'text-slate-400'}`}>{tab}</button>
            ))}
          </div>
          {(activeTab === 'POS' || activeTab === 'VENDORS') && (
            <button onClick={() => activeTab === 'POS' ? openPOModal() : openVendorModal()} className="bg-indigo-600 text-white px-8 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-indigo-600/20 hover:bg-indigo-700 transition-all active:scale-95 whitespace-nowrap">
              + New Entry
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden min-h-[500px] flex flex-col">
        {activeTab === 'POS' && (
          <div className="p-6 border-b border-slate-50 flex items-center gap-4">
            <div className="relative flex-1 max-w-md">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
              <input
                type="text"
                placeholder="SEARCH INVOICE OR VENDOR..."
                className="w-full pl-12 pr-4 py-3 bg-slate-50 border-none rounded-2xl text-[10px] font-black uppercase tracking-widest focus:ring-2 focus:ring-indigo-600/20 transition-all placeholder:text-slate-300"
                value={poSearch}
                onChange={(e) => setPoSearch(e.target.value)}
              />
            </div>
            {poSearch && (
              <button
                onClick={() => setPoSearch('')}
                className="text-[10px] font-black uppercase text-slate-400 hover:text-indigo-600 transition-colors"
              >
                Clear
              </button>
            )}
          </div>
        )}
        {activeTab === 'POS' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-400">
                <tr>
                  <th className="px-8 py-5 font-black uppercase tracking-widest text-[10px]">PO Reference</th>
                  <th className="px-8 py-5 font-black uppercase tracking-widest text-[10px]">Vendor</th>
                  <th className="px-8 py-5 font-black uppercase tracking-widest text-[10px] text-right">Value (Rs.)</th>
                  <th className="px-8 py-5 font-black uppercase tracking-widest text-[10px]">Method</th>
                  <th className="px-8 py-5 font-black uppercase tracking-widest text-[10px]">Status</th>
                  <th className="px-8 py-5 font-black uppercase tracking-widest text-[10px] text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {/* Use filteredPOs instead of sortedPOs */}
                {(filteredPOs || []).map(po => (
                  <tr key={po.id} className="hover:bg-slate-50 transition-colors group">
                    <td className="px-8 py-5">
                      <p className="font-black text-slate-900 text-[10px] opacity-40 uppercase tracking-tighter mb-1">{po.date.split('T')[0]}</p>
                      <p className="font-mono font-black text-indigo-600 underline cursor-pointer" onClick={() => openPOModal(po)}>{po.id}</p>
                    </td>
                    <td className="px-8 py-5">
                      <button
                        onClick={() => setVendorLedgerId(po.vendorId)}
                        className="font-bold text-slate-900 uppercase hover:text-indigo-600 transition-colors underline decoration-slate-200 underline-offset-4"
                      >
                        {getVendorName(po.vendorId)}
                      </button>
                    </td>
                    <td className="px-8 py-5 text-right font-black text-slate-900 font-mono">{Number(po.totalAmount || 0).toLocaleString()}</td>
                    <td className="px-8 py-5">
                      <p className="text-[10px] font-black uppercase text-slate-400">{po.paymentMethod}</p>
                    </td>
                    <td className="px-8 py-5">
                      <span className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest ${po.status === 'RECEIVED' ? 'bg-emerald-100 text-emerald-700' : po.status === 'DRAFT' ? 'bg-slate-100 text-slate-500' : 'bg-amber-100 text-amber-700'}`}>
                        {po.status}
                      </span>
                    </td>
                    <td className="px-8 py-5 text-center">
                      <div className="flex justify-center gap-2">
                        {(po.status === 'PENDING' || po.status === 'DRAFT') && (
                          <button onClick={() => { setSelectedPO(po); setIsReceiptModalOpen(true); }} className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-emerald-700 shadow-md">Receive</button>
                        )}
                        <button onClick={() => printPurchaseOrder(po)} className="p-2 border border-slate-200 rounded-lg hover:bg-white transition-all shadow-sm">🖨️</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {(!filteredPOs || filteredPOs.length === 0) && (
                  <tr>
                    <td colSpan={6} className="px-8 py-20 text-center text-slate-300 font-black uppercase tracking-[0.4em] text-[10px] italic">{poSearch ? 'No matching invoices found' : 'No Purchase Orders Found'}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'VENDORS' && (
          <div className="p-6 border-b border-slate-50 flex items-center gap-4">
            <div className="relative flex-1 max-w-md">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
              <input
                type="text"
                placeholder="SEARCH SUPPLIER NAME..."
                className="w-full pl-12 pr-4 py-3 bg-slate-50 border-none rounded-2xl text-[10px] font-black uppercase tracking-widest focus:ring-2 focus:ring-indigo-600/20 transition-all placeholder:text-slate-300"
                value={vendorSearch}
                onChange={(e) => setVendorSearch(e.target.value)}
              />
            </div>
            {vendorSearch && (
              <button
                onClick={() => setVendorSearch('')}
                className="text-[10px] font-black uppercase text-slate-400 hover:text-indigo-600 transition-colors"
              >
                Clear
              </button>
            )}
          </div>
        )}
        {activeTab === 'VENDORS' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-400">
                <tr>
                  <th className="px-8 py-5 font-black uppercase tracking-widest text-[10px]">Supplier Name</th>
                  <th className="px-8 py-5 font-black uppercase tracking-widest text-[10px] text-right">Balance Due</th>
                  <th className="px-8 py-5 text-center font-black uppercase tracking-widest text-[10px]">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {Array.isArray(vendors) && vendors.length > 0 ? vendors
                  .filter(v => v.name.toLowerCase().includes(vendorSearch.toLowerCase()))
                  .map(v => (
                    <tr key={v.id} className="hover:bg-slate-50 transition-colors font-medium group">
                      <td className="px-8 py-5">
                        <button
                          onClick={() => setVendorLedgerId(v.id)}
                          className="font-black text-slate-900 uppercase hover:text-indigo-600 transition-colors underline decoration-slate-100 underline-offset-8"
                        >
                          {v.name}
                        </button>
                      </td>
                      <td className="px-8 py-5 text-right font-black text-slate-900 font-mono">Rs. {Number(v.totalBalance || 0).toLocaleString()}</td>
                      <td className="px-8 py-5">
                        <div className="flex justify-center gap-3">
                          <button
                            onClick={() => { setSelectedVendor(v); setSelectedInvoices([]); setSettlementAmount(''); setIsSettlementModalOpen(true); }}
                            className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-emerald-700 shadow-lg shadow-emerald-600/10 transition-all"
                          >
                            Authorize Settlement
                          </button>
                          <button onClick={() => openVendorModal(v)} className="p-2 border border-slate-200 rounded-lg hover:bg-white transition-all shadow-sm">✏️</button>
                        </div>
                      </td>
                    </tr>
                  )) : (
                  <tr>
                    <td colSpan={3} className="px-8 py-20 text-center text-slate-300 font-black uppercase tracking-[0.4em] text-[10px] italic">{vendorSearch ? 'No matching suppliers found' : 'No Suppliers Registered'}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'AGING' && (
          <div className="p-10 space-y-12">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-10 items-center">
              <div className="lg:col-span-1 h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={agingReport.summary}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeights: 900, fill: '#94a3b8' }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeights: 900, fill: '#94a3b8' }} />
                    <Tooltip
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', fontSize: '10px', fontWeights: 800 }}
                      cursor={{ fill: '#f8fafc' }}
                    />
                    <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                      {agingReport.summary.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="lg:col-span-2 grid grid-cols-2 md:grid-cols-4 gap-4">
                {agingReport.summary.map((item, i) => (
                  <div key={i} className="bg-slate-50 p-6 rounded-3xl border border-slate-100">
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">{item.name}</p>
                    <p className="text-xl font-black font-mono" style={{ color: item.color }}>Rs. {item.value.toLocaleString()}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-slate-50 rounded-[2.5rem] border border-slate-100 overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead className="bg-white border-b border-slate-100">
                  <tr className="text-[9px] font-black uppercase text-slate-400">
                    <th className="px-8 py-4">Supplier Portfolio</th>
                    <th className="px-8 py-4 text-center">0-30d</th>
                    <th className="px-8 py-4 text-center">31-60d</th>
                    <th className="px-8 py-4 text-center">61-90d</th>
                    <th className="px-8 py-4 text-center">90d+</th>
                    <th className="px-8 py-4 text-right">Total Payable</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {agingReport.list.map((v, i) => (
                    <tr key={i} className="hover:bg-white transition-all">
                      <td className="px-8 py-4 font-black uppercase text-slate-900 text-xs">{v.vendorName}</td>
                      <td className="px-8 py-4 text-center font-mono text-[11px] text-indigo-500 font-bold">{v.buckets[0] > 0 ? v.buckets[0].toLocaleString() : '—'}</td>
                      <td className="px-8 py-4 text-center font-mono text-[11px] text-amber-500 font-bold">{v.buckets[1] > 0 ? v.buckets[1].toLocaleString() : '—'}</td>
                      <td className="px-8 py-4 text-center font-mono text-[11px] text-orange-500 font-bold">{v.buckets[2] > 0 ? v.buckets[2].toLocaleString() : '—'}</td>
                      <td className="px-8 py-4 text-center font-mono text-[11px] text-rose-500 font-bold">{v.buckets[3] > 0 ? v.buckets[3].toLocaleString() : '—'}</td>
                      <td className="px-8 py-4 text-right font-black font-mono text-slate-900">Rs. {v.balance.toLocaleString()}</td>
                    </tr>
                  ))}
                  {agingReport.list.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-8 py-20 text-center text-slate-300 font-black uppercase tracking-widest text-xs italic">Clear Portfolio - No Outstanding Liabilities</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Vendor Specific Ledger Modal */}
      {vendorLedgerId && vendorLedgerData && (
        <div className="fixed inset-0 z-[180] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md">
          <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-6xl overflow-hidden animate-in slide-in-from-bottom-4 duration-300 flex flex-col max-h-[90vh]">
            <div className="p-10 flex justify-between items-center bg-slate-50 border-b border-slate-100">
              <div className="flex items-center gap-6">
                <div className="w-16 h-16 rounded-2xl bg-slate-900 flex items-center justify-center text-3xl shadow-xl">📦</div>
                <div>
                  <h3 className="text-3xl font-black text-slate-900 uppercase tracking-tighter leading-none">{vendorLedgerData.vendor.name}</h3>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mt-3">Strategic Supplier Audit Ledger</p>
                </div>
              </div>
              <div className="flex items-center gap-8">
                <div className="text-right">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Exposure Balance</p>
                  <p className="text-3xl font-black font-mono text-rose-600">Rs. {Number(vendorLedgerData.vendor.totalBalance).toLocaleString()}</p>
                </div>
                <button onClick={() => setVendorLedgerId(null)} className="text-slate-300 hover:text-slate-900 text-6xl leading-none transition-colors">&times;</button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-10 custom-scrollbar">
              <div className="bg-white border border-slate-100 rounded-[2.5rem] overflow-hidden shadow-sm">
                <table className="w-full text-left text-sm border-collapse">
                  <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-400">
                    <tr>
                      <th className="px-8 py-5">Date</th>
                      <th className="px-8 py-5">Reference</th>
                      <th className="px-8 py-5">Operational Details</th>
                      <th className="px-8 py-5 text-right">Inflow (Payable)</th>
                      <th className="px-8 py-5 text-right">Outflow (Settled)</th>
                      <th className="px-8 py-5 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {vendorLedgerData.stream.map((item: any, idx) => (
                      <tr key={idx} className="hover:bg-indigo-50/20 transition-all group">
                        <td className="px-8 py-5">
                          <p className="text-slate-900 font-black text-xs uppercase">{item.date.split('T')[0]}</p>
                        </td>
                        <td className="px-8 py-5">
                          <span className="font-mono text-[10px] font-black bg-slate-900 text-white px-3 py-1.5 rounded-lg tracking-widest uppercase">{item.id}</span>
                        </td>
                        <td className="px-8 py-5">
                          <p className="text-slate-500 text-[11px] font-bold uppercase italic max-w-xs truncate">
                            {item.ledgerType === 'PO' ? `Purchase Commitment` : item.description}
                          </p>
                          <div className="flex gap-2 mt-2">
                            <span className={`text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded border ${item.ledgerType === 'PO' ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-emerald-50 text-emerald-600 border-emerald-100'}`}>
                              {item.ledgerType === 'PO' ? 'PO RECORDED' : 'Settlement Auth'}
                            </span>
                            <span className="text-[8px] font-black uppercase tracking-widest px-2 py-0.5 bg-slate-50 border border-slate-100 rounded text-slate-400">{item.paymentMethod}</span>
                          </div>
                        </td>
                        <td className="px-8 py-5 text-right">
                          {item.ledgerType === 'PO' || (item.ledgerType === 'TX' && item.type === 'PURCHASE') ? (
                            <p className="text-sm font-black font-mono text-rose-600">+{Number(item.totalAmount || item.amount).toLocaleString()}</p>
                          ) : '—'}
                        </td>
                        <td className="px-8 py-5 text-right">
                          {item.ledgerType === 'TX' && item.type === 'CREDIT_PAYMENT' ? (
                            <p className="text-sm font-black font-mono text-emerald-600">-{Number(item.amount).toLocaleString()}</p>
                          ) : '—'}
                        </td>
                        <td className="px-8 py-5 text-center">
                          <div className="flex justify-center gap-2">
                            <button
                              onClick={() => {
                                if (item.ledgerType === 'PO') openPOModal(item);
                                else { setEditingTx(item); setIsEditTxModalOpen(true); }
                              }}
                              className="p-2.5 rounded-xl border border-slate-200 bg-white hover:border-indigo-600 hover:text-indigo-600 transition-all shadow-sm"
                            >✏️</button>
                            {item.ledgerType === 'TX' && (
                              <button onClick={() => { if (confirm("Delete this transaction?")) onDeleteTransaction?.(item.id); }} className="p-2.5 rounded-xl border border-slate-200 bg-white hover:bg-rose-50 hover:text-rose-600 transition-all shadow-sm">🗑️</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="p-8 bg-slate-50 border-t border-slate-100 flex justify-between items-center shrink-0">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] italic">Full Supplier Cycle Transparency Engine</p>
              <div className="flex gap-4">
                <button onClick={printVendorStatement} className="px-8 py-3 bg-white border border-slate-200 rounded-xl font-black text-[10px] uppercase tracking-widest text-slate-500 hover:border-slate-400 transition-all shadow-sm">🖨️ PDF Statement</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PO Terminal Modal */}
      {isPOModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md">
          <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-[95vw] h-[90vh] overflow-hidden animate-in zoom-in duration-300 flex flex-col">
            <div className="p-8 border-b border-slate-100 bg-slate-50 flex justify-between items-center shrink-0">
              <div>
                <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter leading-none">Inventory Intake Terminal</h3>
                <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest mt-2 italic">Ref: {selectedPO?.id || currentPOId || 'New Acquisition'}</p>
              </div>
              <div className="flex items-center gap-4">
                {syncStatus === 'SAVING' && (
                  <div className="flex items-center gap-2 px-4 py-2 bg-indigo-50 rounded-xl">
                    <div className="w-2 h-2 rounded-full bg-indigo-600 animate-ping"></div>
                    <span className="text-[9px] font-black text-indigo-600 uppercase tracking-widest">Syncing Draft...</span>
                  </div>
                )}
                {syncStatus === 'SYNCED' && (
                  <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 rounded-xl">
                    <span className="text-[9px] font-black text-emerald-600 uppercase tracking-widest">✓ Draft Persistent</span>
                  </div>
                )}
                {selectedPO && (
                  <button onClick={() => printPurchaseOrder(selectedPO)} className="px-6 py-2.5 rounded-xl border border-indigo-200 text-indigo-600 font-black text-[10px] uppercase tracking-widest hover:bg-indigo-50 transition-all">🖨️ PDF Manifest</button>
                )}
                <button onClick={closePOModal} className="text-slate-300 hover:text-slate-900 text-5xl leading-none transition-colors">&times;</button>
              </div>
            </div>

            <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">
              <div className="w-full lg:w-[400px] bg-slate-50/50 border-r border-slate-100 p-8 flex flex-col gap-6 overflow-hidden">
                <div className="space-y-4">
                  <div className="flex flex-col gap-3">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">Product Lookup & Search</label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
                      <input
                        className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 bg-white text-xs font-bold outline-none focus:border-indigo-500 shadow-sm"
                        placeholder="SEARCH ITEM FROM LIST..."
                        value={productSearch}
                        onChange={e => setProductSearch(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-3">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">Asset Type (Filter)</label>
                    <select
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-xs font-black uppercase outline-none focus:border-indigo-500 shadow-sm"
                      value={selectedCatId}
                      onChange={e => setSelectedCatId(e.target.value)}
                    >
                      <option value="All">All Categories</option>
                      {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-1.5">
                  {filteredPickerProducts.length > 0 ? filteredPickerProducts.map(p => (
                    <button
                      key={p.id}
                      onClick={() => handleAddItemToPO(p)}
                      className="w-full text-left py-2 px-4 bg-white border border-slate-100 rounded-xl hover:border-indigo-500 hover:shadow-sm transition-all group flex justify-between items-center"
                    >
                      <div className="min-w-0">
                        <p className="text-[11px] font-black text-slate-900 uppercase truncate leading-tight">{p.name}</p>
                        <p className="text-[8px] font-bold text-slate-400 font-mono mt-0.5">{p.sku} | STOCK: {p.stock} | BUY: Rs. {p.cost.toLocaleString()}</p>
                      </div>
                      <span className="text-lg opacity-0 group-hover:opacity-100 transition-opacity text-indigo-600">⊕</span>
                    </button>
                  )) : (
                    <div className="py-20 text-center opacity-30">
                      <p className="text-xs font-black uppercase tracking-widest">No assets found</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex-1 flex flex-col p-8 overflow-hidden">
                <div className="grid grid-cols-3 gap-6 mb-6 shrink-0">
                  <div className="space-y-2">
                    <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">Entry Date</label>
                    <input
                      type="date"
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 font-bold bg-white text-xs outline-none focus:border-indigo-500"
                      value={poDate}
                      onChange={e => setPoDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">Target Supplier</label>
                      <button onClick={() => openVendorModal()} className="text-[9px] font-black text-indigo-600 uppercase tracking-widest hover:underline">+ New Supplier</button>
                    </div>
                    <select value={vendorId} onChange={e => setVendorId(e.target.value)} className="w-full px-4 py-3 rounded-xl border border-slate-200 font-bold bg-white text-xs outline-none focus:border-indigo-500 uppercase">
                      <option value="" disabled>Select Vendor</option>
                      {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">Settlement Pipeline</label>
                    <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value as any)} className="w-full px-4 py-3 rounded-xl border border-slate-200 font-black bg-white text-[10px] outline-none focus:border-indigo-500 uppercase tracking-widest">
                      <option value="BANK">Bank Transfer</option>
                      <option value="CASH">Cash Drawer</option>
                      <option value="CREDIT">Supplier Credit</option>
                      <option value="CHEQUE">Corporate Cheque</option>
                    </select>
                  </div>

                  {(paymentMethod === 'BANK' || paymentMethod === 'CARD' || paymentMethod === 'CHEQUE') && (
                    <div className="space-y-2 animate-in slide-in-from-top-2">
                      <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">Source Account</label>
                      <select value={accountId} onChange={e => setAccountId(e.target.value)} className="w-full px-4 py-3 rounded-xl border border-slate-200 font-bold bg-white text-xs outline-none focus:border-indigo-500 uppercase">
                        {accounts.filter(a => a.id !== 'cash').map(a => (
                          <option key={a.id} value={a.id}>{a.name} - (Rs. {Number(a.balance).toLocaleString()})</option>
                        ))}
                        {accounts.filter(a => a.id !== 'cash').length === 0 && <option value="" disabled>No Bank Accounts Found</option>}
                      </select>
                    </div>
                  )}
                </div>

                {paymentMethod === 'CHEQUE' && (
                  <div className="grid grid-cols-2 gap-4 mb-4 animate-in slide-in-from-top-2">
                    <div className="space-y-1">
                      <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Cheque No</label>
                      <input
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 font-black font-mono text-[10px] outline-none"
                        value={chequeNumber}
                        onChange={(e) => setChequeNumber(e.target.value.toUpperCase())}
                        placeholder="CHQ-0000"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Maturity Date</label>
                      <input
                        type="date"
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 font-bold text-[10px] outline-none"
                        value={chequeDate}
                        onChange={(e) => setChequeDate(e.target.value)}
                      />
                    </div>
                  </div>
                )}

                <div className="flex-1 overflow-hidden border border-slate-100 rounded-[2rem] bg-slate-50/30 flex flex-col">
                  <div className="overflow-x-auto flex-1 custom-scrollbar">
                    <table className="w-full text-left border-collapse">
                      <thead className="sticky top-0 z-20 bg-slate-50 border-b border-slate-100">
                        <tr className="text-[9px] font-black uppercase text-slate-400 tracking-widest">
                          <th className="px-6 py-4 w-12 text-center">#</th>
                          <th className="px-6 py-4">Asset Description</th>
                          <th className="px-6 py-4">SKU</th>
                          <th className="px-6 py-4 w-28 text-right">Unit Cost (Rs.)</th>
                          <th className="px-6 py-4 w-24 text-center">Qty</th>
                          <th className="px-6 py-4 w-24 text-right">Retail</th>
                          <th className="px-6 py-4 w-24 text-right">Est. Profit</th>
                          <th className="px-6 py-4 w-32 text-right">Subtotal</th>
                          <th className="px-6 py-4 w-16 text-center">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white/50">
                        {poItems.map((item, idx) => {
                          const product = products.find(p => p.id === item.productId);
                          const totalCost = item.quantity * item.cost;
                          const totalRetail = item.quantity * Number(product?.price || 0);
                          const profit = totalRetail - totalCost;
                          return (
                            <tr key={idx} className="hover:bg-indigo-50/30 transition-colors group">
                              <td className="px-6 py-3 text-[10px] font-black text-slate-300 text-center">{idx + 1}</td>
                              <td className="px-6 py-3">
                                <p className="text-[11px] font-black text-slate-900 uppercase truncate max-w-[200px] leading-tight">{product?.name || 'Unknown Asset'}</p>
                              </td>
                              <td className="px-6 py-3">
                                <span className="text-[9px] font-black font-mono text-slate-400 bg-slate-50 px-2 py-0.5 rounded-md border border-slate-100 uppercase tracking-tighter">
                                  {product?.sku || 'N/A'}
                                </span>
                              </td>
                              <td className="px-6 py-3">
                                <input
                                  type="number"
                                  value={item.cost}
                                  onChange={e => updatePOItem(idx, 'cost', e.target.value)}
                                  className="w-full px-3 py-1.5 rounded-lg border border-slate-200 font-black font-mono text-[11px] text-indigo-600 text-right bg-white focus:border-indigo-500 transition-all outline-none"
                                />
                              </td>
                              <td className="px-6 py-3">
                                <input
                                  type="number"
                                  value={item.quantity}
                                  onChange={e => updatePOItem(idx, 'quantity', e.target.value)}
                                  className="w-full px-3 py-1.5 rounded-lg border border-slate-200 font-black font-mono text-[11px] text-slate-900 text-center bg-white focus:border-indigo-500 transition-all outline-none"
                                />
                              </td>
                              <td className="px-6 py-3 text-right">
                                <p className="text-[10px] font-bold text-slate-400 font-mono">Rs. {Number(product?.price || 0).toLocaleString()}</p>
                              </td>
                              <td className="px-6 py-3 text-right">
                                <p className={`text-[10px] font-black font-mono ${profit >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                  {profit >= 0 ? '+' : ''}{profit.toLocaleString()}
                                </p>
                              </td>
                              <td className="px-6 py-3 text-right">
                                <p className="text-[11px] font-black font-mono text-slate-900">Rs. {totalCost.toLocaleString()}</p>
                              </td>
                              <td className="px-6 py-3 text-center">
                                <button onClick={() => removePOItem(idx)} className="w-8 h-8 flex items-center justify-center text-rose-300 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all">✕</button>
                              </td>
                            </tr>
                          );
                        })}
                        {poItems.length === 0 && (
                          <tr>
                            <td colSpan={9} className="py-24 text-center">
                              <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.4em] italic leading-relaxed">
                                MANIFEST VOID<br />
                                <span className="tracking-widest opacity-50">Select items from catalog to initialize intake</span>
                              </p>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 pt-6 mt-2 border-t border-slate-100 shrink-0">
                  <div className="space-y-4">
                    {/* Potential Profit Calculation */}
                    {/* Summarized Key Metrics Header */}
                    <div className="flex flex-col gap-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4">
                          <p className="text-[8px] font-black text-emerald-600 uppercase tracking-widest mb-1">Potential Net Profit</p>
                          <p className="text-xl font-black text-emerald-700 font-mono">
                            Rs. {poItems.reduce((acc, item) => {
                              const product = products.find(p => p.id === item.productId);
                              if (!product) return acc;
                              return acc + (item.quantity * (Number(product.price || 0) - item.cost));
                            }, 0).toLocaleString()}
                          </p>
                          <p className="text-[7px] font-bold text-emerald-600 uppercase tracking-wide mt-1">
                            AVG Margin: {totalAmount > 0 ? (((poItems.reduce((acc, item) => {
                              const product = products.find(p => p.id === item.productId);
                              return acc + (item.quantity * Number(product?.price || 0));
                            }, 0) - totalAmount) / totalAmount) * 100).toFixed(1) : 0}%
                          </p>
                        </div>
                        <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4">
                          <p className="text-[8px] font-black text-indigo-600 uppercase tracking-widest mb-1">Total Payload Items</p>
                          <p className="text-xl font-black text-indigo-700 font-mono">{poItems.reduce((acc, item) => acc + Number(item.quantity), 0)} Units</p>
                          <p className="text-[7px] font-bold text-indigo-600 uppercase tracking-wide mt-1">Across {poItems.length} Unique SKUs</p>
                        </div>
                      </div>
                    </div>
                    <div className="flex justify-between items-end">
                      <div>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Manifest Value</p>
                        <p className="text-3xl font-black text-slate-900 font-mono tracking-tighter leading-none">Rs. {totalAmount.toLocaleString()}</p>
                      </div>
                      <div className="flex gap-3">
                        <button onClick={() => handleSavePO('DRAFT')} className="px-6 py-3 rounded-2xl border border-slate-200 font-black text-slate-400 uppercase tracking-widest text-[9px] hover:bg-slate-50 transition-all">Draft</button>
                        <button onClick={() => handleSavePO('PENDING')} className="px-8 py-3 rounded-2xl bg-slate-900 text-white font-black uppercase tracking-widest text-[9px] shadow-xl hover:bg-black transition-all active:scale-95">Commit PO</button>
                      </div>
                    </div>
                  </div>

                  {selectedPO && (
                    <div className="bg-slate-900 rounded-[2rem] p-6 text-white shadow-2xl relative overflow-hidden flex flex-col h-[220px]">
                      <div className="flex justify-between items-start mb-2 relative z-10 shrink-0">
                        <div>
                          <h4 className="text-[9px] font-black uppercase tracking-widest text-slate-400">Financial History</h4>
                          <div className="flex items-center gap-2 mt-1">
                            <p className="text-[10px] font-black text-rose-500 uppercase tracking-widest">Balance Pending:</p>
                            <p className="text-[12px] font-black font-mono text-white">Rs. {poFinancials.balance.toLocaleString()}</p>
                          </div>
                        </div>
                        <span className={`text-[8px] font-black px-2 py-0.5 rounded ${poFinancials.balance <= 0.01 ? 'bg-emerald-600 text-white' : 'bg-amber-600 text-white'}`}>
                          {poFinancials.balance <= 0.01 ? 'SETTLED' : 'PARTIAL'}
                        </span>
                      </div>

                      <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-2 relative z-10 my-2">
                        {poFinancials.linkedTxs.length > 0 ? poFinancials.linkedTxs.map(tx => {
                          const isSettlement = tx.type === 'CREDIT_PAYMENT' || (tx.type === 'PURCHASE' && tx.paymentMethod !== 'CREDIT');
                          return (
                            <div key={tx.id} className="bg-white/5 p-3 rounded-xl border border-white/5 flex justify-between items-center text-[10px] hover:bg-white/10 transition-colors">
                              <div className="min-w-0">
                                <p className="font-black text-white">{new Date(tx.date).toLocaleDateString()}</p>
                                <div className="flex items-center gap-2">
                                  <span className={`text-[7px] font-black px-1 py-0.5 rounded uppercase ${isSettlement ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                                    {isSettlement ? 'PAYMENT' : 'BILL'}
                                  </span>
                                  <p className="text-[8px] text-slate-500 uppercase truncate">{tx.paymentMethod} • {tx.id}</p>
                                </div>
                              </div>
                              <p className={`font-mono font-black ${isSettlement ? 'text-emerald-400' : 'text-rose-400'}`}>Rs. {tx.amount.toLocaleString()}</p>
                            </div>
                          );
                        }) : (
                          <div className="h-full flex items-center justify-center">
                            <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest italic opacity-50">No linked records found</p>
                          </div>
                        )}
                      </div>

                      <div className="mt-auto pt-3 border-t border-white/10 flex items-center gap-2 relative z-10 shrink-0">
                        <input
                          type="date"
                          className="w-28 bg-white/5 border border-white/10 rounded-xl px-2 py-2 text-[8px] font-black text-slate-300 outline-none focus:border-indigo-500"
                          value={inModalSettleDate}
                          onChange={e => setInModalSettleDate(e.target.value)}
                        />
                        <input
                          type="number"
                          className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-[10px] font-black font-mono text-emerald-400 outline-none focus:border-emerald-500"
                          placeholder="SETTLE AMOUNT..."
                          value={inModalSettleAmount}
                          onChange={e => setInModalSettleAmount(e.target.value)}
                        />
                        <button
                          onClick={handleInModalSettle}
                          className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-emerald-700 active:scale-95 transition-all"
                        >
                          Apply
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Credit Settlement Modal */}
      {isSettlementModalOpen && selectedVendor && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md">
          <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in duration-300">
            <div className="p-10 flex justify-between items-start bg-slate-50 border-b border-slate-100">
              <div className="flex items-center gap-5">
                <div className="w-14 h-14 bg-emerald-600 text-white rounded-2xl flex items-center justify-center text-2xl shadow-xl shadow-emerald-600/20">💸</div>
                <div>
                  <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter leading-none">Vendor Settlement</h3>
                  <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest mt-3">{selectedVendor.name}</p>
                </div>
              </div>
              <button onClick={() => setIsSettlementModalOpen(false)} className="text-slate-300 hover:text-slate-900 text-5xl leading-none">&times;</button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-0">
              <div className="p-10 bg-slate-50/50 border-r border-slate-100 flex flex-col h-full max-h-[500px]">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6 border-b border-slate-100 pb-2">Outstanding Invoices</h4>
                <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                  {outstandingInvoices.length > 0 ? outstandingInvoices.map(po => (
                    <div key={po.id} className="bg-white p-4 rounded-xl border border-slate-100 hover:border-indigo-100 transition-all flex items-center gap-4 group cursor-pointer" onClick={() => toggleInvoiceSelection(po.id, po.totalAmount)}>
                      <div className={`w-5 h-5 rounded border flex items-center justify-center transition-all ${selectedInvoices.includes(po.id) ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-300 bg-white group-hover:border-indigo-400'}`}>
                        {selectedInvoices.includes(po.id) && <span className="text-[10px]">✓</span>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-black uppercase text-slate-900">{po.id}</p>
                        <p className="text-[9px] font-bold text-slate-400 mt-0.5">{po.date.split('T')[0]}</p>
                      </div>
                      <p className="text-[11px] font-black font-mono text-slate-900">Rs. {po.totalAmount.toLocaleString()}</p>
                    </div>
                  )) : (
                    <div className="py-20 text-center text-slate-300 opacity-40">
                      <p className="text-[9px] font-black uppercase italic tracking-widest">No pending credit invoices</p>
                    </div>
                  )}
                </div>
                <div className="pt-6 mt-6 border-t border-slate-100 flex justify-between items-center">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Selected Total</span>
                  <span className="text-sm font-black font-mono text-slate-900">Rs. {Number(settlementAmount || 0).toLocaleString()}</span>
                </div>
              </div>

              <form onSubmit={handleExecuteSettlement} className="p-10 space-y-6">
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Payment Amount (Rs.)</label>
                  <input
                    required type="number" step="0.01" max={selectedVendor.totalBalance}
                    className="w-full px-6 py-4 rounded-2xl border border-slate-200 font-black font-mono text-2xl text-center text-emerald-600 outline-none focus:border-emerald-500 shadow-sm"
                    value={settlementAmount}
                    onChange={e => setSettlementAmount(e.target.value)}
                    placeholder="0.00"
                    autoFocus
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Settlement Date</label>
                  <input
                    required type="date"
                    className="w-full px-6 py-3 rounded-xl border border-slate-200 font-bold bg-white outline-none focus:border-indigo-500"
                    value={settlementDate}
                    onChange={e => setSettlementDate(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Source Account</label>
                  <select
                    value={settlementSource} onChange={e => setSettlementSource(e.target.value)}
                    className="w-full px-5 py-3.5 rounded-xl border border-slate-200 font-black uppercase text-[10px] bg-white outline-none focus:border-indigo-500"
                  >
                    {accounts.map(acc => <option key={acc.id} value={acc.id}>{acc.name} (Rs. {acc.balance.toLocaleString()})</option>)}
                  </select>
                </div>
                <button type="submit" className="w-full bg-emerald-600 text-white font-black py-5 rounded-2xl uppercase tracking-[0.2em] text-[11px] shadow-xl hover:bg-emerald-700 transition-all active:scale-95">Authorize Payment</button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Edit Settlement Transaction Modal */}
      {isEditTxModalOpen && editingTx && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md">
          <div className="bg-white rounded-[3rem] shadow-2xl w-full max-md overflow-hidden animate-in zoom-in duration-300">
            <div className="p-8 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
              <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Correct Settlement</h3>
              <button onClick={() => setIsEditTxModalOpen(false)} className="text-slate-300 hover:text-slate-900 text-4xl leading-none">&times;</button>
            </div>
            <form onSubmit={handleUpdateSettlement} className="p-8 space-y-6">
              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Amount (Rs.)</label>
                <input name="amount" type="number" step="0.01" required className="w-full px-5 py-3 rounded-xl border border-slate-200 font-black font-mono text-sm bg-white" defaultValue={editingTx.amount} />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Transaction Date</label>
                <input name="date" type="date" required className="w-full px-5 py-3 rounded-xl border border-slate-200 font-bold text-xs" defaultValue={editingTx.date.split('T')[0]} />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Asset Node (Account)</label>
                <select name="accountId" className="w-full px-5 py-3 rounded-xl border border-slate-200 font-black uppercase text-[10px]" defaultValue={editingTx.accountId}>
                  {accounts.map(acc => <option key={acc.id} value={acc.id}>{acc.name}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Audit Description</label>
                <input name="description" required className="w-full px-5 py-3 rounded-xl border border-slate-200 font-bold uppercase text-xs" defaultValue={editingTx.description} />
              </div>
              <button type="submit" className="w-full bg-slate-900 text-white font-black py-4 rounded-xl uppercase text-[10px] tracking-widest shadow-xl">Confirm Correction</button>
            </form>
          </div>
        </div>
      )}

      {isVendorModalOpen && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="bg-white rounded-[3rem] shadow-2xl w-full max-md overflow-hidden animate-in zoom-in duration-300">
            <div className="p-10 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
              <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Supplier Registration</h3>
              <button onClick={closeVendorModal} className="text-slate-300 hover:text-slate-900 text-4xl leading-none">&times;</button>
            </div>
            <form onSubmit={handleSaveVendor} className="p-10 space-y-6">
              <input required value={vName} onChange={e => setVName(e.target.value.toUpperCase())} className="w-full px-5 py-4 rounded-2xl border border-slate-200 font-bold uppercase text-sm" placeholder="SUPPLIER LEGAL NAME" />
              <button type="submit" className="w-full bg-indigo-600 text-white font-black py-4 rounded-xl uppercase tracking-widest text-[10px] shadow-lg">Save Profile</button>
            </form>
          </div>
        </div>
      )}

      {isReceiptModalOpen && selectedPO && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-lg p-12 text-center space-y-8">
            <div className="w-20 h-20 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center text-3xl mx-auto border border-emerald-100">📥</div>
            <div>
              <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">Inventory Confirmation</h3>
              <p className="text-slate-500 text-xs font-bold uppercase tracking-widest leading-relaxed px-4 mt-2">Authorizing intake will increment warehouse stocks for {selectedPO.items.length} assets.</p>
            </div>
            <div className="flex gap-4">
              <button onClick={() => setIsReceiptModalOpen(false)} className="flex-1 py-4 font-black text-slate-400 uppercase tracking-widest text-[9px]">Cancel</button>
              <button onClick={() => { onReceivePO(selectedPO.id); setIsReceiptModalOpen(false); }} className="flex-[2] bg-emerald-600 text-white font-black py-4 rounded-2xl shadow-xl hover:bg-emerald-700 transition-all active:scale-95 uppercase tracking-widest text-[9px]">Confirm Receipt</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Purchases;