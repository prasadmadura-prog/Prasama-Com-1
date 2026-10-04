import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Vendor, PurchaseOrder } from '../types';
import { collections, upsertDocument, subscribeToCollection, deleteDocument } from '../services/database';

// Shape of a printed history item
interface HistoryItem {
  id: number;
  date: string;
  payee: string;
  amount: string;
  amountInWords: string;
  timestamp: string;
}

// Shape of a Future Release Cheque item
export interface FutureChequeItem {
  id: string;
  chequeNumber: string;
  date: string;
  amount: number;
  payee: string;
  status: 'cleared' | 'future_release';
  notes?: string;
  createdAt?: string;
}

interface ChequePrintProps {
  vendors?: Vendor[];
  purchaseOrders?: PurchaseOrder[];
}

// Seed initial content from user's attached photo
const INITIAL_FUTURE_CHEQUES: FutureChequeItem[] = [
  {
    id: 'fc-000009',
    chequeNumber: '000009',
    date: '2026-09-05',
    amount: 5000.00,
    payee: '',
    status: 'cleared',
    notes: 'Cleared (Orange Highlighted)',
    createdAt: '2026-09-05T00:00:00.000Z'
  },
  {
    id: 'fc-000005',
    chequeNumber: '000005',
    date: '2026-09-08',
    amount: 7622.61,
    payee: '',
    status: 'cleared',
    notes: 'Cleared (Orange Highlighted)',
    createdAt: '2026-09-08T00:00:00.000Z'
  },
  {
    id: 'fc-000008',
    chequeNumber: '000008',
    date: '2026-09-14',
    amount: 3360.00,
    payee: '',
    status: 'cleared',
    notes: 'Cleared (Orange Highlighted)',
    createdAt: '2026-09-14T00:00:00.000Z'
  },
  {
    id: 'fc-000010',
    chequeNumber: '000010',
    date: '2026-09-26',
    amount: 5600.00,
    payee: '',
    status: 'future_release',
    notes: 'Upcoming Future Release',
    createdAt: '2026-09-22T00:00:00.000Z'
  },
  {
    id: 'fc-000011',
    chequeNumber: '000011',
    date: '2026-09-28',
    amount: 5715.00,
    payee: '',
    status: 'future_release',
    notes: 'Upcoming Future Release',
    createdAt: '2026-09-22T00:00:00.000Z'
  }
];

