const { JSDOM } = require("jsdom");
const dom = new JSDOM(`<!DOCTYPE html><html><body><svg id="b"></svg></body></html>`);
const window = dom.window;
global.window = window;
global.document = window.document;

// Mock canvas
window.HTMLCanvasElement.prototype.getContext = () => ({
  measureText: () => ({ width: 10 }),
  fillText: () => {},
  clearRect: () => {},
  font: ''
});

const document = window.document;
const JsBarcode = require("jsbarcode");
const svg = document.getElementById("b");

// First call: UPC invalid
JsBarcode(svg, '479600546170', { format: 'UPC', width: 2.0, height: 100, fontOptions: "bold", fontSize: 12, displayValue: true, margin: 0 });

let pathCount1 = svg.querySelectorAll('path, rect').length;
console.log("After UPC:", pathCount1, svg.outerHTML.substring(0, 150));

// Reset manually
svg.innerHTML = '';
svg.removeAttribute('viewBox');
svg.removeAttribute('width');
svg.removeAttribute('height');

// Second call: CODE128 fallback
JsBarcode(svg, '479600546170', { format: 'CODE128', width: 2.0, height: 100, fontOptions: "bold", fontSize: 12, displayValue: true, margin: 12 });

let pathCount2 = svg.querySelectorAll('path, rect').length;
console.log("After CODE128:", pathCount2, svg.outerHTML.substring(0, 500));
