import React, { useState, useMemo } from 'react';
import { Product, Category, Transaction, UserProfile, Customer } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { getReloadCostRate } from '../utils/reloadUtils';

interface ReloadProps {
    products: Product[];
    categories: Category[];
    userProfile: UserProfile;
    transactions: Transaction[];
    customers: Customer[];
    onCompleteSale: (tx: any) => void;
    onFetchData?: (startDate?: string, endDate?: string) => Promise<void>;
    hasMore?: boolean;
    isLoadingMore?: boolean;
}

const topUpIcons: Record<string, string> = {
    'DIALOG': '📶',
    'MOBITEL': '📞',
    'AIRTEL': '🅰️',
    'HUTCH': '🟧'
};

const Reload: React.FC<ReloadProps> = ({ products, categories, userProfile, transactions, customers, onCompleteSale, onFetchData, hasMore = false, isLoadingMore = false }) => {
    const [provider, setProvider] = useState<string>('DIALOG');
    const [phoneNumber, setPhoneNumber] = useState('');
    const [amount, setAmount] = useState('');
    const [reloadCustomerId, setReloadCustomerId] = useState('WALKING'); // For manual reload
    const [isProcessing, setIsProcessing] = useState(false);
    const [showImportModal, setShowImportModal] = useState(false);
    const [importFile, setImportFile] = useState<File | null>(null);
    const [importProvider, setImportProvider] = useState<string>('DIALOG');
    const [importDate, setImportDate] = useState('');
    const [selectedCustomerId, setSelectedCustomerId] = useState(''); // For Excel import
    const [historyStartDate, setHistoryStartDate] = useState(new Date().toISOString().split('T')[0]); // For History Checker
    const [historyEndDate, setHistoryEndDate] = useState(new Date().toISOString().split('T')[0]); // For History Checker

    const providers = [
        { id: 'DIALOG', color: 'bg-[#b90000]', hover: 'hover:bg-[#8a0000]', label: 'Dialog', icon: '📶' },
        { id: 'MOBITEL', color: 'bg-[#0056b3]', hover: 'hover:bg-[#004494]', label: 'Mobitel', icon: '📞' },
        { id: 'AIRTEL', color: 'bg-[#e53935]', hover: 'hover:bg-[#c62828]', label: 'Airtel', icon: '🅰️' },
        { id: 'HUTCH', color: 'bg-[#ff9800]', hover: 'hover:bg-[#f57c00]', label: 'Hutch', icon: '🟧' }
    ];

    const normalizeBranch = (b?: string): string => {
        if (!b) return 'CASHIER 1';
        const upper = b.trim().toUpperCase();
        if (upper === 'LOCAL NODE' || upper === 'BOOKSHOP' || upper === 'SHOP 2' || upper === 'MAIN BRANCH' || upper === 'NO 16,KIRULAPANA SUPERMARKET ,COLOMBO 05') {
            return 'CASHIER 1';
        }
        return b;
    };

    const isReloadItem = (item: any, product: Product | undefined, category: Category | undefined, txDescription: string = '') => {
        const pName = (product?.name || "").toUpperCase();
        const cName = (category?.name || "").toUpperCase();
        const pId = (item.productId || "").toUpperCase();
        const desc = txDescription.toUpperCase();

        if (cName.includes('CARD')) return false;
        if (pName.includes('SIM') || cName.includes('SIM') || desc.includes('SIM')) return false;

        return cName.includes('RELOAD') ||
            pName.includes('RELOAD') ||
            pId.includes('RELOAD') ||
            desc.includes('RELOAD') ||
            pName.includes('DIALOG') || pName.includes('MOBITEL') || pName.includes('AIRTEL') || pName.includes('HUTCH') ||
            cName.includes('DIALOG') || cName.includes('MOBITEL') || cName.includes('AIRTEL') || cName.includes('HUTCH');
    };

    const getProviderCostRate = (prov: string, prod?: Product) => {
        if (prod && (
            (typeof prod.reloadCommissionPercent === 'number' && prod.reloadCommissionPercent > 0 && prod.reloadCommissionPercent < 100) ||
            (typeof prod.reloadCostPercent === 'number' && prod.reloadCostPercent > 0 && prod.reloadCostPercent < 100) ||
            (Number(prod.price || 0) > 0 && Number(prod.cost || 0) > 0 && Number(prod.cost || 0) < Number(prod.price || 0))
        )) {
            return getReloadCostRate(prod);
        }
        return (prov === 'MOBITEL' || prov === 'HUTCH') ? 0.94 : 0.96;
    };

    const handleProcessReload = () => {
        const reloadAmount = parseFloat(amount);
        if (!reloadAmount || reloadAmount <= 0) {
            alert("Invalid Amount");
            return;
        }

        setIsProcessing(true);

        const txId = `TX-${Date.now()}`;
        const d = new Date();
        const dateStr = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') + 'T' +
            String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') + ':' + String(d.getSeconds()).padStart(2, '0');

        // Find existing product for stock deduction
        const targetName = `RELOAD ${provider}`;
        const existingProduct = products.find(p => p.name === targetName);
        const productId = existingProduct ? existingProduct.id : `RELOAD-${provider}`;

        const reloadItem = {
            productId: productId,
            quantity: 1, // Logic: 1 Unit at Price = Amount. (Matches POS Quick Reload logic)
            price: reloadAmount,
            discount: 0
        };

        // Commission: uses product's assigned percentage per provider, or fallback
        const categoryName = (existingProduct?.categoryId ? categories.find(c => c.id === existingProduct.categoryId)?.name || "" : "").toUpperCase();
        const isReloadCard = categoryName.includes('RELOAD CARD');

        const costRate = getProviderCostRate(provider, existingProduct);
        const defaultCostBasis = reloadAmount * costRate;

        // Use inventory cost IF it's a RELOAD CARD (Normal Setting), otherwise use Hot Reload logic
        const costBasis = isReloadCard && existingProduct ? (Number(existingProduct.cost) * (reloadAmount / Number(existingProduct.price || 1))) : defaultCostBasis;

        const txPayload = {
            id: txId,
            type: 'SALE',
            branchId: userProfile.branch,
            amount: reloadAmount,
            paidAmount: reloadAmount,
            balanceDue: 0,
            discount: 0,
            paymentMethod: 'CASH',
            accountId: 'cash',
            description: `RELOAD: ${provider} - ${phoneNumber}`,
            date: dateStr,
            costBasis: costBasis,
            items: [reloadItem],
            customerId: reloadCustomerId !== 'WALKING' ? reloadCustomerId : undefined,
            status: 'COMPLETED'
        };

        onCompleteSale(txPayload);
        setIsProcessing(false);
        setAmount('');
        setPhoneNumber('');
        // alert("Reload Processed Successfully!");
    };

    const handleImportExcel = async () => {
        if (!importFile || !importDate) {
            alert("Please select a file and date");
            return;
        }

        setIsProcessing(true);

        try {
            // Read the Excel file
            const data = await importFile.arrayBuffer();
            const workbook = await import('xlsx').then(XLSX => XLSX.read(data, { type: 'array' }));
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const jsonData = await import('xlsx').then(XLSX => XLSX.utils.sheet_to_json(worksheet));

            let successCount = 0;
            let errorCount = 0;

            let i = 0;
            // Process each row
            for (const row of jsonData as any[]) {
                i++;
                try {
                    // Log the row for debugging
                    console.log('Processing row:', row);

                    // Extract data from row - handle various column name formats
                    // Amount column
                    let amount = 0;
                    const amountStr = String(row['Amount'] || row['amount'] || row['AMOUNT'] || '').trim();
                    // Remove "Rs " prefix if present
                    const cleanAmount = amountStr.replace(/Rs\s*/i, '').replace(/,/g, '');
                    amount = parseFloat(cleanAmount);

                    // Phone/Connection number
                    const phone = String(row['Connection no'] || row['Connection'] || row['Phone'] || row['PHONE'] || row['phone'] || '').trim();

                    // Time column
                    const timeValue = row['Time'] || row['TIME'] || row['time'] || '';

                    // Status check - only import successful transactions
                    const status = String(row['Status'] || row['STATUS'] || row['status'] || '').trim().toUpperCase();

                    if (status && status !== 'SUCCESS') {
                        console.log('Skipping non-success transaction:', status);
                        errorCount++;
                        continue;
                    }

                    if (!amount || isNaN(amount)) {
                        console.log('Invalid amount:', amountStr, '→', amount);
                        errorCount++;
                        continue;
                    }

                    const isRefill = amount < 0; // Negative amount is a HEADER LOAD / REFILL

                    // Parse time if available
                    let timeStr = '12:00:00';
                    if (timeValue) {
                        const timeString = String(timeValue);
                        // Handle formats like "06:49 PM" or "01:40 PM"
                        const timeMatch = timeString.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
                        if (timeMatch) {
                            let hours = parseInt(timeMatch[1]);
                            const minutes = timeMatch[2];
                            const period = timeMatch[3]?.toUpperCase();

                            // Convert to 24-hour format
                            if (period === 'PM' && hours !== 12) {
                                hours += 12;
                            } else if (period === 'AM' && hours === 12) {
                                hours = 0;
                            }

                            timeStr = `${String(hours).padStart(2, '0')}:${minutes}:00`;
                        }
                    }

                    // Construct Date object to manipulate seconds
                    const [y, m, d] = importDate.split('-').map(Number);
                    const [th, tm, ts] = timeStr.split(':').map(Number);
                    const dateObj = new Date(y, m - 1, d, th, tm, ts || 0);
                    // Add staggered seconds based on index to ensure unique timestamp
                    dateObj.setSeconds(dateObj.getSeconds() + (i % 60));
                    // Handle minute overflow if needed implicitly by Date object

                    // Format explicitly as ISO string or local string
                    // We need YYYY-MM-DDTHH:mm:ss format for the backend usually
                    const year = dateObj.getFullYear();
                    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
                    const day = String(dateObj.getDate()).padStart(2, '0');
                    const hour = String(dateObj.getHours()).padStart(2, '0');
                    const minute = String(dateObj.getMinutes()).padStart(2, '0');
                    const second = String(dateObj.getSeconds()).padStart(2, '0');
                    const dateStr = `${year}-${month}-${day}T${hour}:${minute}:${second}`;


                    // Extract Excel Transaction ID if available
                    const excelTxId = String(row['Transaction ID'] || row['TRANSACTION ID'] || row['Tx ID'] || row['REF'] || '').trim();

                    // Use Phone as ID if available (requested), otherwise use Excel ID or generate random
                    // Format: PHONE-TIMESTAMP or EXCELID or TX-RANDOM
                    let txId = `TX-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                    if (phone) {
                        txId = `${phone}-${Date.now().toString().slice(-6)}`;
                    } else if (excelTxId) {
                        txId = excelTxId;
                    }

                    // Find existing product for stock deduction
                    const targetName = `RELOAD ${importProvider}`;
                    const existingProduct = products.find(p => p.name === targetName);
                    const productId = existingProduct ? existingProduct.id : `RELOAD-${importProvider}`;

                    const reloadItem = {
                        productId: productId,
                        quantity: 1,
                        price: Math.abs(amount), // Always positive for item price
                        discount: 0
                    };

                    // Commission: uses product's assigned percentage per provider, or fallback
                    const categoryName = (existingProduct?.categoryId ? categories.find(c => c.id === existingProduct.categoryId)?.name || "" : "").toUpperCase();
                    const isReloadCard = categoryName.includes('RELOAD CARD');

                    const costRate = getProviderCostRate(importProvider, existingProduct);
                    const defaultCostBasis = Math.abs(amount) * costRate;

                    const costBasis = isReloadCard && existingProduct ? (Number(existingProduct.cost) * (Math.abs(amount) / Number(existingProduct.price || 1))) : defaultCostBasis;

                    let type: 'SALE' | 'CREDIT_PAYMENT' = 'SALE';
                    let finalAmount = amount;
                    let description = isRefill ? `HEADER LOAD / REFILL: ${importProvider}` : `RELOAD: ${importProvider} - ${phone || 'BULK IMPORT'}`;

                    if (selectedCustomerId && isRefill) {
                        // If customer selected and negative amount -> treat as Cash Advance / Credit Payment
                        type = 'CREDIT_PAYMENT';
                        finalAmount = Math.abs(amount); // Payments are positive in amount
                        description = `CASH ADVANCE / REFILL: ${importProvider}`;
                    }

                    const txPayload = {
                        id: txId,
                        type: type,
                        branchId: userProfile.branch,
                        amount: finalAmount,
                        paidAmount: type === 'CREDIT_PAYMENT' ? finalAmount : amount, // For Sale, paidAmount matches amount
                        balanceDue: 0,
                        discount: 0,
                        paymentMethod: 'CASH',
                        accountId: 'cash',
                        description: description,
                        date: dateStr,
                        costBasis: costBasis,
                        items: type === 'SALE' ? [reloadItem] : undefined, // Check if Credit Payment needs items (usually no)
                        customerId: selectedCustomerId || undefined,
                        status: 'COMPLETED'
                    };

                    await onCompleteSale(txPayload);
                    successCount++;

                    // Small delay to avoid overwhelming the system
                    await new Promise(resolve => setTimeout(resolve, 50));
                } catch (err) {
                    console.error('Error processing row:', err);
                    errorCount++;
                }
            }

            alert(`Import Complete!\nSuccess: ${successCount}\nErrors: ${errorCount}`);
            setShowImportModal(false);
            setImportFile(null);
            setSelectedCustomerId('');
        } catch (error) {
            console.error('Import error:', error);
            alert('Failed to import Excel file. Please check the file format.');
        } finally {
            setIsProcessing(false);
        }
    };

    const getProviderProduct = (provId: string) => {
        const targetName = `RELOAD ${provId}`;
        return products.find(p => (p.name || '').toUpperCase().trim() === targetName) ||
            products.find(p => {
                const cat = categories.find(c => c.id === p.categoryId);
                return isReloadItem({ productId: p.id }, p, cat) && (p.name || '').toUpperCase().includes(provId);
            });
    };

    const getProviderBalance = (provId: string) => {
        const prod = getProviderProduct(provId);
        return prod ? Number(prod.stock || 0) : 0;
    };

    const getTxReloadBreakdown = (t: Transaction) => {
        const byProvider: Record<string, { sales: number; cost: number; profit: number }> = {
            DIALOG: { sales: 0, cost: 0, profit: 0 },
            MOBITEL: { sales: 0, cost: 0, profit: 0 },
            AIRTEL: { sales: 0, cost: 0, profit: 0 },
            HUTCH: { sales: 0, cost: 0, profit: 0 }
        };
        if (t.status === 'DRAFT' || t.status === 'VOID') return { isReload: false, totalSales: 0, totalCost: 0, totalProfit: 0, byProvider, primaryProvider: 'OTHER' };
        if (t.type !== 'SALE' && t.type !== 'SALE_HISTORY_IMPORT') return { isReload: false, totalSales: 0, totalCost: 0, totalProfit: 0, byProvider, primaryProvider: 'OTHER' };

        const desc = (t.description || '').toUpperCase();
        let totalSales = 0;
        let totalCost = 0;
        let totalProfit = 0;
        let primaryProvider = 'OTHER';

        if (t.items && t.items.length > 0) {
            t.items.forEach(i => {
                const p = products.find(prod => prod.id === i.productId);
                const category = categories.find(c => c.id === p?.categoryId);
                if (isReloadItem(i, p, category, t.description)) {
                    const lineTotal = (Number(i.quantity) * Number(i.price)) - (Number(i.discount) || 0);
                    const pName = (p?.name || '').toUpperCase();
                    const cName = (category?.name || '').toUpperCase();
                    let prov = 'DIALOG';
                    if (desc.includes('MOBITEL') || pName.includes('MOBITEL') || cName.includes('MOBITEL')) prov = 'MOBITEL';
                    else if (desc.includes('AIRTEL') || pName.includes('AIRTEL') || cName.includes('AIRTEL')) prov = 'AIRTEL';
                    else if (desc.includes('HUTCH') || pName.includes('HUTCH') || cName.includes('HUTCH')) prov = 'HUTCH';
                    else if (desc.includes('DIALOG') || pName.includes('DIALOG') || cName.includes('DIALOG')) prov = 'DIALOG';

                    const costRate = getProviderCostRate(prov, p);
                    const lineCost = lineTotal * costRate;
                    const lineProfit = lineTotal - lineCost;

                    byProvider[prov].sales += lineTotal;
                    byProvider[prov].cost += lineCost;
                    byProvider[prov].profit += lineProfit;
                    totalSales += lineTotal;
                    totalCost += lineCost;
                    totalProfit += lineProfit;
                    primaryProvider = prov;
                }
            });
        } else if (desc.includes('RELOAD') && !desc.includes('CARD')) {
            const lineTotal = Number(t.amount || 0);
            let prov = 'DIALOG';
            if (desc.includes('MOBITEL')) prov = 'MOBITEL';
            else if (desc.includes('AIRTEL')) prov = 'AIRTEL';
            else if (desc.includes('HUTCH')) prov = 'HUTCH';

            const prod = getProviderProduct(prov);
            const costRate = getProviderCostRate(prov, prod);
            const lineCost = lineTotal * costRate;
            const lineProfit = lineTotal - lineCost;

            byProvider[prov].sales += lineTotal;
            byProvider[prov].cost += lineCost;
            byProvider[prov].profit += lineProfit;
            totalSales += lineTotal;
            totalCost += lineCost;
            totalProfit += lineProfit;
            primaryProvider = prov;
        }

        return {
            isReload: totalSales > 0,
            totalSales,
            totalCost,
            totalProfit,
            byProvider,
            primaryProvider
        };
    };

    // Filter recent reload transactions - Branch Aware
    const recentReloads = useMemo(() => {
        return transactions
            .filter(t => {
                const breakdown = getTxReloadBreakdown(t);
                const branchMatch = normalizeBranch(t.branchId) === normalizeBranch(userProfile.branch);
                return breakdown.isReload && branchMatch;
            })
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
            .slice(0, 10);
    }, [transactions, userProfile.branch, categories, products]);

    // Calculate chart data - group by date and provider - Branch and Provider Aware
    const chartData = useMemo(() => {
        // Group by date and provider
        const dateMap: Record<string, { dialog: number; mobitel: number; airtel: number; hutch: number }> = {};

        // Use last 30 days for consistency with KPI
        const dates: string[] = [];
        for (let i = 29; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().split('T')[0];
            dateMap[dateStr] = { dialog: 0, mobitel: 0, airtel: 0, hutch: 0 };
            dates.push(dateStr);
        }

        transactions.forEach(t => {
            const date = (t.date || '').split('T')[0];
            if (!dateMap.hasOwnProperty(date)) return;

            // Branch filter
            if (normalizeBranch(t.branchId) !== normalizeBranch(userProfile.branch)) return;

            const breakdown = getTxReloadBreakdown(t);
            if (breakdown.isReload) {
                dateMap[date].dialog += breakdown.byProvider.DIALOG.sales;
                dateMap[date].mobitel += breakdown.byProvider.MOBITEL.sales;
                dateMap[date].airtel += breakdown.byProvider.AIRTEL.sales;
                dateMap[date].hutch += breakdown.byProvider.HUTCH.sales;
            }
        });

        // Convert to array in chronological order
        return dates.map(date => ({
            date: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            dialog: Math.round(dateMap[date].dialog),
            mobitel: Math.round(dateMap[date].mobitel),
            airtel: Math.round(dateMap[date].airtel),
            hutch: Math.round(dateMap[date].hutch)
        }));
    }, [transactions, userProfile.branch, products, categories]);

    // History Checker Logic - All Terminals or Active Terminal
    const [historyBranchFilter, setHistoryBranchFilter] = useState<'ALL' | 'ACTIVE'>('ALL');

    const historyReloads = useMemo(() => {
        return transactions
            .filter(t => {
                const tDate = (t.date || '').split('T')[0];
                const isWithinRange = (!historyStartDate || tDate >= historyStartDate) && (!historyEndDate || tDate <= historyEndDate);
                if (!isWithinRange) return false;
                const branchMatch = historyBranchFilter === 'ALL' || normalizeBranch(t.branchId) === normalizeBranch(userProfile.branch);
                if (!branchMatch) return false;
                const breakdown = getTxReloadBreakdown(t);
                return breakdown.isReload;
            })
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [transactions, historyStartDate, historyEndDate, userProfile.branch, historyBranchFilter, products, categories]);

    // Reload Inventory = Sales - Balance Summary per Provider for the selected date range
    const reloadInventorySummary = useMemo(() => {
        const summary: Record<string, { sales: number; cost: number; profit: number; balance: number; reloadInventoryDiff: number }> = {
            DIALOG: { sales: 0, cost: 0, profit: 0, balance: getProviderBalance('DIALOG'), reloadInventoryDiff: 0 },
            MOBITEL: { sales: 0, cost: 0, profit: 0, balance: getProviderBalance('MOBITEL'), reloadInventoryDiff: 0 },
            AIRTEL: { sales: 0, cost: 0, profit: 0, balance: getProviderBalance('AIRTEL'), reloadInventoryDiff: 0 },
            HUTCH: { sales: 0, cost: 0, profit: 0, balance: getProviderBalance('HUTCH'), reloadInventoryDiff: 0 }
        };

        historyReloads.forEach(tx => {
            const breakdown = getTxReloadBreakdown(tx);
            (['DIALOG', 'MOBITEL', 'AIRTEL', 'HUTCH'] as const).forEach(prov => {
                summary[prov].sales += breakdown.byProvider[prov].sales;
                summary[prov].cost += breakdown.byProvider[prov].cost;
                summary[prov].profit += breakdown.byProvider[prov].profit;
            });
        });

        let totalSales = 0;
        let totalCost = 0;
        let totalProfit = 0;
        let totalBalance = 0;

        (['DIALOG', 'MOBITEL', 'AIRTEL', 'HUTCH'] as const).forEach(prov => {
            summary[prov].reloadInventoryDiff = summary[prov].sales - summary[prov].balance;
            totalSales += summary[prov].sales;
            totalCost += summary[prov].cost;
            totalProfit += summary[prov].profit;
            totalBalance += summary[prov].balance;
        });

        return {
            byProvider: summary,
            totalSales,
            totalCost,
            totalProfit,
            totalBalance,
            totalReloadInventoryDiff: totalSales - totalBalance
        };
    }, [historyReloads, products, categories]);

    return (
        <div className="h-full flex flex-col gap-6 p-4">
            {/* Header */}
            <div className="flex justify-between items-center bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
                <div>
                    <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Reload Terminal</h1>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Mobile Top-up & Bill Payments</p>
                </div>
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => setShowImportModal(true)}
                        className="px-6 py-3 bg-emerald-600 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-lg flex items-center gap-2"
                    >
                        📊 Import Excel
                    </button>
                    <div className="text-right">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Active Terminal</p>
                        <p className="text-xl font-black text-indigo-600 uppercase tracking-tighter">{userProfile.branch}</p>
                    </div>
                </div>
            </div>

            <div className="flex-1 flex gap-6 min-h-0">
                {/* Main Input Area */}
                <div className="flex-1 flex flex-col gap-4">

                    {/* Provider Selection */}
                    <div className="grid grid-cols-4 gap-4">
                        {providers.map(p => {
                            const isActive = provider === p.id;
                            const balance = getProviderBalance(p.id);
                            const provStats = reloadInventorySummary.byProvider[p.id];

                            return (
                                <button
                                    key={p.id}
                                    onClick={() => setProvider(p.id)}
                                    className={`relative p-6 rounded-2xl border-2 transition-all duration-200 overflow-hidden group ${isActive ? `${p.color} border-transparent text-white shadow-xl scale-105` : 'bg-white border-slate-100 hover:border-slate-200'}`}
                                >
                                    <div className="relative z-10 flex flex-col items-center text-center gap-2">
                                        <span className="text-3xl">{topUpIcons[p.id] || p.icon}</span>
                                        <span className={`text-sm font-black uppercase tracking-widest ${isActive ? 'text-white' : 'text-slate-700'}`}>{p.label}</span>
                                        <div className={`px-2 py-1 rounded text-[10px] font-mono font-bold ${isActive ? 'bg-black/20 text-white' : 'bg-slate-100 text-slate-500'}`}>
                                            Bal: Rs. {Math.round(balance).toLocaleString()}
                                        </div>
                                        <div className={`text-[9px] font-mono font-bold ${isActive ? 'text-white/90' : 'text-slate-400'}`}>
                                            Sales: Rs. {Math.round(provStats?.sales || 0).toLocaleString()}
                                        </div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>

                    {/* Manual Entry Form */}
                    <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-8">
                        <div className="flex flex-col md:flex-row gap-6 items-end">
                            <div className="flex-1 space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Phone Number / ID</label>
                                <input
                                    type="text"
                                    value={phoneNumber}
                                    onChange={e => setPhoneNumber(e.target.value)}
                                    placeholder="Enter Customer Info..."
                                    className="w-full bg-slate-50 border-2 border-transparent rounded-2xl px-6 py-4 text-sm font-bold uppercase tracking-widest focus:ring-2 ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all placeholder:text-slate-300"
                                />
                            </div>
                            <div className="w-full md:w-64 space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Amount (LKR)</label>
                                <div className="relative">
                                    <span className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">Rs.</span>
                                    <input
                                        type="number"
                                        value={amount}
                                        onChange={e => setAmount(e.target.value)}
                                        placeholder="0.00"
                                        className="w-full bg-slate-50 border-2 border-transparent rounded-2xl pl-12 pr-6 py-4 text-sm font-black font-mono outline-none focus:ring-2 ring-indigo-500/20 focus:border-indigo-500 transition-all placeholder:text-slate-300"
                                    />
                                </div>
                            </div>
                            <div className="w-full md:w-48 space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Account</label>
                                <select
                                    value={reloadCustomerId}
                                    onChange={e => setReloadCustomerId(e.target.value)}
                                    className="w-full bg-slate-50 border-2 border-transparent rounded-2xl px-6 py-4 text-xs font-bold uppercase tracking-widest outline-none focus:ring-2 ring-indigo-500/20 focus:border-indigo-500 transition-all"
                                >
                                    <option value="WALKING">WALKING CUSTOMER</option>
                                    {customers.map(c => (
                                        <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                </select>
                            </div>
                            <button
                                onClick={handleProcessReload}
                                disabled={isProcessing || !amount || !provider}
                                className={`px-10 py-4 rounded-2xl font-black text-[11px] uppercase tracking-[0.2em] transition-all shadow-xl active:scale-95 ${isProcessing ? 'bg-slate-200 text-slate-400' : 'bg-slate-900 text-white hover:bg-black hover:shadow-indigo-100 hover:-translate-y-0.5'}`}
                            >
                                {isProcessing ? 'Processing...' : 'Authorize Top-up'}
                            </button>
                        </div>
                    </div>

                    {/* Revenue & Profit Chart */}
                    <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
                        <div className="flex justify-between items-center mb-4">
                            <div>
                                <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">Reload Performance</h3>
                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Provider Breakdown by Date</p>
                            </div>
                            <div className="flex gap-4">
                                <div className="flex items-center gap-2">
                                    <div className="w-3 h-3 rounded bg-[#b90000]"></div>
                                    <span className="text-[9px] font-black text-slate-500 uppercase">Dialog</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="w-3 h-3 rounded bg-[#0056b3]"></div>
                                    <span className="text-[9px] font-black text-slate-500 uppercase">Mobitel</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="w-3 h-3 rounded bg-[#e53935]"></div>
                                    <span className="text-[9px] font-black text-slate-500 uppercase">Airtel</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="w-3 h-3 rounded bg-[#ff9800]"></div>
                                    <span className="text-[9px] font-black text-slate-500 uppercase">Hutch</span>
                                </div>
                            </div>
                        </div>
                        <div className="h-[200px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                    <XAxis
                                        dataKey="date"
                                        tick={{ fontSize: 9, fontWeight: 700, fill: '#64748b' }}
                                        axisLine={false}
                                        tickLine={false}
                                    />
                                    <YAxis
                                        tick={{ fontSize: 9, fontWeight: 700, fill: '#64748b' }}
                                        axisLine={false}
                                        tickLine={false}
                                        tickFormatter={(value) => `Rs. ${value > 1000 ? (value / 1000).toFixed(0) + 'k' : value}`}
                                    />
                                    <Tooltip
                                        cursor={{ fill: '#f8fafc' }}
                                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '11px', fontWeight: 'bold' }}
                                        formatter={(value: number) => `Rs. ${value.toLocaleString()}`}
                                    />
                                    <Bar dataKey="dialog" stackId="a" fill="#b90000" radius={[0, 0, 0, 0]} />
                                    <Bar dataKey="mobitel" stackId="a" fill="#0056b3" radius={[0, 0, 0, 0]} />
                                    <Bar dataKey="airtel" stackId="a" fill="#e53935" radius={[0, 0, 0, 0]} />
                                    <Bar dataKey="hutch" stackId="a" fill="#ff9800" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Reload Inventory = Sales - Balance & History Checker */}
                    <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 flex-1 min-h-0 flex flex-col gap-4">
                        <div className="flex flex-wrap justify-between items-center gap-4">
                            <div>
                                <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">Reload Inventory, Sales & Balance</h3>
                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Reload Inventory = Sales − Balance (By Selected Date Range)</p>
                            </div>
                            <div className="flex flex-wrap items-center gap-3">
                                <select
                                    value={historyBranchFilter}
                                    onChange={(e) => setHistoryBranchFilter(e.target.value as 'ALL' | 'ACTIVE')}
                                    className="px-3 py-2 rounded-xl border-2 border-slate-100 font-black text-[10px] uppercase text-indigo-700 outline-none focus:border-indigo-500 bg-indigo-50/50"
                                >
                                    <option value="ALL">All Terminals</option>
                                    <option value="ACTIVE">Active Terminal ({userProfile.branch})</option>
                                </select>
                                <div className="flex items-center gap-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">From:</label>
                                    <input
                                        type="date"
                                        value={historyStartDate}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            setHistoryStartDate(val);
                                            if (onFetchData) onFetchData(val, historyEndDate);
                                        }}
                                        className="px-3 py-2 rounded-xl border-2 border-slate-100 font-bold text-xs uppercase text-slate-700 outline-none focus:border-indigo-500 bg-slate-50"
                                    />
                                </div>
                                <div className="flex items-center gap-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">To:</label>
                                    <input
                                        type="date"
                                        value={historyEndDate}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            setHistoryEndDate(val);
                                            if (onFetchData) onFetchData(historyStartDate, val);
                                        }}
                                        className="px-3 py-2 rounded-xl border-2 border-slate-100 font-bold text-xs uppercase text-slate-700 outline-none focus:border-indigo-500 bg-slate-50"
                                    />
                                </div>
                                {onFetchData && (
                                    <button
                                        type="button"
                                        disabled={isLoadingMore}
                                        onClick={() => onFetchData(historyStartDate, historyEndDate)}
                                        className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-black uppercase tracking-wider transition-all shadow-sm flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50 active:scale-95"
                                        title="Fetch all data for selected date range"
                                    >
                                        <span>{isLoadingMore ? '⏳' : '⚡'}</span>
                                        <span>{isLoadingMore ? 'Fetching...' : 'Fetch Data'}</span>
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Summary Cards: Total Sales, Cost, Balance, Reload Inventory (Sales - Balance) */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100">
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Reload Sales</p>
                                <p className="text-lg font-black font-mono text-slate-900">Rs. {Math.round(reloadInventorySummary.totalSales).toLocaleString()}</p>
                                <p className="text-[8px] font-bold text-emerald-600 uppercase">Margin: Rs. {Math.round(reloadInventorySummary.totalProfit).toLocaleString()}</p>
                            </div>
                            <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100">
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Reload Cost (96%)</p>
                                <p className="text-lg font-black font-mono text-indigo-600">Rs. {Math.round(reloadInventorySummary.totalCost).toLocaleString()}</p>
                                <p className="text-[8px] font-bold text-slate-400 uppercase">Product Cost of Sales</p>
                            </div>
                            <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100">
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Current Balance</p>
                                <p className="text-lg font-black font-mono text-amber-600">Rs. {Math.round(reloadInventorySummary.totalBalance).toLocaleString()}</p>
                                <p className="text-[8px] font-bold text-slate-400 uppercase">Remaining Stock in Inventory</p>
                            </div>
                            <div className="bg-indigo-50/70 p-3.5 rounded-2xl border border-indigo-100">
                                <p className="text-[9px] font-black text-indigo-600 uppercase tracking-widest">Sales − Balance</p>
                                <p className="text-lg font-black font-mono text-indigo-900">Rs. {Math.round(reloadInventorySummary.totalReloadInventoryDiff).toLocaleString()}</p>
                                <p className="text-[8px] font-bold text-indigo-500 uppercase">Sales + Bal: Rs. {Math.round(reloadInventorySummary.totalSales + reloadInventorySummary.totalBalance).toLocaleString()}</p>
                            </div>
                        </div>

                        {/* Per-Provider Breakdown Table */}
                        <div className="border border-slate-100 rounded-2xl overflow-hidden">
                            <table className="w-full text-left border-collapse">
                                <thead className="bg-slate-50">
                                    <tr>
                                        <th className="py-2 px-3 text-[9px] font-black text-slate-500 uppercase tracking-widest">Provider</th>
                                        <th className="py-2 px-3 text-[9px] font-black text-slate-500 uppercase tracking-widest text-right">Sales (Rs)</th>
                                        <th className="py-2 px-3 text-[9px] font-black text-slate-500 uppercase tracking-widest text-right">Product Cost (Rs)</th>
                                        <th className="py-2 px-3 text-[9px] font-black text-slate-500 uppercase tracking-widest text-right">Margin (Rs)</th>
                                        <th className="py-2 px-3 text-[9px] font-black text-slate-500 uppercase tracking-widest text-right">Current Balance (Rs)</th>
                                        <th className="py-2 px-3 text-[9px] font-black text-indigo-600 uppercase tracking-widest text-right">Reload Inventory (Sales − Bal)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(['DIALOG', 'MOBITEL', 'AIRTEL', 'HUTCH'] as const).map(prov => {
                                        const row = reloadInventorySummary.byProvider[prov];
                                        return (
                                            <tr key={prov} className="border-t border-slate-100 text-xs font-mono">
                                                <td className="py-2 px-3 font-sans font-black text-slate-800">{prov}</td>
                                                <td className="py-2 px-3 text-right font-bold text-slate-900">{ row.sales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }</td>
                                                <td className="py-2 px-3 text-right font-bold text-slate-600">{ row.cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }</td>
                                                <td className="py-2 px-3 text-right font-bold text-emerald-600">{ row.profit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }</td>
                                                <td className="py-2 px-3 text-right font-bold text-amber-600">{ row.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }</td>
                                                <td className="py-2 px-3 text-right font-black text-indigo-700 bg-indigo-50/30">{ row.reloadInventoryDiff.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        <div className="flex-1 overflow-y-auto pr-2">
                            <table className="w-full text-left border-collapse">
                                <thead className="sticky top-0 bg-white z-10">
                                    <tr>
                                        <th className="py-3 px-2 text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Time</th>
                                        <th className="py-3 px-2 text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Provider</th>
                                        <th className="py-3 px-2 text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Phone Number / Desc</th>
                                        <th className="py-3 px-2 text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Reference</th>
                                        <th className="py-3 px-2 text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 text-right">Amount</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {historyReloads.length > 0 ? (
                                        historyReloads.map(tx => {
                                            const breakdown = getTxReloadBreakdown(tx);
                                            const prov = breakdown.primaryProvider;
                                            const isDialog = prov === 'DIALOG';
                                            const isMobitel = prov === 'MOBITEL';
                                            const isAirtel = prov === 'AIRTEL';
                                            const isHutch = prov === 'HUTCH';

                                            // Extract phone from description "RELOAD: PROVIDER - PHONE"
                                            const phone = tx.description?.includes('-') ? (tx.description?.split('-').pop()?.trim() || tx.description) : (tx.description || 'POS Reload');

                                            return (
                                                <tr key={tx.id} className="group hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-0">
                                                    <td className="py-3 px-2 font-mono text-xs font-bold text-slate-500">
                                                        {new Date(tx.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    </td>
                                                    <td className="py-3 px-2">
                                                        <span className={`text-[8px] font-black px-2 py-1 rounded uppercase tracking-wider ${isDialog ? 'bg-rose-50 text-rose-600' :
                                                            isMobitel ? 'bg-blue-50 text-blue-600' :
                                                                isAirtel ? 'bg-red-50 text-red-600' :
                                                                    isHutch ? 'bg-orange-50 text-orange-600' : 'bg-slate-100 text-slate-600'
                                                            }`}>
                                                            {prov}
                                                        </span>
                                                    </td>
                                                    <td className="py-3 px-2 font-mono text-xs font-bold text-slate-700">{phone}</td>
                                                    <td className="py-3 px-2 font-mono text-[9px] font-bold text-slate-400">{tx.id}</td>
                                                    <td className="py-3 px-2 font-mono text-xs font-black text-slate-900 text-right">Rs. {Number(breakdown.totalSales || tx.amount).toLocaleString()}</td>
                                                </tr>
                                            );
                                        })
                                    ) : (
                                        <tr>
                                            <td colSpan={5} className="py-8 text-center opacity-40">
                                                <p className="text-[10px] font-black uppercase tracking-widest">No Transactions Found</p>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>


                </div>

                {/* Sidebar: Recent History */}
                <div className="w-[350px] bg-white rounded-3xl border border-slate-100 shadow-sm flex flex-col overflow-hidden">
                    <div className="p-5 border-b border-slate-50 bg-slate-50/50">
                        <h3 className="font-black text-slate-800 uppercase tracking-tight">Recent Activity</h3>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Last 10 Top-ups</p>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2 space-y-2">
                        {recentReloads.length > 0 ? recentReloads.map(tx => {
                            const desc = tx.description || '';
                            const isDialog = desc.includes('DIALOG');
                            const isMobitel = desc.includes('MOBITEL');
                            const isAirtel = desc.includes('AIRTEL');
                            const isHutch = desc.includes('HUTCH');

                            let colorClass = 'bg-slate-50 border-slate-100 text-slate-500';
                            if (isDialog) colorClass = 'bg-rose-50 border-rose-100 text-rose-600';
                            if (isMobitel) colorClass = 'bg-blue-50 border-blue-100 text-blue-600';
                            if (isAirtel) colorClass = 'bg-red-50 border-red-100 text-red-600';
                            if (isHutch) colorClass = 'bg-orange-50 border-orange-100 text-orange-600';

                            return (
                                <div key={tx.id} className="p-3 rounded-xl border border-slate-100 hover:border-slate-300 transition-all flex justify-between items-center group">
                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider border ${colorClass}`}>
                                                {isDialog ? 'DIALOG' : isMobitel ? 'MOBITEL' : isAirtel ? 'AIRTEL' : isHutch ? 'HUTCH' : 'RELOAD'}
                                            </span>
                                            <span className="text-[9px] font-mono text-slate-400">{new Date(tx.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                        </div>
                                        <p className="text-[11px] font-black text-slate-700 truncate max-w-[150px]">{desc.split('-').pop()?.trim() || 'Unknown'}</p>
                                    </div>
                                    <p className="font-mono font-black text-slate-900">Rs. {Number(tx.amount).toLocaleString()}</p>
                                </div>
                            );
                        }) : (
                            <div className="text-center py-10 opacity-50">
                                <div className="text-4xl mb-2">📜</div>
                                <p className="text-xs font-bold uppercase">No Recent Records</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Import Excel Modal */}
            {
                showImportModal && (
                    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                        <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full p-8 animate-in zoom-in duration-200">
                            <div className="flex justify-between items-center mb-6">
                                <div>
                                    <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Import Excel File</h2>
                                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Bulk Import Reload Transactions</p>
                                </div>
                                <button
                                    onClick={() => {
                                        setShowImportModal(false);
                                        setImportFile(null);
                                    }}
                                    className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-all"
                                >
                                    ✕
                                </button>
                            </div>

                            <div className="space-y-6">
                                {/* Provider Selection */}
                                <div className="space-y-2">
                                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Provider</label>
                                    <select
                                        value={importProvider}
                                        onChange={(e) => setImportProvider(e.target.value)}
                                        className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 focus:border-indigo-500 outline-none font-bold text-sm bg-white"
                                    >
                                        <option value="DIALOG">Dialog</option>
                                        <option value="MOBITEL">Mobitel</option>
                                        <option value="AIRTEL">Airtel</option>
                                        <option value="HUTCH">Hutch</option>
                                    </select>
                                </div>

                                {/* Customer Binding (Optional) */}
                                <div className="space-y-2">
                                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Assign to Customer (Optional)</label>
                                    <select
                                        value={selectedCustomerId}
                                        onChange={(e) => setSelectedCustomerId(e.target.value)}
                                        className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 focus:border-indigo-500 outline-none font-bold text-sm bg-white"
                                    >
                                        <option value="">-- No Customer Assignment --</option>
                                        {customers.map(c => (
                                            <option key={c.id} value={c.id}>{c.name} ({c.phone})</option>
                                        ))}
                                    </select>
                                    <p className="text-[9px] text-slate-400 font-bold ml-1">
                                        Use for Cash Advances / Credit Refills. Negative amounts will be treated as Credit Payments.
                                    </p>
                                </div>

                                {/* Date Selection */}
                                <div className="space-y-2">
                                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Transaction Date</label>
                                    <input
                                        type="date"
                                        value={importDate}
                                        onChange={(e) => setImportDate(e.target.value)}
                                        className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 focus:border-indigo-500 outline-none font-bold text-sm bg-white"
                                    />
                                </div>

                                {/* File Upload */}
                                <div className="space-y-2">
                                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Excel File (.xlsx)</label>
                                    <div className="relative">
                                        <input
                                            type="file"
                                            accept=".xlsx,.xls"
                                            onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                                            className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 focus:border-indigo-500 outline-none font-bold text-sm bg-white file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                                        />
                                    </div>
                                    {importFile && (
                                        <p className="text-xs font-bold text-emerald-600 ml-1">✓ {importFile.name}</p>
                                    )}
                                </div>

                                {/* Expected Format Info */}
                                <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                                    <p className="text-xs font-black text-slate-700 uppercase tracking-wider mb-2">Expected Excel Columns:</p>
                                    <ul className="text-xs font-mono text-slate-600 space-y-1">
                                        <li>• <strong>Amount</strong> (required)</li>
                                        <li>• <strong>Connection no</strong> or <strong>Phone</strong> (optional)</li>
                                        <li>• <strong>Time</strong> (optional, format: HH:MM)</li>
                                    </ul>
                                </div>

                                {/* Action Buttons */}
                                <div className="flex gap-3 pt-4">
                                    <button
                                        onClick={() => {
                                            setShowImportModal(false);
                                            setImportFile(null);
                                        }}
                                        className="flex-1 px-6 py-3 bg-slate-100 text-slate-700 rounded-xl font-black text-sm uppercase tracking-widest hover:bg-slate-200 transition-all"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleImportExcel}
                                        disabled={!importFile || !importDate || isProcessing}
                                        className={`flex-1 px-6 py-3 rounded-xl font-black text-sm uppercase tracking-widest transition-all shadow-lg ${!importFile || !importDate || isProcessing
                                            ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                                            : 'bg-emerald-600 text-white hover:bg-emerald-700'
                                            }`}
                                    >
                                        {isProcessing ? 'Importing...' : 'Import Transactions'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
};

export default Reload;
