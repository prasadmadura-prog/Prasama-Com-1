import React, { useState, useMemo, useRef, useEffect } from 'react';
import JsBarcode from 'jsbarcode';
import { Product, Category } from '../types';

interface BarcodePrintProps {
  products: Product[];
  categories: Category[];
}

type LabelSize = 'SMALL' | 'MEDIUM' | 'LARGE';
type PaperSize = 'A4' | 'A5' | 'LETTER' | 'ROLL';

interface PrintSettings {
  labelSize: LabelSize;
  columns: number;
  showPrice: boolean;
  showSKU: boolean;
  showName: boolean;
  showNotes: boolean;
  paperSize: PaperSize;
  cashierSuffix: 'NONE' | 'CASHIER 1' | 'CASHIER 2' | 'CASHIER 3' | 'CASHIER 4';
}

interface Cashier4GlobalSettings {
  storeName: string;
  address: string;
  tel: string;
  brandHeader: string;
  regNo: string;
  mfdDate: string;
  expDate: string;
  weight: string;
  freeText: string;
  freeTextSinhala: string;
}

interface Cashier4ProductSettings {
  sinhalaName: string;
  weight: string;
  mfdDate: string;
  expDate: string;
  sugur: string;
  salt: string;
  fat: string;
  freeText: string;
  freeTextSinhala: string;
}

const getTodayFormatted = () => {
  const d = new Date();
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}.${month}.${year}`;
};

const getFutureFormatted = (monthsAhead: number) => {
  const d = new Date();
  d.setMonth(d.getMonth() + monthsAhead);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}.${month}.${year}`;
};

