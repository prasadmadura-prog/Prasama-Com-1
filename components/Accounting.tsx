import React, { useState, useMemo } from 'react';
import { Transaction, BankAccount, Customer, Vendor, Product, Category, PurchaseOrder, UserProfile, FixedAsset, DaySession } from '../types';
import * as XLSX from 'xlsx';
import { formatDateTime, formatTime, formatDate, formatMMDDYYYY } from '../utils/dateFormatter';

interface AccountingProps {
    transactions: Transaction[];
    accounts: BankAccount[];
    customers: Customer[];
    vendors: Vendor[];
    products: Product[];
    categories: Category[];
    purchaseOrders: PurchaseOrder[];
    fixedAssets: FixedAsset[];
    userProfile: UserProfile;
    daySessions: DaySession[];
}


const downloadExcel = (workbook: XLSX.WorkBook, filename: string) => {
    const fullFilename = filename.endsWith('.xlsx') ? filename : filename + '.xlsx';
    try {
        XLSX.writeFile(workbook, fullFilename);
    } catch (err) {
        console.error('XLSX.writeFile failed, trying Blob fallback:', err);
        try {
            const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
            const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=UTF-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fullFilename;
            document.body.appendChild(a);
            a.click();
            setTimeout(() => {
                if (document.body.contains(a)) {
                    document.body.removeChild(a);
                }
                URL.revokeObjectURL(url);
            }, 500);
        } catch (err2) {
            console.error('Error downloading Excel file:', err2);
            alert('Failed to download Excel file: ' + ((err2 as any)?.message || err2));
        }
    }
};

