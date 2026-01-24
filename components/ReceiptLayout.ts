import { Product, Transaction, UserProfile } from '../types';

export function buildSaleReceiptHtml(tx: Transaction, products: Product[], userProfile: UserProfile): string {
  const logoHtml = userProfile.logo
    ? `<div style="text-align: center; margin-bottom: 6px; width: 100%;">
         <img src="${userProfile.logo}" style="max-height: 55px; max-width: 100%; filter: grayscale(100%);" />
       </div>`
    : '';

  const dateStr = new Date(tx.date).toLocaleDateString();
  const timeStr = new Date(tx.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const itemsRowsHtml = (tx.items || []).map((item: any, index: number) => {
    const product = products.find(p => p.id === item.productId);
    const net = (item.quantity * item.price) - (item.discount || 0);
    return `
      <tr>
        <td style="padding: 2px 0; font-size: 10px; font-weight: 800; text-align: center; width: 8%;">${index + 1}</td>
        <td style="padding: 2px 0; font-size: 10px; font-weight: 800; text-transform: uppercase; width: 26%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${product?.name || 'ITEM'}</td>
        <td style="padding: 2px 0; font-size: 10px; font-weight: 800; text-align: center; width: 10%;">${item.quantity}</td>
        <td style="padding: 2px 0; font-size: 10px; font-weight: 800; text-align: right; width: 16%;">${Number(item.price).toLocaleString()}</td>
        <td style="padding: 2px 0; font-size: 10px; font-weight: 800; text-align: right; width: 14%;">-${Number(item.discount || 0).toLocaleString()}</td>
        <td style="padding: 2px 0; font-size: 10px; font-weight: 800; text-align: right; width: 16%;">${net.toLocaleString()}</td>
      </tr>
    `;
  }).join('');

  const grossTotalValue = Number(tx.amount) + Number(tx.discount || 0);

  return `
    <html>
      <head>
        <title>RECEIPT - ${tx.id}</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700;800&display=swap');
          @page { margin: 0; }
          body { font-family: 'JetBrains Mono', monospace; padding: 0; margin: 0; color: #000; width: 72mm; background: #fff; line-height: 1.2; font-size: 10px; }
          .receipt-content { padding: 8px 8px 10px; box-sizing: border-box; width: 72mm; }
          .center { text-align: center; }
          .line { border-top: 1px solid #000; margin: 6px 0; }
          .hr { border-top: 1px dashed #000; margin: 6px 0; }
          .biz-name { font-size: 14px; font-weight: 800; text-transform: uppercase; }
          .biz-sub { font-size: 9px; font-weight: 700; text-transform: uppercase; }
          .meta { font-size: 9px; font-weight: 800; }
          table { width: 100%; border-collapse: collapse; table-layout: fixed; }
          th { font-size: 10px; font-weight: 800; border-bottom: 1px dashed #000; padding-bottom: 4px; }
          .summary-row { display: flex; justify-content: space-between; font-weight: 800; margin: 2px 0; font-size: 10px; }
          .total-row { display: flex; justify-content: space-between; font-size: 14px; font-weight: 800; margin-top: 4px; }
          .footer { text-align: center; font-size: 9px; font-weight: 800; margin-top: 10px; }
        </style>
      </head>
      <body onload="window.print(); window.close();">
        <div class="receipt-content">
          <div class="center">
            ${logoHtml}
            <div class="biz-name">${(userProfile.name || '').toUpperCase()}</div>
            <div class="line"></div>
            <div class="biz-sub">${(userProfile.branch || '').toUpperCase()}</div>
            ${userProfile.phone ? `<div class="biz-sub">PH: ${userProfile.phone}</div>` : ''}
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
                <th style="text-align: center; width: 8%;">#</th>
                <th style="text-align: left; width: 26%;">ITEM</th>
                <th style="text-align: center; width: 10%;">QTY</th>
                <th style="text-align: right; width: 16%;">RATE</th>
                <th style="text-align: right; width: 14%;">DISC</th>
                <th style="text-align: right; width: 16%;">AMT</th>
              </tr>
            </thead>
            <tbody>
              ${itemsRowsHtml}
            </tbody>
          </table>
          <div class="line"></div>
          <div class="summary-row">
            <span>SUBTOTAL:</span>
            <span>${grossTotalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
          </div>
          ${(tx.discount || 0) > 0 ? `
          <div class="summary-row">
            <span>TOTAL DISC:</span>
            <span>-${Number(tx.discount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
          </div>` : ''}
          <div class="line"></div>
          <div class="total-row">
            <span>NET TOTAL:</span>
            <span>${Number(tx.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
          <div style="font-size: 9px; text-align: right; margin-top: 4px; font-weight: 800;">PAID BY: ${tx.paymentMethod}</div>
          <div class="hr"></div>
          <div class="footer">
            THANK YOU - VISIT AGAIN<br/>
            PRASAMA ERP SOLUTIONS
          </div>
        </div>
      </body>
    </html>
  `;
}