const BarcodePrint: React.FC<BarcodePrintProps> = ({ products = [], categories = [] }) => {
  const [selections, setSelections] = useState<Record<string, number>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategoryId, setFilterCategoryId] = useState('All');

  const [settings, setSettings] = useState<PrintSettings>({
    labelSize: 'MEDIUM',
    columns: 5,
    showPrice: true,
    showSKU: true,
    showName: true,
    showNotes: true,
    paperSize: 'A4',
    cashierSuffix: 'NONE'
  });

  const [c4Global, setC4Global] = useState<Cashier4GlobalSettings>({
    storeName: 'SRI KANTHA STORES',
    address: 'No.22, Kirulapona Shopping Complex, Colombo 06.',
    tel: '071 348 68 13',
    brandHeader: 'NITHARSHIKA PRODUCT',
    regNo: 'Reg.No.:-W/A 211304',
    mfdDate: getTodayFormatted(),
    expDate: getFutureFormatted(3),
    weight: '100g',
    freeText: '',
    freeTextSinhala: ''
  });

  const [c4Products, setC4Products] = useState<Record<string, Cashier4ProductSettings>>({});

  useEffect(() => {
    if (settings.cashierSuffix !== 'CASHIER 4') return;
    
    let updated = false;
    const nextC4Products = { ...c4Products };
    
    Object.keys(selections).forEach(pId => {
      if (selections[pId] > 0 && !nextC4Products[pId]) {
        const prod = products.find(p => p.id === pId);
        let sinhala = '';
        if (prod?.extraDetails && /[\u0D80-\u0DFF]/.test(prod.extraDetails)) {
          sinhala = prod.extraDetails;
        } else if (prod?.internalNotes && /[\u0D80-\u0DFF]/.test(prod.internalNotes)) {
          sinhala = prod.internalNotes;
        }
        
        nextC4Products[pId] = {
          sinhalaName: prod?.sinhalaName || sinhala,
          weight: '',
          mfdDate: '',
          expDate: '',
          sugur: '1.4g/100g',
          salt: '2.02g/100g',
          fat: '27.7g/100g',
          freeText: prod?.c4FreeText || '',
          freeTextSinhala: prod?.c4FreeTextSinhala || ''
        };
        updated = true;
      }
    });
    
    if (updated) {
      setC4Products(nextC4Products);
    }
  }, [selections, settings.cashierSuffix, products, c4Products]);

  const holdTimerRef = useRef<number | null>(null);

  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchesSearch = (p.name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.sku || "").toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = filterCategoryId === 'All' || p.categoryId === filterCategoryId;
      return matchesSearch && matchesCategory;
    });
  }, [products, searchTerm, filterCategoryId]);

  const totalLabels = useMemo(() =>
    Object.values(selections).reduce((a: number, b: number) => a + b, 0)
    , [selections]);

  const updateSelection = (productId: string, copies: number) => {
    setSelections(prev => ({
      ...prev,
      [productId]: Math.max(0, copies)
    }));
  };

  const startContinuousAction = (action: () => void) => {
    action();
    holdTimerRef.current = window.setTimeout(() => {
      holdTimerRef.current = window.setInterval(action, 80);
    }, 400);
  };

  const stopContinuousAction = () => {
    if (holdTimerRef.current) {
      window.clearTimeout(holdTimerRef.current);
      window.clearInterval(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  };

  const handlePrint = () => {
    const itemsToPrint = products.filter(p => (selections[p.id] || 0) > 0);
    if (itemsToPrint.length === 0) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const isC4 = settings.cashierSuffix === 'CASHIER 4';

    const labelDim = isC4 ? {
      SMALL: { h: '20mm', w: '58mm', f: '6.2px', p: '0.8mm', m: '0.4mm 0', bh: 0, bw: 0 },
      MEDIUM: { h: '28mm', w: '70mm', f: '7.8px', p: '1.2mm 1.5mm', m: '0.5mm 0', bh: 0, bw: 0 },
      LARGE: { h: '45mm', w: '135mm', f: '11px', p: '2.5mm 3.5mm', m: '1.2mm 0', bh: 0, bw: 0 }
    }[settings.labelSize] : {
      SMALL: { h: '25mm', w: '42mm', f: '8px', p: '1mm', m: '1mm 0', bh: 30, bw: 1.0 },
      MEDIUM: { h: '47mm', w: '46mm', f: '10px', p: '1mm', m: '1mm 0', bh: 65, bw: 1.4 },
      LARGE: { h: '60mm', w: '100mm', f: '16px', p: '1mm', m: '1mm 0', bh: 140, bw: 2.5 }
    }[settings.labelSize];

    const paperSizes = {
      'ROLL': { width: isC4 ? '100mm' : '80mm', style: isC4 ? '100mm auto' : '80mm auto' },
      'A5': { width: isC4 ? '200mm' : '140mm', style: isC4 ? 'a5 landscape' : 'a5 portrait' },
      'A4': { width: isC4 ? '290mm' : '200mm', style: isC4 ? 'a4 landscape' : 'a4 portrait' },
      'LETTER': { width: isC4 ? '270mm' : '205mm', style: isC4 ? 'letter landscape' : 'letter portrait' }
    };
    const currentPaper = paperSizes[settings.paperSize];

    let html = `
      <html>
      <head>
        <title>Barcode Print Manifest</title>
        <link href="https://fonts.googleapis.com/css2?family=Abhaya+Libre:wght@700;800&family=Inter:wght@400;700;900&display=swap" rel="stylesheet">
        <style>
          @page { size: ${currentPaper.style}; margin: 3mm; }
          * { box-sizing: border-box; }
          body { margin: 0; padding: 0; font-family: 'Inter', 'Times New Roman', Times, serif; background: white; width: ${currentPaper.width}; }
          .grid {
            display: grid;
            grid-template-columns: repeat(${settings.columns}, 1fr);
            grid-auto-rows: ${labelDim.h};
            align-content: start;
            gap: ${isC4 ? '1.2mm' : '0'};
            width: 100%;
          }
          .label {
            border: 0.1mm dashed #ccc;
            border-radius: 0;
            width: 100%;
            height: ${labelDim.h};
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: flex-start;
            text-align: center;
            padding: ${labelDim.p};
            box-sizing: border-box;
            overflow: hidden;
            page-break-inside: avoid;
            break-inside: avoid;
            background: #fff;
            position: relative;
            margin-right: -0.1mm;
            margin-bottom: -0.1mm;
          }
          .label-c4 {
            border: 2px double #000;
            border-radius: 0;
            width: 100%;
            height: ${labelDim.h};
            display: flex;
            flex-direction: column;
            padding: ${labelDim.p};
            box-sizing: border-box;
            overflow: hidden;
            page-break-inside: avoid;
            break-inside: avoid;
            background: #fff;
            position: relative;
            color: #000;
            font-family: 'Inter', Arial, Helvetica, sans-serif;
          }
          .sinhala {
            font-family: 'Abhaya Libre', 'FMAbhaya', serif;
            font-weight: 800;
          }
          .name { 
            font-weight: 400; 
            font-size: calc(${labelDim.f} - 1px); 
            margin-bottom: 1mm; 
            max-width: 100%; 
            line-height: 1.1;
            color: #000;
            font-family: 'Times New Roman', Times, serif;
          }
          .barcode-svg { 
            width: 100%; 
            height: auto;
            display: block;
          }
          .company-name {
            font-size: calc(${labelDim.f});
            font-weight: 900;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            margin-top: 0.5mm;
            color: #000;
            line-height: 1;
          }
          .price { 
            font-weight: 800; 
            font-size: calc(${labelDim.f} + 4px); 
            margin-top: 0.2mm;
            color: #000;
            line-height: 1;
            white-space: nowrap;
          }
          .footer {
            display: flex;
            justify-content: space-between;
            align-items: center;
            width: 100%;
            margin-top: 0mm;
          }
          .notes-footer {
            font-size: 8px;
            font-weight: 900;
            text-transform: uppercase;
            color: #000;
            letter-spacing: 0.5px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            padding: 0 2mm;
            flex: 1;
            text-align: center;
          }
        </style>
        ${isC4 ? '' : '<script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"></script>'}
      </head>
      <body>
        <div class="grid">
    `;

    itemsToPrint.forEach(p => {
      const count = selections[p.id];
      
      if (isC4) {
        const prodSettings = c4Products[p.id] || {};
        const printWeight = prodSettings.weight || c4Global.weight || '100g';
        const printMfd = prodSettings.mfdDate || c4Global.mfdDate || getTodayFormatted();
        const printExp = prodSettings.expDate || c4Global.expDate || getFutureFormatted(3);
        const printSugar = prodSettings.sugur || '1.4g/100g';
        const printSalt = prodSettings.salt || '2.02g/100g';
        const printFat = prodSettings.fat || '27.7g/100g';
        const printFreeText = prodSettings.freeText || c4Global.freeText || '';
        const printFreeTextSinhala = prodSettings.freeTextSinhala || c4Global.freeTextSinhala || '';

        for (let i = 0; i < count; i++) {
          html += `
            <div class="label-c4">
              <!-- Top Header Block -->
              <div style="display: flex; flex-direction: row; justify-content: space-between; align-items: center; width: 100%;">
                <!-- Left Brand Box -->
                <div style="display: flex; flex-direction: column; align-items: center; width: 32%;">
                  <div style="background: #cbd5e1; border: 1px solid #000; color: #000; border-radius: 4px; padding: 1.5px 2px; text-align: center; font-weight: bold; font-size: calc(${labelDim.f} - 2px); text-transform: uppercase; width: 100%; letter-spacing: 0.1px; line-height: 1.15; word-wrap: break-word;">
                    ${c4Global.brandHeader}
                  </div>
                  <div style="font-size: calc(${labelDim.f} - 2.8px); font-weight: bold; margin-top: 1.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 100%;">
                    ${c4Global.regNo}
                  </div>
                </div>
                <!-- Right Address Box -->
                <div style="text-align: center; width: 66%; display: flex; flex-direction: column; align-items: center; justify-content: center; line-height: 1;">
                  <div style="font-size: calc(${labelDim.f} + 2.5px); font-weight: 900; letter-spacing: 0.2px; line-height: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 100%;">${c4Global.storeName}</div>
                  <div style="font-size: calc(${labelDim.f} - 2.8px); line-height: 1; margin-top: 1px; font-weight: bold; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 100%;">${c4Global.address}</div>
                  <div style="font-size: calc(${labelDim.f} - 2.8px); font-weight: bold; margin-top: 0.8px; white-space: nowrap;">Tel : ${c4Global.tel}</div>
                </div>
              </div>

              <!-- Separator Line -->
              <div style="border-top: 1px solid #000; margin: ${labelDim.m || '1mm 0'}; width: 100%;"></div>

              <!-- Bottom Content Block -->
              <div style="display: flex; flex-direction: row; justify-content: space-between; align-items: stretch; flex-grow: 1; width: 100%;">
                <!-- Ingredients columns -->
                <div style="display: flex; flex-direction: row; gap: 0.6mm; width: 29%; align-items: stretch; justify-content: space-between; height: 100%;">
                  <!-- Sugur Box -->
                  <div style="border: 1px solid #000; border-radius: 6px; width: 32%; display: flex; flex-direction: column; justify-content: space-between; height: 100%; text-align: center; overflow: hidden; box-sizing: border-box;">
                    <div style="font-size: calc(${labelDim.f} - 3px); font-weight: bold; padding: 1px 0; line-height: 1.15; flex-grow: 1; display: flex; flex-direction: column; justify-content: center;">
                      <span class="sinhala" style="font-size: calc(${labelDim.f} - 1.5px);">සීනි</span>
                      <span style="font-size: calc(${labelDim.f} - 3.5px); font-family: sans-serif;">சீனி</span>
                      <span>Sugur</span>
                    </div>
                    <div style="background: #e2e8f0; font-size: calc(${labelDim.f} - 3.8px); font-weight: bold; padding: 1.5px 0; border-top: 1px solid #000; white-space: nowrap; letter-spacing: -0.3px; font-family: Arial, sans-serif;">
                      ${printSugar}
                    </div>
                  </div>
                  <!-- Salt Box -->
                  <div style="border: 1px solid #000; border-radius: 6px; width: 32%; display: flex; flex-direction: column; justify-content: space-between; height: 100%; text-align: center; overflow: hidden; box-sizing: border-box;">
                    <div style="font-size: calc(${labelDim.f} - 3px); font-weight: bold; padding: 1px 0; line-height: 1.15; flex-grow: 1; display: flex; flex-direction: column; justify-content: center;">
                      <span class="sinhala" style="font-size: calc(${labelDim.f} - 1.5px);">ලුණු</span>
                      <span style="font-size: calc(${labelDim.f} - 3.5px); font-family: sans-serif;">உப்பு</span>
                      <span>Salt</span>
                    </div>
                    <div style="background: #e2e8f0; font-size: calc(${labelDim.f} - 3.8px); font-weight: bold; padding: 1.5px 0; border-top: 1px solid #000; white-space: nowrap; letter-spacing: -0.3px; font-family: Arial, sans-serif;">
                      ${printSalt}
                    </div>
                  </div>
                  <!-- Fat Box -->
                  <div style="border: 1px solid #000; border-radius: 6px; width: 32%; display: flex; flex-direction: column; justify-content: space-between; height: 100%; text-align: center; overflow: hidden; box-sizing: border-box;">
                    <div style="font-size: calc(${labelDim.f} - 3px); font-weight: bold; padding: 1px 0; line-height: 1.15; flex-grow: 1; display: flex; flex-direction: column; justify-content: center;">
                      <span class="sinhala" style="font-size: calc(${labelDim.f} - 1.5px);">මේද</span>
                      <span style="font-size: calc(${labelDim.f} - 3.5px); font-family: sans-serif;">கொழுப்பு</span>
                      <span>Fat</span>
                    </div>
                    <div style="background: #e2e8f0; font-size: calc(${labelDim.f} - 3.8px); font-weight: bold; padding: 1.5px 0; border-top: 1px solid #000; white-space: nowrap; letter-spacing: -0.3px; font-family: Arial, sans-serif;">
                      ${printFat}
                    </div>
                  </div>
                </div>

                <!-- Product Name -->
                <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; width: 42%; padding: 0 1mm; text-align: center;">
                  <div style="font-size: calc(${labelDim.f} + 3px); font-weight: bold; line-height: 1.25; font-family: sans-serif; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 100%;">
                    ${p.name}
                  </div>
                  <div class="sinhala" style="font-size: calc(${labelDim.f} + 3.5px); font-weight: 800; margin-top: 2px; line-height: 1.15; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 100%;">
                    ${prodSettings.sinhalaName || '&nbsp;'}
                  </div>
                  ${printFreeText ? `
                    <div style="font-size: calc(${labelDim.f} - 1.5px); margin-top: 1.5px; line-height: 1.2; font-family: sans-serif; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 100%;">
                      ${printFreeText}
                    </div>
                  ` : ''}
                  ${printFreeTextSinhala ? `
                    <div class="sinhala" style="font-size: calc(${labelDim.f} - 1.5px); margin-top: 1px; line-height: 1.2; font-family: sans-serif; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 100%;">
                      ${printFreeTextSinhala}
                    </div>
                  ` : ''}
                </div>

                <!-- Date / Details Box -->
                <div style="border: 1px solid #000; border-radius: 4px; width: 27%; display: flex; flex-direction: column; justify-content: space-between; font-size: calc(${labelDim.f} - 2.2px); line-height: 1.05; box-sizing: border-box; letter-spacing: -0.15px; overflow: hidden; height: 100%;">
                  <!-- Row 1: MFD -->
                  <div style="border-bottom: 0.8px solid #000; padding: 1.5px 2px; flex-grow: 1; display: flex; flex-direction: column; justify-content: center;">
                    <div style="display: flex; justify-content: space-between; font-weight: bold; white-space: nowrap;">
                      <span>MFD. Date</span>
                      <span>: ${printMfd}</span>
                    </div>
                    <div class="sinhala" style="font-size: calc(${labelDim.f} - 3.8px); font-weight: 800; color: #000; margin-top: 0.1px; text-align: left; line-height: 1;">නි.දි.</div>
                  </div>
                  
                  <!-- Row 2: EXP -->
                  <div style="border-bottom: 0.8px solid #000; padding: 1.5px 2px; flex-grow: 1; display: flex; flex-direction: column; justify-content: center;">
                    <div style="display: flex; justify-content: space-between; font-weight: bold; white-space: nowrap;">
                      <span>EXP. Date</span>
                      <span>: ${printExp}</span>
                    </div>
                    <div class="sinhala" style="font-size: calc(${labelDim.f} - 3.8px); font-weight: 800; color: #000; margin-top: 0.1px; text-align: left; line-height: 1;">ක.ඉ.දි</div>
                  </div>
                  
                  <!-- Row 3: Price -->
                  <div style="border-bottom: 0.8px solid #000; padding: 1.5px 2px; flex-grow: 1; display: flex; flex-direction: column; justify-content: center;">
                    <div style="display: flex; justify-content: space-between; font-weight: bold; white-space: nowrap;">
                      <span>Price Rs.</span>
                      <span>: ${Number(p.price || 0).toLocaleString()}/=</span>
                    </div>
                    <div class="sinhala" style="font-size: calc(${labelDim.f} - 3.8px); font-weight: 800; color: #000; margin-top: 0.1px; text-align: left; line-height: 1;">මිල</div>
                  </div>
                  
                  <!-- Row 4: Weight -->
                  <div style="padding: 1.5px 2px; flex-grow: 1; display: flex; flex-direction: column; justify-content: center;">
                    <div style="display: flex; justify-content: space-between; font-weight: bold; white-space: nowrap;">
                      <span>Weight</span>
                      <span>: ${printWeight}</span>
                    </div>
                    <div class="sinhala" style="font-size: calc(${labelDim.f} - 3.8px); font-weight: 800; color: #000; margin-top: 0.1px; text-align: left; line-height: 1;">බර</div>
                  </div>
                </div>
              </div>
            </div>
          `;
        }
      } else {
        let barcodeValue = p.sku || '0000';
        if (settings.cashierSuffix === 'CASHIER 1') barcodeValue += '200';
        else if (settings.cashierSuffix === 'CASHIER 2') barcodeValue += '300';
        else if (settings.cashierSuffix === 'CASHIER 3') barcodeValue += '400';

        const isNumeric = /^\d+$/.test(barcodeValue);
        const isEAN = barcodeValue.length === 13 && isNumeric;
        const isUPC = barcodeValue.length === 12 && isNumeric;
        const format = isEAN ? 'EAN13' : (isUPC ? 'UPC' : 'CODE128');

        let valueToRender = barcodeValue;
        if (isEAN) {
          valueToRender = barcodeValue.slice(0, 12);
        } else if (isUPC) {
          valueToRender = barcodeValue.slice(0, 11);
        }

        for (let i = 0; i < count; i++) {
          html += `<div class="label">
            <div class="footer" style="margin-bottom: 1mm;">
              ${settings.showNotes && p.extraDetails ? `<div class="notes-footer" style="text-align: left; padding: 0; flex: 1;">${p.extraDetails}</div>` : '<div style="flex: 1;"></div>'}
              <div class="company-name" style="margin-top: 0;">Prasama(Pvt)Ltd</div>
            </div>
            <div style="flex: 1; display: flex; flex-direction: row; align-items: center; justify-content: center; width: 100%; overflow: hidden;">
              <svg class="barcode-svg" 
                data-value="${valueToRender}" 
                data-format="${format}"
                data-bh="${labelDim.bh}"
                data-bw="${labelDim.bw}"
                data-fs="${settings.labelSize === 'SMALL' ? '12' : '22'}"
                data-disp="${settings.showSKU}"
                data-margin="${format === 'CODE128' ? '0' : '8'}"
              ></svg>
            </div>
            <div class="footer" style="margin-top: 1mm;">
              ${settings.showPrice ? `<div class="price">Rs. ${Number(p.price || 0).toLocaleString()}</div>` : ''}
              ${settings.showName ? `<div class="name" style="margin-bottom: 0; text-align: right; flex: 1; margin-left: 2mm;">${p.name}</div>` : ''}
            </div>
          </div>`;
        }
      }
    });

    html += `
        </div>
        ${isC4 ? `
          <script>
            window.onload = function() {
              setTimeout(function() {
                window.print();
                window.close();
              }, 800);
            }
          </script>
        ` : `
          <script>
            window.onload = function() {
              var items = document.querySelectorAll('.barcode-svg');
              
              for (var i = 0; i < items.length; i++) {
                (function(oldItem) {
                  var value = oldItem.getAttribute('data-value') || '';
                  if (value.trim() === '') value = '0000';
                  
                  var format = oldItem.getAttribute('data-format') || 'CODE128';
                  var bw = oldItem.getAttribute('data-bw') || '2.0';
                  var bh = oldItem.getAttribute('data-bh') || '100';
                  var fs = oldItem.getAttribute('data-fs') || '12';
                  var disp = oldItem.getAttribute('data-disp') === 'true';
                  var marginAttr = oldItem.getAttribute('data-margin') || '0';
                  
                  var createBarcode = function(f, v, attempt) {
                     var isValid = true;
                     var canvas = document.createElement("canvas");
                     try {
                         var actualMargin = (f === 'CODE128') ? 12 : parseInt(marginAttr);
                         JsBarcode(canvas, String(v), {
                           format: f,
                           width: parseFloat(bw),
                           height: parseInt(bh),
                           fontOptions: "bold",
                           fontSize: parseInt(fs),
                           displayValue: disp,
                           margin: actualMargin,
                           textMargin: 0,
                           valid: function(status) { isValid = status; }
                         });
                         
                         if (!isValid) throw new Error("Invalid format " + f);
                         
                         var img = document.createElement("img");
                         img.src = canvas.toDataURL("image/png");
                         img.style.maxWidth = "100%";
                         img.style.maxHeight = "100%";
                         img.style.objectFit = "contain";
                         img.style.display = "block";
                         
                         oldItem.parentNode.replaceChild(img, oldItem);
                     } catch(e) {
                         if (attempt === 2) return createBarcode('CODE128', v, 1);
                         if (attempt === 1) return createBarcode('CODE128', '0000', 0);
                         
                         var errDiv = document.createElement('div');
                         errDiv.style.color = 'red';
                         errDiv.style.fontSize = '8px';
                         errDiv.style.fontWeight = 'bold';
                         errDiv.style.textAlign = 'center';
                         errDiv.textContent = "ERR: " + e.message;
                         oldItem.parentNode.replaceChild(errDiv, oldItem);
                     }
                  };
                  
                  createBarcode(format, value, 2);
                })(items[i]);
              }

              setTimeout(function() {
                window.print();
                window.close();
              }, 800);
            }
          </script>
        `}
      </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div className="flex gap-4 items-center">
          <div>
            <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tighter leading-none inline-block">Barcode Terminal</h2>
            <div className="inline-block ml-4 px-3 py-1 bg-amber-100 text-amber-700 text-[8px] font-black uppercase rounded-full border border-amber-200 animate-pulse">New Version Sync</div>
            <p className="text-slate-500 font-bold uppercase tracking-widest text-[9px] mt-2">Ready for {totalLabels} Output Units • Build 1.2.5-SUPER</p>
          </div>
        </div>
        <button
          onClick={handlePrint}
          disabled={totalLabels === 0}
          className="bg-slate-900 text-white px-12 py-4 rounded-2xl font-black uppercase text-[11px] tracking-[0.2em] shadow-2xl hover:bg-black transition-all active:scale-95 disabled:opacity-20 flex items-center gap-3"
        >
          <span>🖨️</span> Execute Manifest
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Settings Column */}
        <div className="lg:col-span-4 bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-8">
          <div className="space-y-1">
            <h3 className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.3em]">Layout Engine</h3>
            <p className="text-xs font-bold text-slate-400">Configure label dimensions and visibility</p>
          </div>

          <div className="space-y-6">
            <div>
              <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3">Label Dimensions</label>
              <div className="grid grid-cols-3 gap-2">
                {(['SMALL', 'MEDIUM', 'LARGE'] as LabelSize[]).map(s => (
                  <button
                    key={s}
                    onClick={() => {
                      const cols = s === 'SMALL' ? 5 : (s === 'MEDIUM' ? 5 : 2);
                      setSettings({ ...settings, labelSize: s, columns: cols });
                    }}
                    className={`py-2.5 rounded-xl text-[9px] font-black uppercase transition-all border ${settings.labelSize === s ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg' : 'bg-slate-50 border-slate-100 text-slate-400 hover:border-slate-300'}`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3">Cashier Suffix</label>
              <div className="grid grid-cols-5 gap-1.5">
                {(['NONE', 'CASHIER 1', 'CASHIER 2', 'CASHIER 3', 'CASHIER 4'] as const).map(c => {
                  const labels = {
                    NONE: 'NONE',
                    'CASHIER 1': 'C1 (200)',
                    'CASHIER 2': 'C2 (300)',
                    'CASHIER 3': 'C3 (400)',
                    'CASHIER 4': 'C4 (500)'
                  };
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => {
                        const nextSettings = { ...settings, cashierSuffix: c };
                        if (c === 'CASHIER 4') {
                          nextSettings.columns = 4;
                        } else {
                          nextSettings.columns = 5;
                        }
                        setSettings(nextSettings);
                      }}
                      className={`py-2 rounded-lg text-[8px] font-black uppercase transition-all border ${settings.cashierSuffix === c ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg' : 'bg-slate-50 border-slate-100 text-slate-400 hover:border-slate-300'}`}
                    >
                      {labels[c]}
                    </button>
                  );
                })}
              </div>
            </div>

            {settings.cashierSuffix === 'CASHIER 4' && (
              <div className="bg-indigo-50/40 p-5 rounded-2xl border border-indigo-100/50 space-y-4 animate-in fade-in slide-in-from-top-4 duration-300">
                <h4 className="text-[10px] font-black text-indigo-700 uppercase tracking-wider">Cashier 4 Header Settings</h4>
                <div className="space-y-3">
                  <div>
                    <label className="block text-[8px] font-black text-slate-400 uppercase mb-1">Store Name</label>
                    <input
                      type="text"
                      value={c4Global.storeName}
                      onChange={e => setC4Global({ ...c4Global, storeName: e.target.value })}
                      className="w-full px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-700 outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[8px] font-black text-slate-400 uppercase mb-1">Address</label>
                    <input
                      type="text"
                      value={c4Global.address}
                      onChange={e => setC4Global({ ...c4Global, address: e.target.value })}
                      className="w-full px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-700 outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[8px] font-black text-slate-400 uppercase mb-1">Telephone</label>
                    <input
                      type="text"
                      value={c4Global.tel}
                      onChange={e => setC4Global({ ...c4Global, tel: e.target.value })}
                      className="w-full px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-700 outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[8px] font-black text-slate-400 uppercase mb-1">Brand Header</label>
                    <input
                      type="text"
                      value={c4Global.brandHeader}
                      onChange={e => setC4Global({ ...c4Global, brandHeader: e.target.value })}
                      className="w-full px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-700 outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[8px] font-black text-slate-400 uppercase mb-1">Reg Number</label>
                    <input
                      type="text"
                      value={c4Global.regNo}
                      onChange={e => setC4Global({ ...c4Global, regNo: e.target.value })}
                      className="w-full px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-700 outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[8px] font-black text-slate-400 uppercase mb-1">MFD Date</label>
                      <input
                        type="text"
                        value={c4Global.mfdDate}
                        onChange={e => setC4Global({ ...c4Global, mfdDate: e.target.value })}
                        className="w-full px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-700 outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[8px] font-black text-slate-400 uppercase mb-1">EXP Date</label>
                      <input
                        type="text"
                        value={c4Global.expDate}
                        onChange={e => setC4Global({ ...c4Global, expDate: e.target.value })}
                        className="w-full px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-700 outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[8px] font-black text-slate-400 uppercase mb-1">Weight</label>
                    <input
                      type="text"
                      value={c4Global.weight}
                      onChange={e => setC4Global({ ...c4Global, weight: e.target.value })}
                      className="w-full px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-700 outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[8px] font-black text-slate-400 uppercase mb-1">Free Text Line (Eng)</label>
                    <input
                      type="text"
                      value={c4Global.freeText}
                      onChange={e => setC4Global({ ...c4Global, freeText: e.target.value })}
                      placeholder="e.g. Specially Packed"
                      className="w-full px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-700 outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[8px] font-black text-slate-400 uppercase mb-1">Free Text Line (Sin)</label>
                    <input
                      type="text"
                      value={c4Global.freeTextSinhala}
                      onChange={e => setC4Global({ ...c4Global, freeTextSinhala: e.target.value })}
                      placeholder="e.g. විශේෂයෙන් ඇසුරුම් කරන ලදී"
                      className="w-full px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-700 outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
              </div>
            )}

            <div>
              <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3">Paper Standard</label>
              <div className="grid grid-cols-4 gap-2">
                {(['A4', 'A5', 'LETTER', 'ROLL'] as PaperSize[]).map(p => (
                  <button
                    key={p}
                    onClick={() => setSettings({ ...settings, paperSize: p })}
                    className={`py-2.5 rounded-xl text-[9px] font-black uppercase transition-all border ${settings.paperSize === p ? 'bg-slate-900 border-slate-900 text-white shadow-lg' : 'bg-slate-50 border-slate-100 text-slate-400 hover:border-slate-300'}`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-2">
              <div>
                <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3">Cols per Row</label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={settings.columns}
                  onChange={e => setSettings({ ...settings, columns: parseInt(e.target.value) || 1 })}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 font-black text-center text-indigo-600 outline-none focus:border-indigo-500"
                />
              </div>
              <div className="flex flex-col justify-end gap-2">
                <button
                  onClick={() => setSettings({ ...settings, showName: !settings.showName })}
                  className={`flex items-center gap-2 text-[9px] font-black uppercase tracking-widest ${settings.showName ? 'text-emerald-600' : 'text-slate-300'}`}
                >
                  <span className="text-sm">{settings.showName ? '☑' : '☐'}</span> Name
                </button>
                <button
                  onClick={() => setSettings({ ...settings, showPrice: !settings.showPrice })}
                  className={`flex items-center gap-2 text-[9px] font-black uppercase tracking-widest ${settings.showPrice ? 'text-emerald-600' : 'text-slate-300'}`}
                >
                  <span className="text-sm">{settings.showPrice ? '☑' : '☐'}</span> Price
                </button>
                <button
                  onClick={() => setSettings({ ...settings, showSKU: !settings.showSKU })}
                  className={`flex items-center gap-2 text-[9px] font-black uppercase tracking-widest ${settings.showSKU ? 'text-emerald-600' : 'text-slate-300'}`}
                >
                  <span className="text-sm">{settings.showSKU ? '☑' : '☐'}</span> SKU
                </button>
                <button
                  onClick={() => setSettings({ ...settings, showNotes: !settings.showNotes })}
                  className={`flex items-center gap-2 text-[9px] font-black uppercase tracking-widest ${settings.showNotes ? 'text-emerald-600' : 'text-slate-300'}`}
                >
                  <span className="text-sm">{settings.showNotes ? '☑' : '☐'}</span> Notes
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* List Column */}
        <div className="lg:col-span-8 space-y-4">
          <div className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <span className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
              <input
                type="text"
                placeholder="Search inventory assets..."
                className="w-full pl-14 pr-6 py-4 rounded-2xl border border-slate-200 outline-none bg-slate-50/50 font-bold text-sm focus:border-indigo-500 transition-all"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <select
              value={filterCategoryId}
              onChange={(e) => setFilterCategoryId(e.target.value)}
              className="px-8 py-4 rounded-2xl border border-slate-200 bg-white text-[10px] font-black uppercase tracking-widest outline-none cursor-pointer focus:border-indigo-500"
            >
              <option value="All">All Categories</option>
              {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
            </select>
          </div>

          <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead className="bg-slate-50 text-slate-500 uppercase tracking-widest text-[9px]">
                  <tr>
                    <th className="px-8 py-5">Product Details</th>
                    <th className="px-8 py-5 text-center">Print Quantity</th>
                    <th className="px-8 py-5 text-right">LKR Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {filteredProducts.map(p => (
                    <tr key={p.id} className="hover:bg-indigo-50/30 transition-all group">
                      <td className="px-8 py-5">
                        <p className="font-black text-slate-900 text-[12px] tracking-tight">{p.name}</p>
                        <p className="text-[10px] text-indigo-500 font-mono font-black uppercase mt-0.5">{p.sku}</p>
                        {p.extraDetails && <p className="text-[9px] text-indigo-500 font-bold uppercase mt-1 italic">Extra: {p.extraDetails}</p>}
                      </td>
                      <td className="px-8 py-5">
                        <div className="flex items-center justify-center gap-4">
                          <button
                            onMouseDown={() => startContinuousAction(() => updateSelection(p.id, (selections[p.id] || 0) - 1))}
                            onMouseUp={stopContinuousAction}
                            onMouseLeave={stopContinuousAction}
                            onTouchStart={(e) => { e.preventDefault(); startContinuousAction(() => updateSelection(p.id, (selections[p.id] || 0) - 1)); }}
                            onTouchEnd={stopContinuousAction}
                            className="w-9 h-9 rounded-xl border border-slate-200 bg-white flex items-center justify-center font-black text-slate-500 hover:bg-rose-50 hover:text-rose-600 transition-all active:scale-90 shadow-sm"
                          >-</button>
                          <span className="w-10 text-center font-black text-slate-900 font-mono text-lg">{selections[p.id] || 0}</span>
                          <button
                            onMouseDown={() => startContinuousAction(() => updateSelection(p.id, (selections[p.id] || 0) + 1))}
                            onMouseUp={stopContinuousAction}
                            onMouseLeave={stopContinuousAction}
                            onTouchStart={(e) => { e.preventDefault(); startContinuousAction(() => updateSelection(p.id, (selections[p.id] || 0) + 1)); }}
                            onTouchEnd={stopContinuousAction}
                            className="w-9 h-9 rounded-xl border border-slate-200 bg-white flex items-center justify-center font-black text-slate-500 hover:bg-indigo-50 hover:text-indigo-600 transition-all active:scale-90 shadow-sm"
                          >+</button>
                        </div>
                      </td>
                      <td className="px-8 py-5 text-right">
                        <p className="font-black text-slate-900 font-mono">{(Number(p.price) || 0).toLocaleString()}</p>
                      </td>
                    </tr>
                  ))}
                  {filteredProducts.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-8 py-20 text-center text-slate-300 font-black uppercase tracking-widest text-[10px] italic">No inventory assets matched your search query.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {settings.cashierSuffix === 'CASHIER 4' && totalLabels > 0 && (
            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
              <div className="border-b border-slate-100 pb-4">
                <h3 className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.3em]">Cashier 4 Sticker Content</h3>
                <p className="text-xs font-bold text-slate-400">Configure custom details for the products in your print manifest</p>
              </div>

              <div className="space-y-6 divide-y divide-slate-100">
                {products
                  .filter(p => (selections[p.id] || 0) > 0)
                  .map(p => {
                    const prodSettings = c4Products[p.id] || {
                      sinhalaName: p.sinhalaName || '',
                      weight: '',
                      mfdDate: '',
                      expDate: '',
                      sugur: '1.4g/100g',
                      salt: '2.02g/100g',
                      fat: '27.7g/100g',
                      freeText: p.c4FreeText || '',
                      freeTextSinhala: p.c4FreeTextSinhala || ''
                    };

                    const updateProdSetting = (key: keyof Cashier4ProductSettings, val: string) => {
                      setC4Products(prev => ({
                        ...prev,
                        [p.id]: {
                          ...prodSettings,
                          [key]: val
                        }
                      }));
                    };

                    return (
                      <div key={p.id} className="pt-6 first:pt-0 space-y-4">
                        <div className="flex justify-between items-center">
                          <div>
                            <span className="text-xs font-black text-slate-900 uppercase">{p.name}</span>
                            <span className="ml-2 text-[10px] text-slate-400 font-mono font-bold">({p.sku})</span>
                          </div>
                          <span className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-lg text-[9px] font-black uppercase">
                            {selections[p.id]} Label{(selections[p.id] || 0) > 1 ? 's' : ''}
                          </span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                          <div className="md:col-span-2">
                            <label className="block text-[8px] font-black text-slate-400 uppercase mb-1">Sinhala Name</label>
                            <input
                              type="text"
                              value={prodSettings.sinhalaName}
                              onChange={e => updateProdSetting('sinhalaName', e.target.value)}
                              placeholder="e.g. කොණ්ඩ කඩල"
                              className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-700 outline-none focus:bg-white focus:border-indigo-500 transition-all"
                            />
                          </div>
                          <div>
                            <label className="block text-[8px] font-black text-slate-400 uppercase mb-1">Weight</label>
                            <input
                              type="text"
                              value={prodSettings.weight}
                              onChange={e => updateProdSetting('weight', e.target.value)}
                              placeholder={c4Global.weight || "100g"}
                              className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-700 outline-none focus:bg-white focus:border-indigo-500 transition-all"
                            />
                          </div>
                          <div>
                            <label className="block text-[8px] font-black text-slate-400 uppercase mb-1">MFD Date</label>
                            <input
                              type="text"
                              value={prodSettings.mfdDate}
                              onChange={e => updateProdSetting('mfdDate', e.target.value)}
                              placeholder={c4Global.mfdDate}
                              className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-700 outline-none focus:bg-white focus:border-indigo-500 transition-all"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                          <div>
                            <label className="block text-[8px] font-black text-slate-400 uppercase mb-1">EXP Date</label>
                            <input
                              type="text"
                              value={prodSettings.expDate}
                              onChange={e => updateProdSetting('expDate', e.target.value)}
                              placeholder={c4Global.expDate}
                              className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-700 outline-none focus:bg-white focus:border-indigo-500 transition-all"
                            />
                          </div>
                          <div>
                            <label className="block text-[8px] font-black text-slate-400 uppercase mb-1">Sugur Value</label>
                            <input
                              type="text"
                              value={prodSettings.sugur}
                              onChange={e => updateProdSetting('sugur', e.target.value)}
                              className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-700 outline-none focus:bg-white focus:border-indigo-500 transition-all"
                            />
                          </div>
                          <div>
                            <label className="block text-[8px] font-black text-slate-400 uppercase mb-1">Salt Value</label>
                            <input
                              type="text"
                              value={prodSettings.salt}
                              onChange={e => updateProdSetting('salt', e.target.value)}
                              className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-700 outline-none focus:bg-white focus:border-indigo-500 transition-all"
                            />
                          </div>
                          <div>
                            <label className="block text-[8px] font-black text-slate-400 uppercase mb-1">Fat Value</label>
                            <input
                              type="text"
                              value={prodSettings.fat}
                              onChange={e => updateProdSetting('fat', e.target.value)}
                              className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-700 outline-none focus:bg-white focus:border-indigo-500 transition-all"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-[8px] font-black text-slate-400 uppercase mb-1">Free Text Line (Eng)</label>
                            <input
                              type="text"
                              value={prodSettings.freeText}
                              onChange={e => updateProdSetting('freeText', e.target.value)}
                              placeholder={c4Global.freeText || "e.g. Specially Packed"}
                              className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-700 outline-none focus:bg-white focus:border-indigo-500 transition-all"
                            />
                          </div>
                          <div>
                            <label className="block text-[8px] font-black text-slate-400 uppercase mb-1">Free Text Line (Sin)</label>
                            <input
                              type="text"
                              value={prodSettings.freeTextSinhala}
                              onChange={e => updateProdSetting('freeTextSinhala', e.target.value)}
                              placeholder={c4Global.freeTextSinhala || "e.g. විශේෂයෙන් ඇසුරුම් කරන ලදී"}
                              className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-700 outline-none focus:bg-white focus:border-indigo-500 transition-all"
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default BarcodePrint;