const Accounting: React.FC<AccountingProps> = ({ transactions, accounts, customers, vendors, products, categories, purchaseOrders, fixedAssets = [], userProfile, daySessions = [] }) => {
    const [activeReport, setActiveReport] = useState<'BALANCE_SHEET' | 'INCOME_STATEMENT' | 'PROFIT_LOSS_LEDGER' | 'TRIAL_BALANCE' | 'CATEGORY_REPORT' | 'CRITICAL_STOCK' | 'DAILY_SUMMARY' | 'PURCHASES' | 'LIABILITIES'>('BALANCE_SHEET');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [selectedCashier, setSelectedCashier] = useState('ALL CASHIERS');
    const [purchaseSearch, setPurchaseSearch] = useState('');
    const [vendorSearch, setVendorSearch] = useState('');
    const [pnlLedgerSearch, setPnlLedgerSearch] = useState('');
    const [pnlTypeFilter, setPnlTypeFilter] = useState<'ALL' | 'SALE' | 'EXPENSE'>('ALL');
    const [isARModalOpen, setIsARModalOpen] = useState(false);
    const [arSearch, setArSearch] = useState('');
    const [selectedARCustomer, setSelectedARCustomer] = useState<Customer | null>(null);
    const [arModalTab, setArModalTab] = useState<'DETAILS' | 'SUMMARY'>('DETAILS');
    const [isAPModalOpen, setIsAPModalOpen] = useState(false);
    const [apSearch, setApSearch] = useState('');
    const [selectedAPVendor, setSelectedAPVendor] = useState<Vendor | null>(null);
    const [apModalTab, setApModalTab] = useState<'DETAILS' | 'SUMMARY'>('DETAILS');

    const getTodayLocal = () => {
        const d = new Date();
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    };

    const getFirstDayOfMonth = () => {
        const d = new Date();
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-01';
    };

    // Initialize with current month
    React.useEffect(() => {
        if (!startDate) setStartDate(getFirstDayOfMonth());
        if (!endDate) setEndDate(getTodayLocal());
        if (!userProfile.isAdmin && userProfile.branch) {
            setSelectedCashier(userProfile.branch);
        }
    }, [userProfile]);

    const filteredTransactions = useMemo(() => {
        return transactions.filter(t => {
            const txDate = t.date.split('T')[0];
            const isSingleDateReport = activeReport === 'BALANCE_SHEET' || activeReport === 'LIABILITIES' || activeReport === 'PROFIT_LOSS_LEDGER';
            const dateMatch = isSingleDateReport
                ? (!endDate || txDate <= endDate)
                : ((!startDate || txDate >= startDate) && (!endDate || txDate <= endDate));
            const cashierMatch = selectedCashier === 'ALL CASHIERS' || t.branchId === selectedCashier;
            return dateMatch && cashierMatch;
        });
    }, [transactions, startDate, endDate, selectedCashier, activeReport]);

    // Helper to identify a reload item robustly
    // Helper to identify a hot reload item (Digital only, excludes RELOAD CARD)
    const isHotReloadItem = (item: any, product: Product | undefined, category: Category | undefined, txDescription: string = '') => {
        const pName = (product?.name || "").toUpperCase();
        const cName = (category?.name || "").toUpperCase();
        const pId = (item.productId || "").toUpperCase();
        const desc = txDescription.toUpperCase();

        // If category is "RELOAD CARD", it's a physical item, not a hot reload
        if (cName.includes('CARD')) return false;
        if (pName.includes('SIM') || cName.includes('SIM') || desc.includes('SIM')) return false;

        return cName.includes('RELOAD') ||
            pName.includes('RELOAD') ||
            pId.includes('RELOAD') ||
            desc.includes('RELOAD') ||
            pName.includes('DIALOG') || pName.includes('MOBITEL') || pName.includes('AIRTEL') || pName.includes('HUTCH') ||
            cName.includes('DIALOG') || cName.includes('MOBITEL') || cName.includes('AIRTEL') || cName.includes('HUTCH');
    };

    const getReloadProfitRate = (item: any, product: Product | undefined, category: Category | undefined, txDescription: string = '') => {
        const pName = (product?.name || "").toUpperCase();
        const cName = (category?.name || "").toUpperCase();
        const desc = txDescription.toUpperCase();

        const isMobitelOrHutch = pName.includes('MOBITEL') || pName.includes('HUTCH') ||
            cName.includes('MOBITEL') || cName.includes('HUTCH') ||
            desc.includes('MOBITEL') || desc.includes('HUTCH');

        return isMobitelOrHutch ? 0.06 : 0.04;
    };

    // Helper to identify a reload purchase robustly
    const isReloadPurchase = (t: Transaction) => {
        if (t.type !== 'PURCHASE') return false;

        // Check description for manual/legacy entries
        if (t.description.toUpperCase().includes('RELOAD')) return true;

        // Check linked Purchase Order
        const poId = t.description?.match(/PO-[A-Z0-9]+/i)?.[0] || t.description?.split(': ').pop();
        if (poId) {
            const po = purchaseOrders.find(p => p.id === poId);
            if (po && po.items) {
                return po.items.some(item => {
                    const product = products.find(p => p.id === item.productId);
                    const category = product?.categoryId ? categories.find(c => c.id === product.categoryId) : undefined;
                    return isHotReloadItem(item, product, category, '');
                });
            }
        }

        return false;
    };


    // Balance Sheet Calculations
    const balanceSheet = useMemo(() => {
        const endDay = endDate ? endDate : getTodayLocal();

        const getAccountLedgerName = (accId: string | null): string => {
          if (!accId) return 'Cash / Bank';
          const acc = accounts.find(a => a.id === accId);
          if (!acc) return 'Cash / Bank';
          const upperName = acc.name.toUpperCase().trim();
          if (upperName === 'DIRECTOR C/A' || upperName === 'DIRECTOR CURRENT ACCOUNT' || upperName.includes('DIRECTOR')) {
            return 'Director C/A';
          }
          if (upperName === 'SHARE CAPITAL') {
            return 'Share Capital';
          }
          return 'Cash / Bank';
        };

        // Unified cash & bank calculation directly matching Note 01 export
        let cashAndBank = 0;
        let totalInflowsUpToDate = 0;
        let totalOutflowsUpToDate = 0;

        transactions.forEach(t => {
            if (t.status === 'VOID' || t.status === 'DRAFT') return;
            const txDate = (t.date || '').split('T')[0];
            if (txDate > endDay) return;

            const cashierMatch = selectedCashier === 'ALL CASHIERS' || t.branchId === selectedCashier;
            if (!cashierMatch) return;

            const isDirectorSource = t.accountId && getAccountLedgerName(t.accountId) === 'Director C/A';
            const isDirectorDest = t.destinationAccountId && getAccountLedgerName(t.destinationAccountId) === 'Director C/A';

            let movement = 0;
            let isOutflow = false;

            if (t.type === 'SALE' || t.type === 'SALE_HISTORY_IMPORT') {
                if (t.paymentMethod !== 'CREDIT' && !isDirectorSource) {
                    movement = Number(t.paidAmount) || Number(t.amount || 0);
                    isOutflow = false;
                }
            } else if (t.type === 'PURCHASE') {
                if (t.paymentMethod !== 'CREDIT' && !isDirectorSource) {
                    movement = Number(t.amount || 0);
                    isOutflow = true;
                }
            } else if (t.type === 'EXPENSE') {
                if (t.paymentMethod !== 'CREDIT' && !isDirectorSource) {
                    movement = Number(t.amount || 0);
                    isOutflow = true;
                }
            } else if (t.type === 'CREDIT_PAYMENT') {
                if (t.customerId && !isDirectorSource) {
                    movement = Number(t.amount || 0);
                    isOutflow = false;
                } else if (t.vendorId && !isDirectorSource) {
                    movement = Number(t.amount || 0);
                    isOutflow = true;
                }
            } else if (t.type === 'LOAN_GIVEN') {
                if (!isDirectorSource) {
                    movement = Number(t.amount || 0);
                    isOutflow = true;
                }
            } else if (t.type === 'TRANSFER') {
                if (t.accountId === 'cash' && isDirectorDest) {
                    movement = Number(t.amount || 0);
                    isOutflow = true;
                } else if (t.destinationAccountId === 'cash' && isDirectorSource) {
                    movement = Number(t.amount || 0);
                    isOutflow = false;
                }
            } else if (t.type === 'JOURNAL') {
                const debitAccount = t.category;
                const creditAccount = t.mainCategory;
                if (debitAccount === 'Cash / Bank') {
                    movement = Number(t.amount || 0);
                    isOutflow = false;
                } else if (creditAccount === 'Cash / Bank') {
                    movement = Number(t.amount || 0);
                    isOutflow = true;
                }
            }

            if (movement !== 0) {
                const absAmt = Math.abs(movement);
                if (isOutflow) {
                    totalOutflowsUpToDate += absAmt;
                } else {
                    totalInflowsUpToDate += absAmt;
                }
            }
        });

        const netCashMovementUpToDate = totalInflowsUpToDate - totalOutflowsUpToDate;
        cashAndBank = Math.max(0, netCashMovementUpToDate);

        // 2. ACCOUNTS RECEIVABLE (Backtracked based on transactions after endDay)
        const customerCredits: Record<string, number> = { ...customers.reduce((map, c) => ({ ...map, [c.id]: Number(c.totalCredit || 0) }), {} as Record<string, number>) };
        transactions.forEach(t => {
            const txDate = t.date.split('T')[0];
            if (txDate > endDay) {
                const amt = Number(t.amount || 0);
                if (t.customerId) {
                    if (t.type === 'SALE' && t.paymentMethod === 'CREDIT') {
                        customerCredits[t.customerId] = (customerCredits[t.customerId] || 0) - amt;
                    } else if (t.type === 'CREDIT_PAYMENT' || t.type === 'TRANSFER') {
                        customerCredits[t.customerId] = (customerCredits[t.customerId] || 0) + amt;
                    }
                }
            }
        });

        let accountsReceivable = 0;
        if (selectedCashier === 'ALL CASHIERS') {
            // Only sum positive balances (debtors) to prevent advances from wiping out AR assets
            accountsReceivable = Object.values(customerCredits)
                .filter((val: number) => val > 0)
                .reduce((sum: number, val: number) => sum + val, 0);
        } else {
            // Proportional allocation of actual backtracked customer credits based on cashier origination
            const origination: Record<string, Record<string, number>> = {};
            customers.forEach(c => {
                origination[c.id] = { [selectedCashier]: 0, OTHER: 0 };
            });

            transactions.forEach(t => {
                const txDate = t.date.split('T')[0];
                if (txDate <= endDay && t.status !== 'VOID' && t.status !== 'DRAFT') {
                    const amt = Number(t.amount || 0);
                    const cashier = t.branchId;
                    const custId = t.customerId;

                    if (cashier && custId && origination[custId]) {
                        if (t.type === 'SALE' || t.type === 'SALE_HISTORY_IMPORT' || t.type === 'LOAN_GIVEN') {
                            const creditAmt = t.paymentMethod === 'CREDIT' ? amt : (Number(t.balanceDue) || 0);
                            if (cashier === selectedCashier) {
                                origination[custId][selectedCashier] += creditAmt;
                            } else {
                                origination[custId]['OTHER'] += creditAmt;
                            }
                        }
                    }
                }
            });

            let allocatedSum = 0;
            customers.forEach(c => {
                const custBal = customerCredits[c.id] || 0;
                if (custBal > 0) {
                    const cashierOrig = origination[c.id]?.[selectedCashier] || 0;
                    const otherOrig = origination[c.id]?.['OTHER'] || 0;
                    const totalOrig = cashierOrig + otherOrig;

                    if (totalOrig > 0) {
                        allocatedSum += custBal * (cashierOrig / totalOrig);
                    } else {
                        // Default fallback if no origination: assign to main cashier
                        if (selectedCashier === 'CASHIER 1') {
                            allocatedSum += custBal;
                        }
                    }
                }
            });
            accountsReceivable = allocatedSum;
        }

        // 3. INVENTORY (Backtracked to endDay)
        const inventory = products.reduce((sum, p) => {
            let stock = selectedCashier === 'ALL CASHIERS'
                ? Number(p.stock || 0)
                : Number(p.branchStocks?.[selectedCashier] || 0);

            transactions.forEach(t => {
                if (t.status === 'VOID' || t.status === 'DRAFT') return;
                const txDate = t.date.split('T')[0];
                if (txDate > endDay) {
                    const cashierMatch = selectedCashier === 'ALL CASHIERS' || t.branchId === selectedCashier;
                    if (!cashierMatch) return;

                    if (t.type === 'SALE' || t.type === 'SALE_HISTORY_IMPORT') {
                        t.items?.forEach(item => {
                            if (item.productId === p.id) {
                                stock += Number(item.quantity || 0);
                            }
                        });
                    } else if (t.type === 'PURCHASE') {
                        t.items?.forEach(item => {
                            if (item.productId === p.id) {
                                stock -= Number(item.quantity || 0);
                            }
                        });
                    }
                }
            });

            return sum + (Math.max(0, stock) * Number(p.cost || 0));
        }, 0);

        // 4. FIXED ASSETS
        const fixedAssetsTotal = fixedAssets.reduce((sum, fa) => sum + Number(fa.currentValue || 0), 0);

        // 5. ACCOUNTS PAYABLE (Backtracked based on transactions after endDay)
        const vendorBalances: Record<string, number> = { ...vendors.reduce((map, v) => ({ ...map, [v.id]: Number(v.totalBalance || 0) }), {} as Record<string, number>) };
        transactions.forEach(t => {
            const txDate = t.date.split('T')[0];
            if (txDate > endDay) {
                const amt = Number(t.amount || 0);
                if (t.vendorId) {
                    if (t.type === 'PURCHASE' && t.paymentMethod === 'CREDIT') {
                        vendorBalances[t.vendorId] = (vendorBalances[t.vendorId] || 0) - amt;
                    } else if (t.type === 'CREDIT_PAYMENT') {
                        vendorBalances[t.vendorId] = (vendorBalances[t.vendorId] || 0) + amt;
                    }
                }
            }
        });
        const rawAccountsPayable = Math.max(0, Object.values(vendorBalances).reduce((sum: number, val: number) => sum + val, 0));

        // Calculate manual journal adjustments for non-cash balance sheet accounts
        let journalARAdj = 0;
        let journalInventoryAdj = 0;
        let journalFixedAssetsAdj = 0;
        let journalAPAdj = 0;
        let journalAccumDepAdj = 0;

        transactions.forEach(t => {
            if (t.status === 'VOID' || t.status === 'DRAFT' || t.type !== 'JOURNAL') return;
            const txDate = t.date.split('T')[0];
            if (txDate > endDay) return;
            
            const cashierMatch = selectedCashier === 'ALL CASHIERS' || t.branchId === selectedCashier;
            if (!cashierMatch) return;

            const amt = Number(t.amount || 0);
            
            // Debit adjustments
            if (t.category === 'Accounts Receivable') journalARAdj += amt;
            else if (t.category === 'Inventory Asset') journalInventoryAdj += amt;
            else if (t.category === 'Fixed Assets') journalFixedAssetsAdj += amt;
            else if (t.category === 'Accumulated Depreciation') journalAccumDepAdj -= amt;
            else if (t.category === 'Accounts Payable') journalAPAdj -= amt;

            // Credit adjustments
            if (t.mainCategory === 'Accounts Receivable') journalARAdj -= amt;
            else if (t.mainCategory === 'Inventory Asset') journalInventoryAdj -= amt;
            else if (t.mainCategory === 'Fixed Assets') journalFixedAssetsAdj -= amt;
            else if (t.mainCategory === 'Accumulated Depreciation') journalAccumDepAdj += amt;
            else if (t.mainCategory === 'Accounts Payable') journalAPAdj += amt;
        });

        const finalAccountsReceivable = Math.max(0, accountsReceivable + journalARAdj);
        const finalInventory = Math.max(0, inventory + journalInventoryAdj);
        
        // Gross Fixed Assets cost basis
        const fixedAssetsCost = fixedAssets.reduce((sum, fa) => sum + Number(fa.purchasePrice || 0), 0);
        const finalFixedAssetsCost = Math.max(0, fixedAssetsCost + journalFixedAssetsAdj);
        
        // Accumulated Depreciation contra-asset
        const autoDepreciation = fixedAssets.reduce((sum, fa) => sum + (Number(fa.purchasePrice || 0) - Number(fa.currentValue || 0)), 0);
        const finalAccumulatedDepreciation = Math.max(0, autoDepreciation + journalAccumDepAdj);
        
        const finalAccountsPayable = Math.max(0, rawAccountsPayable + journalAPAdj);

        // Assets = Cash + AR + Inventory + Net Fixed Assets (Gross - AccumDep)
        const totalAssets = cashAndBank + finalAccountsReceivable + finalInventory + (finalFixedAssetsCost - finalAccumulatedDepreciation);
        
        const accruedExpenses = transactions.filter(t => {
            const txDate = t.date.split('T')[0];
            if (txDate > endDay) return false;
            if (t.type !== 'EXPENSE') return false;
            
            const cashierMatch = selectedCashier === 'ALL CASHIERS' || t.branchId === selectedCashier;
            if (!cashierMatch) return false;
            
            if (t.paymentMethod === 'CREDIT' && t.status !== 'VOID') return true;
            
            const isAccrued = t.id.startsWith('EX-CREDIT-');
            if (isAccrued && t.updatedAt && t.updatedAt.split('T')[0] > endDay) return true;
            
            return false;
        }).reduce((sum, t) => sum + Number(t.amount || 0), 0);

        // Calculate Director C/A Balance
        const directorCAAccount = accounts.find(acc => getAccountLedgerName(acc.id) === 'Director C/A');
        const currentDirectorCAVal = directorCAAccount ? Number(directorCAAccount.balance || 0) : 0;

        let directorCAMovementAfterEndDay = 0;
        transactions.forEach(t => {
            if (t.status === 'VOID' || t.status === 'DRAFT') return;
            const txDate = t.date.split('T')[0];
            if (txDate > endDay) {
                const amt = Number(t.amount || 0);
                const isDirectorSource = t.accountId && getAccountLedgerName(t.accountId) === 'Director C/A';
                const isDirectorDest = t.destinationAccountId && getAccountLedgerName(t.destinationAccountId) === 'Director C/A';

                if (t.type === 'TRANSFER') {
                    if (isDirectorSource) directorCAMovementAfterEndDay += amt;
                    if (isDirectorDest) directorCAMovementAfterEndDay -= amt;
                } else if (t.type === 'JOURNAL') {
                    const debitAccount = t.category;
                    const creditAccount = t.mainCategory;
                    if (debitAccount === 'Director C/A') directorCAMovementAfterEndDay -= amt;
                    if (creditAccount === 'Director C/A') directorCAMovementAfterEndDay += amt;
                } else {
                    const isOutflow = ['PURCHASE', 'EXPENSE', 'CREDIT_PAYMENT'].includes(t.type) || (t.type === 'LOAN_GIVEN');
                    if (isDirectorSource) {
                        if (isOutflow) directorCAMovementAfterEndDay += amt;
                        else directorCAMovementAfterEndDay -= amt;
                    }
                }
            }
        });
        const totalDirectorCAAtDate = currentDirectorCAVal - directorCAMovementAfterEndDay;

        const totalLiabilities = finalAccountsPayable + accruedExpenses + totalDirectorCAAtDate;

        // 6. EQUITY
        const totalEquity = totalAssets - totalLiabilities;

        return {
            assets: {
                cashAndBank,
                accountsReceivable: finalAccountsReceivable,
                inventory: finalInventory,
                fixedAssets: finalFixedAssetsCost,
                accumulatedDepreciation: finalAccumulatedDepreciation,
                total: totalAssets
            },
            liabilities: {
                accountsPayable: finalAccountsPayable,
                accruedExpenses,
                directorCA: totalDirectorCAAtDate,
                total: totalLiabilities
            },
            equity: {
                total: totalEquity
            }
        };
    }, [accounts, customers, vendors, products, fixedAssets, transactions, endDate, selectedCashier, daySessions]);

    // Accounts Receivable Breakup details calculation (as of endDate, with cashier origination & journal adjustments)
    const arBreakupDetails = useMemo(() => {
        const endDay = endDate ? endDate : getTodayLocal();
        
        // Backtrack customer credit balances as of endDay
        const customerCredits: Record<string, number> = { ...customers.reduce((map, c) => ({ ...map, [c.id]: Number(c.totalCredit || 0) }), {} as Record<string, number>) };
        
        transactions.forEach(t => {
            if (t.status === 'VOID' || t.status === 'DRAFT') return;
            const txDate = t.date.split('T')[0];
            if (txDate > endDay) {
                const amt = Number(t.amount || 0);
                if (t.customerId) {
                    if ((t.type === 'SALE' || t.type === 'SALE_HISTORY_IMPORT' || t.type === 'LOAN_GIVEN') && t.paymentMethod === 'CREDIT') {
                        customerCredits[t.customerId] = (customerCredits[t.customerId] || 0) - amt;
                    } else if (t.type === 'CREDIT_PAYMENT' || t.type === 'TRANSFER') {
                        customerCredits[t.customerId] = (customerCredits[t.customerId] || 0) + amt;
                    }
                }
            }
        });

        // Cashier origination mapping if filtered by cashier
        const origination: Record<string, Record<string, number>> = {};
        if (selectedCashier !== 'ALL CASHIERS') {
            customers.forEach(c => {
                origination[c.id] = { [selectedCashier]: 0, OTHER: 0 };
            });

            transactions.forEach(t => {
                const txDate = t.date.split('T')[0];
                if (txDate <= endDay && t.status !== 'VOID' && t.status !== 'DRAFT') {
                    const amt = Number(t.amount || 0);
                    const cashier = t.branchId;
                    const custId = t.customerId;

                    if (cashier && custId && origination[custId]) {
                        if (t.type === 'SALE' || t.type === 'SALE_HISTORY_IMPORT' || t.type === 'LOAN_GIVEN') {
                            const creditAmt = t.paymentMethod === 'CREDIT' ? amt : (Number(t.balanceDue) || 0);
                            if (cashier === selectedCashier) {
                                origination[custId][selectedCashier] += creditAmt;
                            } else {
                                origination[custId]['OTHER'] += creditAmt;
                            }
                        }
                    }
                }
            });
        }

        const breakup: Array<{
            customer: Customer;
            rawAsOfCredit: number;
            allocatedCredit: number;
        }> = [];

        customers.forEach(c => {
            const rawBal = customerCredits[c.id] || 0;
            let allocated = 0;
            if (rawBal > 0) {
                if (selectedCashier === 'ALL CASHIERS') {
                    allocated = rawBal;
                } else {
                    const cashierOrig = origination[c.id]?.[selectedCashier] || 0;
                    const otherOrig = origination[c.id]?.['OTHER'] || 0;
                    const totalOrig = cashierOrig + otherOrig;

                    if (totalOrig > 0) {
                        allocated = rawBal * (cashierOrig / totalOrig);
                    } else if (selectedCashier === 'CASHIER 1') {
                        allocated = rawBal;
                    }
                }
            }
            if (allocated > 0) {
                breakup.push({
                    customer: c,
                    rawAsOfCredit: Math.max(0, rawBal),
                    allocatedCredit: Math.round(allocated)
                });
            }
        });

        breakup.sort((a, b) => b.allocatedCredit - a.allocatedCredit);

        const totalCustomerReceivables = breakup.reduce((sum, item) => sum + item.allocatedCredit, 0);

        let journalARAdj = 0;
        transactions.forEach(t => {
            if (t.status === 'VOID' || t.status === 'DRAFT' || t.type !== 'JOURNAL') return;
            const txDate = t.date.split('T')[0];
            if (txDate > endDay) return;

            const cashierMatch = selectedCashier === 'ALL CASHIERS' || t.branchId === selectedCashier;
            if (!cashierMatch) return;

            const amt = Number(t.amount || 0);
            if (t.category === 'Accounts Receivable') journalARAdj += amt;
            if (t.mainCategory === 'Accounts Receivable') journalARAdj -= amt;
        });

        return {
            endDay,
            breakup,
            totalCustomerReceivables,
            journalARAdj,
            netTotal: Math.max(0, totalCustomerReceivables + journalARAdj)
        };
    }, [customers, transactions, endDate, selectedCashier]);

    // Accounts Payable (Vendors) Breakup details calculation (as of endDate, with cashier origination & journal adjustments)
    const apBreakupDetails = useMemo(() => {
        const endDay = endDate ? endDate : getTodayLocal();
        
        // Backtrack vendor payable balances as of endDay
        const vendorBalances: Record<string, number> = { 
            ...vendors.reduce((map, v) => ({ ...map, [v.id]: Number(v.totalBalance || 0) }), {} as Record<string, number>) 
        };

        transactions.forEach(t => {
            if (t.status === 'VOID' || t.status === 'DRAFT') return;
            const txDate = t.date.split('T')[0];
            if (txDate > endDay) {
                const amt = Number(t.amount || 0);
                if (t.vendorId) {
                    if (t.type === 'PURCHASE' && t.paymentMethod === 'CREDIT') {
                        vendorBalances[t.vendorId] = (vendorBalances[t.vendorId] || 0) - amt;
                    } else if (t.type === 'CREDIT_PAYMENT') {
                        vendorBalances[t.vendorId] = (vendorBalances[t.vendorId] || 0) + amt;
                    }
                }
            }
        });

        // Origination mapping if cashier is filtered
        const origination: Record<string, Record<string, number>> = {};
        if (selectedCashier !== 'ALL CASHIERS') {
            vendors.forEach(v => {
                origination[v.id] = { [selectedCashier]: 0, OTHER: 0 };
            });

            transactions.forEach(t => {
                const txDate = t.date.split('T')[0];
                if (txDate <= endDay && t.status !== 'VOID' && t.status !== 'DRAFT') {
                    const amt = Number(t.amount || 0);
                    const cashier = t.branchId;
                    const vId = t.vendorId;

                    if (cashier && vId && origination[vId]) {
                        if (t.type === 'PURCHASE' && t.paymentMethod === 'CREDIT') {
                            if (cashier === selectedCashier) {
                                origination[vId][selectedCashier] += amt;
                            } else {
                                origination[vId]['OTHER'] += amt;
                            }
                        }
                    }
                }
            });
        }

        const breakup: Array<{
            vendor: Vendor;
            rawAsOfBalance: number;
            allocatedBalance: number;
        }> = [];

        vendors.forEach(v => {
            const rawBal = vendorBalances[v.id] || 0;
            let allocated = 0;
            if (rawBal > 0) {
                if (selectedCashier === 'ALL CASHIERS') {
                    allocated = rawBal;
                } else {
                    const cashierOrig = origination[v.id]?.[selectedCashier] || 0;
                    const otherOrig = origination[v.id]?.['OTHER'] || 0;
                    const totalOrig = cashierOrig + otherOrig;

                    if (totalOrig > 0) {
                        allocated = rawBal * (cashierOrig / totalOrig);
                    } else if (selectedCashier === 'CASHIER 1') {
                        allocated = rawBal;
                    }
                }
            }
            if (allocated > 0) {
                breakup.push({
                    vendor: v,
                    rawAsOfBalance: Math.max(0, rawBal),
                    allocatedBalance: Math.round(allocated)
                });
            }
        });

        breakup.sort((a, b) => b.allocatedBalance - a.allocatedBalance);

        const totalVendorPayables = breakup.reduce((sum, item) => sum + item.allocatedBalance, 0);

        let journalAPAdj = 0;
        transactions.forEach(t => {
            if (t.status === 'VOID' || t.status === 'DRAFT' || t.type !== 'JOURNAL') return;
            const txDate = t.date.split('T')[0];
            if (txDate > endDay) return;

            const cashierMatch = selectedCashier === 'ALL CASHIERS' || t.branchId === selectedCashier;
            if (!cashierMatch) return;

            const amt = Number(t.amount || 0);
            if (t.category === 'Accounts Payable') journalAPAdj += amt;
            if (t.mainCategory === 'Accounts Payable') journalAPAdj -= amt;
        });

        return {
            endDay,
            breakup,
            totalVendorPayables,
            journalAPAdj,
            netTotal: Math.max(0, totalVendorPayables + journalAPAdj)
        };
    }, [vendors, transactions, endDate, selectedCashier]);

    // Income Statement Calculations
    const incomeStatement = useMemo(() => {
        const getTxRealizedInflow = (t: Transaction) => {
            if (t.type === 'SALE') return Number(t.paidAmount || (t.paymentMethod !== 'CREDIT' ? t.amount : 0));
            if (t.type === 'CREDIT_PAYMENT' || t.type === 'SALE_HISTORY_IMPORT') return Number(t.amount || 0);
            return 0;
        };

        const getTxCostBasis = (t: Transaction) => {
            if (t.costBasis !== undefined) return t.costBasis;
            let fallback = 0;
            t.items?.forEach(item => {
                const p = products.find(prod => prod.id === item.productId);
                if (p) {
                    const category = categories.find(c => c.id === p.categoryId);
                    if (isHotReloadItem(item, p, category, t.description)) {
                        // Reload cost approx 96%
                        fallback += (Number(item.price) * Number(item.quantity) * 0.96);
                    } else {
                        fallback += Number(p.cost || 0) * Number(item.quantity);
                    }
                }
            });
            return fallback;
        };

        // Calculate manual journal adjustments for revenue, COGS, and depreciation expense
        let journalRevenue = 0;
        let journalCogs = 0;
        let journalDepExpense = 0;
        filteredTransactions.forEach(t => {
            if (t.status === 'VOID' || t.status === 'DRAFT') return;
            if (t.type === 'JOURNAL') {
                const amt = Number(t.amount || 0);
                if (t.mainCategory === 'Sales Revenue') {
                    journalRevenue += amt; // Credit increases revenue
                }
                if (t.category === 'Sales Revenue') {
                    journalRevenue -= amt; // Debit decreases revenue
                }
                if (t.category === 'Cost of Goods Sold (COGS)') {
                    journalCogs += amt; // Debit increases COGS
                }
                if (t.mainCategory === 'Cost of Goods Sold (COGS)') {
                    journalCogs -= amt; // Credit decreases COGS
                }
                if (t.category === 'Depreciation Expense') {
                    journalDepExpense += amt; // Debit increases depreciation expense
                }
                if (t.mainCategory === 'Depreciation Expense') {
                    journalDepExpense -= amt; // Credit decreases depreciation expense
                }
            }
        });

        // REVENUE
        const revenue = filteredTransactions
            .filter(t => t.type === 'SALE' || t.type === 'SALE_HISTORY_IMPORT')
            .reduce((acc, t) => acc + Number(t.amount || 0), 0) + journalRevenue;

        // COST OF GOODS SOLD
        let cogs = 0;
        filteredTransactions.forEach(tx => {
            if (tx.type === 'SALE') {
                cogs += getTxCostBasis(tx);
            }
        });
        cogs += journalCogs;

        const grossProfit = revenue - cogs;
        const grossMargin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;

        // OPERATING EXPENSES
        const expenseGroups: Record<string, number> = {};
        let totalExpenses = 0;

        filteredTransactions
            .filter(t => t.type === 'EXPENSE')
            .forEach(t => {
                const amount = Number(t.amount || 0);
                const subCat = (t.category || '').toUpperCase().trim();
                const mainCat = (t.mainCategory || '').toUpperCase().trim();

                let displayName = '';

                // Helper to match a raw category string to a standard operating expenditure name
                const getStandardGroupName = (cat: string): string | null => {
                    if (cat === 'RENT' || cat === ' RENT') return 'Rent';
                    if (cat === 'INSURENCE PAYMENT' || cat === 'INSURANCE PAYMENT') return 'Insurance Payment';
                    if (cat === 'TRANSPORT') return 'Transport';
                    if (cat === 'UTILITIES' || cat.startsWith('UTILITIES') || cat.startsWith('CEB') || cat.startsWith('ELECTRICITY') || cat.startsWith('WATER')) return 'Utilities';
                    if (cat === 'INSURENCE' || cat === 'INSURANCE' || cat.startsWith('INSURENCE') || cat.startsWith('INSURANCE')) return 'Insurance';
                    if (cat === 'ADMIN') return 'Admin';
                    if (cat.includes('MAINT') || cat.includes('REPAIR') || cat.includes('OFFICE MAINT')) return 'Office Maintenance';
                    return null;
                };

                // 1. Try to match sub-category first
                let matchedGroup = getStandardGroupName(subCat);
                
                // 2. If not matched, try to match main-category
                if (!matchedGroup) {
                    matchedGroup = getStandardGroupName(mainCat);
                }

                if (matchedGroup) {
                    displayName = matchedGroup;
                } else {
                    // 3. Fallback to the sub-category name (or main-category if sub-category is empty)
                    const rawName = t.category || t.mainCategory || 'Uncategorized';
                    displayName = rawName.trim().split(' ')
                        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
                        .join(' ');
                }

                if (!expenseGroups[displayName]) {
                    expenseGroups[displayName] = 0;
                }
                expenseGroups[displayName] += amount;
                totalExpenses += amount;
            });

        // Add JOURNAL Operating Expenses
        const isOpExpAcc = (acc?: string) => {
            if (!acc) return false;
            const opAccounts = ['Operating Expenses', 'Rent', 'Office Maintaince', 'Insurance Payment', 'Office Maintaince Phone', 'Utilities', 'Transport', 'Uncategorized'];
            return opAccounts.includes(acc) || acc.toUpperCase().includes('EXPENSE') || acc.toUpperCase().includes('MAINTAINCE');
        };

        filteredTransactions
            .filter(t => t.type === 'JOURNAL')
            .forEach(t => {
                const amount = Number(t.amount || 0);
                if (isOpExpAcc(t.category)) {
                    const displayName = t.category === 'Operating Expenses' ? (t.description || 'Uncategorized Operating Expense') : t.category;
                    if (!expenseGroups[displayName]) {
                        expenseGroups[displayName] = 0;
                    }
                    expenseGroups[displayName] += amount;
                    totalExpenses += amount;
                }
                if (isOpExpAcc(t.mainCategory)) {
                    const displayName = t.mainCategory === 'Operating Expenses' ? (t.description || 'Uncategorized Operating Expense') : t.mainCategory;
                    if (!expenseGroups[displayName]) {
                        expenseGroups[displayName] = 0;
                    }
                    expenseGroups[displayName] -= amount;
                    totalExpenses -= amount;
                }
            });

        const sortedExpenseBreakdown = Object.entries(expenseGroups)
            .filter(([, amt]) => amt > 0)
            .sort(([, a], [, b]) => b - a);

        // Calculate Depreciation Expense (auto-depreciation + manual adjustments)
        const autoDepreciation = fixedAssets.reduce((sum, fa) => sum + (Number(fa.purchasePrice || 0) - Number(fa.currentValue || 0)), 0);
        const depreciationExpense = autoDepreciation + journalDepExpense;

        const operatingIncome = grossProfit - totalExpenses - depreciationExpense;
        const netIncome = operatingIncome;
        const netMargin = revenue > 0 ? (netIncome / revenue) * 100 : 0;

        return {
            revenue,
            cogs,
            grossProfit,
            grossMargin,

            expenses: totalExpenses,
            depreciationExpense,
            expenseBreakdown: sortedExpenseBreakdown,
            operatingIncome,
            netIncome,
            netMargin
        };
    }, [filteredTransactions, products, categories, fixedAssets]);

    // Profit & Loss Ledger Calculations
    const profitLossLedgerData = useMemo(() => {
        const pnlTransactions = filteredTransactions.filter(t => t.status !== 'VOID' && t.status !== 'DRAFT' && (t.type === 'SALE' || t.type === 'SALE_HISTORY_IMPORT' || t.type === 'EXPENSE' || t.type === 'JOURNAL'));

        let totalRevenue = 0;
        let totalCogs = 0;
        let totalExpenses = 0;

        const stream = pnlTransactions.map(t => {
            let revenue = 0;
            let cogs = 0;
            let expense = 0;
            let netProfitContrib = 0;

            if (t.type === 'SALE' || t.type === 'SALE_HISTORY_IMPORT') {
                revenue = Number(t.amount || 0);
                totalRevenue += revenue;

                if (t.type === 'SALE') {
                    if (t.costBasis !== undefined) {
                        cogs = t.costBasis;
                    } else {
                        t.items?.forEach(item => {
                            const p = products.find(prod => prod.id === item.productId);
                            if (p) {
                                const category = categories.find(c => c.id === p.categoryId);
                                if (isHotReloadItem(item, p, category, t.description)) {
                                    cogs += (Number(item.price) * Number(item.quantity) * 0.96);
                                } else {
                                    cogs += Number(p.cost || 0) * Number(item.quantity);
                                }
                            }
                        });
                    }
                }
                totalCogs += cogs;
                netProfitContrib = revenue - cogs;
            } else if (t.type === 'EXPENSE') {
                expense = Number(t.amount || 0);
                totalExpenses += expense;
                netProfitContrib = -expense;
            } else if (t.type === 'JOURNAL') {
                const debit = t.category;
                const credit = t.mainCategory;
                const amt = Number(t.amount || 0);

                const isOpExpAcc = (acc?: string) => {
                    if (!acc) return false;
                    const opAccounts = ['Operating Expenses', 'Rent', 'Office Maintaince', 'Insurance Payment', 'Office Maintaince Phone', 'Utilities', 'Transport', 'Uncategorized'];
                    return opAccounts.includes(acc) || acc.toUpperCase().includes('EXPENSE') || acc.toUpperCase().includes('MAINTAINCE');
                };

                if (isOpExpAcc(debit) || isOpExpAcc(credit)) {
                    expense = isOpExpAcc(debit) ? amt : -amt;
                    totalExpenses += expense;
                    netProfitContrib = -expense;
                }
                if (debit === 'Sales Revenue' || credit === 'Sales Revenue') {
                    revenue = credit === 'Sales Revenue' ? amt : -amt;
                    totalRevenue += revenue;
                    netProfitContrib = revenue;
                }
                if (debit === 'Cost of Goods Sold (COGS)' || credit === 'Cost of Goods Sold (COGS)') {
                    cogs = debit === 'Cost of Goods Sold (COGS)' ? amt : -amt;
                    totalCogs += cogs;
                    netProfitContrib = -cogs;
                }
            }

            return {
                id: t.id,
                date: t.date,
                type: t.type,
                category: t.category || t.mainCategory || (t.type === 'SALE' ? 'Direct Sales' : 'General Expense'),
                description: t.description || (t.type === 'SALE' ? `Sale (${t.items?.length || 0} SKUs)` : 'Expense'),
                revenue,
                cogs,
                expense,
                netProfitContrib,
                paymentMethod: t.paymentMethod,
                branchId: t.branchId || 'CASHIER 1',
                customerId: t.customerId,
                vendorId: t.vendorId
            };
        }).sort((a, b) => b.date.localeCompare(a.date));

        const grossProfit = totalRevenue - totalCogs;
        const netProfit = grossProfit - totalExpenses;
        const grossMarginPct = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;
        const netMarginPct = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

        return {
            totalRevenue,
            totalCogs,
            grossProfit,
            grossMarginPct,
            totalExpenses,
            netProfit,
            netMarginPct,
            stream
        };
    }, [filteredTransactions, products, categories]);

    const profitLossLedgerFilteredStream = useMemo(() => {
        return profitLossLedgerData.stream.filter(item => {
            const matchesType = pnlTypeFilter === 'ALL' || item.type === pnlTypeFilter;
            const matchesSearch = !pnlLedgerSearch ||
                item.id.toLowerCase().includes(pnlLedgerSearch.toLowerCase()) ||
                item.category.toLowerCase().includes(pnlLedgerSearch.toLowerCase()) ||
                item.description.toLowerCase().includes(pnlLedgerSearch.toLowerCase()) ||
                item.branchId.toLowerCase().includes(pnlLedgerSearch.toLowerCase());

            return matchesType && matchesSearch;
        });
    }, [profitLossLedgerData.stream, pnlTypeFilter, pnlLedgerSearch]);

    // Liabilities Calculations
    const liabilitiesData = useMemo(() => {
        const endDay = endDate ? endDate : getTodayLocal();

        // 1. Backtracked Vendor Balances (Accounts Payable)
        const vendorBalances: Record<string, number> = { 
            ...vendors.reduce((map, v) => ({ ...map, [v.id]: Number(v.totalBalance || 0) }), {} as Record<string, number>) 
        };

        transactions.forEach(t => {
            const txDate = t.date.split('T')[0];
            if (txDate > endDay) {
                const amt = Number(t.amount || 0);
                if (t.vendorId) {
                    if (t.type === 'PURCHASE' && t.paymentMethod === 'CREDIT') {
                        vendorBalances[t.vendorId] = (vendorBalances[t.vendorId] || 0) - amt;
                    } else if (t.type === 'CREDIT_PAYMENT') {
                        vendorBalances[t.vendorId] = (vendorBalances[t.vendorId] || 0) + amt;
                    }
                }
            }
        });

        // Filter vendors that have outstanding balances as of endDay
        const outstandingVendors = vendors.map(v => ({
            ...v,
            backtrackedBalance: vendorBalances[v.id] || 0
        })).filter(v => v.backtrackedBalance > 0);

        const totalAccountsPayable = outstandingVendors.reduce((sum, v) => sum + v.backtrackedBalance, 0);

        // 2. Identify Utility Commitments from transaction history (last 90 days to estimate monthly)
        const utilityCategories = {
            'Rent': ['RENT', ' RENT'],
            'Electricity': ['CEB', 'ELECTRICITY'],
            'Water': ['WATER'],
            'Telecom & Dialog': ['DIALOG', 'MOBITEL', 'TELECOM', 'INTERNET'],
            'Insurance': ['INSURENCE', 'INSURANCE']
        };

        const utilityCommitments: Record<string, { averageMonthly: number, lastPaymentDate: string, lastPaymentAmount: number, totalPayments: number }> = {};
        
        Object.keys(utilityCategories).forEach(cat => {
            utilityCommitments[cat] = { averageMonthly: 0, lastPaymentDate: 'N/A', lastPaymentAmount: 0, totalPayments: 0 };
        });

        // Analyze expenses up to endDay
        const utilityTxs = transactions.filter(t => {
            const txDate = t.date.split('T')[0];
            return t.type === 'EXPENSE' && txDate <= endDay && t.status !== 'VOID' && t.status !== 'DRAFT';
        });

        Object.entries(utilityCategories).forEach(([catName, keywords]) => {
            const catTxs = utilityTxs.filter(t => {
                const desc = (t.description || '').toUpperCase();
                const mainCat = (t.mainCategory || '').toUpperCase();
                const subCat = (t.category || '').toUpperCase();
                return keywords.some(k => desc.includes(k) || mainCat.includes(k) || subCat.includes(k));
            });

            if (catTxs.length > 0) {
                // Sort by date descending
                catTxs.sort((a, b) => b.date.localeCompare(a.date));
                const lastTx = catTxs[0];
                const lastDate = lastTx.date.split('T')[0];
                const lastAmt = lastTx.amount;
                const totalAmt = catTxs.reduce((sum, t) => sum + t.amount, 0);
                
                const uniqueMonths = new Set(catTxs.map(t => t.date.slice(0, 7)));
                const monthsCount = Math.max(1, uniqueMonths.size);
                const avgMonthly = totalAmt / monthsCount;

                utilityCommitments[catName] = {
                    averageMonthly: Math.round(avgMonthly),
                    lastPaymentDate: lastDate,
                    lastPaymentAmount: lastAmt,
                    totalPayments: catTxs.length
                };
            }
        });

        const totalUtilityMonthlyCommitment = Object.values(utilityCommitments).reduce((sum, c) => sum + c.averageMonthly, 0);

        return {
            outstandingVendors,
            totalAccountsPayable,
            utilityCommitments,
            totalUtilityMonthlyCommitment
        };
    }, [vendors, transactions, endDate]);

    // Category Wise Report
    const categoryReport = useMemo(() => {
        const report: Record<string, { revenue: number, cost: number, profit: number, count: number }> = {};

        filteredTransactions.forEach(t => {
            if (t.type === 'SALE' || t.type === 'SALE_HISTORY_IMPORT') {
                if (t.items) {
                    t.items.forEach(item => {
                        const product = products.find(p => p.id === item.productId);
                        const category = product?.categoryId ? categories.find(c => c.id === product.categoryId) : undefined;

                        // Exclude reload items from category report revenue/profit
                        // Exclude hot reload items from category report revenue/profit (covered by total line)
                        if (isHotReloadItem(item, product, category, t.description)) return;

                        const categoryName = category?.name || 'Uncategorized';
                        const revenue = (Number(item.quantity) * Number(item.price)) - (Number(item.discount) || 0);
                        const cost = Number(product?.cost || 0) * Number(item.quantity);
                        const profit = revenue - cost;

                        if (!report[categoryName]) {
                            report[categoryName] = { revenue: 0, cost: 0, profit: 0, count: 0 };
                        }
                        report[categoryName].revenue += revenue;
                        report[categoryName].cost += cost;
                        report[categoryName].profit += profit;
                        report[categoryName].count += Number(item.quantity);
                    });
                } else {
                    // Legacy No Item Tx
                    if (t.description.toUpperCase().includes('RELOAD')) return;

                    const categoryName = 'Uncategorized';
                    const revenue = Number(t.amount || 0);
                    if (!report[categoryName]) report[categoryName] = { revenue: 0, cost: 0, profit: 0, count: 0 };
                    report[categoryName].revenue += revenue;
                    report[categoryName].profit += revenue; // Assume 1 00% profit if unknown? Or 0 cost.
                    report[categoryName].count += 1;
                }
            }
        });

        return Object.entries(report)
            .map(([name, stats]) => ({
                name,
                ...stats,
                margin: stats.revenue > 0 ? (stats.profit / stats.revenue) * 100 : 0
            }))
            .sort((a, b) => b.revenue - a.revenue);

    }, [filteredTransactions, products, categories]);

    // Daily Summary Report: Date | Revenue | Reload Rev | Reload Prof | Purchases | Expense | Profit | Total Prof | Cumulative
    const dailySummaryReport = useMemo(() => {
        const dayMap: Record<string, { revenue: number; reloadRevenue: number; reloadProfit: number; purchases: number; expense: number; profit: number }> = {};

        transactions.forEach(t => {
            const txDateKey = t.date.split('T')[0];

            // Define standard date checks for Sales/Expenses
            const isWithinRange = (date: string) => (!startDate || date >= startDate) && (!endDate || date <= endDate);
            const cashierMatch = selectedCashier === 'ALL CASHIERS' || t.branchId === selectedCashier;

            // 1. REVENUE/PROFIT/RELOADS (Always on sale date)
            if (t.type === 'SALE' || t.type === 'SALE_HISTORY_IMPORT') {
                if (!isWithinRange(txDateKey) || !cashierMatch) return;
                if (!dayMap[txDateKey]) dayMap[txDateKey] = { revenue: 0, reloadRevenue: 0, reloadProfit: 0, purchases: 0, expense: 0, profit: 0 };

                if (t.items && t.items.length > 0) {
                    t.items.forEach(item => {
                        const p = products.find(prod => prod.id === item.productId);
                        const category = categories.find(c => c.id === p?.categoryId);
                        const lineTotal = (Number(item.quantity) * Number(item.price)) - (Number(item.discount) || 0);

                        if (isHotReloadItem(item, p, category, t.description)) {
                            const rate = getReloadProfitRate(item, p, category, t.description);
                            const rProfit = lineTotal * rate;
                            dayMap[txDateKey].reloadRevenue += lineTotal;
                            dayMap[txDateKey].reloadProfit += rProfit;
                        } else {
                            dayMap[txDateKey].revenue += lineTotal;
                            const cost = Number(p?.cost || 0) * Number(item.quantity);
                            dayMap[txDateKey].profit += lineTotal - cost;
                        }
                    });
                } else {
                    const amount = Number(t.amount || 0);
                    const isHot = t.description.toUpperCase().includes('RELOAD') && !t.description.toUpperCase().includes('CARD');
                    if (isHot) {
                        const rate = getReloadProfitRate(null, undefined, undefined, t.description);
                        const rProfit = amount * rate;
                        dayMap[txDateKey].reloadRevenue += amount;
                        dayMap[txDateKey].reloadProfit += rProfit;
                    } else {
                        dayMap[txDateKey].revenue += amount;
                        dayMap[txDateKey].profit += amount; // Zero cost assumption for unknown legacy?
                    }
                }
            }

            // 2. EXPENSE (On t.date)
            else if (t.type === 'EXPENSE') {
                if (!isWithinRange(txDateKey) || !cashierMatch) return;
                if (!dayMap[txDateKey]) dayMap[txDateKey] = { revenue: 0, reloadRevenue: 0, reloadProfit: 0, purchases: 0, expense: 0, profit: 0 };
                dayMap[txDateKey].expense += Number(t.amount || 0);
            }

            // 3. PURCHASES (Rule: On Payment - Cheque Date for cheques, skip Credit, include Settlements)
            else {
                let effectivePurchaseDate = "";
                let isPurchaseRelevant = false;

                if (t.type === 'PURCHASE') {
                    if (t.paymentMethod === 'CHEQUE' && t.chequeDate) {
                        effectivePurchaseDate = t.chequeDate;
                        isPurchaseRelevant = true;
                    } else if (t.paymentMethod === 'CREDIT') {
                        // Skip original credit PO transaction for the "Purchases" account
                        isPurchaseRelevant = false;
                    } else {
                        // CASH or BANK
                        effectivePurchaseDate = txDateKey;
                        isPurchaseRelevant = true;
                    }
                } else if (t.type === 'CREDIT_PAYMENT' && t.vendorId) {
                    // This is us paying a vendor (settling credit)
                    effectivePurchaseDate = txDateKey;
                    isPurchaseRelevant = true;
                }

                if (isPurchaseRelevant && effectivePurchaseDate && isWithinRange(effectivePurchaseDate) && cashierMatch) {
                    if (!isReloadPurchase(t)) {
                        if (!dayMap[effectivePurchaseDate]) dayMap[effectivePurchaseDate] = { revenue: 0, reloadRevenue: 0, reloadProfit: 0, purchases: 0, expense: 0, profit: 0 };
                        dayMap[effectivePurchaseDate].purchases += Number(t.amount || 0);
                    }
                }
            }
        });

        const sortedDates = Object.keys(dayMap).sort();
        let cumulative = 0;
        return sortedDates.map(date => {
            const rRevenue = Math.round(dayMap[date].revenue);
            const rReloadRevenue = Math.round(dayMap[date].reloadRevenue);
            const rReloadProfit = Math.round(dayMap[date].reloadProfit);
            const rPurchases = Math.round(dayMap[date].purchases);
            const rExpense = Math.round(dayMap[date].expense);
            const rProfit = Math.round(dayMap[date].profit);
            
            const rTotalProfit = rProfit + rReloadProfit;
            cumulative += rTotalProfit;

            return {
                date,
                revenue: rRevenue,
                reloadRevenue: rReloadRevenue,
                reloadProfit: rReloadProfit,
                purchases: rPurchases,
                expense: rExpense,
                profit: rProfit,
                totalProfit: rTotalProfit,
                cumulative: cumulative
            };
        });
    }, [transactions, startDate, endDate, selectedCashier, products, categories]);

    // Critical Stock Shortfall Report
    const criticalStockItems = useMemo(() => {
        return products
            .filter(p => {
                const stock = selectedCashier === 'ALL CASHIERS'
                    ? Number(p.stock || 0)
                    : Number(p.branchStocks?.[selectedCashier] || 0);
                return stock <= (Number(p.lowStockThreshold) || 10);
            })
            .sort((a, b) => {
                const stockA = selectedCashier === 'ALL CASHIERS' ? Number(a.stock || 0) : Number(a.branchStocks?.[selectedCashier] || 0);
                const stockB = selectedCashier === 'ALL CASHIERS' ? Number(b.stock || 0) : Number(b.branchStocks?.[selectedCashier] || 0);
                return stockA - stockB;
            });
    }, [products, selectedCashier]);

    // Purchases Calculations
    const purchasesReport = useMemo(() => {
        const list = filteredTransactions.filter(t => t.type === 'PURCHASE');
        return list.sort((a, b) => b.date.localeCompare(a.date));
    }, [filteredTransactions]);

    const purchasesSummary = useMemo(() => {
        let total = 0;
        let cashBank = 0;
        let credit = 0;
        purchasesReport.forEach(t => {
            const amt = Math.round(Number(t.amount || 0));
            total += amt;
            if (t.paymentMethod === 'CREDIT') {
                credit += amt;
            } else {
                cashBank += amt;
            }
        });
        return { total, cashBank, credit, count: purchasesReport.length };
    }, [purchasesReport]);

    const getVendorName = (id?: string) => {
        if (!id) return 'UNKNOWN VENDOR';
        const v = vendors.find(ven => ven.id.trim().toUpperCase() === id.trim().toUpperCase());
        return v ? v.name : 'UNKNOWN VENDOR';
    };

    const getTransactionPurchaseItems = (t: Transaction) => {
        const getVendorObj = (id?: string) => {
            if (!id) return null;
            return vendors.find(ven => ven.id.trim().toUpperCase() === id.trim().toUpperCase());
        };

        const vendor = getVendorObj(t.vendorId);
        const vendorName = vendor ? vendor.name : 'UNKNOWN VENDOR';
        const vendorPhone = vendor?.phone || 'N/A';
        const paymentMethod = t.paymentMethod || 'CASH';
        const branchId = t.branchId || 'MAIN';
        const txId = t.id;
        const date = t.date;

        const itemsList: Array<{
            txId: string;
            date: string;
            vendorName: string;
            vendorPhone: string;
            productName: string;
            sku: string;
            quantity: number;
            unitCost: number;
            lineTotal: number;
            paymentMethod: string;
            branchId: string;
        }> = [];

        // Check if there is a linked Purchase Order
        let linkedPO: PurchaseOrder | undefined;
        if (t.description) {
            const matches = t.description.match(/PO-[A-Za-z0-9_-]+/gi) || t.description.match(/PO-\d+/gi);
            if (matches && matches.length > 0) {
                const targetPoId = matches[0].trim().toUpperCase();
                linkedPO = purchaseOrders.find(p => p.id.trim().toUpperCase() === targetPoId || targetPoId.includes(p.id.trim().toUpperCase()) || p.id.trim().toUpperCase().includes(targetPoId));
            }
        }

        // Case 1: Direct t.items array
        if (t.items && t.items.length > 0) {
            t.items.forEach(item => {
                const prod = products.find(p => p.id === item.productId || p.sku === item.productId || p.name.trim().toUpperCase() === item.productId.trim().toUpperCase());
                let pName = prod ? prod.name : ((item as any).productName || item.productId);
                let sku = prod?.sku || (item as any).productSku || 'N/A';

                // If pName is "CASH" or generic ID and we have linkedPO, try pulling product details from PO
                if ((!prod || pName === 'CASH') && linkedPO && linkedPO.items && linkedPO.items.length > 0) {
                    const poItem = linkedPO.items.find(pi => pi.productId === item.productId);
                    if (poItem) {
                        const poProd = products.find(p => p.id === poItem.productId);
                        pName = poProd?.name || poItem.productName || pName;
                        sku = poProd?.sku || poItem.productSku || sku;
                    }
                }

                const qty = Number(item.quantity || 0);
                const unitCost = Number((item as any).cost || item.price || 0);
                const lineTotal = Math.round(qty * unitCost);
                itemsList.push({
                    txId,
                    date,
                    vendorName,
                    vendorPhone,
                    productName: pName,
                    sku,
                    quantity: qty,
                    unitCost,
                    lineTotal: lineTotal || Math.round(Number(t.amount || 0)),
                    paymentMethod,
                    branchId
                });
            });
            return itemsList;
        }

        // Case 2: Unpack from Linked Purchase Order if t.items is empty
        if (linkedPO && linkedPO.items && linkedPO.items.length > 0) {
            linkedPO.items.forEach(item => {
                const prod = products.find(p => p.id === item.productId || p.sku === item.productSku || p.name.trim().toUpperCase() === (item.productName || '').trim().toUpperCase());
                const pName = prod?.name || item.productName || item.productId;
                const sku = prod?.sku || item.productSku || 'N/A';
                const qty = Number(item.quantity || 0);
                const unitCost = Number(item.cost || 0);
                const lineTotal = Math.round(qty * unitCost);
                itemsList.push({
                    txId,
                    date,
                    vendorName,
                    vendorPhone,
                    productName: pName,
                    sku,
                    quantity: qty,
                    unitCost,
                    lineTotal: lineTotal || Math.round(Number(t.amount || 0)),
                    paymentMethod,
                    branchId
                });
            });
            return itemsList;
        }

        // Case 3: Fallback single line for general purchases / loans
        const totalAmt = Math.round(Number(t.amount || 0));
        let cleanName = t.description || 'General Purchase';
        if (cleanName.includes('Stock Received against PO:')) {
            cleanName = cleanName.replace(/Stock Received against PO:\s*/i, '').trim();
        }

        itemsList.push({
            txId,
            date,
            vendorName,
            vendorPhone,
            productName: cleanName,
            sku: 'N/A',
            quantity: 1,
            unitCost: totalAmt,
            lineTotal: totalAmt,
            paymentMethod,
            branchId
        });

        return itemsList;
    };

    const getPurchaseItemDetailsStr = (t: Transaction) => {
        const items = getTransactionPurchaseItems(t);
        if (!items || items.length === 0) return t.description || 'General Purchase';
        return items.map(item => `${item.productName}${item.quantity ? ` (${item.quantity})` : ''}`).join(', ');
    };

    const itemizedPurchasesList = useMemo(() => {
        const allItems: Array<ReturnType<typeof getTransactionPurchaseItems>[0]> = [];
        purchasesReport.forEach(t => {
            const items = getTransactionPurchaseItems(t);
            allItems.push(...items);
        });
        return allItems;
    }, [purchasesReport, products, vendors, purchaseOrders]);

    const searchedPurchaseItems = useMemo(() => {
        if (!purchaseSearch) return itemizedPurchasesList;
        const query = purchaseSearch.toLowerCase();
        return itemizedPurchasesList.filter(item => {
            return item.productName.toLowerCase().includes(query) ||
                item.vendorName.toLowerCase().includes(query) ||
                item.sku.toLowerCase().includes(query) ||
                item.txId.toLowerCase().includes(query) ||
                item.paymentMethod.toLowerCase().includes(query);
        });
    }, [itemizedPurchasesList, purchaseSearch]);

    const searchedPurchases = useMemo(() => {
        if (!purchaseSearch) return purchasesReport;
        const query = purchaseSearch.toLowerCase();
        return purchasesReport.filter(t => {
            const vName = getVendorName(t.vendorId).toLowerCase();
            const desc = (t.description || '').toLowerCase();
            const payment = (t.paymentMethod || '').toLowerCase();
            const refId = (t.id || '').toLowerCase();
            return vName.includes(query) || desc.includes(query) || payment.includes(query) || refId.includes(query);
        });
    }, [purchasesReport, purchaseSearch, vendors]);



    // Balance Sheet Display Variables (rounded to prevent mismatch)
    const balanceSheetDisplay = useMemo(() => {
        const dispCashAndBank = Math.round(balanceSheet.assets.cashAndBank);
        const dispAccountsReceivable = Math.round(balanceSheet.assets.accountsReceivable);
        const dispInventory = Math.round(balanceSheet.assets.inventory);
        const dispFixedAssets = Math.round(balanceSheet.assets.fixedAssets);
        const dispAccumulatedDepreciation = Math.round(balanceSheet.assets.accumulatedDepreciation || 0);
        const dispTotalAssets = dispCashAndBank + dispAccountsReceivable + dispInventory + dispFixedAssets - dispAccumulatedDepreciation;

        const dispAccountsPayable = Math.round(balanceSheet.liabilities.accountsPayable);
        const dispAccruedExpenses = Math.round(balanceSheet.liabilities.accruedExpenses);
        const dispDirectorCA = Math.round(balanceSheet.liabilities.directorCA || 0);
        const dispTotalLiabilities = dispAccountsPayable + dispAccruedExpenses + dispDirectorCA;

        const dispTotalEquity = dispTotalAssets - dispTotalLiabilities;
        const dispShareCapital = 100000;
        const dispRetainedEarnings = dispTotalEquity - dispShareCapital;

        return {
            dispCashAndBank,
            dispAccountsReceivable,
            dispInventory,
            dispFixedAssets,
            dispAccumulatedDepreciation,
            dispTotalAssets,
            dispAccountsPayable,
            dispAccruedExpenses,
            dispDirectorCA,
            dispTotalLiabilities,
            dispTotalEquity,
            dispShareCapital,
            dispRetainedEarnings
        };
    }, [balanceSheet]);

    // Income Statement Display Variables (rounded to prevent mismatch)
    const incomeStatementDisplay = useMemo(() => {
        const dispRevenue = Math.round(incomeStatement.revenue);
        const dispCogs = Math.round(incomeStatement.cogs);
        const dispGrossProfit = dispRevenue - dispCogs;

        const dispDepreciationExpense = Math.round(incomeStatement.depreciationExpense || 0);
        const dispTotalExpenses = incomeStatement.expenseBreakdown.reduce((sum, [, amt]) => sum + Math.round(amt), 0);
        const dispOperatingIncome = dispGrossProfit - dispTotalExpenses - dispDepreciationExpense;
        const dispNetIncome = dispOperatingIncome;

        return {
            dispRevenue,
            dispCogs,
            dispGrossProfit,
            dispDepreciationExpense,
            dispTotalExpenses,
            dispOperatingIncome,
            dispNetIncome
        };
    }, [incomeStatement]);

    const handleExportBalanceSheetExcel = () => {
        const endDay = endDate ? endDate : getTodayLocal();
        const workbook = XLSX.utils.book_new();

        const data = [
            { SECTION: 'ASSETS', ITEM: 'Cash and Bank Balances', 'NOTE': '01', 'AMOUNT (Rs.)': balanceSheetDisplay.dispCashAndBank },
            { SECTION: 'ASSETS', ITEM: 'Accounts Receivable (Customers)', 'NOTE': '02', 'AMOUNT (Rs.)': balanceSheetDisplay.dispAccountsReceivable },
            { SECTION: 'ASSETS', ITEM: 'Inventory Stock Assets (At Cost)', 'NOTE': '03', 'AMOUNT (Rs.)': balanceSheetDisplay.dispInventory },
            { SECTION: 'ASSETS', ITEM: 'Fixed Assets (Plant, Equipment & Furniture)', 'NOTE': '04', 'AMOUNT (Rs.)': balanceSheetDisplay.dispFixedAssets },
            { SECTION: 'ASSETS', ITEM: 'Less: Accumulated Depreciation', 'NOTE': '', 'AMOUNT (Rs.)': -balanceSheetDisplay.dispAccumulatedDepreciation },
            { SECTION: 'ASSETS', ITEM: 'TOTAL ASSETS', 'NOTE': '', 'AMOUNT (Rs.)': balanceSheetDisplay.dispTotalAssets },
            { SECTION: '', ITEM: '', 'NOTE': '', 'AMOUNT (Rs.)': '' },
            { SECTION: 'LIABILITIES', ITEM: 'Accounts Payable (Vendors)', 'NOTE': '05', 'AMOUNT (Rs.)': balanceSheetDisplay.dispAccountsPayable },
            { SECTION: 'LIABILITIES', ITEM: 'Accrued Expenses (Unpaid Bills)', 'NOTE': '06', 'AMOUNT (Rs.)': balanceSheetDisplay.dispAccruedExpenses },
            { SECTION: 'LIABILITIES', ITEM: 'Director C/A (Current Account)', 'NOTE': '07', 'AMOUNT (Rs.)': balanceSheetDisplay.dispDirectorCA },
            { SECTION: 'LIABILITIES', ITEM: 'TOTAL LIABILITIES', 'NOTE': '', 'AMOUNT (Rs.)': balanceSheetDisplay.dispTotalLiabilities },
            { SECTION: '', ITEM: '', 'NOTE': '', 'AMOUNT (Rs.)': '' },
            { SECTION: "SHAREHOLDERS' FUNDS", ITEM: 'Share Capital', 'NOTE': '08', 'AMOUNT (Rs.)': balanceSheetDisplay.dispShareCapital },
            { SECTION: "SHAREHOLDERS' FUNDS", ITEM: 'Retained Earnings / (Loss)', 'NOTE': '09', 'AMOUNT (Rs.)': balanceSheetDisplay.dispRetainedEarnings },
            { SECTION: "SHAREHOLDERS' FUNDS", ITEM: "TOTAL SHAREHOLDERS' FUNDS", 'NOTE': '', 'AMOUNT (Rs.)': balanceSheetDisplay.dispTotalEquity },
            { SECTION: '', ITEM: '', 'NOTE': '', 'AMOUNT (Rs.)': '' },
            { SECTION: 'TOTAL', ITEM: "TOTAL LIABILITIES AND SHAREHOLDERS' FUNDS", 'NOTE': '', 'AMOUNT (Rs.)': balanceSheetDisplay.dispTotalLiabilities + balanceSheetDisplay.dispTotalEquity }
        ];

        const worksheet = XLSX.utils.json_to_sheet(data);
        worksheet['!cols'] = [{ wch: 25 }, { wch: 45 }, { wch: 10 }, { wch: 20 }];
        XLSX.utils.book_append_sheet(workbook, worksheet, "Balance Sheet");

        // Add Note sheets
        try {
            // Note 01
            const accsData = accounts.map(a => ({ 'ACCOUNT NAME': a.name, 'ACCOUNT NUMBER': a.accountNumber || 'N/A', 'BALANCE (Rs.)': Math.round(Number(a.balance || 0)) }));
            const ws01 = XLSX.utils.json_to_sheet(accsData);
            ws01['!cols'] = [{ wch: 35 }, { wch: 25 }, { wch: 20 }];
            XLSX.utils.book_append_sheet(workbook, ws01, "Note 01 - Cash & Bank");

            // Note 02
            const arData = customers.map(c => ({ 'CUSTOMER NAME': c.name, 'PHONE': c.phone || 'N/A', 'OUTSTANDING CREDIT (Rs.)': Number(c.totalCredit || 0) })).filter(c => c['OUTSTANDING CREDIT (Rs.)'] > 0);
            const ws02 = XLSX.utils.json_to_sheet(arData);
            ws02['!cols'] = [{ wch: 30 }, { wch: 18 }, { wch: 25 }];
            XLSX.utils.book_append_sheet(workbook, ws02, "Note 02 - AR");

            // Note 03
            const invData = products.map(p => {
                const stock = selectedCashier === 'ALL CASHIERS' ? Number(p.stock || 0) : Number(p.branchStocks?.[selectedCashier] || 0);
                const cost = Number(p.cost || 0);
                return { 'PRODUCT NAME': p.name, 'SKU': p.sku, 'STOCK QTY': stock, 'UNIT COST (Rs.)': cost, 'TOTAL ASSET VALUE (Rs.)': stock * cost };
            }).filter(p => p['STOCK QTY'] > 0);
            const ws03 = XLSX.utils.json_to_sheet(invData);
            ws03['!cols'] = [{ wch: 35 }, { wch: 15 }, { wch: 12 }, { wch: 18 }, { wch: 25 }];
            XLSX.utils.book_append_sheet(workbook, ws03, "Note 03 - Inventory");

            // Note 04
            const faData = fixedAssets.map(fa => ({ 'ASSET NAME': fa.name, 'CATEGORY': fa.category, 'PURCHASE DATE': fa.purchaseDate, 'CURRENT VALUE (Rs.)': fa.currentValue }));
            const ws04 = XLSX.utils.json_to_sheet(faData);
            ws04['!cols'] = [{ wch: 30 }, { wch: 20 }, { wch: 15 }, { wch: 22 }];
            XLSX.utils.book_append_sheet(workbook, ws04, "Note 04 - Fixed Assets");

            // Note 05
            const apData = vendors.map(v => ({ 'VENDOR NAME': v.name, 'PHONE': v.phone || 'N/A', 'OUTSTANDING BALANCE (Rs.)': Number(v.totalBalance || 0) })).filter(v => v['OUTSTANDING BALANCE (Rs.)'] > 0);
            const ws05 = XLSX.utils.json_to_sheet(apData);
            ws05['!cols'] = [{ wch: 30 }, { wch: 18 }, { wch: 25 }];
            XLSX.utils.book_append_sheet(workbook, ws05, "Note 05 - AP");

            // Note 06
            const accruedTxs = transactions.filter(t => t.status !== 'VOID' && t.status !== 'DRAFT' && t.date.split('T')[0] <= endDay && t.type === 'EXPENSE' && t.paymentMethod === 'CREDIT');
            const accRows = accruedTxs.map(t => ({ 'REFERENCE ID': t.id, 'DATE & TIME': formatDateTime(t.date), 'DESCRIPTION': t.description || 'N/A', 'CATEGORY': t.category || 'N/A', 'AMOUNT (Rs.)': Number(t.amount || 0) }));
            const ws06 = XLSX.utils.json_to_sheet(accRows);
            ws06['!cols'] = [{ wch: 22 }, { wch: 20 }, { wch: 35 }, { wch: 20 }, { wch: 20 }];
            XLSX.utils.book_append_sheet(workbook, ws06, "Note 06 - Accrued Expenses");

            // Note 07
            const dirRows = [{ 'METRIC': 'DIRECTOR C/A BALANCE (Rs.)', 'AMOUNT (Rs.)': balanceSheetDisplay.dispDirectorCA }];
            const ws07 = XLSX.utils.json_to_sheet(dirRows);
            ws07['!cols'] = [{ wch: 35 }, { wch: 25 }];
            XLSX.utils.book_append_sheet(workbook, ws07, "Note 07 - Director CA");

            // Note 08
            const scRows = [{ 'ACCOUNT NAME': 'TOTAL SHARE CAPITAL', 'BALANCE (Rs.)': balanceSheetDisplay.dispShareCapital }];
            const ws08 = XLSX.utils.json_to_sheet(scRows);
            ws08['!cols'] = [{ wch: 35 }, { wch: 25 }];
            XLSX.utils.book_append_sheet(workbook, ws08, "Note 08 - Share Capital");

            // Note 09
            const reRows = [{ 'STATEMENT ITEM': 'Retained Earnings / (Loss)', 'AMOUNT (Rs.)': balanceSheetDisplay.dispRetainedEarnings }];
            const ws09 = XLSX.utils.json_to_sheet(reRows);
            ws09['!cols'] = [{ wch: 45 }, { wch: 25 }];
            XLSX.utils.book_append_sheet(workbook, ws09, "Note 09 - Retained Earnings");
        } catch (e) { console.error(e); }

        downloadExcel(workbook, `BALANCE_SHEET_WITH_NOTES_${endDay}.xlsx`);
    };

    const handleExportIncomeStatementExcel = () => {
        const endDay = endDate ? endDate : getTodayLocal();
        const workbook = XLSX.utils.book_new();

        // 1. Main Income Statement Summary Sheet
        const data: any[] = [
            { SECTION: 'REVENUE', ITEM: 'Revenue (Direct Sales)', NOTE: '07', 'AMOUNT (Rs.)': incomeStatementDisplay.dispRevenue },
            { SECTION: 'REVENUE', ITEM: 'Less: Cost of Sales (COGS)', NOTE: '08', 'AMOUNT (Rs.)': -incomeStatementDisplay.dispCogs },
            { SECTION: 'REVENUE', ITEM: 'GROSS PROFIT', NOTE: '', 'AMOUNT (Rs.)': incomeStatementDisplay.dispGrossProfit },
            { SECTION: '', ITEM: '', NOTE: '', 'AMOUNT (Rs.)': '' },
            { SECTION: 'OPERATING EXPENSES', ITEM: 'OPERATING EXPENDITURE', NOTE: '', 'AMOUNT (Rs.)': '' },
            ...incomeStatement.expenseBreakdown.map(([cat, amt], idx) => ({
                SECTION: 'OPERATING EXPENSES',
                ITEM: cat,
                NOTE: String(9 + idx).padStart(2, '0'),
                'AMOUNT (Rs.)': Math.round(amt)
            })),
            { SECTION: 'OPERATING EXPENSES', ITEM: 'Depreciation Expense', NOTE: '', 'AMOUNT (Rs.)': incomeStatementDisplay.dispDepreciationExpense },
            { SECTION: 'OPERATING EXPENSES', ITEM: 'TOTAL OPERATING EXPENDITURE', NOTE: '', 'AMOUNT (Rs.)': incomeStatementDisplay.dispTotalExpenses + incomeStatementDisplay.dispDepreciationExpense },
            { SECTION: '', ITEM: '', NOTE: '', 'AMOUNT (Rs.)': '' },
            { SECTION: 'SUMMARY', ITEM: 'OPERATING INCOME / (LOSS)', NOTE: '', 'AMOUNT (Rs.)': incomeStatementDisplay.dispOperatingIncome },
            { SECTION: 'SUMMARY', ITEM: 'NET COMPREHENSIVE INCOME', NOTE: '', 'AMOUNT (Rs.)': incomeStatementDisplay.dispNetIncome }
        ];

        const worksheet = XLSX.utils.json_to_sheet(data);
        worksheet['!cols'] = [{ wch: 25 }, { wch: 45 }, { wch: 10 }, { wch: 20 }];
        XLSX.utils.book_append_sheet(workbook, worksheet, "Income Statement");

        // 2. Note 07 - Revenue
        try {
            const salesTxs = filteredTransactions.filter(t => t.status !== 'VOID' && t.status !== 'DRAFT' && (t.type === 'SALE' || t.type === 'SALE_HISTORY_IMPORT'));
            const revRows: any[] = salesTxs.map(t => {
                const cust = customers.find(c => c.id === t.customerId);
                const itemsSummary = (t.items || []).map(i => {
                    const prod = products.find(p => p.id === i.productId);
                    return `${prod?.name || i.productId || 'Item'} (${i.quantity}x @ Rs.${i.price})`;
                }).join(', ');
                return {
                    'REFERENCE ID': t.id,
                    'DATE & TIME': formatDateTime(t.date),
                    'CUSTOMER': cust ? cust.name : (t.customerName || 'WALK-IN CUSTOMER'),
                    'ITEMS BREAKDOWN': itemsSummary || t.description || 'N/A',
                    'PAYMENT METHOD': t.paymentMethod || 'CASH',
                    'BRANCH / CASHIER': t.branchId || 'MAIN',
                    'AMOUNT (Rs.)': Number(t.amount || 0)
                };
            });
            revRows.push({ 'REFERENCE ID': 'TOTAL', 'DATE & TIME': '', 'CUSTOMER': '', 'ITEMS BREAKDOWN': 'TOTAL REVENUE (DIRECT SALES)', 'PAYMENT METHOD': '', 'BRANCH / CASHIER': '', 'AMOUNT (Rs.)': incomeStatementDisplay.dispRevenue });
            const wsRev = XLSX.utils.json_to_sheet(revRows);
            wsRev['!cols'] = [{ wch: 22 }, { wch: 20 }, { wch: 25 }, { wch: 45 }, { wch: 15 }, { wch: 18 }, { wch: 20 }];
            XLSX.utils.book_append_sheet(workbook, wsRev, "Note 07 - Revenue");
        } catch (e) { console.error(e); }

        // 3. Note 08 - Cost of Sales
        try {
            const productSalesMap: Record<string, { name: string; sku: string; category: string; qtySold: number; costBasis: number }> = {};
            filteredTransactions.forEach(t => {
                if (t.status === 'VOID' || t.status === 'DRAFT' || t.type !== 'SALE') return;
                (t.items || []).forEach(item => {
                    const prod = products.find(p => p.id === item.productId);
                    const cat = prod?.categoryId ? categories.find(c => c.id === prod.categoryId)?.name : 'N/A';
                    const pKey = item.productId || 'UNKNOWN';
                    const pName = prod?.name || item.productId || 'Unknown Item';
                    const qty = Number(item.quantity || 0);
                    let itemCost = prod ? (isHotReloadItem(item, prod, categories.find(c => c.id === prod.categoryId), t.description) ? Number(item.price) * qty * 0.96 : Number(prod.cost || 0) * qty) : 0;
                    if (!productSalesMap[pKey]) {
                        productSalesMap[pKey] = { name: pName, sku: prod?.sku || 'N/A', category: cat || 'N/A', qtySold: 0, costBasis: 0 };
                    }
                    productSalesMap[pKey].qtySold += qty;
                    productSalesMap[pKey].costBasis += itemCost;
                });
            });
            const cogsRows: any[] = Object.values(productSalesMap).map(p => ({
                'PRODUCT NAME': p.name,
                'SKU / BARCODE': p.sku,
                'CATEGORY': p.category,
                'QUANTITY SOLD': p.qtySold,
                'AVG UNIT COST BASIS (Rs.)': p.qtySold > 0 ? Math.round(p.costBasis / p.qtySold) : 0,
                'TOTAL COGS BASIS (Rs.)': Math.round(p.costBasis)
            }));
            cogsRows.push({ 'PRODUCT NAME': 'TOTAL COST OF SALES (COGS)', 'SKU / BARCODE': '', 'CATEGORY': '', 'QUANTITY SOLD': cogsRows.reduce((s, r) => s + (Number(r['QUANTITY SOLD']) || 0), 0), 'AVG UNIT COST BASIS (Rs.)': '', 'TOTAL COGS BASIS (Rs.)': incomeStatementDisplay.dispCogs });
            const wsCogs = XLSX.utils.json_to_sheet(cogsRows);
            wsCogs['!cols'] = [{ wch: 35 }, { wch: 18 }, { wch: 20 }, { wch: 15 }, { wch: 25 }, { wch: 25 }];
            XLSX.utils.book_append_sheet(workbook, wsCogs, "Note 08 - COGS");
        } catch (e) { console.error(e); }

        // 4. Note 09+ - Expense Categories
        incomeStatement.expenseBreakdown.forEach(([catName, amt], idx) => {
            try {
                const noteStr = String(9 + idx).padStart(2, '0');
                const matchedTxs = filteredTransactions.filter(t => {
                    if (t.status === 'VOID' || t.status === 'DRAFT' || t.type !== 'EXPENSE') return false;
                    const subCat = (t.category || '').toUpperCase().trim();
                    const mainCat = (t.mainCategory || '').toUpperCase().trim();
                    return subCat.includes(catName.toUpperCase()) || mainCat.includes(catName.toUpperCase());
                });
                const expRows: any[] = matchedTxs.map(t => ({
                    'REFERENCE ID': t.id,
                    'DATE & TIME': formatDateTime(t.date),
                    'DESCRIPTION': t.description || 'N/A',
                    'CATEGORY': t.category || t.mainCategory || 'N/A',
                    'PAYMENT METHOD': t.paymentMethod || 'CASH',
                    'AMOUNT (Rs.)': Math.round(Number(t.amount || 0))
                }));
                expRows.push({ 'REFERENCE ID': 'TOTAL', 'DATE & TIME': '', 'DESCRIPTION': `TOTAL ${catName.toUpperCase()}`, 'CATEGORY': '', 'PAYMENT METHOD': '', 'AMOUNT (Rs.)': Math.round(amt) });
                const wsExp = XLSX.utils.json_to_sheet(expRows);
                wsExp['!cols'] = [{ wch: 22 }, { wch: 20 }, { wch: 35 }, { wch: 20 }, { wch: 15 }, { wch: 20 }];
                XLSX.utils.book_append_sheet(workbook, wsExp, `Note ${noteStr} - ${catName.slice(0, 18)}`);
            } catch (e) { console.error(e); }
        });

        downloadExcel(workbook, `INCOME_STATEMENT_WITH_NOTES_${endDay}.xlsx`);
    };

    const handleExportTrialBalanceExcel = () => {
        const beginningRE = balanceSheetDisplay.dispRetainedEarnings - incomeStatementDisplay.dispNetIncome;
        
        const rows: any[] = [
            { 'ACCOUNT CODE': '1000', 'ACCOUNT LEDGER': 'Cash and Bank Balances', 'CATEGORY': 'Asset', 'DEBIT (Rs.)': balanceSheetDisplay.dispCashAndBank, 'CREDIT (Rs.)': '' },
            { 'ACCOUNT CODE': '1100', 'ACCOUNT LEDGER': 'Accounts Receivable (Customers)', 'CATEGORY': 'Asset', 'DEBIT (Rs.)': balanceSheetDisplay.dispAccountsReceivable, 'CREDIT (Rs.)': '' },
            { 'ACCOUNT CODE': '1200', 'ACCOUNT LEDGER': 'Inventory Stock Assets (At Cost)', 'CATEGORY': 'Asset', 'DEBIT (Rs.)': balanceSheetDisplay.dispInventory, 'CREDIT (Rs.)': '' },
            { 'ACCOUNT CODE': '1300', 'ACCOUNT LEDGER': 'Fixed Assets (Plant & Equipment)', 'CATEGORY': 'Asset', 'DEBIT (Rs.)': balanceSheetDisplay.dispFixedAssets, 'CREDIT (Rs.)': '' },
            { 'ACCOUNT CODE': '1350', 'ACCOUNT LEDGER': 'Accumulated Depreciation', 'CATEGORY': 'Asset Contra', 'DEBIT (Rs.)': '', 'CREDIT (Rs.)': balanceSheetDisplay.dispAccumulatedDepreciation },
            { 'ACCOUNT CODE': '5000', 'ACCOUNT LEDGER': 'Cost of Goods Sold (COGS)', 'CATEGORY': 'Expense', 'DEBIT (Rs.)': incomeStatementDisplay.dispCogs, 'CREDIT (Rs.)': '' },
        ];

        incomeStatement.expenseBreakdown.forEach(([cat, amt], idx) => {
            rows.push({
                'ACCOUNT CODE': String(5100 + idx),
                'ACCOUNT LEDGER': `Operating Expense - ${cat}`,
                'CATEGORY': 'Expense',
                'DEBIT (Rs.)': Math.round(amt),
                'CREDIT (Rs.)': ''
            });
        });

        // Add Depreciation Expense
        rows.push({
            'ACCOUNT CODE': '5200',
            'ACCOUNT LEDGER': 'Operating Expense - Depreciation Expense',
            'CATEGORY': 'Expense',
            'DEBIT (Rs.)': incomeStatementDisplay.dispDepreciationExpense,
            'CREDIT (Rs.)': ''
        });

        rows.push(
            { 'ACCOUNT CODE': '4000', 'ACCOUNT LEDGER': 'Sales & Direct Revenue', 'CATEGORY': 'Revenue', 'DEBIT (Rs.)': '', 'CREDIT (Rs.)': incomeStatementDisplay.dispRevenue },
            { 'ACCOUNT CODE': '2000', 'ACCOUNT LEDGER': 'Accounts Payable (Vendors)', 'CATEGORY': 'Liability', 'DEBIT (Rs.)': '', 'CREDIT (Rs.)': balanceSheetDisplay.dispAccountsPayable },
            { 'ACCOUNT CODE': '2100', 'ACCOUNT LEDGER': 'Accrued Expenses (Unpaid Bills)', 'CATEGORY': 'Liability', 'DEBIT (Rs.)': '', 'CREDIT (Rs.)': balanceSheetDisplay.dispAccruedExpenses },
            { 'ACCOUNT CODE': '2200', 'ACCOUNT LEDGER': 'Director C/A (Current Account)', 'CATEGORY': 'Liability', 'DEBIT (Rs.)': '', 'CREDIT (Rs.)': balanceSheetDisplay.dispDirectorCA },
            { 'ACCOUNT CODE': '3000', 'ACCOUNT LEDGER': 'Share Capital', 'CATEGORY': 'Equity', 'DEBIT (Rs.)': '', 'CREDIT (Rs.)': balanceSheetDisplay.dispShareCapital },
            { 
                'ACCOUNT CODE': '3100', 
                'ACCOUNT LEDGER': 'Retained Earnings (Beginning)', 
                'CATEGORY': 'Equity', 
                'DEBIT (Rs.)': beginningRE < 0 ? Math.abs(beginningRE) : '', 
                'CREDIT (Rs.)': beginningRE >= 0 ? beginningRE : '' 
            }
        );

        const totalDebits = balanceSheetDisplay.dispCashAndBank + balanceSheetDisplay.dispAccountsReceivable + balanceSheetDisplay.dispInventory + balanceSheetDisplay.dispFixedAssets + incomeStatementDisplay.dispCogs + incomeStatementDisplay.dispTotalExpenses + incomeStatementDisplay.dispDepreciationExpense + (beginningRE < 0 ? Math.abs(beginningRE) : 0);
        const totalCredits = incomeStatementDisplay.dispRevenue + balanceSheetDisplay.dispAccountsPayable + balanceSheetDisplay.dispAccruedExpenses + balanceSheetDisplay.dispDirectorCA + balanceSheetDisplay.dispShareCapital + balanceSheetDisplay.dispAccumulatedDepreciation + (beginningRE >= 0 ? beginningRE : 0);

        rows.push(
            { 'ACCOUNT CODE': '', 'ACCOUNT LEDGER': '', 'CATEGORY': '', 'DEBIT (Rs.)': '', 'CREDIT (Rs.)': '' },
            { 'ACCOUNT CODE': 'TOTAL', 'ACCOUNT LEDGER': 'TOTAL TRIAL BALANCE', 'CATEGORY': '', 'DEBIT (Rs.)': totalDebits, 'CREDIT (Rs.)': totalCredits }
        );

        const worksheet = XLSX.utils.json_to_sheet(rows);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Trial Balance");

        const widths = [
            { wch: 15 },
            { wch: 45 },
            { wch: 15 },
            { wch: 20 },
            { wch: 20 }
        ];
        worksheet['!cols'] = widths;

        downloadExcel(workbook, `TRIAL_BALANCE_${endDate || getTodayLocal()}.xlsx`);
    };

    const handleExportCashBankNoteDetails = () => {
        const endDay = endDate ? endDate : getTodayLocal();

        const getAccountLedgerName = (accId: string | null): string => {
            if (!accId) return 'Cash / Bank';
            const acc = accounts.find(a => a.id === accId);
            if (!acc) return 'Cash / Bank';
            const upperName = acc.name.toUpperCase().trim();
            if (upperName === 'DIRECTOR C/A' || upperName === 'DIRECTOR CURRENT ACCOUNT' || upperName.includes('DIRECTOR')) {
                return 'Director C/A';
            }
            if (upperName === 'SHARE CAPITAL') {
                return 'Share Capital';
            }
            return 'Cash / Bank';
        };

        const accountsData: any[] = accounts
            .filter(acc => getAccountLedgerName(acc.id) !== 'Director C/A' && getAccountLedgerName(acc.id) !== 'Share Capital')
            .map(acc => ({
                'ACCOUNT NAME': acc.name,
                'ACCOUNT NUMBER': acc.accountNumber || 'N/A',
                'BALANCE (Rs.)': Math.round(Number(acc.balance || 0))
            }));

        let totalInflows = 0;
        let totalOutflows = 0;

        const cashTxs: any[] = [];

        transactions.forEach(t => {
            if (t.status === 'VOID' || t.status === 'DRAFT') return;
            const txDate = t.date.split('T')[0];
            if (txDate > endDay) return;

            const cashierMatch = selectedCashier === 'ALL CASHIERS' || t.branchId === selectedCashier;
            if (!cashierMatch) return;

            const isDirectorSource = t.accountId && getAccountLedgerName(t.accountId) === 'Director C/A';
            const isDirectorDest = t.destinationAccountId && getAccountLedgerName(t.destinationAccountId) === 'Director C/A';

            let movement = 0;
            let isOutflow = false;

            if (t.type === 'SALE' || t.type === 'SALE_HISTORY_IMPORT') {
                if (t.paymentMethod !== 'CREDIT' && !isDirectorSource) {
                    movement = Number(t.paidAmount) || Number(t.amount || 0);
                    isOutflow = false;
                }
            } else if (t.type === 'PURCHASE') {
                if (t.paymentMethod !== 'CREDIT' && !isDirectorSource) {
                    movement = -Number(t.amount || 0);
                    isOutflow = true;
                }
            } else if (t.type === 'EXPENSE') {
                if (t.paymentMethod !== 'CREDIT' && !isDirectorSource) {
                    movement = -Number(t.amount || 0);
                    isOutflow = true;
                }
            } else if (t.type === 'CREDIT_PAYMENT') {
                if (t.customerId && !isDirectorSource) {
                    movement = Number(t.amount || 0);
                    isOutflow = false;
                } else if (t.vendorId && !isDirectorSource) {
                    movement = -Number(t.amount || 0);
                    isOutflow = true;
                }
            } else if (t.type === 'LOAN_GIVEN') {
                if (!isDirectorSource) {
                    movement = -Number(t.amount || 0);
                    isOutflow = true;
                }
            } else if (t.type === 'TRANSFER') {
                if (t.accountId === 'cash' && isDirectorDest) {
                    movement = -Number(t.amount || 0);
                    isOutflow = true;
                } else if (t.destinationAccountId === 'cash' && isDirectorSource) {
                    movement = Number(t.amount || 0);
                    isOutflow = false;
                }
            }

            if (movement !== 0) {
                const absAmt = Math.abs(movement);
                if (movement > 0) {
                    totalInflows += absAmt;
                } else {
                    totalOutflows += absAmt;
                }

                const d = new Date(t.date);
                const isValidDate = !isNaN(d.getTime());

                cashTxs.push({
                    'REFERENCE ID': t.id,
                    'DATE & TIME': formatDateTime(t.date),
                    'DAY': isValidDate ? d.getDate() : '',
                    'MONTH #': isValidDate ? (d.getMonth() + 1) : '',
                    'YEAR #': isValidDate ? d.getFullYear() : '',
                    'DATE': '',
                    'TIME': formatTime(t.date),
                    'TYPE': t.type,
                    'DESCRIPTION': t.description || 'N/A',
                    'PAYMENT METHOD': t.paymentMethod || 'CASH',
                    'CASH FLOW DIRECTION': isOutflow ? 'OUTFLOW (-)' : 'INFLOW (+)',
                    'INFLOW / DEBIT (Rs.)': isOutflow ? '' : absAmt,
                    'OUTFLOW / CREDIT (Rs.)': isOutflow ? absAmt : '',
                    'NET MOVEMENT (Rs.)': movement
                });
            }
        });

        // Compute exact totals directly from transaction detail rows to eliminate any discrepancy
        const exactTotalInflows = cashTxs
            .filter(x => x['CASH FLOW DIRECTION'] === 'INFLOW (+)')
            .reduce((sum, x) => sum + Number(x['INFLOW / DEBIT (Rs.)'] || 0), 0);

        const exactTotalOutflows = cashTxs
            .filter(x => x['CASH FLOW DIRECTION'] === 'OUTFLOW (-)')
            .reduce((sum, x) => sum + Number(x['OUTFLOW / CREDIT (Rs.)'] || 0), 0);

        const netMovement = exactTotalInflows - exactTotalOutflows;

        accountsData.push(
            { 'ACCOUNT NAME': 'TOTAL CASH & BANK BALANCES', 'ACCOUNT NUMBER': 'AS AT ' + endDay, 'BALANCE (Rs.)': balanceSheetDisplay.dispCashAndBank },
            { 'ACCOUNT NAME': '', 'ACCOUNT NUMBER': '', 'BALANCE (Rs.)': '' },
            { 'ACCOUNT NAME': '--- CASH FLOW RECONCILIATION ---', 'ACCOUNT NUMBER': '', 'BALANCE (Rs.)': '' },
            { 'ACCOUNT NAME': 'TOTAL CASH INFLOWS (+)', 'ACCOUNT NUMBER': 'SALES & RECOVERIES (' + cashTxs.filter(x => x['CASH FLOW DIRECTION'] === 'INFLOW (+)').length + ' Txs)', 'BALANCE (Rs.)': Math.round(exactTotalInflows) },
            { 'ACCOUNT NAME': 'TOTAL CASH OUTFLOWS (-)', 'ACCOUNT NUMBER': 'PURCHASES & EXPENSES (' + cashTxs.filter(x => x['CASH FLOW DIRECTION'] === 'OUTFLOW (-)').length + ' Txs)', 'BALANCE (Rs.)': -Math.round(exactTotalOutflows) },
            { 'ACCOUNT NAME': 'NET CASH MOVEMENT', 'ACCOUNT NUMBER': 'INFLOWS - OUTFLOWS (' + cashTxs.length + ' Txs)', 'BALANCE (Rs.)': Math.round(netMovement) }
        );

        const workbook = XLSX.utils.book_new();
        const wsAccounts = XLSX.utils.json_to_sheet(accountsData);
        wsAccounts['!cols'] = [{ wch: 35 }, { wch: 35 }, { wch: 25 }];
        XLSX.utils.book_append_sheet(workbook, wsAccounts, "Cash & Bank Accounts");

        const wsTxs = XLSX.utils.json_to_sheet(cashTxs);

        // Inject Excel DATE formula into Column F (Index 5)
        const range = XLSX.utils.decode_range(wsTxs['!ref'] || 'A1');
        for (let R = range.s.r + 1; R <= range.e.r; ++R) {
            const dateCellAddress = XLSX.utils.encode_cell({ r: R, c: 5 }); // Column F
            const dayCell = XLSX.utils.encode_cell({ r: R, c: 2 }); // Column C
            const monthCell = XLSX.utils.encode_cell({ r: R, c: 3 }); // Column D
            const yearCell = XLSX.utils.encode_cell({ r: R, c: 4 }); // Column E

            wsTxs[dateCellAddress] = {
                t: 'n',
                f: `DATE(${yearCell},${monthCell},${dayCell})`,
                z: 'm/d/yyyy'
            };
        }

        wsTxs['!cols'] = [
            { wch: 22 }, // REFERENCE ID (A)
            { wch: 20 }, // DATE & TIME (B)
            { wch: 8 },  // DAY (C)
            { wch: 8 },  // MONTH # (D)
            { wch: 8 },  // YEAR # (E)
            { wch: 12 }, // DATE (F)
            { wch: 10 }, // TIME (G)
            { wch: 18 }, // TYPE (H)
            { wch: 35 }, // DESCRIPTION (I)
            { wch: 15 }, // PAYMENT METHOD (J)
            { wch: 20 }, // CASH FLOW DIRECTION (K)
            { wch: 20 }, // INFLOW / DEBIT (L)
            { wch: 20 }, // OUTFLOW / CREDIT (M)
            { wch: 20 }  // NET MOVEMENT (N)
        ];
        XLSX.utils.book_append_sheet(workbook, wsTxs, "Cash Movements");

        // Dedicated sheet for INFLOWS ONLY (Debits)
        const inflowsOnlyTxs = cashTxs
            .filter(x => x['CASH FLOW DIRECTION'] === 'INFLOW (+)')
            .map(x => ({
                'REFERENCE ID': x['REFERENCE ID'],
                'DATE & TIME': x['DATE & TIME'],
                'DAY': x['DAY'],
                'MONTH #': x['MONTH #'],
                'YEAR #': x['YEAR #'],
                'DATE': x['DATE'],
                'TIME': x['TIME'],
                'TYPE': x['TYPE'],
                'DESCRIPTION': x['DESCRIPTION'],
                'PAYMENT METHOD': x['PAYMENT METHOD'],
                'INFLOW / DEBIT (Rs.)': x['INFLOW / DEBIT (Rs.)']
            }));

        const wsInflows = XLSX.utils.json_to_sheet(inflowsOnlyTxs);
        const rangeInflows = XLSX.utils.decode_range(wsInflows['!ref'] || 'A1');
        for (let R = rangeInflows.s.r + 1; R <= rangeInflows.e.r; ++R) {
            const dateCellAddress = XLSX.utils.encode_cell({ r: R, c: 5 });
            const dayCell = XLSX.utils.encode_cell({ r: R, c: 2 });
            const monthCell = XLSX.utils.encode_cell({ r: R, c: 3 });
            const yearCell = XLSX.utils.encode_cell({ r: R, c: 4 });

            wsInflows[dateCellAddress] = {
                t: 'n',
                f: `DATE(${yearCell},${monthCell},${dayCell})`,
                z: 'm/d/yyyy'
            };
        }

        wsInflows['!cols'] = [
            { wch: 22 },
            { wch: 20 },
            { wch: 8 },
            { wch: 8 },
            { wch: 8 },
            { wch: 12 },
            { wch: 10 },
            { wch: 18 },
            { wch: 35 },
            { wch: 15 },
            { wch: 22 }
        ];
        XLSX.utils.book_append_sheet(workbook, wsInflows, "Inflows Only (Debits)");

        downloadExcel(workbook, `NOTE_01_CASH_AND_BANK_BALANCES_${endDay}.xlsx`);
    };

    const getItemDetailsStr = (t: Transaction) => {
        const itemStrs: string[] = [];
        if (t.items && t.items.length > 0) {
            t.items.forEach(item => {
                const p = products.find(prod => prod.id === item.productId);
                const pName = p ? p.name : item.productId;
                itemStrs.push(`${pName} (x${item.quantity} @ Rs. ${item.price})`);
            });
        }
        const itemsText = itemStrs.join(', ');
        if (itemsText && t.description) {
            return `${itemsText} - [${t.description}]`;
        }
        return itemsText || t.description || 'N/A';
    };

    const handleExportARNoteDetails = () => {
        const endDay = arBreakupDetails.endDay;
        const workbook = XLSX.utils.book_new();

        // Sheet 1: FULL DETAILED RECEIVABLE BREAKDOWN (Default active sheet when opened)
        const detailedARData = transactions
            .filter(t => {
                if (t.status === 'VOID' || t.status === 'DRAFT') return false;
                const txDate = t.date.split('T')[0];
                if (txDate > endDay) return false;
                const cashierMatch = selectedCashier === 'ALL CASHIERS' || t.branchId === selectedCashier;
                if (!cashierMatch) return false;

                const isCreditSale = (t.type === 'SALE' || t.type === 'SALE_HISTORY_IMPORT' || t.type === 'LOAN_GIVEN') && (t.paymentMethod === 'CREDIT' || (Number(t.balanceDue) || 0) > 0);
                const isCreditPayment = t.type === 'CREDIT_PAYMENT' || t.type === 'TRANSFER';
                const isARJournal = t.type === 'JOURNAL' && (t.category === 'Accounts Receivable' || t.mainCategory === 'Accounts Receivable');

                return (t.customerId && (isCreditSale || isCreditPayment)) || isARJournal;
            })
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
            .map(t => {
                const customer = t.customerId ? customers.find(c => c.id === t.customerId) : undefined;
                const isCreditSale = (t.type === 'SALE' || t.type === 'SALE_HISTORY_IMPORT' || t.type === 'LOAN_GIVEN') && (t.paymentMethod === 'CREDIT' || (Number(t.balanceDue) || 0) > 0);
                const isCreditPayment = t.type === 'CREDIT_PAYMENT' || t.type === 'TRANSFER';
                
                let debitAmt = 0;
                let creditAmt = 0;
                if (isCreditSale) {
                    debitAmt = t.paymentMethod === 'CREDIT' ? Number(t.amount || 0) : (Number(t.balanceDue) || 0);
                } else if (isCreditPayment) {
                    creditAmt = Number(t.amount || 0);
                } else if (t.type === 'JOURNAL') {
                    if (t.category === 'Accounts Receivable') debitAmt = Number(t.amount || 0);
                    if (t.mainCategory === 'Accounts Receivable') creditAmt = Number(t.amount || 0);
                }

                const details = getItemDetailsStr(t);

                return {
                    'DATE & TIME': formatDateTime(t.date),
                    'INVOICE / REF ID': t.id,
                    'CUSTOMER NAME': customer?.name || 'N/A',
                    'PHONE': customer?.phone || 'N/A',
                    'TRANSACTION TYPE': t.type,
                    'ITEMS / DETAILS': details,
                    'PAYMENT METHOD': t.paymentMethod || 'N/A',
                    'CASHIER / BRANCH': t.branchId || 'MAIN',
                    'DEBIT / INCREASE (Rs.)': debitAmt,
                    'CREDIT / SETTLEMENT (Rs.)': creditAmt,
                    'OUTSTANDING NET MOVEMENT (Rs.)': debitAmt - creditAmt
                };
            });

        const wsTxs = XLSX.utils.json_to_sheet(detailedARData);
        wsTxs['!cols'] = [{ wch: 20 }, { wch: 22 }, { wch: 28 }, { wch: 15 }, { wch: 18 }, { wch: 45 }, { wch: 15 }, { wch: 18 }, { wch: 30 }, { wch: 25 }, { wch: 20 }];
        XLSX.utils.book_append_sheet(workbook, wsTxs, "Detailed AR Breakdown");

        // Sheet 2: Customer Balances Summary
        const summaryData = arBreakupDetails.breakup.map(item => ({
            'CUSTOMER ID': item.customer.id,
            'CUSTOMER NAME': item.customer.name,
            'PHONE': item.customer.phone || 'N/A',
            'EMAIL': item.customer.email || 'N/A',
            'CREDIT LIMIT (Rs.)': Number(item.customer.creditLimit || 0),
            'OUTSTANDING RECEIVABLE (Rs.)': item.allocatedCredit,
            '% OF TOTAL RECEIVABLE': arBreakupDetails.totalCustomerReceivables > 0
                ? Number(((item.allocatedCredit / arBreakupDetails.totalCustomerReceivables) * 100).toFixed(2))
                : 0
        }));

        if (arBreakupDetails.journalARAdj !== 0) {
            summaryData.push({
                'CUSTOMER ID': 'JOURNAL-ADJ',
                'CUSTOMER NAME': 'MANUAL JOURNAL ADJUSTMENTS',
                'PHONE': 'N/A',
                'EMAIL': 'N/A',
                'CREDIT LIMIT (Rs.)': 0,
                'OUTSTANDING RECEIVABLE (Rs.)': arBreakupDetails.journalARAdj,
                '% OF TOTAL RECEIVABLE': 0
            });
        }

        const wsSummary = XLSX.utils.json_to_sheet(summaryData);
        wsSummary['!cols'] = [{ wch: 18 }, { wch: 30 }, { wch: 15 }, { wch: 25 }, { wch: 20 }, { wch: 30 }, { wch: 22 }];
        XLSX.utils.book_append_sheet(workbook, wsSummary, "Customer Balances Summary");

        downloadExcel(workbook, `NOTE_02_ACCOUNTS_RECEIVABLE_${endDay}.xlsx`);
    };


    const handleExportInventoryNoteDetails = () => {
        const endDay = endDate ? endDate : getTodayLocal();
        const data = products.map(p => {
            let stock = selectedCashier === 'ALL CASHIERS'
                ? Number(p.stock || 0)
                : Number(p.branchStocks?.[selectedCashier] || 0);

            transactions.forEach(t => {
                if (t.status === 'VOID' || t.status === 'DRAFT') return;
                const txDate = t.date.split('T')[0];
                if (txDate > endDay) {
                    const cashierMatch = selectedCashier === 'ALL CASHIERS' || t.branchId === selectedCashier;
                    if (!cashierMatch) return;
                    if (t.type === 'SALE' || t.type === 'SALE_HISTORY_IMPORT') {
                        t.items?.forEach(item => {
                            if (item.productId === p.id) stock += Number(item.quantity || 0);
                        });
                    } else if (t.type === 'PURCHASE') {
                        t.items?.forEach(item => {
                            if (item.productId === p.id) stock -= Number(item.quantity || 0);
                        });
                    }
                }
            });

            const finalStock = Math.max(0, stock);
            const cost = Number(p.cost || 0);
            return {
                'PRODUCT NAME': p.name,
                'SKU': p.sku,
                'CATEGORY': categories.find(c => c.id === p.categoryId)?.name || 'N/A',
                'STOCK QTY (AS AT DATE)': finalStock,
                'UNIT COST (Rs.)': cost,
                'TOTAL ASSET VALUE (Rs.)': finalStock * cost
            };
        }).filter(p => p['STOCK QTY (AS AT DATE)'] > 0);

        const worksheet = XLSX.utils.json_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Inventory Valuation");
        worksheet['!cols'] = [{ wch: 35 }, { wch: 15 }, { wch: 20 }, { wch: 12 }, { wch: 18 }, { wch: 25 }];
        downloadExcel(workbook, `NOTE_03_INVENTORY_VALUATION_${endDay}.xlsx`);
    };

    const handleExportFixedAssetsNoteDetails = () => {
        const endDay = endDate ? endDate : getTodayLocal();
        const data = fixedAssets.map(fa => ({
            'ASSET NAME': fa.name,
            'CATEGORY': fa.category,
            'PURCHASE DATE': fa.purchaseDate,
            'PURCHASE PRICE (Rs.)': fa.purchasePrice,
            'CURRENT VALUE (Rs.)': fa.currentValue
        }));

        const worksheet = XLSX.utils.json_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Fixed Assets");
        worksheet['!cols'] = [{ wch: 30 }, { wch: 20 }, { wch: 15 }, { wch: 22 }, { wch: 22 }];
        downloadExcel(workbook, `NOTE_04_FIXED_ASSETS_${endDay}.xlsx`);
    };

    const handleExportAPNoteDetails = () => {
        const endDay = apBreakupDetails.endDay;
        const workbook = XLSX.utils.book_new();

        // Sheet 1: FULL DETAILED PAYABLE & PURCHASE BREAKDOWN
        const detailedAPData = transactions
            .filter(t => {
                if (t.status === 'VOID' || t.status === 'DRAFT') return false;
                const txDate = t.date.split('T')[0];
                if (txDate > endDay) return false;
                const cashierMatch = selectedCashier === 'ALL CASHIERS' || t.branchId === selectedCashier;
                if (!cashierMatch) return false;

                const isCreditPurchase = t.type === 'PURCHASE' && (t.paymentMethod === 'CREDIT' || (Number(t.balanceDue) || 0) > 0);
                const isCreditPayment = t.type === 'CREDIT_PAYMENT' && t.vendorId;
                const isAPJournal = t.type === 'JOURNAL' && (t.category === 'Accounts Payable' || t.mainCategory === 'Accounts Payable');

                return (t.vendorId && (isCreditPurchase || isCreditPayment)) || isAPJournal;
            })
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
            .map(t => {
                const vendor = t.vendorId ? vendors.find(v => v.id === t.vendorId) : undefined;
                const isCreditPurchase = t.type === 'PURCHASE' && (t.paymentMethod === 'CREDIT' || (Number(t.balanceDue) || 0) > 0);
                const isCreditPayment = t.type === 'CREDIT_PAYMENT' && t.vendorId;
                
                let creditLiabilityAmt = 0;
                let debitSettlementAmt = 0;
                if (isCreditPurchase) {
                    creditLiabilityAmt = t.paymentMethod === 'CREDIT' ? Number(t.amount || 0) : (Number(t.balanceDue) || 0);
                } else if (isCreditPayment) {
                    debitSettlementAmt = Number(t.amount || 0);
                } else if (t.type === 'JOURNAL') {
                    if (t.category === 'Accounts Payable') creditLiabilityAmt = Number(t.amount || 0);
                    if (t.mainCategory === 'Accounts Payable') debitSettlementAmt = Number(t.amount || 0);
                }

                const details = getItemDetailsStr(t);

                return {
                    'DATE & TIME': formatDateTime(t.date),
                    'PURCHASE / REF ID': t.id,
                    'VENDOR NAME': vendor?.name || 'N/A',
                    'CONTACT PERSON': vendor?.contactPerson || 'N/A',
                    'PHONE': vendor?.phone || 'N/A',
                    'TRANSACTION TYPE': t.type,
                    'ITEMS / DETAILS': details,
                    'PAYMENT METHOD': t.paymentMethod || 'N/A',
                    'CASHIER / BRANCH': t.branchId || 'MAIN',
                    'CREDIT / PURCHASE ADDITION (Rs.)': creditLiabilityAmt,
                    'DEBIT / PAYMENT SETTLEMENT (Rs.)': debitSettlementAmt,
                    'OUTSTANDING NET MOVEMENT (Rs.)': creditLiabilityAmt - debitSettlementAmt
                };
            });

        const wsTxs = XLSX.utils.json_to_sheet(detailedAPData);
        wsTxs['!cols'] = [{ wch: 20 }, { wch: 22 }, { wch: 28 }, { wch: 20 }, { wch: 15 }, { wch: 18 }, { wch: 45 }, { wch: 15 }, { wch: 18 }, { wch: 30 }, { wch: 30 }, { wch: 25 }];
        XLSX.utils.book_append_sheet(workbook, wsTxs, "Detailed AP Breakdown");

        // Sheet 2: Vendor Balances Summary
        const summaryData = apBreakupDetails.breakup.map(item => ({
            'VENDOR ID': item.vendor.id,
            'VENDOR NAME': item.vendor.name,
            'CONTACT PERSON': item.vendor.contactPerson || 'N/A',
            'PHONE': item.vendor.phone || 'N/A',
            'EMAIL': item.vendor.email || 'N/A',
            'OUTSTANDING PAYABLE (Rs.)': item.allocatedBalance,
            '% OF TOTAL PAYABLE': apBreakupDetails.totalVendorPayables > 0
                ? Number(((item.allocatedBalance / apBreakupDetails.totalVendorPayables) * 100).toFixed(2))
                : 0
        }));

        if (apBreakupDetails.journalAPAdj !== 0) {
            summaryData.push({
                'VENDOR ID': 'JOURNAL-ADJ',
                'VENDOR NAME': 'MANUAL JOURNAL ADJUSTMENTS',
                'CONTACT PERSON': 'N/A',
                'PHONE': 'N/A',
                'EMAIL': 'N/A',
                'OUTSTANDING PAYABLE (Rs.)': apBreakupDetails.journalAPAdj,
                '% OF TOTAL PAYABLE': 0
            });
        }

        const wsSummary = XLSX.utils.json_to_sheet(summaryData);
        wsSummary['!cols'] = [{ wch: 18 }, { wch: 30 }, { wch: 20 }, { wch: 15 }, { wch: 25 }, { wch: 25 }, { wch: 20 }];
        XLSX.utils.book_append_sheet(workbook, wsSummary, "Vendor Balances Summary");

        downloadExcel(workbook, `NOTE_05_ACCOUNTS_PAYABLE_VENDORS_BREAKUP_${endDay}.xlsx`);
    };


    const handleExportAccruedExpensesNoteDetails = () => {
        const endDay = endDate ? endDate : getTodayLocal();
        const accruedTxs = transactions.filter(t => {
            if (t.status === 'VOID' || t.status === 'DRAFT') return false;
            const txDate = t.date.split('T')[0];
            if (txDate > endDay) return false;
            return t.type === 'EXPENSE' && t.paymentMethod === 'CREDIT';
        });

        const data: any[] = accruedTxs.map(t => {
            const d = new Date(t.date);
            const isValidDate = !isNaN(d.getTime());
            return {
                'REFERENCE ID': t.id,
                'DATE & TIME': formatDateTime(t.date),
                'DAY': isValidDate ? d.getDate() : '',
                'MONTH #': isValidDate ? (d.getMonth() + 1) : '',
                'YEAR #': isValidDate ? d.getFullYear() : '',
                'DATE': '',
                'TIME': formatTime(t.date),
                'DESCRIPTION': t.description || 'N/A',
                'CATEGORY': t.category || 'N/A',
                'BRANCH': t.branchId || 'ALL',
                'AMOUNT (Rs.)': Number(t.amount || 0)
            };
        });

        data.push({
            'REFERENCE ID': 'TOTAL',
            'DATE & TIME': '',
            'DAY': '',
            'MONTH #': '',
            'YEAR #': '',
            'DATE': '',
            'TIME': '',
            'DESCRIPTION': 'TOTAL ACCRUED EXPENSES',
            'CATEGORY': '',
            'BRANCH': '',
            'AMOUNT (Rs.)': balanceSheetDisplay.dispAccruedExpenses
        });

        const worksheet = XLSX.utils.json_to_sheet(data);

        // Inject Excel DATE formula into Column F (Index 5)
        const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
        for (let R = range.s.r + 1; R < range.e.r; ++R) {
            const dateCellAddress = XLSX.utils.encode_cell({ r: R, c: 5 });
            const dayCell = XLSX.utils.encode_cell({ r: R, c: 2 });
            const monthCell = XLSX.utils.encode_cell({ r: R, c: 3 });
            const yearCell = XLSX.utils.encode_cell({ r: R, c: 4 });

            worksheet[dateCellAddress] = {
                t: 'n',
                f: `DATE(${yearCell},${monthCell},${dayCell})`,
                z: 'm/d/yyyy'
            };
        }

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Accrued Expenses");
        worksheet['!cols'] = [
            { wch: 22 }, { wch: 20 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 12 }, { wch: 10 },
            { wch: 35 }, { wch: 20 }, { wch: 15 }, { wch: 20 }
        ];
        downloadExcel(workbook, `NOTE_06_ACCRUED_EXPENSES_${endDay}.xlsx`);
    };

    const handleExportDirectorCANoteDetails = () => {
        try {
            const endDay = endDate ? endDate : getTodayLocal();
            const getAccountLedgerName = (accId: string | null): string => {
                if (!accId) return '';
                const acc = accounts.find(a => a.id === accId);
                if (!acc) return '';
                const upperName = acc.name.toUpperCase().trim();
                if (upperName === 'DIRECTOR C/A' || upperName === 'DIRECTOR CURRENT ACCOUNT' || upperName.includes('DIRECTOR')) {
                    return 'Director C/A';
                }
                return '';
            };

            const directorTxs = transactions.filter(t => {
                if (t.status === 'VOID' || t.status === 'DRAFT') return false;
                const txDate = t.date.split('T')[0];
                if (txDate > endDay) return false;
                const isDirSrc = t.accountId && getAccountLedgerName(t.accountId) === 'Director C/A';
                const isDirDest = t.destinationAccountId && getAccountLedgerName(t.destinationAccountId) === 'Director C/A';
                const descMatch = (t.description || '').toUpperCase().includes('DIRECTOR');
                const catMatch = (t.category || '').toUpperCase().includes('DIRECTOR');
                return isDirSrc || isDirDest || descMatch || catMatch;
            });

            const txData: any[] = directorTxs.map(t => {
                const isDirSrc = t.accountId && getAccountLedgerName(t.accountId) === 'Director C/A';
                const d = new Date(t.date);
                const isValidDate = !isNaN(d.getTime());
                return {
                    'REFERENCE ID': t.id,
                    'DATE & TIME': formatDateTime(t.date),
                    'DAY': isValidDate ? d.getDate() : '',
                    'MONTH #': isValidDate ? (d.getMonth() + 1) : '',
                    'YEAR #': isValidDate ? d.getFullYear() : '',
                    'DATE': '',
                    'TIME': formatTime(t.date),
                    'TYPE': t.type,
                    'DESCRIPTION': t.description || 'N/A',
                    'DIRECTION': isDirSrc ? 'CREDIT / INFLOW (+)' : 'DEBIT / OUTFLOW (-)',
                    'AMOUNT (Rs.)': Number(t.amount || 0)
                };
            });

            if (txData.length === 0) {
                txData.push({
                    'REFERENCE ID': 'N/A',
                    'DATE & TIME': formatDateTime(endDay),
                    'DAY': '',
                    'MONTH #': '',
                    'YEAR #': '',
                    'DATE': '',
                    'TIME': '',
                    'TYPE': 'BALANCE_RECORD',
                    'DESCRIPTION': 'Director C/A Ledger Account Balance',
                    'DIRECTION': balanceSheetDisplay.dispDirectorCA >= 0 ? 'CREDIT (+)' : 'DEBIT (-)',
                    'AMOUNT (Rs.)': balanceSheetDisplay.dispDirectorCA
                });
            }

            const summaryData = [
                { 'METRIC': 'DIRECTOR C/A BALANCE (Rs.)', 'AMOUNT (Rs.)': balanceSheetDisplay.dispDirectorCA },
                { 'METRIC': 'TOTAL TRANSACTIONS COUNT', 'AMOUNT (Rs.)': directorTxs.length }
            ];

            const workbook = XLSX.utils.book_new();
            const wsSummary = XLSX.utils.json_to_sheet(summaryData);
            wsSummary['!cols'] = [{ wch: 35 }, { wch: 25 }];
            XLSX.utils.book_append_sheet(workbook, wsSummary, "Director CA Summary");

            const wsTxs = XLSX.utils.json_to_sheet(txData);
            if (directorTxs.length > 0) {
                const range = XLSX.utils.decode_range(wsTxs['!ref'] || 'A1');
                for (let R = range.s.r + 1; R <= range.e.r; ++R) {
                    const dateCellAddress = XLSX.utils.encode_cell({ r: R, c: 5 });
                    const dayCell = XLSX.utils.encode_cell({ r: R, c: 2 });
                    const monthCell = XLSX.utils.encode_cell({ r: R, c: 3 });
                    const yearCell = XLSX.utils.encode_cell({ r: R, c: 4 });

                    wsTxs[dateCellAddress] = {
                        t: 'n',
                        f: `DATE(${yearCell},${monthCell},${dayCell})`,
                        z: 'm/d/yyyy'
                    };
                }
            }
            wsTxs['!cols'] = [
                { wch: 22 }, { wch: 20 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 12 }, { wch: 10 },
                { wch: 18 }, { wch: 40 }, { wch: 25 }, { wch: 20 }
            ];
            XLSX.utils.book_append_sheet(workbook, wsTxs, "Director CA Movements");

            downloadExcel(workbook, `NOTE_07_DIRECTOR_CURRENT_ACCOUNT_${endDay}.xlsx`);
        } catch (err: any) {
            console.error('Export Director C/A error:', err);
            alert('Failed to export Director C/A Note 07 details: ' + (err?.message || err));
        }
    };

    const handleExportShareCapitalNoteDetails = () => {
        try {
            const endDay = endDate ? endDate : getTodayLocal();
            const shareCapitalAccs = accounts.filter(acc => {
                const upperName = acc.name.toUpperCase().trim();
                return upperName === 'SHARE CAPITAL' || upperName.includes('CAPITAL');
            });

            const data: any[] = shareCapitalAccs.map(acc => ({
                'ACCOUNT NAME': acc.name,
                'ACCOUNT NUMBER': acc.accountNumber || 'N/A',
                'BALANCE (Rs.)': Math.round(Number(acc.balance || 0))
            }));

            if (data.length === 0) {
                data.push({
                    'ACCOUNT NAME': 'SHARE CAPITAL',
                    'ACCOUNT NUMBER': 'N/A',
                    'BALANCE (Rs.)': balanceSheetDisplay.dispShareCapital
                });
            }

            data.push({
                'ACCOUNT NAME': 'TOTAL SHARE CAPITAL',
                'ACCOUNT NUMBER': 'AS AT ' + endDay,
                'BALANCE (Rs.)': balanceSheetDisplay.dispShareCapital
            });

            const worksheet = XLSX.utils.json_to_sheet(data);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Share Capital");
            worksheet['!cols'] = [{ wch: 35 }, { wch: 25 }, { wch: 25 }];
            downloadExcel(workbook, `NOTE_08_SHARE_CAPITAL_${endDay}.xlsx`);
        } catch (err: any) {
            console.error('Export Share Capital error:', err);
            alert('Failed to export Share Capital Note 08 details: ' + (err?.message || err));
        }
    };

        const handleExportRetainedEarningsNoteDetails = () => {
        try {
            const endDay = endDate ? endDate : getTodayLocal();
            const netIncome = Number(incomeStatementDisplay.dispNetIncome || 0);
            const endingRE = Number(balanceSheetDisplay.dispRetainedEarnings || 0);
            const beginningRE = endingRE - netIncome;
            const rev = Number(incomeStatementDisplay.dispRevenue || 0);
            const cogs = Number(incomeStatementDisplay.dispCogs || 0);
            const grossProfit = Number(incomeStatementDisplay.dispGrossProfit || 0);
            const totalExp = Number(incomeStatementDisplay.dispTotalExpenses || 0);

            const summaryData = [
                { 'STATEMENT ITEM': 'Retained Earnings Brought Forward (Beginning)', 'AMOUNT (Rs.)': beginningRE },
                { 'STATEMENT ITEM': '', 'AMOUNT (Rs.)': '' },
                { 'STATEMENT ITEM': '--- CURRENT PERIOD PROFIT & LOSS RECONCILIATION ---', 'AMOUNT (Rs.)': '' },
                { 'STATEMENT ITEM': 'Total Revenue (Sales & Income)', 'AMOUNT (Rs.)': rev },
                { 'STATEMENT ITEM': 'Less: Cost of Goods Sold (COGS)', 'AMOUNT (Rs.)': -cogs },
                { 'STATEMENT ITEM': 'GROSS PROFIT', 'AMOUNT (Rs.)': grossProfit },
                { 'STATEMENT ITEM': 'Less: Total Operating Expenses', 'AMOUNT (Rs.)': -totalExp },
                { 'STATEMENT ITEM': 'NET OPERATING INCOME / (LOSS)', 'AMOUNT (Rs.)': netIncome },
                { 'STATEMENT ITEM': '', 'AMOUNT (Rs.)': '' },
                { 'STATEMENT ITEM': '--- ENDING RETAINED EARNINGS RECONCILIATION ---', 'AMOUNT (Rs.)': '' },
                { 'STATEMENT ITEM': 'Beginning Retained Earnings', 'AMOUNT (Rs.)': beginningRE },
                { 'STATEMENT ITEM': 'Add: Current Period Net Income / (Loss)', 'AMOUNT (Rs.)': netIncome },
                { 'STATEMENT ITEM': 'TOTAL RETAINED EARNINGS / (LOSS) AS AT ' + endDay, 'AMOUNT (Rs.)': endingRE }
            ];

            const expBreakdownData = (incomeStatement.expenseBreakdown || []).map(([cat, amt]) => ({
                'OPERATING EXPENSE CATEGORY': cat,
                'AMOUNT (Rs.)': Math.round(Number(amt || 0))
            }));

            expBreakdownData.push({
                'OPERATING EXPENSE CATEGORY': 'TOTAL OPERATING EXPENSES',
                'AMOUNT (Rs.)': totalExp
            });

            const workbook = XLSX.utils.book_new();
            const wsSummary = XLSX.utils.json_to_sheet(summaryData);
            wsSummary['!cols'] = [{ wch: 55 }, { wch: 25 }];
            XLSX.utils.book_append_sheet(workbook, wsSummary, "Retained Earnings Summary");

            const wsExp = XLSX.utils.json_to_sheet(expBreakdownData);
            wsExp['!cols'] = [{ wch: 40 }, { wch: 25 }];
            XLSX.utils.book_append_sheet(workbook, wsExp, "Expense Breakdown");

            downloadExcel(workbook, `NOTE_09_RETAINED_EARNINGS_${endDay}.xlsx`);
        } catch (err: any) {
            console.error('Export Retained Earnings error:', err);
            alert('Failed to export Retained Earnings Note 09 details: ' + (err?.message || err));
        }
    };

    const handleExportRevenueNoteDetails = () => {
        try {
            const endDay = endDate ? endDate : getTodayLocal();
            const salesTxs = filteredTransactions.filter(t => {
                if (t.status === 'VOID' || t.status === 'DRAFT') return false;
                return t.type === 'SALE' || t.type === 'SALE_HISTORY_IMPORT';
            });

            const rows: any[] = salesTxs.map(t => {
                const d = new Date(t.date);
                const isValidDate = !isNaN(d.getTime());
                const cust = customers.find(c => c.id === t.customerId);
                const itemsSummary = (t.items || []).map(i => {
                    const prod = products.find(p => p.id === i.productId);
                    return `${prod?.name || i.productId || 'Item'} (${i.quantity}x @ Rs.${i.price})`;
                }).join(', ');

                return {
                    'REFERENCE ID': t.id,
                    'DATE & TIME': formatDateTime(t.date),
                    'DAY': isValidDate ? d.getDate() : '',
                    'MONTH #': isValidDate ? (d.getMonth() + 1) : '',
                    'YEAR #': isValidDate ? d.getFullYear() : '',
                    'DATE': '',
                    'TIME': formatTime(t.date),
                    'CUSTOMER': cust ? cust.name : (t.customerName || 'WALK-IN CUSTOMER'),
                    'ITEMS BREAKDOWN': itemsSummary || t.description || 'N/A',
                    'PAYMENT METHOD': t.paymentMethod || 'CASH',
                    'BRANCH / CASHIER': t.branchId || 'MAIN',
                    'AMOUNT (Rs.)': Number(t.amount || 0)
                };
            });

            rows.push({
                'REFERENCE ID': 'TOTAL',
                'DATE & TIME': '',
                'DAY': '',
                'MONTH #': '',
                'YEAR #': '',
                'DATE': '',
                'TIME': '',
                'CUSTOMER': '',
                'ITEMS BREAKDOWN': 'TOTAL REVENUE (DIRECT SALES)',
                'PAYMENT METHOD': '',
                'BRANCH / CASHIER': '',
                'AMOUNT (Rs.)': incomeStatementDisplay.dispRevenue
            });

            const worksheet = XLSX.utils.json_to_sheet(rows);
            const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
            for (let R = range.s.r + 1; R < range.e.r; ++R) {
                const dateCellAddress = XLSX.utils.encode_cell({ r: R, c: 5 });
                const dayCell = XLSX.utils.encode_cell({ r: R, c: 2 });
                const monthCell = XLSX.utils.encode_cell({ r: R, c: 3 });
                const yearCell = XLSX.utils.encode_cell({ r: R, c: 4 });

                worksheet[dateCellAddress] = {
                    t: 'n',
                    f: `DATE(${yearCell},${monthCell},${dayCell})`,
                    z: 'm/d/yyyy'
                };
            }

            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Revenue (Direct Sales)");
            worksheet['!cols'] = [
                { wch: 22 }, { wch: 20 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 12 }, { wch: 10 },
                { wch: 25 }, { wch: 45 }, { wch: 15 }, { wch: 18 }, { wch: 20 }
            ];

            downloadExcel(workbook, `NOTE_07_REVENUE_DIRECT_SALES_${endDay}.xlsx`);
        } catch (err: any) {
            console.error('Export Revenue Note 07 error:', err);
            alert('Failed to export Revenue Note 07 details: ' + (err?.message || err));
        }
    };

    const handleExportCOGSNoteDetails = () => {
        try {
            const endDay = endDate ? endDate : getTodayLocal();
            const productSalesMap: Record<string, { name: string; sku: string; category: string; qtySold: number; costBasis: number }> = {};

            filteredTransactions.forEach(t => {
                if (t.status === 'VOID' || t.status === 'DRAFT' || t.type !== 'SALE') return;
                (t.items || []).forEach(item => {
                    const prod = products.find(p => p.id === item.productId);
                    const cat = prod?.categoryId ? categories.find(c => c.id === prod.categoryId)?.name : 'N/A';
                    const pKey = item.productId || 'UNKNOWN';
                    const pName = prod?.name || item.productId || 'Unknown Item';
                    const qty = Number(item.quantity || 0);

                    let itemCost = 0;
                    if (prod) {
                        if (isHotReloadItem(item, prod, categories.find(c => c.id === prod.categoryId), t.description)) {
                            itemCost = Number(item.price) * qty * 0.96;
                        } else {
                            itemCost = Number(prod.cost || 0) * qty;
                        }
                    }

                    if (!productSalesMap[pKey]) {
                        productSalesMap[pKey] = {
                            name: pName,
                            sku: prod?.sku || 'N/A',
                            category: cat || 'N/A',
                            qtySold: 0,
                            costBasis: 0
                        };
                    }
                    productSalesMap[pKey].qtySold += qty;
                    productSalesMap[pKey].costBasis += itemCost;
                });
            });

            const rows: any[] = Object.values(productSalesMap).map(p => ({
                'PRODUCT NAME': p.name,
                'SKU / BARCODE': p.sku,
                'CATEGORY': p.category,
                'QUANTITY SOLD': p.qtySold,
                'AVG UNIT COST BASIS (Rs.)': p.qtySold > 0 ? Math.round(p.costBasis / p.qtySold) : 0,
                'TOTAL COGS BASIS (Rs.)': Math.round(p.costBasis)
            }));

            rows.push({
                'PRODUCT NAME': 'TOTAL COST OF SALES (COGS)',
                'SKU / BARCODE': '',
                'CATEGORY': '',
                'QUANTITY SOLD': rows.reduce((s, r) => s + (Number(r['QUANTITY SOLD']) || 0), 0),
                'AVG UNIT COST BASIS (Rs.)': '',
                'TOTAL COGS BASIS (Rs.)': incomeStatementDisplay.dispCogs
            });

            const worksheet = XLSX.utils.json_to_sheet(rows);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Cost of Sales (COGS)");
            worksheet['!cols'] = [{ wch: 35 }, { wch: 18 }, { wch: 20 }, { wch: 15 }, { wch: 25 }, { wch: 25 }];

            downloadExcel(workbook, `NOTE_08_COST_OF_SALES_COGS_${endDay}.xlsx`);
        } catch (err: any) {
            console.error('Export COGS Note 08 error:', err);
            alert('Failed to export Cost of Sales Note 08 details: ' + (err?.message || err));
        }
    };

    const handleExportExpenseCategoryNoteDetails = (targetCatName: string, noteNumStr: string) => {
        try {
            const endDay = endDate ? endDate : getTodayLocal();
            const getStandardGroupName = (cat: string): string | null => {
                if (cat === 'RENT' || cat === ' RENT') return 'Rent';
                if (cat === 'INSURENCE PAYMENT' || cat === 'INSURANCE PAYMENT') return 'Insurance Payment';
                if (cat === 'TRANSPORT') return 'Transport';
                if (cat === 'UTILITIES' || cat.startsWith('UTILITIES') || cat.startsWith('CEB') || cat.startsWith('ELECTRICITY') || cat.startsWith('WATER')) return 'Utilities';
                if (cat === 'INSURENCE' || cat === 'INSURANCE' || cat.startsWith('INSURENCE') || cat.startsWith('INSURANCE')) return 'Insurance';
                if (cat === 'ADMIN') return 'Admin';
                if (cat.includes('MAINT') || cat.includes('REPAIR') || cat.includes('OFFICE MAINT')) return 'Office Maintenance';
                return null;
            };

            const matchedTxs = filteredTransactions.filter(t => {
                if (t.status === 'VOID' || t.status === 'DRAFT') return false;
                if (t.type !== 'EXPENSE' && t.type !== 'JOURNAL') return false;

                const subCat = (t.category || '').toUpperCase().trim();
                const mainCat = (t.mainCategory || '').toUpperCase().trim();
                const desc = (t.description || '').toUpperCase().trim();

                let displayName = getStandardGroupName(subCat) || getStandardGroupName(mainCat) || getStandardGroupName(desc);
                if (!displayName) {
                    const rawName = t.category || t.mainCategory || 'Uncategorized';
                    displayName = rawName.trim().split(' ')
                        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
                        .join(' ');
                }

                const targetUpper = targetCatName.toUpperCase().trim();
                const displayUpper = displayName.toUpperCase().trim();

                if (targetUpper.includes('MAINT') || targetUpper.includes('OFFICE')) {
                    return displayUpper.includes('MAINT') || subCat.includes('MAINT') || mainCat.includes('MAINT') || desc.includes('MAINT') || desc.includes('MAINTAINCE');
                }

                return displayUpper === targetUpper || subCat === targetUpper || mainCat === targetUpper;
            });

            const rows: any[] = matchedTxs.map(t => {
                const d = new Date(t.date);
                const isValidDate = !isNaN(d.getTime());
                return {
                    'REFERENCE ID': t.id,
                    'DATE & TIME': formatDateTime(t.date),
                    'DAY': isValidDate ? d.getDate() : '',
                    'MONTH #': isValidDate ? (d.getMonth() + 1) : '',
                    'YEAR #': isValidDate ? d.getFullYear() : '',
                    'DATE': '',
                    'TIME': formatTime(t.date),
                    'DESCRIPTION': t.description || 'N/A',
                    'MAIN CATEGORY': t.mainCategory || 'EXPENSE',
                    'SUB CATEGORY': t.category || 'N/A',
                    'BRANCH': t.branchId || 'ALL',
                    'PAYMENT METHOD': t.paymentMethod || 'CASH',
                    'AMOUNT (Rs.)': Math.round(Number(t.amount || 0))
                };
            });

            const totalCategoryAmt = rows.reduce((s, r) => s + Number(r['AMOUNT (Rs.)'] || 0), 0);
            rows.push({
                'REFERENCE ID': 'TOTAL',
                'DATE & TIME': '',
                'DAY': '',
                'MONTH #': '',
                'YEAR #': '',
                'DATE': '',
                'TIME': '',
                'DESCRIPTION': `TOTAL OPERATING EXPENDITURE - ${targetCatName.toUpperCase()}`,
                'MAIN CATEGORY': '',
                'SUB CATEGORY': '',
                'BRANCH': '',
                'PAYMENT METHOD': '',
                'AMOUNT (Rs.)': totalCategoryAmt
            });

            const worksheet = XLSX.utils.json_to_sheet(rows);
            const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
            for (let R = range.s.r + 1; R < range.e.r; ++R) {
                const dateCellAddress = XLSX.utils.encode_cell({ r: R, c: 5 });
                const dayCell = XLSX.utils.encode_cell({ r: R, c: 2 });
                const monthCell = XLSX.utils.encode_cell({ r: R, c: 3 });
                const yearCell = XLSX.utils.encode_cell({ r: R, c: 4 });

                worksheet[dateCellAddress] = {
                    t: 'n',
                    f: `DATE(${yearCell},${monthCell},${dayCell})`,
                    z: 'm/d/yyyy'
                };
            }

            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, targetCatName.slice(0, 30));
            worksheet['!cols'] = [
                { wch: 22 }, { wch: 20 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 12 }, { wch: 10 },
                { wch: 35 }, { wch: 20 }, { wch: 20 }, { wch: 15 }, { wch: 18 }, { wch: 20 }
            ];

            downloadExcel(workbook, `NOTE_${noteNumStr}_EXPENSE_${targetCatName.toUpperCase().replace(/\s+/g, '_')}_${endDay}.xlsx`);
        } catch (err: any) {
            console.error(`Export Expense Note ${noteNumStr} error:`, err);
            alert(`Failed to export Expense Note ${noteNumStr} details: ` + (err?.message || err));
        }
    };

    const handleExportProfitLossLedgerExcel = () => {
        try {
            const wb = XLSX.utils.book_new();

            // Sheet 1: Profit & Loss Statement Summary
            const summaryData = [
                ['PROFIT & LOSS STATEMENT SUMMARY'],
                ['COMPANY:', userProfile.companyName || userProfile.name],
                ['PERIOD:', `${startDate || 'Start'} to ${endDate || getTodayLocal()}`],
                ['CASHIER / BRANCH:', selectedCashier],
                ['GENERATED AT:', new Date().toLocaleString()],
                [],
                ['DESCRIPTION', 'AMOUNT (LKR)', 'MARGIN (%)'],
                ['GROSS REVENUE / DIRECT SALES', profitLossLedgerData.totalRevenue, '100.00%'],
                ['LESS: COST OF SALES (COGS)', -profitLossLedgerData.totalCogs, ''],
                ['GROSS PROFIT', profitLossLedgerData.grossProfit, `${profitLossLedgerData.grossMarginPct.toFixed(2)}%`],
                [],
                ['OPERATING EXPENDITURES:'],
                ...incomeStatement.expenseBreakdown.map(([cat, amt]) => [cat, -amt, '']),
                ['TOTAL OPERATING EXPENSES', -profitLossLedgerData.totalExpenses, ''],
                [],
                ['NET PROFIT / (LOSS) BEFORE TAX', profitLossLedgerData.netProfit, `${profitLossLedgerData.netMarginPct.toFixed(2)}%`]
            ];
            const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
            XLSX.utils.book_append_sheet(wb, wsSummary, 'P&L Summary');

            // Sheet 2: Detailed Line-Item P&L Ledger Stream
            const ledgerHeader = ['Date & Time', 'Reference ID', 'Type', 'Category / Narrative', 'Description', 'Revenue (Inflow LKR)', 'COGS / Cost Basis (LKR)', 'Expense Outflow (LKR)', 'Net Profit Contribution (LKR)', 'Payment Method', 'Branch / Cashier'];
            const ledgerRows = profitLossLedgerData.stream.map(item => [
                formatDateTime(item.date),
                item.id,
                item.type,
                item.category,
                item.description,
                item.revenue,
                item.cogs,
                item.expense,
                item.netProfitContrib,
                item.paymentMethod,
                item.branchId
            ]);
            const wsLedger = XLSX.utils.aoa_to_sheet([ledgerHeader, ...ledgerRows]);
            XLSX.utils.book_append_sheet(wb, wsLedger, 'P&L Detailed Ledger');

            downloadExcel(wb, `PROFIT_AND_LOSS_LEDGER_${startDate || 'start'}_to_${endDate || getTodayLocal()}.xlsx`);
        } catch (err: any) {
            console.error('Export P&L Ledger error:', err);
            alert('Failed to export Profit & Loss Ledger: ' + (err?.message || err));
        }
    };

