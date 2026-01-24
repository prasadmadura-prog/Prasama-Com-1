import { Transaction, Product, UserProfile } from '../types';

export function buildSalesHistoryReportHtml(
  entries: Transaction[],
  products: Product[],
  userProfile: UserProfile,
  opts: { startDate?: string; endDate?: string } = {}
): string {
  const { startDate, endDate } = opts;
  const logoHtml = userProfile.logo
    ? `<div style="text-align: center; margin-bottom: 6px; width: 100%;">
         <img src="${userProfile.logo}" style="max-height: 55px; max-width: 100%; filter: grayscale(100%);" />
       </div>`
    : '';

  const formatDate = (iso?: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    const dateStr = d.toLocaleDateString();
    const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `${dateStr} ${timeStr}`;
  };

  const rowsHtml = (entries || []).map((tx) => {
    const customer = tx.customerId ? 'CUSTOMER' : 'WALK-IN';
    return `
      <tr>
        <td style="padding: 2px 0; font-size: 9px; font-weight: 800; width: 20%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${tx.id}</td>
        <td style="padding: 2px 0; font-size: 9px; font-weight: 800; width: 28%;">${formatDate(tx.date)}</td>
        <td style="padding: 2px 0; font-size: 9px; font-weight: 800; width: 18%; text-align: center;">${tx.type}</td>
        <td style="padding: 2px 0; font-size: 9px; font-weight: 800; width: 16%; text-align: center;">${tx.paymentMethod}</td>
        <td style="padding: 2px 0; font-size: 9px; font-weight: 800; width: 18%; text-align: right;">${Number(tx.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
      </tr>
    `;
  }).join('');

  const totalRevenue = (entries || [])
    .filter(e => e.type === 'SALE' || (e as any).type === 'sale')
    .reduce((a, b) => a + Number(b.amount || 0), 0);

  const realizedInflow = (entries || [])
    .filter(e => (e.type === 'SALE' && e.paymentMethod !== 'CREDIT') || e.type === 'CREDIT_PAYMENT')
    .reduce((a, b) => a + Number(b.amount || 0), 0);

  const dueAmount = (entries || [])
    .filter(e => e.type === 'SALE' && e.paymentMethod === 'CREDIT')
    .reduce((a, b) => a + Number(b.amount || 0), 0);

  return `
    <html>
      <head>
        <title>Sales History Report</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700;800&display=swap');
          @page { margin: 0; }
          body {
            font-family: 'JetBrains Mono', monospace;
            padding: 0; margin: 0; color: #000; width: 72mm; background: #fff; line-height: 1.1; font-size: 9px;
          }
          .content { padding: 6px; box-sizing: border-box; width: 72mm; }
          .center { text-align: center; }
          .hr { border-top: 1px dashed #000; margin: 4px 0; }
          .title { font-size: 12px; font-weight: 800; text-transform: uppercase; }
          .biz-name { font-size: 13px; font-weight: 800; text-transform: uppercase; margin: 1px 0; }
          .biz-sub { font-size: 8px; font-weight: 700; text-transform: uppercase; }
          .meta { font-size: 8px; margin: 4px 0; font-weight: 700; }
          table { width: 100%; border-collapse: collapse; table-layout: fixed; }
          th { border-bottom: 0.5px solid #000; padding-bottom: 2px; font-size: 9px; text-align: left; }
          .summary-row { display: flex; justify-content: space-between; font-weight: 800; margin: 1px 0; font-size: 9px; }
          .footer { text-align: center; font-size: 8px; font-weight: 800; margin-top: 10px; border-top: 0.5px dashed #000; padding-top: 4px; }
        </style>
      </head>
      <body onload="window.print(); window.close();">
        <div class="content">
          <div class="center">
            ${logoHtml}
            <div class="biz-name">${userProfile.name}</div>
            <div class="biz-sub">${userProfile.branch}</div>
          </div>
          <div class="hr"></div>
          <div class="meta">
            <div class="title">Sales History Report</div>
            ${startDate || endDate ? `RANGE: ${startDate || '—'} to ${endDate || '—'}` : ''}
          </div>
          <div class="hr"></div>
          <table>
            <thead>
              <tr>
                <th style="width: 20%;">REF</th>
                <th style="width: 28%;">DATE</th>
                <th style="width: 18%; text-align: center;">TYPE</th>
                <th style="width: 16%; text-align: center;">METHOD</th>
                <th style="width: 18%; text-align: right;">NET</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
          <div class="hr"></div>
          <div class="summary-row"><span>Total Revenue</span><span>${totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
          <div class="summary-row"><span>Realized Inflow</span><span>${realizedInflow.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
          <div class="summary-row"><span>Outstanding (Credit)</span><span>${dueAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
          <div class="footer">PRASAMA ERP SOLUTIONS</div>
        </div>
      </body>
    </html>
  `;
}
