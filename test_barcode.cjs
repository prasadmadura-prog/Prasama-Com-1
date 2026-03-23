const { JSDOM } = require('jsdom');
const dom = new JSDOM('<svg id="barcode"></svg>');
const window = dom.window;
const document = window.document;
const JsBarcode = require('jsbarcode');

try {
    JsBarcode(document.getElementById('barcode'), 'ANIMAL TOY', { format: 'CODE128' });
    console.log('success!', document.getElementById('barcode').innerHTML.slice(0, 50));
} catch (e) {
    console.error("error!", e.message);
}