const handleExportCriticalStock = () => {
        const data = criticalStockItems.map(item => ({
            'PRODUCT NAME': item.name,
            'CATEGORY': categories.find(c => c.id === item.categoryId)?.name || 'N/A',
            'SKU / BARCODE': item.sku,
            'CURRENT STOCK': Number(item.stock || 0),
            'THRESHOLD': Number(item.lowStockThreshold || 10),
            'STATUS': Number(item.stock || 0) <= 0 ? 'OUT OF STOCK' : 'LOW STOCK'
        }));

        const worksheet = XLSX.utils.json_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Critical Stock");

        // Column widths
        const widths = [
            { wch: 40 }, // Name
            { wch: 20 }, // Category
            { wch: 20 }, // SKU
            { wch: 15 }, // Stock
            { wch: 15 }, // Threshold
            { wch: 15 }  // Status
        ];
        worksheet['!cols'] = widths;

        downloadExcel(workbook, `CRITICAL_STOCK_REPORT_${new Date().toISOString().split('T')[0]}.xlsx`);
    };


    const handleExportDailySummaryExcel = () => {
        const data = dailySummaryReport.map(row => {
            const d = new Date(row.date);
            const displayDate = d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
            return {
                'DATE': displayDate,
                'REVENUE (Rs.)': row.revenue,
                'RELOAD REVENUE (Rs.)': row.reloadRevenue,
                'RELOAD PROFIT (Rs.)': row.reloadProfit,
                'PURCHASES (Rs.)': row.purchases,
                'EXPENSE': row.expense,
                'PROFIT': row.profit,
                'PROFIT + RELOAD PROFIT': row.totalProfit,
                'CUMULATIVE PROFIT': row.cumulative
            };
        });

        const worksheet = XLSX.utils.json_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Daily Summary");

        const widths = [
            { wch: 11 }, // Date
            { wch: 11 }, // Revenue
            { wch: 12 }, // Reload Rev
            { wch: 12 }, // Reload Profit
            { wch: 11 }, // Purchases
            { wch: 11 }, // Expense
            { wch: 11 }, // Profit
            { wch: 12 }, // Total Profit
            { wch: 14 }  // Cumulative
        ];
        worksheet['!cols'] = widths;

        downloadExcel(workbook, `DAILY_SUMMARY_${startDate}_TO_${endDate}.xlsx`);
    };

    const handlePrintDailySummary = () => {
        window.print();
    };

    const handleExportPurchasesExcel = () => {
        try {
            const getVendorObj = (id?: string) => {
                if (!id) return null;
                return vendors.find(ven => ven.id.trim().toUpperCase() === id.trim().toUpperCase());
            };

            const workbook = XLSX.utils.book_new();

            // Sheet 1: Itemized Product Purchase Listing (Primary Active Sheet - Line by line for every item)
            const itemizedRows = (searchedPurchaseItems || []).map(item => ({
                'DATE & TIME': formatDateTime(item.date),
                'PURCHASE REF / ID': item.txId || 'N/A',
                'VENDOR NAME': item.vendorName || 'UNKNOWN VENDOR',
                'VENDOR PHONE': item.vendorPhone || 'N/A',
                'PRODUCT / ITEM NAME': item.productName || 'N/A',
                'SKU / BARCODE': item.sku || 'N/A',
                'QTY': Number(item.quantity || 0),
                'UNIT COST (Rs.)': Number(item.unitCost || 0),
                'ITEM TOTAL AMOUNT (Rs.)': Number(item.lineTotal || 0),
                'PAYMENT METHOD': item.paymentMethod || 'CASH',
                'BRANCH / CASHIER': item.branchId || 'MAIN'
            }));

            const wsItemized = XLSX.utils.json_to_sheet(itemizedRows.length > 0 ? itemizedRows : [{
                'DATE & TIME': 'N/A',
                'PURCHASE REF / ID': 'N/A',
                'VENDOR NAME': 'N/A',
                'VENDOR PHONE': 'N/A',
                'PRODUCT / ITEM NAME': 'No purchase items recorded for selected period',
                'SKU / BARCODE': 'N/A',
                'QTY': 0,
                'UNIT COST (Rs.)': 0,
                'ITEM TOTAL AMOUNT (Rs.)': 0,
                'PAYMENT METHOD': 'N/A',
                'BRANCH / CASHIER': 'N/A'
            }]);
            wsItemized['!cols'] = [
                { wch: 22 }, // DATE & TIME
                { wch: 24 }, // REF ID
                { wch: 28 }, // VENDOR NAME
                { wch: 20 }, // VENDOR PHONE
                { wch: 45 }, // PRODUCT NAME
                { wch: 22 }, // SKU
                { wch: 10 }, // QTY
                { wch: 18 }, // UNIT COST
                { wch: 26 }, // ITEM TOTAL AMOUNT
                { wch: 18 }, // PAYMENT METHOD
                { wch: 18 }  // BRANCH
            ];
            XLSX.utils.book_append_sheet(workbook, wsItemized, "Itemized Purchase Listing");

            // Sheet 2: High-level Purchase Transactions Summary
            const summaryRows = (searchedPurchases || []).map(t => {
                const vendor = getVendorObj(t.vendorId);
                const itemDetails = getPurchaseItemDetailsStr(t);
                return {
                    'DATE & TIME': formatDateTime(t.date),
                    'PURCHASE REF / ID': t.id || 'N/A',
                    'VENDOR NAME': vendor ? vendor.name : 'UNKNOWN VENDOR',
                    'VENDOR PHONE': vendor?.phone || 'N/A',
                    'PAYMENT METHOD': t.paymentMethod || 'CASH',
                    'ITEMS PURCHASED SUMMARY': itemDetails || 'N/A',
                    'BRANCH / CASHIER': t.branchId || 'MAIN',
                    'TOTAL TRANSACTION AMOUNT (Rs.)': Math.round(Number(t.amount || 0))
                };
            });

            const wsSummary = XLSX.utils.json_to_sheet(summaryRows.length > 0 ? summaryRows : [{
                'DATE & TIME': 'N/A',
                'PURCHASE REF / ID': 'N/A',
                'VENDOR NAME': 'N/A',
                'VENDOR PHONE': 'N/A',
                'PAYMENT METHOD': 'N/A',
                'ITEMS PURCHASED SUMMARY': 'No purchase transactions recorded',
                'BRANCH / CASHIER': 'N/A',
                'TOTAL TRANSACTION AMOUNT (Rs.)': 0
            }]);
            wsSummary['!cols'] = [
                { wch: 20 },
                { wch: 22 },
                { wch: 28 },
                { wch: 15 },
                { wch: 15 },
                { wch: 45 },
                { wch: 15 },
                { wch: 22 }
            ];
            XLSX.utils.book_append_sheet(workbook, wsSummary, "Purchase Transactions Summary");

            downloadExcel(workbook, `PURCHASE_LISTING_ITEMIZED_${startDate || 'START'}_TO_${endDate || getTodayLocal()}.xlsx`);
        } catch (err: any) {
            console.error("Error exporting purchases excel:", err);
            alert("Failed to export Purchases Excel: " + (err?.message || err));
        }
    };


    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500 pb-20">
            {/* Print Styling */}
            <style dangerouslySetInnerHTML={{
                __html: `
                @media print {
                    @page { size: A4; margin: 10mm; }
                    body { background: white !important; }
                    .no-print { display: none !important; }
                    .print-only { display: block !important; }
                    .report-card { border: none !important; shadow: none !important; margin: 0 !important; width: 100% !important; padding: 0 !important; }
                    .daily-summary-header { border-bottom: 2px solid #e2e8f0 !important; }
                    body * { visibility: hidden; }
                    .printable-report, .printable-report * { visibility: visible; }
                    .printable-report { position: absolute; left: 0; top: 0; width: 100%; }
                }
            `}} />
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div>
                    <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tighter">Financial Reports</h2>
                    <p className="text-slate-500 font-bold uppercase tracking-widest text-[10px] mt-1">Comprehensive accounting statements</p>
                </div>
            </div>

            {/* Report Selector */}
            <div className="bg-white rounded-3xl border border-slate-200 p-8 shadow-sm no-print">
                <div className="flex flex-col gap-6 w-full">
                    {/* Row 1: Responsive Grid of Tabs */}
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3 w-full">
                        <button
                            onClick={() => setActiveReport('BALANCE_SHEET')}
                            className={`w-full py-4 px-6 rounded-2xl font-black text-xs md:text-sm uppercase tracking-wider transition-all whitespace-nowrap text-center ${activeReport === 'BALANCE_SHEET'
                                ? 'bg-indigo-600 text-white shadow-lg'
                                : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                                }`}
                        >
                            📊 Balance Sheet
                        </button>
                        <button
                            onClick={() => setActiveReport('INCOME_STATEMENT')}
                            className={`w-full py-4 px-6 rounded-2xl font-black text-xs md:text-sm uppercase tracking-wider transition-all whitespace-nowrap text-center ${activeReport === 'INCOME_STATEMENT'
                                ? 'bg-indigo-600 text-white shadow-lg'
                                : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                                }`}
                        >
                            💰 Income Statement
                        </button>
                        <button
                            onClick={() => setActiveReport('PROFIT_LOSS_LEDGER')}
                            className={`w-full py-4 px-6 rounded-2xl font-black text-xs md:text-sm uppercase tracking-wider transition-all whitespace-nowrap text-center ${activeReport === 'PROFIT_LOSS_LEDGER'
                                ? 'bg-indigo-600 text-white shadow-lg'
                                : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                                }`}
                        >
                            📈 Profit & Loss Ledger
                        </button>
                        <button
                            onClick={() => setActiveReport('TRIAL_BALANCE')}
                            className={`w-full py-4 px-6 rounded-2xl font-black text-xs md:text-sm uppercase tracking-wider transition-all whitespace-nowrap text-center ${activeReport === 'TRIAL_BALANCE'
                                ? 'bg-indigo-600 text-white shadow-lg'
                                : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                                }`}
                        >
                            ⚖️ Trial Balance
                        </button>
                        <button
                            onClick={() => setActiveReport('PURCHASES')}
                            className={`w-full py-4 px-6 rounded-2xl font-black text-xs md:text-sm uppercase tracking-wider transition-all whitespace-nowrap text-center ${activeReport === 'PURCHASES'
                                ? 'bg-indigo-600 text-white shadow-lg'
                                : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                                }`}
                        >
                            🛒 Purchases
                        </button>
                        <button
                            onClick={() => setActiveReport('CATEGORY_REPORT')}
                            className={`w-full py-4 px-6 rounded-2xl font-black text-xs md:text-sm uppercase tracking-wider transition-all whitespace-nowrap text-center ${activeReport === 'CATEGORY_REPORT'
                                ? 'bg-indigo-600 text-white shadow-lg'
                                : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                                }`}
                        >
                            📑 Category Sales
                        </button>
                        <button
                            onClick={() => setActiveReport('CRITICAL_STOCK')}
                            className={`w-full py-4 px-6 rounded-2xl font-black text-xs md:text-sm uppercase tracking-wider transition-all whitespace-nowrap text-center ${activeReport === 'CRITICAL_STOCK'
                                ? 'bg-rose-600 text-white shadow-lg'
                                : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                                }`}
                        >
                            🛑 CRITICAL STOCK
                        </button>
                        <button
                            onClick={() => setActiveReport('DAILY_SUMMARY')}
                            className={`w-full py-4 px-6 rounded-2xl font-black text-xs md:text-sm uppercase tracking-wider transition-all whitespace-nowrap text-center ${activeReport === 'DAILY_SUMMARY'
                                ? 'bg-indigo-600 text-white shadow-lg'
                                : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                                }`}
                        >
                            📅 Daily Summary
                        </button>
                        <button
                            onClick={() => setActiveReport('LIABILITIES')}
                            className={`w-full py-4 px-6 rounded-2xl font-black text-xs md:text-sm uppercase tracking-wider transition-all whitespace-nowrap text-center ${activeReport === 'LIABILITIES'
                                ? 'bg-indigo-600 text-white shadow-lg'
                                : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                                }`}
                        >
                            💸 Liabilities
                        </button>
                    </div>

                    {/* Row 2: Filter Section */}
                    <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-end justify-between pt-4 border-t border-slate-100 w-full">
                        <div className="text-left">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Active Report</span>
                            <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full border border-indigo-100 uppercase">
                                {activeReport.replace('_', ' ')}
                            </span>
                        </div>
                        <div className="flex flex-wrap gap-4 items-end">
                            {activeReport !== 'BALANCE_SHEET' && activeReport !== 'LIABILITIES' && (
                                <div>
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 block">From Date</label>
                                    <input
                                        type="date"
                                        value={startDate}
                                        onChange={(e) => setStartDate(e.target.value)}
                                        className="px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none font-mono text-xs md:text-sm"
                                    />
                                </div>
                            )}
                            <div>
                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 block">
                                    {activeReport === 'BALANCE_SHEET' || activeReport === 'LIABILITIES' ? 'As @ Date' : 'To Date'}
                                </label>
                                <input
                                    type="date"
                                    value={endDate}
                                    onChange={(e) => setEndDate(e.target.value)}
                                    className="px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none font-mono text-xs md:text-sm"
                                />
                            </div>
                            <div>
                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Select Cashier</label>
                                <select
                                    value={selectedCashier}
                                    onChange={(e) => setSelectedCashier(e.target.value)}
                                    className="px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none font-bold text-xs md:text-sm bg-white min-w-[140px]"
                                >
                                    {userProfile.isAdmin && <option value="ALL CASHIERS">ALL CASHIERS</option>}
                                    {(userProfile.allBranches || ['CASHIER 1', 'CASHIER 2', 'CASHIER 3', 'CASHIER 4']).map(branch => (
                                        <option key={branch} value={branch}>{branch}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Balance Sheet */}
            {activeReport === 'BALANCE_SHEET' && (
                <div className="bg-white rounded-3xl border border-slate-200 p-12 shadow-sm max-w-5xl mx-auto overflow-hidden printable-report report-card">
                    <div className="mb-12">
                        <div className="flex justify-between items-start border-b-4 border-indigo-100 pb-4 daily-summary-header">
                            <div>
                                <h3 className="text-4xl font-black text-indigo-900 uppercase">Statement of Financial Position</h3>
                                <p className="text-slate-500 font-black uppercase tracking-[0.2em] text-xs mt-2">As at {endDate || getTodayLocal()}</p>
                            </div>
                            <div className="flex flex-col items-end gap-3 no-print">
                                <div className="flex gap-2">
                                    <button
                                        onClick={handleExportBalanceSheetExcel}
                                        className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 transition-all flex items-center gap-2 shadow-lg shadow-emerald-100 cursor-pointer"
                                    >
                                        📊 EXCEL
                                    </button>
                                    <button
                                        onClick={() => window.print()}
                                        className="px-4 py-2 bg-indigo-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-800 transition-all flex items-center gap-2 shadow-lg shadow-indigo-100 cursor-pointer"
                                    >
                                        📄 PDF / PRINT
                                    </button>
                                </div>
                                <div className="text-right">
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Currency: LKR (Rs.)</span>
                                    <span className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-full text-[10px] font-black uppercase tracking-widest border border-indigo-100 italic">Audit Ready</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="w-full">
                        <table className="w-full border-collapse">
                            <thead>
                                <tr className="border-b-2 border-slate-900">
                                    <th className="text-left py-4 text-xs font-black text-slate-400 uppercase tracking-widest w-[60%]">Description</th>
                                    <th className="text-center py-4 text-xs font-black text-slate-400 uppercase tracking-widest w-[10%]">Notes</th>
                                    <th className="text-right py-4 text-xs font-black text-slate-900 uppercase tracking-widest w-[30%]">
                                        <div className="bg-indigo-900 text-white px-6 py-2 rounded-t-xl text-center">
                                            {new Date().getFullYear()} <br /> <span className="text-[8px] opacity-60">Rs.</span>
                                        </div>
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {/* ASSETS */}
                                <tr>
                                    <td colSpan={3} className="py-6">
                                        <span className="text-sm font-black text-indigo-900 uppercase tracking-[0.1em] border-b border-indigo-200 pb-1">Assets</span>
                                    </td>
                                </tr>
                                <tr className="border-b border-slate-50 hover:bg-indigo-50/50 transition-colors group cursor-pointer" onClick={handleExportCashBankNoteDetails} title="Click to download Cash & Bank Balances breakdown">
                                    <td className="py-3 text-sm font-bold text-slate-700 group-hover:text-indigo-600 flex items-center gap-2">
                                        <span>Cash and Bank Balances</span>
                                        <span className="text-[10px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded font-black opacity-0 group-hover:opacity-100 transition-opacity">
                                            📥 Download Note 01 Details
                                        </span>
                                    </td>
                                    <td className="py-3 text-center text-[10px] font-black text-indigo-600">
                                        <span className="bg-indigo-100 px-2.5 py-1 rounded-md text-indigo-700 hover:bg-indigo-200 transition-colors">01 📥</span>
                                    </td>
                                    <td className="py-3 text-right font-black font-mono text-slate-900">{balanceSheetDisplay.dispCashAndBank.toLocaleString()}</td>
                                </tr>
                                <tr className="border-b border-slate-50 hover:bg-indigo-50/50 transition-colors group cursor-pointer" onClick={() => setIsARModalOpen(true)} title="Click to view & download Accounts Receivable breakup">
                                    <td className="py-3 text-sm font-bold text-slate-700 group-hover:text-indigo-600 flex items-center gap-2">
                                        <span>Accounts Receivable (Customers)</span>
                                        <span className="text-[10px] bg-indigo-600 text-white px-2 py-0.5 rounded font-black opacity-90 group-hover:opacity-100 transition-opacity shadow-sm">
                                            👁️ View Note 02 Breakup
                                        </span>
                                    </td>
                                    <td className="py-3 text-center text-[10px] font-black text-indigo-600" onClick={(e) => { e.stopPropagation(); handleExportARNoteDetails(); }}>
                                        <span className="bg-indigo-100 px-2.5 py-1 rounded-md text-indigo-700 hover:bg-indigo-200 transition-colors" title="Download Note 02 Excel">02 📥</span>
                                    </td>
                                    <td className="py-3 text-right font-black font-mono text-slate-900">{balanceSheetDisplay.dispAccountsReceivable.toLocaleString()}</td>
                                </tr>
                                <tr className="border-b border-slate-50 hover:bg-indigo-50/50 transition-colors group cursor-pointer" onClick={handleExportInventoryNoteDetails} title="Click to download Inventory Stock Assets breakdown">
                                    <td className="py-3 text-sm font-bold text-slate-700 group-hover:text-indigo-600 flex items-center gap-2">
                                        <span>Inventory Stock Assets (At Cost)</span>
                                        <span className="text-[10px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded font-black opacity-0 group-hover:opacity-100 transition-opacity">
                                            📥 Download Note 03 Details
                                        </span>
                                    </td>
                                    <td className="py-3 text-center text-[10px] font-black text-indigo-600">
                                        <span className="bg-indigo-100 px-2.5 py-1 rounded-md text-indigo-700 hover:bg-indigo-200 transition-colors">03 📥</span>
                                    </td>
                                    <td className="py-3 text-right font-black font-mono text-slate-900">{balanceSheetDisplay.dispInventory.toLocaleString()}</td>
                                </tr>
                                <tr className="border-b border-slate-50 hover:bg-indigo-50/50 transition-colors group cursor-pointer" onClick={handleExportFixedAssetsNoteDetails} title="Click to download Fixed Assets breakdown">
                                    <td className="py-3 text-sm font-bold text-slate-700 group-hover:text-indigo-600 flex items-center gap-2">
                                        <span>Fixed Assets (Gross Cost)</span>
                                        <span className="text-[10px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded font-black opacity-0 group-hover:opacity-100 transition-opacity">
                                            📥 Download Note 04 Details
                                        </span>
                                    </td>
                                    <td className="py-3 text-center text-[10px] font-black text-indigo-600">
                                        <span className="bg-indigo-100 px-2.5 py-1 rounded-md text-indigo-700 hover:bg-indigo-200 transition-colors">04 📥</span>
                                    </td>
                                    <td className="py-3 text-right font-black font-mono text-slate-900">{balanceSheetDisplay.dispFixedAssets.toLocaleString()}</td>
                                </tr>
                                <tr className="border-b border-slate-50 hover:bg-indigo-50/50 transition-colors group">
                                    <td className="py-3 text-sm font-bold text-slate-500 pl-8 flex items-center gap-2">
                                        <span>Less: Accumulated Depreciation</span>
                                    </td>
                                    <td className="py-3 text-center"></td>
                                    <td className="py-3 text-right font-black font-mono text-slate-500">({balanceSheetDisplay.dispAccumulatedDepreciation.toLocaleString()})</td>
                                </tr>
                                <tr className="bg-slate-100/50">
                                    <td className="py-4 text-sm font-black text-slate-900 uppercase tracking-wider">Total assets</td>
                                    <td></td>
                                    <td className="py-4 text-right font-black font-mono text-slate-900 border-b-4 border-double border-slate-400">
                                        {balanceSheetDisplay.dispTotalAssets.toLocaleString()}
                                    </td>
                                </tr>

                                {/* LIABILITIES */}
                                <tr>
                                    <td colSpan={3} className="py-8">
                                        <span className="text-sm font-black text-rose-900 uppercase tracking-[0.1em] border-b border-rose-200 pb-1">Liabilities</span>
                                    </td>
                                </tr>
                                <tr className="border-b border-slate-50 hover:bg-indigo-50/50 transition-colors group cursor-pointer" onClick={() => setIsAPModalOpen(true)} title="Click to view & download Accounts Payable breakup">
                                    <td className="py-3 text-sm font-bold text-slate-700 group-hover:text-indigo-600 flex items-center gap-2">
                                        <span>Accounts Payable (Vendors)</span>
                                        <span className="text-[10px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded font-black opacity-0 group-hover:opacity-100 transition-opacity">
                                            👁️ View Note 05 Breakup
                                        </span>
                                    </td>
                                    <td className="py-3 text-center text-[10px] font-black text-indigo-600">
                                        <span className="bg-indigo-100 px-2.5 py-1 rounded-md text-indigo-700 hover:bg-indigo-200 transition-colors">05 👁️</span>
                                    </td>
                                    <td className="py-3 text-right font-black font-mono text-slate-900">{balanceSheetDisplay.dispAccountsPayable.toLocaleString()}</td>
                                </tr>
                                <tr className="border-b border-slate-50 hover:bg-indigo-50/50 transition-colors group cursor-pointer" onClick={handleExportAccruedExpensesNoteDetails} title="Click to download Accrued Expenses breakdown">
                                    <td className="py-3 text-sm font-bold text-slate-700 group-hover:text-indigo-600 flex items-center gap-2">
                                        <span>Accrued Expenses (Unpaid Bills)</span>
                                        <span className="text-[10px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded font-black opacity-0 group-hover:opacity-100 transition-opacity">
                                            📥 Download Note 06 Details
                                        </span>
                                    </td>
                                    <td className="py-3 text-center text-[10px] font-black text-indigo-600">
                                        <span className="bg-indigo-100 px-2.5 py-1 rounded-md text-indigo-700 hover:bg-indigo-200 transition-colors">06 📥</span>
                                    </td>
                                    <td className="py-3 text-right font-black font-mono text-slate-900">{balanceSheetDisplay.dispAccruedExpenses.toLocaleString()}</td>
                                </tr>
                                <tr className="border-b border-slate-50 hover:bg-indigo-50/50 transition-colors group cursor-pointer" onClick={handleExportDirectorCANoteDetails} title="Click to download Director C/A breakdown">
                                    <td className="py-3 text-sm font-bold text-slate-700 group-hover:text-indigo-600 flex items-center gap-2">
                                        <span>Director C/A (Current Account)</span>
                                        <span className="text-[10px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded font-black opacity-0 group-hover:opacity-100 transition-opacity">
                                            📥 Download Note 07 Details
                                        </span>
                                    </td>
                                    <td className="py-3 text-center text-[10px] font-black text-indigo-600">
                                        <span className="bg-indigo-100 px-2.5 py-1 rounded-md text-indigo-700 hover:bg-indigo-200 transition-colors">07 📥</span>
                                    </td>
                                    <td className="py-3 text-right font-black font-mono text-slate-900">{balanceSheetDisplay.dispDirectorCA.toLocaleString()}</td>
                                </tr>
                                <tr className="bg-slate-100/50">
                                    <td className="py-4 text-sm font-black text-slate-900 uppercase tracking-wider">Total Liabilities</td>
                                    <td></td>
                                    <td className="py-4 text-right font-black font-mono text-slate-900 border-b-4 border-double border-slate-400">
                                        {balanceSheetDisplay.dispTotalLiabilities.toLocaleString()}
                                    </td>
                                </tr>

                                {/* SHAREHOLDERS FUNDS */}
                                <tr>
                                    <td colSpan={3} className="py-8">
                                        <span className="text-sm font-black text-emerald-900 uppercase tracking-[0.1em] border-b border-emerald-200 pb-1">Shareholders' Funds</span>
                                    </td>
                                </tr>
                                <tr className="border-b border-slate-50 hover:bg-indigo-50/50 transition-colors group cursor-pointer" onClick={handleExportShareCapitalNoteDetails} title="Click to download Share Capital breakdown">
                                    <td className="py-3 text-sm font-bold text-slate-700 group-hover:text-indigo-600 flex items-center gap-2">
                                        <span>Share Capital</span>
                                        <span className="text-[10px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded font-black opacity-0 group-hover:opacity-100 transition-opacity">
                                            📥 Download Note 08 Details
                                        </span>
                                    </td>
                                    <td className="py-3 text-center text-[10px] font-black text-indigo-600">
                                        <span className="bg-indigo-100 px-2.5 py-1 rounded-md text-indigo-700 hover:bg-indigo-200 transition-colors">08 📥</span>
                                    </td>
                                    <td className="py-3 text-right font-black font-mono text-slate-900">{balanceSheetDisplay.dispShareCapital.toLocaleString()}</td>
                                </tr>
                                <tr className="border-b border-slate-50 hover:bg-indigo-50/50 transition-colors group cursor-pointer" onClick={handleExportRetainedEarningsNoteDetails} title="Click to download Retained Earnings breakdown">
                                    <td className="py-3 text-sm font-bold text-slate-700 group-hover:text-indigo-600 flex items-center gap-2">
                                        <span>Retained Earnings / (Loss)</span>
                                        <span className="text-[10px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded font-black opacity-0 group-hover:opacity-100 transition-opacity">
                                            📥 Download Note 09 Details
                                        </span>
                                    </td>
                                    <td className="py-3 text-center text-[10px] font-black text-indigo-600">
                                        <span className="bg-indigo-100 px-2.5 py-1 rounded-md text-indigo-700 hover:bg-indigo-200 transition-colors">09 📥</span>
                                    </td>
                                    <td className="py-3 text-right font-black font-mono text-slate-900">{balanceSheetDisplay.dispRetainedEarnings.toLocaleString()}</td>
                                </tr>
                                <tr className="bg-indigo-50/50">
                                    <td className="py-4 text-sm font-black text-indigo-900 uppercase tracking-wider">Total Shareholders' Funds</td>
                                    <td></td>
                                    <td className="py-4 text-right font-black font-mono text-indigo-900 border-b-4 border-double border-indigo-400">
                                        {balanceSheetDisplay.dispTotalEquity.toLocaleString()}
                                    </td>
                                </tr>

                                {/* FINAL TOTAL */}
                                <tr className="bg-indigo-900 text-white">
                                    <td className="py-6 px-4 text-base font-black uppercase tracking-[0.1em]">Total Liabilities and Shareholders' Funds</td>
                                    <td></td>
                                    <td className="py-6 px-4 text-right text-xl font-black font-mono border-b-8 border-double border-white/30">
                                        {(balanceSheetDisplay.dispTotalLiabilities + balanceSheetDisplay.dispTotalEquity).toLocaleString()}
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    <div className="mt-16 flex justify-between items-start gap-20">
                        <div className="flex-1 space-y-12">
                            <div className="border-t border-slate-300 pt-3">
                                <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Chief Financial Officer</p>
                                <div className="h-10 mt-2 italic font-serif text-slate-300 select-none">Signature Required</div>
                            </div>
                            <div className="flex justify-between gap-12">
                                <div className="flex-1 border-t border-slate-300 pt-3">
                                    <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Director</p>
                                </div>
                                <div className="flex-1 border-t border-slate-300 pt-3">
                                    <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Director</p>
                                </div>
                            </div>
                        </div>
                        <div className="w-1/3 text-right text-[9px] font-bold text-slate-400 leading-relaxed italic">
                            I certify that these Financial Statements are in compliance with the requirements of the Companies Act No. 07 of 2007. <br />
                            Report Generated on {new Date().toLocaleString()} <br />
                            Enterprise ERP System - Secure Audit Trail
                        </div>
                    </div>

                    {/* Accounting Equation Check */}
                    <div className="mt-12 p-4 bg-slate-50 rounded-2xl border border-slate-200 border-dashed">
                        <div className="flex items-center justify-center gap-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                            <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                                Assets: Rs. {balanceSheetDisplay.dispTotalAssets.toLocaleString()}
                            </div>
                            <span>=</span>
                            <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                                Liabilities: Rs. {balanceSheetDisplay.dispTotalLiabilities.toLocaleString()}
                            </div>
                            <span>+</span>
                            <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                                Equity: Rs. {balanceSheetDisplay.dispTotalEquity.toLocaleString()}
                            </div>
                            {Math.abs(balanceSheetDisplay.dispTotalAssets - (balanceSheetDisplay.dispTotalLiabilities + balanceSheetDisplay.dispTotalEquity)) < 0.1 ? (
                                <span className="ml-6 px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded text-[8px]">✓ PERFECTLY BALANCED</span>
                            ) : (
                                <span className="ml-6 px-2 py-0.5 bg-rose-100 text-rose-700 rounded text-[8px]">⚠ DISCREPANCY DETECTED</span>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Income Statement */}
            {activeReport === 'INCOME_STATEMENT' && (
                <div className="bg-white rounded-3xl border border-slate-200 p-12 shadow-sm max-w-5xl mx-auto overflow-hidden printable-report report-card space-y-8">
                    {/* Top Action Bar */}
                    <div className="flex justify-between items-start border-b-4 border-slate-900 pb-4 daily-summary-header">
                        <div>
                            <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">{userProfile.companyName || 'PRASAMA (PVT) LTD'}</h2>
                            <h3 className="text-sm font-black text-indigo-700 uppercase tracking-widest mt-1">STATEMENT OF PROFIT OR LOSS AND OTHER COMPREHENSIVE INCOME</h3>
                            <p className="text-slate-500 font-bold uppercase tracking-[0.15em] text-xs mt-1">
                                FOR THE PERIOD: {formatMMDDYYYY(startDate) || 'BEGINNING'} TO {formatMMDDYYYY(endDate || getTodayLocal())} (LKR)
                            </p>
                        </div>
                        <div className="flex flex-col items-end gap-3 no-print">
                            <div className="flex gap-2">
                                <button
                                    onClick={handleExportIncomeStatementExcel}
                                    className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 transition-all flex items-center gap-2 shadow-lg shadow-emerald-100 cursor-pointer"
                                >
                                    📊 EXCEL
                                </button>
                                <button
                                    onClick={() => window.print()}
                                    className="px-4 py-2 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all flex items-center gap-2 shadow-lg shadow-slate-100 cursor-pointer"
                                >
                                    📄 PDF / PRINT
                                </button>
                            </div>
                            <div className="text-right">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Status: Certified Final</span>
                                <span className="px-3 py-1 bg-emerald-50 text-emerald-700 rounded-full text-[10px] font-black uppercase tracking-widest border border-emerald-200">Standard Audit Trail</span>
                            </div>
                        </div>
                    </div>

                    {/* Standard Corporate Statement Table */}
                    <div className="w-full border-2 border-slate-900 rounded-xl overflow-hidden bg-white shadow-sm">
                        <table className="w-full text-xs border-collapse">
                            <thead>
                                <tr className="border-b-2 border-slate-900 bg-slate-100 text-slate-800 font-black uppercase text-[11px]">
                                    <th className="text-left py-3.5 px-6 w-[65%]">Line Item Description</th>
                                    <th className="text-center py-3.5 px-2 w-[10%]">Notes</th>
                                    <th className="text-right py-3.5 px-6 w-[25%] font-mono">Current Period (LKR)</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200 font-semibold">
                                {/* Gross Income Header */}
                                <tr className="bg-slate-50 font-black">
                                    <td className="py-3.5 px-6 text-sm uppercase text-slate-900">Gross Income</td>
                                    <td></td>
                                    <td className="py-3.5 px-6 text-right font-mono text-sm">{Math.round(incomeStatement.revenue).toLocaleString()}</td>
                                </tr>

                                {/* Direct Sales Revenue */}
                                <tr className="hover:bg-indigo-50/40 transition-colors cursor-pointer group" onClick={handleExportRevenueNoteDetails} title="Click to download Note 07 breakdown">
                                    <td className="py-2.5 px-6 pl-10 text-slate-800 flex items-center gap-2">
                                        <span>Direct Sales Revenue</span>
                                        <span className="text-[9px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded font-black opacity-0 group-hover:opacity-100 transition-opacity">📥 Note 07</span>
                                    </td>
                                    <td className="py-2.5 text-center"><span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded font-black text-[10px]">07 📥</span></td>
                                    <td className="py-2.5 px-6 text-right font-mono text-slate-900">{incomeStatementDisplay.dispRevenue.toLocaleString()}</td>
                                </tr>

                                {/* Cost of Sales */}
                                <tr className="hover:bg-rose-50/40 transition-colors cursor-pointer group" onClick={handleExportCOGSNoteDetails} title="Click to download Note 08 breakdown">
                                    <td className="py-2.5 px-6 pl-10 text-rose-700 italic flex items-center gap-2">
                                        <span>Less: Cost of Sales (COGS)</span>
                                        <span className="text-[9px] bg-rose-100 text-rose-700 px-2 py-0.5 rounded font-black opacity-0 group-hover:opacity-100 transition-opacity">📥 Note 08</span>
                                    </td>
                                    <td className="py-2.5 text-center"><span className="bg-rose-100 text-rose-700 px-2 py-0.5 rounded font-black text-[10px]">08 📥</span></td>
                                    <td className="py-2.5 px-6 text-right font-mono text-rose-700">({incomeStatementDisplay.dispCogs.toLocaleString()})</td>
                                </tr>

                                {/* Net Direct Income */}
                                <tr className="border-t-2 border-b-2 border-slate-900 bg-slate-100/70 font-black">
                                    <td className="py-3 px-6 uppercase text-slate-900">Net Direct Income / Gross Profit</td>
                                    <td></td>
                                    <td className="py-3 px-6 text-right font-mono">{incomeStatementDisplay.dispGrossProfit.toLocaleString()}</td>
                                </tr>

                                {/* Fee & Commission */}
                                <tr>
                                    <td className="py-2.5 px-6 pl-10 text-slate-800">Fee and Commission Income</td>
                                    <td></td>
                                    <td className="py-2.5 px-6 text-right font-mono">0</td>
                                </tr>
                                <tr>
                                    <td className="py-2.5 px-6 pl-10 text-rose-700 italic">Less: Fee and Commission Expenses</td>
                                    <td></td>
                                    <td className="py-2.5 px-6 text-right font-mono text-rose-700">(0)</td>
                                </tr>
                                <tr className="border-t border-b border-slate-300 font-bold bg-slate-50">
                                    <td className="py-2.5 px-6 uppercase text-slate-900">Net Fee and Commission Income</td>
                                    <td></td>
                                    <td className="py-2.5 px-6 text-right font-mono">0</td>
                                </tr>

                                {/* Other Operating Income */}
                                <tr>
                                    <td className="py-2.5 px-6 font-bold text-slate-800">Other Operating Income</td>
                                    <td></td>
                                    <td className="py-2.5 px-6 text-right font-mono">0</td>
                                </tr>
                                <tr className="border-t-2 border-b-2 border-slate-900 bg-slate-100 font-black">
                                    <td className="py-3 px-6 text-slate-900 uppercase">Total Operating Income</td>
                                    <td></td>
                                    <td className="py-3 px-6 text-right font-mono">{incomeStatementDisplay.dispGrossProfit.toLocaleString()}</td>
                                </tr>

                                {/* Impairment Charges */}
                                <tr>
                                    <td className="py-2.5 px-6 text-rose-700 italic">Impairment Charges for Stock & Advances</td>
                                    <td></td>
                                    <td className="py-2.5 px-6 text-right font-mono text-rose-700">(0)</td>
                                </tr>
                                <tr className="border-t-2 border-b-2 border-slate-900 bg-slate-100/80 font-black">
                                    <td className="py-3 px-6 text-slate-900 uppercase">Net Operating Income</td>
                                    <td></td>
                                    <td className="py-3 px-6 text-right font-mono">{incomeStatementDisplay.dispGrossProfit.toLocaleString()}</td>
                                </tr>

                                {/* Operating Expenses Header */}
                                <tr className="bg-slate-100 font-black border-t-2 border-slate-900">
                                    <td colSpan={3} className="py-3 px-6 uppercase tracking-wider text-rose-900">Operating Expenses</td>
                                </tr>
                                {incomeStatement.expenseBreakdown.map(([category, amount], idx) => {
                                    const noteStr = String(9 + idx).padStart(2, '0');
                                    return (
                                        <tr key={category} className="hover:bg-slate-50 transition-colors cursor-pointer group" onClick={() => handleExportExpenseCategoryNoteDetails(category, noteStr)}>
                                            <td className="py-2.5 px-6 pl-10 text-slate-800 flex items-center gap-2">
                                                <span>{category}</span>
                                                <span className="text-[9px] bg-slate-200 text-slate-700 px-2 py-0.5 rounded font-black opacity-0 group-hover:opacity-100 transition-opacity">📥 Note {noteStr}</span>
                                            </td>
                                            <td className="py-2.5 text-center"><span className="bg-slate-200 text-slate-700 px-2 py-0.5 rounded font-black text-[10px]">{noteStr} 📥</span></td>
                                            <td className="py-2.5 px-6 text-right font-mono text-rose-700">({Math.round(amount).toLocaleString()})</td>
                                        </tr>
                                    );
                                })}
                                {incomeStatementDisplay.dispDepreciationExpense > 0 && (
                                    <tr className="hover:bg-slate-50 transition-colors group">
                                        <td className="py-2.5 px-6 pl-10 text-slate-800 flex items-center gap-2">
                                            <span>Depreciation Expense</span>
                                        </td>
                                        <td className="py-2.5 text-center"></td>
                                        <td className="py-2.5 px-6 text-right font-mono text-rose-700">({incomeStatementDisplay.dispDepreciationExpense.toLocaleString()})</td>
                                    </tr>
                                )}
                                {incomeStatement.expenseBreakdown.length === 0 && incomeStatementDisplay.dispDepreciationExpense === 0 && (
                                    <tr>
                                        <td colSpan={3} className="py-3 px-6 pl-10 text-slate-400 italic">No Operating Expenses Recorded</td>
                                    </tr>
                                )}

                                {/* Operating Profit before Tax */}
                                <tr className="border-t-2 border-b-2 border-slate-900 bg-rose-50/70 font-black">
                                    <td className="py-3.5 px-6 text-rose-950 uppercase">Operating Profit before Tax on Financial / Commercial Services</td>
                                    <td></td>
                                    <td className="py-3.5 px-6 text-right font-mono text-sm">{incomeStatementDisplay.dispNetIncome.toLocaleString()}</td>
                                </tr>

                                {/* Tax on Services */}
                                <tr>
                                    <td className="py-2.5 px-6 text-rose-700 italic">Tax on Financial / Commercial Services</td>
                                    <td></td>
                                    <td className="py-2.5 px-6 text-right font-mono text-rose-700">(0)</td>
                                </tr>
                                <tr className="border-t border-b border-slate-400 font-bold">
                                    <td className="py-2.5 px-6 uppercase text-slate-900">Profit / (Loss) before Income Tax Expense</td>
                                    <td></td>
                                    <td className="py-2.5 px-6 text-right font-mono">{incomeStatementDisplay.dispNetIncome.toLocaleString()}</td>
                                </tr>

                                {/* Income Tax Expense */}
                                <tr>
                                    <td className="py-2.5 px-6 text-rose-700 italic">Income Tax Expense</td>
                                    <td></td>
                                    <td className="py-2.5 px-6 text-right font-mono text-rose-700">(0)</td>
                                </tr>

                                {/* Profit / (Loss) for the Period */}
                                <tr className="border-t-2 border-b-4 border-double border-slate-900 bg-slate-900 text-white font-black text-sm">
                                    <td className="py-4 px-6 uppercase tracking-wider">Profit / (Loss) for the Period</td>
                                    <td></td>
                                    <td className="py-4 px-6 text-right font-mono text-lg">{incomeStatementDisplay.dispNetIncome.toLocaleString()}</td>
                                </tr>

                                {/* Earnings Contribution Ratio */}
                                <tr className="border-b-4 border-double border-slate-900 bg-slate-100 font-black text-xs">
                                    <td className="py-3 px-6 text-slate-800 uppercase">Basic Earnings Margin Ratio / Contribution (%)</td>
                                    <td></td>
                                    <td className="py-3 px-6 text-right font-mono text-indigo-900">{incomeStatement.netMargin.toFixed(2)}% NET</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    <div className="mt-12 text-center border-t border-slate-200 pt-6">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em]">End of Financial Statement — Certified Enterprise Audit Trail</p>
                    </div>
                </div>
            )}

            {/* Profit & Loss Ledger */}
            {activeReport === 'PROFIT_LOSS_LEDGER' && (
                <div className="bg-white rounded-3xl border border-slate-200 p-12 shadow-sm max-w-7xl mx-auto overflow-hidden printable-report report-card space-y-10">
                    {/* Header Bar */}
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b-4 border-slate-900 pb-6 daily-summary-header gap-4">
                        <div>
                            <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">{userProfile.companyName || 'PRASAMA (PVT) LTD'}</h2>
                            <h3 className="text-sm font-black text-indigo-700 uppercase tracking-widest mt-1">STATEMENT OF PROFIT OR LOSS AND OTHER COMPREHENSIVE INCOME</h3>
                            <p className="text-slate-500 font-bold uppercase tracking-[0.15em] text-xs mt-1">
                                FOR THE PERIOD: {formatMMDDYYYY(startDate) || 'BEGINNING'} TO {formatMMDDYYYY(endDate || getTodayLocal())} (LKR) | Cashier: {selectedCashier}
                            </p>
                        </div>
                        <div className="flex items-center gap-3 no-print">
                            <button
                                onClick={handleExportProfitLossLedgerExcel}
                                className="px-5 py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-emerald-700 transition-all flex items-center gap-2 shadow-lg shadow-emerald-100 cursor-pointer"
                            >
                                📊 EXCEL
                            </button>
                            <button
                                onClick={() => window.print()}
                                className="px-5 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-slate-800 transition-all flex items-center gap-2 shadow-lg shadow-slate-100 cursor-pointer"
                            >
                                📄 PDF / PRINT
                            </button>
                        </div>
                    </div>

                    {/* 4 Summary KPI Cards */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 no-print">
                        <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 space-y-1">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Gross Sales / Revenue</span>
                            <p className="text-2xl font-black text-slate-900 font-mono">Rs. {profitLossLedgerData.totalRevenue.toLocaleString()}</p>
                            <span className="text-[9px] font-bold text-slate-500 uppercase">100% of Total Revenue</span>
                        </div>

                        <div className="bg-rose-50/50 p-6 rounded-2xl border border-rose-100 space-y-1">
                            <span className="text-[10px] font-black text-rose-500 uppercase tracking-widest block">Cost of Sales (COGS)</span>
                            <p className="text-2xl font-black text-rose-600 font-mono">Rs. {profitLossLedgerData.totalCogs.toLocaleString()}</p>
                            <span className="text-[9px] font-bold text-rose-400 uppercase">Direct Inventory & Product Cost</span>
                        </div>

                        <div className="bg-emerald-50/50 p-6 rounded-2xl border border-emerald-100 space-y-1">
                            <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest block">Gross Profit</span>
                            <p className="text-2xl font-black text-emerald-700 font-mono">Rs. {profitLossLedgerData.grossProfit.toLocaleString()}</p>
                            <span className="text-[9px] font-bold text-emerald-600 uppercase">Margin: {profitLossLedgerData.grossMarginPct.toFixed(1)}%</span>
                        </div>

                        <div className={`p-6 rounded-2xl border space-y-1 ${profitLossLedgerData.netProfit >= 0 ? 'bg-indigo-50/50 border-indigo-100' : 'bg-rose-100/50 border-rose-200'}`}>
                            <span className={`text-[10px] font-black uppercase tracking-widest block ${profitLossLedgerData.netProfit >= 0 ? 'text-indigo-600' : 'text-rose-600'}`}>
                                Net Profit / (Loss)
                            </span>
                            <p className={`text-2xl font-black font-mono ${profitLossLedgerData.netProfit >= 0 ? 'text-indigo-900' : 'text-rose-700'}`}>
                                Rs. {profitLossLedgerData.netProfit.toLocaleString()}
                            </p>
                            <span className={`text-[9px] font-bold uppercase ${profitLossLedgerData.netProfit >= 0 ? 'text-indigo-600' : 'text-rose-600'}`}>
                                Net Margin: {profitLossLedgerData.netMarginPct.toFixed(1)}%
                            </span>
                        </div>
                    </div>

                    {/* Standard Corporate Statement Structure with Interactive Download Notes on Every Line */}
                    <div className="w-full border-2 border-slate-900 rounded-xl overflow-hidden bg-white shadow-sm">
                        <table className="w-full text-xs border-collapse">
                            <thead>
                                <tr className="border-b-2 border-slate-900 bg-slate-100 text-slate-800 font-black uppercase text-[11px]">
                                    <th className="text-left py-3.5 px-6 w-[65%]">Line Item Description</th>
                                    <th className="text-center py-3.5 px-2 w-[10%]">Notes</th>
                                    <th className="text-right py-3.5 px-6 w-[25%] font-mono">Current Period (LKR)</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200 font-semibold">
                                {/* Gross Income Header */}
                                <tr className="bg-slate-50 font-black cursor-pointer hover:bg-slate-100 transition-colors group" onClick={handleExportRevenueNoteDetails} title="Click to download Gross Income details">
                                    <td className="py-3.5 px-6 text-sm uppercase text-slate-900 flex items-center justify-between">
                                        <span>Gross Income</span>
                                        <span className="text-[9px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded font-black opacity-0 group-hover:opacity-100 transition-opacity">📥 Download Details</span>
                                    </td>
                                    <td className="text-center"><span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded font-black text-[10px]">07 📥</span></td>
                                    <td className="py-3.5 px-6 text-right font-mono text-sm">{Math.round(profitLossLedgerData.totalRevenue).toLocaleString()}</td>
                                </tr>

                                {/* Direct Sales Revenue */}
                                <tr className="hover:bg-indigo-50/40 transition-colors cursor-pointer group" onClick={handleExportRevenueNoteDetails} title="Click to download Direct Sales Revenue Note 07 breakdown">
                                    <td className="py-2.5 px-6 pl-10 text-slate-800 flex items-center justify-between">
                                        <span>Direct Sales Revenue</span>
                                        <span className="text-[9px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded font-black opacity-0 group-hover:opacity-100 transition-opacity">📥 Download Note 07 Details</span>
                                    </td>
                                    <td className="py-2.5 text-center"><span className="bg-indigo-100 text-indigo-700 px-2.5 py-1 rounded-md font-black text-[10px] hover:bg-indigo-200 transition-colors">07 📥</span></td>
                                    <td className="py-2.5 px-6 text-right font-mono text-slate-900">{Math.round(profitLossLedgerData.totalRevenue).toLocaleString()}</td>
                                </tr>

                                {/* Cost of Sales */}
                                <tr className="hover:bg-rose-50/40 transition-colors cursor-pointer group" onClick={handleExportCOGSNoteDetails} title="Click to download Cost of Sales (COGS) Note 08 breakdown">
                                    <td className="py-2.5 px-6 pl-10 text-rose-700 italic flex items-center justify-between">
                                        <span>Less: Cost of Sales (COGS)</span>
                                        <span className="text-[9px] bg-rose-100 text-rose-700 px-2 py-0.5 rounded font-black opacity-0 group-hover:opacity-100 transition-opacity">📥 Download Note 08 Details</span>
                                    </td>
                                    <td className="py-2.5 text-center"><span className="bg-rose-100 text-rose-700 px-2.5 py-1 rounded-md font-black text-[10px] hover:bg-rose-200 transition-colors">08 📥</span></td>
                                    <td className="py-2.5 px-6 text-right font-mono text-rose-700">({Math.round(profitLossLedgerData.totalCogs).toLocaleString()})</td>
                                </tr>

                                {/* Net Direct Income / Gross Profit */}
                                <tr className="border-t-2 border-b-2 border-slate-900 bg-slate-100/70 font-black hover:bg-slate-200/70 transition-colors cursor-pointer group" onClick={handleExportProfitLossLedgerExcel} title="Click to download Gross Profit ledger breakdown">
                                    <td className="py-3 px-6 uppercase text-slate-900 flex items-center justify-between">
                                        <span>Net Direct Income / Gross Profit</span>
                                        <span className="text-[9px] bg-slate-300 text-slate-800 px-2 py-0.5 rounded font-black opacity-0 group-hover:opacity-100 transition-opacity">📥 Download Gross Profit Summary</span>
                                    </td>
                                    <td className="text-center"><span className="bg-slate-200 text-slate-800 px-2 py-0.5 rounded font-black text-[10px]">07/08 📥</span></td>
                                    <td className="py-3 px-6 text-right font-mono">{Math.round(profitLossLedgerData.grossProfit).toLocaleString()}</td>
                                </tr>

                                {/* Fee and Commission Income */}
                                <tr className="hover:bg-slate-50 transition-colors cursor-pointer group" onClick={handleExportRevenueNoteDetails} title="Click to download Fee & Commission Income details">
                                    <td className="py-2.5 px-6 pl-10 text-slate-800 flex items-center justify-between">
                                        <span>Fee and Commission Income</span>
                                        <span className="text-[9px] bg-slate-200 text-slate-700 px-2 py-0.5 rounded font-black opacity-0 group-hover:opacity-100 transition-opacity">📥 Download Details</span>
                                    </td>
                                    <td className="py-2.5 text-center"><span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-black text-[10px]">07 📥</span></td>
                                    <td className="py-2.5 px-6 text-right font-mono">0</td>
                                </tr>
                                <tr className="hover:bg-slate-50 transition-colors cursor-pointer group" onClick={handleExportRevenueNoteDetails} title="Click to download Fee & Commission Expenses details">
                                    <td className="py-2.5 px-6 pl-10 text-rose-700 italic flex items-center justify-between">
                                        <span>Less: Fee and Commission Expenses</span>
                                        <span className="text-[9px] bg-rose-100 text-rose-700 px-2 py-0.5 rounded font-black opacity-0 group-hover:opacity-100 transition-opacity">📥 Download Details</span>
                                    </td>
                                    <td className="py-2.5 text-center"><span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-black text-[10px]">07 📥</span></td>
                                    <td className="py-2.5 px-6 text-right font-mono text-rose-700">(0)</td>
                                </tr>
                                <tr className="border-t border-b border-slate-300 font-bold bg-slate-50">
                                    <td className="py-2.5 px-6 uppercase text-slate-900">Net Fee and Commission Income</td>
                                    <td className="text-center"><span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-black text-[10px]">07 📥</span></td>
                                    <td className="py-2.5 px-6 text-right font-mono">0</td>
                                </tr>

                                {/* Other Operating Income */}
                                <tr className="hover:bg-slate-50 transition-colors cursor-pointer group" onClick={handleExportRevenueNoteDetails} title="Click to download Other Operating Income details">
                                    <td className="py-2.5 px-6 font-bold text-slate-800 flex items-center justify-between">
                                        <span>Other Operating Income</span>
                                        <span className="text-[9px] bg-slate-200 text-slate-700 px-2 py-0.5 rounded font-black opacity-0 group-hover:opacity-100 transition-opacity">📥 Download Details</span>
                                    </td>
                                    <td className="text-center"><span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-black text-[10px]">07 📥</span></td>
                                    <td className="py-2.5 px-6 text-right font-mono">0</td>
                                </tr>
                                <tr className="border-t-2 border-b-2 border-slate-900 bg-slate-100 font-black">
                                    <td className="py-3 px-6 text-slate-900 uppercase">Total Operating Income</td>
                                    <td className="text-center"><span className="bg-slate-200 text-slate-800 px-2 py-0.5 rounded font-black text-[10px]">07/08 📥</span></td>
                                    <td className="py-3 px-6 text-right font-mono">{Math.round(profitLossLedgerData.grossProfit).toLocaleString()}</td>
                                </tr>

                                {/* Impairment Charges */}
                                <tr className="hover:bg-slate-50 transition-colors cursor-pointer group" onClick={handleExportCOGSNoteDetails} title="Click to download Impairment Charges details">
                                    <td className="py-2.5 px-6 text-rose-700 italic flex items-center justify-between">
                                        <span>Impairment Charges for Stock & Advances</span>
                                        <span className="text-[9px] bg-rose-100 text-rose-700 px-2 py-0.5 rounded font-black opacity-0 group-hover:opacity-100 transition-opacity">📥 Download Details</span>
                                    </td>
                                    <td className="text-center"><span className="bg-rose-100 text-rose-700 px-2 py-0.5 rounded font-black text-[10px]">08 📥</span></td>
                                    <td className="py-2.5 px-6 text-right font-mono text-rose-700">(0)</td>
                                </tr>
                                <tr className="border-t-2 border-b-2 border-slate-900 bg-slate-100/80 font-black">
                                    <td className="py-3 px-6 text-slate-900 uppercase">Net Operating Income</td>
                                    <td className="text-center"><span className="bg-slate-200 text-slate-800 px-2 py-0.5 rounded font-black text-[10px]">07/08 📥</span></td>
                                    <td className="py-3 px-6 text-right font-mono">{Math.round(profitLossLedgerData.grossProfit).toLocaleString()}</td>
                                </tr>

                                {/* Operating Expenses Section Header */}
                                <tr className="bg-slate-100 font-black border-t-2 border-slate-900">
                                    <td colSpan={3} className="py-3 px-6 uppercase tracking-wider text-rose-900">Operating Expenses</td>
                                </tr>

                                {/* Itemized Operating Expense Rows */}
                                {incomeStatement.expenseBreakdown.map(([cat, amt], idx) => {
                                    const noteStr = String(9 + idx).padStart(2, '0');
                                    return (
                                        <tr key={cat} className="hover:bg-slate-50 transition-colors cursor-pointer group" onClick={() => handleExportExpenseCategoryNoteDetails(cat, noteStr)} title={`Click to download ${cat} Note ${noteStr} details`}>
                                            <td className="py-2.5 px-6 pl-10 text-slate-800 flex items-center justify-between">
                                                <span>{cat}</span>
                                                <span className="text-[9px] bg-slate-200 text-slate-800 px-2 py-0.5 rounded font-black opacity-0 group-hover:opacity-100 transition-opacity">📥 Download Note {noteStr} Details</span>
                                            </td>
                                            <td className="py-2.5 text-center"><span className="bg-slate-200 text-slate-800 px-2.5 py-1 rounded-md font-black text-[10px] hover:bg-slate-300 transition-colors">{noteStr} 📥</span></td>
                                            <td className="py-2.5 px-6 text-right font-mono text-rose-700">({Math.round(amt).toLocaleString()})</td>
                                        </tr>
                                    );
                                })}
                                {incomeStatement.expenseBreakdown.length === 0 && (
                                    <tr>
                                        <td colSpan={3} className="py-3 px-6 pl-10 text-slate-400 italic">No Operating Expenses Recorded</td>
                                    </tr>
                                )}

                                {/* Operating Profit before Tax */}
                                <tr className="border-t-2 border-b-2 border-slate-900 bg-rose-50/70 font-black hover:bg-rose-100/70 transition-colors cursor-pointer group" onClick={handleExportProfitLossLedgerExcel} title="Click to download Operating Profit details">
                                    <td className="py-3.5 px-6 text-rose-950 uppercase flex items-center justify-between">
                                        <span>Operating Profit before Tax on Commercial Services</span>
                                        <span className="text-[9px] bg-rose-200 text-rose-900 px-2 py-0.5 rounded font-black opacity-0 group-hover:opacity-100 transition-opacity">📥 Download P&L Summary</span>
                                    </td>
                                    <td className="text-center"><span className="bg-rose-200 text-rose-900 px-2 py-0.5 rounded font-black text-[10px]">P&L 📥</span></td>
                                    <td className="py-3.5 px-6 text-right font-mono text-sm">{Math.round(profitLossLedgerData.netProfit).toLocaleString()}</td>
                                </tr>

                                {/* Tax */}
                                <tr>
                                    <td className="py-2.5 px-6 text-rose-700 italic">Tax on Commercial Services</td>
                                    <td className="text-center"><span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-black text-[10px]">T1 📥</span></td>
                                    <td className="py-2.5 px-6 text-right font-mono text-rose-700">(0)</td>
                                </tr>
                                <tr className="border-t border-b border-slate-400 font-bold">
                                    <td className="py-2.5 px-6 uppercase text-slate-900">Profit / (Loss) before Income Tax Expense</td>
                                    <td className="text-center"><span className="bg-slate-200 text-slate-800 px-2 py-0.5 rounded font-black text-[10px]">P&L 📥</span></td>
                                    <td className="py-2.5 px-6 text-right font-mono">{Math.round(profitLossLedgerData.netProfit).toLocaleString()}</td>
                                </tr>
                                <tr>
                                    <td className="py-2.5 px-6 text-rose-700 italic">Income Tax Expense</td>
                                    <td className="text-center"><span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-black text-[10px]">T2 📥</span></td>
                                    <td className="py-2.5 px-6 text-right font-mono text-rose-700">(0)</td>
                                </tr>

                                {/* Profit / (Loss) for the Period */}
                                <tr className="border-t-2 border-b-4 border-double border-slate-900 bg-slate-900 text-white font-black text-sm hover:bg-slate-800 transition-colors cursor-pointer group" onClick={handleExportProfitLossLedgerExcel} title="Click to download Profit for the Period details">
                                    <td className="py-4 px-6 uppercase tracking-wider flex items-center justify-between">
                                        <span>Profit / (Loss) for the Period</span>
                                        <span className="text-[9px] bg-slate-700 text-white px-2 py-0.5 rounded font-black opacity-0 group-hover:opacity-100 transition-opacity">📥 Download Complete P&L Workbook</span>
                                    </td>
                                    <td className="text-center"><span className="bg-slate-800 text-white px-2 py-0.5 rounded font-black text-[10px]">P&L 📥</span></td>
                                    <td className="py-4 px-6 text-right font-mono text-lg">{Math.round(profitLossLedgerData.netProfit).toLocaleString()}</td>
                                </tr>

                                {/* Earnings Contribution Ratio */}
                                <tr className="border-b-4 border-double border-slate-900 bg-slate-100 font-black text-xs">
                                    <td className="py-3 px-6 text-slate-800 uppercase">Basic Earnings Margin Ratio / Contribution (%)</td>
                                    <td></td>
                                    <td className="py-3 px-6 text-right font-mono text-indigo-900">{profitLossLedgerData.netMarginPct.toFixed(2)}% NET</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    {/* Detailed P&L Transaction Ledger Stream */}
                    <div className="space-y-4 no-print">
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                            <div>
                                <h4 className="text-sm font-black text-slate-900 uppercase tracking-wide">Detailed Profit & Loss Ledger Stream</h4>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Itemized transaction log contributing to P&L ({profitLossLedgerFilteredStream.length} entries)</p>
                            </div>
                            <div className="flex gap-3 items-center w-full md:w-auto">
                                <div className="flex bg-white rounded-xl border border-slate-200 p-1 shadow-sm">
                                    <button
                                        onClick={() => setPnlTypeFilter('ALL')}
                                        className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all ${pnlTypeFilter === 'ALL' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-900'}`}
                                    >
                                        All
                                    </button>
                                    <button
                                        onClick={() => setPnlTypeFilter('SALE')}
                                        className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all ${pnlTypeFilter === 'SALE' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-slate-900'}`}
                                    >
                                        Revenue
                                    </button>
                                    <button
                                        onClick={() => setPnlTypeFilter('EXPENSE')}
                                        className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all ${pnlTypeFilter === 'EXPENSE' ? 'bg-rose-600 text-white' : 'text-slate-400 hover:text-slate-900'}`}
                                    >
                                        Expenses
                                    </button>
                                </div>
                                <input
                                    type="text"
                                    placeholder="Search P&L ledger entries..."
                                    className="px-4 py-2 bg-white rounded-xl border border-slate-200 text-xs font-bold outline-none focus:border-indigo-500 w-64 shadow-sm"
                                    value={pnlLedgerSearch}
                                    onChange={e => setPnlLedgerSearch(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="overflow-x-auto border border-slate-200 rounded-2xl bg-white shadow-sm max-h-[600px] overflow-y-auto custom-scrollbar">
                            <table className="w-full text-left text-xs border-collapse">
                                <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-400 sticky top-0 backdrop-blur-md z-10 border-b border-slate-200">
                                    <tr>
                                        <th className="px-4 py-3">Date & Time</th>
                                        <th className="px-4 py-3">Ref ID</th>
                                        <th className="px-4 py-3">Category</th>
                                        <th className="px-4 py-3">Description</th>
                                        <th className="px-4 py-3 text-right text-emerald-600">Revenue (+ LKR)</th>
                                        <th className="px-4 py-3 text-right text-rose-600">Cost / Expense (- LKR)</th>
                                        <th className="px-4 py-3 text-right">Net Margin (+/- LKR)</th>
                                        <th className="px-4 py-3 text-center">Branch</th>
                                        <th className="px-4 py-3 text-center">Method</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 font-medium">
                                    {profitLossLedgerFilteredStream.map((item, idx) => (
                                        <tr key={idx} className="hover:bg-indigo-50/20 transition-all">
                                            <td className="px-4 py-2.5 font-mono text-[10px] text-slate-500">{formatDateTime(item.date)}</td>
                                            <td className="px-4 py-2.5 font-mono font-bold text-indigo-600">{item.id}</td>
                                            <td className="px-4 py-2.5">
                                                <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${item.type === 'SALE' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-rose-50 text-rose-700 border border-rose-100'}`}>
                                                    {item.category}
                                                </span>
                                            </td>
                                            <td className="px-4 py-2.5 font-semibold text-slate-800 max-w-xs truncate">{item.description}</td>
                                            <td className="px-4 py-2.5 text-right font-mono font-bold text-emerald-600">
                                                {item.revenue > 0 ? `+${item.revenue.toLocaleString()}` : '—'}
                                            </td>
                                            <td className="px-4 py-2.5 text-right font-mono font-bold text-rose-600">
                                                {item.type === 'SALE' ? (item.cogs > 0 ? `(${item.cogs.toLocaleString()})` : '—') : `(${item.expense.toLocaleString()})`}
                                            </td>
                                            <td className={`px-4 py-2.5 text-right font-mono font-black ${item.netProfitContrib >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                {item.netProfitContrib >= 0 ? `+${item.netProfitContrib.toLocaleString()}` : `(${Math.abs(item.netProfitContrib).toLocaleString()})`}
                                            </td>
                                            <td className="px-4 py-2.5 text-center font-bold text-slate-500 text-[10px]">{item.branchId}</td>
                                            <td className="px-4 py-2.5 text-center font-bold text-slate-500 text-[10px]">{item.paymentMethod}</td>
                                        </tr>
                                    ))}
                                    {profitLossLedgerFilteredStream.length === 0 && (
                                        <tr>
                                            <td colSpan={9} className="py-16 text-center text-slate-300 font-black uppercase tracking-widest text-xs italic">No matching P&L ledger entries for selected period</td>
                                        </tr>
                                    )}
                                </tbody>
                                <tfoot className="bg-slate-900 text-white font-mono font-bold text-xs sticky bottom-0 z-10">
                                    <tr>
                                        <td colSpan={4} className="px-4 py-3 text-right uppercase font-black tracking-wider text-slate-300">Filtered Ledger Totals:</td>
                                        <td className="px-4 py-3 text-right text-emerald-400 font-black">
                                            +{profitLossLedgerFilteredStream.reduce((a, b) => a + b.revenue, 0).toLocaleString()}
                                        </td>
                                        <td className="px-4 py-3 text-right text-rose-400 font-black">
                                            ({profitLossLedgerFilteredStream.reduce((a, b) => a + (b.type === 'SALE' ? b.cogs : b.expense), 0).toLocaleString()})
                                        </td>
                                        <td className={`px-4 py-3 text-right font-black ${profitLossLedgerFilteredStream.reduce((a, b) => a + b.netProfitContrib, 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                            Rs. {profitLossLedgerFilteredStream.reduce((a, b) => a + b.netProfitContrib, 0).toLocaleString()}
                                        </td>
                                        <td colSpan={2}></td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* Trial Balance */}
            {activeReport === 'TRIAL_BALANCE' && (
                <div className="bg-white rounded-3xl border border-slate-200 p-12 shadow-sm max-w-5xl mx-auto overflow-hidden printable-report report-card">
                    <div className="mb-12">
                        <div className="flex justify-between items-start border-b-4 border-indigo-100 pb-4 daily-summary-header">
                            <div>
                                <h3 className="text-4xl font-black text-indigo-900 uppercase">Trial Balance Statement</h3>
                                <p className="text-slate-500 font-black uppercase tracking-[0.2em] text-xs mt-2">
                                    For the period: {formatMMDDYYYY(startDate) || 'Start'} to {formatMMDDYYYY(endDate || getTodayLocal())}
                                </p>
                            </div>
                            <div className="flex flex-col items-end gap-3 no-print">
                                <div className="flex gap-2">
                                    <button
                                        onClick={handleExportTrialBalanceExcel}
                                        className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 transition-all flex items-center gap-2 shadow-lg shadow-emerald-100 cursor-pointer"
                                    >
                                        📊 EXCEL
                                    </button>
                                    <button
                                        onClick={() => window.print()}
                                        className="px-4 py-2 bg-indigo-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-800 transition-all flex items-center gap-2 shadow-lg shadow-indigo-100 cursor-pointer"
                                    >
                                        📄 PDF / PRINT
                                    </button>
                                </div>
                                <div className="text-right">
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Currency: LKR (Rs.)</span>
                                    <span className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-full text-[10px] font-black uppercase tracking-widest border border-indigo-100 italic">Double-Entry Verified</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="w-full overflow-x-auto">
                        <table className="w-full border-collapse">
                            <thead>
                                <tr className="bg-indigo-900 text-white">
                                    <th className="text-left py-4 px-4 text-xs font-black uppercase tracking-widest w-[10%] rounded-tl-xl">Code</th>
                                    <th className="text-left py-4 px-4 text-xs font-black uppercase tracking-widest w-[40%]">Account Ledger</th>
                                    <th className="text-right py-4 px-4 text-xs font-black uppercase tracking-widest w-[18%]">Debit (Rs.)</th>
                                    <th className="text-right py-4 px-4 text-xs font-black uppercase tracking-widest w-[18%]">Credit (Rs.)</th>
                                    <th className="text-center py-4 px-4 text-xs font-black uppercase tracking-widest w-[14%] rounded-tr-xl no-print">Download Note</th>
                                </tr>
                            </thead>
                            <tbody>
                                {/* ASSET & EXPENSE ACCOUNTS (DEBITS) */}
                                <tr>
                                    <td colSpan={5} className="py-4 bg-slate-50 border-b border-slate-200">
                                        <span className="text-xs font-black text-indigo-900 uppercase tracking-[0.1em] px-2">Asset & Expense Accounts (Debits)</span>
                                    </td>
                                </tr>
                                <tr className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                                    <td className="py-3 px-4 text-xs font-mono font-bold text-slate-400">1000</td>
                                    <td className="py-3 px-4 text-sm font-bold text-slate-800">Cash and Bank Balances</td>
                                    <td className="py-3 px-4 text-right font-mono font-black text-slate-900">{balanceSheetDisplay.dispCashAndBank.toLocaleString()}</td>
                                    <td className="py-3 px-4 text-right font-mono text-slate-300">-</td>
                                    <td className="py-3 px-4 text-center no-print">
                                        <button onClick={handleExportCashBankNoteDetails} className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all">
                                            📊 Note 01
                                        </button>
                                    </td>
                                </tr>
                                <tr className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                                    <td className="py-3 px-4 text-xs font-mono font-bold text-slate-400">1100</td>
                                    <td className="py-3 px-4 text-sm font-bold text-slate-800">Accounts Receivable (Customers)</td>
                                    <td className="py-3 px-4 text-right font-mono font-black text-slate-900">{balanceSheetDisplay.dispAccountsReceivable.toLocaleString()}</td>
                                    <td className="py-3 px-4 text-right font-mono text-slate-300">-</td>
                                    <td className="py-3 px-4 text-center no-print">
                                        <button onClick={handleExportARNoteDetails} className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all">
                                            📊 Note 02
                                        </button>
                                    </td>
                                </tr>
                                <tr className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                                    <td className="py-3 px-4 text-xs font-mono font-bold text-slate-400">1200</td>
                                    <td className="py-3 px-4 text-sm font-bold text-slate-800">Inventory Stock Assets (At Cost)</td>
                                    <td className="py-3 px-4 text-right font-mono font-black text-slate-900">{balanceSheetDisplay.dispInventory.toLocaleString()}</td>
                                    <td className="py-3 px-4 text-right font-mono text-slate-300">-</td>
                                    <td className="py-3 px-4 text-center no-print">
                                        <button onClick={handleExportInventoryNoteDetails} className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all">
                                            📊 Note 03
                                        </button>
                                    </td>
                                </tr>
                                <tr className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                                    <td className="py-3 px-4 text-xs font-mono font-bold text-slate-400">1300</td>
                                    <td className="py-3 px-4 text-sm font-bold text-slate-800">Fixed Assets (Plant, Equipment & Furniture)</td>
                                    <td className="py-3 px-4 text-right font-mono font-black text-slate-900">{balanceSheetDisplay.dispFixedAssets.toLocaleString()}</td>
                                    <td className="py-3 px-4 text-right font-mono text-slate-300">-</td>
                                    <td className="py-3 px-4 text-center no-print">
                                        <button onClick={handleExportFixedAssetsNoteDetails} className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all">
                                            📊 Note 04
                                        </button>
                                    </td>
                                </tr>
                                <tr className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                                    <td className="py-3 px-4 text-xs font-mono font-bold text-slate-400">5000</td>
                                    <td className="py-3 px-4 text-sm font-bold text-slate-800">Cost of Goods Sold (COGS)</td>
                                    <td className="py-3 px-4 text-right font-mono font-black text-slate-900">{incomeStatementDisplay.dispCogs.toLocaleString()}</td>
                                    <td className="py-3 px-4 text-right font-mono text-slate-300">-</td>
                                    <td className="py-3 px-4 text-center no-print">
                                        <button onClick={handleExportCOGSNoteDetails} className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all">
                                            📊 Note 08
                                        </button>
                                    </td>
                                </tr>
                                {incomeStatement.expenseBreakdown.map(([cat, amt], idx) => (
                                    <tr key={cat} className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                                        <td className="py-3 px-4 text-xs font-mono font-bold text-slate-400">{5100 + idx}</td>
                                        <td className="py-3 px-4 text-sm font-bold text-slate-600 pl-8">Operating Expense - {cat}</td>
                                        <td className="py-3 px-4 text-right font-mono font-black text-slate-900">{Math.round(amt).toLocaleString()}</td>
                                        <td className="py-3 px-4 text-right font-mono text-slate-300">-</td>
                                        <td className="py-3 px-4 text-center no-print">
                                            <button onClick={() => handleExportExpenseCategoryNoteDetails(cat, String(9 + idx).padStart(2, '0'))} className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all">
                                                📊 Note {String(9 + idx).padStart(2, '0')}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {incomeStatementDisplay.dispDepreciationExpense > 0 && (
                                    <tr className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                                        <td className="py-3 px-4 text-xs font-mono font-bold text-slate-400">5200</td>
                                        <td className="py-3 px-4 text-sm font-bold text-slate-600 pl-8">Operating Expense - Depreciation Expense</td>
                                        <td className="py-3 px-4 text-right font-mono font-black text-slate-900">{incomeStatementDisplay.dispDepreciationExpense.toLocaleString()}</td>
                                        <td className="py-3 px-4 text-right font-mono text-slate-300">-</td>
                                        <td className="py-3 px-4 text-center no-print">-</td>
                                    </tr>
                                )}

                                {/* LIABILITY, EQUITY & REVENUE ACCOUNTS (CREDITS) */}
                                <tr>
                                    <td colSpan={5} className="py-4 bg-slate-50 border-b border-slate-200">
                                        <span className="text-xs font-black text-indigo-900 uppercase tracking-[0.1em] px-2">Liability, Equity & Revenue Accounts (Credits)</span>
                                    </td>
                                </tr>
                                <tr className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                                    <td className="py-3 px-4 text-xs font-mono font-bold text-slate-400">4000</td>
                                    <td className="py-3 px-4 text-sm font-bold text-slate-800">Sales & Direct Revenue</td>
                                    <td className="py-3 px-4 text-right font-mono text-slate-300">-</td>
                                    <td className="py-3 px-4 text-right font-mono font-black text-slate-900">{incomeStatementDisplay.dispRevenue.toLocaleString()}</td>
                                    <td className="py-3 px-4 text-center no-print">
                                        <button onClick={handleExportRevenueNoteDetails} className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all">
                                            📊 Note 07
                                        </button>
                                    </td>
                                </tr>
                                <tr className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                                    <td className="py-3 px-4 text-xs font-mono font-bold text-slate-400">2000</td>
                                    <td className="py-3 px-4 text-sm font-bold text-slate-800">Accounts Payable (Vendors)</td>
                                    <td className="py-3 px-4 text-right font-mono text-slate-300">-</td>
                                    <td className="py-3 px-4 text-right font-mono font-black text-slate-900">{balanceSheetDisplay.dispAccountsPayable.toLocaleString()}</td>
                                    <td className="py-3 px-4 text-center no-print">
                                        <button onClick={handleExportAPNoteDetails} className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all">
                                            📊 Note 05
                                        </button>
                                    </td>
                                </tr>
                                <tr className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                                    <td className="py-3 px-4 text-xs font-mono font-bold text-slate-400">2100</td>
                                    <td className="py-3 px-4 text-sm font-bold text-slate-800">Accrued Expenses (Unpaid Bills)</td>
                                    <td className="py-3 px-4 text-right font-mono text-slate-300">-</td>
                                    <td className="py-3 px-4 text-right font-mono font-black text-slate-900">{balanceSheetDisplay.dispAccruedExpenses.toLocaleString()}</td>
                                    <td className="py-3 px-4 text-center no-print">
                                        <button onClick={handleExportAccruedExpensesNoteDetails} className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all">
                                            📊 Note 06
                                        </button>
                                    </td>
                                </tr>
                                <tr className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                                    <td className="py-3 px-4 text-xs font-mono font-bold text-slate-400">2200</td>
                                    <td className="py-3 px-4 text-xs font-mono font-bold text-slate-800">Director C/A (Current Account)</td>
                                    <td className="py-3 px-4 text-right font-mono text-slate-300">-</td>
                                    <td className="py-3 px-4 text-right font-mono font-black text-slate-900">{balanceSheetDisplay.dispDirectorCA.toLocaleString()}</td>
                                    <td className="py-3 px-4 text-center no-print">
                                        <button onClick={handleExportDirectorCANoteDetails} className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all">
                                            📊 Note 07
                                        </button>
                                    </td>
                                </tr>
                                <tr className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                                    <td className="py-3 px-4 text-xs font-mono font-bold text-slate-400">1350</td>
                                    <td className="py-3 px-4 text-sm font-bold text-slate-800">Accumulated Depreciation (Fixed Assets)</td>
                                    <td className="py-3 px-4 text-right font-mono text-slate-300">-</td>
                                    <td className="py-3 px-4 text-right font-mono font-black text-slate-900">{balanceSheetDisplay.dispAccumulatedDepreciation.toLocaleString()}</td>
                                    <td className="py-3 px-4 text-center no-print">-</td>
                                </tr>
                                <tr className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                                    <td className="py-3 px-4 text-xs font-mono font-bold text-slate-400">3000</td>
                                    <td className="py-3 px-4 text-sm font-bold text-slate-800">Share Capital</td>
                                    <td className="py-3 px-4 text-right font-mono text-slate-300">-</td>
                                    <td className="py-3 px-4 text-right font-mono font-black text-slate-900">{balanceSheetDisplay.dispShareCapital.toLocaleString()}</td>
                                    <td className="py-3 px-4 text-center no-print">
                                        <button onClick={handleExportShareCapitalNoteDetails} className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all">
                                            📊 Note 08
                                        </button>
                                    </td>
                                </tr>
                                {(() => {
                                    const begRE = balanceSheetDisplay.dispRetainedEarnings - incomeStatementDisplay.dispNetIncome;
                                    return (
                                        <tr className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                                            <td className="py-3 px-4 text-xs font-mono font-bold text-slate-400">3100</td>
                                            <td className="py-3 px-4 text-sm font-bold text-slate-800">Retained Earnings (Beginning)</td>
                                            <td className="py-3 px-4 text-right font-mono font-black text-slate-900">{begRE < 0 ? Math.abs(begRE).toLocaleString() : '-'}</td>
                                            <td className="py-3 px-4 text-right font-mono font-black text-slate-900">{begRE >= 0 ? begRE.toLocaleString() : '-'}</td>
                                            <td className="py-3 px-4 text-center no-print">
                                                <button onClick={handleExportRetainedEarningsNoteDetails} className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all">
                                                    📊 Note 09
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })()}
                            </tbody>
                            <tfoot className="bg-indigo-900 text-white">
                                {(() => {
                                    const begRE = balanceSheetDisplay.dispRetainedEarnings - incomeStatementDisplay.dispNetIncome;
                                    const totDebits = balanceSheetDisplay.dispCashAndBank + balanceSheetDisplay.dispAccountsReceivable + balanceSheetDisplay.dispInventory + balanceSheetDisplay.dispFixedAssets + incomeStatementDisplay.dispCogs + incomeStatementDisplay.dispTotalExpenses + incomeStatementDisplay.dispDepreciationExpense + (begRE < 0 ? Math.abs(begRE) : 0);
                                    const totCredits = incomeStatementDisplay.dispRevenue + balanceSheetDisplay.dispAccountsPayable + balanceSheetDisplay.dispAccruedExpenses + balanceSheetDisplay.dispDirectorCA + balanceSheetDisplay.dispShareCapital + balanceSheetDisplay.dispAccumulatedDepreciation + (begRE >= 0 ? begRE : 0);
                                    return (
                                        <tr>
                                            <td colSpan={2} className="py-5 px-4 font-black uppercase tracking-widest text-sm rounded-bl-xl">
                                                TOTAL TRIAL BALANCE
                                            </td>
                                            <td className="py-5 px-4 text-right font-mono font-black text-xl border-r border-white/20">
                                                {totDebits.toLocaleString()}
                                            </td>
                                            <td className="py-5 px-4 text-right font-mono font-black text-xl rounded-br-xl">
                                                {totCredits.toLocaleString()}
                                            </td>
                                            <td className="no-print rounded-br-xl"></td>
                                        </tr>
                                    );
                                })()}
                            </tfoot>
                        </table>
                    </div>

                    <div className="mt-12 p-4 bg-emerald-50 rounded-2xl border border-emerald-200 border-dashed">
                        <div className="flex items-center justify-center gap-4 text-xs font-black text-emerald-800 uppercase tracking-widest">
                            <span>✓ TRIAL BALANCE IS PERFECTLY EQUAL & BALANCED</span>
                        </div>
                    </div>
                </div>
            )}

            {/* Liabilities Report */}
            {activeReport === 'LIABILITIES' && (
                <div className="bg-white rounded-3xl border border-slate-200 p-12 shadow-sm max-w-5xl mx-auto overflow-hidden">
                    <div className="mb-12">
                        <h3 className="text-4xl font-black text-rose-900 border-b-4 border-rose-100 pb-4">Liabilities & Obligations Report</h3>
                        <div className="flex justify-between items-end mt-4">
                            <p className="text-slate-500 font-black uppercase tracking-[0.2em] text-xs">As of date: {endDate || getTodayLocal()}</p>
                            <div className="text-right">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Report: Accruals & Payables</span>
                                <span className="px-3 py-1 bg-rose-50 text-rose-600 rounded-full text-[10px] font-black uppercase tracking-widest border border-rose-100 italic">Audit Verified</span>
                            </div>
                        </div>
                    </div>

                    {/* Summary Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
                        <div className="bg-gradient-to-br from-rose-50 to-rose-100/50 border border-rose-200 p-6 rounded-2xl">
                            <span className="text-[10px] font-black text-rose-800 uppercase tracking-wider block mb-1">Total Outstanding Payables</span>
                            <span className="text-3xl font-black font-mono text-rose-950">Rs. {liabilitiesData.totalAccountsPayable.toLocaleString()}</span>
                            <p className="text-[10px] text-rose-700/70 mt-2 font-bold uppercase">Vendor accounts payable</p>
                        </div>
                        <div className="bg-slate-50 border border-slate-200 p-6 rounded-2xl">
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider block mb-1">Estimated Monthly Utilities</span>
                            <span className="text-3xl font-black font-mono text-slate-800">Rs. {liabilitiesData.totalUtilityMonthlyCommitment.toLocaleString()}</span>
                            <p className="text-[10px] text-slate-400 mt-2 font-bold uppercase">Estimated utility commitments</p>
                        </div>
                        <div className="bg-slate-50 border border-slate-200 p-6 rounded-2xl">
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider block mb-1">Active Accounts Payable</span>
                            <span className="text-3xl font-black font-mono text-slate-800">{liabilitiesData.outstandingVendors.length} Vendors</span>
                            <p className="text-[10px] text-slate-400 mt-2 font-bold uppercase">Active debtor accounts</p>
                        </div>
                    </div>

                    {/* Section 1: Accounts Payable (Vendors) */}
                    <div className="mb-12">
                        <div className="flex justify-between items-center mb-6">
                            <h4 className="text-lg font-black text-slate-800 uppercase tracking-wider">Vendor Accounts Payable</h4>
                            <input
                                type="text"
                                placeholder="Search vendors..."
                                value={vendorSearch}
                                onChange={(e) => setVendorSearch(e.target.value)}
                                className="px-4 py-2 text-xs rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none font-bold bg-white w-64"
                            />
                        </div>

                        <div className="border border-slate-200 rounded-2xl overflow-hidden">
                            <table className="w-full border-collapse">
                                <thead>
                                    <tr className="bg-slate-50 border-b border-slate-200">
                                        <th className="text-left p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest w-[40%]">Vendor Name</th>
                                        <th className="text-left p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest w-[30%]">Contact Details</th>
                                        <th className="text-right p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest w-[30%]">Outstanding Balance</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {liabilitiesData.outstandingVendors
                                        .filter(v => v.name.toLowerCase().includes(vendorSearch.toLowerCase()))
                                        .map(v => (
                                            <tr key={v.id} className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                                                <td className="p-4">
                                                    <span className="text-sm font-bold text-slate-800 uppercase tracking-tight block">{v.name}</span>
                                                    {v.address && <span className="text-[10px] text-slate-400 block mt-0.5">{v.address}</span>}
                                                </td>
                                                <td className="p-4">
                                                    <span className="text-[11px] font-mono text-slate-600 block">{v.phone}</span>
                                                    {v.email && <span className="text-[10px] text-slate-400 block mt-0.5">{v.email}</span>}
                                                </td>
                                                <td className="p-4 text-right">
                                                    <span className="font-black font-mono text-slate-900 text-sm">Rs. {v.backtrackedBalance.toLocaleString()}</span>
                                                </td>
                                            </tr>
                                        ))}
                                    {liabilitiesData.outstandingVendors.length === 0 && (
                                        <tr>
                                            <td colSpan={3} className="p-8 text-center text-xs font-bold text-slate-400 italic">No outstanding accounts payable found.</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Section 2: Utilities & Monthly commitments */}
                    <div>
                        <h4 className="text-lg font-black text-slate-800 uppercase tracking-wider mb-6">Utility Commitments & Average Spending</h4>
                        <div className="border border-slate-200 rounded-2xl overflow-hidden">
                            <table className="w-full border-collapse">
                                <thead>
                                    <tr className="bg-slate-50 border-b border-slate-200">
                                        <th className="text-left p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest w-[30%]">Utility Category</th>
                                        <th className="text-center p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest w-[20%]">Average Monthly Spend</th>
                                        <th className="text-center p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest w-[25%]">Last Payment Date</th>
                                        <th className="text-right p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest w-[25%]">Last Paid Amount</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {Object.entries(liabilitiesData.utilityCommitments).map(([cat, details]: [string, any]) => (
                                        <tr key={cat} className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                                            <td className="p-4">
                                                <span className="text-sm font-bold text-slate-800 uppercase tracking-tight block">{cat}</span>
                                                <span className="text-[10px] text-slate-400 block mt-0.5">{details.totalPayments} payments recorded</span>
                                            </td>
                                            <td className="p-4 text-center">
                                                <span className="font-bold font-mono text-slate-700">Rs. {details.averageMonthly.toLocaleString()}</span>
                                            </td>
                                            <td className="p-4 text-center">
                                                <span className="text-xs font-mono text-slate-600">{details.lastPaymentDate}</span>
                                            </td>
                                            <td className="p-4 text-right">
                                                <span className="font-bold font-mono text-slate-800">Rs. {details.lastPaymentAmount.toLocaleString()}</span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* Category Wise Report */}
            {activeReport === 'CATEGORY_REPORT' && (
                <div className="bg-white rounded-3xl border border-slate-200 p-12 shadow-sm max-w-5xl mx-auto overflow-hidden">
                    <div className="mb-12">
                        <h3 className="text-4xl font-black text-indigo-900 border-b-4 border-indigo-100 pb-4">Category Profitability Analysis</h3>
                        <div className="flex justify-between items-end mt-4">
                            <p className="text-slate-500 font-black uppercase tracking-[0.2em] text-xs">For the period: {startDate || 'Start'} to {endDate || 'End'}</p>
                            <div className="text-right">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Generated On</span>
                                <span className="text-xs font-bold text-slate-600">{new Date().toLocaleString()}</span>
                            </div>
                        </div>
                    </div>

                    <div className="w-full">
                        <table className="w-full border-collapse">
                            <thead>
                                <tr className="bg-slate-50 border-b-2 border-indigo-900">
                                    <th className="text-left py-4 px-4 text-xs font-black text-slate-500 uppercase tracking-widest">Category</th>
                                    <th className="text-right py-4 px-4 text-xs font-black text-slate-500 uppercase tracking-widest">Revenue</th>
                                    <th className="text-right py-4 px-4 text-xs font-black text-slate-500 uppercase tracking-widest text-rose-500">Cost (Approx)</th>
                                    <th className="text-right py-4 px-4 text-xs font-black text-slate-500 uppercase tracking-widest text-emerald-600">Gross Profit</th>
                                    <th className="text-center py-4 px-4 text-xs font-black text-slate-500 uppercase tracking-widest">Margin</th>
                                </tr>
                            </thead>
                            <tbody>
                                {categoryReport.map((item, idx) => (
                                    <tr key={idx} className={`border-b border-slate-50 hover:bg-indigo-50/30 transition-colors group ${idx < 3 ? 'bg-indigo-50/10' : ''}`}>
                                        <td className="py-4 px-4">
                                            <span className={`block font-bold text-sm uppercase tracking-tight ${idx === 0 ? 'text-indigo-600' : 'text-slate-700'}`}>
                                                {item.name}
                                                {idx === 0 && <span className="ml-2 text-[10px] bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full">Top Performer</span>}
                                            </span>
                                        </td>
                                        <td className="py-4 px-4 text-right font-mono font-bold text-slate-900">
                                            {Math.round(item.revenue).toLocaleString()}
                                        </td>
                                        <td className="py-4 px-4 text-right font-mono font-medium text-rose-500 text-sm">
                                            {Math.round(item.cost).toLocaleString()}
                                        </td>
                                        <td className="py-4 px-4 text-right font-mono font-black text-emerald-600 text-base">
                                            {(Math.round(item.revenue) - Math.round(item.cost)).toLocaleString()}
                                        </td>
                                        <td className="py-4 px-4 text-center">
                                            <span className={`text-xs font-bold px-2 py-1 rounded-md ${item.margin > 20 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                                                {item.margin.toFixed(1)}%
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                                {categoryReport.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="py-10 text-center text-slate-400 font-bold uppercase tracking-widest text-sm">
                                            No sales data found for this period
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                            <tfoot className="bg-indigo-900 text-white">
                                <tr>
                                    <td className="py-5 px-4 font-black uppercase tracking-widest text-sm">Total</td>
                                    <td className="py-5 px-4 text-right font-mono font-black text-lg">
                                        {categoryReport.reduce((sum, item) => sum + Math.round(item.revenue), 0).toLocaleString()}
                                    </td>
                                    <td className="py-5 px-4 text-right font-mono font-black text-lg opacity-80">
                                        {categoryReport.reduce((sum, item) => sum + Math.round(item.cost), 0).toLocaleString()}
                                    </td>
                                    <td className="py-5 px-4 text-right font-mono font-black text-xl border-l border-white/20 bg-indigo-800">
                                        {(categoryReport.reduce((sum, item) => sum + Math.round(item.revenue), 0) - categoryReport.reduce((sum, item) => sum + Math.round(item.cost), 0)).toLocaleString()}
                                    </td>
                                    <td className="py-5 px-4 text-center font-bold text-xs opacity-70">
                                        AVG MARGIN
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>
            )}

            {/* Critical Stock Shortfall Report */}
            {activeReport === 'CRITICAL_STOCK' && (
                <div className="bg-white rounded-3xl border border-slate-200 p-12 shadow-sm max-w-5xl mx-auto overflow-hidden">
                    <div className="mb-12">
                        <div className="flex justify-between items-start border-b-4 border-rose-100 pb-4">
                            <h3 className="text-4xl font-black text-rose-900 uppercase">Critical Stock Shortfall</h3>
                            <span className="bg-rose-600 text-white px-4 py-2 rounded-xl text-xl font-black font-mono shadow-lg shadow-rose-200">{criticalStockItems.length}</span>
                        </div>
                        <div className="flex justify-between items-end mt-4">
                            <p className="text-slate-500 font-black uppercase tracking-[0.2em] text-xs">Immediate inventory procurement required</p>
                            <div className="flex items-end gap-6">
                                <button
                                    onClick={handleExportCriticalStock}
                                    className="px-4 py-2 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all flex items-center gap-2 shadow-lg shadow-slate-200"
                                >
                                    📥 Download Excel
                                </button>
                                <div className="text-right">
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Generated On</span>
                                    <span className="text-xs font-bold text-slate-600">{new Date().toLocaleString()}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="w-full">
                        <div className="overflow-x-auto">
                            <table className="w-full border-collapse">
                                <thead>
                                    <tr className="bg-slate-50 border-b-2 border-rose-900">
                                        <th className="text-left py-4 px-4 text-xs font-black text-slate-500 uppercase tracking-widest">PRODUCT DESCRIPTION</th>
                                        <th className="text-left py-4 px-4 text-xs font-black text-slate-500 uppercase tracking-widest">SKU / BARCODE</th>
                                        <th className="text-right py-4 px-4 text-xs font-black text-slate-500 uppercase tracking-widest">CURRENT STOCK</th>
                                        <th className="text-right py-4 px-4 text-xs font-black text-slate-500 uppercase tracking-widest">THRESHOLD</th>
                                        <th className="text-center py-4 px-4 text-xs font-black text-slate-500 uppercase tracking-widest">URGENCY</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {criticalStockItems.map((item, idx) => {
                                        const threshold = Number(item.lowStockThreshold) || 10;
                                        const stock = selectedCashier === 'ALL CASHIERS'
                                            ? Number(item.stock || 0)
                                            : Number(item.branchStocks?.[selectedCashier] || 0);
                                        const isEmpty = stock <= 0;
                                        return (
                                            <tr key={item.id} className={`border-b border-slate-50 hover:bg-rose-50/30 transition-colors group ${isEmpty ? 'bg-rose-50/20' : ''}`}>
                                                <td className="py-4 px-4">
                                                    <p className="font-bold text-sm uppercase tracking-tight text-slate-800">{item.name}</p>
                                                    <p className="text-[10px] text-slate-400 font-bold uppercase">{categories.find(c => c.id === item.categoryId)?.name || 'UNGROUPED'}</p>
                                                </td>
                                                <td className="py-4 px-4">
                                                    <span className="font-mono text-[10px] bg-slate-100 text-slate-600 px-2 py-1 rounded border border-slate-200">{item.sku}</span>
                                                </td>
                                                <td className="py-4 px-4 text-right">
                                                    <span className={`text-lg font-black font-mono ${isEmpty ? 'text-rose-600' : 'text-rose-500'}`}>
                                                        {stock}
                                                    </span>
                                                </td>
                                                <td className="py-4 px-4 text-right font-mono text-xs text-slate-400">
                                                    {threshold}
                                                </td>
                                                <td className="py-4 px-4 text-center">
                                                    <span className={`text-[9px] font-black uppercase px-3 py-1 rounded-full tracking-widest ${isEmpty ? 'bg-rose-600 text-white animate-pulse' : 'bg-rose-100 text-rose-700'}`}>
                                                        {isEmpty ? 'OUT OF STOCK' : 'LOW STOCK'}
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {criticalStockItems.length === 0 && (
                                        <tr>
                                            <td colSpan={5} className="py-20 text-center">
                                                <div className="flex flex-col items-center gap-4">
                                                    <span className="text-4xl text-emerald-400">🛡️</span>
                                                    <p className="text-slate-400 font-bold uppercase tracking-[0.3em] text-sm">Inventory Levels Healthy</p>
                                                    <p className="text-[10px] text-slate-300 uppercase font-black">All products are above critical thresholds</p>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* Daily Summary Report */}
            {activeReport === 'DAILY_SUMMARY' && (
                <div className="bg-white rounded-3xl border border-slate-200 p-12 shadow-sm max-w-5xl mx-auto overflow-hidden printable-report report-card">
                    <div className="mb-10">
                        <div className="flex justify-between items-start border-b-4 border-indigo-100 pb-4 daily-summary-header">
                            <div>
                                <h3 className="text-4xl font-black text-indigo-900 uppercase">Daily Summary</h3>
                                <p className="text-slate-500 font-black uppercase tracking-[0.2em] text-xs mt-2">For the period: {startDate || 'Start'} to {endDate || 'End'}</p>
                            </div>
                            <div className="flex flex-col items-end gap-3">
                                <div className="flex gap-2 no-print">
                                    <button
                                        onClick={handleExportDailySummaryExcel}
                                        className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 transition-all flex items-center gap-2 shadow-lg shadow-emerald-100"
                                    >
                                        📊 EXCEL
                                    </button>
                                    <button
                                        onClick={handlePrintDailySummary}
                                        className="px-4 py-2 bg-indigo-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-800 transition-all flex items-center gap-2 shadow-lg shadow-indigo-100"
                                    >
                                        📄 PDF / PRINT
                                    </button>
                                </div>
                                <div className="flex flex-col items-end">
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Cumulative Profit</span>
                                    <span className="text-2xl font-black font-mono text-indigo-700">
                                        Rs. {(dailySummaryReport[dailySummaryReport.length - 1]?.cumulative || 0).toLocaleString()}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse">
                            <thead>
                                <tr className="bg-indigo-900 text-white">
                                    <th className="text-left py-4 px-3 text-[9px] font-black uppercase tracking-widest rounded-tl-xl">Date</th>
                                    <th className="text-right py-4 px-3 text-[9px] font-black uppercase tracking-widest">Revenue</th>
                                    <th className="text-right py-4 px-3 text-[9px] font-black uppercase tracking-widest text-indigo-300">Reload Rev</th>
                                    <th className="text-right py-4 px-3 text-[9px] font-black uppercase tracking-widest text-indigo-300 mr-2">Reload Prof</th>
                                    <th className="text-right py-4 px-3 text-[9px] font-black uppercase tracking-widest text-orange-400">Purchases</th>
                                    <th className="text-right py-4 px-3 text-[9px] font-black uppercase tracking-widest text-rose-300">Expense</th>
                                    <th className="text-right py-4 px-3 text-[9px] font-black uppercase tracking-widest">Profit</th>
                                    <th className="text-right py-4 px-3 text-[9px] font-black uppercase tracking-widest text-indigo-100 leading-tight">Profit +<br />Reload Profit</th>
                                    <th className="text-right py-4 px-3 text-[9px] font-black uppercase tracking-widest rounded-tr-xl">Cumulative</th>
                                </tr>
                            </thead>
                            <tbody>
                                {dailySummaryReport.map((row, idx) => {
                                    const d = new Date(row.date);
                                    const displayDate = d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '/');
                                    return (
                                        <tr key={row.date} className={`border-b border-slate-50 hover:bg-indigo-50/30 transition-colors ${idx % 2 === 0 ? '' : 'bg-slate-50/40'}`}>
                                            <td className="py-2 px-3 font-mono font-black text-slate-700 text-[10px]">{displayDate}</td>
                                            <td className="py-2 px-3 text-right font-mono font-bold text-slate-900 text-[10px]">
                                                {row.revenue.toLocaleString()}
                                            </td>
                                            <td className="py-2 px-3 text-right font-mono font-bold text-indigo-600 text-[10px]">
                                                {row.reloadRevenue.toLocaleString()}
                                            </td>
                                            <td className="py-2 px-3 text-right font-mono font-bold text-indigo-500 text-[10px]">
                                                {row.reloadProfit.toLocaleString()}
                                            </td>
                                            <td className="py-2 px-3 text-right font-mono font-bold text-orange-500 text-[10px]">
                                                {row.purchases.toLocaleString()}
                                            </td>
                                            <td className="py-2 px-3 text-right font-mono font-bold text-rose-500 text-[10px]">
                                                {row.expense.toLocaleString()}
                                            </td>
                                            <td className={`py-2 px-3 text-right font-mono font-black text-[10px] ${row.profit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                {row.profit.toLocaleString()}
                                            </td>
                                            <td className={`py-2 px-3 text-right font-mono font-black text-[10px] bg-indigo-50 ${row.totalProfit >= 0 ? 'text-indigo-700' : 'text-rose-700'}`}>
                                                {row.totalProfit.toLocaleString()}
                                            </td>
                                            <td className="py-2 px-3 text-right font-mono font-black text-indigo-700 text-[10px]">
                                                {row.cumulative.toLocaleString()}
                                            </td>
                                        </tr>
                                    );
                                })}
                                {dailySummaryReport.length === 0 && (
                                    <tr>
                                        <td colSpan={9} className="py-20 text-center">
                                            <div className="flex flex-col items-center gap-4">
                                                <span className="text-4xl text-slate-300">📅</span>
                                                <p className="text-slate-400 font-bold uppercase tracking-[0.3em] text-sm">No Sales Data</p>
                                                <p className="text-[10px] text-slate-300 uppercase font-black">No transactions found for the selected period</p>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                            {dailySummaryReport.length > 0 && (
                                <tfoot className="bg-indigo-900 text-white">
                                    <tr>
                                        <td className="py-5 px-3 font-black uppercase tracking-widest text-[10px] rounded-bl-xl">TOTAL</td>
                                        <td className="py-5 px-3 text-right font-mono font-black text-[10px]">
                                            {dailySummaryReport.reduce((a, b) => a + b.revenue, 0).toLocaleString()}
                                        </td>
                                        <td className="py-5 px-3 text-right font-mono font-black text-[10px] text-indigo-300">
                                            {dailySummaryReport.reduce((a, b) => a + b.reloadRevenue, 0).toLocaleString()}
                                        </td>
                                        <td className="py-5 px-3 text-right font-mono font-black text-[10px] text-indigo-300">
                                            {dailySummaryReport.reduce((a, b) => a + b.reloadProfit, 0).toLocaleString()}
                                        </td>
                                        <td className="py-5 px-3 text-right font-mono font-black text-[10px] text-orange-400">
                                            {dailySummaryReport.reduce((a, b) => a + b.purchases, 0).toLocaleString()}
                                        </td>
                                        <td className="py-5 px-3 text-right font-mono font-black text-[10px] text-rose-300">
                                            {dailySummaryReport.reduce((a, b) => a + b.expense, 0).toLocaleString()}
                                        </td>
                                        <td className="py-5 px-3 text-right font-mono font-black text-[10px]">
                                            {dailySummaryReport.reduce((a, b) => a + b.profit, 0).toLocaleString()}
                                        </td>
                                        <td className="py-5 px-3 text-right font-mono font-black text-[10px] text-indigo-100">
                                            {dailySummaryReport.reduce((a, b) => a + b.totalProfit, 0).toLocaleString()}
                                        </td>
                                        <td className="py-5 px-3 text-right font-mono font-black text-[10px] rounded-br-xl">
                                            {(dailySummaryReport[dailySummaryReport.length - 1]?.cumulative || 0).toLocaleString()}
                                        </td>
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                    </div>
                </div>
            )}

            {/* Purchases Report */}
            {activeReport === 'PURCHASES' && (
                <div className="space-y-8 printable-report report-card">
                    {/* Summary Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 no-print">
                        <div className="bg-indigo-50 border border-indigo-100 rounded-3xl p-6 shadow-sm">
                            <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest block mb-2">Total Purchases</span>
                            <span className="text-3xl font-black font-mono text-indigo-900">
                                Rs. {purchasesSummary.total.toLocaleString()}
                            </span>
                        </div>
                        <div className="bg-emerald-50 border border-emerald-100 rounded-3xl p-6 shadow-sm">
                            <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest block mb-2">Cash & Bank Paid</span>
                            <span className="text-3xl font-black font-mono text-emerald-900">
                                Rs. {purchasesSummary.cashBank.toLocaleString()}
                            </span>
                        </div>
                        <div className="bg-amber-50 border border-amber-100 rounded-3xl p-6 shadow-sm">
                            <span className="text-[10px] font-black text-amber-400 uppercase tracking-widest block mb-2">Credit Purchases</span>
                            <span className="text-3xl font-black font-mono text-amber-900">
                                Rs. {purchasesSummary.credit.toLocaleString()}
                            </span>
                        </div>
                        <div className="bg-slate-50 border border-slate-200 rounded-3xl p-6 shadow-sm">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Total Items Purchased</span>
                            <span className="text-3xl font-black font-mono text-slate-900">
                                {searchedPurchaseItems.reduce((sum, item) => sum + item.quantity, 0)} Items ({searchedPurchases.length} Orders)
                            </span>
                        </div>
                    </div>

                    {/* Table Card */}
                    <div className="bg-white rounded-3xl border border-slate-200 p-12 shadow-sm max-w-6xl mx-auto overflow-hidden">
                        <div className="mb-10">
                            <div className="flex justify-between items-start border-b-4 border-indigo-100 pb-4 daily-summary-header">
                                <div>
                                    <h3 className="text-4xl font-black text-indigo-900 uppercase">Itemized Purchases Listing</h3>
                                    <p className="text-slate-500 font-black uppercase tracking-[0.2em] text-xs mt-2">
                                        Detailed Item-by-Item breakdown | Period: {startDate || 'Start'} to {endDate || 'End'}
                                    </p>
                                </div>
                                <div className="flex flex-col items-end gap-3 no-print">
                                    <div className="flex gap-2">
                                        <button
                                            onClick={handleExportPurchasesExcel}
                                            className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 transition-all flex items-center gap-2 shadow-lg shadow-emerald-100"
                                        >
                                            📊 EXCEL
                                        </button>
                                        <button
                                            onClick={() => window.print()}
                                            className="px-4 py-2 bg-indigo-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-800 transition-all flex items-center gap-2 shadow-lg shadow-indigo-100"
                                        >
                                            📄 PDF / PRINT
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Search input - hidden on print */}
                        <div className="mb-6 no-print">
                            <div className="relative">
                                <input
                                    type="text"
                                    placeholder="Search item, vendor, SKU, ref ID, or payment method..."
                                    value={purchaseSearch}
                                    onChange={(e) => setPurchaseSearch(e.target.value)}
                                    className="w-full px-6 py-4 rounded-2xl border border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none text-sm font-medium"
                                />
                                {purchaseSearch && (
                                    <button 
                                        onClick={() => setPurchaseSearch('')}
                                        className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 font-bold animate-in fade-in"
                                    >
                                        Clear
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full border-collapse">
                                <thead>
                                    <tr className="bg-indigo-900 text-white">
                                        <th className="text-left py-4 px-3 text-[9px] font-black uppercase tracking-widest rounded-tl-xl w-[12%]">Date & Time</th>
                                        <th className="text-left py-4 px-3 text-[9px] font-black uppercase tracking-widest w-[11%]">Purchase Ref</th>
                                        <th className="text-left py-4 px-3 text-[9px] font-black uppercase tracking-widest w-[15%]">Vendor Name</th>
                                        <th className="text-left py-4 px-3 text-[9px] font-black uppercase tracking-widest w-[22%]">Product / Item Name</th>
                                        <th className="text-left py-4 px-3 text-[9px] font-black uppercase tracking-widest w-[10%]">SKU</th>
                                        <th className="text-right py-4 px-3 text-[9px] font-black uppercase tracking-widest w-[6%]">Qty</th>
                                        <th className="text-right py-4 px-3 text-[9px] font-black uppercase tracking-widest w-[8%]">Unit Cost</th>
                                        <th className="text-right py-4 px-3 text-[9px] font-black uppercase tracking-widest w-[10%]">Item Amount</th>
                                        <th className="text-center py-4 px-3 text-[9px] font-black uppercase tracking-widest w-[8%]">Method</th>
                                        <th className="text-center py-4 px-3 text-[9px] font-black uppercase tracking-widest rounded-tr-xl w-[6%]">Branch</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {searchedPurchaseItems.map((item, idx) => {
                                        const displayDate = formatDateTime(item.date);
                                        return (
                                            <tr key={`${item.txId}-${idx}`} className={`border-b border-slate-50 hover:bg-indigo-50/30 transition-colors ${idx % 2 === 0 ? '' : 'bg-slate-50/40'}`}>
                                                <td className="py-3 px-3 font-mono font-bold text-slate-600 text-[10px] whitespace-nowrap">{displayDate}</td>
                                                <td className="py-3 px-3 font-mono font-black text-indigo-900 text-[10px]">{item.txId.substring(0, 14)}</td>
                                                <td className="py-3 px-3 font-bold text-slate-900 text-xs uppercase">{item.vendorName}</td>
                                                <td className="py-3 px-3 font-bold text-slate-800 text-xs">{item.productName}</td>
                                                <td className="py-3 px-3 font-mono text-[10px] text-slate-500">{item.sku}</td>
                                                <td className="py-3 px-3 text-right font-mono font-black text-slate-900 text-xs">{item.quantity}</td>
                                                <td className="py-3 px-3 text-right font-mono text-slate-700 text-xs">Rs. {item.unitCost.toLocaleString()}</td>
                                                <td className="py-3 px-3 text-right font-mono font-black text-indigo-900 text-xs">
                                                    Rs. {item.lineTotal.toLocaleString()}
                                                </td>
                                                <td className="py-3 px-3 text-center">
                                                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${
                                                        item.paymentMethod === 'CREDIT' ? 'bg-amber-100 text-amber-700' :
                                                        item.paymentMethod === 'CASH' ? 'bg-emerald-100 text-emerald-700' :
                                                        'bg-indigo-100 text-indigo-700'
                                                    }`}>
                                                        {item.paymentMethod}
                                                    </span>
                                                </td>
                                                <td className="py-3 px-3 text-center text-[10px] font-bold text-slate-500">{item.branchId || 'MAIN'}</td>
                                            </tr>
                                        );
                                    })}
                                    {searchedPurchaseItems.length === 0 && (
                                        <tr>
                                            <td colSpan={10} className="py-20 text-center">
                                                <div className="flex flex-col items-center gap-4">
                                                    <span className="text-4xl text-slate-300">🛒</span>
                                                    <p className="text-slate-400 font-bold uppercase tracking-[0.3em] text-sm">No Purchase Items</p>
                                                    <p className="text-[10px] text-slate-300 uppercase font-black">No matching items found for the selected period</p>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                                {searchedPurchaseItems.length > 0 && (
                                    <tfoot className="bg-indigo-900 text-white">
                                        <tr>
                                            <td colSpan={5} className="py-4 px-3 font-black uppercase tracking-widest text-[10px] rounded-bl-xl">
                                                TOTAL ({searchedPurchaseItems.length} Item Lines across {searchedPurchases.length} Purchase Orders)
                                            </td>
                                            <td className="py-4 px-3 text-right font-mono font-black text-xs">
                                                {searchedPurchaseItems.reduce((sum, item) => sum + item.quantity, 0)}
                                            </td>
                                            <td className="py-4 px-3 text-center text-[10px] font-black uppercase">
                                                -
                                            </td>
                                            <td className="py-4 px-3 text-right font-mono font-black text-sm">
                                                Rs. {searchedPurchaseItems.reduce((sum, item) => sum + item.lineTotal, 0).toLocaleString()}
                                            </td>
                                            <td colSpan={2} className="rounded-br-xl"></td>
                                        </tr>
                                    </tfoot>
                                )}
                            </table>

                        </div>
                    </div>
                </div>
            )}
            {/* Note 02: Accounts Receivable Breakup Modal */}
            {isARModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200 no-print">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden border border-slate-100 animate-in zoom-in-95 duration-200">
                        {/* Modal Header */}
                        <div className="p-6 md:p-8 bg-indigo-950 text-white flex justify-between items-start">
                            <div>
                                <div className="flex items-center gap-3">
                                    <span className="bg-indigo-600 text-white font-black text-xs px-3 py-1 rounded-lg uppercase tracking-wider">Note 02</span>
                                    <h3 className="text-2xl font-black uppercase tracking-tight">Accounts Receivable Breakup</h3>
                                </div>
                                <p className="text-indigo-200 text-xs font-bold uppercase tracking-widest mt-2">
                                    As at Date: <span className="text-white">{arBreakupDetails.endDay}</span> | Cashier: <span className="text-white">{selectedCashier}</span>
                                </p>
                            </div>
                            <button
                                onClick={() => { setIsARModalOpen(false); setSelectedARCustomer(null); setArSearch(''); }}
                                className="p-2 text-indigo-300 hover:text-white hover:bg-indigo-900 rounded-xl transition-colors font-black text-xl"
                            >
                                ✕
                            </button>
                        </div>

                        {/* Summary KPI Cards */}
                        <div className="p-6 bg-slate-50 border-b border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Total Outstanding Receivable</span>
                                <span className="text-2xl font-black font-mono text-indigo-900">
                                    Rs. {arBreakupDetails.netTotal.toLocaleString()}
                                </span>
                            </div>
                            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Debtors Count</span>
                                <span className="text-2xl font-black font-mono text-slate-800">
                                    {arBreakupDetails.breakup.length} <span className="text-xs font-normal text-slate-500">Customers</span>
                                </span>
                            </div>
                            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Journal Adjustments</span>
                                <span className="text-2xl font-black font-mono text-amber-600">
                                    Rs. {arBreakupDetails.journalARAdj.toLocaleString()}
                                </span>
                            </div>
                        </div>

                        {/* Tab Switcher & Search Bar */}
                        <div className="p-6 pb-2 flex flex-col sm:flex-row justify-between items-center gap-4 bg-white border-b border-slate-100">
                            <div className="flex bg-slate-100 p-1 rounded-2xl w-full sm:w-auto">
                                <button
                                    onClick={() => { setArModalTab('DETAILS'); setSelectedARCustomer(null); }}
                                    className={`flex-1 sm:flex-initial px-5 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 ${
                                        arModalTab === 'DETAILS' ? 'bg-indigo-900 text-white shadow-md' : 'text-slate-500 hover:text-slate-900'
                                    }`}
                                >
                                    📋 Detailed Invoice Breakdown
                                </button>
                                <button
                                    onClick={() => { setArModalTab('SUMMARY'); setSelectedARCustomer(null); }}
                                    className={`flex-1 sm:flex-initial px-5 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 ${
                                        arModalTab === 'SUMMARY' ? 'bg-indigo-900 text-white shadow-md' : 'text-slate-500 hover:text-slate-900'
                                    }`}
                                >
                                    👥 Customer Totals Summary
                                </button>
                            </div>

                            <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
                                <div className="relative w-full sm:w-72">
                                    <input
                                        type="text"
                                        placeholder={arModalTab === 'DETAILS' ? "Search invoice ID, customer, item..." : "Search customer name, phone..."}
                                        value={arSearch}
                                        onChange={(e) => setArSearch(e.target.value)}
                                        className="w-full pl-4 pr-10 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    />
                                    {arSearch && (
                                        <button
                                            onClick={() => setArSearch('')}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold"
                                        >
                                            ✕
                                        </button>
                                    )}
                                </div>
                                <button
                                    onClick={handleExportARNoteDetails}
                                    className="w-full sm:w-auto px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 shadow-sm transition-all whitespace-nowrap"
                                >
                                    📊 Export Note 02 Excel
                                </button>
                            </div>
                        </div>

                        {/* Breakup Table Body */}
                        <div className="p-6 overflow-y-auto flex-1">
                            {selectedARCustomer ? (
                                /* Customer Specific Transaction History View */
                                <div className="space-y-4">
                                    <div className="flex justify-between items-center bg-indigo-50 p-4 rounded-2xl border border-indigo-100">
                                        <div>
                                            <h4 className="font-black text-indigo-900 text-base uppercase">{selectedARCustomer.name}</h4>
                                            <p className="text-slate-500 text-xs font-bold">Phone: {selectedARCustomer.phone || 'N/A'} | Email: {selectedARCustomer.email || 'N/A'}</p>
                                        </div>
                                        <button
                                            onClick={() => setSelectedARCustomer(null)}
                                            className="px-4 py-2 bg-white text-indigo-900 border border-indigo-200 hover:bg-indigo-100 text-xs font-black rounded-xl transition-all"
                                        >
                                            ← Back to Breakdown List
                                        </button>
                                    </div>

                                    <div className="border border-slate-200 rounded-2xl overflow-hidden">
                                        <table className="w-full border-collapse">
                                            <thead>
                                                <tr className="bg-slate-100 text-slate-700">
                                                    <th className="text-left py-3 px-4 text-[9px] font-black uppercase tracking-widest">Date & Time</th>
                                                    <th className="text-left py-3 px-4 text-[9px] font-black uppercase tracking-widest">Reference ID</th>
                                                    <th className="text-left py-3 px-4 text-[9px] font-black uppercase tracking-widest">Type</th>
                                                    <th className="text-left py-3 px-4 text-[9px] font-black uppercase tracking-widest">Items / Details</th>
                                                    <th className="text-right py-3 px-4 text-[9px] font-black uppercase tracking-widest">Amount (Rs.)</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {transactions
                                                    .filter(t => t.customerId === selectedARCustomer.id && t.status !== 'VOID' && t.status !== 'DRAFT' && t.date.split('T')[0] <= arBreakupDetails.endDay)
                                                    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                                                    .map((t, idx) => (
                                                        <tr key={t.id || idx} className="border-b border-slate-100 hover:bg-slate-50 text-xs font-medium">
                                                            <td className="py-3 px-4 text-slate-600">{formatDateTime(t.date)}</td>
                                                            <td className="py-3 px-4 font-mono font-bold text-slate-800">{t.id.substring(0, 12)}</td>
                                                            <td className="py-3 px-4">
                                                                <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${
                                                                    t.type === 'SALE' ? 'bg-amber-100 text-amber-700' :
                                                                    t.type === 'CREDIT_PAYMENT' ? 'bg-emerald-100 text-emerald-700' :
                                                                    'bg-indigo-100 text-indigo-700'
                                                                }`}>
                                                                    {t.type}
                                                                </span>
                                                            </td>
                                                            <td className="py-3 px-4 text-slate-600 text-[11px] font-semibold">{getItemDetailsStr(t)}</td>
                                                            <td className={`py-3 px-4 text-right font-mono font-black ${
                                                                t.type === 'SALE' && t.paymentMethod === 'CREDIT' ? 'text-amber-700' :
                                                                t.type === 'CREDIT_PAYMENT' ? 'text-emerald-700' : 'text-slate-800'
                                                            }`}>
                                                                {t.type === 'SALE' && t.paymentMethod === 'CREDIT' ? `+ ${Number(t.amount || 0).toLocaleString()}` :
                                                                 t.type === 'CREDIT_PAYMENT' ? `- ${Number(t.amount || 0).toLocaleString()}` :
                                                                 Number(t.amount || 0).toLocaleString()}
                                                            </td>
                                                        </tr>
                                                    ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            ) : arModalTab === 'DETAILS' ? (
                                /* Detailed Invoice / Transaction Breakdown Table */
                                <div className="border border-slate-200 rounded-2xl overflow-hidden">
                                    <table className="w-full border-collapse">
                                        <thead>
                                            <tr className="bg-indigo-900 text-white">
                                                <th className="text-left py-3.5 px-4 text-[9px] font-black uppercase tracking-widest">Date & Time</th>
                                                <th className="text-left py-3.5 px-4 text-[9px] font-black uppercase tracking-widest">Invoice / Ref ID</th>
                                                <th className="text-left py-3.5 px-4 text-[9px] font-black uppercase tracking-widest">Customer Name</th>
                                                <th className="text-left py-3.5 px-4 text-[9px] font-black uppercase tracking-widest">Type</th>
                                                <th className="text-left py-3.5 px-4 text-[9px] font-black uppercase tracking-widest">Items Purchased / Particulars</th>
                                                <th className="text-center py-3.5 px-4 text-[9px] font-black uppercase tracking-widest">Cashier</th>
                                                <th className="text-right py-3.5 px-4 text-[9px] font-black uppercase tracking-widest">Debit (+ Rs.)</th>
                                                <th className="text-right py-3.5 px-4 text-[9px] font-black uppercase tracking-widest">Credit (- Rs.)</th>
                                                <th className="text-right py-3.5 px-4 text-[9px] font-black uppercase tracking-widest">Net (Rs.)</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {transactions
                                                .filter(t => {
                                                    if (t.status === 'VOID' || t.status === 'DRAFT') return false;
                                                    const txDate = t.date.split('T')[0];
                                                    if (txDate > arBreakupDetails.endDay) return false;
                                                    const cashierMatch = selectedCashier === 'ALL CASHIERS' || t.branchId === selectedCashier;
                                                    if (!cashierMatch) return false;

                                                    const isCreditSale = (t.type === 'SALE' || t.type === 'SALE_HISTORY_IMPORT' || t.type === 'LOAN_GIVEN') && (t.paymentMethod === 'CREDIT' || (Number(t.balanceDue) || 0) > 0);
                                                    const isCreditPayment = t.type === 'CREDIT_PAYMENT' || t.type === 'TRANSFER';
                                                    const isARJournal = t.type === 'JOURNAL' && (t.category === 'Accounts Receivable' || t.mainCategory === 'Accounts Receivable');

                                                    if (!((t.customerId && (isCreditSale || isCreditPayment)) || isARJournal)) return false;

                                                    if (!arSearch) return true;
                                                    const query = arSearch.toLowerCase();
                                                    const cust = t.customerId ? customers.find(c => c.id === t.customerId) : undefined;
                                                    const detailsStr = getItemDetailsStr(t).toLowerCase();
                                                    return t.id.toLowerCase().includes(query) ||
                                                        (cust && cust.name.toLowerCase().includes(query)) ||
                                                        (cust && cust.phone && cust.phone.toLowerCase().includes(query)) ||
                                                        detailsStr.includes(query);
                                                })
                                                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                                                .map((t, idx) => {
                                                    const customer = t.customerId ? customers.find(c => c.id === t.customerId) : undefined;
                                                    const isCreditSale = (t.type === 'SALE' || t.type === 'SALE_HISTORY_IMPORT' || t.type === 'LOAN_GIVEN') && (t.paymentMethod === 'CREDIT' || (Number(t.balanceDue) || 0) > 0);
                                                    const isCreditPayment = t.type === 'CREDIT_PAYMENT' || t.type === 'TRANSFER';
                                                    
                                                    let debitAmt = 0;
                                                    let creditAmt = 0;
                                                    if (isCreditSale) {
                                                        debitAmt = t.paymentMethod === 'CREDIT' ? Number(t.amount || 0) : (Number(t.balanceDue) || 0);
                                                    } else if (isCreditPayment) {
                                                        creditAmt = Number(t.amount || 0);
                                                    } else if (t.type === 'JOURNAL') {
                                                        if (t.category === 'Accounts Receivable') debitAmt = Number(t.amount || 0);
                                                        if (t.mainCategory === 'Accounts Receivable') creditAmt = Number(t.amount || 0);
                                                    }

                                                    const detailsText = getItemDetailsStr(t);

                                                    return (
                                                        <tr key={t.id || idx} className={`border-b border-slate-100 hover:bg-indigo-50/30 transition-colors ${idx % 2 === 0 ? '' : 'bg-slate-50/40'}`}>
                                                            <td className="py-3 px-4 font-mono text-[10px] text-slate-600 whitespace-nowrap">{formatDateTime(t.date)}</td>
                                                            <td className="py-3 px-4 font-mono font-bold text-slate-800 text-xs">{t.id.substring(0, 14)}</td>
                                                            <td className="py-3 px-4 font-bold text-slate-900 text-xs uppercase">{customer?.name || 'N/A'}</td>
                                                            <td className="py-3 px-4 whitespace-nowrap">
                                                                <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${
                                                                    t.type === 'SALE' ? 'bg-amber-100 text-amber-700' :
                                                                    t.type === 'CREDIT_PAYMENT' ? 'bg-emerald-100 text-emerald-700' :
                                                                    'bg-indigo-100 text-indigo-700'
                                                                }`}>
                                                                    {t.type}
                                                                </span>
                                                            </td>
                                                            <td className="py-3 px-4 text-slate-600 text-xs font-semibold max-w-xs">{detailsText}</td>
                                                            <td className="py-3 px-4 text-center text-slate-500 text-xs font-bold">{t.branchId || 'MAIN'}</td>
                                                            <td className="py-3 px-4 text-right font-mono font-bold text-amber-700 text-xs">
                                                                {debitAmt > 0 ? `+ Rs. ${debitAmt.toLocaleString()}` : '-'}
                                                            </td>
                                                            <td className="py-3 px-4 text-right font-mono font-bold text-emerald-700 text-xs">
                                                                {creditAmt > 0 ? `- Rs. ${creditAmt.toLocaleString()}` : '-'}
                                                            </td>
                                                            <td className="py-3 px-4 text-right font-mono font-black text-indigo-900 text-xs">
                                                                Rs. {(debitAmt - creditAmt).toLocaleString()}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                /* Customer Summary List Table */
                                <div className="border border-slate-200 rounded-2xl overflow-hidden">
                                    <table className="w-full border-collapse">
                                        <thead>
                                            <tr className="bg-indigo-900 text-white">
                                                <th className="text-left py-3.5 px-4 text-[9px] font-black uppercase tracking-widest">Customer Name</th>
                                                <th className="text-left py-3.5 px-4 text-[9px] font-black uppercase tracking-widest">Phone / Email</th>
                                                <th className="text-right py-3.5 px-4 text-[9px] font-black uppercase tracking-widest">Credit Limit</th>
                                                <th className="text-right py-3.5 px-4 text-[9px] font-black uppercase tracking-widest">Outstanding (Rs.)</th>
                                                <th className="text-right py-3.5 px-4 text-[9px] font-black uppercase tracking-widest">% Share</th>
                                                <th className="text-center py-3.5 px-4 text-[9px] font-black uppercase tracking-widest">Action</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {arBreakupDetails.breakup
                                                .filter(item => {
                                                    if (!arSearch) return true;
                                                    const query = arSearch.toLowerCase();
                                                    return item.customer.name.toLowerCase().includes(query) ||
                                                        (item.customer.phone && item.customer.phone.toLowerCase().includes(query)) ||
                                                        (item.customer.email && item.customer.email.toLowerCase().includes(query));
                                                })
                                                .map((item, idx) => {
                                                    const share = arBreakupDetails.totalCustomerReceivables > 0
                                                        ? ((item.allocatedCredit / arBreakupDetails.totalCustomerReceivables) * 100).toFixed(1)
                                                        : '0.0';
                                                    return (
                                                        <tr key={item.customer.id || idx} className={`border-b border-slate-100 hover:bg-indigo-50/40 transition-colors ${idx % 2 === 0 ? '' : 'bg-slate-50/50'}`}>
                                                            <td className="py-3 px-4 font-bold text-slate-900 text-xs uppercase">{item.customer.name}</td>
                                                            <td className="py-3 px-4 text-slate-500 text-xs font-medium">
                                                                {item.customer.phone || item.customer.email ? `${item.customer.phone || ''} ${item.customer.email ? `(${item.customer.email})` : ''}` : 'N/A'}
                                                            </td>
                                                            <td className="py-3 px-4 text-right font-mono font-bold text-slate-500 text-xs">
                                                                Rs. {Number(item.customer.creditLimit || 0).toLocaleString()}
                                                            </td>
                                                            <td className="py-3 px-4 text-right font-mono font-black text-indigo-900 text-xs">
                                                                Rs. {item.allocatedCredit.toLocaleString()}
                                                            </td>
                                                            <td className="py-3 px-4 text-right font-mono text-xs text-slate-500 font-bold">
                                                                {share}%
                                                            </td>
                                                            <td className="py-3 px-4 text-center">
                                                                <button
                                                                    onClick={() => setSelectedARCustomer(item.customer)}
                                                                    className="px-3 py-1 bg-indigo-100 hover:bg-indigo-200 text-indigo-800 text-[10px] font-black rounded-lg transition-colors"
                                                                >
                                                                    👁️ History
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}

                                            {arBreakupDetails.breakup.length === 0 && (
                                                <tr>
                                                    <td colSpan={6} className="py-12 text-center text-slate-400 font-bold uppercase tracking-wider text-xs">
                                                        No outstanding customer receivables as at {arBreakupDetails.endDay}
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                        <tfoot className="bg-indigo-950 text-white font-black">
                                            <tr>
                                                <td colSpan={3} className="py-4 px-4 text-[10px] uppercase tracking-wider">
                                                    Total Accounts Receivable ({arBreakupDetails.breakup.length} Debtors)
                                                </td>
                                                <td className="py-4 px-4 text-right font-mono text-sm">
                                                    Rs. {arBreakupDetails.totalCustomerReceivables.toLocaleString()}
                                                </td>
                                                <td colSpan={2} className="py-4 px-4 text-right text-[10px] text-indigo-200">
                                                    {arBreakupDetails.journalARAdj !== 0 ? `+ Journal Adj: Rs. ${arBreakupDetails.journalARAdj.toLocaleString()}` : ''}
                                                </td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            )}
                        </div>


                        {/* Footer */}
                        <div className="p-4 bg-slate-100 border-t border-slate-200 flex justify-end">
                            <button
                                onClick={() => { setIsARModalOpen(false); setSelectedARCustomer(null); setArSearch(''); }}
                                className="px-6 py-2.5 bg-slate-900 hover:bg-black text-white text-xs font-black uppercase tracking-widest rounded-xl transition-all"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Accounts Payable (Vendors) Breakup Modal (Note 05) */}
            {isAPModalOpen && (
                <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fade-in no-print">
                    <div className="bg-white rounded-3xl max-w-7xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden border border-slate-100">
                        {/* Header */}
                        <div className="p-6 bg-slate-900 text-white flex justify-between items-center border-b border-slate-800">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 flex items-center justify-center text-indigo-400 font-black text-xl border border-indigo-500/30">
                                    05
                                </div>
                                <div>
                                    <h3 className="text-xl font-black text-white uppercase tracking-wider flex items-center gap-2">
                                        Note 05: Accounts Payable (Vendors) Breakup
                                    </h3>
                                    <p className="text-xs font-semibold text-slate-400 mt-0.5">
                                        As at Date: <span className="text-white">{apBreakupDetails.endDay}</span> | Cashier: <span className="text-white">{selectedCashier}</span>
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => { setIsAPModalOpen(false); setSelectedAPVendor(null); setApSearch(''); }}
                                className="w-9 h-9 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center text-lg font-bold transition-all cursor-pointer"
                            >
                                ✕
                            </button>
                        </div>

                        {/* KPI Summary Cards */}
                        <div className="p-6 bg-slate-50 border-b border-slate-200 grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                                <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Total Outstanding Payables</span>
                                <div className="text-2xl font-black font-mono text-rose-600 mt-1">
                                    Rs. {apBreakupDetails.netTotal.toLocaleString()}
                                </div>
                            </div>
                            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                                <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Active Creditor Count</span>
                                <div className="text-2xl font-black text-slate-800 mt-1">
                                    {apBreakupDetails.breakup.length} <span className="text-xs font-normal text-slate-500">Vendors</span>
                                </div>
                            </div>
                            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                                <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Journal Adjustments</span>
                                <div className="text-2xl font-black font-mono text-indigo-600 mt-1">
                                    Rs. {apBreakupDetails.journalAPAdj.toLocaleString()}
                                </div>
                            </div>
                        </div>

                        {/* Search & Actions Bar */}
                        <div className="p-4 bg-white border-b border-slate-200 flex flex-wrap gap-3 justify-between items-center">
                            <div className="flex gap-2 items-center flex-wrap">
                                <button
                                    onClick={() => { setApModalTab('DETAILS'); setSelectedAPVendor(null); }}
                                    className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${apModalTab === 'DETAILS' && !selectedAPVendor ? 'bg-indigo-600 text-white shadow-md shadow-indigo-100' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                                >
                                    📑 Detailed Line Items & Purchases
                                </button>
                                <button
                                    onClick={() => { setApModalTab('SUMMARY'); setSelectedAPVendor(null); }}
                                    className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${apModalTab === 'SUMMARY' && !selectedAPVendor ? 'bg-indigo-600 text-white shadow-md shadow-indigo-100' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                                >
                                    📋 Vendor Summary Totals
                                </button>
                                {selectedAPVendor && (
                                    <button
                                        onClick={() => setSelectedAPVendor(null)}
                                        className="px-3 py-1.5 bg-rose-50 text-rose-700 hover:bg-rose-100 text-xs font-bold rounded-lg border border-rose-200 flex items-center gap-1 transition-all cursor-pointer"
                                    >
                                        ← Back to Vendor List
                                    </button>
                                )}
                            </div>
                            <div className="flex items-center gap-3 w-full sm:w-auto">
                                <input
                                    type="text"
                                    placeholder="Search vendor, contact, phone, or ref ID..."
                                    value={apSearch}
                                    onChange={(e) => setApSearch(e.target.value)}
                                    className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none w-full sm:w-72 font-medium"
                                />
                                <button
                                    onClick={handleExportAPNoteDetails}
                                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2 shadow-md shadow-emerald-100 cursor-pointer whitespace-nowrap"
                                >
                                    📊 Excel Export
                                </button>
                            </div>
                        </div>

                        {/* Modal Body */}
                        <div className="p-6 overflow-y-auto flex-1">
                            {selectedAPVendor ? (
                                <div>
                                    <div className="bg-indigo-50/70 border border-indigo-100 p-4 rounded-2xl mb-6 flex justify-between items-center flex-wrap gap-4">
                                        <div>
                                            <h4 className="text-lg font-black text-indigo-950 uppercase">{selectedAPVendor.name}</h4>
                                            <div className="text-xs font-medium text-slate-600 mt-1 flex flex-wrap gap-4">
                                                <span>👤 Contact: <strong className="text-slate-800">{selectedAPVendor.contactPerson || 'N/A'}</strong></span>
                                                <span>📞 Phone: <strong className="text-slate-800">{selectedAPVendor.phone || 'N/A'}</strong></span>
                                                <span>✉️ Email: <strong className="text-slate-800">{selectedAPVendor.email || 'N/A'}</strong></span>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <span className="text-[10px] font-black uppercase tracking-widest text-indigo-400 block">Backtracked As of Balance</span>
                                            <span className="text-xl font-black font-mono text-indigo-900">
                                                Rs. {(apBreakupDetails.breakup.find(b => b.vendor.id === selectedAPVendor.id)?.allocatedBalance || 0).toLocaleString()}
                                            </span>
                                        </div>
                                    </div>

                                    <h5 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3">Credit Purchases & Payment History (Up to {apBreakupDetails.endDay})</h5>
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="bg-slate-100 text-[10px] font-black uppercase tracking-wider text-slate-600 border-b border-slate-200">
                                                <th className="py-3 px-4">Date & Time</th>
                                                <th className="py-3 px-4">Ref / Purchase ID</th>
                                                <th className="py-3 px-4">Type</th>
                                                <th className="py-3 px-4">Items / Details</th>
                                                <th className="py-3 px-4">Payment Method</th>
                                                <th className="py-3 px-4 text-right">Credit / Addition (Rs.)</th>
                                                <th className="py-3 px-4 text-right">Debit / Payment (Rs.)</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 text-xs">
                                            {transactions
                                                .filter(t => t.vendorId === selectedAPVendor.id && t.status !== 'VOID' && t.status !== 'DRAFT' && t.date.split('T')[0] <= apBreakupDetails.endDay)
                                                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                                                .map(t => {
                                                    const isCreditPurchase = t.type === 'PURCHASE' && (t.paymentMethod === 'CREDIT' || (Number(t.balanceDue) || 0) > 0);
                                                    const isCreditPayment = t.type === 'CREDIT_PAYMENT';
                                                    let creditAmt = isCreditPurchase ? (t.paymentMethod === 'CREDIT' ? Number(t.amount || 0) : (Number(t.balanceDue) || 0)) : 0;
                                                    let debitAmt = isCreditPayment ? Number(t.amount || 0) : 0;

                                                    return (
                                                        <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                                                            <td className="py-3 px-4 font-medium text-slate-700">{formatDateTime(t.date)}</td>
                                                            <td className="py-3 px-4 font-mono font-bold text-indigo-600">{t.id}</td>
                                                            <td className="py-3 px-4 font-bold text-slate-800">{t.type}</td>
                                                            <td className="py-3 px-4 max-w-xs text-slate-600 text-[11px] truncate">{getItemDetailsStr(t)}</td>
                                                            <td className="py-3 px-4"><span className="px-2 py-0.5 bg-slate-100 rounded text-[10px] font-bold text-slate-700">{t.paymentMethod || 'N/A'}</span></td>
                                                            <td className="py-3 px-4 text-right font-mono font-bold text-rose-600">{creditAmt > 0 ? `Rs. ${creditAmt.toLocaleString()}` : '-'}</td>
                                                            <td className="py-3 px-4 text-right font-mono font-bold text-emerald-600">{debitAmt > 0 ? `Rs. ${debitAmt.toLocaleString()}` : '-'}</td>
                                                        </tr>
                                                    );
                                                })}
                                        </tbody>
                                    </table>
                                </div>
                            ) : apModalTab === 'DETAILS' ? (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="bg-slate-900 text-white text-[10px] font-black uppercase tracking-wider border-b border-slate-800">
                                                <th className="py-3.5 px-4">Date & Time</th>
                                                <th className="py-3.5 px-4">Purchase / Ref ID</th>
                                                <th className="py-3.5 px-4">Vendor Name</th>
                                                <th className="py-3.5 px-4">Type</th>
                                                <th className="py-3.5 px-4">Items / Details</th>
                                                <th className="py-3.5 px-4">Branch</th>
                                                <th className="py-3.5 px-4 text-right">Credit Addition (Rs.)</th>
                                                <th className="py-3.5 px-4 text-right">Debit Settlement (Rs.)</th>
                                                <th className="py-3.5 px-4 text-right">Net Movement (Rs.)</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 text-xs">
                                            {transactions
                                                .filter(t => {
                                                    if (t.status === 'VOID' || t.status === 'DRAFT') return false;
                                                    const txDate = t.date.split('T')[0];
                                                    if (txDate > apBreakupDetails.endDay) return false;

                                                    const cashierMatch = selectedCashier === 'ALL CASHIERS' || t.branchId === selectedCashier;
                                                    if (!cashierMatch) return false;

                                                    const isCreditPurchase = t.type === 'PURCHASE' && (t.paymentMethod === 'CREDIT' || (Number(t.balanceDue) || 0) > 0);
                                                    const isCreditPayment = t.type === 'CREDIT_PAYMENT' && t.vendorId;
                                                    const isAPJournal = t.type === 'JOURNAL' && (t.category === 'Accounts Payable' || t.mainCategory === 'Accounts Payable');

                                                    if (!((t.vendorId && (isCreditPurchase || isCreditPayment)) || isAPJournal)) return false;

                                                    if (apSearch.trim()) {
                                                        const query = apSearch.toLowerCase();
                                                        const vendor = t.vendorId ? vendors.find(v => v.id === t.vendorId) : undefined;
                                                        const vendorName = (vendor?.name || '').toLowerCase();
                                                        const contact = (vendor?.contactPerson || '').toLowerCase();
                                                        const phone = (vendor?.phone || '').toLowerCase();
                                                        const refId = (t.id || '').toLowerCase();
                                                        const detailsStr = getItemDetailsStr(t).toLowerCase();
                                                        return vendorName.includes(query) || contact.includes(query) || phone.includes(query) || refId.includes(query) || detailsStr.includes(query);
                                                    }
                                                    return true;
                                                })
                                                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                                                .map(t => {
                                                    const vendor = t.vendorId ? vendors.find(v => v.id === t.vendorId) : undefined;
                                                    const isCreditPurchase = t.type === 'PURCHASE' && (t.paymentMethod === 'CREDIT' || (Number(t.balanceDue) || 0) > 0);
                                                    const isCreditPayment = t.type === 'CREDIT_PAYMENT' && t.vendorId;
                                                    
                                                    let creditLiabilityAmt = 0;
                                                    let debitSettlementAmt = 0;
                                                    if (isCreditPurchase) {
                                                        creditLiabilityAmt = t.paymentMethod === 'CREDIT' ? Number(t.amount || 0) : (Number(t.balanceDue) || 0);
                                                    } else if (isCreditPayment) {
                                                        debitSettlementAmt = Number(t.amount || 0);
                                                    } else if (t.type === 'JOURNAL') {
                                                        if (t.category === 'Accounts Payable') creditLiabilityAmt = Number(t.amount || 0);
                                                        if (t.mainCategory === 'Accounts Payable') debitSettlementAmt = Number(t.amount || 0);
                                                    }

                                                    const netMovement = creditLiabilityAmt - debitSettlementAmt;

                                                    return (
                                                        <tr key={t.id} className="hover:bg-indigo-50/40 transition-colors">
                                                            <td className="py-3 px-4 font-medium text-slate-700">{formatDateTime(t.date)}</td>
                                                            <td className="py-3 px-4 font-mono font-bold text-indigo-600">{t.id}</td>
                                                            <td className="py-3 px-4 font-bold text-slate-900">
                                                                {vendor ? (
                                                                    <button
                                                                        onClick={() => setSelectedAPVendor(vendor)}
                                                                        className="hover:underline hover:text-indigo-600 text-left font-bold cursor-pointer"
                                                                    >
                                                                        {vendor.name}
                                                                    </button>
                                                                ) : 'N/A / Journal'}
                                                            </td>
                                                            <td className="py-3 px-4 font-bold text-slate-800">
                                                                <span className={`px-2 py-0.5 rounded text-[10px] font-black ${isCreditPurchase ? 'bg-rose-100 text-rose-700' : isCreditPayment ? 'bg-emerald-100 text-emerald-700' : 'bg-indigo-100 text-indigo-700'}`}>
                                                                    {t.type}
                                                                </span>
                                                            </td>
                                                            <td className="py-3 px-4 max-w-xs text-slate-600 text-[11px] truncate">{getItemDetailsStr(t)}</td>
                                                            <td className="py-3 px-4 font-semibold text-slate-600 text-[11px]">{t.branchId || 'MAIN'}</td>
                                                            <td className="py-3 px-4 text-right font-mono font-bold text-rose-600">
                                                                {creditLiabilityAmt > 0 ? `Rs. ${creditLiabilityAmt.toLocaleString()}` : '-'}
                                                            </td>
                                                            <td className="py-3 px-4 text-right font-mono font-bold text-emerald-600">
                                                                {debitSettlementAmt > 0 ? `Rs. ${debitSettlementAmt.toLocaleString()}` : '-'}
                                                            </td>
                                                            <td className="py-3 px-4 text-right font-mono font-black text-slate-900">
                                                                Rs. {netMovement.toLocaleString()}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="bg-slate-900 text-white text-[10px] font-black uppercase tracking-wider border-b border-slate-800">
                                                <th className="py-3.5 px-4">Vendor ID</th>
                                                <th className="py-3.5 px-4">Vendor Name</th>
                                                <th className="py-3.5 px-4">Contact Person</th>
                                                <th className="py-3.5 px-4">Phone</th>
                                                <th className="py-3.5 px-4">Email</th>
                                                <th className="py-3.5 px-4 text-right">Outstanding Payable (Rs.)</th>
                                                <th className="py-3.5 px-4 text-right">% of Total</th>
                                                <th className="py-3.5 px-4 text-center">Action</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 text-xs">
                                            {apBreakupDetails.breakup
                                                .filter(item => {
                                                    if (apSearch.trim()) {
                                                        const query = apSearch.toLowerCase();
                                                        return item.vendor.name.toLowerCase().includes(query) ||
                                                            (item.vendor.contactPerson || '').toLowerCase().includes(query) ||
                                                            (item.vendor.phone || '').toLowerCase().includes(query) ||
                                                            (item.vendor.email || '').toLowerCase().includes(query);
                                                    }
                                                    return true;
                                                })
                                                .map(item => {
                                                    const share = apBreakupDetails.totalVendorPayables > 0
                                                        ? ((item.allocatedBalance / apBreakupDetails.totalVendorPayables) * 100).toFixed(1)
                                                        : '0.0';

                                                    return (
                                                        <tr key={item.vendor.id} className="hover:bg-indigo-50/40 transition-colors">
                                                            <td className="py-3 px-4 font-mono font-bold text-slate-600">{item.vendor.id}</td>
                                                            <td className="py-3 px-4 font-black text-slate-900">{item.vendor.name}</td>
                                                            <td className="py-3 px-4 text-slate-700 font-medium">{item.vendor.contactPerson || 'N/A'}</td>
                                                            <td className="py-3 px-4 text-slate-700 font-medium">{item.vendor.phone || 'N/A'}</td>
                                                            <td className="py-3 px-4 text-slate-600 text-[11px]">{item.vendor.email || 'N/A'}</td>
                                                            <td className="py-3 px-4 text-right font-mono font-black text-rose-600 text-sm">
                                                                Rs. {item.allocatedBalance.toLocaleString()}
                                                            </td>
                                                            <td className="py-3 px-4 text-right font-mono font-bold text-indigo-600">{share}%</td>
                                                            <td className="py-3 px-4 text-center">
                                                                <button
                                                                    onClick={() => setSelectedAPVendor(item.vendor)}
                                                                    className="px-3 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold rounded-lg transition-colors cursor-pointer"
                                                                >
                                                                    👁️ History
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}

                                            {apBreakupDetails.breakup.length === 0 && (
                                                <tr>
                                                    <td colSpan={8} className="py-12 text-center text-slate-400 font-bold uppercase tracking-wider text-xs">
                                                        No outstanding vendor payables as at {apBreakupDetails.endDay}
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                        <tfoot className="bg-indigo-950 text-white font-black">
                                            <tr>
                                                <td colSpan={5} className="py-4 px-4 text-[10px] uppercase tracking-wider">
                                                    Total Accounts Payable ({apBreakupDetails.breakup.length} Creditors)
                                                </td>
                                                <td className="py-4 px-4 text-right font-mono text-sm">
                                                    Rs. {apBreakupDetails.totalVendorPayables.toLocaleString()}
                                                </td>
                                                <td colSpan={2} className="py-4 px-4 text-right text-[10px] text-indigo-200">
                                                    {apBreakupDetails.journalAPAdj !== 0 ? `+ Journal Adj: Rs. ${apBreakupDetails.journalAPAdj.toLocaleString()}` : ''}
                                                </td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="p-4 bg-slate-100 border-t border-slate-200 flex justify-end">
                            <button
                                onClick={() => { setIsAPModalOpen(false); setSelectedAPVendor(null); setApSearch(''); }}
                                className="px-6 py-2.5 bg-slate-900 hover:bg-black text-white text-xs font-black uppercase tracking-widest rounded-xl transition-all cursor-pointer"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};


export default Accounting;