const ChequePrint: React.FC<ChequePrintProps> = ({ vendors = [], purchaseOrders }) => {
  // Top Level Tab State: 'terminal' | 'future_release'
  const [activeSubTab, setActiveSubTab] = useState<'terminal' | 'future_release'>('terminal');

  // Fallback direct subscription to purchaseOrders if not passed via props
  const [localPOs, setLocalPOs] = useState<PurchaseOrder[]>([]);

  useEffect(() => {
    if (purchaseOrders && purchaseOrders.length > 0) return;
    const unsub = subscribeToCollection(collections.purchaseOrders || 'p_v16_purchaseOrders', (data) => {
      if (Array.isArray(data)) {
        setLocalPOs(data as PurchaseOrder[]);
      }
    });
    return () => unsub();
  }, [purchaseOrders]);

  const effectivePOs = useMemo(() => {
    return (purchaseOrders && purchaseOrders.length > 0) ? purchaseOrders : localPOs;
  }, [purchaseOrders, localPOs]);

  // Cheque Terminal Form State
  const [cheque, setCheque] = useState({
    date: new Date().toISOString().split('T')[0],
    payee: '',
    amount: '',
    amountInWords: '',
    memo: '',
    chequeNumber: '',
    isAccountPayee: true
  });

  // Load Printed History from Firebase
  const [printHistory, setPrintHistory] = useState<HistoryItem[]>([]);

  useEffect(() => {
    const unsubscribe = subscribeToCollection(collections.chequeHistory, (data) => {
      const sorted = [...data].sort((a, b) => Number(b.id || 0) - Number(a.id || 0));
      setPrintHistory(sorted);
    });
    return () => unsubscribe();
  }, []);

  // Future Release Cheques State
  const [futureCheques, setFutureCheques] = useState<FutureChequeItem[]>(() => {
    const cached = localStorage.getItem('cached_future_cheques');
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch (e) {}
    }
    return INITIAL_FUTURE_CHEQUES;
  });

  // Subscribe to Future Cheques from Firebase with fallback to initial seed
  useEffect(() => {
    const unsubscribe = subscribeToCollection(collections.futureCheques || 'p_v16_futureCheques', (data) => {
      if (Array.isArray(data) && data.length > 0) {
        setFutureCheques(data as FutureChequeItem[]);
        localStorage.setItem('cached_future_cheques', JSON.stringify(data));
      } else {
        INITIAL_FUTURE_CHEQUES.forEach(item => {
          upsertDocument(collections.futureCheques || 'p_v16_futureCheques', item.id, item).catch(() => {});
        });
        setFutureCheques(INITIAL_FUTURE_CHEQUES);
        localStorage.setItem('cached_future_cheques', JSON.stringify(INITIAL_FUTURE_CHEQUES));
      }
    });
    return () => unsubscribe();
  }, []);

  // Synchronize any cheques from Purchase Orders that might not be in futureCheques yet or need updating
  useEffect(() => {
    if (!effectivePOs || effectivePOs.length === 0) return;

    let hasChanges = false;
    let nextList = [...futureCheques];
    const docsToUpsert: FutureChequeItem[] = [];
    const docsToDelete: string[] = [];

    effectivePOs.forEach(po => {
      if (po.paymentMethod === 'CHEQUE') {
        const vendor = vendors.find(v => v.id === po.vendorId);
        const payeeName = vendor?.name || 'VENDOR PAYEE';

        const poCheques: { number: string; date: string; amount?: number }[] = [];
        if (po.cheques && po.cheques.length > 0) {
          po.cheques.forEach(c => {
            if (c.chequeNumber?.trim()) {
              poCheques.push({
                number: c.chequeNumber.toUpperCase().trim(),
                date: c.chequeDate || (typeof po.date === 'string' ? po.date.split('T')[0] : new Date().toISOString().split('T')[0]),
                amount: c.amount !== undefined ? Number(c.amount) : undefined
              });
            }
          });
        } else {
          if (po.chequeNumber?.trim()) {
            poCheques.push({
              number: po.chequeNumber.toUpperCase().trim(),
              date: po.chequeDate || (typeof po.date === 'string' ? po.date.split('T')[0] : new Date().toISOString().split('T')[0]),
              amount: po.chequeAmount1 !== undefined ? Number(po.chequeAmount1) : Number(po.totalAmount)
            });
          }
          if (po.chequeNumber2?.trim()) {
            poCheques.push({
              number: po.chequeNumber2.toUpperCase().trim(),
              date: po.chequeDate2 || (typeof po.date === 'string' ? po.date.split('T')[0] : new Date().toISOString().split('T')[0]),
              amount: po.chequeAmount2 !== undefined ? Number(po.chequeAmount2) : 0
            });
          }
        }

        const poTotal = Number(po.totalAmount) || 0;

        poCheques.forEach((chq, idx) => {
          if (!chq.number) return;

          // Calculate target amount: if specified and > 0 use it; if final cheque, auto-balance with remaining unallocated amount
          const sumOtherCheques = poCheques.reduce((sum, c, i) => {
            if (i === idx) return sum;
            return sum + (typeof c.amount === 'number' && !isNaN(c.amount) && c.amount > 0 ? c.amount : 0);
          }, 0);
          const remainingForFinal = Math.max(0, Math.round((poTotal - sumOtherCheques) * 100) / 100);
          const targetAmount = (typeof chq.amount === 'number' && !isNaN(chq.amount) && chq.amount > 0)
            ? chq.amount
            : (idx === poCheques.length - 1 ? remainingForFinal : (idx === 0 ? poTotal : 0));

          // Look for existing future cheque by number or PO ref notes
          const existingIdx = nextList.findIndex(fc =>
            (fc.chequeNumber || '').toUpperCase().trim() === chq.number ||
            fc.id === `fc-${chq.number}` ||
            (fc.notes && fc.notes.includes(po.id) && fc.notes.includes(`Chq ${idx + 1}`))
          );

          if (existingIdx >= 0) {
            const existing = nextList[existingIdx];
            const amountDiffers = Math.abs((Number(existing.amount) || 0) - targetAmount) > 0.01;
            const dateDiffers = Boolean(chq.date && existing.date !== chq.date);
            const numDiffers = (existing.chequeNumber || '').toUpperCase().trim() !== chq.number;
            const payeeDiffers = (!existing.payee || existing.payee === 'VENDOR PAYEE' || existing.payee.startsWith('PAYEE -')) && payeeName !== 'VENDOR PAYEE' && existing.payee !== payeeName;

            if (amountDiffers || dateDiffers || numDiffers || payeeDiffers) {
              const updatedItem: FutureChequeItem = {
                ...existing,
                id: `fc-${chq.number}`,
                chequeNumber: chq.number,
                date: chq.date || existing.date,
                amount: targetAmount,
                payee: payeeDiffers ? payeeName : (existing.payee || payeeName),
                notes: existing.notes || `PO Ref (Chq ${idx + 1}): ${po.id}`
              };

              if (existing.id !== updatedItem.id) {
                docsToDelete.push(existing.id);
              }

              nextList[existingIdx] = updatedItem;
              docsToUpsert.push(updatedItem);
              hasChanges = true;
            }
          } else {
            const newDoc: FutureChequeItem = {
              id: `fc-${chq.number}`,
              chequeNumber: chq.number,
              date: chq.date,
              amount: targetAmount,
              payee: payeeName,
              status: 'future_release',
              notes: `PO Ref (Chq ${idx + 1}): ${po.id}`,
              createdAt: new Date().toISOString()
            };
            nextList.push(newDoc);
            docsToUpsert.push(newDoc);
            hasChanges = true;
          }
        });
      }
    });

    if (hasChanges) {
      setFutureCheques(nextList);
      localStorage.setItem('cached_future_cheques', JSON.stringify(nextList));
      docsToUpsert.forEach(doc => {
        upsertDocument(collections.futureCheques || 'p_v16_futureCheques', doc.id, doc).catch(() => {});
      });
      docsToDelete.forEach(id => {
        deleteDocument(collections.futureCheques || 'p_v16_futureCheques', id).catch(() => {});
      });
    }
  }, [effectivePOs, vendors, futureCheques]);

  // Inline Payee Editing state
  const [inlineEditingId, setInlineEditingId] = useState<string | null>(null);
  const [inlinePayeeValue, setInlinePayeeValue] = useState<string>('');

  // Filter & Search State for Future Release Cheques Tab
  const [statusFilter, setStatusFilter] = useState<'all' | 'future_release' | 'cleared'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Modal State for Adding/Editing Future Cheque
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<FutureChequeItem | null>(null);
  const [modalForm, setModalForm] = useState({
    chequeNumber: '',
    date: new Date().toISOString().split('T')[0],
    payee: '',
    amount: '',
    status: 'future_release' as 'future_release' | 'cleared',
    notes: ''
  });

  // Derived unique payees for dropdown (History + Vendors + Future Cheques)
  const uniquePayees = useMemo(() => {
    const historyPayees = printHistory.map(item => item.payee).filter(p => p.trim() !== '');
    const vendorPayees = vendors.map(v => v.name).filter(p => p.trim() !== '');
    const futurePayees = futureCheques.map(fc => fc.payee).filter(p => p.trim() !== '' && !p.startsWith('PAYEE -'));
    const allPayees = [...historyPayees, ...vendorPayees, ...futurePayees];
    return Array.from(new Set(allPayees)).sort();
  }, [printHistory, vendors, futureCheques]);

  // Physical alignment offsets (mm) - Default: Vertical (Y): -11, Horizontal (X): 7, Date Pitch: 7.4
  const [offsets, setOffsets] = useState(() => {
    const saved = localStorage.getItem('cheque_print_offsets');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (typeof parsed.top === 'number' && typeof parsed.left === 'number' && typeof parsed.pitch === 'number') {
          return parsed;
        }
      } catch (e) {}
    }
    return { top: -11, left: 7, pitch: 7.4 };
  });

  const updateOffsets = (newOffsets: { top: number; left: number; pitch: number }) => {
    setOffsets(newOffsets);
    try {
      localStorage.setItem('cheque_print_offsets', JSON.stringify(newOffsets));
    } catch (e) {}
  };

  // Dedicated Element Positions in Millimeters (mm) from Top-Left of Cheque
  type ElementKey = 'crossing' | 'date' | 'payee' | 'words' | 'amount';

  interface ElementPositions {
    crossing: { x: number; y: number; scale?: number; angle?: number };
    date: { x: number; y: number; fontSize?: number; pitch?: number; groupGap?: number };
    payee: { x: number; y: number; fontSize?: number };
    words: { x: number; y: number; width?: number; fontSize?: number; lineHeight?: number };
    amount: { x: number; y: number; fontSize?: number };
  }

  interface ChequeDimensions {
    width: number;
    height: number;
  }

  const DEFAULT_OFFSETS = { top: -11, left: 7, pitch: 7.4 };

  const DEFAULT_CHEQUE_DIMENSIONS: ChequeDimensions = {
    width: 180,
    height: 90
  };

  const DEFAULT_FULL_YEAR_DATE = true;

  const DEFAULT_ELEMENT_POSITIONS: ElementPositions = {
    crossing: { x: 64.1, y: 14, scale: 95, angle: -24 },
    date: { x: 110, y: 10, fontSize: 14, pitch: 7.4, groupGap: 0 },
    payee: { x: 17, y: 26, fontSize: 10 },
    words: { x: 13, y: 46.4, width: 95, fontSize: 10, lineHeight: 1.5 },
    amount: { x: 112, y: 40, fontSize: 12 }
  };

  const [chequeDimensions, setChequeDimensions] = useState<ChequeDimensions>(() => {
    const saved = localStorage.getItem('cheque_dimensions');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (typeof parsed.width === 'number' && typeof parsed.height === 'number') {
          return parsed;
        }
      } catch (e) {}
    }
    return DEFAULT_CHEQUE_DIMENSIONS;
  });

  const updateChequeDimensions = (dims: ChequeDimensions) => {
    setChequeDimensions(dims);
    try {
      localStorage.setItem('cheque_dimensions', JSON.stringify(dims));
    } catch (e) {}
  };

  const [elementPositions, setElementPositions] = useState<ElementPositions>(() => {
    const saved = localStorage.getItem('cheque_element_positions');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return {
          crossing: { ...DEFAULT_ELEMENT_POSITIONS.crossing, ...(parsed.crossing || {}) },
          date: { ...DEFAULT_ELEMENT_POSITIONS.date, ...(parsed.date || {}) },
          payee: { ...DEFAULT_ELEMENT_POSITIONS.payee, ...(parsed.payee || {}) },
          words: { ...DEFAULT_ELEMENT_POSITIONS.words, ...(parsed.words || {}) },
          amount: { ...DEFAULT_ELEMENT_POSITIONS.amount, ...(parsed.amount || {}) }
        };
      } catch (e) {}
    }
    return DEFAULT_ELEMENT_POSITIONS;
  });

  // Toggle for full 4-digit year (e.g. 2026 fills the empty "2 0" boxes) vs leave blank
  const [fullYearDate, setFullYearDate] = useState<boolean>(() => {
    const saved = localStorage.getItem('cheque_full_year_date');
    return saved !== null ? JSON.parse(saved) : DEFAULT_FULL_YEAR_DATE;
  });

  const toggleFullYearDate = (val?: boolean) => {
    setFullYearDate(prev => {
      const nextVal = typeof val === 'boolean' ? val : !prev;
      try {
        localStorage.setItem('cheque_full_year_date', JSON.stringify(nextVal));
      } catch (e) {}
      return nextVal;
    });
  };

  const [activeElement, setActiveElement] = useState<ElementKey>('crossing');
  const [isDragging, setIsDragging] = useState<ElementKey | null>(null);
  const [nudgeStep, setNudgeStep] = useState<number>(0.5);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState(false);
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; initX: number; initY: number } | null>(null);

  const CANVAS_PX_WIDTH = 760;
  const MM_TO_PX = CANVAS_PX_WIDTH / (chequeDimensions.width || 180);
  const canvasPxHeight = Math.round((chequeDimensions.height || 90) * MM_TO_PX);

  const handleStartDrag = (elKey: ElementKey, clientX: number, clientY: number) => {
    setActiveElement(elKey);
    setIsDragging(elKey);
    dragStartRef.current = {
      mouseX: clientX,
      mouseY: clientY,
      initX: elementPositions[elKey].x,
      initY: elementPositions[elKey].y
    };
  };

  const updateElementPos = (elKey: ElementKey, newPos: { x: number; y: number }) => {
    setElementPositions(prev => {
      const updated = {
        ...prev,
        [elKey]: {
          ...prev[elKey],
          x: Math.round(newPos.x * 10) / 10,
          y: Math.round(newPos.y * 10) / 10
        }
      };
      try {
        localStorage.setItem('cheque_element_positions', JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });
  };

  const nudgeElement = (elKey: ElementKey, deltaX: number, deltaY: number) => {
    const cur = elementPositions[elKey];
    updateElementPos(elKey, {
      x: cur.x + deltaX,
      y: cur.y + deltaY
    });
  };

  const updateCrossingProp = (prop: 'scale' | 'angle', val: number) => {
    setElementPositions(prev => {
      const updated = {
        ...prev,
        crossing: {
          ...prev.crossing,
          [prop]: val
        }
      };
      try {
        localStorage.setItem('cheque_element_positions', JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });
  };

  const updateWordsWidth = (val: number) => {
    setElementPositions(prev => {
      const updated = {
        ...prev,
        words: {
          ...prev.words,
          width: val
        }
      };
      try {
        localStorage.setItem('cheque_element_positions', JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });
  };

  const updateElementProp = <K extends ElementKey, P extends keyof ElementPositions[K]>(
    elKey: K,
    prop: P,
    val: ElementPositions[K][P]
  ) => {
    setElementPositions(prev => {
      const updated = {
        ...prev,
        [elKey]: {
          ...prev[elKey],
          [prop]: val
        }
      };
      try {
        localStorage.setItem('cheque_element_positions', JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });
  };

  const datePitch = typeof elementPositions.date.pitch === 'number'
    ? elementPositions.date.pitch
    : (typeof offsets.pitch === 'number' ? offsets.pitch : 7.4);

  const dateGroupGap = typeof elementPositions.date.groupGap === 'number'
    ? elementPositions.date.groupGap
    : 0;

  const updateDatePitch = (newPitch: number) => {
    const cleanPitch = Math.max(3, Math.min(20, Math.round(newPitch * 10) / 10));
    updateElementProp('date', 'pitch', cleanPitch);
    updateOffsets({ ...offsets, pitch: cleanPitch });
  };

  const updateDateGroupGap = (newGap: number) => {
    const cleanGap = Math.max(0, Math.min(15, Math.round(newGap * 10) / 10));
    updateElementProp('date', 'groupGap', cleanGap);
  };

  const handleSaveAllLocations = () => {
    try {
      localStorage.setItem('cheque_element_positions', JSON.stringify(elementPositions));
      localStorage.setItem('cheque_dimensions', JSON.stringify(chequeDimensions));
      localStorage.setItem('cheque_print_offsets', JSON.stringify(offsets));
      localStorage.setItem('cheque_full_year_date', JSON.stringify(fullYearDate));
      setSaveSuccessMsg(true);
      setTimeout(() => setSaveSuccessMsg(false), 3500);
    } catch (e) {
      console.error("Save error:", e);
    }
  };

  const handleResetPositions = () => {
    setElementPositions(DEFAULT_ELEMENT_POSITIONS);
    setChequeDimensions(DEFAULT_CHEQUE_DIMENSIONS);
    setOffsets(DEFAULT_OFFSETS);
    setFullYearDate(DEFAULT_FULL_YEAR_DATE);
    try {
      localStorage.setItem('cheque_element_positions', JSON.stringify(DEFAULT_ELEMENT_POSITIONS));
      localStorage.setItem('cheque_dimensions', JSON.stringify(DEFAULT_CHEQUE_DIMENSIONS));
      localStorage.setItem('cheque_print_offsets', JSON.stringify(DEFAULT_OFFSETS));
      localStorage.setItem('cheque_full_year_date', JSON.stringify(DEFAULT_FULL_YEAR_DATE));
    } catch (e) {}
    setSaveSuccessMsg(true);
    setTimeout(() => setSaveSuccessMsg(false), 3500);
  };

  // Dragging event listeners for mouse & touch
  useEffect(() => {
    const handlePointerMove = (clientX: number, clientY: number) => {
      if (!isDragging || !dragStartRef.current) return;
      const deltaX = (clientX - dragStartRef.current.mouseX) / MM_TO_PX;
      const deltaY = (clientY - dragStartRef.current.mouseY) / MM_TO_PX;
      const key = isDragging;
      const newX = Math.round((dragStartRef.current.initX + deltaX) * 10) / 10;
      const newY = Math.round((dragStartRef.current.initY + deltaY) * 10) / 10;

      setElementPositions(prev => ({
        ...prev,
        [key]: {
          ...prev[key],
          x: Math.max(0, Math.min((chequeDimensions.width || 180) - 5, newX)),
          y: Math.max(0, Math.min((chequeDimensions.height || 90) - 5, newY))
        }
      }));
    };

    const handleMouseMove = (e: MouseEvent) => {
      handlePointerMove(e.clientX, e.clientY);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        handlePointerMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    };

    const handlePointerUp = () => {
      if (isDragging) {
        setIsDragging(null);
        dragStartRef.current = null;
        try {
          localStorage.setItem('cheque_element_positions', JSON.stringify(elementPositions));
        } catch (e) {}
      }
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handlePointerUp);
      window.addEventListener('touchmove', handleTouchMove);
      window.addEventListener('touchend', handlePointerUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handlePointerUp);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handlePointerUp);
    };
  }, [isDragging, elementPositions]);

  const numberToWords = (num: number): string => {
    if (isNaN(num) || num === 0) return "";
    const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
    const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
    const convert = (n: number): string => {
      if (n < 20) return ones[n];
      if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 !== 0 ? " " + ones[n % 10] : "");
      if (n < 1000) return ones[Math.floor(n / 100)] + " Hundred" + (n % 100 !== 0 ? " and " + convert(n % 100) : "");
      if (n < 1000000) return convert(Math.floor(n / 1000)) + " Thousand" + (n % 1000 !== 0 ? " " + convert(n % 1000) : "");
      if (n < 1000000000) return convert(Math.floor(n / 1000000)) + " Million" + (n % 1000000 !== 0 ? " " + convert(n % 1000000) : "");
      return "Amount too large";
    };
    const mainPart = Math.floor(num);
    const fractionPart = Math.round((num - mainPart) * 100);
    let words = convert(mainPart);
    if (fractionPart > 0) words += " and " + convert(fractionPart) + " Cents";
    return words + " Only";
  };

  const handleAmountChange = (val: string) => {
    const num = parseFloat(val);
    const words = val ? numberToWords(num) : '';
    setCheque(prev => ({ ...prev, amount: val, amountInWords: words }));
  };

  const handlePrint = () => {
    if (cheque.payee && cheque.amount) {
      const newItem: HistoryItem = {
        id: Date.now(),
        date: cheque.date,
        payee: cheque.payee,
        amount: cheque.amount,
        amountInWords: cheque.amountInWords,
        timestamp: new Date().toISOString()
      };

      upsertDocument(collections.chequeHistory, String(newItem.id), newItem)
        .catch(err => console.error("Error saving cheque history:", err));
    }
    window.print();
  };

  const handleReprint = (item: HistoryItem) => {
    setCheque({
      ...cheque,
      date: item.date,
      payee: item.payee,
      amount: item.amount,
      amountInWords: item.amountInWords
    });
    setActiveSubTab('terminal');
  };

  // Load a future cheque directly into Cheque Printing Terminal
  const handleLoadFutureChequeToTerminal = (item: FutureChequeItem) => {
    const amtStr = String(item.amount);
    const payeeName = item.payee && !item.payee.startsWith('PAYEE -') ? item.payee : '';
    setCheque({
      date: item.date,
      payee: payeeName,
      amount: amtStr,
      amountInWords: numberToWords(item.amount),
      memo: item.notes || '',
      chequeNumber: item.chequeNumber,
      isAccountPayee: true
    });
    setActiveSubTab('terminal');
  };

  // Toggle Status of Future Release Cheque (Cleared <-> Future Release)
  const handleToggleStatus = (item: FutureChequeItem) => {
    const newStatus: 'cleared' | 'future_release' = item.status === 'cleared' ? 'future_release' : 'cleared';
    const updated: FutureChequeItem = { ...item, status: newStatus };
    
    setFutureCheques(prev => prev.map(c => c.id === item.id ? updated : c));
    localStorage.setItem('cached_future_cheques', JSON.stringify(futureCheques.map(c => c.id === item.id ? updated : c)));
    upsertDocument(collections.futureCheques || 'p_v16_futureCheques', item.id, updated).catch(err => console.error(err));
  };

  // Inline Save Payee Name
  const handleSaveInlinePayee = (id: string, newPayee: string) => {
    const cleanPayee = newPayee.trim().toUpperCase();
    setFutureCheques(prev => {
      const updated = prev.map(c => c.id === id ? { ...c, payee: cleanPayee } : c);
      localStorage.setItem('cached_future_cheques', JSON.stringify(updated));
      return updated;
    });

    const targetDoc = futureCheques.find(c => c.id === id);
    if (targetDoc) {
      const updatedDoc = { ...targetDoc, payee: cleanPayee };
      upsertDocument(collections.futureCheques || 'p_v16_futureCheques', id, updatedDoc).catch(err => console.error(err));
    }
    setInlineEditingId(null);
  };

  // Save Modal (Create / Edit)
  const handleSaveModal = (e: React.FormEvent) => {
    e.preventDefault();
    const numAmt = parseFloat(modalForm.amount);
    if (isNaN(numAmt) || numAmt <= 0) {
      alert('Please enter a valid amount.');
      return;
    }
    if (!modalForm.chequeNumber.trim()) {
      alert('Please enter a Cheque Number.');
      return;
    }

    const cleanNum = modalForm.chequeNumber.trim().toUpperCase();
    const docId = `fc-${cleanNum}`;
    const oldId = editingItem ? editingItem.id : null;

    const newItem: FutureChequeItem = {
      id: docId,
      chequeNumber: cleanNum,
      date: modalForm.date,
      amount: numAmt,
      payee: modalForm.payee.trim(),
      status: modalForm.status,
      notes: modalForm.notes.trim() || undefined,
      createdAt: editingItem ? editingItem.createdAt : new Date().toISOString()
    };

    setFutureCheques(prev => {
      const filtered = oldId ? prev.filter(c => c.id !== oldId && c.id !== docId) : prev.filter(c => c.id !== docId);
      const nextList = [newItem, ...filtered];
      localStorage.setItem('cached_future_cheques', JSON.stringify(nextList));
      return nextList;
    });

    if (oldId && oldId !== docId) {
      deleteDocument(collections.futureCheques || 'p_v16_futureCheques', oldId).catch(err => console.error(err));
    }
    upsertDocument(collections.futureCheques || 'p_v16_futureCheques', docId, newItem).catch(err => console.error(err));

    setIsModalOpen(false);
    setEditingItem(null);
  };

  const handleOpenAddModal = () => {
    setEditingItem(null);
    setModalForm({
      chequeNumber: '',
      date: new Date().toISOString().split('T')[0],
      payee: '',
      amount: '',
      status: 'future_release',
      notes: ''
    });
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (item: FutureChequeItem) => {
    setEditingItem(item);
    setModalForm({
      chequeNumber: item.chequeNumber,
      date: item.date,
      payee: item.payee.startsWith('PAYEE -') ? '' : item.payee,
      amount: String(item.amount),
      status: item.status,
      notes: item.notes || ''
    });
    setIsModalOpen(true);
  };

  const handleDeleteFutureCheque = (id: string) => {
    if (!window.confirm('Are you sure you want to delete this cheque record?')) return;
    setFutureCheques(prev => {
      const filtered = prev.filter(c => c.id !== id);
      localStorage.setItem('cached_future_cheques', JSON.stringify(filtered));
      return filtered;
    });
    deleteDocument(collections.futureCheques || 'p_v16_futureCheques', id).catch(err => console.error(err));
  };

  // KPI Calculations
  const futurePendingList = useMemo(() => futureCheques.filter(c => c.status === 'future_release'), [futureCheques]);
  const clearedList = useMemo(() => futureCheques.filter(c => c.status === 'cleared'), [futureCheques]);

  const totalFuturePendingAmount = useMemo(() => futurePendingList.reduce((sum, c) => sum + (c.amount || 0), 0), [futurePendingList]);
  const totalClearedAmount = useMemo(() => clearedList.reduce((sum, c) => sum + (c.amount || 0), 0), [clearedList]);

  // Next Upcoming Release Cheque
  const nextReleaseCheque = useMemo(() => {
    if (futurePendingList.length === 0) return null;
    return [...futurePendingList].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];
  }, [futurePendingList]);

  // Filtered Cheques List
  const filteredFutureCheques = useMemo(() => {
    return futureCheques.filter(item => {
      const matchesStatus = statusFilter === 'all' || item.status === statusFilter;
      const q = (searchQuery || '').toLowerCase();
      const matchesQuery = !q ||
        (item.chequeNumber || '').toLowerCase().includes(q) ||
        (item.payee || '').toLowerCase().includes(q) ||
        (item.notes && item.notes.toLowerCase().includes(q));
      return matchesStatus && matchesQuery;
    }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [futureCheques, statusFilter, searchQuery]);

  const formattedAmount = cheque.amount ? parseFloat(cheque.amount).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }) : '';

  const getDateChars = () => {
    if (!cheque.date) return Array(8).fill('');
    const d = cheque.date.split('-');
    const day = (d[2] || '01').padStart(2, '0');
    const month = (d[1] || '01').padStart(2, '0');
    const year = d[0] || '2026';
    if (fullYearDate) {
      return [...day.split(''), ...month.split(''), ...year.split('')];
    }
    const yearLastTwo = year.slice(2);
    return [...day.split(''), ...month.split(''), '', '', ...yearLastTwo.split('')];
  };

  const dateChars = getDateChars();

  return (
    <div className="space-y-6">
      {/* Top Main Navigation Header */}
      <div className="bg-white p-4 rounded-3xl border border-slate-100 shadow-sm no-print flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter flex items-center gap-2">
            <span>🏷️</span> Cheque Management & Printing
          </h2>
          <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px] mt-0.5">
            Calibration: Y:{elementPositions.date.y}mm X:{elementPositions.date.x}mm Pitch:{datePitch}mm{dateGroupGap > 0 ? ` Gap:${dateGroupGap}mm` : ''}
          </p>
        </div>

        {/* Sub-Tab Selector Buttons */}
        <div className="flex items-center bg-slate-100 p-1.5 rounded-2xl gap-1 border border-slate-200/60">
          <button
            onClick={() => setActiveSubTab('terminal')}
            className={`px-5 py-2.5 rounded-xl font-black text-[11px] uppercase tracking-wider transition-all flex items-center gap-2 ${
              activeSubTab === 'terminal'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
            }`}
          >
            <span>🖨️</span> Cheque Printing Terminal
          </button>
          
          <button
            onClick={() => setActiveSubTab('future_release')}
            className={`px-5 py-2.5 rounded-xl font-black text-[11px] uppercase tracking-wider transition-all flex items-center gap-2 relative ${
              activeSubTab === 'future_release'
                ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/30'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
            }`}
          >
            <span>📅</span> Future Release Cheques
            {futurePendingList.length > 0 && (
              <span className={`ml-1 px-2 py-0.5 rounded-full text-[9px] font-black ${
                activeSubTab === 'future_release' ? 'bg-slate-950 text-amber-400' : 'bg-amber-500 text-slate-950'
              }`}>
                {futurePendingList.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ========================================================= */}
      {/* TAB 1: CHEQUE PRINTING TERMINAL                            */}
      {/* ========================================================= */}
      {activeSubTab === 'terminal' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 no-print bg-slate-900 text-white p-4 rounded-2xl shadow-lg border border-slate-800">
            <div>
              <h3 className="text-xs font-black uppercase tracking-wider flex items-center gap-2 text-indigo-400">
                <span>🖨️</span> Cheque Layout & Hardware Simulation
              </h3>
              <p className="text-[10px] text-slate-300 font-medium mt-0.5">
                Clean Print Setting: In your printer preview, set <strong>Margins: None</strong> & uncheck <strong>Headers & Footers</strong>. For BOC cheques, leave Century <strong>Blank (— —)</strong> to prevent double-print shadows.
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={() => toggleFullYearDate()}
                className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider border transition-all ${
                  !fullYearDate
                    ? 'bg-amber-400 text-slate-950 border-amber-300 shadow-md'
                    : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                }`}
                title="Toggle printing '20' century digits"
              >
                {!fullYearDate ? '✅ Century: BLANK (No Shadow)' : '⚠️ Century: WITH "20"'}
              </button>
              <button
                onClick={handlePrint}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-3 rounded-xl font-black text-xs uppercase tracking-widest shadow-xl shadow-indigo-600/30 transition-all active:scale-95 flex items-center gap-2"
              >
                <span>🖨️</span> Execute Print
              </button>
            </div>
          </div>

          <div className="max-w-7xl mx-auto grid grid-cols-1 xl:grid-cols-12 gap-8 items-start no-print">
            {/* Entry Panel */}
            <div className="xl:col-span-4 space-y-6">
              <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100 space-y-6">
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-50 pb-4">Transaction Details</h3>
                <div className="space-y-5">
                  <div>
                    <label className="block text-[9px] font-black text-slate-400 uppercase mb-2 tracking-widest">Payee Name</label>
                    <div className="relative">
                      <input
                        list="payee-suggestions"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 outline-none focus:border-indigo-500 text-sm font-bold text-slate-900 transition-all uppercase"
                        placeholder="SELECT OR TYPE PAYEE"
                        value={cheque.payee}
                        onChange={e => setCheque({ ...cheque, payee: e.target.value.toUpperCase() })}
                      />
                      <datalist id="payee-suggestions">
                        {uniquePayees.map((payee, idx) => (
                          <option key={idx} value={payee} />
                        ))}
                      </datalist>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[9px] font-black text-slate-400 uppercase mb-2 tracking-widest">Value (LKR)</label>
                      <input type="number" className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 outline-none focus:border-indigo-500 font-black text-sm text-indigo-600 transition-all" value={cheque.amount} onChange={e => handleAmountChange(e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-[9px] font-black text-slate-400 uppercase mb-2 tracking-widest">Issue Date</label>
                      <input className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 outline-none focus:border-indigo-500 text-sm font-bold text-slate-600 transition-all" type="date" value={cheque.date} onChange={e => setCheque({ ...cheque, date: e.target.value })} />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between items-center mb-1.5">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                        Date Year Century ("20")
                      </label>
                      <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-full ${fullYearDate ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'bg-slate-100 text-slate-600 border border-slate-200'}`}>
                        {fullYearDate ? 'WITH (YYYY)' : 'LEAVE BLANK'}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200/80">
                      <button
                        type="button"
                        onClick={() => toggleFullYearDate(true)}
                        className={`py-2 px-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 ${
                          fullYearDate
                            ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                            : 'text-slate-600 hover:text-slate-950 hover:bg-white/60'
                        }`}
                      >
                        <span>✓</span> With "20" (YYYY)
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleFullYearDate(false)}
                        className={`py-2 px-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 ${
                          !fullYearDate
                            ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                            : 'text-slate-600 hover:text-slate-950 hover:bg-white/60'
                        }`}
                      >
                        <span>✗</span> Leave Blank
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-[9px] font-black text-slate-400 uppercase mb-2 tracking-widest">Rupees In Words</label>
                    <textarea rows={2} className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 outline-none focus:border-indigo-500 text-xs font-bold text-slate-700 uppercase" value={cheque.amountInWords} onChange={e => setCheque({ ...cheque, amountInWords: e.target.value.toUpperCase() })} />
                  </div>
                </div>
              </div>

              <div className="bg-slate-900 p-8 rounded-[2rem] shadow-xl text-white space-y-6">
                <div className="flex justify-between items-center border-b border-white/5 pb-4">
                  <h3 className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.3em]">Hardware Calibration</h3>
                  <span className="bg-indigo-500/20 text-indigo-300 px-2 py-1 rounded text-[8px] font-bold tracking-wider border border-indigo-500/30">USER DEFAULT SETTING</span>
                </div>
                <div className="space-y-6">
                  <div className="space-y-3">
                    <div className="flex justify-between text-[9px] font-black uppercase tracking-widest">
                      <span className="text-slate-400">Vertical Offset (Y)</span>
                      <span className="text-indigo-400">{offsets.top} mm</span>
                    </div>
                    <input type="range" min="-150" max="150" value={offsets.top} onChange={e => updateOffsets({ ...offsets, top: parseInt(e.target.value) || 0 })} className="w-full accent-indigo-500" />
                  </div>
                  <div className="space-y-3">
                    <div className="flex justify-between text-[9px] font-black uppercase tracking-widest">
                      <span className="text-slate-400">Horizontal Offset (X)</span>
                      <span className="text-indigo-400">{offsets.left} mm</span>
                    </div>
                    <input type="range" min="-150" max="150" value={offsets.left} onChange={e => updateOffsets({ ...offsets, left: parseInt(e.target.value) || 0 })} className="w-full accent-indigo-500" />
                  </div>
                  <div className="space-y-3">
                    <div className="flex justify-between text-[9px] font-black uppercase tracking-widest">
                      <span className="text-slate-400">Date Char Pitch (Spacing)</span>
                      <span className="text-emerald-400">{offsets.pitch} mm</span>
                    </div>
                    <input type="range" min="1" max="15" step="0.1" value={offsets.pitch} onChange={e => updateOffsets({ ...offsets, pitch: parseFloat(e.target.value) || 0 })} className="w-full accent-emerald-500" />
                  </div>
                </div>
              </div>
            </div>

            {/* Live Simulation */}
            {/* Live Simulation & Interactive Positioning */}
            <div className="xl:col-span-8 space-y-6">
              {/* Alert Notification on Save */}
              {saveSuccessMsg && (
                <div className="p-4 bg-emerald-500 text-white rounded-2xl shadow-xl flex items-center justify-between animate-in fade-in slide-in-from-top-2 duration-300">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">✅</span>
                    <div>
                      <p className="text-xs font-black uppercase tracking-wider">Default Positions & Settings Saved!</p>
                      <p className="text-[11px] text-emerald-100 font-medium">All 4 elements (Date, Payee, Words, Amount) and date century options are saved as default.</p>
                    </div>
                  </div>
                  <button onClick={() => setSaveSuccessMsg(false)} className="text-emerald-200 hover:text-white font-bold text-sm">✕</button>
                </div>
              )}

              {/* Cheque Simulation Canvas Container */}
              <div className="flex flex-col items-center py-8 bg-slate-200/70 rounded-[3rem] border border-slate-300/80 shadow-inner relative overflow-hidden">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between w-full max-w-[760px] px-2 mb-3 gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-600 flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                      Interactive Cheque Canvas ({chequeDimensions.width}mm × {chequeDimensions.height}mm)
                    </span>
                    <span className="text-[9px] font-black uppercase text-indigo-600 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full">
                      Active: {activeElement.toUpperCase()}
                    </span>
                  </div>

                  {/* Cheque Size Quick Switcher */}
                  <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200 shadow-sm">
                    <span className="text-[8px] font-black uppercase text-slate-400 px-1">Leaf Size:</span>
                    <button
                      type="button"
                      onClick={() => updateChequeDimensions({ width: 180, height: 90 })}
                      className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all ${
                        chequeDimensions.width === 180 && chequeDimensions.height === 90
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      180 × 90 mm
                    </button>
                    <button
                      type="button"
                      onClick={() => updateChequeDimensions({ width: 210, height: 94 })}
                      className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all ${
                        chequeDimensions.width === 210 && chequeDimensions.height === 94
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      210 × 94 mm
                    </button>
                  </div>
                </div>

                {/* The Physical Cheque Simulation Canvas (Dynamic size matching Cheque Dimensions) */}
                <div
                  className="relative bg-[#fafafa] rounded-xl shadow-2xl border-2 border-slate-300/80 select-none overflow-hidden transition-all duration-200"
                  style={{
                    width: `${CANVAS_PX_WIDTH}px`,
                    height: `${canvasPxHeight}px`,
                    backgroundImage: 'radial-gradient(#cbd5e1 1.2px, transparent 1.2px)',
                    backgroundSize: '16px 16px'
                  }}
                >
                  {/* Subtle Bank Cheque Guidelines and Border */}
                  <div className="absolute inset-2 border border-slate-200/60 rounded pointer-events-none"></div>
                  
                  {/* Security Header & Instructions */}
                  <div className="absolute top-2 left-4 text-[9px] font-black uppercase text-slate-300 tracking-wider pointer-events-none">
                    CHEQUE TEMPLATE • {chequeDimensions.width}mm × {chequeDimensions.height}mm • 5 ADJUSTABLE ZONES
                  </div>

                  {/* 1. A/C PAYEE ONLY Crossing (Movable & Resizable) */}
                  {cheque.isAccountPayee && (
                    <div
                      onMouseDown={(e) => handleStartDrag('crossing', e.clientX, e.clientY)}
                      onTouchStart={(e) => { if (e.touches.length > 0) handleStartDrag('crossing', e.touches[0].clientX, e.touches[0].clientY); }}
                      className={`absolute cursor-move transition-shadow rounded-lg p-1.5 group z-20 select-none ${
                        activeElement === 'crossing'
                          ? 'ring-2 ring-indigo-500 bg-indigo-50/70 shadow-lg'
                          : 'hover:ring-2 hover:ring-indigo-300 hover:bg-white/80 border border-dashed border-indigo-300/80'
                      }`}
                      style={{
                        top: `${elementPositions.crossing.y * MM_TO_PX}px`,
                        left: `${elementPositions.crossing.x * MM_TO_PX}px`
                      }}
                    >
                      <div className="absolute -top-5 left-0 flex items-center gap-1 bg-indigo-600 text-white text-[8px] font-black px-1.5 py-0.5 rounded shadow pointer-events-none whitespace-nowrap">
                        <span>✥ A/C PAYEE</span>
                        <span className="opacity-80">({elementPositions.crossing.x}, {elementPositions.crossing.y}mm • {elementPositions.crossing.scale || 100}%)</span>
                      </div>

                      <div
                        style={{
                          transform: `scale(${(elementPositions.crossing.scale || 100) / 100}) rotate(${elementPositions.crossing.angle ?? -12}deg)`,
                          transformOrigin: 'center center'
                        }}
                        className="border-y-2 border-slate-800 px-3 py-0.5 text-xs font-black text-slate-800 tracking-wider whitespace-nowrap"
                      >
                        A/C PAYEE ONLY
                      </div>
                    </div>
                  )}

                  {/* 2. DATE BOXES (Movable) */}
                  <div
                    onMouseDown={(e) => handleStartDrag('date', e.clientX, e.clientY)}
                    onTouchStart={(e) => { if (e.touches.length > 0) handleStartDrag('date', e.touches[0].clientX, e.touches[0].clientY); }}
                    className={`absolute cursor-move transition-shadow rounded-lg p-1 group z-20 ${
                      activeElement === 'date'
                        ? 'ring-2 ring-indigo-500 bg-indigo-50/70 shadow-lg'
                        : 'hover:ring-2 hover:ring-indigo-300 hover:bg-white/80 border border-dashed border-indigo-300/80'
                    }`}
                    style={{
                      top: `${elementPositions.date.y * MM_TO_PX}px`,
                      left: `${elementPositions.date.x * MM_TO_PX}px`
                    }}
                  >
                    <div className="absolute -top-6 left-0 flex items-center gap-1.5 whitespace-nowrap z-30">
                      <div className="flex items-center gap-1 bg-indigo-600 text-white text-[8px] font-black px-1.5 py-0.5 rounded shadow pointer-events-none">
                        <span>✥ DATE</span>
                        <span className="opacity-80">({elementPositions.date.x}, {elementPositions.date.y}mm)</span>
                      </div>
                      <div className="flex items-center bg-white border border-slate-200 shadow-sm rounded px-1 gap-1" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => updateElementProp('date', 'fontSize', Math.max(6, (elementPositions.date.fontSize || 14) - 1))}
                          className="text-[9px] font-black text-slate-700 hover:text-indigo-600 px-1 py-0.5 rounded hover:bg-slate-100 transition-colors"
                          title="Decrease Date Font Size"
                        >
                          A-
                        </button>
                        <span className="text-[9px] font-black text-indigo-600 font-mono">
                          {elementPositions.date.fontSize || 14}pt
                        </span>
                        <button
                          type="button"
                          onClick={() => updateElementProp('date', 'fontSize', Math.min(26, (elementPositions.date.fontSize || 14) + 1))}
                          className="text-[9px] font-black text-slate-700 hover:text-indigo-600 px-1 py-0.5 rounded hover:bg-slate-100 transition-colors"
                          title="Increase Date Font Size"
                        >
                          A+
                        </button>
                      </div>

                      {/* Quick Pitch / Digit Gap Adjust */}
                      <div className="flex items-center bg-white border border-slate-200 shadow-sm rounded px-1 gap-1" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => updateDatePitch(datePitch - 0.2)}
                          className="text-[9px] font-black text-slate-700 hover:text-indigo-600 px-1 py-0.5 rounded hover:bg-slate-100 transition-colors"
                          title="Decrease Date Digit Gap / Pitch (-0.2mm)"
                        >
                          ↔ -
                        </button>
                        <span className="text-[9px] font-black text-indigo-600 font-mono" title="Date Digit Pitch (Gap)">
                          {datePitch}mm
                        </span>
                        <button
                          type="button"
                          onClick={() => updateDatePitch(datePitch + 0.2)}
                          className="text-[9px] font-black text-slate-700 hover:text-indigo-600 px-1 py-0.5 rounded hover:bg-slate-100 transition-colors"
                          title="Increase Date Digit Gap / Pitch (+0.2mm)"
                        >
                          ↔ +
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFullYearDate();
                        }}
                        className={`px-2 py-0.5 rounded text-[8px] font-black shadow transition-all cursor-pointer flex items-center gap-1 ${
                          fullYearDate
                            ? 'bg-amber-500 hover:bg-amber-600 text-slate-950 border border-amber-600/40'
                            : 'bg-slate-700 hover:bg-slate-800 text-white border border-slate-600'
                        }`}
                        title="Click to toggle between: With '20' (YYYY) vs Leave Blank"
                      >
                        <span>{fullYearDate ? '📅 WITH "20" (YYYY)' : '📅 LEAVE BLANK (— —)'}</span>
                        <span className="text-[7px] underline opacity-80">(Click to Switch)</span>
                      </button>
                    </div>

                    <div
                      className="flex font-mono font-bold text-slate-900"
                      style={{ fontSize: `${(elementPositions.date.fontSize || 14) * 1.25}px` }}
                    >
                      {dateChars.map((char, i) => {
                        const isCenturyBox = i >= 4 && i <= 5;
                        const isDayEnd = i === 1;
                        const isMonthEnd = i === 3;
                        const extraMarginRight = (isDayEnd || isMonthEnd) && dateGroupGap > 0
                          ? `${dateGroupGap * MM_TO_PX}px`
                          : undefined;

                        if (isCenturyBox) {
                          return (
                            <span
                              key={i}
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleFullYearDate();
                              }}
                              style={{
                                width: `${datePitch * MM_TO_PX}px`,
                                marginRight: extraMarginRight
                              }}
                              className={`h-9 flex items-center justify-center border-2 text-center font-black cursor-pointer transition-all ${
                                fullYearDate
                                  ? 'bg-amber-100/95 border-amber-500 text-amber-950 hover:bg-amber-200'
                                  : 'bg-amber-50/40 border-dashed border-amber-400 text-amber-600/50 hover:bg-amber-100/50 text-xs'
                              }`}
                              title={fullYearDate ? "Century Digits (20): Click to LEAVE BLANK" : "Century Slots Left Blank: Click to PRINT WITH 20"}
                            >
                              {fullYearDate ? (char === ' ' ? '\u00A0' : char) : '—'}
                            </span>
                          );
                        }
                        return (
                          <span
                            key={i}
                            style={{
                              width: `${datePitch * MM_TO_PX}px`,
                              marginRight: extraMarginRight
                            }}
                            className="h-9 flex items-center justify-center border text-center font-bold bg-white/95 border-slate-300 text-slate-900"
                          >
                            {char === ' ' ? '\u00A0' : char}
                          </span>
                        );
                      })}
                    </div>
                  </div>

                  {/* 3. PAYEE NAME (Movable & Resizable Font Size) */}
                  <div
                    onMouseDown={(e) => handleStartDrag('payee', e.clientX, e.clientY)}
                    onTouchStart={(e) => { if (e.touches.length > 0) handleStartDrag('payee', e.touches[0].clientX, e.touches[0].clientY); }}
                    className={`absolute cursor-move transition-shadow rounded-lg p-1.5 max-w-[550px] group z-20 ${
                      activeElement === 'payee'
                        ? 'ring-2 ring-indigo-500 bg-indigo-50/70 shadow-lg'
                        : 'hover:ring-2 hover:ring-indigo-300 hover:bg-white/80 border border-dashed border-indigo-300/80'
                    }`}
                    style={{
                      top: `${elementPositions.payee.y * MM_TO_PX}px`,
                      left: `${elementPositions.payee.x * MM_TO_PX}px`
                    }}
                  >
                    <div className="absolute -top-6 left-0 flex items-center gap-1.5 whitespace-nowrap z-30">
                      <div className="flex items-center gap-1 bg-indigo-600 text-white text-[8px] font-black px-1.5 py-0.5 rounded shadow pointer-events-none">
                        <span>✥ PAYEE</span>
                        <span className="opacity-80">({elementPositions.payee.x}, {elementPositions.payee.y}mm)</span>
                      </div>
                      <div className="flex items-center bg-white border border-slate-200 shadow-sm rounded px-1 gap-1" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => updateElementProp('payee', 'fontSize', Math.max(6, (elementPositions.payee.fontSize || 10) - 1))}
                          className="text-[9px] font-black text-slate-700 hover:text-indigo-600 px-1 py-0.5 rounded hover:bg-slate-100 transition-colors"
                          title="Decrease Payee Font Size"
                        >
                          A-
                        </button>
                        <span className="text-[9px] font-black text-indigo-600 font-mono">
                          {elementPositions.payee.fontSize || 10}pt
                        </span>
                        <button
                          type="button"
                          onClick={() => updateElementProp('payee', 'fontSize', Math.min(26, (elementPositions.payee.fontSize || 10) + 1))}
                          className="text-[9px] font-black text-slate-700 hover:text-indigo-600 px-1 py-0.5 rounded hover:bg-slate-100 transition-colors"
                          title="Increase Payee Font Size"
                        >
                          A+
                        </button>
                      </div>
                    </div>
                    <div
                      style={{ fontSize: `${(elementPositions.payee.fontSize || 10) * 1.25}px` }}
                      className="font-bold text-slate-950 uppercase tracking-tight truncate whitespace-nowrap"
                    >
                      {cheque.payee ? `**${cheque.payee}**` : <span className="text-slate-400 font-normal italic">**SAMPLE PAYEE NAME**</span>}
                    </div>
                  </div>

                  {/* 4. RUPEES IN WORDS (Movable & Resizable Font Size + Line Height + Width) */}
                  <div
                    onMouseDown={(e) => handleStartDrag('words', e.clientX, e.clientY)}
                    onTouchStart={(e) => { if (e.touches.length > 0) handleStartDrag('words', e.touches[0].clientX, e.touches[0].clientY); }}
                    className={`absolute cursor-move transition-shadow rounded-lg p-1.5 group z-20 ${
                      activeElement === 'words'
                        ? 'ring-2 ring-indigo-500 bg-indigo-50/70 shadow-lg'
                        : 'hover:ring-2 hover:ring-indigo-300 hover:bg-white/80 border border-dashed border-indigo-300/80'
                    }`}
                    style={{
                      top: `${elementPositions.words.y * MM_TO_PX}px`,
                      left: `${elementPositions.words.x * MM_TO_PX}px`,
                      width: `${(elementPositions.words.width || 95) * MM_TO_PX}px`
                    }}
                  >
                    <div className="absolute -top-6 left-0 flex items-center gap-1.5 whitespace-nowrap z-30">
                      <div className="flex items-center gap-1 bg-indigo-600 text-white text-[8px] font-black px-1.5 py-0.5 rounded shadow pointer-events-none">
                        <span>✥ AMOUNT IN WORDS</span>
                        <span className="opacity-80">({elementPositions.words.x}, {elementPositions.words.y}mm • W:{elementPositions.words.width || 95}mm)</span>
                      </div>
                      <div className="flex items-center bg-white border border-slate-200 shadow-sm rounded px-1 gap-1" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => updateElementProp('words', 'fontSize', Math.max(6, (elementPositions.words.fontSize || 10) - 1))}
                          className="text-[9px] font-black text-slate-700 hover:text-indigo-600 px-1 py-0.5 rounded hover:bg-slate-100 transition-colors"
                          title="Decrease Words Font Size"
                        >
                          A-
                        </button>
                        <span className="text-[9px] font-black text-indigo-600 font-mono">
                          {elementPositions.words.fontSize || 10}pt
                        </span>
                        <button
                          type="button"
                          onClick={() => updateElementProp('words', 'fontSize', Math.min(22, (elementPositions.words.fontSize || 10) + 1))}
                          className="text-[9px] font-black text-slate-700 hover:text-indigo-600 px-1 py-0.5 rounded hover:bg-slate-100 transition-colors"
                          title="Increase Words Font Size"
                        >
                          A+
                        </button>
                      </div>
                    </div>
                    <div
                      style={{
                        fontSize: `${(elementPositions.words.fontSize || 10) * 1.25}px`,
                        lineHeight: elementPositions.words.lineHeight || 1.5
                      }}
                      className="font-bold text-slate-900 uppercase tracking-tight break-words"
                    >
                      {cheque.amountInWords ? `**${cheque.amountInWords}**` : <span className="text-slate-400 font-normal italic">**SAMPLE RUPEES IN WORDS ONLY**</span>}
                    </div>
                  </div>

                  {/* 5. NUMERIC AMOUNT (Movable & Resizable Font Size) */}
                  <div
                    onMouseDown={(e) => handleStartDrag('amount', e.clientX, e.clientY)}
                    onTouchStart={(e) => { if (e.touches.length > 0) handleStartDrag('amount', e.touches[0].clientX, e.touches[0].clientY); }}
                    className={`absolute cursor-move transition-shadow rounded-lg p-1.5 group z-20 ${
                      activeElement === 'amount'
                        ? 'ring-2 ring-indigo-500 bg-indigo-50/70 shadow-lg'
                        : 'hover:ring-2 hover:ring-indigo-300 hover:bg-white/80 border border-dashed border-indigo-300/80'
                    }`}
                    style={{
                      top: `${elementPositions.amount.y * MM_TO_PX}px`,
                      left: `${elementPositions.amount.x * MM_TO_PX}px`
                    }}
                  >
                    <div className="absolute -top-6 left-0 flex items-center gap-1.5 whitespace-nowrap z-30">
                      <div className="flex items-center gap-1 bg-indigo-600 text-white text-[8px] font-black px-1.5 py-0.5 rounded shadow pointer-events-none">
                        <span>✥ NUMERIC AMOUNT</span>
                        <span className="opacity-80">({elementPositions.amount.x}, {elementPositions.amount.y}mm)</span>
                      </div>
                      <div className="flex items-center bg-white border border-slate-200 shadow-sm rounded px-1 gap-1" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => updateElementProp('amount', 'fontSize', Math.max(6, (elementPositions.amount.fontSize || 12) - 1))}
                          className="text-[9px] font-black text-slate-700 hover:text-indigo-600 px-1 py-0.5 rounded hover:bg-slate-100 transition-colors"
                          title="Decrease Amount Font Size"
                        >
                          A-
                        </button>
                        <span className="text-[9px] font-black text-indigo-600 font-mono">
                          {elementPositions.amount.fontSize || 12}pt
                        </span>
                        <button
                          type="button"
                          onClick={() => updateElementProp('amount', 'fontSize', Math.min(30, (elementPositions.amount.fontSize || 12) + 1))}
                          className="text-[9px] font-black text-slate-700 hover:text-indigo-600 px-1 py-0.5 rounded hover:bg-slate-100 transition-colors"
                          title="Increase Amount Font Size"
                        >
                          A+
                        </button>
                      </div>
                    </div>
                    <div
                      style={{ fontSize: `${(elementPositions.amount.fontSize || 12) * 1.3}px` }}
                      className="font-black text-slate-950 font-mono tracking-wider whitespace-nowrap"
                    >
                      {cheque.amount ? `**${formattedAmount}**` : <span className="text-slate-400 font-normal italic">**0.00**</span>}
                    </div>
                  </div>
                </div>

                <p className="mt-4 text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                  <span>💡 Tip:</span>
                  <span>Drag any of the 5 zones (including A/C Payee) directly with your mouse pointer or finger to position it.</span>
                </p>
              </div>

              {/* Dedicated Point Mover & Calibration Card */}
              <div className="bg-white p-7 rounded-[2rem] shadow-sm border border-slate-200/80 space-y-6">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 border-b border-slate-100 pb-4">
                  <div>
                    <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                      <span>🎯</span> Point Mover, Resizer & Cheque Calibration
                    </h3>
                    <p className="text-[10px] text-slate-400 font-semibold mt-0.5">
                      Adjust exact positions, resize A/C Payee line, change cheque dimensions, and save as default.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleSaveAllLocations}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl font-black text-[11px] uppercase tracking-wider shadow-lg shadow-emerald-600/30 transition-all flex items-center gap-1.5"
                    >
                      <span>💾</span> Save All Locations as Default
                    </button>
                    <button
                      onClick={handleResetPositions}
                      className="bg-slate-100 hover:bg-slate-200 text-slate-600 px-4 py-2.5 rounded-xl font-bold text-[10px] uppercase tracking-wider transition-all"
                      title="Reset to 180mm x 90mm factory standard locations"
                    >
                      ↺ Reset
                    </button>
                  </div>
                </div>

                {/* Element Selector Tabs (5 Tabs including Crossing) */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {(
                    [
                      { key: 'crossing', label: '🛡️ A/C Payee', info: `${elementPositions.crossing.scale || 95}%` },
                      { key: 'date', label: '📅 Date Line', info: `${elementPositions.date.fontSize || 14}pt • ${fullYearDate ? 'YYYY' : 'Blank'}` },
                      { key: 'payee', label: '👤 Payee Name', info: `${elementPositions.payee.fontSize || 10}pt` },
                      { key: 'words', label: '✍️ Words Line', info: `${elementPositions.words.fontSize || 10}pt` },
                      { key: 'amount', label: '💵 Numeric Amount', info: `${elementPositions.amount.fontSize || 12}pt` },
                    ] as const
                  ).map(item => (
                    <button
                      key={item.key}
                      onClick={() => setActiveElement(item.key)}
                      className={`p-3 rounded-2xl border text-left transition-all ${
                        activeElement === item.key
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-600/20'
                          : 'bg-slate-50 border-slate-200/80 text-slate-700 hover:bg-slate-100/80'
                      }`}
                    >
                      <div className="text-[11px] font-black uppercase tracking-tight truncate">{item.label}</div>
                      <div className={`text-[10px] font-mono mt-0.5 ${activeElement === item.key ? 'text-indigo-200' : 'text-slate-400'}`}>
                        X:{elementPositions[item.key].x} Y:{elementPositions[item.key].y}mm • {item.info}
                      </div>
                    </button>
                  ))}
                </div>

                {/* Point Controls Grid for Selected Area */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-2">
                  {/* Column 1: Directional Point Nudge Pad */}
                  <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200/80 flex flex-col items-center justify-center space-y-4">
                    <div className="flex justify-between items-center w-full">
                      <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">Directional Nudge Pad</span>
                      {/* Step Size Selector */}
                      <div className="flex items-center gap-1 bg-white p-1 rounded-lg border border-slate-200">
                        {([0.2, 0.5, 1.0, 2.0] as const).map(step => (
                          <button
                            key={step}
                            onClick={() => setNudgeStep(step)}
                            className={`px-1.5 py-0.5 rounded text-[8px] font-black transition-all ${
                              nudgeStep === step ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'
                            }`}
                          >
                            {step}mm
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* D-Pad Buttons */}
                    <div className="flex flex-col items-center gap-2">
                      <button
                        onClick={() => nudgeElement(activeElement, 0, -nudgeStep)}
                        className="w-12 h-10 bg-white hover:bg-indigo-50 border-2 border-slate-300 hover:border-indigo-400 active:bg-indigo-100 text-slate-800 rounded-xl font-black text-sm flex items-center justify-center shadow-sm transition-all"
                        title={`Nudge Up by ${nudgeStep}mm`}
                      >
                        ▲
                      </button>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => nudgeElement(activeElement, -nudgeStep, 0)}
                          className="w-12 h-10 bg-white hover:bg-indigo-50 border-2 border-slate-300 hover:border-indigo-400 active:bg-indigo-100 text-slate-800 rounded-xl font-black text-sm flex items-center justify-center shadow-sm transition-all"
                          title={`Nudge Left by ${nudgeStep}mm`}
                        >
                          ◀
                        </button>
                        <div className="w-12 h-10 bg-indigo-50 border border-indigo-200 text-indigo-700 font-black text-[9px] uppercase rounded-xl flex items-center justify-center text-center truncate px-1">
                          {activeElement}
                        </div>
                        <button
                          onClick={() => nudgeElement(activeElement, nudgeStep, 0)}
                          className="w-12 h-10 bg-white hover:bg-indigo-50 border-2 border-slate-300 hover:border-indigo-400 active:bg-indigo-100 text-slate-800 rounded-xl font-black text-sm flex items-center justify-center shadow-sm transition-all"
                          title={`Nudge Right by ${nudgeStep}mm`}
                        >
                          ▶
                        </button>
                      </div>
                      <button
                        onClick={() => nudgeElement(activeElement, 0, nudgeStep)}
                        className="w-12 h-10 bg-white hover:bg-indigo-50 border-2 border-slate-300 hover:border-indigo-400 active:bg-indigo-100 text-slate-800 rounded-xl font-black text-sm flex items-center justify-center shadow-sm transition-all"
                        title={`Nudge Down by ${nudgeStep}mm`}
                      >
                        ▼
                      </button>
                    </div>
                    <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Step: ±{nudgeStep} mm per click</span>
                  </div>

                  {/* Column 2: Exact Millimeter Coordinate Inputs */}
                  <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200/80 space-y-4">
                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 block">
                      Coordinates ({activeElement.toUpperCase()})
                    </span>

                    <div className="space-y-3">
                      <div>
                        <div className="flex justify-between items-center text-[10px] font-bold text-slate-600 mb-1">
                          <span>Horizontal (X mm from Left):</span>
                          <span className="font-mono text-indigo-600 font-black">{elementPositions[activeElement].x} mm</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="range"
                            min="0"
                            max={chequeDimensions.width || 180}
                            step="0.5"
                            value={elementPositions[activeElement].x}
                            onChange={(e) => updateElementPos(activeElement, { x: parseFloat(e.target.value) || 0, y: elementPositions[activeElement].y })}
                            className="w-full accent-indigo-600"
                          />
                          <input
                            type="number"
                            step="0.5"
                            value={elementPositions[activeElement].x}
                            onChange={(e) => updateElementPos(activeElement, { x: parseFloat(e.target.value) || 0, y: elementPositions[activeElement].y })}
                            className="w-16 bg-white border border-slate-200 rounded-lg p-1.5 text-center font-mono font-bold text-xs"
                          />
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between items-center text-[10px] font-bold text-slate-600 mb-1">
                          <span>Vertical (Y mm from Top):</span>
                          <span className="font-mono text-indigo-600 font-black">{elementPositions[activeElement].y} mm</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="range"
                            min="0"
                            max={chequeDimensions.height || 90}
                            step="0.5"
                            value={elementPositions[activeElement].y}
                            onChange={(e) => updateElementPos(activeElement, { x: elementPositions[activeElement].x, y: parseFloat(e.target.value) || 0 })}
                            className="w-full accent-indigo-600"
                          />
                          <input
                            type="number"
                            step="0.5"
                            value={elementPositions[activeElement].y}
                            onChange={(e) => updateElementPos(activeElement, { x: elementPositions[activeElement].x, y: parseFloat(e.target.value) || 0 })}
                            className="w-16 bg-white border border-slate-200 rounded-lg p-1.5 text-center font-mono font-bold text-xs"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Column 3: Specific Context Controls (Crossing Resize, Words Width, Date Mode) */}
                  <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200/80 flex flex-col justify-between space-y-4">
                    {/* If Active Element is A/C Payee Only */}
                    {activeElement === 'crossing' && (
                      <div className="space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">
                            A/C Payee Resize & Angle
                          </span>
                          <label className="flex items-center gap-1.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={cheque.isAccountPayee}
                              onChange={(e) => setCheque({ ...cheque, isAccountPayee: e.target.checked })}
                              className="accent-indigo-600 rounded"
                            />
                            <span className="text-[9px] font-black uppercase text-indigo-700">Enabled</span>
                          </label>
                        </div>

                        <div>
                          <div className="flex justify-between items-center text-[10px] font-bold text-slate-600 mb-1">
                            <span>Size / Scale:</span>
                            <span className="font-mono text-indigo-600 font-black">{elementPositions.crossing.scale || 95}%</span>
                          </div>
                          <input
                            type="range"
                            min="50"
                            max="160"
                            step="5"
                            value={elementPositions.crossing.scale || 95}
                            onChange={(e) => updateCrossingProp('scale', parseInt(e.target.value) || 95)}
                            className="w-full accent-indigo-600"
                          />
                        </div>

                        <div>
                          <div className="flex justify-between items-center text-[10px] font-bold text-slate-600 mb-1">
                            <span>Rotation Angle:</span>
                            <span className="font-mono text-indigo-600 font-black">{elementPositions.crossing.angle ?? -12}°</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              type="range"
                              min="-45"
                              max="20"
                              step="1"
                              value={elementPositions.crossing.angle ?? -12}
                              onChange={(e) => updateCrossingProp('angle', parseInt(e.target.value) || 0)}
                              className="w-full accent-indigo-600"
                            />
                          </div>
                          <div className="flex gap-1 mt-1.5">
                            {[-15, -12, -6, 0].map(deg => (
                              <button
                                key={deg}
                                type="button"
                                onClick={() => updateCrossingProp('angle', deg)}
                                className={`flex-1 py-1 rounded text-[8px] font-black ${
                                  elementPositions.crossing.angle === deg ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                                }`}
                              >
                                {deg}°
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* If Active Element is Words */}
                    {activeElement === 'words' && (
                      <div className="space-y-4">
                        <div>
                          <div className="flex justify-between items-center text-[10px] font-bold text-slate-600 mb-1">
                            <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">Words Font Size:</span>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => updateElementProp('words', 'fontSize', Math.max(6, (elementPositions.words.fontSize || 10) - 1))}
                                className="w-6 h-6 bg-white border border-slate-200 rounded font-bold text-xs hover:bg-slate-100 flex items-center justify-center text-slate-700"
                              >
                                -
                              </button>
                              <span className="font-mono text-indigo-600 font-black text-xs w-8 text-center">{elementPositions.words.fontSize || 10}pt</span>
                              <button
                                type="button"
                                onClick={() => updateElementProp('words', 'fontSize', Math.min(22, (elementPositions.words.fontSize || 10) + 1))}
                                className="w-6 h-6 bg-white border border-slate-200 rounded font-bold text-xs hover:bg-slate-100 flex items-center justify-center text-slate-700"
                              >
                                +
                              </button>
                            </div>
                          </div>
                          <input
                            type="range"
                            min="6"
                            max="22"
                            step="1"
                            value={elementPositions.words.fontSize || 10}
                            onChange={(e) => updateElementProp('words', 'fontSize', parseInt(e.target.value) || 10)}
                            className="w-full accent-indigo-600"
                          />
                          <div className="flex gap-1 mt-1.5">
                            {[
                              { label: '6pt', pt: 6 },
                              { label: '8pt', pt: 8 },
                              { label: '10pt', pt: 10 },
                              { label: '12pt', pt: 12 },
                              { label: '13pt', pt: 13 },
                              { label: '15pt', pt: 15 },
                              { label: '18pt', pt: 18 }
                            ].map(preset => (
                              <button
                                key={preset.pt}
                                type="button"
                                onClick={() => updateElementProp('words', 'fontSize', preset.pt)}
                                className={`flex-1 py-1 rounded text-[8px] font-black transition-all ${
                                  (elementPositions.words.fontSize || 10) === preset.pt
                                    ? 'bg-indigo-600 text-white'
                                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                                }`}
                              >
                                {preset.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div>
                          <div className="flex justify-between items-center text-[10px] font-bold text-slate-600 mb-1">
                            <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">Line Spacing / Height:</span>
                            <span className="font-mono text-indigo-600 font-black text-xs">{elementPositions.words.lineHeight || 1.5}x</span>
                          </div>
                          <input
                            type="range"
                            min="1.1"
                            max="2.2"
                            step="0.1"
                            value={elementPositions.words.lineHeight || 1.5}
                            onChange={(e) => updateElementProp('words', 'lineHeight', parseFloat(e.target.value) || 1.5)}
                            className="w-full accent-indigo-600"
                          />
                          <div className="flex gap-1 mt-1.5">
                            {[
                              { label: 'Tight', lh: 1.2 },
                              { label: 'Normal', lh: 1.4 },
                              { label: 'Relaxed', lh: 1.6 },
                              { label: 'Wide', lh: 1.8 }
                            ].map(preset => (
                              <button
                                key={preset.lh}
                                type="button"
                                onClick={() => updateElementProp('words', 'lineHeight', preset.lh)}
                                className={`flex-1 py-1 rounded text-[8px] font-black transition-all ${
                                  (elementPositions.words.lineHeight || 1.5) === preset.lh
                                    ? 'bg-indigo-600 text-white'
                                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                                }`}
                              >
                                {preset.lh}x
                              </button>
                            ))}
                          </div>
                        </div>

                        <div>
                          <div className="flex justify-between items-center text-[10px] font-bold text-slate-600 mb-1">
                            <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">Words Layout Width (mm):</span>
                            <span className="font-mono text-indigo-600 font-black text-xs">{elementPositions.words.width || 95} mm</span>
                          </div>
                          <input
                            type="range"
                            min="60"
                            max="140"
                            step="1"
                            value={elementPositions.words.width || 95}
                            onChange={(e) => updateWordsWidth(parseInt(e.target.value) || 95)}
                            className="w-full accent-indigo-600"
                          />
                        </div>
                      </div>
                    )}

                    {/* If Active Element is Date */}
                    {activeElement === 'date' && (
                      <div className="space-y-4">
                        <div>
                          <div className="flex justify-between items-center text-[10px] font-bold text-slate-600 mb-1">
                            <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">Date Font Size:</span>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => updateElementProp('date', 'fontSize', Math.max(6, (elementPositions.date.fontSize || 14) - 1))}
                                className="w-6 h-6 bg-white border border-slate-200 rounded font-bold text-xs hover:bg-slate-100 flex items-center justify-center text-slate-700"
                              >
                                -
                              </button>
                              <span className="font-mono text-indigo-600 font-black text-xs w-8 text-center">{elementPositions.date.fontSize || 14}pt</span>
                              <button
                                type="button"
                                onClick={() => updateElementProp('date', 'fontSize', Math.min(26, (elementPositions.date.fontSize || 14) + 1))}
                                className="w-6 h-6 bg-white border border-slate-200 rounded font-bold text-xs hover:bg-slate-100 flex items-center justify-center text-slate-700"
                              >
                                +
                              </button>
                            </div>
                          </div>
                          <input
                            type="range"
                            min="6"
                            max="26"
                            step="1"
                            value={elementPositions.date.fontSize || 14}
                            onChange={(e) => updateElementProp('date', 'fontSize', parseInt(e.target.value) || 14)}
                            className="w-full accent-indigo-600"
                          />
                          <div className="flex gap-1 mt-1.5">
                            {[
                              { label: '6pt', pt: 6 },
                              { label: '8pt', pt: 8 },
                              { label: '10pt', pt: 10 },
                              { label: '12pt', pt: 12 },
                              { label: '14pt', pt: 14 },
                              { label: '18pt', pt: 18 },
                              { label: '22pt', pt: 22 }
                            ].map(preset => (
                              <button
                                key={preset.pt}
                                type="button"
                                onClick={() => updateElementProp('date', 'fontSize', preset.pt)}
                                className={`flex-1 py-1 rounded text-[8px] font-black transition-all ${
                                  (elementPositions.date.fontSize || 14) === preset.pt
                                    ? 'bg-indigo-600 text-white'
                                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                                }`}
                              >
                                {preset.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="border-t border-slate-200/80 pt-3 space-y-2">
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">
                              Century "20" Setting
                            </span>
                            <span className={`text-[8px] font-black px-1.5 py-0.5 rounded ${fullYearDate ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'bg-slate-200 text-slate-700'}`}>
                              {fullYearDate ? 'WITH (YYYY)' : 'LEAVE BLANK'}
                            </span>
                          </div>
                          <div
                            onClick={() => toggleFullYearDate(true)}
                            className={`flex items-start gap-2 p-2.5 rounded-xl border cursor-pointer transition-all ${
                              fullYearDate ? 'bg-amber-50 border-amber-400' : 'bg-white border-slate-200/80 hover:bg-slate-50'
                            }`}
                          >
                            <input type="radio" name="dateModeCard" checked={fullYearDate} onChange={() => toggleFullYearDate(true)} className="mt-0.5 accent-amber-500" />
                            <div>
                              <span className="text-[11px] font-black text-slate-900 block">With "20" (Full 8 Digits)</span>
                              <span className="text-[9px] text-slate-500 block">Prints all 4 year digits (1 1 1 0 2 0 2 6)</span>
                            </div>
                          </div>
                          <div
                            onClick={() => toggleFullYearDate(false)}
                            className={`flex items-start gap-2 p-2.5 rounded-xl border cursor-pointer transition-all ${
                              !fullYearDate ? 'bg-indigo-50 border-indigo-400' : 'bg-white border-slate-200/80 hover:bg-slate-50'
                            }`}
                          >
                            <input type="radio" name="dateModeCard" checked={!fullYearDate} onChange={() => toggleFullYearDate(false)} className="mt-0.5 accent-indigo-500" />
                            <div>
                              <span className="text-[11px] font-black text-slate-900 block">Leave Blank (Pre-Printed '20')</span>
                              <span className="text-[9px] text-slate-500 block">Leaves the 2 boxes empty (1 1 1 0 — — 2 6)</span>
                            </div>
                          </div>
                        </div>

                        {/* Date Digit Pitch / Box Gap Control */}
                        <div className="border-t border-slate-200/80 pt-3 space-y-2">
                          <div className="flex justify-between items-center text-[10px] font-bold text-slate-600 mb-1">
                            <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">Date Digit Gap / Pitch:</span>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => updateDatePitch(datePitch - 0.1)}
                                className="w-6 h-6 bg-white border border-slate-200 rounded font-bold text-xs hover:bg-slate-100 flex items-center justify-center text-slate-700"
                                title="Decrease Pitch / Gap (-0.1mm)"
                              >
                                -
                              </button>
                              <span className="font-mono text-indigo-600 font-black text-xs w-14 text-center">{datePitch} mm</span>
                              <button
                                type="button"
                                onClick={() => updateDatePitch(datePitch + 0.1)}
                                className="w-6 h-6 bg-white border border-slate-200 rounded font-bold text-xs hover:bg-slate-100 flex items-center justify-center text-slate-700"
                                title="Increase Pitch / Gap (+0.1mm)"
                              >
                                +
                              </button>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              type="range"
                              min="4"
                              max="15"
                              step="0.1"
                              value={datePitch}
                              onChange={(e) => updateDatePitch(parseFloat(e.target.value) || 7.4)}
                              className="w-full accent-indigo-600"
                            />
                            <input
                              type="number"
                              step="0.1"
                              min="4"
                              max="15"
                              value={datePitch}
                              onChange={(e) => updateDatePitch(parseFloat(e.target.value) || 7.4)}
                              className="w-16 bg-white border border-slate-200 rounded-lg p-1.5 text-center font-mono font-bold text-xs"
                            />
                          </div>
                          <div className="flex gap-1 mt-1.5 flex-wrap">
                            {[
                              { label: '6.0mm', mm: 6.0 },
                              { label: '6.5mm', mm: 6.5 },
                              { label: '7.0mm', mm: 7.0 },
                              { label: '7.4mm (Std)', mm: 7.4 },
                              { label: '8.0mm', mm: 8.0 },
                              { label: '8.5mm', mm: 8.5 },
                              { label: '9.0mm', mm: 9.0 }
                            ].map(preset => (
                              <button
                                key={preset.mm}
                                type="button"
                                onClick={() => updateDatePitch(preset.mm)}
                                className={`flex-1 min-w-[46px] py-1 rounded text-[8px] font-black transition-all ${
                                  datePitch === preset.mm
                                    ? 'bg-indigo-600 text-white'
                                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                                }`}
                              >
                                {preset.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Extra Gap Between DD - MM - YYYY Groups */}
                        <div className="border-t border-slate-200/80 pt-3 space-y-2">
                          <div className="flex justify-between items-center text-[10px] font-bold text-slate-600 mb-1">
                            <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">Group Gap (DD | MM | YYYY):</span>
                            <span className="font-mono text-indigo-600 font-black text-xs">{dateGroupGap} mm</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              type="range"
                              min="0"
                              max="10"
                              step="0.5"
                              value={dateGroupGap}
                              onChange={(e) => updateDateGroupGap(parseFloat(e.target.value) || 0)}
                              className="w-full accent-indigo-600"
                            />
                            <input
                              type="number"
                              step="0.5"
                              min="0"
                              max="10"
                              value={dateGroupGap}
                              onChange={(e) => updateDateGroupGap(parseFloat(e.target.value) || 0)}
                              className="w-16 bg-white border border-slate-200 rounded-lg p-1.5 text-center font-mono font-bold text-xs"
                            />
                          </div>
                          <div className="flex gap-1 mt-1.5 flex-wrap">
                            {[
                              { label: 'None (0mm)', mm: 0 },
                              { label: '1.5mm', mm: 1.5 },
                              { label: '2.5mm', mm: 2.5 },
                              { label: '3.5mm', mm: 3.5 },
                              { label: '5.0mm', mm: 5.0 }
                            ].map(preset => (
                              <button
                                key={preset.mm}
                                type="button"
                                onClick={() => updateDateGroupGap(preset.mm)}
                                className={`flex-1 min-w-[50px] py-1 rounded text-[8px] font-black transition-all ${
                                  dateGroupGap === preset.mm
                                    ? 'bg-indigo-600 text-white'
                                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                                }`}
                              >
                                {preset.label}
                              </button>
                            ))}
                          </div>
                          <span className="text-[8px] text-slate-400 block">Separates Day, Month, and Year clusters for cheques with grouped boxes.</span>
                        </div>
                      </div>
                    )}

                    {/* If Active Element is Payee */}
                    {activeElement === 'payee' && (
                      <div className="space-y-4">
                        <div>
                          <div className="flex justify-between items-center text-[10px] font-bold text-slate-600 mb-1">
                            <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">Payee Text Size:</span>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => updateElementProp('payee', 'fontSize', Math.max(6, (elementPositions.payee.fontSize || 10) - 1))}
                                className="w-6 h-6 bg-white border border-slate-200 rounded font-bold text-xs hover:bg-slate-100 flex items-center justify-center text-slate-700"
                              >
                                -
                              </button>
                              <span className="font-mono text-indigo-600 font-black text-xs w-8 text-center">{elementPositions.payee.fontSize || 10}pt</span>
                              <button
                                type="button"
                                onClick={() => updateElementProp('payee', 'fontSize', Math.min(26, (elementPositions.payee.fontSize || 10) + 1))}
                                className="w-6 h-6 bg-white border border-slate-200 rounded font-bold text-xs hover:bg-slate-100 flex items-center justify-center text-slate-700"
                              >
                                +
                              </button>
                            </div>
                          </div>
                          <input
                            type="range"
                            min="6"
                            max="26"
                            step="1"
                            value={elementPositions.payee.fontSize || 10}
                            onChange={(e) => updateElementProp('payee', 'fontSize', parseInt(e.target.value) || 10)}
                            className="w-full accent-indigo-600"
                          />
                          <div className="flex gap-1 mt-1.5">
                            {[
                              { label: '6pt', pt: 6 },
                              { label: '8pt', pt: 8 },
                              { label: '10pt', pt: 10 },
                              { label: '12pt', pt: 12 },
                              { label: '14pt', pt: 14 },
                              { label: '16pt', pt: 16 },
                              { label: '20pt', pt: 20 }
                            ].map(preset => (
                              <button
                                key={preset.pt}
                                type="button"
                                onClick={() => updateElementProp('payee', 'fontSize', preset.pt)}
                                className={`flex-1 py-1 rounded text-[8px] font-black transition-all ${
                                  (elementPositions.payee.fontSize || 10) === preset.pt
                                    ? 'bg-indigo-600 text-white'
                                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                                }`}
                              >
                                {preset.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="border-t border-slate-200/80 pt-3">
                          <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 block mb-2">
                            Cheque Paper Dimensions
                          </span>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => updateChequeDimensions({ width: 180, height: 90 })}
                              className={`p-2 rounded-xl border text-left transition-all ${
                                chequeDimensions.width === 180 && chequeDimensions.height === 90
                                  ? 'bg-indigo-600 text-white border-indigo-600'
                                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                              }`}
                            >
                              <span className="text-[9px] font-black uppercase block">180 × 90 mm</span>
                              <span className="text-[8px] opacity-75 block">Standard Cheque</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => updateChequeDimensions({ width: 210, height: 94 })}
                              className={`p-2 rounded-xl border text-left transition-all ${
                                chequeDimensions.width === 210 && chequeDimensions.height === 94
                                  ? 'bg-indigo-600 text-white border-indigo-600'
                                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                              }`}
                            >
                              <span className="text-[9px] font-black uppercase block">210 × 94 mm</span>
                              <span className="text-[8px] opacity-75 block">Wide Cheque</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* If Active Element is Numeric Amount */}
                    {activeElement === 'amount' && (
                      <div className="space-y-4">
                        <div>
                          <div className="flex justify-between items-center text-[10px] font-bold text-slate-600 mb-1">
                            <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">Numeric Amount Size:</span>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => updateElementProp('amount', 'fontSize', Math.max(6, (elementPositions.amount.fontSize || 12) - 1))}
                                className="w-6 h-6 bg-white border border-slate-200 rounded font-bold text-xs hover:bg-slate-100 flex items-center justify-center text-slate-700"
                              >
                                -
                              </button>
                              <span className="font-mono text-indigo-600 font-black text-xs w-8 text-center">{elementPositions.amount.fontSize || 12}pt</span>
                              <button
                                type="button"
                                onClick={() => updateElementProp('amount', 'fontSize', Math.min(30, (elementPositions.amount.fontSize || 12) + 1))}
                                className="w-6 h-6 bg-white border border-slate-200 rounded font-bold text-xs hover:bg-slate-100 flex items-center justify-center text-slate-700"
                              >
                                +
                              </button>
                            </div>
                          </div>
                          <input
                            type="range"
                            min="6"
                            max="30"
                            step="1"
                            value={elementPositions.amount.fontSize || 12}
                            onChange={(e) => updateElementProp('amount', 'fontSize', parseInt(e.target.value) || 12)}
                            className="w-full accent-indigo-600"
                          />
                          <div className="flex gap-1 mt-1.5">
                            {[
                              { label: '6pt', pt: 6 },
                              { label: '8pt', pt: 8 },
                              { label: '10pt', pt: 10 },
                              { label: '12pt', pt: 12 },
                              { label: '16pt', pt: 16 },
                              { label: '20pt', pt: 20 },
                              { label: '24pt', pt: 24 }
                            ].map(preset => (
                              <button
                                key={preset.pt}
                                type="button"
                                onClick={() => updateElementProp('amount', 'fontSize', preset.pt)}
                                className={`flex-1 py-1 rounded text-[8px] font-black transition-all ${
                                  (elementPositions.amount.fontSize || 12) === preset.pt
                                    ? 'bg-indigo-600 text-white'
                                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                                }`}
                              >
                                {preset.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="border-t border-slate-200/80 pt-3">
                          <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 block mb-2">
                            Cheque Paper Dimensions
                          </span>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => updateChequeDimensions({ width: 180, height: 90 })}
                              className={`p-2 rounded-xl border text-left transition-all ${
                                chequeDimensions.width === 180 && chequeDimensions.height === 90
                                  ? 'bg-indigo-600 text-white border-indigo-600'
                                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                              }`}
                            >
                              <span className="text-[9px] font-black uppercase block">180 × 90 mm</span>
                              <span className="text-[8px] opacity-75 block">Standard Cheque</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => updateChequeDimensions({ width: 210, height: 94 })}
                              className={`p-2 rounded-xl border text-left transition-all ${
                                chequeDimensions.width === 210 && chequeDimensions.height === 94
                                  ? 'bg-indigo-600 text-white border-indigo-600'
                                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                              }`}
                            >
                              <span className="text-[9px] font-black uppercase block">210 × 94 mm</span>
                              <span className="text-[8px] opacity-75 block">Wide Cheque</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    <button
                      onClick={handleSaveAllLocations}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white py-3 rounded-xl font-black text-xs uppercase tracking-wider shadow-md shadow-emerald-600/30 transition-all flex items-center justify-center gap-2"
                    >
                      <span>💾</span> Save All Coordinates as Default
                    </button>
                  </div>
                </div>
              </div>

              {/* Print History Section */}
              {printHistory.length > 0 && (
                <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100 space-y-6">
                  <div className="flex justify-between items-center border-b border-slate-50 pb-4">
                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Printed History</h3>
                    <span className="text-[9px] font-bold text-slate-400">{printHistory.length} RECORDS</span>
                  </div>
                  <div className="max-h-[400px] overflow-y-auto space-y-3 pr-2 custom-scrollbar">
                    {printHistory.map((item) => (
                      <div key={item.id} className="group flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100 hover:border-indigo-100 hover:shadow-md transition-all">
                        <div className="space-y-1">
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-black text-slate-800 uppercase">{item.payee}</span>
                            <span className="text-[9px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">{item.date}</span>
                          </div>
                          <div className="text-[10px] font-medium text-slate-500 font-mono">
                            LKR {parseFloat(item.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </div>
                        </div>
                        <div className="flex gap-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => handleReprint(item)}
                            className="p-2 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-colors"
                            title="Reprint / Edit"
                          >
                            ♻️
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 2: FUTURE RELEASE CHEQUES TAB                         */}
      {/* ========================================================= */}
      {activeSubTab === 'future_release' && (
        <div className="space-y-6 no-print animate-in fade-in duration-300">
          {/* KPI Analytics Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-gradient-to-br from-amber-500 to-amber-600 p-6 rounded-3xl text-slate-950 shadow-xl shadow-amber-500/10 relative overflow-hidden">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-950/70">Future Release Value</p>
                  <h4 className="text-2xl font-black mt-1 tracking-tight">
                    LKR {totalFuturePendingAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </h4>
                </div>
                <div className="w-10 h-10 rounded-2xl bg-slate-950/10 flex items-center justify-center text-lg">⏳</div>
              </div>
              <p className="text-[11px] font-bold mt-4 text-slate-950/80">{futurePendingList.length} Pending Cheques Scheduled</p>
            </div>

            <div className="bg-gradient-to-br from-emerald-600 to-teal-700 p-6 rounded-3xl text-white shadow-xl shadow-emerald-600/10 relative overflow-hidden">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-emerald-200">Total Cleared Value</p>
                  <h4 className="text-2xl font-black mt-1 tracking-tight">
                    LKR {totalClearedAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </h4>
                </div>
                <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center text-lg">✅</div>
              </div>
              <p className="text-[11px] font-medium mt-4 text-emerald-100">{clearedList.length} Cheques Marked as Cleared</p>
            </div>

            <div className="bg-slate-900 p-6 rounded-3xl text-white shadow-xl shadow-slate-900/10 relative overflow-hidden">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-indigo-400">Total Managed Value</p>
                  <h4 className="text-2xl font-black mt-1 tracking-tight">
                    LKR {(totalFuturePendingAmount + totalClearedAmount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </h4>
                </div>
                <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 flex items-center justify-center text-lg text-indigo-300">📊</div>
              </div>
              <p className="text-[11px] font-medium mt-4 text-slate-400">{futureCheques.length} Total Cheque Records</p>
            </div>

            <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm relative overflow-hidden">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Next Due Release</p>
                  {nextReleaseCheque ? (
                    <>
                      <h4 className="text-lg font-black mt-1 text-slate-900 font-mono">
                        #{nextReleaseCheque.chequeNumber} ({nextReleaseCheque.date})
                      </h4>
                      <p className="text-xs font-bold text-amber-600 mt-0.5">
                        LKR {nextReleaseCheque.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </p>
                    </>
                  ) : (
                    <h4 className="text-sm font-bold text-slate-400 mt-2">No Pending Cheques</h4>
                  )}
                </div>
                <div className="w-10 h-10 rounded-2xl bg-amber-50 flex items-center justify-center text-lg text-amber-600">🔔</div>
              </div>
              <p className="text-[10px] font-bold text-slate-400 mt-4 uppercase tracking-wider">
                {nextReleaseCheque && nextReleaseCheque.payee && !nextReleaseCheque.payee.startsWith('PAYEE -') ? nextReleaseCheque.payee : 'Click table to set payee'}
              </p>
            </div>
          </div>

          {/* Filter & Action Controls Bar */}
          <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4">
            {/* Status Filter Buttons */}
            <div className="flex items-center bg-slate-100 p-1 rounded-2xl gap-1 border border-slate-200/50">
              <button
                onClick={() => setStatusFilter('all')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                  statusFilter === 'all' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                All Cheques ({futureCheques.length})
              </button>
              <button
                onClick={() => setStatusFilter('future_release')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                  statusFilter === 'future_release' ? 'bg-amber-500 text-slate-950 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                ⏳ Future Release ({futurePendingList.length})
              </button>
              <button
                onClick={() => setStatusFilter('cleared')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                  statusFilter === 'cleared' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                ✅ Cleared ({clearedList.length})
              </button>
            </div>

            {/* Search and Add Cheque */}
            <div className="flex items-center gap-3">
              <div className="relative flex-1 md:w-64">
                <input
                  type="text"
                  placeholder="Search Cheque # or Payee..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-10 pr-4 py-2.5 text-xs font-bold outline-none focus:border-amber-500 transition-all"
                />
                <span className="absolute left-3.5 top-2.5 text-slate-400 text-xs">🔍</span>
              </div>
              <button
                onClick={handleOpenAddModal}
                className="bg-slate-900 hover:bg-slate-800 text-white px-5 py-2.5 rounded-2xl font-black text-xs uppercase tracking-wider shadow-lg active:scale-95 transition-all flex items-center gap-2 whitespace-nowrap"
              >
                <span>➕</span> Schedule Cheque
              </button>
            </div>
          </div>

          {/* Cheques List Table */}
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest">
                Future Release Cheque Schedule ({filteredFutureCheques.length})
              </h3>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Click Payee name to edit directly
              </span>
            </div>

            {filteredFutureCheques.length === 0 ? (
              <div className="p-12 text-center text-slate-400 space-y-3">
                <div className="text-4xl">📂</div>
                <p className="text-xs font-bold uppercase tracking-wider">No Cheque Records Found</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                      <th className="py-4 px-6">Cheque No</th>
                      <th className="py-4 px-6">Release Date</th>
                      <th className="py-4 px-6">Payee / Description (Click to Edit)</th>
                      <th className="py-4 px-6">Amount (LKR)</th>
                      <th className="py-4 px-6 text-center">Status</th>
                      <th className="py-4 px-6 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs font-medium">
                    {filteredFutureCheques.map((item) => {
                      const isCleared = item.status === 'cleared';
                      const releaseDate = new Date(item.date);
                      const today = new Date();
                      today.setHours(0, 0, 0, 0);
                      const diffDays = Math.ceil((releaseDate.getTime() - today.getTime()) / (1000 * 3600 * 24));
                      const isInlineEditing = inlineEditingId === item.id;
                      const hasRealPayee = item.payee && item.payee.trim() !== '' && !item.payee.startsWith('PAYEE -');

                      return (
                        <tr
                          key={item.id}
                          className={`hover:bg-slate-50/80 transition-colors ${
                            isCleared ? 'bg-amber-50/30' : ''
                          }`}
                        >
                          <td className="py-4 px-6 font-mono font-black text-sm text-slate-900">
                            #{item.chequeNumber}
                          </td>
                          <td className="py-4 px-6">
                            <div className="font-bold text-slate-800">{item.date}</div>
                            {!isCleared && (
                              <div className={`text-[10px] font-bold ${
                                diffDays <= 0 ? 'text-rose-600' : diffDays <= 5 ? 'text-amber-600' : 'text-slate-400'
                              }`}>
                                {diffDays < 0 ? `${Math.abs(diffDays)} Days Past` : diffDays === 0 ? 'Release Today!' : `In ${diffDays} Days`}
                              </div>
                            )}
                          </td>
                          <td className="py-4 px-6">
                            {isInlineEditing ? (
                              <div className="flex flex-col gap-2 max-w-sm bg-white p-3 border-2 border-indigo-500 rounded-2xl shadow-xl z-20">
                                <div className="flex items-center justify-between text-[9px] font-black text-indigo-600 uppercase tracking-widest">
                                  <span>Select Vendor / Supplier Name</span>
                                </div>
                                <select
                                  className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 outline-none uppercase cursor-pointer"
                                  value={inlinePayeeValue}
                                  onChange={e => {
                                    const val = e.target.value;
                                    setInlinePayeeValue(val);
                                    if (val) {
                                      handleSaveInlinePayee(item.id, val);
                                    }
                                  }}
                                >
                                  <option value="">-- SELECT VENDOR FROM LIST --</option>
                                  {vendors.map(v => (
                                    <option key={v.id} value={v.name}>{v.name}</option>
                                  ))}
                                </select>
                                <div className="flex items-center gap-2">
                                  <input
                                    type="text"
                                    list="payee-suggestions"
                                    autoFocus
                                    value={inlinePayeeValue}
                                    onChange={e => setInlinePayeeValue(e.target.value.toUpperCase())}
                                    onKeyDown={e => {
                                      if (e.key === 'Enter') handleSaveInlinePayee(item.id, inlinePayeeValue);
                                      if (e.key === 'Escape') setInlineEditingId(null);
                                    }}
                                    placeholder="OR TYPE CUSTOM PAYEE NAME"
                                    className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-900 outline-none w-full uppercase shadow-sm"
                                  />
                                  <button
                                    onClick={() => handleSaveInlinePayee(item.id, inlinePayeeValue)}
                                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black text-[10px] uppercase shadow whitespace-nowrap"
                                  >
                                    Save
                                  </button>
                                  <button
                                    onClick={() => setInlineEditingId(null)}
                                    className="px-2.5 py-1.5 bg-slate-200 text-slate-600 rounded-xl font-bold text-[10px]"
                                  >
                                    ✕
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div
                                className="group/payee inline-flex items-center gap-2 cursor-pointer hover:bg-indigo-50/60 px-2 py-1 -ml-2 rounded-xl transition-all"
                                onClick={() => {
                                  setInlineEditingId(item.id);
                                  setInlinePayeeValue(hasRealPayee ? item.payee : '');
                                }}
                                title="Click to edit payee name"
                              >
                                {hasRealPayee ? (
                                  <span className="font-black text-slate-900 uppercase tracking-tight text-sm">
                                    {item.payee}
                                  </span>
                                ) : (
                                  <span className="font-extrabold text-indigo-600 bg-indigo-50 border border-indigo-200/80 px-2.5 py-1 rounded-xl text-[11px] uppercase tracking-wider flex items-center gap-1.5 shadow-sm hover:bg-indigo-100">
                                    <span>✏️</span> Set Payee Name
                                  </span>
                                )}
                                <span className="text-[10px] text-slate-400 opacity-40 group-hover/payee:opacity-100 transition-opacity">✏️</span>
                              </div>
                            )}
                            {item.notes && <div className="text-[10px] text-slate-400 italic mt-0.5">{item.notes}</div>}
                          </td>
                          <td 
                            className="py-4 px-6 font-mono font-black text-slate-900 text-sm cursor-pointer hover:text-indigo-600 transition-colors"
                            onClick={() => handleOpenEditModal(item)}
                            title="Click to edit cheque details"
                          >
                            <div className="flex items-center gap-1.5">
                              <span>LKR {item.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                              <span className="text-[10px] text-slate-400 opacity-40 hover:opacity-100">✏️</span>
                            </div>
                          </td>
                          <td className="py-4 px-6 text-center">
                            {isCleared ? (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-orange-100 text-orange-800 border border-orange-200">
                                <span>✅</span> Cleared
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-900 border border-amber-300 shadow-sm animate-pulse">
                                <span>⏳</span> Future Release
                              </span>
                            )}
                          </td>
                          <td className="py-4 px-6 text-right space-x-2 whitespace-nowrap">
                            {/* Toggle Status Button */}
                            <button
                              onClick={() => handleToggleStatus(item)}
                              className={`px-3 py-1.5 rounded-xl font-bold text-[10px] transition-all border ${
                                isCleared
                                  ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                                  : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                              }`}
                              title="Toggle Cleared / Pending Status"
                            >
                              {isCleared ? 'Mark Pending' : 'Mark Cleared'}
                            </button>

                            {/* Load into Terminal */}
                            <button
                              onClick={() => handleLoadFutureChequeToTerminal(item)}
                              className="px-3 py-1.5 rounded-xl font-bold text-[10px] bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 transition-all"
                              title="Load cheque data into Printing Terminal"
                            >
                              🖨️ Print
                            </button>

                            {/* Edit */}
                            <button
                              onClick={() => handleOpenEditModal(item)}
                              className="p-1.5 text-slate-400 hover:text-slate-700 transition-colors"
                              title="Edit Details"
                            >
                              ✏️
                            </button>

                            {/* Delete */}
                            <button
                              onClick={() => handleDeleteFutureCheque(item.id)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 transition-colors"
                              title="Delete Cheque"
                            >
                              🗑️
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: ADD / EDIT FUTURE CHEQUE                           */}
      {/* ========================================================= */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 space-y-6 border border-slate-100">
            <div className="flex justify-between items-center border-b border-slate-100 pb-4">
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <span>📅</span> {editingItem ? 'Edit Future Cheque' : 'Schedule Future Cheque'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 font-bold flex items-center justify-center text-xs"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveModal} className="space-y-4">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Cheque Number</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 000011"
                  value={modalForm.chequeNumber}
                  onChange={e => setModalForm({ ...modalForm, chequeNumber: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-mono font-bold outline-none focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Release Date</label>
                  <input
                    type="date"
                    required
                    value={modalForm.date}
                    onChange={e => setModalForm({ ...modalForm, date: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-bold outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Amount (LKR)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="0.00"
                    value={modalForm.amount}
                    onChange={e => setModalForm({ ...modalForm, amount: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-mono font-bold text-indigo-600 outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Target Supplier / Payee Name</label>
                <select
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-bold uppercase outline-none focus:border-amber-500 mb-2 cursor-pointer"
                  value={vendors.some(v => v.name === modalForm.payee) ? modalForm.payee : ''}
                  onChange={e => setModalForm({ ...modalForm, payee: e.target.value })}
                >
                  <option value="">-- SELECT VENDOR FROM SUPPLIERS LIST --</option>
                  {vendors.map(v => (
                    <option key={v.id} value={v.name}>{v.name}</option>
                  ))}
                </select>
                <input
                  type="text"
                  list="payee-suggestions"
                  placeholder="OR TYPE CUSTOM PAYEE NAME"
                  value={modalForm.payee}
                  onChange={e => setModalForm({ ...modalForm, payee: e.target.value.toUpperCase() })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-bold uppercase outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Status</label>
                <select
                  value={modalForm.status}
                  onChange={e => setModalForm({ ...modalForm, status: e.target.value as any })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-bold outline-none focus:border-amber-500"
                >
                  <option value="future_release">⏳ Future Release (Pending)</option>
                  <option value="cleared">✅ Cleared</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Notes / Description</label>
                <input
                  type="text"
                  placeholder="e.g. Supplier payment post-dated cheque"
                  value={modalForm.notes}
                  onChange={e => setModalForm({ ...modalForm, notes: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-medium outline-none focus:border-amber-500"
                />
              </div>

              <div className="flex gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 bg-slate-100 text-slate-600 py-3 rounded-xl font-bold text-xs uppercase"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-amber-500 hover:bg-amber-600 text-slate-950 py-3 rounded-xl font-black text-xs uppercase shadow-lg shadow-amber-500/20"
                >
                  Save Record
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* High-Impact Print Container for Hardware Printing (Rendered to document.body to prevent any parent shadows or bleed) */}
      {typeof document !== 'undefined' && createPortal(
        <div
          className="cheque-print-layout"
          style={{
            width: `${chequeDimensions.width}mm`,
            height: `${chequeDimensions.height}mm`
          }}
        >
          <div className="calibration-wrapper" style={{
            marginTop: `${offsets.top}mm`,
            marginLeft: `${offsets.left}mm`
          }}>
            {cheque.isAccountPayee && (
              <div
                className="crossing-line"
                style={{
                  top: `${elementPositions.crossing.y}mm`,
                  left: `${elementPositions.crossing.x}mm`,
                  transform: `scale(${(elementPositions.crossing.scale || 95) / 100}) rotate(${elementPositions.crossing.angle ?? -24}deg)`,
                  transformOrigin: 'center center'
                }}
              >
                A/C PAYEE ONLY
              </div>
            )}
            <div className="date-line" style={{ top: `${elementPositions.date.y}mm`, left: `${elementPositions.date.x}mm` }}>
              {dateChars.map((char, i) => {
                const isDayEnd = i === 1;
                const isMonthEnd = i === 3;
                const extraMarginRight = (isDayEnd || isMonthEnd) && dateGroupGap > 0
                  ? `${dateGroupGap}mm`
                  : undefined;
                return (
                  <span
                    key={i}
                    className="date-char"
                    style={{
                      width: `${datePitch}mm`,
                      fontSize: `${elementPositions.date.fontSize || 14}pt`,
                      marginRight: extraMarginRight
                    }}
                  >
                    {char === ' ' ? '\u00A0' : char}
                  </span>
                );
              })}
            </div>
            <div
              className="payee-line"
              style={{
                top: `${elementPositions.payee.y}mm`,
                left: `${elementPositions.payee.x}mm`,
                fontSize: `${elementPositions.payee.fontSize || 10}pt`
              }}
            >
              {cheque.payee ? `**${cheque.payee}**` : ''}
            </div>
            <div
              className="words-line"
              style={{
                top: `${elementPositions.words.y}mm`,
                left: `${elementPositions.words.x}mm`,
                width: `${elementPositions.words.width || 95}mm`,
                fontSize: `${elementPositions.words.fontSize || 10}pt`,
                lineHeight: elementPositions.words.lineHeight || 1.5
              }}
            >
              {cheque.amountInWords ? `**${cheque.amountInWords}**` : ''}
            </div>
            <div
              className="numeric-line"
              style={{
                top: `${elementPositions.amount.y}mm`,
                left: `${elementPositions.amount.x}mm`,
                fontSize: `${elementPositions.amount.fontSize || 12}pt`
              }}
            >
              {cheque.amount ? `**${formattedAmount}**` : ''}
            </div>
          </div>
        </div>,
        document.body
      )}

      <style>{`
        @media print {
          @page {
            size: landscape;
            margin: 0 !important;
          }

          /* Strip every shadow, outline, text-shadow and filter across DOM to eliminate all page/card shadows */
          *, *::before, *::after {
            box-shadow: none !important;
            -webkit-box-shadow: none !important;
            text-shadow: none !important;
            filter: none !important;
            outline: none !important;
          }

          /* Completely suppress the main application tree from print render */
          body > #root {
            display: none !important;
            visibility: hidden !important;
            height: 0 !important;
            overflow: hidden !important;
          }

          body {
            margin: 0 !important;
            padding: 0 !important;
            background: transparent !important;
            box-shadow: none !important;
          }

          .cheque-print-layout {
            visibility: visible !important;
            display: block !important;
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            background: transparent !important;
            color: black !important;
            z-index: 9999999 !important;
            font-family: 'JetBrains Mono', monospace !important;
            box-shadow: none !important;
            border: none !important;
            outline: none !important;
          }

          .calibration-wrapper {
            position: relative;
            width: 100%;
            height: 100%;
            background: transparent !important;
            box-shadow: none !important;
            border: none !important;
          }

          .crossing-line {
            position: absolute;
            border-top: 1.5pt solid black !important;
            border-bottom: 1.5pt solid black !important;
            border-left: none !important;
            border-right: none !important;
            background: transparent !important;
            box-shadow: none !important;
            padding: 3px 18px;
            font-size: 12pt;
            font-weight: 700;
            white-space: nowrap;
          }

          .date-line {
            position: absolute;
            display: flex !important;
            flex-direction: row !important;
            white-space: nowrap;
            gap: 0;
            background: transparent !important;
            border: none !important;
            box-shadow: none !important;
          }

          .date-char {
            text-align: center;
            font-weight: 700;
            display: inline-block !important;
            background: transparent !important;
            border: none !important;
            box-shadow: none !important;
          }

          .payee-line {
            position: absolute;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.8pt;
            background: transparent !important;
            border: none !important;
            box-shadow: none !important;
          }

          .words-line {
            position: absolute;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: -0.2pt;
            word-wrap: break-word;
            overflow-wrap: break-word;
            background: transparent !important;
            border: none !important;
            box-shadow: none !important;
          }

          .numeric-line {
            position: absolute;
            text-align: left;
            min-width: 50mm;
            font-weight: 600;
            letter-spacing: 1.5pt;
            background: transparent !important;
            border: none !important;
            box-shadow: none !important;
          }

          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }

        .cheque-print-layout {
          display: none;
        }
        
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #f1f5f9; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
      `}</style>
    </div>
  );
};

export default ChequePrint;
