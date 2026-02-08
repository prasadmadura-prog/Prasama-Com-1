import React, { useState, useEffect, useMemo } from 'react';
import { Vendor } from '../types';

// Define the shape of a history item
interface HistoryItem {
  id: number;
  date: string;
  payee: string;
  amount: string;
  amountInWords: string;
  timestamp: string;
}

interface ChequePrintProps {
  vendors?: Vendor[];
}

const ChequePrint: React.FC<ChequePrintProps> = ({ vendors = [] }) => {
  const [cheque, setCheque] = useState({
    date: new Date().toISOString().split('T')[0],
    payee: '',
    amount: '',
    amountInWords: '',
    memo: '',
    chequeNumber: '',
    isAccountPayee: true
  });

  // Load history from local storage
  const [printHistory, setPrintHistory] = useState<HistoryItem[]>(() => {
    const saved = localStorage.getItem('cheque_print_history');
    return saved ? JSON.parse(saved) : [];
  });

  // Save history to local storage whenever it changes
  useEffect(() => {
    localStorage.setItem('cheque_print_history', JSON.stringify(printHistory));
  }, [printHistory]);

  // Derived unique payees for dropdown (History + Vendors)
  const uniquePayees = useMemo(() => {
    const historyPayees = printHistory.map(item => item.payee).filter(p => p.trim() !== '');
    const vendorPayees = vendors.map(v => v.name).filter(p => p.trim() !== '');
    const allPayees = [...historyPayees, ...vendorPayees];
    return Array.from(new Set(allPayees)).sort(); // distinct and sorted
  }, [printHistory, vendors]);

  // Physical alignment offsets (mm) - USER DEFAULT SETTING
  const [offsets, setOffsets] = useState({ top: 60, left: 115, pitch: 7.4 });

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
    // 1. Add to history BEFORE printing (so it saves even if they cancel print dialog, or we can do it after)
    // "BUT EVER PRINTED SAVE IN DOWN AS PRINTED HISTORY"
    if (cheque.payee && cheque.amount) {
      const newItem: HistoryItem = {
        id: Date.now(),
        date: cheque.date,
        payee: cheque.payee,
        amount: cheque.amount,
        amountInWords: cheque.amountInWords,
        timestamp: new Date().toLocaleString()
      };
      // Prepend to history (newest first)
      setPrintHistory(prev => [newItem, ...prev]);
    }

    // 2. Trigger Print
    window.print();
  };

  const handleDeleteHistory = (id: number) => {
    if (window.confirm('Delete this record from history?')) {
      setPrintHistory(prev => prev.filter(item => item.id !== id));
    }
  };

  const handleReprint = (item: HistoryItem) => {
    setCheque({
      ...cheque,
      date: item.date,
      payee: item.payee,
      amount: item.amount,
      amountInWords: item.amountInWords
    });
  };

  const formattedAmount = cheque.amount ? parseFloat(cheque.amount).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }) : '';

  const getDateChars = () => {
    if (!cheque.date) return Array(8).fill('');
    const d = cheque.date.split('-');
    const day = d[2];
    const month = d[1];
    const year = d[0];
    const yearLastTwo = year.slice(2);
    // Returns [D, D, M, M, ' ', ' ', Y, Y] - Skip printing '20' century
    return [...day.split(''), ...month.split(''), '', '', ...yearLastTwo.split('')];
  };

  const dateChars = getDateChars();

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center no-print">
        <div>
          <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tighter">Cheque Printing Terminal</h2>
          <p className="text-slate-500 font-bold uppercase tracking-widest text-[10px]">Calibration: Y:{offsets.top}mm X:{offsets.left}mm P:{offsets.pitch}mm</p>
        </div>
        <div className="flex gap-3">
          <button onClick={handlePrint} className="bg-indigo-600 text-white px-10 py-3 rounded-2xl font-black text-[11px] uppercase tracking-[0.2em] shadow-2xl hover:bg-indigo-700 transition-all active:scale-95 flex items-center gap-2">
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
                <input type="range" min="-150" max="150" value={offsets.top} onChange={e => setOffsets({ ...offsets, top: parseInt(e.target.value) })} className="w-full accent-indigo-500" />
              </div>
              <div className="space-y-3">
                <div className="flex justify-between text-[9px] font-black uppercase tracking-widest">
                  <span className="text-slate-400">Horizontal Offset (X)</span>
                  <span className="text-indigo-400">{offsets.left} mm</span>
                </div>
                <input type="range" min="-150" max="150" value={offsets.left} onChange={e => setOffsets({ ...offsets, left: parseInt(e.target.value) })} className="w-full accent-indigo-500" />
              </div>
              <div className="space-y-3">
                <div className="flex justify-between text-[9px] font-black uppercase tracking-widest">
                  <span className="text-slate-400">Date Char Pitch (Spacing)</span>
                  <span className="text-emerald-400">{offsets.pitch} mm</span>
                </div>
                <input type="range" min="1" max="15" step="0.1" value={offsets.pitch} onChange={e => setOffsets({ ...offsets, pitch: parseFloat(e.target.value) })} className="w-full accent-emerald-500" />
              </div>
            </div>
          </div>
        </div>

        {/* Live Simulation */}
        <div className="xl:col-span-8 space-y-6">
          <div className="flex flex-col items-center py-10 bg-slate-100 rounded-[3rem] border border-slate-200 shadow-inner relative overflow-hidden">
            <div className="relative w-[800px] h-[360px] bg-white rounded-xl shadow-2xl border border-slate-200 transition-all duration-300">
              <div className="p-10 h-full w-full relative overflow-hidden">
                <div
                  className="absolute inset-0 transition-all duration-300 pointer-events-none"
                  style={{ transform: `translate(${offsets.left}px, ${offsets.top}px)` }}
                >
                  {/* Digital Replica Overlay */}
                  <div className="absolute top-10 right-14 flex text-2xl font-medium text-slate-950 font-mono">
                    {dateChars.map((char, i) => <span key={i} style={{ width: `${offsets.pitch * 3.78}px` }} className="text-center bg-slate-100/50 border-r border-slate-300/20">{char === ' ' ? '\u00A0' : char}</span>)}
                  </div>
                  <div className="absolute top-[100px] left-[10px] text-2xl font-medium text-slate-950 uppercase tracking-tight">
                    {cheque.payee ? `**${cheque.payee}**` : ''}
                  </div>
                  <div className="absolute top-[148px] left-[8px] text-[18px] font-medium leading-[2.5] w-[500px] text-slate-950 uppercase tracking-tighter">
                    {cheque.amountInWords ? `**${cheque.amountInWords}**` : ''}
                  </div>
                  <div className="absolute top-[195px] right-6 text-2xl font-medium text-slate-950 text-right min-w-[220px]">
                    {cheque.amount ? `**${formattedAmount}**` : ''}
                  </div>
                </div>
              </div>
            </div>
            <p className="mt-8 text-[9px] font-black text-slate-400 uppercase tracking-widest italic">Simulation uses regular weight (non-bold) font</p>
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
                      <button
                        onClick={() => handleDeleteHistory(item.id)}
                        className="p-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors"
                        title="Delete from History"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* High-Impact Print Container */}
      <div className="cheque-print-layout">
        <div className="calibration-wrapper" style={{
          marginTop: `${offsets.top}mm`,
          marginLeft: `${offsets.left}mm`
        }}>
          {cheque.isAccountPayee && <div className="crossing-line">A/C PAYEE ONLY</div>}
          <div className="date-line">
            {dateChars.map((char, i) => <span key={i} className="date-char" style={{ width: `${offsets.pitch}mm` }}>{char === ' ' ? '\u00A0' : char}</span>)}
          </div>
          <div className="payee-line">{cheque.payee ? `**${cheque.payee}**` : ''}</div>
          <div className="words-line">{cheque.amountInWords ? `**${cheque.amountInWords}**` : ''}</div>
          <div className="numeric-line">{cheque.amount ? `**${formattedAmount}**` : ''}</div>
        </div>
      </div>

      <style>{`
        @media print {
          @page { size: landscape; margin: 0; }
          body > #root { visibility: hidden !important; height: 0 !important; overflow: hidden !important; }
          
          .cheque-print-layout {
            visibility: visible !important;
            display: block !important;
            position: absolute !important;
            top: 0; left: 0; right: 0; bottom: 0;
            width: 210mm; height: 93mm; /* Standard height adjusted */
            background: white !important;
            color: black !important;
            z-index: 9999999 !important;
            font-family: 'JetBrains Mono', monospace !important;
          }

          .calibration-wrapper { position: relative; width: 100%; height: 100%; }

          .crossing-line {
            position: absolute; top: 12mm; left: 18mm;
            border-top: 1.5pt solid black; border-bottom: 1.5pt solid black;
            padding: 4px 20px; transform: rotate(-15deg);
            font-size: 13pt; font-weight: 400; white-space: nowrap;
          }

          .date-line {
            /* User Req: Y 8 CM from bottom = 13mm from top */
            position: absolute; top: 13mm; right: 8mm;
            display: flex !important; flex-direction: row !important;
            white-space: nowrap; gap: 0;
          }

          .date-char {
            text-align: center;
            font-size: 18pt;
            font-weight: 700;
            display: inline-block !important;
          }

          .payee-line {
            /* User Req: X=1.5cm */
            position: absolute; top: 31mm; left: 15mm;
            font-size: 16pt; font-weight: 600; text-transform: uppercase;
            letter-spacing: 0.8pt;
          }

          .words-line {
            /* User Req: Width limited to force wrap */
            /* Adjusted slightly down to ~45mm to sit better on line */
            position: absolute; top: 45mm; left: 15mm; width: 110mm;
            font-size: 14pt; line-height: 1.5; font-weight: 600; text-transform: uppercase;
            letter-spacing: -0.2pt;
            word-wrap: break-word; overflow-wrap: break-word;
          }

          .numeric-line {
            /* User Req: Bring to Box -> Moved down to 50mm */
            position: absolute; top: 50mm; right: 10mm;
            font-size: 20pt; text-align: right; min-width: 60mm; font-weight: 600;
            letter-spacing: 1.5pt;
          }

          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }

        .cheque-print-layout { display: none; }
        
        /* Custom scrollbar for history list */
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #f1f5f9; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
      `}</style>
    </div>
  );
};

export default ChequePrint;
