import React, { useState, useMemo } from 'react';
import { Transaction, Product, Vendor, Customer, BankAccount, UserProfile, FixedAsset } from '../types';
import * as XLSX from 'xlsx';

interface ReportsProps {
  transactions: Transaction[];
  products: Product[];
  vendors: Vendor[];
  customers: Customer[];
  userProfile: UserProfile;
  accounts: BankAccount[];
  fixedAssets?: FixedAsset[];
}

interface LedgerEntry {
  id: string;
  date: string;
  timestamp: number;
  refId: string;
  type: string;
  description: string;
  account: string;
  debit: number;
  credit: number;
  branchId: string;
}

const Reports: React.FC<ReportsProps> = ({
  transactions,
  products,
  vendors,
  customers,
  userProfile,
  accounts,
  fixedAssets = []
}) => {
  // Filters state
  const [selectedAccount, setSelectedAccount] = useState<string>('All Accounts');
  const [selectedBranch, setSelectedBranch] = useState<string>('ALL');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const formatCurrency = (val: number) => {
    return val.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  };

  const accountsList = [
    'All Accounts',
    'Cash / Bank',
    'Accounts Receivable',
    'Inventory Asset',
    'Fixed Assets',
    'Accumulated Depreciation',
    'Accounts Payable',
    'Sales Revenue',
    'Cost of Goods Sold (COGS)',
    'Operating Expenses',
    'Rent',
    'Office Maintaince',
    'Insurance Payment',
    'Office Maintaince Phone',
    'Utilities',
    'Transport',
    'Depreciation Expense',
    'Uncategorized',
    'Loans Receivable',
    'Share Capital',
    'Director C/A',
    'Owner Equity / Retained Earnings'
  ];

  // 1. Generate dynamic double-entry ledger postings from transactions list
  const ledgerEntries = useMemo(() => {
    const entries: LedgerEntry[] = [];

    const parseTxDate = (dateStr: string) => {
      const parsed = Date.parse(dateStr);
      return isNaN(parsed) ? Date.now() : parsed;
    };

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

    // Calculate current assets & liabilities values in the DB
    const currentInventoryVal = products.reduce((sum, p) => sum + (Number(p.stock || 0) * Number(p.cost || p.price || 0)), 0);
    const currentCashVal = accounts
      .filter(acc => getAccountLedgerName(acc.id) !== 'Director C/A')
      .reduce((sum, acc) => sum + Number(acc.balance || 0), 0);
    const currentARVal = customers.reduce((sum, c) => sum + Number(c.totalCredit || 0), 0);
    const currentAPVal = vendors.reduce((sum, v) => sum + Number(v.totalBalance || 0), 0);
    const currentDirectorCAVal = accounts
      .filter(acc => getAccountLedgerName(acc.id) === 'Director C/A')
      .reduce((sum, acc) => sum + Number(acc.balance || 0), 0);

    // Keep track of net movements for backtracking opening balances
    let netInventoryMovement = 0;
    let netCashMovement = 0;
    let netARMovement = 0;
    let netAPMovement = 0;
    let netDirectorCAMovement = 0;

    const adjustCashMovement = (accId: string | null, change: number) => {
      if (getAccountLedgerName(accId) === 'Cash / Bank') {
        netCashMovement += change;
      }
    };

    const adjustDirectorCAMovement = (accId: string | null, change: number) => {
      if (getAccountLedgerName(accId) === 'Director C/A') {
        netDirectorCAMovement += change;
      }
    };

    // Process transactions
    transactions.forEach(t => {
      if (t.status === 'VOID' || t.status === 'DRAFT') return;
      
      const timestamp = parseTxDate(t.date);
      const branch = t.branchId || 'CASHIER 1';
      const amount = Number(t.amount || 0);
      const isCreditPayment = t.paymentMethod === 'CREDIT';
      const ledgerAcc = getAccountLedgerName(t.accountId);

      if (t.type === 'SALE' || t.type === 'SALE_HISTORY_IMPORT') {
        // Posting 1: Cash/Bank, Director C/A, or Accounts Receivable Debit
        entries.push({
          id: `${t.id}-dr`,
          date: t.date,
          timestamp,
          refId: t.id,
          type: t.type,
          description: t.description || `Sale receipt ${t.id}`,
          account: isCreditPayment ? 'Accounts Receivable' : ledgerAcc,
          debit: amount,
          credit: 0,
          branchId: branch
        });
        if (isCreditPayment) {
          netARMovement += amount;
        } else {
          adjustCashMovement(t.accountId, amount);
          adjustDirectorCAMovement(t.accountId, -amount); // Debit to Director C/A reduces credit liability
        }

        // Posting 2: Sales Revenue Credit
        entries.push({
          id: `${t.id}-cr`,
          date: t.date,
          timestamp,
          refId: t.id,
          type: t.type,
          description: t.description || `Sales Revenue for ${t.id}`,
          account: 'Sales Revenue',
          debit: 0,
          credit: amount,
          branchId: branch
        });

        // Posting 3 & 4: COGS and Inventory Credit (if costBasis is provided)
        const cogs = Number(t.costBasis || 0);
        if (cogs > 0) {
          entries.push({
            id: `${t.id}-cogs`,
            date: t.date,
            timestamp,
            refId: t.id,
            type: t.type,
            description: `COGS for sale ${t.id}`,
            account: 'Cost of Goods Sold (COGS)',
            debit: cogs,
            credit: 0,
            branchId: branch
          });
          entries.push({
            id: `${t.id}-inv-cr`,
            date: t.date,
            timestamp,
            refId: t.id,
            type: t.type,
            description: `Inventory reduction for sale ${t.id}`,
            account: 'Inventory Asset',
            debit: 0,
            credit: cogs,
            branchId: branch
          });
          netInventoryMovement -= cogs;
        }
      } 
      else if (t.type === 'PURCHASE') {
        // Posting 1: Inventory Asset Debit
        entries.push({
          id: `${t.id}-dr`,
          date: t.date,
          timestamp,
          refId: t.id,
          type: 'PURCHASE',
          description: t.description || `Purchase order ${t.id}`,
          account: 'Inventory Asset',
          debit: amount,
          credit: 0,
          branchId: branch
        });
        netInventoryMovement += amount;

        // Posting 2: Cash/Bank, Director C/A, or Accounts Payable Credit
        entries.push({
          id: `${t.id}-cr`,
          date: t.date,
          timestamp,
          refId: t.id,
          type: 'PURCHASE',
          description: t.description || `Purchase payment for ${t.id}`,
          account: isCreditPayment ? 'Accounts Payable' : ledgerAcc,
          debit: 0,
          credit: amount,
          branchId: branch
        });
        if (isCreditPayment) {
          netAPMovement += amount;
        } else {
          adjustCashMovement(t.accountId, -amount);
          adjustDirectorCAMovement(t.accountId, amount); // Credit to Director C/A increases liability
        }
      } 
      else if (t.type === 'EXPENSE') {
        // Posting 1: Operating Expenses Debit
        entries.push({
          id: `${t.id}-dr`,
          date: t.date,
          timestamp,
          refId: t.id,
          type: 'EXPENSE',
          description: t.description || `Expense ${t.id}`,
          account: 'Operating Expenses',
          debit: amount,
          credit: 0,
          branchId: branch
        });

        // Posting 2: Cash/Bank, Director C/A, or Accounts Payable Credit
        entries.push({
          id: `${t.id}-cr`,
          date: t.date,
          timestamp,
          refId: t.id,
          type: 'EXPENSE',
          description: t.description || `Expense payment for ${t.id}`,
          account: isCreditPayment ? 'Accounts Payable' : ledgerAcc,
          debit: 0,
          credit: amount,
          branchId: branch
        });
        if (isCreditPayment) {
          netAPMovement += amount;
        } else {
          adjustCashMovement(t.accountId, -amount);
          adjustDirectorCAMovement(t.accountId, amount); // Credit to Director C/A increases liability
        }
      } 
      else if (t.type === 'CREDIT_PAYMENT') {
        if (t.customerId) {
          // Customer paying credit: Debit Cash/Director C/A, Credit Accounts Receivable
          entries.push({
            id: `${t.id}-dr`,
            date: t.date,
            timestamp,
            refId: t.id,
            type: 'CREDIT_PAYMENT',
            description: t.description || `Credit payment from Customer`,
            account: ledgerAcc,
            debit: amount,
            credit: 0,
            branchId: branch
          });
          adjustCashMovement(t.accountId, amount);
          adjustDirectorCAMovement(t.accountId, -amount); // Debit to Director C/A reduces liability

          entries.push({
            id: `${t.id}-cr`,
            date: t.date,
            timestamp,
            refId: t.id,
            type: 'CREDIT_PAYMENT',
            description: t.description || `AR settlement for ${t.id}`,
            account: 'Accounts Receivable',
            debit: 0,
            credit: amount,
            branchId: branch
          });
          netARMovement -= amount;
        } 
        else if (t.vendorId) {
          // Paying vendor: Debit Accounts Payable, Credit Cash/Director C/A
          entries.push({
            id: `${t.id}-dr`,
            date: t.date,
            timestamp,
            refId: t.id,
            type: 'CREDIT_PAYMENT',
            description: t.description || `Credit payment to Vendor`,
            account: 'Accounts Payable',
            debit: amount,
            credit: 0,
            branchId: branch
          });
          netAPMovement -= amount;

          entries.push({
            id: `${t.id}-cr`,
            date: t.date,
            timestamp,
            refId: t.id,
            type: 'CREDIT_PAYMENT',
            description: t.description || `Cash paid to settle AP ${t.id}`,
            account: ledgerAcc,
            debit: 0,
            credit: amount,
            branchId: branch
          });
          adjustCashMovement(t.accountId, -amount);
          adjustDirectorCAMovement(t.accountId, amount); // Credit to Director C/A increases liability
        }
      } 
      else if (t.type === 'TRANSFER') {
        const sourceAcc = accounts.find(a => a.id === t.accountId)?.name || 'Cash / Bank';
        const destAcc = accounts.find(a => a.id === t.destinationAccountId)?.name || 'Cash / Bank';
        const destLedger = getAccountLedgerName(t.destinationAccountId);

        // Debit: Destination Account
        entries.push({
          id: `${t.id}-dr`,
          date: t.date,
          timestamp,
          refId: t.id,
          type: 'TRANSFER',
          description: t.description || `Transfer to ${destAcc}`,
          account: destLedger,
          debit: amount,
          credit: 0,
          branchId: branch
        });

        // Credit: Source Account
        entries.push({
          id: `${t.id}-cr`,
          date: t.date,
          timestamp,
          refId: t.id,
          type: 'TRANSFER',
          description: t.description || `Transfer from ${sourceAcc}`,
          account: ledgerAcc,
          debit: 0,
          credit: amount,
          branchId: branch
        });

        // Update movements
        if (ledgerAcc === 'Cash / Bank' && destLedger !== 'Cash / Bank') {
          netCashMovement -= amount;
        } else if (ledgerAcc !== 'Cash / Bank' && destLedger === 'Cash / Bank') {
          netCashMovement += amount;
        }

        if (ledgerAcc === 'Director C/A' && destLedger !== 'Director C/A') {
          netDirectorCAMovement += amount; // outflow/credit increases liability
        } else if (ledgerAcc !== 'Director C/A' && destLedger === 'Director C/A') {
          netDirectorCAMovement -= amount; // inflow/debit reduces liability
        }
      } 
      else if (t.type === 'LOAN_GIVEN') {
        // Debit: Loans Receivable, Credit Cash/Director C/A
        entries.push({
          id: `${t.id}-dr`,
          date: t.date,
          timestamp,
          refId: t.id,
          type: 'LOAN_GIVEN',
          description: t.description || `Loan issued`,
          account: 'Loans Receivable',
          debit: amount,
          credit: 0,
          branchId: branch
        });

        entries.push({
          id: `${t.id}-cr`,
          date: t.date,
          timestamp,
          refId: t.id,
          type: 'LOAN_GIVEN',
          description: t.description || `Loan Cash Outflow`,
          account: ledgerAcc,
          debit: 0,
          credit: amount,
          branchId: branch
        });
        adjustCashMovement(t.accountId, -amount);
        adjustDirectorCAMovement(t.accountId, amount); // Credit to Director C/A increases liability
      }
      else if (t.type === 'JOURNAL') {
        const debitAccount = t.category || 'Operating Expenses';
        const creditAccount = t.mainCategory || 'Owner Equity / Retained Earnings';

        // Debit entry
        entries.push({
          id: `${t.id}-dr`,
          date: t.date,
          timestamp,
          refId: t.id,
          type: 'JOURNAL',
          description: t.description || `Journal Entry - Debit ${debitAccount}`,
          account: debitAccount,
          debit: amount,
          credit: 0,
          branchId: branch
        });

        // Credit entry
        entries.push({
          id: `${t.id}-cr`,
          date: t.date,
          timestamp,
          refId: t.id,
          type: 'JOURNAL',
          description: t.description || `Journal Entry - Credit ${creditAccount}`,
          account: creditAccount,
          debit: 0,
          credit: amount,
          branchId: branch
        });

        // Track net movements for backtracking opening balances
        const adjustMovementForAccount = (accountName: string, change: number) => {
          if (accountName === 'Cash / Bank') {
            netCashMovement += change;
          } else if (accountName === 'Accounts Receivable') {
            netARMovement += change;
          } else if (accountName === 'Inventory Asset') {
            netInventoryMovement += change;
          } else if (accountName === 'Accounts Payable') {
            netAPMovement += change;
          } else if (accountName === 'Director C/A') {
            netDirectorCAMovement += change;
          }
        };

        // Debits increase assets, decrease liabilities/equity
        adjustMovementForAccount(debitAccount, amount);
        
        // Credits decrease assets, increase liabilities/equity
        adjustMovementForAccount(creditAccount, -amount);
      }
    });

    // Process fixed assets
    fixedAssets.forEach(asset => {
      const purchaseAmt = Number(asset.purchasePrice || 0);
      const currentVal = Number(asset.currentValue || 0);
      
      if (purchaseAmt > 0) {
        const purchaseTimestamp = parseTxDate(asset.purchaseDate);
        
        // 1. Acquisition Posting: Debit Fixed Assets, Credit Owner Equity
        entries.push({
          id: `${asset.id}-acq-dr`,
          date: asset.purchaseDate + 'T12:00:00',
          timestamp: purchaseTimestamp,
          refId: asset.id,
          type: 'SYSTEM',
          description: `Acquisition of Fixed Asset: ${asset.name}`,
          account: 'Fixed Assets',
          debit: purchaseAmt,
          credit: 0,
          branchId: 'ALL'
        });
        
        entries.push({
          id: `${asset.id}-acq-cr`,
          date: asset.purchaseDate + 'T12:00:00',
          timestamp: purchaseTimestamp,
          refId: asset.id,
          type: 'SYSTEM',
          description: `Capital Contribution for ${asset.name}`,
          account: 'Owner Equity / Retained Earnings',
          debit: 0,
          credit: purchaseAmt,
          branchId: 'ALL'
        });
        
        // 2. Depreciation Posting (if any)
        const depreciation = purchaseAmt - currentVal;
        if (depreciation > 0) {
          const todayStr = new Date().toISOString().split('T')[0] + 'T23:59:59';
          const todayTimestamp = Date.now();
          
          entries.push({
            id: `${asset.id}-dep-dr`,
            date: todayStr,
            timestamp: todayTimestamp,
            refId: `${asset.id}-DEP`,
            type: 'SYSTEM',
            description: `Depreciation Expense for ${asset.name}`,
            account: 'Depreciation Expense',
            debit: depreciation,
            credit: 0,
            branchId: 'ALL'
          });
          
          entries.push({
            id: `${asset.id}-dep-cr`,
            date: todayStr,
            timestamp: todayTimestamp,
            refId: `${asset.id}-DEP`,
            type: 'SYSTEM',
            description: `Accumulated Depreciation for ${asset.name}`,
            account: 'Accumulated Depreciation',
            debit: 0,
            credit: depreciation,
            branchId: 'ALL'
          });
        } else if (depreciation < 0) {
          const appreciation = Math.abs(depreciation);
          const todayStr = new Date().toISOString().split('T')[0] + 'T23:59:59';
          const todayTimestamp = Date.now();
          
          entries.push({
            id: `${asset.id}-app-dr`,
            date: todayStr,
            timestamp: todayTimestamp,
            refId: `${asset.id}-APP`,
            type: 'SYSTEM',
            description: `Appreciation of Fixed Asset: ${asset.name}`,
            account: 'Fixed Assets',
            debit: appreciation,
            credit: 0,
            branchId: 'ALL'
          });
          
          entries.push({
            id: `${asset.id}-app-cr`,
            date: todayStr,
            timestamp: todayTimestamp,
            refId: `${asset.id}-APP`,
            type: 'SYSTEM',
            description: `Gain on Appreciation for ${asset.name}`,
            account: 'Owner Equity / Retained Earnings',
            debit: 0,
            credit: appreciation,
            branchId: 'ALL'
          });
        }
      }
    });

    // Sort entries chronologically
    entries.sort((a, b) => a.timestamp - b.timestamp);

    // Calculate opening balances to balance ledger perfectly with live database
    const openingCash = Math.max(0, currentCashVal - netCashMovement);
    const openingInventory = Math.max(0, currentInventoryVal - netInventoryMovement);
    const openingAR = Math.max(0, currentARVal - netARMovement);
    const openingAP = Math.max(0, currentAPVal - netAPMovement);
    const openingDirectorCA = Math.max(0, currentDirectorCAVal - netDirectorCAMovement);

    // Inject Opening Balances at the start of time
    const earliestTime = entries.length > 0 ? entries[0].timestamp - 60000 : Date.now() - 86400000;
    const earliestDate = entries.length > 0 ? entries[0].date : new Date(earliestTime).toISOString();

    const openingPostings: LedgerEntry[] = [];

    if (openingCash > 0) {
      openingPostings.push({
        id: 'open-cash',
        date: earliestDate,
        timestamp: earliestTime,
        refId: 'OPEN-BAL',
        type: 'SYSTEM',
        description: 'Opening Cash & Bank Reconciled',
        account: 'Cash / Bank',
        debit: openingCash,
        credit: 0,
        branchId: 'ALL'
      });
    }

    if (openingInventory > 0) {
      openingPostings.push({
        id: 'open-inv',
        date: earliestDate,
        timestamp: earliestTime,
        refId: 'OPEN-BAL',
        type: 'SYSTEM',
        description: 'Opening Stock Assets Reconciled',
        account: 'Inventory Asset',
        debit: openingInventory,
        credit: 0,
        branchId: 'ALL'
      });
    }

    if (openingAR > 0) {
      openingPostings.push({
        id: 'open-ar',
        date: earliestDate,
        timestamp: earliestTime,
        refId: 'OPEN-BAL',
        type: 'SYSTEM',
        description: 'Opening Accounts Receivable Reconciled',
        account: 'Accounts Receivable',
        debit: openingAR,
        credit: 0,
        branchId: 'ALL'
      });
    }

    if (openingAP > 0) {
      openingPostings.push({
        id: 'open-ap',
        date: earliestDate,
        timestamp: earliestTime,
        refId: 'OPEN-BAL',
        type: 'SYSTEM',
        description: 'Opening Accounts Payable Reconciled',
        account: 'Accounts Payable',
        debit: 0,
        credit: openingAP,
        branchId: 'ALL'
      });
    }

    if (openingDirectorCA > 0) {
      openingPostings.push({
        id: 'open-director-ca',
        date: earliestDate,
        timestamp: earliestTime,
        refId: 'OPEN-BAL',
        type: 'SYSTEM',
        description: 'Opening Director C/A Balance',
        account: 'Director C/A',
        debit: 0,
        credit: openingDirectorCA,
        branchId: 'ALL'
      });
    }

    // Offset opening balances using Share Capital (Rs. 100,000 Cr) and Retained Earnings
    const netEquity = openingCash + openingInventory + openingAR - openingAP - openingDirectorCA;
    
    // Inject Share Capital posting
    openingPostings.push({
      id: 'open-share-capital',
      date: earliestDate,
      timestamp: earliestTime,
      refId: 'OPEN-BAL',
      type: 'SYSTEM',
      description: 'Opening Share Capital Contribution',
      account: 'Share Capital',
      debit: 0,
      credit: 100000,
      branchId: 'ALL'
    });

    const netRetainedEarnings = netEquity - 100000;
    if (netRetainedEarnings > 0) {
      openingPostings.push({
        id: 'open-equity',
        date: earliestDate,
        timestamp: earliestTime,
        refId: 'OPEN-BAL',
        type: 'SYSTEM',
        description: 'Opening Retained Earnings Offset',
        account: 'Owner Equity / Retained Earnings',
        debit: 0,
        credit: netRetainedEarnings,
        branchId: 'ALL'
      });
    } else if (netRetainedEarnings < 0) {
      openingPostings.push({
        id: 'open-equity',
        date: earliestDate,
        timestamp: earliestTime,
        refId: 'OPEN-BAL',
        type: 'SYSTEM',
        description: 'Opening Retained Earnings Offset (Loss)',
        account: 'Owner Equity / Retained Earnings',
        debit: Math.abs(netRetainedEarnings),
        credit: 0,
        branchId: 'ALL'
      });
    }

    return [...openingPostings, ...entries];
  }, [transactions, products, accounts, customers, vendors, fixedAssets]);

  // 2. Generate running balance for each posting chronologically
  const entriesWithRunningBalance = useMemo(() => {
    const balances: Record<string, number> = {};
    const getBalanceChange = (account: string, debit: number, credit: number) => {
      const isCreditNormal = ['Sales Revenue', 'Accounts Payable', 'Share Capital', 'Director C/A', 'Owner Equity / Retained Earnings'].includes(account);
      return isCreditNormal ? (credit - debit) : (debit - credit);
    };

    return ledgerEntries.map(entry => {
      const currentBal = balances[entry.account] || 0;
      const change = getBalanceChange(entry.account, entry.debit, entry.credit);
      const newBal = currentBal + change;
      balances[entry.account] = newBal;
      
      return {
        ...entry,
        runningBalance: newBal
      };
    });
  }, [ledgerEntries]);

  // 3. Apply branch, account, date, and search query filters
  const filteredLedger = useMemo(() => {
    return entriesWithRunningBalance.filter(entry => {
      const matchAccount = selectedAccount === 'All Accounts' || entry.account === selectedAccount;
      const matchBranch = selectedBranch === 'ALL' || entry.branchId === 'ALL' || entry.branchId === selectedBranch;

      const dateStr = entry.date.split('T')[0];
      const matchStartDate = !startDate || dateStr >= startDate;
      const matchEndDate = !endDate || dateStr <= endDate;

      const q = searchQuery.toLowerCase();
      const matchSearch = !searchQuery || 
        entry.refId.toLowerCase().includes(q) ||
        entry.description.toLowerCase().includes(q) ||
        entry.account.toLowerCase().includes(q);

      return matchAccount && matchBranch && matchStartDate && matchEndDate && matchSearch;
    });
  }, [entriesWithRunningBalance, selectedAccount, selectedBranch, startDate, endDate, searchQuery]);

  // 4. Calculate account balance summary
  const summaryBalances = useMemo(() => {
    const balances: Record<string, number> = {
      'Cash / Bank': 0,
      'Accounts Receivable': 0,
      'Inventory Asset': 0,
      'Fixed Assets': 0,
      'Accounts Payable': 0,
      'Sales Revenue': 0,
      'Cost of Goods Sold (COGS)': 0,
      'Operating Expenses': 0,
      'Loans Receivable': 0,
      'Share Capital': 0,
      'Director C/A': 0,
      'Owner Equity / Retained Earnings': 0
    };

    // Process from the filtered ledger based on branch selection (gives local branch context)
    const activeEntries = selectedBranch === 'ALL' 
      ? entriesWithRunningBalance 
      : entriesWithRunningBalance.filter(e => e.branchId === 'ALL' || e.branchId === selectedBranch);

    activeEntries.forEach(entry => {
      if (balances[entry.account] !== undefined) {
        const isCreditNormal = ['Sales Revenue', 'Accounts Payable', 'Share Capital', 'Director C/A', 'Owner Equity / Retained Earnings'].includes(entry.account);
        const change = isCreditNormal ? (entry.credit - entry.debit) : (entry.debit - entry.credit);
        balances[entry.account] += change;
      }
    });

    return balances;
  }, [entriesWithRunningBalance, selectedBranch]);

  // Export to Excel (XLSX)
  const handleExportXLSX = () => {
    const showBalCol = selectedAccount !== 'All Accounts';
    const exportData = filteredLedger.map(e => ({
      'Date & Time': new Date(e.date).toLocaleString(),
      'Ref ID': e.refId,
      'Type': e.type,
      ...(!showBalCol ? { 'Account Impacted': e.account } : {}),
      'Description': e.description,
      'Debit (Dr)': e.debit > 0 ? e.debit : 0,
      'Credit (Cr)': e.credit > 0 ? e.credit : 0,
      ...(showBalCol ? { 'Running Balance': e.runningBalance } : {})
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    
    // Fit column widths
    const maxLens = Object.keys(exportData[0] || {}).map(k => k.length);
    exportData.forEach(row => {
      Object.values(row).forEach((val, i) => {
        const len = String(val || '').length;
        if (len > maxLens[i]) maxLens[i] = len;
      });
    });
    ws['!cols'] = maxLens.map(len => ({ wch: len + 3 }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "General Ledger");
    XLSX.writeFile(wb, `General_Ledger_Export_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const totalDebits = useMemo(() => filteredLedger.reduce((sum, e) => sum + e.debit, 0), [filteredLedger]);
  const totalCredits = useMemo(() => filteredLedger.reduce((sum, e) => sum + e.credit, 0), [filteredLedger]);
  const isBalanced = Math.abs(ledgerEntries.reduce((sum, e) => sum + e.debit - e.credit, 0)) < 0.01;

  return (
    <div className="space-y-6">
      {/* Header section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-indigo-900/10 pb-5 no-print">
        <div>
          <h1 className="text-2xl font-black text-indigo-950 uppercase tracking-tight">Financial Reports</h1>
          <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">General Ledger & Double-Entry Journals</p>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-50 border border-indigo-200 text-indigo-700 text-[10px] font-black uppercase tracking-wider rounded-xl hover:bg-indigo-100 transition-all active:scale-[0.98]"
          >
            🖨️ Print PDF
          </button>
          <button 
            onClick={handleExportXLSX}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white text-[10px] font-black uppercase tracking-wider rounded-xl hover:bg-emerald-700 transition-all active:scale-[0.98] shadow-md shadow-emerald-700/20"
          >
            📥 Export Excel
          </button>
        </div>
      </div>

      {/* Account Balances Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3.5 no-print">
        {Object.entries(summaryBalances).map(([name, balance]) => {
          let emoji = '💰';
          let color = 'from-blue-500 to-indigo-600 text-blue-600 bg-blue-50';
          if (name === 'Accounts Receivable') {
            emoji = '👥';
            color = 'from-violet-500 to-purple-600 text-purple-600 bg-purple-50';
          } else if (name === 'Inventory Asset') {
            emoji = '📦';
            color = 'from-emerald-500 to-teal-600 text-emerald-600 bg-emerald-50';
          } else if (name === 'Fixed Assets') {
            emoji = '🏛️';
            color = 'from-blue-600 to-indigo-700 text-indigo-600 bg-indigo-50';
          } else if (name === 'Accounts Payable') {
            emoji = '📥';
            color = 'from-rose-500 to-pink-600 text-rose-600 bg-rose-50';
          } else if (name === 'Sales Revenue') {
            emoji = '📈';
            color = 'from-purple-600 to-indigo-700 text-indigo-600 bg-indigo-50';
          } else if (name === 'Cost of Goods Sold (COGS)') {
            emoji = '🏷️';
            color = 'from-amber-500 to-orange-600 text-amber-600 bg-amber-50';
          } else if (name === 'Operating Expenses') {
            emoji = '💸';
            color = 'from-red-500 to-rose-600 text-red-600 bg-red-50';
          } else if (name === 'Loans Receivable') {
            emoji = '🏦';
            color = 'from-sky-500 to-cyan-600 text-cyan-600 bg-cyan-50';
          } else if (name === 'Share Capital') {
            emoji = '🪙';
            color = 'from-emerald-600 to-teal-700 text-emerald-600 bg-emerald-50';
          } else if (name === 'Director C/A') {
            emoji = '👤';
            color = 'from-rose-600 to-pink-700 text-rose-600 bg-rose-50';
          } else if (name === 'Owner Equity / Retained Earnings') {
            emoji = '⚖️';
            color = 'from-indigo-600 to-violet-800 text-indigo-600 bg-indigo-50';
          }

          return (
            <div key={name} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex flex-col justify-between hover:shadow-md transition-all duration-300">
              <div className="flex items-center gap-2">
                <span className="text-lg">{emoji}</span>
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider truncate">{name}</span>
              </div>
              <div className="mt-3">
                <p className="text-lg font-black text-slate-800">
                  Rs. {formatCurrency(Number(balance))}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Filter panel */}
      <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 items-end no-print">
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Select Account</label>
          <select 
            value={selectedAccount}
            onChange={(e) => setSelectedAccount(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200/80 rounded-xl px-3 py-2.5 text-xs text-slate-700 font-medium outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all cursor-pointer"
          >
            {accountsList.map(acc => (
              <option key={acc} value={acc}>{acc}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Select Branch</label>
          <select 
            value={selectedBranch}
            onChange={(e) => setSelectedBranch(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200/80 rounded-xl px-3 py-2.5 text-xs text-slate-700 font-medium outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all cursor-pointer"
          >
            <option value="ALL">ALL BRANCHES</option>
            {userProfile.allBranches?.filter(b => b !== 'ALL').map(b => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">From Date</label>
          <input 
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200/80 rounded-xl px-3 py-2 text-xs text-slate-700 font-medium outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">To Date</label>
          <input 
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200/80 rounded-xl px-3 py-2 text-xs text-slate-700 font-medium outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Search journal</label>
          <div className="relative">
            <input 
              type="text"
              placeholder="Search reference, description..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200/80 rounded-xl pl-3 pr-8 py-2.5 text-xs text-slate-707 font-medium outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-650 transition-colors text-xs"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Ledger Table Container */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden print:border-none print:shadow-none">
        {/* Print-only corporate header */}
        <div className="hidden print:block border-b border-slate-200 pb-5 mb-5">
          <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">{userProfile.companyName || 'PRASAMA (PVT) LTD'}</h2>
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">General Ledger Report - {selectedAccount}</p>
          <div className="grid grid-cols-2 gap-4 mt-4 text-[10px] text-slate-600 font-semibold uppercase">
            <p>Branch: {selectedBranch === 'ALL' ? 'ALL BRANCHES' : selectedBranch}</p>
            <p className="text-right">Period: {startDate || 'Beginning'} to {endDate || 'Present'}</p>
            <p>Generated: {new Date().toLocaleString()}</p>
          </div>
        </div>

        <div className="overflow-x-auto max-h-[600px] custom-scrollbar">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/70 border-b border-slate-150 text-[10px] font-black text-slate-400 uppercase tracking-wider sticky top-0 bg-white z-10">
                <th className="p-4 w-[180px]">Date & Time</th>
                <th className="p-4 w-[140px]">Ref ID</th>
                <th className="p-4 w-[80px]">Type</th>
                {selectedAccount === 'All Accounts' && <th className="p-4 w-[160px]">Account</th>}
                <th className="p-4">Description</th>
                <th className="p-4 text-right w-[120px]">Debit (Dr)</th>
                <th className="p-4 text-right w-[120px]">Credit (Cr)</th>
                {selectedAccount !== 'All Accounts' && <th className="p-4 text-right w-[140px]">Running Balance</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs text-slate-700 font-medium">
              {filteredLedger.length > 0 ? (
                filteredLedger.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50/30 transition-colors">
                    <td className="p-4 whitespace-nowrap text-slate-400">{new Date(e.date).toLocaleString()}</td>
                    <td className="p-4 whitespace-nowrap font-bold text-slate-900">{e.refId}</td>
                    <td className="p-4 whitespace-nowrap">
                      <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black tracking-wider uppercase border ${
                        e.type === 'SALE' || e.type === 'SALE_HISTORY_IMPORT'
                          ? 'bg-blue-50 text-blue-650 border-blue-100'
                          : e.type === 'PURCHASE'
                          ? 'bg-emerald-50 text-emerald-600 border-emerald-100'
                          : e.type === 'EXPENSE'
                          ? 'bg-rose-50 text-rose-600 border-rose-100'
                          : 'bg-slate-100 text-slate-600 border-slate-200'
                      }`}>
                        {e.type}
                      </span>
                    </td>
                    {selectedAccount === 'All Accounts' && (
                      <td className="p-4 whitespace-nowrap font-semibold text-slate-800">{e.account}</td>
                    )}
                    <td className="p-4 text-slate-500 max-w-xs lg:max-w-xl truncate" title={e.description}>{e.description}</td>
                    <td className="p-4 text-right font-bold text-slate-900">
                      {e.debit > 0 ? `Rs. ${formatCurrency(e.debit)}` : '-'}
                    </td>
                    <td className="p-4 text-right font-bold text-slate-900">
                      {e.credit > 0 ? `Rs. ${formatCurrency(e.credit)}` : '-'}
                    </td>
                    {selectedAccount !== 'All Accounts' && (
                      <td className="p-4 text-right font-black text-slate-900 bg-slate-50/10">
                        Rs. {formatCurrency(e.runningBalance)}
                      </td>
                    )}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={selectedAccount === 'All Accounts' ? 7 : 7} className="p-12 text-center text-slate-400 italic">
                    No ledger entries match the selected filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Balancing indicators and statistics footer */}
        <div className="bg-slate-900 text-slate-350 p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-2.5">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs text-white ${isBalanced ? 'bg-emerald-500' : 'bg-red-500'}`}>
              {isBalanced ? '✓' : '!'}
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 leading-none">Double-Entry Status</p>
              <p className="text-xs font-black text-white mt-1 uppercase">
                {isBalanced ? 'System Fully Balanced & Reconciled' : 'System Out of Balance'}
              </p>
            </div>
          </div>
          
          <div className="flex gap-8 text-right w-full md:w-auto justify-between md:justify-end">
            <div>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Filtered Debits (Dr)</p>
              <p className="text-base font-black text-white">
                Rs. {formatCurrency(totalDebits)}
              </p>
            </div>
            <div>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Filtered Credits (Cr)</p>
              <p className="text-base font-black text-white">
                Rs. {formatCurrency(totalCredits)}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Reports;
