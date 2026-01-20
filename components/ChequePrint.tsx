
import React, { useState } from 'react';

const ChequePrint: React.FC = () => {
  const [cheque, setCheque] = useState({
    date: new Date().toISOString().split('T')[0],
    payee: '',
    amount: '',
    amountInWords: '',
    memo: '',
    chequeNumber: '000126',
    isAccountPayee: true
  });
  const [showGuides, setShowGuides] = useState(true);

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
    if (fractionPart > 0) {
      words += " and " + convert(fractionPart) + " Cents";
    }
    return words + " Only";
  };

  const handleAmountChange = (val: string) => {
    const num = parseFloat(val);
    const words = val ? numberToWords(num) : '';
    setCheque(prev => ({
      ...prev,
      amount: val,
      amountInWords: words
    }));
  };

  const handlePrint = () => {
    window.print();
  };

  const formattedAmount = cheque.amount ? parseFloat(cheque.amount).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }) : '';

  const getDateChars = () => {
    if (!cheque.date) return Array(8).fill('');
    const d = cheque.date.split('-'); 
    const str = d[2] + d[1] + d[0]; 
    return str.split('');
  };

  const dateChars = getDateChars();

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center no-print">
        <div>
          <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tighter">Cheque Printing Terminal</h2>
          <p className="text-slate-500 font-bold uppercase tracking-widest text-[10px]">Precision aligned for standard bank stationary</p>
        </div>
        <div className="flex gap-3">
            <button 
              onClick={() => setShowGuides(!showGuides)}
              className={`px-5 py-2.5 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all border ${showGuides ? 'bg-slate-200 border-slate-300 text-slate-700' : 'bg-white border-slate-200 text-slate-400'}`}
            >
              {showGuides ? 'Hide Guides' : 'Show Guides'}
            </button>
            <button 
              onClick={() => setCheque({...cheque, isAccountPayee: !cheque.isAccountPayee})}
              className={`px-5 py-2.5 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all border ${cheque.isAccountPayee ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg' : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300'}`}
            >
              {cheque.isAccountPayee ? '✓ A/C PAYEE' : '× NO CROSSING'}
            </button>
            <button 
              onClick={handlePrint}
              className="bg-slate-900 text-white px-8 py-2.5 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] shadow-2xl hover:bg-black transition-all active:scale-95 flex items-center gap-2"
            >
              <span>🖨️</span> Execute Print
            </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto grid grid-cols-1 xl:grid-cols-12 gap-8 items-start no-print">
        <div className="xl:col-span-4 bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100 space-y-6">
          <div className="space-y-1 border-b border-slate-50 pb-4">
             <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Cheque Parameters</h3>
             <p className="text-[11px] text-slate-400 font-medium italic">Standard format used by most SL Banks</p>
          </div>
          
          <div className="space-y-5">
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 tracking-widest">Beneficiary / Payee</label>
              <input 
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 text-sm font-bold text-slate-900 transition-all uppercase"
                placeholder="NAME OF PAYEE"
                value={cheque.payee}
                onChange={e => setCheque({...cheque, payee: e.target.value.toUpperCase()})}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 tracking-widest">Amount (Rs.)</label>
                <input 
                  type="number"
                  step="0.01"
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 font-black text-sm text-indigo-600 transition-all"
                  placeholder="0.00"
                  value={cheque.amount}
                  onChange={e => handleAmountChange(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 tracking-widest">Issue Date</label>
                <input 
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 text-sm font-bold text-slate-600 transition-all"
                  type="date"
                  value={cheque.date}
                  onChange={e => setCheque({...cheque, date: e.target.value})}
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 tracking-widest">Amount in Words</label>
              <textarea 
                rows={3}
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 text-xs font-bold leading-relaxed text-slate-700 transition-all"
                value={cheque.amountInWords}
                onChange={e => setCheque({...cheque, amountInWords: e.target.value})}
              />
            </div>
          </div>
        </div>

        <div className="xl:col-span-8 flex flex-col items-center py-10 bg-slate-200/40 rounded-[3rem] border-2 border-dashed border-slate-300">
          <div className="relative w-[800px] h-[340px] bg-white rounded-xl shadow-2xl overflow-hidden border border-slate-200 font-mono">
            {/* Background Bank Cheque UI Overlay */}
            <div className="absolute inset-0 opacity-[0.06] pointer-events-none p-8 flex flex-col justify-between select-none">
              <div className="flex justify-between items-start">
                 <div className="text-4xl font-black italic">PRASAMA GLOBAL BANK</div>
                 <div className="flex gap-6 pt-2">
                    {Array(8).fill(0).map((_, i) => (
                      <div key={i} className="w-8 h-10 border border-slate-900/40 flex items-center justify-center text-[10px] font-black uppercase text-slate-900/40">
                        {i < 2 ? 'D' : i < 4 ? 'M' : 'Y'}
                      </div>
                    ))}
                 </div>
              </div>
              <div className="space-y-12 pl-12">
                 <div className="flex items-end gap-4"><span className="text-sm font-black italic">Pay</span> <div className="h-0.5 bg-slate-900 flex-1"></div></div>
                 <div className="flex items-end gap-4"><span className="text-sm font-black italic">Rupees</span> <div className="h-0.5 bg-slate-900 flex-1"></div></div>
              </div>
              <div className="flex justify-end pr-8 pb-4">
                 <div className="w-64 h-16 border-2 border-slate-900/20 rounded flex items-center px-4"><span className="text-sm font-black italic opacity-50">Amount (Rs.)</span></div>
              </div>
            </div>

            {/* Alignment Guides */}
            {showGuides && (
              <div className="absolute inset-0 pointer-events-none z-10 opacity-20">
                <div className="absolute top-[108px] left-0 w-full border-t border-indigo-400 border-dashed"></div>
                <div className="absolute top-[162px] left-0 w-full border-t border-indigo-400 border-dashed"></div>
                <div className="absolute top-0 left-[140px] h-full border-l border-indigo-400 border-dashed"></div>
                <div className="absolute top-0 right-14 h-full border-l border-indigo-400 border-dashed"></div>
              </div>
            )}

            <div className="cheque-data-preview select-none relative z-20">
              {cheque.isAccountPayee && (
                <div className="absolute top-8 left-12 border-y-[2.5px] border-slate-950 p-0.5 rotate-[-12deg]">
                  <p className="text-[14px] font-black uppercase tracking-[0.2em] text-slate-950 px-4 py-1.5">A/C PAYEE ONLY</p>
                </div>
              )}

              <div className="absolute top-10 right-14 flex gap-6 text-2xl font-black text-slate-950">
                 {dateChars.map((char, i) => (
                   <span key={i} className={`w-8 text-center ${i === 2 || i === 4 ? 'ml-1.5' : ''}`}>{char}</span>
                 ))}
              </div>

              <div className="absolute top-[108px] left-[140px] text-2xl font-black tracking-tight text-slate-950 uppercase">
                 {cheque.payee ? `** ${cheque.payee} **` : ''}
              </div>

              <div className="absolute top-[156px] left-[110px] text-[15px] font-black leading-[2.2] max-w-[550px] text-slate-950 italic">
                 {cheque.amountInWords ? `** ${cheque.amountInWords} **` : ''}
              </div>

              <div className="absolute top-[186px] right-14 text-2xl font-black border-[3px] border-slate-950 p-3 min-w-[240px] text-right rounded-lg text-slate-950 bg-white/40 shadow-sm backdrop-blur-[2px]">
                 {cheque.amount ? `${formattedAmount} /=` : ''}
              </div>
            </div>
          </div>
          <p className="mt-8 text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
            <span>ℹ️</span> Ensure your printer tray is aligned to the left margin
          </p>
        </div>
      </div>

      <div className="cheque-print-layout">
        {cheque.isAccountPayee && (
          <div className="crossing-line">A/C PAYEE ONLY</div>
        )}
        
        <div className="date-line">
           {dateChars.map((char, i) => (
             <span key={i} className={`date-char ${i === 2 || i === 4 ? 'date-gap' : ''}`}>{char}</span>
           ))}
        </div>

        <div className="payee-line">
           {cheque.payee ? `** ${cheque.payee} **` : ''}
        </div>

        <div className="words-line">
           {cheque.amountInWords ? `** ${cheque.amountInWords} **` : ''}
        </div>

        <div className="numeric-line">
           {cheque.amount ? `${formattedAmount} /=` : ''}
        </div>
      </div>

      <style>{`
        .cheque-print-layout { display: none; }

        @media print {
          @page { size: landscape; margin: 0; }
          body { background: white !important; margin: 0 !important; padding: 0 !important; font-family: 'JetBrains Mono', monospace !important; }
          #root > *:not(.cheque-print-layout),
          main > *:not(.cheque-print-layout),
          .no-print, header, .max-w-7xl, .space-y-6 {
            display: none !important;
          }

          .cheque-print-layout {
            display: block !important;
            position: relative;
            width: 210mm;
            height: 95mm;
            background: transparent !important;
            color: black !important;
            font-weight: 900 !important;
            margin: 0;
            padding: 0;
          }

          .crossing-line {
            position: absolute;
            top: 10mm;
            left: 15mm;
            border-top: 2.5pt solid black;
            border-bottom: 2.5pt solid black;
            padding: 4px 24px;
            transform: rotate(-12deg);
            font-size: 13pt;
            font-weight: 900;
            letter-spacing: 2.5pt;
            white-space: nowrap;
          }

          .date-line {
            position: absolute;
            top: 12mm;
            right: 15mm;
            font-size: 21pt;
            display: flex;
            letter-spacing: 0.5pt;
          }
          
          .date-char {
            width: 9.2mm;
            text-align: center;
          }

          .date-gap { margin-left: 2.5mm; }

          .payee-line {
            position: absolute;
            top: 32.5mm;
            left: 45mm;
            font-size: 17pt;
            text-transform: uppercase;
            font-weight: 900;
            letter-spacing: -0.5pt;
          }

          .words-line {
            position: absolute;
            top: 48mm;
            left: 32mm;
            width: 145mm;
            font-size: 13.5pt;
            line-height: 2.2;
            font-style: italic;
            font-weight: 900;
          }

          .numeric-line {
            position: absolute;
            top: 55mm; 
            right: 15mm;
            font-size: 21pt;
            text-align: right;
            min-width: 55mm;
            letter-spacing: 0.5pt;
            font-weight: 900;
          }

          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }
      `}</style>
    </div>
  );
};

export default ChequePrint;
